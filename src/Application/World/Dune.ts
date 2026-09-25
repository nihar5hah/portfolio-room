import * as THREE from 'three';

/**
 * Pierre Paulin's Dune (1968–72), modelled for the TV lounge.
 *
 * The real ensemble is square foam modules on the floor whose tops form one
 * landscape: low seats, and backrests made of faceted pyramids that rise and
 * fall across the module seams. Here that landscape is a single heightfield
 * (metres, ensemble frame: x across, z from the back edge toward the TV), and
 * each module samples it inside a rounded-square outline with a soft edge,
 * like stretch fabric pulled over foam.
 */
export const DUNE = {
    module: 1.0, // module footprint, m
    gap: 0.014, // visible seam between modules, m
    edge: 0.05, // round-over radius of each module's top edge, m
    corner: 0.09, // plan-view corner radius, m
    seat: 0.36, // seat height, m
    columns: 3,
    rows: 2,
};

/** Cells as [column, row]; the front-centre cell holds the oasis table. */
export const DUNE_MODULES: [number, number][] = [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [2, 1],
];
export const DUNE_TABLE: [number, number] = [1, 1];

// Faceted pyramids: height h at (x, z), falling kx per metre across and kz
// per metre in depth. Along the back they form the backrest ridge; along the
// outer sides they form the arms. Irregular heights give the "dune" profile.
const W = DUNE.columns / 2;
const PEAKS = [
    // backrest ridge: broad folds, not spikes
    { x: -1.15, z: 0, h: 0.78, kx: 0.5, kz: 0.72 },
    { x: -0.35, z: 0, h: 0.66, kx: 0.5, kz: 0.72 },
    { x: 0.35, z: 0, h: 0.84, kx: 0.5, kz: 0.72 },
    { x: 1.2, z: 0, h: 0.7, kx: 0.5, kz: 0.72 },
    // left arm
    { x: -W, z: 0.55, h: 0.66, kx: 0.95, kz: 0.55 },
    { x: -W, z: 1.55, h: 0.54, kx: 0.95, kz: 0.55 },
    // right arm
    { x: W, z: 0.7, h: 0.62, kx: 0.95, kz: 0.55 },
    { x: W, z: 1.6, h: 0.52, kx: 0.95, kz: 0.55 },
]

/** Top of the landscape at (x, z), in metres. */
export function duneHeight(x: number, z: number) {
    // Smooth maximum: facets stay crisp but their creases soften like fabric.
    const k = 0.032;
    let sum = Math.exp(DUNE.seat / k - 40);
    for (const p of PEAKS) {
        const h = p.h - p.kx * Math.abs(x - p.x) - p.kz * Math.abs(z - p.z);
        sum += Math.exp(h / k - 40);
    }
    return k * (Math.log(sum) + 40);
}

/**
 * One module's skin: a cosine-spaced top grid following the landscape with a
 * rounded edge, joined to vertical sides that reach the floor (y = 0).
 * Positions are in the ensemble frame, x centred, z from the back edge.
 */
export function duneModuleGeometry(column: number, row: number) {
    const half = (DUNE.module - DUNE.gap) / 2;
    const r = DUNE.edge;
    const rc = DUNE.corner;
    const cx = (column + 0.5) * DUNE.module - W;
    const cz = (row + 0.5) * DUNE.module;
    const N = 56;
    const inner = half - rc;
    const outline = (x: number, z: number) => {
        const qx = Math.abs(x) - inner;
        const qz = Math.abs(z) - inner;
        return (
            Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) +
            Math.min(Math.max(qx, qz), 0) -
            rc
        );
    };
    // Points outside the rounded square move onto it.
    const project = (x: number, z: number): [number, number] => {
        if (outline(x, z) <= 0) return [x, z];
        const qx = Math.abs(x) - inner;
        const qz = Math.abs(z) - inner;
        if (qx > 0 && qz > 0) {
            const l = Math.hypot(qx, qz);
            return [
                Math.sign(x) * (inner + (qx / l) * rc),
                Math.sign(z) * (inner + (qz / l) * rc),
            ];
        }
        return qx > qz ? [Math.sign(x) * half, z] : [x, Math.sign(z) * half];
    };
    const positions: number[] = [];
    const uvs: number[] = [];
    const index: number[] = [];
    const vertex = (x: number, y: number, z: number, u: number, v: number) => {
        positions.push(x, y, z);
        uvs.push(u * 4, v * 4);
        return positions.length / 3 - 1;
    };
    const spacing = (i: number) =>
        -half + half * (1 - Math.cos((Math.PI * i) / N));
    const top: number[][] = [];
    for (let i = 0; i <= N; i++) {
        top.push([]);
        for (let j = 0; j <= N; j++) {
            const [px, pz] = project(spacing(i), spacing(j));
            const e = Math.max(0, -outline(px, pz));
            const x = cx + px;
            const z = cz + pz;
            const round = e < r ? Math.sqrt(r * r - (r - e) * (r - e)) : r;
            top[i].push(vertex(x, duneHeight(x, z) - r + round, z, x, z));
        }
    }
    for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) {
            const a = top[i][j];
            const b = top[i][j + 1];
            const c = top[i + 1][j];
            const d = top[i + 1][j + 1];
            index.push(a, b, c, b, d, c);
        }
    // The outline loop, walked so the side faces point outward.
    const ring: number[] = [];
    for (let i = 0; i < N; i++) ring.push(top[i][0]);
    for (let j = 0; j < N; j++) ring.push(top[N][j]);
    for (let i = N; i > 0; i--) ring.push(top[i][N]);
    for (let j = N; j > 0; j--) ring.push(top[0][j]);
    const rows = 4;
    let previous = ring;
    let travelled = 0;
    const lengths = ring.map((current, n) => {
        const next = ring[(n + 1) % ring.length];
        const dx = positions[next * 3] - positions[current * 3];
        const dz = positions[next * 3 + 2] - positions[current * 3 + 2];
        const at = travelled;
        travelled += Math.hypot(dx, dz);
        return at;
    });
    for (let k = 1; k <= rows; k++) {
        const level = ring.map((n, m) =>
            vertex(
                positions[n * 3],
                positions[n * 3 + 1] * (1 - k / rows),
                positions[n * 3 + 2],
                lengths[m],
                positions[n * 3 + 1] * (1 - k / rows),
            ),
        );
        for (let n = 0; n < ring.length; n++) {
            const m = (n + 1) % ring.length;
            index.push(previous[n], previous[m], level[n]);
            index.push(previous[m], level[m], level[n]);
        }
        previous = level;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry;
}

/** Fine knit for the stretch fabric, used as a bump map. */
export function duneKnit() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d')!;
    for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) {
            // Interlocking loops: a soft rib every 4 px, broken by fine noise.
            const rib =
                0.5 +
                0.35 * Math.sin(((x + (y % 8 < 4 ? 0 : 2)) * Math.PI) / 2);
            const noise = ((x * 73 + y * 151) % 97) / 97;
            const value = Math.round(255 * (0.7 * rib + 0.3 * noise));
            context.fillStyle = `rgb(${value},${value},${value})`;
            context.fillRect(x, y, 1, 1);
        }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 10);
    return texture;
}
