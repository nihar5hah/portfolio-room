import * as THREE from 'three';
import Application from '../Application';
import Sizes from '../Utils/Sizes';
import EventEmitter from '../Utils/EventEmitter';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import TWEEN from '@tweenjs/tween.js';
import Renderer from '../Renderer';
import Resources from '../Utils/Resources';
import UIEventBus from '../UI/EventBus';
import Time from '../Utils/Time';
import BezierEasing from 'bezier-easing';
import {
    CameraKeyframeInstance,
    MonitorKeyframe,
    IdleKeyframe,
    LoadingKeyframe,
    DeskKeyframe,
    OrbitControlsStart,
} from './CameraKeyframes';

export enum CameraKey {
    IDLE = 'idle',
    MONITOR = 'monitor',
    LOADING = 'loading',
    DESK = 'desk',
    ORBIT_CONTROLS_START = 'orbitControlsStart',
}
/**
 * Look Around may roam anywhere inside the room: the orbit point slides over
 * the floor (right-drag, two fingers, arrow keys) or flies to whatever is
 * double-clicked, and the camera can come down close to the floor.
 * Room walls: x ±18000, z -6500/18500; floor -3015; ceiling 10885.
 */
export const ROAM = {
    target: {
        x: [-15800, 15800],
        y: [-3000, 6000],
        z: [-5200, 17000],
    },
    camera: {
        x: [-16900, 16900],
        y: [-2100, 10300],
        z: [-5300, 17500],
    },
    minDistance: 1200,
    maxDistance: 29000,
} as const;

const clampTo = (
    v: THREE.Vector3,
    box: { x: readonly number[]; y: readonly number[]; z: readonly number[] },
) =>
    v.set(
        THREE.MathUtils.clamp(v.x, box.x[0], box.x[1]),
        THREE.MathUtils.clamp(v.y, box.y[0], box.y[1]),
        THREE.MathUtils.clamp(v.z, box.z[0], box.z[1]),
    );

export default class Camera extends EventEmitter {
    application: Application;
    sizes: Sizes;
    scene: THREE.Scene;
    instance: THREE.PerspectiveCamera;
    renderer: Renderer;
    resources: Resources;
    time: Time;

    position: THREE.Vector3;
    focalPoint: THREE.Vector3;

    freeCam: boolean;
    orbitControls: OrbitControls;

    currentKeyframe: CameraKey | undefined;
    targetKeyframe: CameraKey | undefined;
    keyframes: { [key in CameraKey]: CameraKeyframeInstance };

    constructor() {
        super();
        this.application = new Application();
        this.sizes = this.application.sizes;
        this.scene = this.application.scene;
        this.renderer = this.application.renderer;
        this.resources = this.application.resources;
        this.time = this.application.time;

        this.position = new THREE.Vector3(0, 0, 0);
        this.focalPoint = new THREE.Vector3(0, 0, 0);

        this.freeCam = false;

        this.keyframes = {
            idle: new IdleKeyframe(),
            monitor: new MonitorKeyframe(),
            loading: new LoadingKeyframe(),
            desk: new DeskKeyframe(),
            orbitControlsStart: new OrbitControlsStart(),
        };

        document.addEventListener('mousedown', (event) => {
            // @ts-ignore
            if ((event.target as Element)?.closest?.('button,a,input')) return;
            // print target and current keyframe
            if (
                this.currentKeyframe === CameraKey.IDLE ||
                this.targetKeyframe === CameraKey.IDLE
            ) {
                this.transition(CameraKey.DESK);
            } else if (
                this.currentKeyframe === CameraKey.DESK ||
                this.targetKeyframe === CameraKey.DESK
            ) {
                this.transition(CameraKey.IDLE);
            }
        });

        this.setPostLoadTransition();
        this.setInstance();
        this.setMonitorListeners();
        this.setFreeCamListeners();
    }

    transition(
        key: CameraKey,
        duration: number = 1000,
        easing?: any,
        callback?: () => void,
    ) {
        const previousKey = this.targetKeyframe || this.currentKeyframe;
        if (previousKey === key) return;
        if (this.application.reducedMotion.matches) duration = 0;

        if (this.targetKeyframe) TWEEN.removeAll();

        this.currentKeyframe = undefined;
        this.targetKeyframe = key;
        if (previousKey === CameraKey.MONITOR)
            UIEventBus.dispatch('leftMonitor', {});
        if (key === CameraKey.MONITOR) UIEventBus.dispatch('enterMonitor', {});

        const keyframe = this.keyframes[key];

        const posTween = new TWEEN.Tween(this.position)
            .to(keyframe.position, duration)
            .easing(easing || TWEEN.Easing.Quintic.InOut)
            .onComplete(() => {
                this.currentKeyframe = key;
                this.targetKeyframe = undefined;
                if (callback) callback();
            });

        const focTween = new TWEEN.Tween(this.focalPoint)
            .to(keyframe.focalPoint, duration)
            .easing(easing || TWEEN.Easing.Quintic.InOut);

        posTween.start();
        focTween.start();
    }

