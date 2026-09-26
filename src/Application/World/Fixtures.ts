import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

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
                    64,
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
