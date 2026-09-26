import * as THREE from 'three';
import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import Application from './Application';
import Sizes from './Utils/Sizes';
import Camera from './Camera/Camera';
import UIEventBus from './UI/EventBus';
// @ts-ignore
import screenVert from './Shaders/screen/vertex.glsl';
// @ts-ignore
import screenFrag from './Shaders/screen/fragment.glsl';
import Time from './Utils/Time';

export default class Renderer {
    application: Application;
    sizes: Sizes;
    scene: THREE.Scene;
    cssScene: THREE.Scene;
    time: Time;
    overlay: THREE.Mesh;
    overlayScene: THREE.Scene;
    camera: Camera;
    overlayInstance: THREE.WebGLRenderer;
    instance: THREE.WebGLRenderer;
    cssInstance: CSS3DRenderer;
    uniforms: {
        [uniform: string]: THREE.IUniform<any>;
    };

    constructor() {
        this.application = new Application();
        this.time = this.application.time;
        this.sizes = this.application.sizes;
        this.scene = this.application.scene;
        this.cssScene = this.application.cssScene;
        this.overlayScene = this.application.overlayScene;
        this.camera = this.application.camera;

        this.setInstance();
    }

    setInstance() {
        this.instance = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
        });
        // Settings
        // this.instance.physicallyCorrectLights = true;
        this.instance.outputEncoding = THREE.sRGBEncoding;
        this.instance.shadowMap.enabled = true;
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

        this.overlayInstance = new THREE.WebGLRenderer();
        this.overlayInstance.setSize(this.sizes.width, this.sizes.height);
        // Grain at 4.5% opacity doesn't need retina pixels; a full-res second
        // canvas composited with soft-light is pure overhead on mobile GPUs.
        this.overlayInstance.setPixelRatio(1);
        this.overlayInstance.domElement.style.position = 'absolute';
        this.overlayInstance.domElement.style.top = '0px';
        this.overlayInstance.domElement.style.mixBlendMode = 'soft-light';
        this.overlayInstance.domElement.style.opacity = '0.045';
        // this.overlayInstance.domElement.style.mixBlendMode = 'luminosity';
        // this.overlayInstance.domElement.style.opacity = '1';
        this.overlayInstance.domElement.style.pointerEvents = 'none';

        document
            .querySelector('#overlay')
            ?.appendChild(this.overlayInstance.domElement);

        this.cssInstance = new CSS3DRenderer();
        this.cssInstance.setSize(this.sizes.width, this.sizes.height);
        this.cssInstance.domElement.style.position = 'absolute';
        this.cssInstance.domElement.style.top = '0px';

        document
            .querySelector('#css')
            ?.appendChild(this.cssInstance.domElement);

        this.uniforms = {
            u_time: { value: 1 },
        };

        this.overlay = new THREE.Mesh(
            new THREE.PlaneGeometry(10000, 10000),
            new THREE.ShaderMaterial({
                vertexShader: screenVert,
                fragmentShader: screenFrag,
                uniforms: this.uniforms,
                depthTest: false,
                depthWrite: false,
            }),
        );

        this.overlayScene.add(this.overlay);

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
    }

    monitor = false;
    roomExposure = 0.85;
    targetExposure = 0.85;

    resize() {
        this.instance.setSize(this.sizes.width, this.sizes.height);
        this.instance.setPixelRatio(this.sizes.pixelRatio);

        this.cssInstance.setSize(this.sizes.width, this.sizes.height);

        this.overlayInstance.setSize(this.sizes.width, this.sizes.height);
        this.overlayInstance.setPixelRatio(1);
    }

    frame = 0;

    update() {
        this.application.camera.instance.updateProjectionMatrix();
        if (this.uniforms && !this.application.reducedMotion.matches) {
            this.uniforms.u_time.value = Math.sin(this.time.current * 0.01);
        }
        // Only Begu moves under the shadow lights; 20 Hz shadows read as smooth.
        // ponytail: fixed cadence; upgrade path is "needsUpdate when Begu moved".
        this.instance.shadowMap.needsUpdate = this.frame++ % 3 === 0;

        this.instance.toneMappingExposure +=
            (this.targetExposure - this.instance.toneMappingExposure) * 0.06;
        this.instance.render(this.scene, this.camera.instance);
        this.cssInstance.render(this.cssScene, this.camera.instance);
        this.overlayInstance.render(this.overlayScene, this.camera.instance);
        this.overlay.position.copy(this.camera.instance.position);
    }
}
