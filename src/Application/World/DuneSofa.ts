import * as THREE from 'three';

/**
 * The Dune GLB is one mesh holding a 4 × 4 grid of modules (571 loose
 * pieces). These helpers bake it into room-aligned space, split it back into
 * its modules so single cushions can be turned on their grid cell, and add
 * upholstery shading.
 *
 * Grid cells are addressed in room terms: row 0 is the TV side (+Z), row 3
 * the desk side; column 0 is the window side (-X), column 3 the bed side.
 */
export const DUNE_GRID = 4;

type Attribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
const READ = ['getX', 'getY', 'getZ', 'getW'] as const;
const component = (attribute: Attribute, i: number, c: number) =>
    attribute[READ[c]](i);

/**
 * How single modules are re-posed, keyed `row-col`: `from` swaps in a copy
 * of another cell's module (same grid footprint); `flip` mirrors a module
 * front to back (TV side ↔ desk side) on its cell; `turn` then spins it in
 * quarter turns about +Y, where +1 carries +Z (TV) to +X (bed).
 */
export type DunePoses = Record<
    string,
    { from?: string; flip?: boolean; turn?: number }
>;

/** Merge every mesh under `root` into one geometry in `root`'s parent space. */
export function bakeDune(root: THREE.Object3D): THREE.BufferGeometry {
    root.updateMatrixWorld(true);
    const parts: THREE.BufferGeometry[] = [];
    root.traverse((part) => {
        if (!(part instanceof THREE.Mesh)) return;
        const geometry = (part.geometry as THREE.BufferGeometry).clone();
        geometry.applyMatrix4(part.matrixWorld);
        parts.push(geometry.index ? geometry : indexed(geometry));
    });
    if (parts.length === 1) return parts[0];
    let offset = 0;
    const merged = new THREE.BufferGeometry();
    const names = Object.keys(parts[0].attributes);
    for (const name of names) {
        const size = parts[0].getAttribute(name).itemSize;
        const data: number[] = [];
        for (const part of parts) {
            const source = part.getAttribute(name);
            for (let i = 0; i < source.count; i++)
                for (let c = 0; c < size; c++)
                    data.push(component(source, i, c));
        }
        merged.setAttribute(
            name,
            new THREE.BufferAttribute(new Float32Array(data), size),
        );
    }
    const index: number[] = [];
    for (const part of parts) {
        const array = part.index!.array;
        for (let i = 0; i < array.length; i++) index.push(array[i] + offset);
        offset += part.getAttribute('position').count;
    }
    merged.setIndex(index);
    return merged;
}

function indexed(geometry: THREE.BufferGeometry) {
    const count = geometry.getAttribute('position').count;
    geometry.setIndex([...Array(count).keys()]);
    return geometry;
}

/**
 * Per-vertex upholstery shading: fabric folded into a crease or pulled into
 * a seam sits below the surface around it, so it is darkened. Concavity is
 * measured against nearby vertices of every piece, since the model's seams
 * are gaps between separate panels.
 */
