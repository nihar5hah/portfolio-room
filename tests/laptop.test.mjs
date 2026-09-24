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

test('shipped MacBook closes above the base, opens with approach, and survives reversal/reduced motion', async () => {
    globalThis.document = { getElementById: () => null };
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

    const label = { style: {}, hidden: true };
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
