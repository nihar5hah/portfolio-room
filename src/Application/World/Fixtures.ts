import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Hand-built fixtures for the parts of the room no free scan covers well:
 * floor-standing tower speakers and soft bed pillows. Room units (3300 per
 * metre); every piece stands on its own origin at floor level.
 */

const shade = (mesh: THREE.Mesh) => {
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
};

/**
 * A loudspeaker drive unit, facing +Y (rotate to aim it): a metal basket
 * rim, a half-roll rubber surround, a shallow cone and a domed dust cap.
 * `metal` gives an aluminium cone, otherwise dark coated paper.
 */
function driver(radius: number, metal: boolean) {
    const r = radius;
    const unit = new THREE.Group();
    const rim = new THREE.MeshStandardMaterial({
        color: '#1b1c1f',
        metalness: 0.55,
        roughness: 0.38,
    });
    const rubber = new THREE.MeshStandardMaterial({
        color: '#121214',
        roughness: 0.92,
    });
    const cone = new THREE.MeshStandardMaterial(
        metal
            ? { color: '#8e9398', metalness: 0.85, roughness: 0.32 }
            : { color: '#2a2b2e', roughness: 0.78 },
    );
    const lathe = (points: [number, number][], material: THREE.Material) =>
        shade(
            new THREE.Mesh(
                new THREE.LatheGeometry(
                    points.map(([x, y]) => new THREE.Vector2(x, y)),
                    40,
                ),
                material,
            ),
        );
    // Rim: a flat ring proud of the baffle, bevelled on the outside.
    unit.add(
        lathe(
            [
                [r * 1.13, 0],
                [r * 1.13, r * 0.03],
                [r * 1.08, r * 0.06],
                [r * 1.0, r * 0.06],
                [r * 0.98, r * 0.02],
            ],
            rim,
        ),
    );
    // Surround: a half torus rolled outward.
    const roll: [number, number][] = [];
    for (let i = 0; i <= 12; i++) {
        const a = Math.PI * (1 - i / 12);
        roll.push([
            r * 0.89 + Math.cos(a) * r * 0.09,
            r * 0.02 + Math.sin(a) * r * 0.07,
        ]);
    }
    unit.add(lathe(roll, rubber));
    // Cone: sweeps down from the surround to the voice coil.
    const coneProfile: [number, number][] = [];
    for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const x = r * (0.8 - 0.52 * t);
        coneProfile.push([x, r * 0.02 - r * 0.24 * Math.pow(t, 0.8)]);
    }
    unit.add(lathe(coneProfile.reverse(), cone));
    // Dust cap.
    const cap = shade(
        new THREE.Mesh(
            new THREE.SphereGeometry(r * 0.3, 32, 12, 0, Math.PI * 2, 0, 0.9),
            cone,
        ),
    );
    cap.scale.y = 0.55;
    cap.position.y = -r * 0.26;
    unit.add(cap);
    return unit;
}

/** A silk-dome tweeter in a shallow waveguide, facing +Y. */
function tweeter(radius: number) {
    const unit = new THREE.Group();
    const face = new THREE.MeshStandardMaterial({
        color: '#18191c',
        metalness: 0.4,
        roughness: 0.4,
    });
    const silk = new THREE.MeshStandardMaterial({
        color: '#26272a',
        roughness: 0.55,
    });
    const profile: [number, number][] = [];
    for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        profile.push([
            radius * (0.35 + 0.65 * t),
            -radius * 0.28 * (1 - t) ** 2,
        ]);
    }
    profile.push([radius, radius * 0.04], [radius * 1.04, 0]);
    unit.add(
        shade(
            new THREE.Mesh(
                new THREE.LatheGeometry(
                    profile.map(([x, y]) => new THREE.Vector2(x, y)),
                    64,
                ),
                face,
            ),
        ),
    );
    const dome = shade(
        new THREE.Mesh(
            new THREE.SphereGeometry(
                radius * 0.36,
                32,
                16,
                0,
                Math.PI * 2,
                0,
                Math.PI / 2,
            ),
            silk,
        ),
    );
    dome.position.y = -radius * 0.28;
    unit.add(dome);
    return unit;
}

/**
 * A floor-standing tower speaker: walnut veneer cabinet with softened edges,
 * black front baffle, silk tweeter, aluminium midrange, two paper woofers, a
 * flared front bass port, and a plinth on four spikes. Faces -Z.
 * `width` × `height` × `depth` is the cabinet (room units).
 */
