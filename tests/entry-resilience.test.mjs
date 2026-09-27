import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
const require = createRequire(import.meta.url);

function load(path, dependencies) {
    const exports = {};
    const compiled = require('typescript').transpileModule(
        fs.readFileSync(new URL(path, import.meta.url), 'utf8'),
        {
            compilerOptions: {
                module: require('typescript').ModuleKind.CommonJS,
            },
        },
    ).outputText;
    new Function('require', 'exports', compiled)(
        (name) => dependencies[name] || { default: class {} },
        exports,
    );
    return exports.default;
}

test('optional artwork failures finish loading; required models keep the room unavailable', () => {
    const events = [];
    const Resources = load('../src/Application/Utils/Resources.ts', {
        three: THREE,
        './assetUrl': { default: (path) => path },
        '../UI/EventBus': {
            default: { dispatch: (name) => events.push(name) },
        },
    });
    const resources = Object.create(Resources.prototype);
    Object.assign(resources, {
        sources: [
            {
                name: 'sleeve',
                type: 'texture',
                path: 'missing.jpg',
                optional: true,
            },
        ],
        items: { texture: {} },
        loaded: 0,
        toLoad: 1,
        loading: { trigger() {} },
        trigger: (name) => events.push(name),
        loaders: {
            textureLoader: { load: (_path, _ok, _progress, fail) => fail() },
        },
    });
    resources.startLoading();
    assert.equal(
        resources.loaded,
        1,
        'a failed sleeve must not stall the resource gate',
    );
    assert.ok(resources.items.texture.sleeve.isTexture);
    assert.deepEqual(events, ['ready']);
    resources.sources = [
        { name: 'mac', type: 'gltfModel', path: 'missing.glb' },
    ];
    resources.loaders.gltfLoader = resources.loaders.textureLoader;
    resources.startLoading();
    assert.equal(
        resources.failed,
        true,
        'failure remains observable before React subscribes',
    );
    assert.equal(resources.loaded, 1);
    assert.equal(events.at(-1), 'resourceError');
});

test('album art never blocks entry, loads only when wanted, and fills the same texture', async () => {
    let loaded;
    const fetched = [];
    const Resources = load('../src/Application/Utils/Resources.ts', {
        three: {
            ...THREE,
            ImageLoader: class {
                load(path, done) {
                    fetched.push(path);
                    loaded = new Promise((resolve) =>
                        setTimeout(() =>
                            resolve(done({ path, width: 500, height: 500 })),
                        ),
                    );
                }
            },
        },
        './assetUrl': { default: (path) => path },
        '../UI/EventBus': { default: { dispatch() {} } },
    });
    const events = [];
    const resources = Object.create(Resources.prototype);
    Object.assign(resources, {
        sources: [
            {
                name: 'sleeve',
                type: 'texture',
                path: 'room/albums/x.jpg',
                lazy: true,
            },
            {
                name: 'other',
                type: 'texture',
                path: 'room/albums/y.jpg',
                lazy: true,
            },
        ],
        items: { texture: {} },
        lazySources: new Map(),
        wanted: new Set(),
        fillReady: false,
        loaded: 0,
        toLoad: 2,
        loading: { trigger() {} },
        trigger: (name) => events.push(name),
        on() {},
        swatch: () => ({ width: 1, height: 1 }),
        loaders: {
            textureLoader: {
                load: () => assert.fail('must not block on album art'),
            },
        },
    });
    resources.startLoading();
    resources.want('sleeve'); // a sleeve in the room asks for its art
    const placeholder = resources.items.texture.sleeve;
    assert.deepEqual(
        events,
        ['ready'],
        'room is enterable before any album art arrives',
    );
    await new Promise((r) => setTimeout(r)); // fill() is scheduled after ready
    await loaded;
    await new Promise((r) => setTimeout(r)); // decode, then upload
    assert.deepEqual(
        fetched,
        ['room/albums/x.jpg'],
        'art nothing shows is never fetched',
    );
    assert.equal(
        resources.items.texture.sleeve,
        placeholder,
        'materials keep their texture object',
    );
    assert.equal(
        placeholder.image.path,
        'room/albums/x.jpg',
        'real artwork replaces the swatch',
    );
});

test('every transition out of monitor restores room state, and mobile entries open readable content', () => {
    const events = [];
    const elements = { style: {} };
    globalThis.document = { getElementById: () => elements };
    let narrow = false;
    globalThis.window = { matchMedia: () => ({ matches: narrow }) };
    globalThis.location = { assign: (url) => events.push(url) };
    const Camera = load('../src/Application/Camera/Camera.ts', {
        three: THREE,
        '@tweenjs/tween.js': { default: require('@tweenjs/tween.js') },
        'bezier-easing': { default: require('bezier-easing') },
        '../UI/EventBus': {
            default: { dispatch: (name) => events.push(name) },
        },
    });
    const camera = Object.create(Camera.prototype);
    const listeners = {};
    Object.assign(camera, {
        application: { reducedMotion: { matches: true } },
        position: new THREE.Vector3(),
        focalPoint: new THREE.Vector3(),
        on: (name, fn) => (listeners[name] = fn),
        keyframes: Object.fromEntries(
            ['desk', 'idle', 'monitor', 'orbitControlsStart'].map((key) => [
                key,
                {
                    position: new THREE.Vector3(),
                    focalPoint: new THREE.Vector3(),
                },
            ]),
        ),
    });
    for (const destination of ['desk', 'orbitControlsStart', 'idle']) {
        events.length = 0;
        camera.currentKeyframe = 'monitor';
        camera.targetKeyframe = undefined;
        camera.transition(destination);
        assert.deepEqual(events, ['leftMonitor'], destination);
    }
    events.length = 0;
    camera.currentKeyframe = undefined;
    camera.targetKeyframe = 'monitor';
    camera.transition('idle');
    assert.deepEqual(
        events,
        ['leftMonitor'],
        'leaving during zoom restores exposure too',
    );
    camera.setMonitorListeners();
    narrow = true;
    events.length = 0;
    listeners.enterMonitor();
    listeners.enterMonitor('begu');
    assert.deepEqual(events, ['/desktop/', '/desktop/?app=begu']);
});