    setInstance() {
        this.instance = new THREE.PerspectiveCamera(
            35,
            this.sizes.width / this.sizes.height,
            // Preserve sub-unit depth detail on the chair without clipping the distant floor.
            100,
            900000,
        );
        this.currentKeyframe = CameraKey.LOADING;

        this.scene.add(this.instance);
    }

    setMonitorListeners() {
        this.on('enterMonitor', (app?: string, route?: string) => {
            if (window.matchMedia('(max-width: 700px)').matches) {
                location.assign(
                    `/desktop/${app ? `?app=${app}` : ''}${route ? `#${route}` : ''}`,
                );
                return;
            }
            if (app)
                document
                    .querySelector<HTMLIFrameElement>('#computer-screen')
                    ?.contentWindow?.postMessage(
                        { type: 'openApp', app, route },
                        location.origin,
                    );
            this.freeCam = false;
            document.getElementById('webgl')!.style.pointerEvents = 'none';
            this.transition(
                CameraKey.MONITOR,
                2000,
                BezierEasing(0.13, 0.99, 0, 1),
            );
        });
        this.on('leftMonitor', () => {
            this.transition(CameraKey.DESK);
        });
    }

    setFreeCamListeners() {
        UIEventBus.on('freeCamToggle', (toggle: boolean) => {
            // if (toggle === this.freeCam) return;
            if (toggle) {
                this.transition(
                    CameraKey.ORBIT_CONTROLS_START,
                    750,
                    BezierEasing(0.13, 0.99, 0, 1),
                    () => {
                        this.instance.position.copy(
                            this.keyframes.orbitControlsStart.position,
                        );

                        this.orbitControls.update();
                        this.freeCam = true;
                    },
                );
                // @ts-ignore
                document.getElementById('webgl').style.pointerEvents = 'auto';
            } else {
                this.freeCam = false;
                this.transition(
                    CameraKey.IDLE,
                    4000,
                    TWEEN.Easing.Exponential.Out,
                );
                // @ts-ignore
                document.getElementById('webgl').style.pointerEvents = 'none';
            }
        });
    }

    setPostLoadTransition() {
        UIEventBus.on('loadingScreenDone', () => {
            // Phones and tablets explore by touch: one finger turns the room,
            // two fingers pinch to zoom, and a slow drift runs until the
            // first touch. The mouse sweep and hover-to-zoom stay on desktop.
            if (window.matchMedia('(pointer: coarse)').matches) {
                // A standing eye height reads better on a tall portrait screen
                // than the high desktop orbit start.
                if (this.instance.aspect < 1)
                    this.keyframes.orbitControlsStart.position.set(
                        -13000,
                        5200,
                        15500,
                    );
                UIEventBus.dispatch('freeCamToggle', true);
                this.orbitControls.autoRotate = true;
                this.orbitControls.autoRotateSpeed = -0.35;
                this.orbitControls.addEventListener('start', () => {
                    this.orbitControls.autoRotate = false;
                });
                return;
            }
            this.transition(CameraKey.IDLE, 2500, TWEEN.Easing.Exponential.Out);
        });
    }

    resize() {
        this.instance.aspect = this.sizes.width / this.sizes.height;
        this.instance.updateProjectionMatrix();
    }

    createControls() {
        this.renderer = this.application.renderer;
        this.orbitControls = new OrbitControls(
            this.instance,
            this.renderer.instance.domElement,
        );

        const { x, y, z } = this.keyframes.orbitControlsStart.focalPoint;
        this.orbitControls.target.set(x, y, z);

        // Slide the orbit point across the floor plane, not the screen, so
        // panning walks around the room rather than floating up and down.
        this.orbitControls.enablePan = true;
        this.orbitControls.screenSpacePanning = false;
        this.orbitControls.panSpeed = 1.1;
        this.orbitControls.keyPanSpeed = 40;
        if (typeof window !== 'undefined' && window.addEventListener)
            this.orbitControls.listenToKeyEvents(window as any);
        const dom = this.renderer.instance.domElement;
        dom.addEventListener('dblclick', (event: MouseEvent) =>
            this.focusOn(event),
        );
        // Touch: two quick taps without a drag, since not every mobile
        // browser turns a double-tap into dblclick.
        let down = { x: 0, y: 0, t: 0 };
        let lastTap = { x: 0, y: 0, t: -1e9 };
        dom.addEventListener('pointerdown', (e: PointerEvent) => {
            down = { x: e.clientX, y: e.clientY, t: performance.now() };
        });
        dom.addEventListener('pointerup', (e: PointerEvent) => {
            if (e.pointerType !== 'touch') return;
            const now = performance.now();
            const still =
                Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12 &&
                now - down.t < 300;
            if (!still) return;
            if (
                now - lastTap.t < 350 &&
                Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40
            ) {
                lastTap.t = -1e9;
                this.focusOn(e);
                return;
            }
            lastTap = { x: e.clientX, y: e.clientY, t: now };
        });
        this.orbitControls.enableDamping = true;
        this.orbitControls.object.position.copy(
            this.keyframes.orbitControlsStart.position,
        );
        this.orbitControls.dampingFactor = 0.05;
        this.orbitControls.maxPolarAngle = Math.PI / 2;
        this.orbitControls.minDistance = ROAM.minDistance;
        this.orbitControls.maxDistance = ROAM.maxDistance;

        this.orbitControls.update();
    }