export function shadeCreases(
    geometry: THREE.BufferGeometry,
    radius: number,
    strength = 0.5,
) {
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const count = position.count;
    const cell = radius;
    const buckets = new Map<string, number[]>();
    const key = (x: number, y: number, z: number) =>
        `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    for (let i = 0; i < count; i++) {
        const k = key(position.getX(i), position.getY(i), position.getZ(i));
        let bucket = buckets.get(k);
        if (!bucket) buckets.set(k, (bucket = []));
        bucket.push(i);
    }
    const colors = new Float32Array(count * 3);
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    const n = new THREE.Vector3();
    const mean = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
        p.fromBufferAttribute(position, i);
        n.fromBufferAttribute(normal, i).normalize();
        mean.set(0, 0, 0);
        let weight = 0;
        const bx = Math.floor(p.x / cell),
            by = Math.floor(p.y / cell),
            bz = Math.floor(p.z / cell);
        for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++)
                for (let dz = -1; dz <= 1; dz++) {
                    const bucket = buckets.get(
                        `${bx + dx},${by + dy},${bz + dz}`,
                    );
                    if (!bucket) continue;
                    for (const j of bucket) {
                        q.fromBufferAttribute(position, j);
                        const d = q.distanceTo(p);
                        if (d > radius || j === i) continue;
                        const w = 1 - d / radius;
                        mean.addScaledVector(q, w);
                        weight += w;
                    }
                }
        let shade = 1;
        if (weight > 0) {
            mean.divideScalar(weight);
            // Positive when the surroundings rise above this vertex's plane.
            const cavity = mean.sub(p).dot(n) / radius;
            shade = 1 - strength * THREE.MathUtils.smoothstep(cavity, 0, 0.35);
        }
        colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Split a baked, room-aligned Dune (footprint centred on the origin) into its
 * grid modules. Each module's geometry is centred on its cell, and the mesh
 * sits at the cell centre, so turning it spins the cushion in place.
 */
export function splitDune(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    poses: DunePoses = {},
): THREE.Group {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const size = box.getSize(new THREE.Vector3());
    const position = geometry.getAttribute('position');
    const index = geometry.index!.array as ArrayLike<number>;
    // Loose pieces: union vertices that share a triangle.
    const parent = new Int32Array(position.count).map((_, i) => i);
    const find = (a: number) => {
        while (parent[a] !== a) a = parent[a] = parent[parent[a]];
        return a;
    };
    for (let t = 0; t < index.length; t += 3) {
        const a = find(index[t]);
        parent[find(index[t + 1])] = a;
        parent[find(index[t + 2])] = a;
    }
    // Each piece belongs to the cell holding its bounding-box centre.
    const pieces = new Map<number, THREE.Box3>();
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
        const root = find(i);
        let piece = pieces.get(root);
        if (!piece) pieces.set(root, (piece = new THREE.Box3()));
        piece.expandByPoint(v.fromBufferAttribute(position, i));
    }
    const cellOf = new Map<number, number>();
    const cellSize = { x: size.x / DUNE_GRID, z: size.z / DUNE_GRID };
    // Map.forEach, not for-of: the tests transpile this to ES5.
    pieces.forEach((piece, root) => {
        const c = piece.getCenter(v);
        const col = THREE.MathUtils.clamp(
            Math.floor((c.x - box.min.x) / cellSize.x),
            0,
            DUNE_GRID - 1,
        );
        const row = THREE.MathUtils.clamp(
            Math.floor((box.max.z - c.z) / cellSize.z),
            0,
            DUNE_GRID - 1,
        );
        cellOf.set(root, row * DUNE_GRID + col);
    });
    const group = new THREE.Group();
    const names = Object.keys(geometry.attributes);
    const centreOf = (cell: number) =>
        new THREE.Vector3(
            box.min.x + ((cell % DUNE_GRID) + 0.5) * cellSize.x,
            0,
            box.max.z - (Math.floor(cell / DUNE_GRID) + 0.5) * cellSize.z,
        );
    // Each module's geometry, centred on its own cell.
    const parts: THREE.BufferGeometry[] = [];
    for (let cell = 0; cell < DUNE_GRID * DUNE_GRID; cell++) {
        const centre = centreOf(cell);
        const remap = new Map<number, number>();
        const triangles: number[] = [];
        for (let t = 0; t < index.length; t += 3) {
            if (cellOf.get(find(index[t])) !== cell) continue;
            for (let k = 0; k < 3; k++) {
                const i = index[t + k];
                if (!remap.has(i)) remap.set(i, remap.size);
                triangles.push(remap.get(i)!);
            }
        }
        if (!triangles.length) continue;
        const part = new THREE.BufferGeometry();
        for (const name of names) {
            const source = geometry.getAttribute(name);
            const out = new Float32Array(remap.size * source.itemSize);
            remap.forEach((to, from) => {
                for (let c = 0; c < source.itemSize; c++)
                    out[to * source.itemSize + c] = component(source, from, c);
            });
            part.setAttribute(
                name,
                new THREE.BufferAttribute(out, source.itemSize),
            );
        }
        part.setIndex(triangles);
        part.translate(-centre.x, 0, -centre.z);
        parts[cell] = part;
    }
    for (let cell = 0; cell < DUNE_GRID * DUNE_GRID; cell++) {
        const row = Math.floor(cell / DUNE_GRID),
            col = cell % DUNE_GRID;
        const pose = poses[`${row}-${col}`];
        // `from` re-upholsters a cell with a copy of another module.
        const source = pose?.from
            ? parts[
                  Number(pose.from.split('-')[0]) * DUNE_GRID +
                      Number(pose.from.split('-')[1])
              ]
            : parts[cell];
        if (!source) continue;
        const part = pose?.from ? source.clone() : source;
        part.computeBoundingBox();
        part.computeBoundingSphere();
        const module = new THREE.Mesh(part, material);
        module.name = `Dune module ${row}-${col}`;
        module.position.copy(centreOf(cell));
        if (pose) {
            // A module is not symmetric about its cell centre, so re-centre
            // the re-posed cushion on the footprint it had before.
            const before = part.boundingBox!.getCenter(new THREE.Vector3());
            if (pose.flip) {
                // Baked in, rather than a negative scale: mirror positions
                // and normals, then reverse the winding to keep faces out.
                part.scale(1, 1, -1);
                const order = part.index!;
                for (let t = 0; t < order.count; t += 3) {
                    const a = order.getX(t + 1);
                    order.setX(t + 1, order.getX(t + 2));
                    order.setX(t + 2, a);
                }
                order.needsUpdate = true;
                part.computeBoundingBox();
                part.computeBoundingSphere();
            }
            module.rotation.y = ((pose.turn ?? 0) * Math.PI) / 2;
            const after = part
                .boundingBox!.clone()
                .applyMatrix4(
                    new THREE.Matrix4().makeRotationY(module.rotation.y),
                )
                .getCenter(new THREE.Vector3());
            module.position.x += before.x - after.x;
            module.position.z += before.z - after.z;
            // Keep a re-posed module inside the ensemble's footprint.
            module.updateMatrix();
            const placed = part
                .boundingBox!.clone()
                .applyMatrix4(module.matrix);
            for (const axis of ['x', 'z'] as const) {
                if (placed.min[axis] < box.min[axis])
                    module.position[axis] += box.min[axis] - placed.min[axis];
                else if (placed.max[axis] > box.max[axis])
                    module.position[axis] -= placed.max[axis] - box.max[axis];
            }
        }
        module.castShadow = module.receiveShadow = true;
        group.add(module);
    }
    return group;
}

/**
 * Tileable woven upholstery: a plain weave of soft, slightly irregular yarns
 * with a heathered mottle. Returns a colour-variation map (mean ~0.9, so it
 * barely darkens the tint) and a matching normal map, so the weave catches
 * light like cloth.
 */
export function wovenFabric(
    size = 256,
    threads = 16,
): { map: THREE.DataTexture; normalMap: THREE.DataTexture } {
    let seed = 7;
    const random = () =>
        ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    // Per-thread thickness, so yarns read as spun, not printed.
    const warp = Array.from({ length: threads }, () => 0.85 + 0.3 * random());
    const weft = Array.from({ length: threads }, () => 0.85 + 0.3 * random());
    // Smooth tileable mottle from a few low-frequency waves.
    const waves = Array.from({ length: 6 }, () => ({
        fx: 1 + Math.floor(random() * 3),
        fy: 1 + Math.floor(random() * 3),
        phase: random() * Math.PI * 2,
    }));
    const pitch = size / threads;
    const height = new Float32Array(size * size);
    const tone = new Float32Array(size * size);
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const tx = Math.floor(x / pitch),
                ty = Math.floor(y / pitch);
            const u = (x % pitch) / pitch,
                w = (y % pitch) / pitch;
            // Over-under: which yarn is on top alternates cell by cell.
            const warpOnTop = (tx + ty) % 2 === 0;
            const yarn = warpOnTop
                ? Math.sin(Math.PI * u) * warp[tx]
                : Math.sin(Math.PI * w) * weft[ty];
            // Each float bows along its length, lowest where it dives under.
            const along = warpOnTop ? w : u;
            const h = yarn * (0.55 + 0.45 * Math.sin(Math.PI * along));
            let mottle = 0;
            for (const wave of waves)
                mottle += Math.sin(
                    ((wave.fx * x + wave.fy * y) / size) * Math.PI * 2 +
                        wave.phase,
                );
            height[y * size + x] = h;
            tone[y * size + x] = THREE.MathUtils.clamp(
                0.8 + 0.14 * h + 0.025 * mottle + (random() - 0.5) * 0.06,
                0,
                1,
            );
        }
    const colour = new Uint8Array(size * size * 4);
    const normal = new Uint8Array(size * size * 4);
    const at = (x: number, y: number) =>
        height[((y + size) % size) * size + ((x + size) % size)];
    const n = new THREE.Vector3();
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const o = (y * size + x) * 4;
            colour[o] =
                colour[o + 1] =
                colour[o + 2] =
                    Math.round(tone[y * size + x] * 255);
            n.set(
                at(x - 1, y) - at(x + 1, y),
                at(x, y - 1) - at(x, y + 1),
                2 / pitch,
            ).normalize();
            normal[o] = Math.round((n.x * 0.5 + 0.5) * 255);
            normal[o + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
            normal[o + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
            colour[o + 3] = normal[o + 3] = 255;
        }
    const texture = (data: Uint8Array) => {
        const t = new THREE.DataTexture(data, size, size);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.magFilter = THREE.LinearFilter;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.generateMipmaps = true;
        t.anisotropy = 8;
        t.needsUpdate = true;
        return t;
    };
    return { map: texture(colour), normalMap: texture(normal) };
}
