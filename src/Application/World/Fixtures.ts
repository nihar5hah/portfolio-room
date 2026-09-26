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
