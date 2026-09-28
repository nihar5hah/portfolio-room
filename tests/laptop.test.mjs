import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import layout from './layout.mjs';
const require = createRequire(import.meta.url);

// Load the shipped geometry without browser-only textures. Keep the real mesh compression and transforms.
async function geometry() {
    const bytes = fs.readFileSync(
        new URL('../static/models/MacBook/macbook-pro-m3.glb', import.meta.url),
    );
    const length = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.subarray(20, 20 + length));
    json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + length).toString('base64')}`;
    json.images = [];
    json.textures = [];
    json.materials = [];
    json.meshes.forEach((mesh) =>
        mesh.primitives.forEach((primitive) => {
            delete primitive.material;
        }),
    );
    globalThis.ProgressEvent ??= class extends Event {};
    return new Promise((resolve, reject) =>
        new GLTFLoader()
            .setMeshoptDecoder(MeshoptDecoder)
            .parse(JSON.stringify(json), '', resolve, reject),
    );
}

/** Transpile one of the room's modules; `stubs` answers its imports. */
function loadTs(path, stubs = {}) {
    const compiled = require('typescript').transpileModule(
        fs.readFileSync(new URL(path, import.meta.url), 'utf8'),
        {
            compilerOptions: {
                module: require('typescript').ModuleKind.CommonJS,
                target: require('typescript').ScriptTarget.ES2022,
            },
        },
    ).outputText;
    const exports = {};
    new Function('require', 'exports', compiled)(
        (name) => stubs[name] ?? (name === 'three' ? THREE : require(name)),
        exports,
    );
    return exports;
}

test('the MacBook draws in a handful of calls, looks the same, and its lid still opens', async () => {
    globalThis.document = {
        getElementById: () => null,
        createElement: () => ({ getContext: () => null }),
    };
    const build = async (merge) => {
        const model = await geometry();
        // As Resources does in the room: plain floats before anything else.
        if (merge)
            loadTs('../src/Application/Utils/Dequantize.ts').dequantize(
                model.scene,
            );
        const app = {
            resources: { items: { gltfModel: { macbookModel: model } } },
            scene: new THREE.Scene(),
            reducedMotion: { matches: true },
            time: { delta: 16 },
            camera: { currentKeyframe: 'idle' },
        };
        const Computer = loadTs('../src/Application/World/Computer.ts', {
            '../Application': {
                default: class {
                    constructor() {
                        return app;
                    }
                },
            },
            './Layout': layout,
            '../Utils/Occlusion': { occluded: () => false },
            '../Utils/StaticBatch': merge
                ? loadTs('../src/Application/Utils/StaticBatch.ts')
                : { mergeModel: () => ({ before: 0, after: 0 }) },
        }).default;
        return { app, computer: new Computer() };
    };
    const box = (object) => {
        object.updateWorldMatrix(true, true);
        const bounds = new THREE.Box3(),
            point = new THREE.Vector3();
        object.traverse((part) => {
            if (!part.isMesh || !part.visible) return;
            const position = part.geometry.getAttribute('position');
            const divisor = position.normalized
                ? position.array instanceof Int16Array
                    ? 32767
                    : 65535
                : 1;
            for (let i = 0; i < position.count; i++)
                bounds.expandByPoint(
                    point
                        .fromBufferAttribute(position, i)
                        .divideScalar(divisor)
                        .applyMatrix4(part.matrixWorld),
                );
        });
        return bounds;
    };
    const meshes = (object) => {
        let count = 0;
        object.traverse((part) => part.isMesh && part.visible && count++);
        return count;
    };
    const plain = await build(false);
    const merged = await build(true);
    assert.ok(meshes(plain.computer.root) >= 50, 'the shipped model: 60 parts');
    assert.ok(
        meshes(merged.computer.root) <= meshes(plain.computer.root) / 5,
        `merged into a few draw calls (${meshes(merged.computer.root)})`,
    );
    assert.ok(merged.computer.merged.after < merged.computer.merged.before);
    const same = (a, b, what) => {
        for (const edge of ['min', 'max'])
            for (const axis of ['x', 'y', 'z'])
                assert.ok(
                    Math.abs(a[edge][axis] - b[edge][axis]) < 0.5,
                    `${what}: ${edge}.${axis} ${a[edge][axis]} vs ${b[edge][axis]}`,
                );
    };
    for (const { app, computer } of [plain, merged]) {
        app.camera.currentKeyframe = 'idle';
        computer.update();
    }
    same(box(merged.computer.root), box(plain.computer.root), 'closed');
    const closedLid = box(merged.computer.hinge);
    for (const { app, computer } of [plain, merged]) {
        app.camera.currentKeyframe = 'monitor';
        computer.update();
    }
    same(box(merged.computer.root), box(plain.computer.root), 'open');
    assert.ok(
        box(merged.computer.hinge).max.y - closedLid.max.y > 1000,
        'the merged lid swings up with its hinge',
    );
});

test('shipped MacBook closes above the base, opens with approach, and survives reversal/reduced motion', async () => {
    globalThis.document = {
        getElementById: () => null,
        createElement: () => ({ getContext: () => null }),
    };
    const model = await geometry();
    const app = {
        resources: { items: { gltfModel: { macbookModel: model } } },
        scene: new THREE.Scene(),
        reducedMotion: { matches: false },
        time: { delta: 16 },
        camera: {
            currentKeyframe: 'idle',
            position: new THREE.Vector3(-13500, 8500, 14500),
        },
    };
    const source = fs.readFileSync(
        new URL('../src/Application/World/Computer.ts', import.meta.url),
        'utf8',
    );
    const compiled = require('typescript').transpileModule(source, {
        compilerOptions: { module: require('typescript').ModuleKind.CommonJS },
    }).outputText;
    const exports = {};
    new Function('require', 'exports', compiled)(
        (name) =>
            name === '../Application'
                ? {
                      default: class {
                          constructor() {
                              return app;
                          }
                      },
                  }
                : name === './Layout'
                  ? layout
                  : name === '../Utils/Occlusion'
                    ? { occluded: () => false }
                    : // Calibration is checked on the named parts, unmerged
                      // (the merge has its own test above).
                      name === '../Utils/StaticBatch'
                      ? { mergeModel: () => ({ before: 0, after: 0 }) }
                      : require(name),
        exports,
    );
    const computer = new exports.default();
    const lid = app.scene.getObjectByName('VCQqxpxkUlzqcJI_62');
    const bounds = (object = lid) => {
        object.updateWorldMatrix(true, true);
        const box = new THREE.Box3(),
            point = new THREE.Vector3();
        object.traverse((part) => {
            if (!part.isMesh) return;
            const position = part.geometry.getAttribute('position');
            const divisor = position.normalized
                ? position.array instanceof Int16Array
                    ? 32767
                    : 65535
                : 1;
            for (let i = 0; i < position.count; i++)
                box.expandByPoint(
                    point
                        .fromBufferAttribute(position, i)
                        .divideScalar(divisor)
                        .applyMatrix4(part.matrixWorld),
                );
        });
        return box;
    };
    computer.update();
    const closed = bounds();
    const shell = app.scene.getObjectByName('Object_103');
    const chassis = bounds(app.scene.getObjectByName('Object_68'));
    const shellBounds = bounds(shell);
    for (const edge of ['min', 'max']) {
        for (const axis of ['x', 'z'])
            assert.ok(
                Math.abs(shellBounds[edge][axis] - chassis[edge][axis]) < 3,
                `closed lid ${edge}.${axis} must align with the chassis`,
            );
    }
    const panel = new THREE.Vector3().setFromMatrixPosition(
        computer.screenAnchor.matrixWorld,
    );
    const keyTops = bounds(app.scene.getObjectByName('Object_76'));
    assert.ok(
        panel.y - keyTops.max.y > 0.5 && panel.y - keyTops.max.y < 3,
        'closed display must clear the keys without floating above them',
    );
    assert.equal(computer.openness, 0);
    assert.equal(
        computer.screenGlow.intensity,
        0,
        'closed laptop casts no screen light',
    );
    assert.ok(closed.max.y - closed.min.y < 160, 'closed lid must be flat');

    // A far desk/portrait camera previously stranded the lid at 47% open.
    for (const key of ['desk', 'monitor']) {
        for (const z of [2600, 10000, 24000]) {
            app.camera.currentKeyframe = 'idle';
            for (let i = 0; i < 180; i++) computer.update();
            app.camera.currentKeyframe = key;
            app.camera.position.set(-350, 2400, z);
            for (let i = 0; i < 180; i++) computer.update();
            assert.equal(
                computer.openness,
                1,
                `${key} at distance ${z} must fully open`,
            );
            assert.equal(
                computer.hinge.rotation.x,
                0,
                'fully open must reach the authored 110-degree pose',
            );
        }
    }
    assert.ok(
        bounds().max.y - bounds().min.y > 1500,
        'open display must stand above the hinge',
    );
    const openPanel = new THREE.Vector3().setFromMatrixPosition(
        computer.screenAnchor.matrixWorld,
    );
    assert.ok(
        Math.abs(openPanel.x + 350) < 1 &&
            Math.abs(openPanel.y - 446) < 5 &&
            Math.abs(openPanel.z + 734 - layout.DESK_Z) < 5,
        'desktop must register to the imported panel',
    );
    app.camera.currentKeyframe = 'idle';
    for (let i = 0; i < 12; i++) computer.update();
    assert.ok(computer.openness > 0 && computer.openness < 1);
    app.camera.currentKeyframe = 'monitor';
    for (let i = 0; i < 180; i++) computer.update();
    assert.equal(
        computer.openness,
        1,
        'interrupting closure must still fully reopen',
    );
    app.reducedMotion.matches = true;
    app.camera.currentKeyframe = 'idle';
    computer.update();
    assert.equal(computer.openness, 0);
    app.camera.currentKeyframe = 'monitor';
    computer.update();
    assert.equal(computer.openness, 1);
    assert.ok(
        computer.screenGlow.intensity > 1,
        'open display lights the desk',
    );

    const classes = new Set();
    const label = {
        style: {},
        hidden: true,
        classList: {
            toggle: (name, on) =>
                on ? classes.add(name) : classes.delete(name),
        },
    };
    document.getElementById = (id) => (id === 'laptop-label' ? label : null);
    globalThis.innerWidth = 1280;
    globalThis.innerHeight = 720;
    app.camera.instance = new THREE.PerspectiveCamera(
        44,
        1280 / 720,
        100,
        900000,
    );
    app.camera.instance.position.set(-350, 2400, 10000);
    app.camera.instance.lookAt(-350, 300, 480);
    app.camera.instance.updateMatrixWorld();
    for (const key of ['idle', 'desk', 'monitor']) {
        app.camera.currentKeyframe = key;
        app.camera.targetKeyframe = undefined;
        computer.update();
        assert.equal(
            label.hidden,
            key !== 'idle',
            `invitation visibility at ${key}`,
        );
    }
    app.camera.currentKeyframe = undefined;
    for (const key of ['desk', 'monitor']) {
        app.camera.targetKeyframe = key;
        computer.update();
        assert.equal(
            label.hidden,
            true,
            `invitation hidden while approaching ${key}`,
        );
    }
    app.reducedMotion.matches = false;
    app.camera.targetKeyframe = 'idle';
    computer.update();
    assert.equal(
        label.hidden,
        true,
        'invitation stays hidden while the laptop closes',
    );
    for (let i = 0; i < 180; i++) computer.update();
    assert.equal(
        label.hidden,
        false,
        'invitation returns to the closed laptop in the room',
    );
});

test('until the Mac is first opened, the desk glows and its label pulses; after, never again', async () => {
    const storage = {};
    globalThis.localStorage = {
        getItem: (k) => storage[k] ?? null,
        setItem: (k, v) => (storage[k] = String(v)),
    };
    const classes = new Set();
    const label = {
        style: {},
        hidden: true,
        classList: {
            toggle: (name, on) =>
                on ? classes.add(name) : classes.delete(name),
        },
    };
    globalThis.document = {
        getElementById: (id) => (id === 'laptop-label' ? label : null),
        createElement: () => ({ getContext: () => null }),
    };
    globalThis.innerWidth = 1280;
    globalThis.innerHeight = 720;
    const build = async () => {
        const app = {
            resources: {
                items: { gltfModel: { macbookModel: await geometry() } },
            },
            scene: new THREE.Scene(),
            reducedMotion: { matches: false },
            time: { delta: 16, elapsed: 0 },
            camera: { currentKeyframe: 'idle' },
        };
        app.camera.instance = new THREE.PerspectiveCamera(44, 16 / 9, 100, 9e5);
        app.camera.instance.position.set(-350, 2400, 10000);
        app.camera.instance.lookAt(-350, 300, 480);
        app.camera.instance.updateMatrixWorld();
        const Computer = loadTs('../src/Application/World/Computer.ts', {
            '../Application': {
                default: class {
                    constructor() {
                        return app;
                    }
                },
            },
            './Layout': layout,
            '../Utils/Occlusion': { occluded: () => false },
            '../Utils/StaticBatch': {
                mergeModel: () => ({ before: 0, after: 0 }),
            },
        });
        return {
            app,
            computer: new Computer.default(),
            OPENED_KEY: Computer.OPENED_KEY,
        };
    };
    const first = await build();
    const glow = first.app.scene.getObjectByName('MacBook first-visit glow');
    assert.ok(glow, 'a first visit gets the glow');
    first.computer.update();
    assert.ok(classes.has('beckon'), 'and the pulsing label');
    const opacities = new Set();
    for (const elapsed of [0, 700, 1500, 2200]) {
        first.app.time.elapsed = elapsed;
        first.computer.update();
        opacities.add(glow.material.opacity.toFixed(2));
    }
    assert.ok(opacities.size > 2, 'it breathes');
    assert.ok(
        [...opacities].every((o) => o >= 0.3 && o <= 0.9),
        'softly',
    );
    first.app.reducedMotion.matches = true;
    first.computer.update();
    const still = glow.material.opacity;
    first.app.time.elapsed = 900;
    first.computer.update();
    assert.equal(glow.material.opacity, still, 'steady for reduced motion');
    assert.equal(
        glow.raycast(new THREE.Raycaster(), []),
        undefined,
        'never catches clicks meant for the desk',
    );

    first.app.camera.currentKeyframe = 'monitor';
    first.computer.update();
    assert.equal(
        first.app.scene.getObjectByName('MacBook first-visit glow'),
        undefined,
        'opening the Mac ends it',
    );
    assert.equal(storage[first.OPENED_KEY], '1', 'and remembers');
    assert.ok(!classes.has('beckon'));

    const later = await build();
    assert.equal(
        later.app.scene.getObjectByName('MacBook first-visit glow'),
        undefined,
        'a returning visitor is not beckoned',
    );
    later.computer.update();
    assert.ok(!classes.has('beckon'));
    delete globalThis.localStorage;
});