    /** The visible, opaque surface under a screen point, if any. */
    pick(event: { clientX: number; clientY: number }) {
        const dom = this.renderer.instance.domElement;
        const rect = dom.getBoundingClientRect();
        const ndc = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, this.instance);
        const shown = (o: THREE.Object3D | null): boolean =>
            !o || (o.visible && shown(o.parent));
        return ray.intersectObjects(this.scene.children, true).find((h) => {
            const mesh = h.object as THREE.Mesh;
            const material = Array.isArray(mesh.material)
                ? mesh.material[0]
                : mesh.material;
            return (
                mesh.isMesh &&
                shown(mesh) &&
                material?.visible !== false &&
                !(material?.transparent && material.opacity < 0.5)
            );
        });
    }

    /**
     * Fly the orbit point to the surface under a double-click, coming in to
     * a comfortable viewing distance on the same bearing.
     */
    focusOn(event: { clientX: number; clientY: number }) {
        const hit = this.pick(event);
        if (!hit || !this.freeCam || !this.orbitControls) return;
        const target = clampTo(hit.point.clone(), ROAM.target);
        const offset = this.instance.position
            .clone()
            .sub(this.orbitControls.target);
        offset.setLength(
            THREE.MathUtils.clamp(offset.length(), ROAM.minDistance, 5200),
        );
        const position = clampTo(target.clone().add(offset), ROAM.camera);
        const duration = this.application.reducedMotion?.matches ? 0 : 800;
        const ease = TWEEN.Easing.Cubic.InOut;
        new TWEEN.Tween(this.orbitControls.target)
            .to({ x: target.x, y: target.y, z: target.z }, duration)
            .easing(ease)
            .start();
        new TWEEN.Tween(this.instance.position)
            .to({ x: position.x, y: position.y, z: position.z }, duration)
            .easing(ease)
            .start();
    }

    update() {
        TWEEN.update();

        const key = this.targetKeyframe || this.currentKeyframe;
        const base = this.freeCam
            ? 55
            : key === CameraKey.IDLE || key === CameraKey.LOADING
              ? 44
              : 35;
        // Lenses are vertical angles authored for landscape. On a portrait
        // phone that crops the room to a sliver, so keep the same horizontal
        // angle instead (capped short of fisheye).
        const aspect = this.instance.aspect;
        const fov =
            aspect >= 1
                ? base
                : Math.min(
                      90,
                      THREE.MathUtils.radToDeg(
                          2 *
                              Math.atan(
                                  Math.tan(THREE.MathUtils.degToRad(base / 2)) /
                                      aspect,
                              ),
                      ),
                  );
        if (this.instance.fov !== fov) {
            this.instance.fov = fov;
            this.instance.updateProjectionMatrix();
        }
        if (this.orbitControls) this.orbitControls.enabled = this.freeCam;
        if (this.freeCam && this.orbitControls) {
            clampTo(this.orbitControls.target, ROAM.target);
            this.orbitControls.update();
            // Keep the camera and its near plane inside the walls, above the
            // floor and below the ceiling, wherever the orbit point roams.
            const p = clampTo(this.instance.position, ROAM.camera);
            this.instance.lookAt(this.orbitControls.target);
            this.position.copy(p);
            this.focalPoint.copy(this.orbitControls.target);
            return;
        }

        for (const key in this.keyframes) {
            const _key = key as CameraKey;
            this.keyframes[_key].update();
        }

        if (this.currentKeyframe) {
            const keyframe = this.keyframes[this.currentKeyframe];
            this.position.copy(keyframe.position);
            this.focalPoint.copy(keyframe.focalPoint);
        }

        this.instance.position.copy(this.position);
        this.instance.lookAt(this.focalPoint);
    }
}
