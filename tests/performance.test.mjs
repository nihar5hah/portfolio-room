import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
const require = createRequire(import.meta.url);
const ts = require('typescript');

function load(file) {
    const exports = {};
    new Function(
        'require',
        'exports',
        ts.transpileModule(
            fs.readFileSync(
                new URL(`../src/Application/${file}`, import.meta.url),
                'utf8',
            ),
            {
                compilerOptions: {
                    module: ts.ModuleKind.CommonJS,
                    target: ts.ScriptTarget.ES2022,
                },
            },
        ).outputText,
    )((name) => (name === 'three' ? THREE : require(name)), exports);
    return exports;
}

const device = (over) => ({
    touch: false,
    screen: 1440,
    devicePixelRatio: 2,
    webgl2: true,
    ...over,
});

test('the starting tier fits the device: budget phones low, phones and laptops medium, strong desktops high', () => {
    const { detectTier } = load('Utils/Quality.ts');
    const cases = [
        // Budget Android: Mali-G52, 4 cores, 3 GB.
        [
            {
                touch: true,
                screen: 393,
                cores: 4,
                memory: 3,
                gpu: 'Mali-G52 MC2',
            },
            'low',
        ],
        // 2 GB of memory, whatever the GPU.
        [{ touch: true, screen: 400, cores: 8, memory: 2 }, 'low'],
        [{ gpu: 'Google SwiftShader' }, 'low'],
        [{ saveData: true, gpu: 'Apple M4' }, 'low'],
        [{ webgl2: false }, 'low'],
        // Mid-range Android: Adreno 640, 8 cores.
        [
            {
                touch: true,
                screen: 412,
                cores: 8,
                memory: 8,
                gpu: 'Adreno (TM) 640',
            },
            'medium',
        ],
        // iPhone: masked GPU, no deviceMemory.
        [{ touch: true, screen: 390, cores: 6, gpu: 'Apple GPU' }, 'medium'],
        // Laptop on integrated Intel graphics.
        [
            {
                cores: 8,
                memory: 8,
                gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)',
            },
            'medium',
        ],
        [
            {
                cores: 10,
                memory: 16,
                gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)',
            },
            'high',
        ],
        [
            {
                cores: 16,
                memory: 32,
                gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)',
            },
            'high',
        ],
    ];
    for (const [info, tier] of cases)
        assert.equal(detectTier(device(info)), tier, JSON.stringify(info));
});

test('each tier trades resolution, shadows, lights and effects', () => {
    const { settingsFor } = load('Utils/Quality.ts');
    const phone = device({ touch: true, screen: 390, devicePixelRatio: 3 });
    const low = settingsFor('low', phone);
    assert.equal(low.antialias, false);
    assert.ok(low.maxPixelRatio <= 1 && low.minPixelRatio < low.maxPixelRatio);
    assert.equal(low.shadowInterval, 0, 'shadows drawn once and kept');
    assert.equal(low.dynamicShadows, false);
    assert.equal(low.lights, 'minimal');
    assert.equal(low.grain, false);
    assert.equal(low.preloadDesktop, false);
    const medium = settingsFor('medium', phone);
    assert.ok(medium.maxPixelRatio <= 1.25);
    assert.equal(medium.lights, 'key');
    const high = settingsFor('high', device({ devicePixelRatio: 2 }));
    assert.equal(high.antialias, true);
    assert.equal(high.lights, 'all');
    assert.ok(high.shadowMapSize >= low.shadowMapSize);
    // Never above the screen's own density.
    assert.equal(
        settingsFor('high', device({ devicePixelRatio: 1 })).maxPixelRatio,
        1,
    );
});

