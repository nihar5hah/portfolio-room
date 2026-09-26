import * as THREE from 'three';

import Debug from './Utils/Debug';
import Sizes from './Utils/Sizes';
import Time from './Utils/Time';
import Camera from './Camera/Camera';
import Renderer from './Renderer';
import Mouse from './Utils/Mouse';

//@ts-ignore
import World from './World/World';
import Resources from './Utils/Resources';

import sources from './sources';

import Loading from './Utils/Loading';
import Quality from './Utils/Quality';

import UI from './UI';
import UIEventBus from './UI/EventBus';

let instance: Application | null = null;

export default class Application {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    debug: Debug;
    sizes: Sizes;
    time: Time;
    scene: THREE.Scene;
    cssScene: THREE.Scene;
    overlayScene: THREE.Scene;
    resources: Resources;
    camera: Camera;
    renderer: Renderer;
    world: World;
    mouse: Mouse;
    loading: Loading;
    ui: UI;
    stats: { begin(): void; end(): void; dom: HTMLElement } | undefined;
    quality: Quality;

    constructor() {
        // Singleton
        if (instance) {
            return instance;
        }

        instance = this;

        // Setup
        this.debug = new Debug();
        // Before the renderer: the tier decides antialiasing and resolution.
        this.quality = new Quality();
        document.documentElement.dataset.quality = this.quality.tier;
        this.sizes = new Sizes(() => this.quality.pixelRatio);
        this.mouse = new Mouse();
        this.loading = new Loading();
        this.time = new Time();
        this.scene = new THREE.Scene();
        this.cssScene = new THREE.Scene();
        this.overlayScene = new THREE.Scene();
        this.resources = new Resources(sources);
        this.camera = new Camera();
        this.renderer = new Renderer();
        this.camera.createControls();
        this.world = new World();

        this.ui = new UI();

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('debug')) {
            (window as any).__app = this;
            // Debug-only: loaded on demand, never in a visitor's bundle.
            void import(/* webpackChunkName: "debug" */ 'stats.js').then(
                ({ default: Stats }) => {
                    const stats = new Stats();
                    stats.showPanel(0);
                    document.body.appendChild(stats.dom);
                    this.stats = stats;
                },
            );
        }

        // Resize event
        this.sizes.on('resize', () => {
            this.resize();
        });

        // Time tick event
        this.time.on('tick', () => {
            this.update();
        });
        // The governor judges frame times once the room is on screen and
        // the first shaders and textures have settled.
        UIEventBus.on('loadingScreenDone', () =>
            setTimeout(() => (this.measuring = true), 2000),
        );
    }

    /** Feeding frame times to the quality governor (after the intro). */
    measuring = false;

    resize() {
        this.camera.resize();
        this.renderer.resize();
    }

    update() {
        if (this.stats) this.stats.begin();
        this.camera.update();
        this.world.update();
        this.renderer.update();
        if (this.measuring && !document.hidden)
            this.quality.frame(this.time.delta);
        if (this.stats) this.stats.end();
    }

    destroy() {
        this.sizes.off('resize');
        this.time.off('tick');

        // Traverse the whole scene
        this.scene.traverse((child) => {
            // Test if it's a mesh
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();

                // Loop through the material properties
                for (const key in child.material) {
                    const value = child.material[key];

                    // Test if there is a dispose function
                    if (value && typeof value.dispose === 'function') {
                        value.dispose();
                    }
                }
            }
        });

        this.renderer.instance.dispose();

        if (this.debug.active) this.debug.ui?.destroy();
    }
}
