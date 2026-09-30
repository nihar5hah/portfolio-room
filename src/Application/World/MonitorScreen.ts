import * as THREE from 'three';
import { CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import Application from '../Application';
import Camera from '../Camera/Camera';
import EventEmitter from '../Utils/EventEmitter';
import bus from '../UI/EventBus';
import { LAPTOP_SCREEN } from './Computer';

const SCREEN_SIZE = { w: LAPTOP_SCREEN.width, h: LAPTOP_SCREEN.height };
/**
 * How long the pointer may be off the screen before the camera steps back
 * (ms). Long enough to cross the room to a button at the edge ("Open full
 * size", the music controls, Step back); reaching one keeps the Mac in
 * focus. Short enough that moving away still feels immediate.
 */
export const LEAVE_GRACE = 650;

export default class MonitorScreen extends EventEmitter {
    application: Application;
    scene: THREE.Scene;
    cssScene: THREE.Scene;
    screenSize: THREE.Vector2;
    object: CSS3DObject;
    cutout: THREE.Mesh;
    camera: Camera;
    prevInComputer: boolean;
    inComputer: boolean;
    mouseClickInProgress = false;
    shouldLeaveMonitor = false;
    /** Pending step back after the pointer left the screen. */
    leaveTimer: ReturnType<typeof setTimeout> | undefined;
    iframe: HTMLIFrameElement;
    /** The desktop has been asked for (its src set). */
    loaded = false;
    listening = false;
    /** Last applied screen state (0 hidden, 1 visible, 2 usable). */
    screenState = -1;
    rect: DOMRect | null = null;
    rectAt = 0;

    constructor() {
        super();
        this.application = new Application();
        this.scene = this.application.scene;
        this.cssScene = this.application.cssScene;
        this.screenSize = new THREE.Vector2(SCREEN_SIZE.w, SCREEN_SIZE.h);
        this.camera = this.application.camera;

        // Create screen
        this.initializeScreenEvents();
        this.createIframe();
        // The desktop inside the Mac is a whole second app (React, its
        // wallpaper, icons): load it when the visitor heads for the Mac, or
        // once the room is idle on devices with power to spare. Phones never
        // use it (they open /desktop/ full screen).
        const settings = this.application.quality.settings;
        if (
            settings.preloadDesktop &&
            !matchMedia('(max-width: 700px)').matches
        )
            bus.on('loadingScreenDone', () =>
                setTimeout(() => {
                    const idle =
                        (window as any).requestIdleCallback ??
                        ((run: () => void) => setTimeout(run, 1));
                    idle(() => this.load(), { timeout: 5000 });
                }, 3000),
            );
    }

    /**
     * Point the screen at the desktop (once). `app` and `route` open
     * something straight away; returns true if this call started the load.
     */
    load(app?: string, route?: string) {
        if (this.loaded) return false;
        this.loaded = true;
        const query = app ? `?app=${encodeURIComponent(app)}` : '';
        this.iframe.src = `/desktop/${query}${route ? `#${route}` : ''}`;
        return true;
    }

    /** The pointer left the screen: step back unless it returns in time. */
    leaveSoon() {
        if (this.leaveTimer !== undefined) return;
        this.leaveTimer = setTimeout(() => {
            this.leaveTimer = undefined;
            if (this.inComputer) return;
            if (this.mouseClickInProgress) this.shouldLeaveMonitor = true;
            else this.camera.trigger('leftMonitor');
        }, LEAVE_GRACE);
    }

    stayFocused() {
        clearTimeout(this.leaveTimer);
        this.leaveTimer = undefined;
    }

    initializeScreenEvents() {
        document.addEventListener('keydown', (event) => {
            if (
                event.key === 'Escape' &&
                (this.camera.currentKeyframe === 'monitor' ||
                    this.camera.targetKeyframe === 'monitor')
            ) {
                this.stayFocused();
                this.camera.trigger('leftMonitor');
                document
                    .querySelector<HTMLButtonElement>('.enter-computer')
                    ?.focus();
            }
        });
        document.addEventListener(
            'mousemove',
            (event) => {
                if ((event.target as Element)?.closest?.('.room-interface')) {
                    // Over one of the room's buttons: it belongs with the
                    // screen, so crossing the room to reach it keeps focus,
                    // and leaving it for the room starts the step back.
                    if (this.leaveTimer !== undefined) {
                        this.stayFocused();
                        this.prevInComputer = true;
                    }
                    return;
                }
                // @ts-ignore
                const id = event.target.id;
                if (
                    id === 'computer-screen' &&
                    (event as any).inComputer === undefined
                ) {
                    // @ts-ignore
                    event.inComputer = true;
                }

                // @ts-ignore
                this.inComputer = event.inComputer;

                if (this.inComputer && !this.prevInComputer) {
                    this.camera.trigger('enterMonitor');
                }

                if (!this.inComputer && this.prevInComputer) {
                    // A drag decides on release; a plain move after a moment.
                    if (this.mouseClickInProgress)
                        this.shouldLeaveMonitor = true;
                    else this.leaveSoon();
                }
                if (this.inComputer) {
                    this.shouldLeaveMonitor = false;
                    this.stayFocused();
                }

                this.application.mouse.trigger('mousemove', [event]);

                this.prevInComputer = this.inComputer;
            },
            false,
        );
        document.addEventListener(
            'mousedown',
            (event) => {
                // @ts-ignore
                this.inComputer = event.inComputer;
                this.application.mouse.trigger('mousedown', [event]);

                this.mouseClickInProgress = true;
                this.prevInComputer = this.inComputer;
            },
            false,
        );
        document.addEventListener(
            'mouseup',
            (event) => {
                // @ts-ignore
                this.inComputer = event.inComputer;
                this.application.mouse.trigger('mouseup', [event]);

                if (this.shouldLeaveMonitor && !this.inComputer)
                    this.camera.trigger('leftMonitor');
                this.shouldLeaveMonitor = false;
                this.mouseClickInProgress = false;
                this.prevInComputer = this.inComputer;
            },
            false,
        );
    }

    /**
     * Creates the iframe for the computer screen
     */
    createIframe() {
        // Create container
        const container = document.createElement('div');
        container.style.width = this.screenSize.width + 'px';
        container.style.height = this.screenSize.height + 'px';
        container.style.opacity = '1';
        container.style.background = '#1d2e2f';

        // Create iframe
        const iframe = document.createElement('iframe');

        // Bubble mouse move events to the main application, so we can affect the camera
        iframe.onload = () => {
            // Only the desktop, once (not the blank page before it loads).
            if (!this.loaded || this.listening) return;
            this.listening = true;
            if (iframe.contentWindow) {
                // Music app inside the Mac drives the room's AlbumAudio.
                // Parent -> iframe: every albumChange is mirrored as a message.
                // iframe -> parent: { type: 'album', action } commands below.
                bus.on('albumChange', (state) =>
                    iframe.contentWindow?.postMessage(
                        { type: 'albumState', state },
                        window.location.origin,
                    ),
                );
                window.addEventListener('message', (event) => {
                    if (
                        event.origin !== window.location.origin ||
                        event.source !== iframe.contentWindow ||
                        ![
                            'mousemove',
                            'mousedown',
                            'mouseup',
                            'keydown',
                            'keyup',
                            'focusin',
                            'album',
                        ].includes(event.data?.type)
                    )
                        return;
                    if (event.data.type === 'album') {
                        const album = this.application.world.audioManager.album;
                        if (event.data.action === 'toggle') album.toggle();
                        else if (event.data.action === 'next') album.next();
                        else if (event.data.action === 'retry')
                            void album.load();
                        else album.publish();
                        return;
                    }
                    if (
                        document.getElementById('css')?.hasAttribute('inert') ||
                        this.object.element.hasAttribute('inert')
                    )
                        return;
                    if (event.data.type === 'focusin') {
                        this.camera.trigger('enterMonitor');
                        return;
                    }
                    var evt = new CustomEvent(event.data.type, {
                        bubbles: true,
                        cancelable: false,
                    });

                    // @ts-ignore
                    evt.inComputer = event.data.inComputer;
                    if (event.data.type === 'mousemove') {
                        // One layout read per ~frame, not per mouse event.
                        const now = performance.now();
                        if (!this.rect || now - this.rectAt > 100) {
                            this.rect = iframe.getBoundingClientRect();
                            this.rectAt = now;
                        }
                        const clRect = this.rect;
                        const { top, left, width, height } = clRect;
                        const widthRatio = width / SCREEN_SIZE.w;
                        const heightRatio = height / SCREEN_SIZE.h;

                        // @ts-ignore
                        evt.clientX = Math.round(
                            event.data.clientX * widthRatio + left,
                        );
                        //@ts-ignore
                        evt.clientY = Math.round(
                            event.data.clientY * heightRatio + top,
                        );
                    } else if (event.data.type === 'keydown') {
                        // @ts-ignore
                        evt.key = event.data.key;
                    } else if (event.data.type === 'keyup') {
                        // @ts-ignore
                        evt.key = event.data.key;
                    }

                    iframe.dispatchEvent(evt);
                });
            }
        };

        this.iframe = iframe;
        iframe.style.width = this.screenSize.width + 'px';
        iframe.style.height = this.screenSize.height + 'px';
        iframe.style.padding = '0';
        iframe.style.boxSizing = 'border-box';
        iframe.style.opacity = '1';
        iframe.className = 'laptop-screen';
        iframe.id = 'computer-screen';
        iframe.frameBorder = '0';
        iframe.title = 'Nihar OS — Portfolio desktop';

        // Add iframe to container
        container.appendChild(iframe);

        // Create CSS plane
        this.createCssPlane(container);
    }

    /**
     * Creates a CSS plane and GL plane to properly occlude the CSS plane
     * @param element the element to create the css plane for
     */
    createCssPlane(element: HTMLElement) {
        // Create CSS3D object
        const object = new CSS3DObject(element);

        // copy monitor position and rotation
        this.object = object;

        // Add to CSS scene
        this.cssScene.add(object);

        // Create GL plane
        // The transparent cutout must write zero RGB as well as zero alpha.
        const material = new THREE.MeshBasicMaterial({ color: 0x000000 });
        material.side = THREE.DoubleSide;
        material.opacity = 0;
        material.transparent = true;
        // NoBlending allows the GL plane to occlude the CSS plane
        material.blending = THREE.NoBlending;

        // Create plane geometry
        const geometry = new THREE.PlaneGeometry(
            this.screenSize.width,
            this.screenSize.height,
        );

        // Create the GL plane mesh
        const mesh = new THREE.Mesh(geometry, material);

        // Copy the position, rotation and scale of the CSS plane to the GL plane
        mesh.position.copy(object.position);
        mesh.rotation.copy(object.rotation);
        mesh.scale.copy(object.scale);

        // Add to gl scene
        this.cutout = mesh;
        this.scene.add(mesh);
        this.update();
    }
    update() {
        const computer = this.application.world.computerSetup;
        computer.screenAnchor.matrixWorld.decompose(
            this.object.position,
            this.object.quaternion,
            this.object.scale,
        );
        this.cutout.position.copy(this.object.position);
        this.cutout.quaternion.copy(this.object.quaternion);
        this.cutout.scale.copy(this.object.scale);
        // The lid starting to open is the last moment to fetch the desktop.
        if (computer.openness > 0.001) this.load();
        const visible = computer.openness > 0.08;
        const usable = computer.openness > 0.98;
        this.cutout.visible = visible;
        // Style writes only when the state changes: rewriting them every
        // frame kept invalidating the iframe's layer.
        const state = usable ? 2 : visible ? 1 : 0;
        if (state === this.screenState) return;
        this.screenState = state;
        const element = this.object.element;
        element.style.visibility = visible ? 'visible' : 'hidden';
        element.style.pointerEvents = usable ? 'auto' : 'none';
        element.toggleAttribute('inert', !usable);
        this.rect = null;
    }
}
