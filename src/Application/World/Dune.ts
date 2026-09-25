import * as THREE from 'three';

/**
 * Photo-referenced recreation of the Dune upholstery, not a factory CAD model.
 * Reference: paulinpaulinpaulin.com/en/designs/ensemble-dune-2/
 *
 * Each block has four padded triangular panels meeting at a low seat junction.
 * Raised BACK EDGES are level, not a collection of isolated mountain peaks.
 * Dimensions below are room-fitting estimates; no technical drawing is available.
 * Coordinates are metres: +Z faces the TV, X is centred on the ensemble.
 */
export const DUNE = {
    module: 1,
    gap: 0.012,
    edge: 0.032,
    seat: 0.3,
    back: 0.7,
    columns: 3,
    rows: 2,
};

export const DUNE_MODULES: [number, number][] = [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
];

/** A slender Duneside-style table at the junction of four upholstered modules. */
export const DUNE_TABLE = { x: 0.5, z: 1, height: 0.53, radius: 0.24 };

type Point = [number, number, number];

/** NW, NE, SE, SW then the low central seam junction, in module-local metres. */
export function duneControlPoints(column: number, row: number): Point[] {
    const h = (DUNE.module - DUNE.gap) / 2 - DUNE.edge;
    const left = column === 0;
    const right = column === DUNE.columns - 1;
    const back = row === 0;
    // The corner units wrap the raised rim around the outside of the ensemble.
    const nw = back ? DUNE.back : left ? 0.48 : DUNE.seat;
    const ne = back ? DUNE.back : right ? 0.48 : DUNE.seat;
    const sw = back && left ? 0.48 : DUNE.seat;
    const se = back && right ? 0.48 : DUNE.seat;
    return [
        [-h, nw, -h],
        [h, ne, -h],
        [h, se, h],
        [-h, sw, h],
        [0, back ? 0.282 : 0.28, back ? 0.055 : 0],
    ];
}

/** Smooth rounded-square mapping with no collapsed/zero-area corner triangles. */
function roundedPlan(x: number, z: number, half: number): [number, number] {
    const radius = Math.max(Math.abs(x), Math.abs(z));
    if (radius === 0) return [0, 0];
    const norm = Math.pow(
        Math.pow(Math.abs(x / radius), 18) + Math.pow(Math.abs(z / radius), 18),
        1 / 18,
    );
    // Only the outer contour needs rounding; preserve the broad triangular faces.
    const blend = Math.pow(radius / half, 6);
    const scale = 1 + (1 / norm - 1) * blend;
    return [x * scale, z * scale];
}

