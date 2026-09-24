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
                    this.keyframes.orbitControlsStart.position.set(-13000, 5200, 15500);
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

        this.orbitControls.enablePan = false;
        this.orbitControls.enableDamping = true;
        this.orbitControls.object.position.copy(
            this.keyframes.orbitControlsStart.position,
        );
        this.orbitControls.dampingFactor = 0.05;
        this.orbitControls.maxPolarAngle = Math.PI / 2;
        this.orbitControls.minDistance = 4000;
        this.orbitControls.maxDistance = 29000;

        this.orbitControls.update();
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
            this.orbitControls.update();
            // Room walls: x ±18000, z -6500/18500; ceiling 10885.
            // Keep the camera and its near plane inside, above the furniture.
            const p = this.instance.position;
            p.set(
                THREE.MathUtils.clamp(p.x, -16900, 16900),
                THREE.MathUtils.clamp(p.y, 2600, 10300),
                THREE.MathUtils.clamp(p.z, -5300, 17500),
            );
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