export function towerSpeaker(
    veneer: THREE.Material,
    size = { width: 760, height: 2800, depth: 1000 },
) {
    const { width: W, height: H, depth: D } = size;
    const speaker = new THREE.Group();
    const satin = new THREE.MeshStandardMaterial({
        color: '#141518',
        roughness: 0.42,
        metalness: 0.15,
    });
    const steel = new THREE.MeshStandardMaterial({
        color: '#2c2d31',
        metalness: 0.8,
        roughness: 0.3,
    });
    // Spikes and plinth.
    const spikeH = 45;
    for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
            const spike = shade(
                new THREE.Mesh(new THREE.ConeGeometry(28, spikeH, 20), steel),
            );
            spike.rotation.x = Math.PI;
            spike.position.set(
                sx * (W / 2 + 30),
                spikeH / 2,
                sz * (D / 2 + 20),
            );
            speaker.add(spike);
        }
    const plinth = shade(
        new THREE.Mesh(
            new RoundedBoxGeometry(W + 140, 55, D + 90, 3, 18),
            satin,
        ),
    );
    plinth.position.y = spikeH + 27;
    speaker.add(plinth);
    const base = spikeH + 55 + 20;
    // Cabinet on short standoffs, so the plinth reads as separate.
    for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
            const foot = shade(
                new THREE.Mesh(
                    new THREE.CylinderGeometry(22, 22, 20, 16),
                    steel,
                ),
            );
            foot.position.set(
                sx * (W / 2 - 80),
                spikeH + 55 + 10,
                sz * (D / 2 - 80),
            );
            speaker.add(foot);
        }
    const cabinet = shade(
        new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 4, 42), veneer),
    );
    cabinet.position.y = base + H / 2;
    speaker.add(cabinet);
    const baffle = shade(
        new THREE.Mesh(
            new RoundedBoxGeometry(W - 24, H - 24, 40, 4, 18),
            satin,
        ),
    );
    baffle.position.set(0, base + H / 2, -D / 2 + 8);
    speaker.add(baffle);
    const front = -D / 2 - 12;
    const mount = (unit: THREE.Object3D, y: number) => {
        unit.rotation.x = -Math.PI / 2; // +Y (outward) to -Z (the room)
        unit.position.set(0, base + y, front);
        speaker.add(unit);
    };
    const woofer = W * 0.38;
    mount(tweeter(W * 0.2), H - W * 0.3);
    mount(driver(W * 0.3, true), H - W * 0.88);
    mount(driver(woofer, false), H - W * 1.72);
    mount(driver(woofer, false), H - W * 2.72);
    // Flared bass port near the floor.
    const port = shade(
        new THREE.Mesh(
            new THREE.TorusGeometry(W * 0.13, W * 0.035, 12, 40),
            satin,
        ),
    );
    port.position.set(0, base + W * 0.42, front - 4);
    speaker.add(port);
    const tube = new THREE.Mesh(
        new THREE.CircleGeometry(W * 0.12, 32),
        new THREE.MeshBasicMaterial({ color: '#030304' }),
    );
    tube.rotation.y = Math.PI;
    tube.position.set(0, base + W * 0.42, front + 6);
    speaker.add(tube);
    // A small brushed badge below the port.
    const badge = shade(
        new THREE.Mesh(new RoundedBoxGeometry(W * 0.22, 26, 6, 2, 3), steel),
    );
    badge.position.set(0, base + W * 0.18, front - 2);
    speaker.add(badge);
    return speaker;
}

/**
 * A soft bed pillow: a subdivided box whose faces bow out and whose sides
 * pinch into a seam, with a slept-on dent. `seed` varies the dent.
 */
export function softPillow(
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
    seed = 1,
) {
    const geometry = new THREE.BoxGeometry(1, 1, 1, 28, 8, 18);
    const p = geometry.attributes.position;
    const dentX = Math.sin(seed * 12.9898) * 0.18;
    const dentZ = Math.cos(seed * 78.233) * 0.12;
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) * 2,
            y = p.getY(i) * 2,
            z = p.getZ(i) * 2;
        const edge = Math.max(0, (1 - x ** 6) * (1 - z ** 6));
        let thick = 0.16 + 0.84 * Math.sqrt(edge);
        // Head dent on the top face.
        if (y > 0)
            thick *=
                1 -
                0.28 *
                    Math.exp(
                        -((x - dentX) ** 2 / 0.2 + (z - dentZ) ** 2 / 0.25),
                    );
        // Sides bulge a little outward at mid-height.
        const bulge = 1 + 0.05 * (1 - y * y);
        p.setXYZ(
            i,
            (x / 2) * width * bulge,
            (y / 2) * height * thick,
            (z / 2) * depth * bulge,
        );
    }
    geometry.computeVertexNormals();
    const mesh = shade(new THREE.Mesh(geometry, material));
    return mesh;
}

/**
 * A round wall clock: a black steel rim, a warm cream dial with minute
 * ticks, hour bars and numerals, and three hands on a brass cap. Faces +Z.
 * `set(hours)` turns the hands to a time given as hours since midnight
 * (fractional; the second hand ticks and settles like a quartz movement).
 */
