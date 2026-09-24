import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as geometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import layout from './layout.mjs';
const require = createRequire(import.meta.url);

async function loadDog() {
    const bytes = fs.readFileSync(
        new URL('../static/models/Begu/husky.glb', import.meta.url),
    );
    const gltf = await new Promise((resolve, reject) =>
        new GLTFLoader().parse(
            bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.length,
            ),
            '',
            resolve,
            reject,
        ),
    );
    const source = fs.readFileSync(
        new URL('../src/Application/World/Husky.ts', import.meta.url),
        'utf8',
    );
    const compiled = require('typescript').transpileModule(source, {
        compilerOptions: { module: require('typescript').ModuleKind.CommonJS },
    }).outputText;
    const exports = {};
    new Function('require', 'exports', compiled)(
        (name) =>
            name === 'three' ? THREE : name === './Layout' ? layout : geometryUtils,
        exports,
    );
    const authored = new Map();
    gltf.scene.traverse((part) => {
        if (!part.isMesh) return;
        const points = part.geometry.attributes.position;
        const vertices = new Set();
        for (let i = 0; i < points.count; i++)
            vertices.add(
                [points.getX(i), points.getY(i), points.getZ(i)].join(','),
            );
        authored.set(part.name, vertices);
    });
    const dog = new exports.default(gltf);
    return { gltf, dog, authored };
}

test('Begu preserves the authored coat and tail mesh without splitting bone boundaries', async () => {
    const { gltf, authored } = await loadDog();
    let displaced = 0;
    gltf.scene.traverse((part) => {
        if (!part.isMesh) return;
        const points = part.geometry.attributes.position;
        for (let i = 0; i < points.count; i++)
            if (
                !authored
                    .get(part.name)
                    .has(
                        [points.getX(i), points.getY(i), points.getZ(i)].join(
                            ',',
                        ),
                    )
            )
                displaced++;
    });
    assert.equal(
        displaced,
        0,
        'coat and tail vertices must stay attached to their authored rig',
    );
});

test('Begu walks with his skeleton, stays clear of furniture, greets once and respects reduced motion', async () => {
    const { gltf, dog } = await loadDog();
    assert.ok(gltf.scene.getObjectByProperty('isSkinnedMesh', true));
    for (const clip of ['Walk', 'Idle_2', 'Idle_2_HeadLow', 'Jump_ToIdle'])
        assert.ok(dog.actions[clip]);
    const start = dog.group.position.clone();
    const head = gltf.scene.getObjectByName('Head');
    const headStart = head.quaternion.clone();
    for (let i = 0; i < 640; i++) {
        dog.update(1 / 60, false);
        assert.equal(dog.group.position.y, dog.floor);
        assert.ok(
            dog.group.position.x >= -4001 && dog.group.position.x <= -1199,
        );
        const { DESK_Z } = layout;
        assert.ok(
            dog.group.position.z >= 2799 + DESK_Z &&
                dog.group.position.z <= 4201 + DESK_Z,
        );
    }
    assert.equal(dog.current.getClip().name, 'Walk');
    assert.ok(start.distanceTo(dog.group.position) > 500);
    assert.ok(
        head.quaternion.angleTo(headStart) > 0.01,
        'walk must animate the bones',
    );
    const still = dog.group.position.clone(),
        pose = head.quaternion.clone();
    for (let i = 0; i < 180; i++) dog.update(1 / 60, true);
    assert.deepEqual(dog.group.position, still);
    assert.deepEqual(head.quaternion.toArray(), pose.toArray());
    dog.greet(new THREE.Vector3(0, 5000, 12000), false);
    assert.equal(dog.current.getClip().name, 'Jump_ToIdle');
    let opened = 0;
    for (let i = 0; i < 300; i++) opened += Number(dog.update(1 / 60, false));
    assert.equal(opened, 1, 'one click must produce one chat-opening event');
    dog.greet(new THREE.Vector3(0, 5000, 12000), true);
    assert.equal(dog.update(1 / 60, true), true);
    assert.equal(dog.update(1 / 60, true), false);
});