test('the governor lowers resolution first, then the tier, and recovers slowly', () => {
    const { Governor, settingsFor } = load('Utils/Quality.ts');
    const settings = settingsFor('high', device({ devicePixelRatio: 2 }));
    const governor = new Governor(settings.maxPixelRatio, settings);
    const run = (ms, seconds) => {
        const changes = [];
        for (let t = 0; t < seconds * 1000; t += ms) {
            const change = governor.frame(ms);
            if (change) changes.push(change);
        }
        return changes;
    };
    // Hitches and tab switches are not load.
    assert.deepEqual(run(400, 20), []);
    const slow = run(40, 30);
    const ratios = slow.filter((c) => c.pixelRatio).map((c) => c.pixelRatio);
    assert.ok(ratios.length >= 2, 'steps resolution down');
    for (let i = 1; i < ratios.length; i++)
        assert.ok(ratios[i] < ratios[i - 1]);
    assert.equal(ratios.at(-1), settings.minPixelRatio);
    assert.ok(
        slow.findIndex((c) => c.tier) > slow.findIndex((c) => c.pixelRatio),
        'only then asks for a lower tier',
    );
    // A fast device: up again, but only after several good windows.
    governor.retier(settings);
    const before = governor.pixelRatio;
    assert.deepEqual(run(10, 5), [], 'no instant see-saw');
    const up = run(10, 30);
    assert.ok(up.length && governor.pixelRatio > before);
    assert.ok(governor.pixelRatio <= settings.maxPixelRatio);
    // Steady 60 fps: nothing changes.
    governor.retier(settings);
    governor.pixelRatio = settings.maxPixelRatio;
    assert.deepEqual(run(16.7, 20), []);
});

test('quality honours ?quality=, reports changes and never drops below low', () => {
    const { default: Quality } = load('Utils/Quality.ts');
    const strong = device({ cores: 16, memory: 32, gpu: 'NVIDIA GeForce' });
    const forced = new Quality(strong, '?quality=low');
    assert.equal(forced.tier, 'low');
    const q = new Quality(strong, '');
    assert.equal(q.tier, 'high');
    const seen = [];
    q.onChange((s) => seen.push(s.tier));
    for (let i = 0; i < 60 * 120; i++) q.frame(60);
    assert.ok(seen.includes('medium') && seen.includes('low'));
    assert.equal(q.tier, 'low');
    const pinned = new Quality(strong, '?quality=high');
    for (let i = 0; i < 60 * 60; i++) pinned.frame(60);
    assert.equal(pinned.tier, 'high', 'a forced tier stays put');
    assert.ok(pinned.pixelRatio < pinned.settings.maxPixelRatio);
});

test('static batching merges a group’s unnamed pieces per material and keeps everything else', () => {
    const { batchStatic } = load('Utils/StaticBatch.ts');
    const wood = new THREE.MeshStandardMaterial();
    const brass = new THREE.MeshStandardMaterial();
    const glass = new THREE.MeshStandardMaterial({ transparent: true });
    const room = new THREE.Group();
    const shelf = new THREE.Group();
    shelf.name = 'Bookshelf';
    shelf.position.set(1000, 0, 0);
    room.add(shelf);
    const box = (material, x, name = '') => {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(100, 20, 100),
            material,
        );
        mesh.position.set(x, 50, 0);
        mesh.castShadow = true;
        mesh.name = name;
        shelf.add(mesh);
        return mesh;
    };
    for (let i = 0; i < 5; i++) box(wood, i * 150);
    const label = box(wood, 900, 'Shelf label');
    box(brass, 1100);
    box(glass, 1300);
    box(glass, 1500);
    const mirrored = box(wood, 1700);
    mirrored.scale.x = -1;
    room.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(shelf);
    const result = batchStatic(room);
    assert.deepEqual(result, { merged: 5, batches: 1, saved: 4 });
    room.updateMatrixWorld(true);
    assert.equal(shelf.children.length, 6, '5 → 1, the rest untouched');
    assert.ok(shelf.children.includes(label), 'named pieces are kept');
    assert.ok(shelf.children.includes(mirrored), 'mirrored pieces are kept');
    const batch = shelf.children.find((c) => c.userData.batched === 5);
    assert.equal(batch.material, wood);
    assert.ok(batch.castShadow);
    assert.ok(
        new THREE.Box3().setFromObject(shelf).equals(bounds),
        'nothing moved',
    );
    // A click on a merged piece still lands in its group.
    const ray = new THREE.Raycaster(
        new THREE.Vector3(1000 + 300, 1000, 0),
        new THREE.Vector3(0, -1, 0),
    );
    const hit = ray.intersectObject(room, true)[0];
    assert.equal(hit.object, batch);
    assert.equal(hit.object.parent, shelf);
});
