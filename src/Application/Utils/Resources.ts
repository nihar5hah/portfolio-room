import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import Application from '../Application';
import UIEventBus from '../UI/EventBus';
import EventEmitter from './EventEmitter';
import Loading from './Loading';
import { dequantize } from './Dequantize';

export default class Resources extends EventEmitter {
    sources: Resource[];
    // Not sure about this one
    items: {
        texture: { [name: string]: LoadedTexture };
        cubeTexture: { [name: string]: LoadedCubeTexture };
        gltfModel: { [name: string]: LoadedModel };
    };
    toLoad: number;
    loaded: number;
    failed = false;
    loaders: {
        gltfLoader: GLTFLoader;
        textureLoader: THREE.TextureLoader;
        cubeTextureLoader: THREE.CubeTextureLoader;
    };
    application: Application;
    loading: Loading;
    /** Lazy textures by name, fetched only once something asks for them. */
    lazySources = new Map<string, TextureResource>();
    wanted = new Set<string>();
    fillReady = false;

    constructor(sources: Resource[]) {
        super();

        this.sources = sources;

        this.items = { texture: {}, cubeTexture: {}, gltfModel: {} };
        this.toLoad = this.sources.length;
        this.loaded = 0;
        this.application = new Application();
        this.loading = this.application.loading;

        this.setLoaders();
        this.startLoading();
    }

    setLoaders() {
        this.loaders = {
            gltfLoader: new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),
            textureLoader: new THREE.TextureLoader(),
            cubeTextureLoader: new THREE.CubeTextureLoader(),
        };
    }

    startLoading() {
        this.lazySources ??= new Map();
        this.wanted ??= new Set();
        // Load each source
        for (const source of this.sources) {
            if (source.type === 'texture' && source.lazy) {
                // Materials keep this exact object; its image is swapped in later.
                const placeholder = new THREE.Texture(this.swatch());
                placeholder.encoding = THREE.sRGBEncoding;
                placeholder.needsUpdate = true;
                this.lazySources.set(source.name, source);
                this.sourceLoaded(source, placeholder);
            } else if (source.type === 'gltfModel') {
                this.loaders.gltfLoader.load(
                    source.path,
                    (file) => {
                        // Models ship Meshopt-quantized (scripts/
                        // optimize-models.mjs); raycasts, bounds and the
                        // floor plan need plain floats (Utils/Dequantize.ts).
                        dequantize(file.scene);
                        this.sourceLoaded(source, file);
                    },
                    undefined,
                    () => this.sourceFailed(source),
                );
            } else if (source.type === 'texture') {
                this.loaders.textureLoader.load(
                    source.path,
                    (file) => {
                        file.encoding = THREE.sRGBEncoding;
                        this.sourceLoaded(source, file);
                    },
                    undefined,
                    () => this.sourceFailed(source),
                );
            } else if (source.type === 'cubeTexture') {
                this.loaders.cubeTextureLoader.load(
                    source.path,
                    (file) => {
                        this.sourceLoaded(source, file);
                    },
                    undefined,
                    () => this.sourceFailed(source),
                );
            }
        }
        // Album art streams in once the room is usable, and only the art
        // something shows (the sleeves in the room, the record on the
        // turntable): the other albums' covers load when they play.
        const fill = () => {
            this.fillReady = true;
            this.wanted.forEach((name) => this.fetchLazy(name));
        };
        if (this.loaded === this.toLoad) setTimeout(fill);
        else this.on('ready', fill);
    }

    /** Ask for a lazy texture's real image (once); a failure keeps the swatch. */
    want(name: string) {
        if (this.wanted.has(name) || !this.lazySources.has(name)) return;
        this.wanted.add(name);
        if (this.fillReady) this.fetchLazy(name);
    }

    fetchLazy(name: string) {
        const source = this.lazySources.get(name);
        if (!source) return;
        new THREE.ImageLoader().load(source.path, (image) => {
            // Decode off the main thread before the upload where supported.
            const ready = image.decode ? image.decode() : Promise.resolve();
            void ready
                .catch(() => undefined)
                .then(() => {
                    const texture = this.items.texture[source.name];
                    // WebGL2 storage is immutable at 1×1: free it so the
                    // real size is allocated on the next upload.
                    texture.dispose();
                    texture.image = image;
                    texture.needsUpdate = true;
                });
        });
    }

    swatch() {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d');
        if (context) {
            context.fillStyle = '#202124';
            context.fillRect(0, 0, 1, 1);
        }
        return canvas;
    }

    sourceFailed(source: Resource) {
        if (source.type === 'texture' && source.optional) {
            const fallback = new THREE.DataTexture(
                new Uint8Array([32, 33, 36, 255]),
                1,
                1,
            );
            fallback.encoding = THREE.sRGBEncoding;
            fallback.needsUpdate = true;
            this.sourceLoaded(source, fallback);
        } else {
            this.failed = true;
            UIEventBus.dispatch('resourceError', {});
        }
    }

    sourceLoaded(source: Resource, file: LoadedResource) {
        this.items[source.type][source.name] = file;

        this.loaded++;

        this.loading.trigger('loadedSource', [
            source.name,
            this.loaded,
            this.toLoad,
        ]);

        if (this.loaded === this.toLoad) {
            this.trigger('ready');
        }
    }
}