export function wallClock(radius = 760) {
    const R = radius;
    const clock = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({
        color: '#17191d',
        metalness: 0.6,
        roughness: 0.35,
    });
    const brass = new THREE.MeshStandardMaterial({
        color: '#b08a55',
        metalness: 0.8,
        roughness: 0.32,
    });
    // Rim: a rolled lip standing proud of the dial.
    const rim = shade(
        new THREE.Mesh(
            new THREE.LatheGeometry(
                [
                    [R * 0.94, 0],
                    [R * 1.0, 0],
                    [R * 1.04, R * 0.05],
                    [R * 1.04, R * 0.1],
                    [R * 1.0, R * 0.14],
                    [R * 0.95, R * 0.13],
                    [R * 0.94, R * 0.06],
                ].map(([x, y]) => new THREE.Vector2(x, y)),
                96,
            ),
            steel,
        ),
    );
    rim.rotation.x = Math.PI / 2; // lathe axis (+Y) to the wall normal (+Z)
    clock.add(rim);
    const back = shade(
        new THREE.Mesh(new THREE.CylinderGeometry(R, R, R * 0.06, 64), steel),
    );
    back.rotation.x = Math.PI / 2;
    back.position.z = R * 0.03;
    clock.add(back);
    // Dial, painted once.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = '#ece4d3';
        ctx.fillRect(0, 0, 1024, 1024);
        ctx.fillStyle = '#1d1f23';
        ctx.strokeStyle = '#1d1f23';
        for (let i = 0; i < 60; i++) {
            const a = (i / 60) * Math.PI * 2;
            const hour = i % 5 === 0;
            const r0 = hour ? 392 : 430,
                r1 = 470;
            ctx.lineWidth = hour ? 16 : 5;
            ctx.beginPath();
            ctx.moveTo(512 + Math.sin(a) * r0, 512 - Math.cos(a) * r0);
            ctx.lineTo(512 + Math.sin(a) * r1, 512 - Math.cos(a) * r1);
            ctx.stroke();
        }
        ctx.font = '600 84px -apple-system, Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let h = 1; h <= 12; h++) {
            const a = (h / 12) * Math.PI * 2;
            ctx.fillText(
                String(h),
                512 + Math.sin(a) * 318,
                512 - Math.cos(a) * 318 + 4,
            );
        }
        ctx.font = '600 34px -apple-system, Helvetica, Arial, sans-serif';
        ctx.fillStyle = '#6d5c45';
        ctx.fillText('BENGALURU', 512, 330);
        ctx.font = '500 28px -apple-system, Helvetica, Arial, sans-serif';
        ctx.fillText('IST · UTC+5:30', 512, 700);
    }
    const dialMap = new THREE.CanvasTexture(canvas);
    dialMap.encoding = THREE.sRGBEncoding;
    dialMap.anisotropy = 8;
    const dial = new THREE.Mesh(
        new THREE.CircleGeometry(R * 0.95, 96),
        new THREE.MeshStandardMaterial({ map: dialMap, roughness: 0.7 }),
    );
    dial.name = 'Wall clock dial';
    dial.position.z = R * 0.065;
    dial.receiveShadow = true;
    clock.add(dial);
    // Hands: thin tapered blades pivoting on the centre, stacked outward.
    const hand = (
        length: number,
        width: number,
        tail: number,
        material: THREE.Material,
        z: number,
    ) => {
        const shape = new THREE.Shape();
        shape.moveTo(-width / 2, -tail);
        shape.lineTo(width / 2, -tail);
        shape.lineTo(width * 0.3, length);
        shape.lineTo(-width * 0.3, length);
        shape.closePath();
        const mesh = shade(
            new THREE.Mesh(
                new THREE.ExtrudeGeometry(shape, {
                    depth: 8,
                    bevelEnabled: false,
                }),
                material,
            ),
        );
        const pivot = new THREE.Group();
        pivot.position.z = z;
        pivot.add(mesh);
        clock.add(pivot);
        return pivot;
    };
    const ink = new THREE.MeshStandardMaterial({
        color: '#141518',
        roughness: 0.5,
    });
    const garnet = new THREE.MeshStandardMaterial({
        color: '#a50044',
        roughness: 0.45,
    });
    const hours = hand(R * 0.5, 44, R * 0.12, ink, R * 0.075);
    const minutes = hand(R * 0.8, 30, R * 0.14, ink, R * 0.075 + 12);
    const seconds = hand(R * 0.86, 10, R * 0.24, garnet, R * 0.075 + 24);
    const cap = shade(
        new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 40, 24), brass),
    );
    cap.rotation.x = Math.PI / 2;
    cap.position.z = R * 0.075 + 40;
    clock.add(cap);
    const turn = (pivot: THREE.Object3D, fraction: number) =>
        (pivot.rotation.z = -fraction * Math.PI * 2);
    const set = (h: number) => {
        const whole = Math.floor(h * 3600);
        const part = h * 3600 - whole;
        // Quartz tick: the second hand jumps and settles in a tenth of a second.
        const tick = Math.min(1, part / 0.12);
        const s = (whole % 60) - 1 + tick * tick * (3 - 2 * tick);
        turn(seconds, s / 60);
        turn(minutes, ((h * 60) % 60) / 60);
        turn(hours, (h % 12) / 12);
    };
    set(0);
    return { group: clock, set, hands: { hours, minutes, seconds } };
}

