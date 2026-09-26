import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import layout, { world } from './layout.mjs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const require = createRequire(import.meta.url);

// The shipped Dune GLB (geometry only; Meshopt-compressed, quantized).
// The shipped Poly Haven lounge props, geometry only: Node cannot decode
// their WebP textures, so images and texture references are dropped.
async function texturelessModel(file) {
    const bytes = fs.readFileSync(
        new URL(`../static/models/${file}`, import.meta.url),
    );
    const length = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.subarray(20, 20 + length));
    json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + length).toString('base64')}`;
    for (const key of ['images', 'textures', 'samplers']) delete json[key];
    for (const key of ['extensionsUsed', 'extensionsRequired'])
        delete json[key];
    for (const m of json.materials ?? []) {
        delete m.normalTexture;
        delete m.occlusionTexture;
        delete m.emissiveTexture;
        if (m.pbrMetallicRoughness) {
            delete m.pbrMetallicRoughness.baseColorTexture;
            delete m.pbrMetallicRoughness.metallicRoughnessTexture;
        }
    }
    globalThis.ProgressEvent ??= class extends Event {};
    return new Promise((resolve, reject) =>
        new GLTFLoader().parse(JSON.stringify(json), '', resolve, reject),
    );
}

async function duneModel() {
    const bytes = fs.readFileSync(
        new URL('../static/models/Dune/dune-sofa.glb', import.meta.url),
    );
    const length = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.subarray(20, 20 + length));
    json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + length).toString('base64')}`;
    globalThis.ProgressEvent ??= class extends Event {};
    return new Promise((resolve, reject) =>
        new GLTFLoader()
            .setMeshoptDecoder(MeshoptDecoder)
            .parse(JSON.stringify(json), '', resolve, reject),
    );
}

test('idle camera follows the original automatic sweep and respects reduced motion', () => {
    globalThis.document = { hidden: false };
    const app = { time: { elapsed: 0 }, reducedMotion: { matches: false } };
    const compiled = require('typescript').transpileModule(
        fs.readFileSync(
            new URL(
                '../src/Application/Camera/CameraKeyframes.ts',
                import.meta.url,
            ),
            'utf8',
        ),
        {
            compilerOptions: {
                module: require('typescript').ModuleKind.CommonJS,
            },
        },
    ).outputText;
    const exports = {};
    new Function('require', 'exports', compiled)(
        (name) =>
            name === 'three'
                ? THREE
                : {
                      default: class {
                          constructor() {
                              return app;
                          }
                      },
                  },
        exports,
    );
    const idle = new exports.IdleKeyframe();
    const origin = idle.origin.clone();
    // Recorded positions from the camera path before V12's subtle-yaw change.
    for (const [time, x, y] of [
        [0, -13482.58694367037, 5515.999957333367],
        [10000, -9885.12449440839, 5675.9432161636205],
        [20000, -291.47817230229543, 5835.605003380563],
        [40000, 13499.60899045533, 6153.063322693516],
        [60000, -496.88609524866337, 6466.344265388547],
    ]) {
        app.time.elapsed = time;
        idle.update();
        assert.ok(
            idle.position.distanceTo(new THREE.Vector3(x, y, 14500)) < 1e-6,
            `original automatic camera position at ${time}ms`,
        );
    }
    app.reducedMotion.matches = true;
    app.time.elapsed = 5000;
    idle.update();
    assert.ok(idle.position.distanceTo(origin) < 1e-8);
    app.reducedMotion.matches = false;
    document.hidden = true;
    idle.update();
    assert.ok(
        idle.position.distanceTo(origin) < 1e-8,
        'hidden tab freezes drift',
    );
});