/** Closed, indexed upholstery shell with panel-aligned tessellation and rolled hems. */
export function duneModuleGeometry(column: number, row: number) {
    const control = duneControlPoints(column, row);
    const radius = DUNE.edge;
    const half = (DUNE.module - DUNE.gap) / 2 - radius;
    const cx = (column + 0.5 - DUNE.columns / 2) * DUNE.module;
    const cz = (row + 0.5) * DUNE.module;
    const segments = 48;
    const positions: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const lookup = new Map<string, number>();
    const perimeter: number[] = [];

    const vertex = (x: number, y: number, z: number, tone = 1) => {
        const key = [x, y, z].map((v) => Math.round(v * 1e7)).join(',');
        const existing = lookup.get(key);
        if (existing !== undefined) return existing;
        const id = positions.length / 3;
        positions.push(x + cx, y, z + cz);
        // A little Y in the projection keeps the weave visible on vertical skirts.
        uvs.push(x + 0.31 * y, z + 0.73 * y);
        colors.push(tone, tone, tone);
        lookup.set(key, id);
        return id;
    };
    const get = (id: number): Point => [
        positions[id * 3] - cx,
        positions[id * 3 + 1],
        positions[id * 3 + 2] - cz,
    ];

    for (let panel = 0; panel < 4; panel++) {
        const a = control[panel];
        const b = control[(panel + 1) % 4];
        const c = control[4];
        const grid: number[][] = [];
        for (let i = 0; i <= segments; i++) {
            grid.push([]);
            for (let j = 0; j <= segments - i; j++) {
                const u = i / segments;
                const v = j / segments;
                const w = 1 - u - v;
                const x = a[0] * w + b[0] * u + c[0] * v;
                const z = a[2] * w + b[2] * u + c[2] * v;
                const base = a[1] * w + b[1] * u + c[1] * v;
                // Broad stuffed fabric panels. Padding falls away into the diagonal
                // channels; those channels follow real panel boundaries exactly.
                const q = Math.max(0, 27 * u * v * w);
                // Finite, zero slope at a seam: unlike fractional powers, this
                // creates a softly compressed stitch channel rather than a knife fold.
                const padding = (1.08 * q * q) / (q + 0.08);
                const loft =
                    (row === 0 && panel === 0 ? 0.065 : 0.075) * padding;
                // The perimeter bows gently, but backrest crests remain almost level.
                const rimFraction = u + w > 1e-8 ? u / (u + w) : 0;
                const rimLoft =
                    (row === 0 && panel === 0 ? 0.006 : 0.024) *
                    Math.sin(Math.PI * rimFraction) *
                    Math.pow(1 - v, 2);
                const seamDistance = Math.min(u, w);
                const tone = 0.96 + 0.04 * Math.min(1, seamDistance / 0.025);
                const [px, pz] = roundedPlan(x, z, half);
                const id = vertex(px, base + loft + rimLoft, pz, tone);
                grid[i].push(id);
                if (j === 0 && i < segments) perimeter.push(id);
            }
        }
        for (let i = 0; i < segments; i++) {
            for (let j = 0; j < segments - i; j++) {
                indices.push(grid[i][j], grid[i][j + 1], grid[i + 1][j]);
                if (j < segments - i - 1)
                    indices.push(
                        grid[i + 1][j],
                        grid[i][j + 1],
                        grid[i + 1][j + 1],
                    );
            }
        }
    }

    // Outward plan normals of the superellipse. Scale the gradient before raising
    // to a power to avoid underflow. The side and top share all boundary vertices.
    const outward = (x: number, z: number): [number, number] => {
        const nx = Math.sign(x) * Math.pow(Math.abs(x / half), 17);
        const nz = Math.sign(z) * Math.pow(Math.abs(z / half), 17);
        const len = Math.hypot(nx, nz);
        return [nx / len, nz / len];
    };
    let previous = perimeter;
    const connect = (ring: number[]) => {
        for (let n = 0; n < ring.length; n++) {
            const next = (n + 1) % ring.length;
            indices.push(
                previous[n],
                previous[next],
                ring[n],
                previous[next],
                ring[next],
                ring[n],
            );
        }
        previous = ring;
    };
    const rollSteps = 8;
    for (let k = 1; k <= rollSteps; k++) {
        const angle = ((k / rollSteps) * Math.PI) / 2;
        connect(
            perimeter.map((id) => {
                const [x, y, z] = get(id);
                const [nx, nz] = outward(x, z);
                // Shallower roll where two modules meet keeps crests continuous;
                // the exposed outside rim retains its fuller upholstered radius.
                const xRoll = (nx < 0 ? column > 0 : column < DUNE.columns - 1)
                    ? 0.012
                    : radius;
                const zRoll = (nz < 0 ? row > 0 : row < DUNE.rows - 1)
                    ? 0.012
                    : radius;
                const verticalRoll =
                    (Math.abs(nx) * xRoll + Math.abs(nz) * zRoll) /
                    (Math.abs(nx) + Math.abs(nz));
                return vertex(
                    x + nx * radius * Math.sin(angle),
                    y - verticalRoll * (1 - Math.cos(angle)),
                    z + nz * radius * Math.sin(angle),
                );
            }),
        );
    }
    const shoulder = previous;
    const bottomRadius = 0.025;
    for (let k = 1; k <= 6; k++) {
        const t = k / 6;
        connect(
            shoulder.map((id) => {
                const [x, y, z] = get(id);
                const [nx, nz] = outward(x, z);
                const fullness = 0.003 * Math.sin(Math.PI * t);
                return vertex(
                    x + nx * fullness,
                    y * (1 - t) + bottomRadius * t,
                    z + nz * fullness,
                );
            }),
        );
    }
    const hem = previous;
    for (let k = 1; k <= rollSteps; k++) {
        const angle = ((k / rollSteps) * Math.PI) / 2;
        connect(
            hem.map((id) => {
                const [x, , z] = get(id);
                const [nx, nz] = outward(x, z);
                const inset = bottomRadius * (1 - Math.cos(angle));
                return vertex(
                    x - nx * inset,
                    bottomRadius * (1 - Math.sin(angle)),
                    z - nz * inset,
                    0.95,
                );
            }),
        );
    }
    const bottom = vertex(0, 0, 0, 0.95);
    for (let n = 0; n < previous.length; n++)
        indices.push(previous[n], previous[(n + 1) % previous.length], bottom);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3),
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

/** Deterministic fine wool grain, not shiny plastic or a coarse checkerboard. */
export function duneKnit() {
    const size = 128;
    const data = new Uint8Array(size * size * 4);
    let seed = 907;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const noise = seed / 0xffffffff;
            const loop = Math.sin(
                (Math.PI * x) / 2 + 0.6 * Math.sin((Math.PI * y) / 4),
            );
            const value = Math.round(170 + 32 * loop + 35 * noise);
            const at = (y * size + x) * 4;
            data.set([value, value, value, 255], at);
        }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(12, 12);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
}