/**
 * An architect's desk lamp: weighted base, two slim arms on sprung joints,
 * and a spun-metal shade angled down at the work. Stands on its origin and
 * reaches along +X. Returns the lamp, its shade glow material and where the
 * bulb sits (for a light) in lamp coordinates.
 */
export function deskLamp(glow: THREE.MeshStandardMaterial) {
    const lamp = new THREE.Group();
    const enamel = new THREE.MeshStandardMaterial({
        color: '#1a1c20',
        metalness: 0.35,
        roughness: 0.4,
    });
    const brass = new THREE.MeshStandardMaterial({
        color: '#b08a55',
        metalness: 0.8,
        roughness: 0.3,
    });
    const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
        const length = a.distanceTo(b);
        const mesh = shade(
            new THREE.Mesh(new THREE.CylinderGeometry(r, r, length, 16), brass),
        );
        mesh.position.copy(a).add(b).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            b.clone().sub(a).normalize(),
        );
        lamp.add(mesh);
    };
    const joint = (p: THREE.Vector3, r: number) => {
        const knob = shade(
            new THREE.Mesh(
                new THREE.CylinderGeometry(r, r, r * 1.4, 20),
                enamel,
            ),
        );
        knob.rotation.x = Math.PI / 2;
        knob.position.copy(p);
        lamp.add(knob);
    };
    const base = shade(
        new THREE.Mesh(new THREE.CylinderGeometry(210, 235, 70, 48), enamel),
    );
    base.position.y = 35;
    lamp.add(base);
    const shoulder = new THREE.Vector3(0, 150, 0);
    const elbow = new THREE.Vector3(260, 1130, 0);
    const wrist = new THREE.Vector3(930, 1060, 0);
    const post = shade(
        new THREE.Mesh(new THREE.CylinderGeometry(34, 44, 90, 16), enamel),
    );
    post.position.y = 110;
    lamp.add(post);
    // Twin rods per arm, the way sprung lamps are built.
    for (const z of [-26, 26]) {
        rod(shoulder.clone().setZ(z), elbow.clone().setZ(z), 11);
        rod(elbow.clone().setZ(z), wrist.clone().setZ(z), 10);
    }
    joint(shoulder, 42);
    joint(elbow, 38);
    joint(wrist, 34);
    // Shade: an open cone tipped forward and down, bulb glowing inside.
    const head = new THREE.Group();
    head.position.copy(wrist);
    head.rotation.z = -2.5; // cone axis (+Y) swung down toward the desk
    const cone = shade(
        new THREE.Mesh(
            new THREE.CylinderGeometry(70, 205, 330, 40, 1, true),
            new THREE.MeshStandardMaterial({
                color: '#1a1c20',
                metalness: 0.35,
                roughness: 0.4,
                side: THREE.DoubleSide,
            }),
        ),
    );
    cone.position.y = 200;
    cone.rotation.x = Math.PI; // wide mouth away from the joint
    head.add(cone);
    const capEnd = shade(
        new THREE.Mesh(new THREE.CylinderGeometry(72, 72, 40, 24), enamel),
    );
    capEnd.position.y = 30;
    head.add(capEnd);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(70, 20, 12), glow);
    bulb.position.y = 250;
    bulb.castShadow = false;
    head.add(bulb);
    const diffuser = new THREE.Mesh(new THREE.CircleGeometry(195, 40), glow);
    diffuser.position.y = 355;
    diffuser.rotation.x = -Math.PI / 2; // faces out of the mouth
    diffuser.castShadow = false;
    head.add(diffuser);
    lamp.add(head);
    lamp.updateMatrixWorld(true);
    const bulbAt = bulb.getWorldPosition(new THREE.Vector3());
    const aim = head.localToWorld(new THREE.Vector3(0, 2000, 0));
    return { lamp, bulbAt, aim };
}

/**
 * A soft rounded block: a finely subdivided box pulled into rounded edges
 * of radius `r`, then reshaped by `deform` (given the point and its unit
 * position, -1..1 on each axis). Welded, so it shades smoothly; UVs are a
 * simple side projection, enough for a fabric weave.
 */
