import * as THREE from 'three';
import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import Application from './Application';
import Sizes from './Utils/Sizes';
import Camera from './Camera/Camera';
import UIEventBus from './UI/EventBus';
import Time from './Utils/Time';
import type { QualitySettings } from './Utils/Quality';

/**
 * The room's WebGL renderer and the CSS3D layer the Mac's screen lives on.
 * Performance-critical choices (see docs/PERFORMANCE.md):
 *
 * - Antialiasing, resolution and shadows follow the quality tier
 *   (Utils/Quality.ts), and the resolution follows the frame-time governor.
 * - The shadow map is redrawn only when something under the key light
 *   moves (Begu, the ball, the curtains), at most every few frames.
 * - Seated at the Mac, the room behind the screen is drawn at a quarter of
 *   the frame rate: the desktop in the screen gets the GPU.
 */
export default class Renderer {
    application: Application;
    sizes: Sizes;
    scene: THREE.Scene;
    cssScene: THREE.Scene;
    time: Time;
    camera: Camera;
    instance: THREE.WebGLRenderer;
    cssInstance: CSS3DRenderer;

    constructor() {
        this.application = new Application();
        this.time = this.application.time;
        this.sizes = this.application.sizes;
        this.scene = this.application.scene;
        this.cssScene = this.application.cssScene;
        this.camera = this.application.camera;

        this.setInstance();
    }

    setInstance() {
        const quality = this.application.quality;
        const settings = quality.settings;
        this.instance = new THREE.WebGLRenderer({
            antialias: settings.antialias,
            alpha: true,
            powerPreference: 'high-performance',
        });
        // Settings
        this.instance.outputEncoding = THREE.sRGBEncoding;
        this.instance.shadowMap.enabled = settings.shadowMapSize > 0;
        this.instance.shadowMap.type = THREE.PCFShadowMap;
        // Shadow maps are re-rendered on our own cadence (see update()), not
        // on every render() call.
        this.instance.shadowMap.autoUpdate = false;
        this.instance.shadowMap.needsUpdate = true;
        this.instance.toneMapping = THREE.ACESFilmicToneMapping;
        this.instance.toneMappingExposure = 0.85;
        this.instance.setSize(this.sizes.width, this.sizes.height);
        this.instance.setPixelRatio(this.sizes.pixelRatio);
        this.instance.setClearColor(0x000000, 0.0);

        // Style
        this.instance.domElement.style.position = 'absolute';
        this.instance.domElement.style.zIndex = '1px';
        this.instance.domElement.style.top = '0px';

        document.querySelector('#webgl')?.appendChild(this.instance.domElement);

        this.cssInstance = new CSS3DRenderer();
        this.cssInstance.setSize(this.sizes.width, this.sizes.height);
        this.cssInstance.domElement.style.position = 'absolute';
        this.cssInstance.domElement.style.top = '0px';

        document
            .querySelector('#css')
            ?.appendChild(this.cssInstance.domElement);

        quality.onChange((next) => this.applyQuality(next));

        // Dim the room (not the CSS3D screen) while the visitor is on the Mac.
        // The room's own level (time of day, Good Night) is set by the
        // Environment's lighting.
        UIEventBus.on('enterMonitor', () => {
            this.monitor = true;
            this.targetExposure = 0.42;
        });
        UIEventBus.on('leftMonitor', () => {
            this.monitor = false;
            this.targetExposure = this.roomExposure;
        });
        // The GPU dropped the context (memory pressure on phones): stop
        // drawing until it is back, then redraw the shadows.
        const canvas = this.instance.domElement;
        canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            this.lost = true;
        });
        canvas.addEventListener('webglcontextrestored', () => {
            this.lost = false;
            this.shadowFrames = 3;
        });
    }

    /** A new tier or resolution from the quality governor. */
    applyQuality(settings: QualitySettings) {
        const ratio = this.application.quality.pixelRatio;
        this.sizes.pixelRatio = ratio;
        if (Math.abs(this.instance.getPixelRatio() - ratio) > 0.001) {
            this.instance.setPixelRatio(ratio);
            this.instance.setSize(this.sizes.width, this.sizes.height);
        }
        this.application.world?.applyQuality?.(settings);
        this.shadowFrames = 2;
    }

    monitor = false;
    lost = false;
    roomExposure = 0.85;
    targetExposure = 0.85;
    /** Frames that must redraw the shadow map (start-up, changes). */
    shadowFrames = 3;

    resize() {
        this.instance.setSize(this.sizes.width, this.sizes.height);
        this.instance.setPixelRatio(this.sizes.pixelRatio);

        this.cssInstance.setSize(this.sizes.width, this.sizes.height);
    }

    frame = 0;

    /** Whether this frame should redraw the shadow map. */
    shadowTick() {
        const settings = this.application.quality.settings;
        if (!settings.shadowMapSize) return false;
        if (this.shadowFrames > 0) {
            this.shadowFrames--;
            return true;
        }
        const world = this.application.world;
        // The curtains, the gold record going up: on every tier.
        if (world?.shadowsChanged?.(false)) return true;
        if (!settings.shadowInterval || this.frame % settings.shadowInterval)
            return false;
        // Begu and the ball, on tiers where they cast real shadows.
        return !!world?.shadowsChanged?.(true);
    }

    update() {
        const frame = this.frame++;
        if (this.lost) return;
        const camera = this.application.camera;
        camera.instance.updateProjectionMatrix();
        this.instance.toneMappingExposure +=
            (this.targetExposure - this.instance.toneMappingExposure) * 0.06;
        // At the Mac (and settled there) the room is a dim frame around the
        // screen: a quarter of the frame rate is plenty.
        const seated =
            this.monitor &&
            camera.currentKeyframe === 'monitor' &&
            !camera.targetKeyframe &&
            Math.abs(this.targetExposure - this.instance.toneMappingExposure) <
                0.01;
        if (!seated || frame % 4 === 0) {
            this.instance.shadowMap.needsUpdate = this.shadowTick();
            this.instance.render(this.scene, camera.instance);
        }
        // The CSS3D screen only shows while the lid is open. It is rendered
        // once up front regardless: that puts the screen's element (and its
        // iframe, so a preload can start) into the page.
        const lid = this.application.world?.computerSetup?.openness ?? 1;
        if (lid > 0.08 || !this.cssPrimed) {
            this.cssInstance.render(this.cssScene, camera.instance);
            if (this.application.world?.monitorScreen) this.cssPrimed = true;
        }
    }
    cssPrimed = false;
}
