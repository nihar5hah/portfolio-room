import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
const require = createRequire(import.meta.url);
const ts = require('typescript');

// Room modules, transpiled by hand, with a recording event bus.
const events = [];
const handlers = {};
const bus = {
    on: (event, fn) => {
        (handlers[event] ??= []).push(fn);
        return () => {};
    },
    dispatch: (event, data) => {
        events.push([event, data]);
        handlers[event]?.forEach((fn) => fn(data));
    },
};
const cache = new Map();
function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    new Function(
        'require',
        'exports',
        ts.transpileModule(
            fs.readFileSync(
                new URL(
                    file.startsWith('../')
                        ? `../src/Application/${file.slice(3)}`
                        : `../src/Application/World/${file}`,
                    import.meta.url,
                ),
                'utf8',
            ),
            {
                compilerOptions: {
                    module: ts.ModuleKind.CommonJS,
                    target: ts.ScriptTarget.ES2022,
                },
            },
        ).outputText,
    )((name) => {
        if (name === 'three') return THREE;
        if (name.includes('EventBus')) return { default: bus };
        if (name.startsWith('./')) return load(`${name.slice(2)}.ts`);
        if (name.startsWith('../Utils/')) return load(`../${name.slice(3)}.ts`);
        return require(name);
    }, exports);
    return exports;
}
const ctx = new Proxy(
    {},
    {
        get: (target, key) =>
            key in target
                ? target[key]
                : key.startsWith('create')
                  ? () => ({ addColorStop() {} })
                  : () => {},
        set: (target, key, value) => ((target[key] = value), true),
    },
);
globalThis.document = {
    createElement: () => ({ getContext: () => ctx }),
    hidden: false,
};
const seeded = (seed) => () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/** A glb from static/models, geometry only (node cannot decode WebP). */
async function geometryOnly(path) {
    const { GLTFLoader } = await import(
        'three/examples/jsm/loaders/GLTFLoader.js'
    );
    const { MeshoptDecoder } = await import(
        'three/examples/jsm/libs/meshopt_decoder.module.js'
    );
    const bytes = fs.readFileSync(
        new URL(`../static/models/${path}`, import.meta.url),
    );
    const json = JSON.parse(
        new TextDecoder().decode(
            bytes.subarray(20, 20 + bytes.readUInt32LE(12)),
        ),
    );
    delete json.textures;
    delete json.images;
    for (const m of json.materials ?? []) {
        delete m.pbrMetallicRoughness?.baseColorTexture;
        delete m.normalTexture;
        delete m.occlusionTexture;
        delete m.emissiveTexture;
    }
    const text = new TextEncoder().encode(JSON.stringify(json));
    const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(32);
    padded.set(text);
    const bin = bytes.subarray(20 + bytes.readUInt32LE(12));
    const glb = new Uint8Array(20 + padded.length + bin.length);
    const view = new DataView(glb.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, glb.length, true);
    view.setUint32(12, padded.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    glb.set(padded, 20);
    glb.set(bin, 20 + padded.length);
    await MeshoptDecoder.ready;
    const gltf = await new Promise((resolve, reject) =>
        new GLTFLoader()
            .setMeshoptDecoder(MeshoptDecoder)
            .parse(glb.buffer, '', resolve, reject),
    );
    return gltf;
}

/** Does a straight-down ray at the object's centre hit it (a click)? */
function clickable(object) {
    object.updateMatrixWorld(true);
    const centre = new THREE.Box3()
        .setFromObject(object)
        .getCenter(new THREE.Vector3());
    const ray = new THREE.Raycaster(
        centre.clone().add(new THREE.Vector3(0, 5000, 0)),
        new THREE.Vector3(0, -1, 0),
    );
    return ray.intersectObject(object, true).length > 0;
}

test('Bangalore weather drives rain, cloud and storms, and the room eases into it', async () => {
    const { weatherOf, default: Weather } = load('Weather.ts');
    assert.equal(weatherOf('Clear').rain, 0);
    assert.ok(weatherOf('Drizzle').rain > 0 && weatherOf('Drizzle').rain < 0.5);
    assert.ok(weatherOf('Rain').rain > weatherOf('Drizzle').rain);
    const storm = weatherOf('Thunderstorm', 24);
    assert.ok(storm.storm && storm.rain === 1 && storm.overcast === 1);
    assert.ok(
        weatherOf('Cloudy').overcast > 0 && weatherOf('Cloudy').rain === 0,
    );

    const weather = new Weather(false);
    weather.set(storm);
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(events.at(-1), ['weather', storm], 'listeners hear it');
    assert.equal(weather.describe(), 'Bengaluru · 24° · Thunderstorm');
    let struck = 0,
        flashed = 0;
    const random = seeded(3);
    for (let t = 0; t < 120; t += 1 / 30) {
        struck += Number(weather.update(1 / 30, random));
        if (weather.flash > 0.5) flashed++;
    }
    assert.ok(weather.level.rain > 0.95, 'rain rolls in over seconds');
    assert.ok(
        struck >= 3 && struck <= 12,
        `lightning now and then (${struck})`,
    );
    assert.ok(flashed > 0 && flashed < 120, 'flashes are brief');
    weather.set(weatherOf('Clear'));
    for (let t = 0; t < 30; t += 1 / 30) weather.update(1 / 30, random);
    assert.equal(weather.level.rain, 0, 'and clears again');
});

test('the football rolls to its kick target, bounces off furniture and rolls when carried', async () => {
    const NavGrid = load('NavGrid.ts').default;
    const { default: Football, BALL_RADIUS } = load('Football.ts');
    const nav = new NavGrid(
        { minX: -10000, maxX: 10000, minZ: -10000, maxZ: 10000 },
        150,
        -3015,
    );
    nav.block({ minX: 3000, maxX: 4000, minZ: -9000, maxZ: 9000 }, BALL_RADIUS);
    const ball = new Football(nav, { x: 0, z: 0 });
    assert.equal(ball.group.position.y, -3015 + BALL_RADIUS, 'on the floor');
    const target = ball.target(
        { x: 0, z: 1 },
        seeded(9),
        () => true,
        4000,
        6000,
    );
    assert.ok(target && nav.clear(ball.position, target), 'a clear run');
    ball.kick(target);
    const start = ball.group.quaternion.clone();
    for (let t = 0; t < 10 && ball.speed > 0; t += 1 / 60) ball.update(1 / 60);
    assert.ok(
        Math.hypot(ball.position.x - target.x, ball.position.z - target.z) <
            150,
        'stops where it was aimed',
    );
    assert.ok(ball.group.quaternion.angleTo(start) > 0.1, 'it rolled');
    // Kicked hard at the wall of furniture: it comes back off it.
    ball.place({ x: 0, z: 0 });
    ball.kick({ x: 9000, z: 0 });
    let maxX = 0;
    for (let t = 0; t < 10 && ball.speed > 0; t += 1 / 60) {
        ball.update(1 / 60);
        maxX = Math.max(maxX, ball.position.x);
        assert.ok(nav.free(ball.position.x, ball.position.z));
    }
    assert.ok(maxX < 3000 - BALL_RADIUS + 150, 'never inside the furniture');
    assert.ok(ball.position.x < maxX - 100, 'bounced back');
    // Boxed in against furniture (the chair and a desk leg): a click still
    // moves it, a shorter kick or along its one open line.
    const tight = new NavGrid(
        { minX: -3000, maxX: 3000, minZ: -3000, maxZ: 3000 },
        150,
        -3015,
    );
    tight.block({ minX: -3000, maxX: 3000, minZ: 250, maxZ: 3000 });
    tight.block({ minX: -3000, maxX: -300, minZ: -3000, maxZ: 3000 });
    tight.block({ minX: 300, maxX: 3000, minZ: -3000, maxZ: 3000 });
    const stuck = new Football(tight, { x: 0, z: 100 });
    const out = stuck.target({ x: 0, z: 1 }, seeded(4));
    assert.ok(out && out.z < -500, 'kicked down its one open lane');
    stuck.kick(out);
    for (let t = 0; t < 10 && stuck.speed > 0; t += 1 / 60)
        stuck.update(1 / 60);
    assert.ok(stuck.position.z < -300, 'and it rolled');
    // The Brazuca scan: sized to a real ball, and clickable (to kick it).
    const brazuca = await geometryOnly('Football/brazuca.glb');
    const scan = new Football(
        nav,
        { x: -2000, z: 0 },
        undefined,
        brazuca.scene,
    );
    const size = new THREE.Box3()
        .setFromObject(scan.group, true)
        .getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x - 2 * BALL_RADIUS) < 10, '22 cm across');
    assert.ok(clickable(scan.group), 'clicking the ball hits it');
    ball.carry({ x: ball.position.x - 500, z: 0 });
    assert.ok(ball.carried);
    ball.update(1);
    ball.drop(300, 0);
    assert.ok(!ball.carried && ball.speed === 300);
});