function softBlock(
    w: number,
    h: number,
    d: number,
    r: number,
    deform?: (p: THREE.Vector3, u: THREE.Vector3) => void,
    segments = [20, 24, 12],
) {
    let geometry: THREE.BufferGeometry = new THREE.BoxGeometry(
        w,
        h,
        d,
        segments[0],
        segments[1],
        segments[2],
    );
    geometry.deleteAttribute('normal');
    geometry.deleteAttribute('uv');
    geometry = mergeVertices(geometry);
    const pos = geometry.attributes.position;
    const half = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
    const p = new THREE.Vector3(),
        inner = new THREE.Vector3(),
        u = new THREE.Vector3();
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i);
        u.set((2 * p.x) / w, (2 * p.y) / h, (2 * p.z) / d);
        inner.copy(p).clamp(half.clone().negate(), half);
        p.sub(inner);
        if (p.lengthSq() > 0) p.setLength(r);
        p.add(inner);
        deform?.(p, u);
        pos.setXYZ(i, p.x, p.y, p.z);
        uv[i * 2] = (p.x + p.z) / 400;
        uv[i * 2 + 1] = p.y / 400;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    return geometry;
}

/** A padded strap or piping: a flat rounded section swept along points. */
function sweep(
    points: THREE.Vector3[],
    width: number,
    thickness: number,
    material: THREE.Material,
    closed = false,
) {
    const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
    const tube = new THREE.TubeGeometry(
        curve,
        Math.max(24, points.length * 12),
        1,
        10,
        closed,
    );
    // Flatten the round tube to the strap's section, across its binormal.
    const frames = curve.computeFrenetFrames(
        Math.max(24, points.length * 12),
        closed,
    );
    const pos = tube.attributes.position;
    const segs = Math.max(24, points.length * 12);
    const c = new THREE.Vector3(),
        v = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
        curve.getPointAt(i / segs, c);
        const n = frames.normals[i % frames.normals.length],
            b = frames.binormals[i % frames.binormals.length];
        for (let j = 0; j <= 10; j++) {
            const k = i * 11 + j;
            if (k >= pos.count) break;
            v.fromBufferAttribute(pos, k).sub(c);
            const a = v.dot(n),
                bb = v.dot(b);
            v.copy(c)
                .addScaledVector(n, a * (thickness / 2))
                .addScaledVector(b, bb * (width / 2));
            pos.setXYZ(k, v.x, v.y, v.z);
        }
    }
    tube.computeVertexNormals();
    return shade(new THREE.Mesh(tube, material));
}

/** A fine woven relief, tiled: nylon and polyester read as cloth. */
let weaveMap: THREE.CanvasTexture | null = null;
function weave() {
    if (weaveMap) return weaveMap;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx)
        for (let y = 0; y < 64; y++)
            for (let x = 0; x < 64; x++) {
                const warp = (x >> 2) % 2 === (y >> 2) % 2;
                const g = 110 + (warp ? 60 : 0) + ((x * 7 + y * 13) % 17);
                ctx.fillStyle = `rgb(${g},${g},${g})`;
                ctx.fillRect(x, y, 1, 1);
            }
    weaveMap = new THREE.CanvasTexture(canvas);
    weaveMap.wrapS = weaveMap.wrapT = THREE.RepeatWrapping;
    weaveMap.repeat.set(9, 9);
    return weaveMap;
}

/**
 * A daypack standing on its base, straps to -Z, front pocket to +Z:
 * a softly domed main compartment with a curved zip round the top, a
 * bulging front pocket with its own zip and pulls, mesh bottle pockets,
 * padded shoulder straps and back panel, webbing grab handle and a leather
 * patch. About 32 × 39 × 17 cm (room units, origin at the base centre).
 */
