import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import Application from '../Application';
import UIEventBus from '../UI/EventBus';
import EventEmitter from './EventEmitter';
import Loading from './Loading';

export default class Resources extends EventEmitter {
    sources: Resource[];
    // Not sure about this one
    items: {
        texture: { [name: string]: LoadedTexture };
        cubeTexture: { [name: string]: LoadedCubeTexture };
        gltfModel: { [name: string]: LoadedModel };
        audio: { [name: string]: LoadedAudio };
    };
    toLoad: number;
    loaded: number;
    failed = false;
    loaders: {
        gltfLoader: GLTFLoader;
        textureLoader: THREE.TextureLoader;
        cubeTextureLoader: THREE.CubeTextureLoader;
        audioLoader: THREE.AudioLoader;
    };
    application: Application;
    loading: Loading;

    constructor(sources: Resource[]) {
        super();

        this.sources = sources;

        this.items = { texture: {}, cubeTexture: {}, gltfModel: {}, audio: {} };
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
            audioLoader: new THREE.AudioLoader(),
        };
    }

    startLoading() {
        const lazy: TextureResource[] = [];
        // Load each source
        for (const source of this.sources) {
            if (source.type === 'texture' && source.lazy) {
                // Materials keep this exact object; its image is swapped in later.
                const placeholder = new THREE.Texture(this.swatch());
                placeholder.encoding = THREE.sRGBEncoding;
                placeholder.needsUpdate = true;
                lazy.push(source);
                this.sourceLoaded(source, placeholder);
            } else if (source.type === 'gltfModel') {
                this.loaders.gltfLoader.load(
                    source.path,
                    (file) => {
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
            } else if (source.type === 'audio') {
                this.loaders.audioLoader.load(
                    source.path,
                    (buffer) => {
                        this.sourceLoaded(source, buffer);
                    },
                    undefined,
                    () => this.sourceFailed(source),
                );
            }
        }
        // Album art streams in once the room is usable; a failure keeps the swatch.
        const images = new THREE.ImageLoader();
        const fill = () =>
            lazy.forEach((source) =>
                images.load(source.path, (image) => {
                    const texture = this.items.texture[source.name];
                    // WebGL2 storage is immutable at 1×1: free it so the real
                    // size is allocated on the next upload.
                    texture.dispose();
                    texture.image = image;
                    texture.needsUpdate = true;
                }),
            );
        if (this.loaded === this.toLoad) setTimeout(fill);
        else this.on('ready', fill);
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
