import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
const require = createRequire(import.meta.url);

const source = fs.readFileSync(
    new URL('../src/Application/Utils/Occlusion.ts', import.meta.url),
    'utf8',
);
const ts = require('typescript');
const exports = {};
new Function('require', 'exports', ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(require, exports);

test('floating labels hide only when something else blocks their object', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 1000);
    const dog = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100));
    scene.add(dog);
    scene.updateMatrixWorld(true);
    const point = new THREE.Vector3(0, 0, 0);
    assert.equal(exports.occluded(scene, camera, point, dog), false, 'its own mesh never hides it');

    const glass = new THREE.Mesh(
        new THREE.BoxGeometry(400, 400, 10),
        new THREE.MeshBasicMaterial({ transparent: true }),
    );
    glass.position.z = 500;
    scene.add(glass);
    scene.updateMatrixWorld(true);
    assert.equal(exports.occluded(scene, camera, point, dog), false, 'transparent surfaces do not hide it');

    const desk = new THREE.Mesh(new THREE.BoxGeometry(400, 400, 10));
    desk.position.z = 400;
    scene.add(desk);
    scene.updateMatrixWorld(true);
    assert.equal(exports.occluded(scene, camera, point, dog), true, 'furniture in between hides it');
});