export function backpack(shellColor = '#1c1e22', pocketColor = '#28324a') {
    const pack = new THREE.Group();
    const cloth = (color: string, roughness = 0.92) =>
        new THREE.MeshStandardMaterial({
            color,
            roughness,
            bumpMap: weave(),
            bumpScale: 1.2,
        });
    const shell = cloth(shellColor);
    const pocketCloth = cloth(pocketColor);
    const base = cloth('#141518', 0.85);
    const webbing = cloth('#101114', 0.8);
    const zip = new THREE.MeshStandardMaterial({
        color: '#0c0d0f',
        roughness: 0.55,
    });
    const metal = new THREE.MeshStandardMaterial({
        color: '#9a9ea4',
        metalness: 0.85,
        roughness: 0.3,
    });
    const W = 1050,
        H = 1280,
        D = 560;
    // Main compartment: domed top, full front, flatter back, soft sides.
    const body = new THREE.Mesh(
        softBlock(W, H, D, 170, (p, u) => {
            const top = Math.max(0, u.y);
            p.x *= 1 - 0.14 * top * top; // narrower toward the dome
            p.y += 60 * (1 - u.x * u.x) * top; // crown rises in the middle
            if (u.z > 0)
                p.z += 70 * (1 - u.x * u.x) * (1 - u.y * u.y); // full front
            else p.z -= 18 * (1 - u.x * u.x) * (1 - u.y * u.y);
            // A little sag in the sides where nothing fills it.
            p.x -= Math.sign(u.x) * 22 * (1 - u.y * u.y) * (1 - u.z * u.z);
        }),
        shell,
    );
    body.position.y = H / 2 + 40;
    pack.add(shade(body));
    // Base panel, a tougher darker fabric.
    const bottom = new THREE.Mesh(
        softBlock(W - 30, 110, D - 20, 50, undefined, [12, 3, 8]),
        base,
    );
    bottom.position.y = 60;
    pack.add(shade(bottom));
    // Main zip: an arch over the top from side seam to side seam.
    const arch: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
        const t = i / 16,
            a = Math.PI * t;
        arch.push(
            new THREE.Vector3(
                -Math.cos(a) * (W / 2 - 40) * (1 - 0.12 * Math.sin(a)),
                H * 0.52 +
                    Math.sin(a) * (H * 0.5 - 30) * (0.65 + 0.35 * Math.sin(a)),
                D * 0.5 + 12 - 140 * Math.sin(a) * 0.0,
            ),
        );
    }
    const mainZip = sweep(arch, 40, 18, zip);
    mainZip.position.z = -D * 0.02;
    pack.add(mainZip);
    // Front pocket: a bulging panel low on the front, with a zip round it.
    const pocketW = 820,
        pocketH = 600,
        pocketD = 160;
    const pocket = new THREE.Mesh(
        softBlock(
            pocketW,
            pocketH,
            pocketD,
            70,
            (p, u) => {
                if (u.z > 0) p.z += 55 * (1 - u.x * u.x) * (1 - u.y * u.y);
                p.x *= 1 - 0.06 * Math.max(0, u.y);
            },
            [16, 12, 6],
        ),
        pocketCloth,
    );
    const pocketY = 430,
        pocketZ = D / 2 + 40;
    pocket.position.set(0, pocketY, pocketZ);
    pack.add(shade(pocket));
    const rim: THREE.Vector3[] = [];
    for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const x = Math.cos(a),
            y = Math.sin(a);
        // Superellipse: a rounded rectangle.
        const sx = Math.sign(x) * Math.abs(x) ** 0.35,
            sy = Math.sign(y) * Math.abs(y) ** 0.35;
        rim.push(
            new THREE.Vector3(
                sx * (pocketW / 2 - 55),
                pocketY + sy * (pocketH / 2 - 55),
                pocketZ + pocketD / 2 + 40 + 30 * (1 - sy * sy) * (1 - sx * sx),
            ),
        );
    }
    pack.add(sweep(rim, 30, 14, zip, true));
    // Zip pulls: a metal slider with a cord loop, hanging.
    const pull = (x: number, y: number, z: number, tilt: number) => {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        g.rotation.z = tilt;
        const slider = shade(
            new THREE.Mesh(new RoundedBoxGeometry(50, 70, 26, 2, 8), metal),
        );
        g.add(slider);
        const tab = shade(
            new THREE.Mesh(new RoundedBoxGeometry(34, 150, 12, 2, 6), webbing),
        );
        tab.position.y = -105;
        g.add(tab);
        pack.add(g);
    };
    pull(-150, pocketY + pocketH / 2 - 55, pocketZ + pocketD / 2 + 52, 0.1);
    pull(120, pocketY + pocketH / 2 - 55, pocketZ + pocketD / 2 + 52, -0.08);
    pull(-360, H * 0.97, D * 0.3, 0.5);
    pull(-250, H * 1.02, D * 0.28, 0.3);
    // Leather patch on the pocket.
    const patch = shade(
        new THREE.Mesh(
            new RoundedBoxGeometry(170, 110, 14, 2, 12),
            new THREE.MeshStandardMaterial({
                color: '#6b4a32',
                roughness: 0.6,
            }),
        ),
    );
    patch.position.set(0, pocketY + 60, pocketZ + pocketD / 2 + 62);
    pack.add(patch);
    // Stretch-mesh bottle pockets on the sides.
    const mesh = cloth('#202226', 1);
    for (const side of [-1, 1]) {
        const bottle = new THREE.Mesh(
            softBlock(
                130,
                520,
                D - 80,
                55,
                (p, u) => {
                    p.x += side * 30 * (1 - u.y * u.y) * (1 - u.z * u.z);
                },
                [6, 10, 8],
            ),
            mesh,
        );
        bottle.position.set(side * (W / 2 - 20), 330, 0);
        pack.add(shade(bottle));
        // Elastic binding along the top of it.
        pack.add(
            sweep(
                [
                    new THREE.Vector3(side * (W / 2 + 30), 590, -D / 2 + 60),
                    new THREE.Vector3(side * (W / 2 + 55), 585, 0),
                    new THREE.Vector3(side * (W / 2 + 30), 590, D / 2 - 60),
                ],
                30,
                20,
                webbing,
            ),
        );
    }
    // Padded back panel and S-curved shoulder straps.
    const back = new THREE.Mesh(
        softBlock(
            W - 180,
            H - 260,
            70,
            34,
            (p, u) => {
                p.z -= 25 * (1 - u.x * u.x) * (1 - u.y * u.y);
            },
            [10, 12, 3],
        ),
        cloth('#18191c', 0.95),
    );
    back.position.set(0, H / 2 + 60, -D / 2 - 40);
    pack.add(shade(back));
    for (const side of [-1, 1]) {
        const strap = sweep(
            [
                new THREE.Vector3(side * 160, H * 0.98, -D / 2 - 40),
                new THREE.Vector3(side * 230, H * 0.9, -D / 2 - 170),
                new THREE.Vector3(side * 320, H * 0.62, -D / 2 - 210),
                new THREE.Vector3(side * 380, H * 0.34, -D / 2 - 170),
                new THREE.Vector3(side * 420, 200, -D / 2 - 60),
            ],
            190,
            55,
            cloth('#151619', 0.95),
        );
        pack.add(strap);
        // Adjuster webbing and its buckle at the bottom corner.
        pack.add(
            sweep(
                [
                    new THREE.Vector3(side * 420, 210, -D / 2 - 60),
                    new THREE.Vector3(side * 470, 120, -D / 2 + 10),
                    new THREE.Vector3(side * (W / 2 - 40), 90, -D / 2 + 40),
                ],
                70,
                10,
                webbing,
            ),
        );
        const buckle = shade(
            new THREE.Mesh(new RoundedBoxGeometry(90, 70, 24, 2, 6), zip),
        );
        buckle.position.set(side * 450, 160, -D / 2 - 25);
        pack.add(buckle);
    }
    // Webbing grab handle over the top.
    pack.add(
        sweep(
            [
                new THREE.Vector3(-120, H * 0.99, -D / 2 + 10),
                new THREE.Vector3(-70, H * 1.1, -D / 2 - 10),
                new THREE.Vector3(70, H * 1.1, -D / 2 - 10),
                new THREE.Vector3(120, H * 0.99, -D / 2 + 10),
            ],
            80,
            16,
            webbing,
        ),
    );
    return pack;
}