test('the wall clock shows Bangalore time and the lamps switch on and off by hand', () => {
    const { wallClock } = load('Fixtures.ts');
    const clock = wallClock(700);
    const angle = (pivot) =>
        (((-pivot.rotation.z / (Math.PI * 2)) % 1) + 1) % 1;
    clock.set(20.5); // 8:30 pm
    assert.ok(Math.abs(angle(clock.hands.hours) - 8.5 / 12) < 1e-6);
    assert.ok(Math.abs(angle(clock.hands.minutes) - 0.5) < 1e-6);
    clock.set(15 + 45 / 3600 + 0.5 / 3600); // 3:00:45.5
    assert.ok(Math.abs(angle(clock.hands.seconds) - 45 / 60) < 1e-6);

    // Lamp switches: a click flips what the lamp is doing right now.
    const environment = {
        switches: {
            floorLamp: { manual: null, level: 1 },
            deskLamp: { manual: null, level: 0 },
        },
    };
    const source = fs.readFileSync(
        new URL('../src/Application/World/Environment.ts', import.meta.url),
        'utf8',
    );
    const method = (name) => {
        const body = source.slice(source.indexOf(`    ${name}(lamp`));
        const code = ts.transpileModule(
            `const o = { ${body.slice(0, body.indexOf('\n    }\n') + 6)} }; o;`,
            { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
        ).outputText;
        return eval(code)[name];
    };
    const lampOn = method('lampOn').bind(environment);
    environment.lampOn = lampOn;
    const toggle = method('toggleLamp').bind(environment);
    assert.equal(lampOn('floorLamp'), true, 'on after dark');
    assert.equal(toggle('floorLamp'), false, 'click: off');
    assert.equal(toggle('floorLamp'), true, 'click again: on');
    assert.equal(lampOn('deskLamp'), false);
    assert.equal(toggle('deskLamp'), true, 'switched on in daylight');
});

test('finding every record puts up a gold record and the Graduation Bear', async () => {
    const { default: RecordsReward } = load('Reward.ts');
    const gltf = await geometryOnly('Bear/dropout-bear.glb');
    const names = [];
    gltf.scene.traverse((o) => names.push(o.name));
    for (const part of ['Head', 'glasses', 'Jacket', 'shoes'])
        assert.ok(
            names.some((n) => n.startsWith(part)),
            `the model has its ${part}`,
        );

    const room = new THREE.Group();
    const shown = [];
    const reward = new RecordsReward(
        room,
        3,
        11,
        (p, b) => shown.push(p, b),
        gltf.scene,
    );
    assert.equal(room.children.length, 0, 'nothing until they are all found');
    bus.dispatch('recordsFound', { found: 10, total: 11 });
    assert.equal(room.children.length, 0);
    bus.dispatch('recordsFound', { found: 11, total: 11 });
    assert.deepEqual(
        room.children.map((c) => c.name),
        ['Gold record', 'Graduation Bear'],
    );
    assert.ok(
        events.some(([e]) => e === 'recordsComplete'),
        'the room says so',
    );
    assert.equal(shown.length, 2, 'both become clickable');
    assert.ok(reward.plaque.scale.x < 0.01, 'it animates in');
    for (let i = 0; i < 60; i++) reward.update(1 / 60, false);
    assert.equal(reward.plaque.scale.x, 1);
    assert.equal(reward.bear.scale.x, 1);
    reward.bear.updateMatrixWorld(true);
    // The plush itself (not the shades' halo sprite).
    const bear = new THREE.Box3();
    reward.bear.traverse((o) => o.isMesh && bear.expandByObject(o, true));
    assert.ok(Math.abs(bear.min.y - (-3015 + 965)) < 5, 'sits on the bench');
    const size = bear.getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.y - 1150) < 5, 'plush sized (about 35 cm)');
    // The packed model's integer vertices are unpacked, so a click lands.
    assert.ok(clickable(reward.bear), 'clicking the bear hits him');
    // Clicking him lights his shutter shades (and only them); again, off.
    const shades = reward.bear.getObjectByName('glasses');
    let sharing = 0;
    reward.bear.traverse((o) => {
        if (o.isMesh && o !== shades && o.material === shades.material)
            sharing++;
    });
    assert.equal(sharing, 0, 'the glow is on the shades alone');
    assert.equal(shades.material.emissiveIntensity, 0);
    assert.equal(reward.toggleGlow(), true);
    for (let i = 0; i < 30; i++) reward.update(1 / 30, false);
    assert.ok(shades.material.emissiveIntensity > 1, 'the shades light up');
    assert.ok(reward.glow.halo.visible, 'with a halo');
    const lit = shades.material.emissive.clone();
    for (let i = 0; i < 45; i++) reward.update(1 / 30, false);
    assert.ok(
        !shades.material.emissive.equals(lit),
        'drifting through colours',
    );
    assert.ok(!clickable(reward.glow.halo), 'the halo never takes a click');
    assert.equal(reward.toggleGlow(), false);
    for (let i = 0; i < 30; i++) reward.update(1 / 30, false);
    assert.equal(shades.material.emissiveIntensity, 0, 'and go out');
    assert.equal(reward.glow.halo.visible, false);
    // A returning visitor with all eleven already found: there straight away.
    const again = new RecordsReward(new THREE.Group(), 11, 11, () => {});
    assert.equal(again.plaque.scale.x, 1);
    assert.equal(again.bear, null, 'no model, no bear (never a stand-in)');
    bus.dispatch('recordsFound', { found: 11, total: 11 });
    assert.equal(
        events.filter(([e]) => e === 'recordsComplete').length,
        1,
        'celebrated once',
    );
});
