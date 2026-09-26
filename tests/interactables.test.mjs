import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
const require = createRequire(import.meta.url);

test('room objects open their apps; hidden records count once and persist', () => {
    const listeners = {};
    const events = [];
    const storage = {};
    globalThis.localStorage = {
        getItem: (k) => storage[k] ?? null,
        setItem: (k, v) => (storage[k] = v),
    };
    const label = { style: {} };
    globalThis.document = {
        createElement: () => label,
        body: { append() {}, classList: { toggle() {} } },
        querySelector: () => null,
        addEventListener: (type, fn) => (listeners[type] = fn),
    };
    globalThis.innerWidth = 1000;
    globalThis.innerHeight = 1000;

    const scene = new THREE.Scene();
    const room = new THREE.Group();
    room.name = 'Nihar’s Barça den';
    const make = (name, z) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(200, 200, 10));
        mesh.name = name;
        mesh.position.set(0, 0, z);
        room.add(mesh);
        return mesh;
    };
    const turntable = make('Walnut record player', 0);
    scene.add(room);
    scene.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 5000);
    camera.position.set(0, 0, 1000);
    camera.updateMatrixWorld(true);
    const picked = [];
    const app = {
        scene,
        camera: {
            instance: camera,
            currentKeyframe: 'idle',
            trigger: (name, args) => events.push([name, ...args]),
        },
        world: {
            audioManager: { album: { playAlbum: (a) => picked.push(a) } },
        },
    };
    const exports = {};
    const ts = require('typescript');
    new Function(
        'require',
        'exports',
        ts.transpileModule(
            fs.readFileSync(
                new URL(
                    '../src/Application/World/Interactables.ts',
                    import.meta.url,
                ),
                'utf8',
            ),
            { compilerOptions: { module: ts.ModuleKind.CommonJS } },
        ).outputText,
    )((name) => {
        if (name === 'three') return THREE;
        if (name === '../Application')
            return {
                default: class {
                    constructor() {
                        return app;
                    }
                },
            };
        if (name === '../UI/EventBus')
            return { default: { dispatch: (n, d) => events.push([n, d]) } };
        return require(name);
    }, exports);

    const interact = new exports.default(room);
    const centre = {
        clientX: 500,
        clientY: 500,
        target: {},
        preventDefault() {},
    };
    listeners.pointermove(centre);
    assert.equal(label.hidden, false);
    assert.equal(label.textContent, 'Music');
    listeners.pointerdown(centre);
    listeners.pointerup({ ...centre, clientX: 560 });
    assert.equal(
        events.length,
        1,
        'a drag that starts on an object never opens it',
    );
    listeners.pointerdown(centre);
    listeners.pointerup(centre);
    assert.deepEqual(
        events.at(-1),
        ['enterMonitor', 'music', undefined],
        'a click on the turntable opens Music',
    );
    const tap = { ...centre, pointerType: 'touch' };
    const before = events.length;
    listeners.pointerdown(tap);
    listeners.pointerup(tap);
    assert.equal(events.length, before, 'first tap only shows the label');
    assert.equal(label.textContent, 'Music · tap again');
    listeners.pointerdown(tap);
    listeners.pointerup(tap);
    assert.deepEqual(
        events.at(-1),
        ['enterMonitor', 'music', undefined],
        'second tap opens it',
    );

    // Petting Begu acts on the first tap too: there is nothing to preview.
    let pets = 0;
    const dog = make('Begu', 0);
    dog.position.z = 100;
    scene.updateMatrixWorld(true);
    interact.add(dog, () => ({
        label: 'Pet Begu',
        run: () => pets++,
        instant: true,
    }));
    listeners.pointerdown(tap);
    listeners.pointerup(tap);
    assert.equal(pets, 1, 'one tap pets him');
    dog.removeFromParent();
    scene.updateMatrixWorld(true);

    app.camera.currentKeyframe = 'monitor';
    listeners.pointermove(centre);
    assert.equal(label.hidden, true, 'no room hover while using the Mac');
    app.camera.currentKeyframe = 'idle';

    turntable.name = 'x';
    interact.sleeves = 11;
    interact.find('graduation');
    interact.find('graduation');
    assert.deepEqual(
        picked,
        ['graduation', 'graduation'],
        'a found record plays its album',
    );
    assert.equal(interact.found.size, 1, 'each record counts once');
    assert.deepEqual(
        JSON.parse(storage[exports.FOUND_KEY]),
        ['graduation'],
        'progress persists',
    );
    assert.deepEqual(events.at(-1), ['recordsFound', { found: 1, total: 11 }]);
});