test('Look Around keeps every orbit and zoom inside the walls, floor and ceiling', () => {
    globalThis.document = {};
    const compiled = require('typescript').transpileModule(
        fs.readFileSync(
            new URL('../src/Application/Camera/Camera.ts', import.meta.url),
            'utf8',
        ),
        {
            compilerOptions: {
                module: require('typescript').ModuleKind.CommonJS,
            },
        },
    ).outputText;
    const exports = {};
    new Function('require', 'exports', compiled)((name) => {
        if (name === 'three') return THREE;
        if (name.includes('OrbitControls')) return { OrbitControls };
        if (name.endsWith('/Layout')) return layout;
        if (name.startsWith('.')) return { default: class {} };
        return require(name);
    }, exports);
    const camera = Object.create(exports.default.prototype);
    const dom = {
        style: {},
        addEventListener() {},
        removeEventListener() {},
        getRootNode() {
            return this;
        },
    };
    camera.application = { renderer: { instance: { domElement: dom } } };
    camera.instance = new THREE.PerspectiveCamera(35, 16 / 9, 100, 900000);
    camera.position = new THREE.Vector3();
    camera.focalPoint = new THREE.Vector3();
    camera.keyframes = {
        orbitControlsStart: {
            position: new THREE.Vector3(-15000, 10000, 15000),
            focalPoint: new THREE.Vector3(-100, 1250, 0),
        },
    };
    camera.createControls();
    camera.freeCam = true;
    for (const distance of [50000, 15000, 4000, 500])
        for (let angle = -Math.PI; angle < Math.PI; angle += Math.PI / 12)
            for (const polar of [0.7, 0.01, 1.56]) {
                camera.instance.position
                    .setFromSphericalCoords(distance, polar, angle)
                    .add(camera.orbitControls.target);
                for (let frame = 0; frame < 8; frame++) {
                    camera.update();
                    const p = camera.instance.position;
                    assert.ok(
                        p.x > -17500 && p.x < 17500,
                        `side wall at ${p.x}`,
                    );
                    assert.ok(
                        p.z > -6000 && p.z < 18000,
                        `back/front wall at ${p.z}`,
                    );
                    assert.ok(
                        p.y > 2000 && p.y < 10500,
                        `floor/ceiling at ${p.y}`,
                    );
                    assert.ok(
                        camera.position.distanceTo(p) < 0.001,
                        'transition must start from the constrained camera',
                    );
                    const direction = new THREE.Vector3();
                    camera.instance.getWorldDirection(direction);
                    assert.ok(
                        direction.dot(
                            camera.orbitControls.target
                                .clone()
                                .sub(p)
                                .normalize(),
                        ) > 0.9999,
                        'clamping must preserve the look-at target',
                    );
                }
            }
    camera.orbitControls.dispose();
});

