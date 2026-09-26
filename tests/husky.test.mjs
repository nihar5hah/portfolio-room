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
            name === 'three'
                ? THREE
                : name === './Layout'
                  ? layout
                  : geometryUtils,
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

function loadNav() {
    const ts = require('typescript');
    const exports = {};
    new Function(
        'require',
        'exports',
        ts.transpileModule(
            fs.readFileSync(
                new URL('../src/Application/World/NavGrid.ts', import.meta.url),
                'utf8',
            ),
            { compilerOptions: { module: ts.ModuleKind.CommonJS } },
        ).outputText,
    )(require, exports);
    return exports.default;
}

test('Begu roams, naps in his bed, eats, does rare tricks, loves being petted and sleeps at Good Night', async () => {
    const { dog } = await loadDog();
    const NavGrid = loadNav();
    const FLOOR = -3015;
    const nav = new NavGrid(
        { minX: -8000, maxX: 8000, minZ: -8000, maxZ: 8000 },
        150,
        FLOOR,
    );
    // A sofa in the middle of the room.
    nav.block({ minX: -2000, maxX: 2000, minZ: -1000, maxZ: 1000 }, 380);
    const bed = { x: -6000, z: -6000 };
    nav.surface(
        { minX: -6600, maxX: -5400, minZ: -6600, maxZ: -5400 },
        FLOOR + 230,
    );
    dog.nav = nav;
    dog.spots = {
        bed,
        bowl: { x: 6000, z: -6000 },
        haunts: [
            { x: 5000, z: 5000 },
            { x: -5000, z: 5000 },
            { x: 0, z: -5000 },
        ],
        looks: [null, null, null],
        shoes: { x: 4000, z: 0 },
        window: { stand: { x: -7000, z: 0 }, look: { x: -8000, z: 0 } },
        door: { stand: { x: 7000, z: 0 }, look: { x: 8000, z: 0 } },
    };
    let seed = 7;
    dog.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    dog.group.position.set(0, FLOOR, 5000);
    const moods = new Set();
    const clips = new Set();
    let inFurniture = 0;
    for (let i = 0; i < 20 * 600; i++) {
        dog.update(1 / 20, false);
        const p = dog.group.position;
        if (!nav.free(p.x, p.z) && !dog.lying) {
            inFurniture++;
        }
        moods.add(dog.mood);
        clips.add(dog.current.getClip().name);
    }
    assert.equal(inFurniture, 0, 'never walks through furniture');
    for (const mood of ['wandering', 'idle']) assert.ok(moods.has(mood), mood);
    assert.ok(clips.has('Walk'));
    // Each routine plays through to the end.
    const finish = (start, limit = 120) => {
        dog.interrupt(false);
        dog.lying = dog.asleep = false;
        start();
        const seen = new Set();
        for (
            let t = 0;
            t < limit && (dog.queue.length || dog.step);
            t += 1 / 20
        ) {
            dog.update(1 / 20, false);
            if (dog.step)
                seen.add(
                    dog.step.kind + (dog.step.clip ? ':' + dog.step.clip : ''),
                );
        }
        return seen;
    };
    const eating = finish(() => dog.eat());
    assert.ok(eating.has('pose:Eating'), 'eats from his bowl');
    const bowl = dog.spots.bowl;
    assert.ok(
        Math.hypot(
            dog.group.position.x - bowl.x,
            dog.group.position.z - bowl.z,
        ) < 1200,
        'standing at the bowl',
    );
    const nap = finish(() => dog.goToBed(3));
    assert.ok(
        nap.has('lie') && nap.has('spin') && nap.has('rise'),
        'turns, lies down, gets up',
    );
    assert.ok(
        Math.hypot(dog.group.position.x - bed.x, dog.group.position.z - bed.z) <
            200,
        'in his bed',
    );
    assert.ok(dog.group.position.y > FLOOR + 150, 'up on the cushion');
    for (const [name, start, clip] of [
        ['zoomies', () => dog.zoomies(), 'pose:Gallop_Jump'],
        ['tail chase', () => dog.chaseTail(), 'spin'],
        ['play dead', () => dog.playDead(), 'lie'],
        ['shoe pounce', () => dog.pounceShoes(), 'pose:Attack'],
        ['window', () => dog.watchWindow(), 'pose:Idle'],
        ['door', () => dog.waitAtDoor(), 'pose:Idle'],
    ])
        assert.ok(finish(start).has(clip), `${name} plays`);
    assert.equal(dog.lying, false, 'back on his feet after playing dead');
    // Petting: tail wags and he leans in; five pets in a row set off zoomies.
    const camera = new THREE.Vector3(0, 5000, 12000);
    const tail = dog.tail[1];
    const before = tail.quaternion.clone();
    assert.equal(dog.pet(camera, false), 'lean');
    dog.update(1 / 20, false);
    dog.update(1 / 20, false);
    assert.ok(tail.quaternion.angleTo(before) > 0.01, 'tail wags');
    assert.ok(dog.petting > 0);
    for (let i = 0; i < 3; i++) dog.pet(camera, false);
    assert.equal(dog.pet(camera, false), 'zoomies', 'five quick pets: zoomies');
    // Good Night: he goes to bed and stays asleep; petting him there only
    // gets a sleepy wag; morning gets him up.
    dog.goodNight(true);
    for (let t = 0; t < 60 && !dog.asleep; t += 1 / 20)
        dog.update(1 / 20, false);
    assert.ok(dog.asleep && dog.lying, 'asleep at Good Night');
    assert.ok(
        Math.hypot(dog.group.position.x - bed.x, dog.group.position.z - bed.z) <
            200,
    );
    assert.equal(dog.pet(camera, false), 'sleepy');
    for (let t = 0; t < 30; t += 1 / 20) dog.update(1 / 20, false);
    assert.ok(dog.asleep, 'stays asleep until the room wakes');
    dog.hop(false);
    assert.ok(dog.lying, 'music does not make him hop out of bed');
    dog.goodNight(false);
    for (let t = 0; t < 3; t += 1 / 20) dog.update(1 / 20, false);
    assert.ok(!dog.lying && !dog.asleep, 'up in the morning');
    // Chat still opens from his name label, once.
    dog.greet(camera, false);
    let opened = 0;
    for (let i = 0; i < 300; i++) opened += Number(dog.update(1 / 60, false));
    assert.equal(opened, 1);
});