/**
 * A hard-shell four-wheel cabin suitcase, standing on its spinners, front
 * to +Z: two polycarbonate halves with moulded vertical ribs and rounded
 * corners, a zip band between them, a recessed telescopic handle
 * (extended), top and side carry handles, a TSA lock and four twin-wheel
 * casters. `size` is the shell (room units); origin on the floor.
 */
export function spinnerSuitcase(
    color = '#4c2a33',
    size = { width: 1330, height: 1910, depth: 850 },
) {
    const { width: W, height: H, depth: D } = size;
    const suitcase = new THREE.Group();
    const shellMaterial = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.32,
        metalness: 0.05,
        clearcoat: 0.6,
        clearcoatRoughness: 0.25,
    });
    const rubber = new THREE.MeshStandardMaterial({
        color: '#111214',
        roughness: 0.75,
    });
    const plastic = new THREE.MeshStandardMaterial({
        color: '#1b1c1f',
        roughness: 0.45,
    });
    const aluminium = new THREE.MeshStandardMaterial({
        color: '#b9bcc0',
        metalness: 0.9,
        roughness: 0.28,
    });
    const WHEEL = 150;
    const base = WHEEL * 2 + 40;
    // Ribs: six raised vertical channels across the front and back faces.
    const ribs = (u: THREE.Vector3) => {
        const face = Math.max(0, Math.abs(u.z) * 1.4 - 0.4);
        const along = Math.max(0, 1 - Math.abs(u.y) ** 8);
        const wave = Math.cos(u.x * Math.PI * 3.5) ** 16;
        return 26 * wave * face * along * (1 - u.x ** 10);
    };
    const halfD = D / 2 - 40;
    for (const side of [-1, 1]) {
        const half = new THREE.Mesh(
            softBlock(
                W,
                H,
                halfD,
                150,
                (p, u) => {
                    // Only the outer face carries the ribs and a gentle crown.
                    if (u.z * side > 0) {
                        p.z +=
                            side *
                            (ribs(u) + 30 * (1 - u.x * u.x) * (1 - u.y * u.y));
                    }
                },
                [36, 14, 6],
            ),
            shellMaterial,
        );
        // Each half is only rounded on its outer side: squash the inner
        // rounding flat against the zip band.
        const pos = half.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const z = pos.getZ(i) * side;
            if (z < 0) pos.setZ(i, side * Math.max(z, -halfD / 2 + 10));
        }
        half.geometry.computeVertexNormals();
        half.position.set(0, base + H / 2, side * (halfD / 2 + 30));
        suitcase.add(shade(half));
    }
    // The zip band between the halves, a little inset.
    const band = new THREE.Mesh(
        softBlock(W - 30, H - 30, 90, 130, undefined, [12, 12, 2]),
        new THREE.MeshStandardMaterial({ color: '#141417', roughness: 0.8 }),
    );
    band.position.set(0, base + H / 2, 0);
    suitcase.add(shade(band));
    // Casters: a swivel housing and twin wheels at each corner.
    for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
            const caster = new THREE.Group();
            caster.position.set(sx * (W / 2 - 150), 0, sz * (D / 2 - 130));
            caster.rotation.y = 0.35 * sx * sz;
            const housing = shade(
                new THREE.Mesh(
                    new RoundedBoxGeometry(230, 150, 200, 3, 40),
                    plastic,
                ),
            );
            housing.position.y = base - 60;
            caster.add(housing);
            for (const wx of [-55, 55]) {
                const wheel = shade(
                    new THREE.Mesh(
                        new THREE.CylinderGeometry(
                            WHEEL / 2 + 25,
                            WHEEL / 2 + 25,
                            60,
                            28,
                        ),
                        rubber,
                    ),
                );
                wheel.rotation.z = Math.PI / 2;
                wheel.position.set(wx, WHEEL / 2 + 25, 30);
                caster.add(wheel);
                const hub = shade(
                    new THREE.Mesh(
                        new THREE.CylinderGeometry(35, 35, 64, 16),
                        aluminium,
                    ),
                );
                hub.rotation.z = Math.PI / 2;
                hub.position.copy(wheel.position);
                caster.add(hub);
            }
            suitcase.add(caster);
        }
    // Telescopic handle, extended, rising from a recess at the back.
    const top = base + H;
    const recess = shade(
        new THREE.Mesh(new RoundedBoxGeometry(760, 60, 180, 3, 25), plastic),
    );
    recess.position.set(0, top + 10, -D / 2 + 150);
    suitcase.add(recess);
    for (const x of [-300, 300]) {
        const outer = shade(
            new THREE.Mesh(
                new RoundedBoxGeometry(70, 360, 44, 2, 12),
                aluminium,
            ),
        );
        outer.position.set(x, top + 200, -D / 2 + 150);
        suitcase.add(outer);
        const inner = shade(
            new THREE.Mesh(
                new RoundedBoxGeometry(56, 420, 34, 2, 10),
                aluminium,
            ),
        );
        inner.position.set(x, top + 580, -D / 2 + 150);
        suitcase.add(inner);
    }
    const grip = shade(
        new THREE.Mesh(new RoundedBoxGeometry(760, 110, 120, 4, 45), plastic),
    );
    grip.position.set(0, top + 820, -D / 2 + 150);
    suitcase.add(grip);
    // Carry handles: top and side, soft-touch rubber on moulded mounts.
    const carry = (
        at: THREE.Vector3,
        rotation: THREE.Euler,
        length: number,
    ) => {
        const g = new THREE.Group();
        g.position.copy(at);
        g.rotation.copy(rotation);
        for (const x of [-length / 2, length / 2]) {
            const mount = shade(
                new THREE.Mesh(
                    new RoundedBoxGeometry(110, 50, 110, 3, 20),
                    plastic,
                ),
            );
            mount.position.set(x, 10, 0);
            g.add(mount);
        }
        g.add(
            sweep(
                [
                    new THREE.Vector3(-length / 2, 30, 0),
                    new THREE.Vector3(-length / 2 + 60, 110, 0),
                    new THREE.Vector3(length / 2 - 60, 110, 0),
                    new THREE.Vector3(length / 2, 30, 0),
                ],
                90,
                40,
                rubber,
            ),
        );
        suitcase.add(g);
    };
    carry(
        new THREE.Vector3(0, top, D / 2 - 250),
        new THREE.Euler(0, 0, 0),
        460,
    );
    carry(
        new THREE.Vector3(W / 2, base + H / 2, 0),
        new THREE.Euler(0, Math.PI / 2, -Math.PI / 2),
        460,
    );
    // TSA combination lock on the side, near the top.
    const lock = shade(
        new THREE.Mesh(new RoundedBoxGeometry(40, 220, 150, 2, 14), plastic),
    );
    lock.position.set(-W / 2 - 12, base + H - 320, 0);
    suitcase.add(lock);
    for (let i = 0; i < 3; i++) {
        const dial = shade(
            new THREE.Mesh(
                new THREE.CylinderGeometry(22, 22, 18, 16),
                aluminium,
            ),
        );
        dial.rotation.z = Math.PI / 2;
        dial.position.set(-W / 2 - 32, base + H - 380 + i * 55, 20);
        suitcase.add(dial);
    }
    return suitcase;
}