test('room furnishings align, stand on the floor and leave clear routes', async () => {
    const { RoundedBoxGeometry } = await import(
        'three/examples/jsm/geometries/RoundedBoxGeometry.js'
    );
    const { Reflector } = await import(
        'three/examples/jsm/objects/Reflector.js'
    );
    const ctx = {
        createRadialGradient: () => ({ addColorStop() {} }),
        createLinearGradient: () => ({ addColorStop() {} }),
        fillText() {},
        fillRect() {},
        drawImage() {},
        beginPath() {},
        arc() {},
        fill() {},
        strokeRect() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        closePath() {},
    };
    globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
    const app = {
        reducedMotion: { matches: false },
        time: { delta: 16 },
        resources: {
            items: {
                gltfModel: {
                    duneModel: await duneModel(),
                    loungeProps: await texturelessModel(
                        'Lounge/lounge-props.glb',
                    ),
                    spezialModel: await texturelessModel(
                        'Spezial/spezial-night-indigo.glb',
                    ),
                },
                texture: {
                    duneFabricBump: new THREE.Texture(),
                    messiJersey: new THREE.Texture(),
                    argentinaJersey: new THREE.Texture(),
                    barcaCrest: new THREE.Texture(),
                    graduationRug: new THREE.Texture(),
                    ...Object.fromEntries(
                        [
                            'mbdtf',
                            'jackboys',
                            'rodeo',
                            'tlop',
                            '808s',
                            'graduation',
                            'yeezus',
                            'melodicblue',
                            'blonde',
                            'currents',
                            'longlive',
                            'honestly',
                            'livelove',
                            'atlonglast',
                            'utopia',
                            'thankmelater',
                            'astroworld',
                            'collegedropout',
                            'fouryou',
                        ].flatMap((slug) => [
                            [`poster_${slug}`, new THREE.Texture()],
                            [`${slug}Vinyl`, new THREE.Texture()],
                        ]),
                    ),
                },
            },
        },
    };
    const compiled = require('typescript').transpileModule(
        fs.readFileSync(
            new URL('../src/Application/World/Environment.ts', import.meta.url),
            'utf8',
        ),
        {
            compilerOptions: {
                module: require('typescript').ModuleKind.CommonJS,
            },
        },
    ).outputText;
    const exports = {};
    const busHandlers = {};
    new Function('require', 'exports', compiled)((name) => {
        if (name === 'three') return THREE;
        if (name.includes('AlbumAudio'))
            return {
                ALBUMS: Object.fromEntries(
                    [
                        'mbdtf',
                        'jackboys',
                        'rodeo',
                        'tlop',
                        '808s',
                        'graduation',
                        'yeezus',
                        'melodicblue',
                        'blonde',
                        'currents',
                        'longlive',
                        'honestly',
                        'livelove',
                        'atlonglast',
                        'utopia',
                        'thankmelater',
                        'astroworld',
                        'collegedropout',
                        'fouryou',
                    ].map((slug) => [slug, slug]),
                ),
            };
        if (name.includes('RoundedBoxGeometry')) return { RoundedBoxGeometry };
        if (name.includes('Reflector')) return { Reflector };
        if (name.includes('EventBus'))
            return {
                default: {
                    on: (event, fn) => (
                        (busHandlers[event] ??= []).push(fn),
                        () => {}
                    ),
                    dispatch: (event, data) =>
                        busHandlers[event]?.forEach((fn) => fn(data)),
                },
            };
        if (name === './Layout') return layout;
        if (name === './DuneSofa') return world('DuneSofa.ts');
        if (name === './Lounge') return world('Lounge.ts');
        if (name === './MatchBoard')
            return {
                default: class {
                    map = new THREE.Texture();
                    update() {}
                },
            };
        return {
            default: class {
                constructor() {
                    return app;
                }
            },
        };
    }, exports);
    const environment = Object.create(exports.default.prototype);
    const room = environment.buildRoom();
    room.updateMatrixWorld(true);
    const bounds = (name) =>
        new THREE.Box3().setFromObject(room.getObjectByName(name), true);
    const flagBounds = bounds('FC Barcelona flag');
    const trim = room.children.filter((part) => part.name === 'Slat end trim');
    for (const part of trim) {
        const trimBounds = new THREE.Box3().setFromObject(part, true);
        assert.ok(
            flagBounds.min.z > trimBounds.max.z,
            'deepest flag fold clears the wooden slat trim',
        );
    }
    const sleeves = room.children.filter((part) =>
        part.name.startsWith('Album sleeve:'),
    );
    assert.equal(
        sleeves.length,
        11,
        'only the original sleeves are left out; new albums stay in the shuffle pool',
    );
    for (let i = 0; i < sleeves.length; i++) {
        assert.ok(
            bounds(sleeves[i].name).getSize(new THREE.Vector3()).y < 800,
            'sleeves stay find-me sized, not wall art',
        );
        const art = sleeves[i].children.find(
            (part) => part.material?.map && !part.material.transparent,
        );
        assert.ok(art.material.map, 'every sleeve carries its cover');
        for (let j = i + 1; j < sleeves.length; j++)
            assert.ok(
                !bounds(sleeves[i].name).intersectsBox(bounds(sleeves[j].name)),
                'sleeves are scattered, never stacked in one spot',
            );
    }
    const lamp = room.getObjectByName('Warm floor lamp');
    // No shadow by design: a point-light shadow costs six full-scene passes.
    assert.ok(lamp.isPointLight && !lamp.castShadow && lamp.decay === 2);
    assert.equal(lamp.color.getHexString(), 'ffb877');
    assert.equal(room.getObjectByName('Lamp diffuser').castShadow, false);
    assert.ok(
        Math.abs(lamp.position.x - 10100) > 32,
        'emitter clears the lamp pole',
    );
    assert.ok(
        room.getObjectByName('Warm linen lampshade').material
            .emissiveIntensity > 0,
    );
    assert.ok(
        room.getObjectByName('Wood floor').receiveShadow &&
            room.getObjectByName('Desk rug').receiveShadow,
    );
    assert.ok(
        room.getObjectByName('Back wall').material.bumpMap,
        'wall has plaster relief',
    );
    assert.equal(
        room.children.filter((part) => part.name === 'Slat end trim').length,
        2,
    );
    const duvet = room.getObjectByName('Rumpled burgundy duvet').geometry
        .attributes.position;
    const heights = Array.from({ length: duvet.count }, (_, i) =>
        duvet.getZ(i),
    );
    assert.ok(
        Math.max(...heights) - Math.min(...heights) > 120,
        'duvet has visible rumpling',
    );
    environment.update();
    const motes = environment.dust.geometry.attributes.position.array.slice();
    environment.update();
    assert.notDeepEqual(
        environment.dust.geometry.attributes.position.array,
        motes,
        'dust drifts through lamp light',
    );
    app.reducedMotion.matches = true;
    environment.update();
    assert.equal(
        environment.dust.visible,
        false,
        'reduced motion disables dust',
    );
    app.reducedMotion.matches = false;
    const mirror = room.getObjectByName('Standing full length mirror');
    assert.ok(
        !bounds('Travel suitcase').intersectsBox(bounds('Bedside table')),
        'suitcase clears the bedside table',
    );
    const sleeveBounds = bounds('Current album sleeve');
    assert.ok(
        sleeveBounds.getSize(new THREE.Vector3()).y < 80,
        'album sleeve lies flat',
    );
    assert.ok(
        Math.abs(sleeveBounds.min.y - bounds('Display cabinet').max.y) < 1,
        'sleeve rests directly on cabinet',
    );
    assert.ok(
        bounds(mirror.name).min.y >= -3015,
        'mirror cannot penetrate the floor',
    );
    assert.ok(
        new THREE.Vector3(0, 1, 0).applyQuaternion(mirror.quaternion).y >
            0.99999,
        'mirror stands upright',
    );
    const barca = bounds('Barcelona jersey frame'),
        argentina = bounds('Argentina jersey frame'),
        flag = bounds('FC Barcelona flag');
    for (const edge of ['min', 'max'])
        assert.ok(
            Math.abs(barca[edge].y - argentina[edge].y) < 0.1,
            'matching frame baseline',
        );
    const center = (box) => box.getCenter(new THREE.Vector3());
    const tv = bounds('Wall mounted TV frame');
    assert.ok(
        Math.abs(center(barca).x + center(argentina).x - center(tv).x * 2) <
            0.1,
        'frames flank the TV symmetrically',
    );
    assert.equal(
        center(barca).y,
        center(tv).y,
        'frames share the TV centerline',
    );
    assert.ok(
        argentina.max.x < tv.min.x && barca.min.x > tv.max.x,
        'jerseys sit outside the screen',
    );
    assert.equal(center(flag).x, -550, 'flag centered behind the studio desk');
    assert.equal(
        center(bounds('Desk flag accent light')).x,
        center(flag).x,
        'accent light shares the desk centerline',
    );
    assert.equal(flag.getSize(new THREE.Vector3()).x, 7800, 'larger desk flag');
    assert.equal(
        room.getObjectByName('Barcelona jersey backing').material,
        room.getObjectByName('Argentina jersey backing').material,
        'one shared backing color',
    );
    for (const name of ['Barcelona', 'Argentina']) {
        const shirt = bounds(`${name} Messi 10 jersey`),
            frame = bounds(`${name} jersey frame`);
        assert.ok(
            shirt.min.x > frame.min.x && shirt.max.x < frame.max.x,
            'shirt fits inside its frame',
        );
        assert.equal(
            room.getObjectByName(`${name} Messi 10 jersey`).geometry.type,
            'ShapeGeometry',
            'photograph rectangles are trimmed to garment outlines',
        );
    }
    for (const name of [
        'Blue match night bean bag',
        'Burgundy match night bean bag',
    ]) {
        const bag = room.getObjectByName(name),
            extents = bounds(name);
        assert.ok(
            Math.abs(extents.min.y + 3015) < 0.1,
            'bean bag rests on floor',
        );
        assert.ok(
            extents.min.z > 5000 &&
                extents.max.z < bounds('Media console').min.z,
            'seating clears desk and media console',
        );
        assert.ok(
            !extents.intersectsBox(bounds('Graduation album rug')),
            'bean bags flank the lounge rug instead of sitting on it',
        );
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
            bag.quaternion,
        );
        const target = new THREE.Vector3(0, -3015, 18100)
            .sub(bag.position)
            .normalize();
        // Roughly toward the TV, but shoved around: never squared up.
        const facing = forward.dot(target);
        assert.ok(
            facing > 0.85 && facing < 0.999,
            `${name} faces the TV, askew`,
        );
    }
    // Lived in, not staged: the bags are not mirrored across the TV axis.
    const blue = room.getObjectByName('Blue match night bean bag');
    const red = room.getObjectByName('Burgundy match night bean bag');
    assert.ok(
        Math.abs(blue.position.x + red.position.x) > 500 ||
            Math.abs(blue.position.z - red.position.z) > 500,
        'bean bags are placed asymmetrically',
    );
    assert.ok(
        Math.abs(blue.rotation.y + red.rotation.y) > 0.1,
        'bean bags are turned differently',
    );
    // The downloaded Dune model sunk into a conversation pit sized to it:
    // boards stop at the opening, the hem stands on the pit floor, crests
    // just clear the floor, and a leather tatami on the TV side carries the
    // round table clear of every cushion.
    const lounge = bounds('Dune sofa');
    const metre = 3300;
    const { PIT, TATAMI, DUNE_SIZE } = layout;
    const pitFloor = -3015 - PIT.drop;
    const opening = new THREE.Box3(
        new THREE.Vector3(PIT.x - PIT.width / 2, -3100, PIT.z),
        new THREE.Vector3(PIT.x + PIT.width / 2, -3000, PIT.z + PIT.length),
    );
    for (const part of room.children.filter((p) => p.name === 'Wood floor'))
        assert.ok(
            !new THREE.Box3().setFromObject(part).intersectsBox(opening),
            'no floor board spans the pit opening',
        );
    assert.ok(
        Math.abs(bounds('Pit carpet').max.y - pitFloor) < 1,
        'carpeted pit floor at pit depth',
    );
    const loungeSize = lounge.getSize(new THREE.Vector3());
    assert.ok(
        Math.abs(loungeSize.x - DUNE_SIZE.x) < 2 &&
            Math.abs(loungeSize.z - DUNE_SIZE.z) < 2 &&
            Math.abs(loungeSize.y - DUNE_SIZE.y) < 2,
        'model keeps its authored footprint at 90% (2.51 × 2.53 m), lying flat',
    );
    assert.ok(
        Math.abs(lounge.min.y - pitFloor) < 1,
        'Dune stands on the pit floor',
    );
    assert.ok(
        lounge.max.y > -3015 && lounge.max.y < -3015 + 0.05 * metre,
        'backrests crest just above the room floor',
    );
    const tatami = bounds('Dune tatami');
    assert.ok(
        lounge.min.x >= opening.min.x + 30 &&
            lounge.max.x <= opening.max.x - 30 &&
            lounge.min.z >= opening.min.z + 30 &&
            lounge.max.z <= tatami.min.z - 30,
        'Dune fills the pit with clearance to the walls and the tatami',
    );
    assert.equal(
        room.getObjectByName('Dune tatami').children.length,
        4,
        'one tatami per Dune column',
    );
    assert.ok(
        Math.abs(tatami.max.y - (pitFloor + TATAMI.height)) < 1 &&
            Math.abs(tatami.max.z - (PIT.z + PIT.length)) < 10,
        'tatami lines the TV side at seat height',
    );
    // The backrest runs along the desk side: the highest cushions sit there.
    const positions = [];
    room.getObjectByName('Dune sofa').traverse((part) => {
        if (!part.isMesh) return;
        const p = part.geometry.getAttribute('position');
        const v = new THREE.Vector3();
        for (let i = 0; i < p.count; i += 7) {
            v.fromBufferAttribute(p, i);
            positions.push(v.clone().applyMatrix4(part.matrixWorld));
        }
    });
    const crest = (inZone) =>
        Math.max(...positions.filter(inZone).map((v) => v.y));
    const EDGE = 0.15 * metre;
    const deskEdge = crest((v) => v.z < lounge.min.z + EDGE);
    const windowEdge = crest((v) => v.x < lounge.min.x + EDGE);
    // The whole TV edge past the window backrest (the TV-side corner pair is
    // mirrored so its back no longer faces the screen), and the bed edge
    // past the back corner.
    const tvEdge = crest(
        (v) => v.z > lounge.max.z - EDGE && v.x > lounge.min.x + 0.25 * metre,
    );
    const bedEdge = crest(
        (v) => v.x > lounge.max.x - EDGE && v.z > lounge.min.z + 0.5 * metre,
    );
    assert.ok(
        deskEdge > -3015 && windowEdge > -3015,
        'backrests line the desk and window sides',
    );
    assert.ok(tvEdge < pitFloor + 0.35 * metre, 'seats open toward the TV');
    assert.ok(bedEdge < pitFloor + 0.35 * metre, 'seats open toward the bed');
    // Begu's walk (Husky.ts) stays on the boards, a clear margin from the edge.
    assert.ok(
        PIT.z - 150 > layout.DESK_Z + 4201 + 1500,
        'pit edge clears Begu',
    );
    for (const name of [
        'Blue match night bean bag',
        'Burgundy match night bean bag',
        'Graduation album rug',
        'Bed and walnut headboard',
        'Ahmedabad night window',
    ])
        assert.ok(
            !bounds(name).intersectsBox(opening.clone().expandByScalar(150)),
            `${name} clears the pit`,
        );
    // The lived-in lounge: real props and everyday mess, all resting on
    // something, none in the pit, the console, the bed, the doorway or walls.
    const livedIn = room.getObjectByName('Lived-in lounge');
    const items = livedIn.children.map((c) => c.name);
    for (const expected of [
        'Leather ottoman footrest',
        'Lounge side table',
        'Wicker blanket basket',
        'Side table succulent',
        'Half-drunk coffee mug',
        'Pillow on the burgundy bean bag',
        'Pillow tossed on the Dune',
        'Kicked-off Spezial (left)',
        'Kicked-off Spezial (right)',
    ])
        assert.ok(items.includes(expected), `${expected} in the lounge`);
    const keepOut = ['Media console', 'Bed and walnut headboard', 'Entry door'];
    const pitArea = opening.clone().expandByScalar(150);
    for (const item of livedIn.children) {
        const b = new THREE.Box3().setFromObject(item, true);
        const ground =
            item.name === 'Pillow tossed on the Dune' ? pitFloor : -3015;
        assert.ok(
            b.min.y >= ground - 1,
            `${item.name} is not sunk into the floor`,
        );
        assert.ok(
            b.min.x > -17800 && b.max.x < 17700 && b.max.z < 18000,
            `${item.name} stays inside the walls`,
        );
        for (const other of keepOut)
            assert.ok(
                !b.intersectsBox(bounds(other)),
                `${item.name} clears ${other}`,
            );
        if (item.name !== 'Pillow tossed on the Dune')
            assert.ok(
                !b.intersectsBox(pitArea),
                `${item.name} stays out of the pit`,
            );
    }
    const on = (name, support, tolerance = 15) =>
        Math.abs(bounds(name).min.y - bounds(support).max.y) < tolerance;
    assert.ok(
        on('Half-drunk coffee mug', 'Lounge side table'),
        'mug on the table',
    );
    assert.ok(
        on('Side table succulent', 'Lounge side table'),
        'plant on the table',
    );
    const tossed = bounds('Pillow tossed on the Dune');
    assert.ok(
        tossed.min.y > pitFloor + 0.15 * metre &&
            tossed.min.y < -3015 - 0.15 * metre,
        'pillow lies on the sofa seat',
    );
    const bagPillow = bounds('Pillow on the burgundy bean bag');
    assert.ok(
        bagPillow.min.y > -3015 + 0.1 * metre &&
            bagPillow.intersectsBox(bounds('Burgundy match night bean bag')),
        'pillow sits in the burgundy bag',
    );
    // The kicked-off pair: real UK 9 size, mirrored left, both on the floor.
    const leftShoe = room.getObjectByName('Kicked-off Spezial (left)');
    const rightModel = room.getObjectByName('Kicked-off Spezial (right)');
    const shoeGeometry = rightModel.children[0].geometry;
    shoeGeometry.computeBoundingBox();
    const shoeLength =
        (shoeGeometry.boundingBox.max.x - shoeGeometry.boundingBox.min.x) *
        rightModel.scale.x;
    assert.ok(
        shoeLength > 0.26 * metre && shoeLength < 0.34 * metre,
        `Spezial is shoe-sized (${(shoeLength / metre).toFixed(2)} m)`,
    );
    assert.ok(leftShoe.scale.z < 0, 'left Spezial mirrors the right scan');
    for (const shoe of [
        'Kicked-off Spezial (left)',
        'Kicked-off Spezial (right)',
    ])
        assert.ok(
            Math.abs(bounds(shoe).min.y + 3015) < 2,
            `${shoe} rests on the floor`,
        );
    assert.equal(
        room.getObjectByName('Kicked-off slide (left)'),
        undefined,
        'the slides are gone',
    );
    assert.equal(
        room.getObjectByName('Throw dragged off the blue bean bag'),
        undefined,
        'blue bean bag stays uncovered',
    );
    assert.ok(
        room.getObjectByName('Grey throw on the ottoman (fold 1)'),
        'small ottoman throw remains',
    );
    // The seating starts right under the screen: the pit's TV-side nosing
    // meets the console's doors, with no walkway between.
    const consoleFront = Math.min(
        ...room.children
            .filter((p) => p.position.z > 15000 && p.position.z < 17500)
            .filter(
                (p) =>
                    Math.abs(p.position.x) < 5600 &&
                    p.position.y > -2600 &&
                    p.position.y < -1000,
            )
            .map((p) => new THREE.Box3().setFromObject(p).min.z),
    );
    const pitFront = PIT.z + PIT.length + 150;
    assert.ok(
        consoleFront - pitFront >= 0 && consoleFront - pitFront < 60,
        `pit meets the media console (gap ${consoleFront - pitFront})`,
    );
    assert.ok(
        bounds('Match night media wall').min.z - lounge.max.z < 1.5 * metre,
        'front row sits close under the screen',
    );
    // One mesh split into its 16 modules, each on its grid cell, and every
    // cushion carries the upholstery shading.
    const modules = room.getObjectByName('Dune sofa').children[0].children;
    assert.equal(modules.length, 16, 'Dune split into its 16 modules');
    for (const module of modules) {
        assert.equal(module.rotation.y, 0, `${module.name} stays square`);
        assert.ok(module.matrixWorld.determinant() > 0, 'flips are baked in');
        assert.ok(module.geometry.getAttribute('color'), 'crease shading');
    }
    // The whole front row is open seating facing the screen: past the
    // window backrest, no TV-side cushion rises above seat height.
    for (const col of [0, 1, 2, 3]) {
        const front = new THREE.Box3().setFromObject(
            room.getObjectByName(`Dune module 0-${col}`),
        );
        assert.ok(
            crest(
                (v) =>
                    front.containsPoint(v) && v.x > lounge.min.x + 0.25 * metre,
            ) <
                pitFloor + 0.3 * metre,
            `front-row module 0-${col} is open seating`,
        );
    }
    const fabric = modules[0].material;
    assert.ok(
        fabric.map && fabric.normalMap && fabric.vertexColors,
        'woven, crease-shaded upholstery',
    );
    const oasis = bounds('Match night controller table');
    const tabletop = bounds('Dune round tabletop');
    assert.ok(
        !oasis.intersectsBox(lounge),
        'table stands clear of the cushions',
    );
    assert.ok(
        oasis.min.x > tatami.min.x &&
            oasis.max.x < tatami.max.x &&
            oasis.min.z > tatami.min.z &&
            oasis.max.z < tatami.max.z,
        'table footprint sits on the tatami',
    );
    assert.ok(
        Math.abs(oasis.min.y - tatami.max.y) < 1,
        'table stands on the tatami',
    );
    assert.ok(tabletop.max.y < -3015, 'tabletop stays below the room floor');
    assert.ok(
        tabletop.getSize(new THREE.Vector3()).y < 0.02 * metre,
        'tabletop is thin, not a slab',
    );
    for (const pad of room.children.filter(
        (p) => p.name === 'Match night gamepad',
    )) {
        const b = new THREE.Box3().setFromObject(pad);
        assert.ok(
            b.min.y >= tabletop.max.y - 5 && b.min.y < tabletop.max.y + 20,
            'controllers rest on the tabletop',
        );
    }
    const cabinet = bounds('Display cabinet'),
        player = bounds('Walnut record player');
    assert.ok(
        player.min.y >= cabinet.max.y - 0.1 && player.min.y < cabinet.max.y + 1,
        'turntable feet rest on cabinet',
    );
    assert.ok(
        player.min.x > cabinet.min.x &&
            player.max.x < cabinet.max.x &&
            player.min.z > cabinet.min.z &&
            player.max.z < cabinet.max.z,
        'turntable fits its surface',
    );
    const startAngle = environment.record.rotation.y;
    environment.update();
    assert.ok(
        Math.abs(
            environment.record.rotation.y -
                startAngle +
                (0.016 * Math.PI * 10) / 9,
        ) < 1e-10,
        'record spins clockwise at 33 1/3 rpm',
    );
    const animatedAngle = environment.record.rotation.y;
    app.reducedMotion.matches = true;
    environment.update();
    assert.equal(
        environment.record.rotation.y,
        animatedAngle,
        'reduced motion freezes record',
    );
    app.reducedMotion.matches = false;
    document.hidden = true;
    environment.update();
    assert.equal(
        environment.record.rotation.y,
        animatedAngle,
        'hidden tab freezes record',
    );
    document.hidden = false;
    app.world = {
        audioManager: {
            album: { tracks: [{}], audio: { paused: true }, error: false },
        },
    };
    environment.update();
    assert.equal(
        environment.record.rotation.y,
        animatedAngle,
        'paused album stops the record',
    );
    app.world.audioManager.album.audio.paused = false;
    environment.update();
    assert.ok(
        environment.record.rotation.y < animatedAngle,
        'playing album turns the record',
    );
    const music = app.world.audioManager.album;
    music.tracks = ['mbdtf', 'jackboys', 'rodeo', 'mbdtf'].map((album) => ({
        album,
    }));
    for (let index = 0; index < music.tracks.length; index++) {
        music.index = index;
        environment.update();
        const id = music.tracks[index].album;
        const art = environment.recordArtwork[id];
        assert.equal(environment.recordAlbum, id);
        assert.equal(
            environment.sleeveCover.material.map,
            art.sleeve,
            'sleeve follows the active song',
        );
        assert.equal(
            environment.recordLabel.material.map,
            art.label,
            'physical vinyl label follows the active song',
        );
        assert.equal(
            environment.recordMaterial.color.getHex(),
            new THREE.Color(art.color).convertSRGBToLinear().getHex(),
            'pressing color follows the album',
        );
    }
    assert.equal(
        environment.recordArtwork.rodeo.sleeve,
        app.resources.items.texture.poster_rodeo,
    );
    assert.equal(
        environment.recordArtwork.jackboys.sleeve,
        app.resources.items.texture.poster_jackboys,
    );
    assert.equal(
        new Set(
            Object.values(environment.recordArtwork).map((art) => art.label),
        ).size,
        19,
        'each release has its own physical label',
    );
    const playingAngle = environment.record.rotation.y;
    app.world.audioManager.album.error = true;
    environment.update();
    assert.equal(
        environment.record.rotation.y,
        playingAngle,
        'playback error stops the record',
    );
    for (const name of [
        'Ahmedabad night window',
        'Match night media wall',
        'Display cabinet',
        'Entry door',
        'Front wall',
        'Back wall',
        'Ceiling',
        'Bed and walnut headboard',
        'Standing full length mirror',
        'Travel suitcase',
        'Graduation album rug',
        'Blue match night bean bag',
        'Burgundy match night bean bag',
        'Current album sleeve',
        'Walnut record player',
        'Match night game console',
    ])
        assert.ok(room.getObjectByName(name), name);
    const rug = room.getObjectByName('Graduation album rug');
    const [rugPrint, rugBinding] = rug.material;
    assert.ok(
        rugPrint.bumpMap && rugPrint.sheen > 0,
        'rug has tufted pile relief',
    );
    assert.ok(
        rugBinding && !rugBinding.map,
        'rug edge is a plain bound fabric',
    );
    const rugUv = rug.geometry.getAttribute('uv');
    const rugPrintFaces = rug.geometry.groups.find(
        (g) => g.materialIndex === 0,
    );
    let uMin = 1,
        uMax = 0,
        vMin = 1,
        vMax = 0;
    for (
        let i = rugPrintFaces.start;
        i < rugPrintFaces.start + rugPrintFaces.count;
        i++
    ) {
        const index = rug.geometry.index ? rug.geometry.index.getX(i) : i;
        uMin = Math.min(uMin, rugUv.getX(index));
        uMax = Math.max(uMax, rugUv.getX(index));
        vMin = Math.min(vMin, rugUv.getY(index));
        vMax = Math.max(vMax, rugUv.getY(index));
    }
    assert.ok(
        uMin < 0.01 && uMax > 0.99 && vMin < 0.01 && vMax > 0.99,
        'rug shows the complete, uncropped print',
    );
    const rugHeight = bounds('Graduation album rug').getSize(
        new THREE.Vector3(),
    ).y;
    assert.ok(rugHeight > 25 && rugHeight < 60, 'rug is a thin printed mat');
    assert.equal(
        room.getObjectByName('Woven rug fringe'),
        undefined,
        'no fringe, like the real rug',
    );
    const flagLight = environment.flagLights[0];
    busHandlers.enterMonitor.forEach((fn) => fn());
    assert.ok(
        environment.flagLightTarget === 0.25,
        'flag lights ease down while the visitor is on the Mac',
    );
    busHandlers.leftMonitor.forEach((fn) => fn());
    assert.equal(environment.flagLightTarget, 1, 'and come back after');
    assert.ok(flagLight.full > 0);
    const { skyPhase } = exports;
    assert.deepEqual(
        [3, 6, 9, 16, 18, 21].map(skyPhase),
        ['night', 'dusk', 'day', 'day', 'dusk', 'night'],
        'the window follows the visitor’s local time',
    );
    for (const name of [
        'Walnut record player',
        'Bookshelf',
        'Graduation album rug',
    ])
        assert.ok(
            room.getObjectByName(name),
            `${name} is named so it can be clicked`,
        );
    assert.equal(
        room.getObjectByName('Wall mounted TV frame').castShadow,
        false,
        'wall frame must not cast the detached floor triangle',
    );
    assert.ok(
        bounds('Bed and walnut headboard').min.x > 8900,
        'bed clears the dog and desk area',
    );
    assert.ok(
        bounds('Bed and walnut headboard').max.x < 18000,
        'headboard stays inside the wall',
    );
    assert.ok(
        bounds('Graduation album rug').min.y > -3015,
        'rug clears the floor without z fighting',
    );
    assert.ok(
        bounds('Graduation album rug').max.x <
            bounds('Bed and walnut headboard').min.x,
        'rug is visible beside the bed',
    );
    assert.ok(
        bounds('Back wall').min.z < -6000 && bounds('Front wall').max.z > 18000,
        'camera limits sit within the rendered walls',
    );
    assert.ok(
        bounds('Ceiling').min.y > 10300 + 400,
        'camera ceiling limit has clearance',
    );
});
