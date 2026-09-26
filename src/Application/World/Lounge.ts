import * as THREE from 'three';
import { shadeCreases, wovenFabric } from './DuneSofa';
import { METRE } from './Layout';

/**
 * The lived-in lounge around the TV end of the pit: two slouched bean bags,
 * an ottoman and a side table, with the mess of someone who
 * actually watches matches here: a small throw on the ottoman, pillows
 * tossed about, mugs left out, a book pile, kicked-off Spezials.
 *
 * Nothing is placed on a grid or mirrored across the TV axis; every angle is
 * a little off. Resting objects are dropped onto whatever is below them by
 * raycasting, so they sit on the bean bags, tables and floor.
 *
 * Photoscanned props (ottoman, side table, pillows, succulent) are
 * CC0 models from Poly Haven, merged into models/Lounge/lounge-props.glb.
 */
const M = METRE;
/**
 * three r137 has no colour management and this room passes hex straight
 * through as linear (its palette is authored dark to suit). Lounge colours
 * are converted so they display as picked.
 */
const srgb = (hex: string) => new THREE.Color(hex).convertSRGBToLinear();

/** Deterministic noise, so the mess is the same on every visit. */
function seeded(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * A closed latitude-longitude shell with shared seam vertices (so smooth
 * normals have no seam). `shape(u, v)` maps azimuth u ∈ [0, 1) and v from
 * the bottom pole (0) to the top pole (1) to a point.
 */
function shell(
    rings: number,
    segments: number,
    shape: (u: number, v: number) => THREE.Vector3,
) {
    const positions: number[] = [];
    const uvs: number[] = [];
    const push = (p: THREE.Vector3, u: number, v: number) => {
        positions.push(p.x, p.y, p.z);
        uvs.push(u, v);
    };
    push(shape(0, 0), 0.5, 0);
    for (let r = 1; r < rings; r++)
        for (let s = 0; s < segments; s++)
            push(shape(s / segments, r / rings), s / segments, r / rings);
    push(shape(0, 1), 0.5, 1);
    const top = positions.length / 3 - 1;
    const at = (r: number, s: number) =>
        1 + (r - 1) * segments + (s % segments);
    const index: number[] = [];
    for (let s = 0; s < segments; s++) index.push(0, at(1, s + 1), at(1, s));
    for (let r = 1; r < rings - 1; r++)
        for (let s = 0; s < segments; s++) {
            const a = at(r, s),
                b = at(r, s + 1),
                c = at(r + 1, s),
                d = at(r + 1, s + 1);
            index.push(a, b, c, b, d, c);
        }
    for (let s = 0; s < segments; s++)
        index.push(top, at(rings - 1, s), at(rings - 1, s + 1));
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

/**
 * A slouched, well-used bean bag, opening toward +Z: a heavy shell pooled on
 * the floor, a backrest pushed up behind a sat-in hollow, fabric bunched into
 * folds around the seat and base, and six panel seams pulled in. `seed`
 * varies the slump, lean and folds.
 */
export function beanBagGeometry(
    seed: number,
    size = { width: 1.02 * M, depth: 1.08 * M, height: 0.78 * M },
) {
    const random = seeded(seed);
    const { width: W, depth: D, height: H } = size;
    const lean = (random() - 0.5) * 0.18;
    const dentX = (random() - 0.5) * 0.16 * W;
    const twist = (random() - 0.5) * 0.5;
    const folds = Array.from({ length: 7 }, () => ({
        k: 3 + Math.floor(random() * 6),
        phase: random() * Math.PI * 2,
        tilt: (random() - 0.5) * 5,
        amp: 0.006 + random() * 0.01,
    }));
    const seamTurn = random() * Math.PI;
    const body = 0.5 * H;
    const geometry = shell(56, 96, (u, v) => {
        const phi = u * Math.PI * 2;
        const theta = v * Math.PI;
        const t = -Math.cos(theta); // -1 bottom .. 1 top
        const s = Math.sin(theta);
        const front = Math.max(0, Math.cos(phi));
        const back = Math.max(0, -Math.cos(phi));
        const upper = THREE.MathUtils.smoothstep(t, -0.1, 1);
        // Heavy fill pools low: widest just above the floor, narrower on top.
        const bulge =
            1 +
            0.1 * Math.exp(-Math.pow((t + 0.45) / 0.32, 2)) -
            0.16 * Math.pow(Math.max(0, t), 1.6);
        let x = Math.sin(phi) * s * bulge * (W / 2);
        let z = Math.cos(phi) * s * bulge * (D / 2);
        let y = ((t + 1) / 2) * body;
        // The back is shoved up behind the sitter; the front rolls forward.
        y += 0.5 * H * Math.pow(back, 1.3) * Math.pow(upper, 1.1);
        z += 0.07 * D * upper * front;
        // The seat hollow, a little off-centre where someone usually sits.
        const dent = Math.exp(
            -Math.pow((x - dentX) / (0.3 * W), 2) -
                Math.pow((z - 0.12 * D) / (0.32 * D), 2),
        );
        y -= 0.3 * H * dent * Math.pow(upper, 0.7);
        // Folds: bunched around the base and radiating out of the hollow.
        const around = Math.atan2(z - 0.12 * D, x - dentX);
        let fold = 0;
        for (const f of folds)
            fold +=
                f.amp *
                Math.sin(f.k * phi + f.tilt * t + f.phase + twist * t * 4);
        const ring = Math.exp(-Math.pow((dent - 0.45) / 0.25, 2));
        const radiating =
            0.012 * Math.sin(around * 9 + twist * 6) * ring * upper;
        const pooling = Math.exp(-Math.pow((t + 0.55) / 0.22, 2));
        const along = (0.5 + 1.2 * pooling + 0.8 * front * upper) * M;
        x += Math.sin(phi) * fold * along;
        z += Math.cos(phi) * fold * along;
        y += radiating * M;
        // Panel seams pull the shell in along six meridians.
        const seamAngle = (phi + seamTurn) % (Math.PI / 3);
        const seam = Math.exp(
            -Math.pow(Math.min(seamAngle, Math.PI / 3 - seamAngle) / 0.03, 2),
        );
        const pull = 1 - 0.012 * seam * s;
        x *= pull;
        z *= pull;
        // Slumped a little to one side.
        x += lean * y;
        return new THREE.Vector3(x, Math.max(0, y), z);
    });
    geometry.computeBoundingBox();
    geometry.translate(0, -geometry.boundingBox!.min.y, 0);
    geometry.computeVertexNormals();
    shadeCreases(geometry, 0.05 * M, 0.5);
    return geometry;
}

/** Fabric with the sofa's woven structure, at a chosen tint and scale. */
function upholstery(
    color: string,
    repeat: number,
    options: THREE.MeshPhysicalMaterialParameters = {},
) {
    const weave = wovenFabric();
    for (const t of [weave.map, weave.normalMap]) t.repeat.set(repeat, repeat);
    return new THREE.MeshPhysicalMaterial({
        color: srgb(color),
        map: weave.map,
        normalMap: weave.normalMap,
        normalScale: new THREE.Vector2(0.7, 0.7),
        vertexColors: true,
        roughness: 0.93,
        sheen: 0.5,
        sheenRoughness: 0.6,
        sheenColor: srgb(color).lerp(new THREE.Color('#ffffff'), 0.4),
        ...options,
    });
}

const down = new THREE.Vector3(0, -1, 0);
const ray = new THREE.Raycaster();

/** Height of the first surface below (x, z) among `supports`, or `floor`. */
function surfaceAt(
    supports: THREE.Object3D[],
    x: number,
    z: number,
    floor: number,
    from = floor + 4 * M,
) {
    ray.set(new THREE.Vector3(x, from, z), down);
    const hit = ray.intersectObjects(supports, true)[0];
    return hit ? Math.max(hit.point.y, floor) : floor;
}

/**
 * Drop `object` straight down until its footprint touches the highest
 * surface under it (sampled at its footprint's corners and centre), or with
 * `soft`, until its middle settles `sink` into a cushion.
 */
function rest(
    object: THREE.Object3D,
    supports: THREE.Object3D[],
    floor: number,
    sink = 0,
    soft = false,
    precise = false,
) {
    object.updateMatrixWorld(true);
    // `precise` for tilted meshes, whose loose box dips below their bottom.
    const box = new THREE.Box3().setFromObject(object, precise);
    let top = floor;
    // On a soft seat, settle into it where the middle lands.
    const samples = soft
        ? [[0.5, 0.5]]
        : [
              [0.5, 0.5],
              [0.2, 0.2],
              [0.8, 0.2],
              [0.2, 0.8],
              [0.8, 0.8],
          ];
    for (const [fx, fz] of samples)
        top = Math.max(
            top,
            surfaceAt(
                supports,
                THREE.MathUtils.lerp(box.min.x, box.max.x, fx),
                THREE.MathUtils.lerp(box.min.z, box.max.z, fz),
                floor,
                box.max.y + 2 * M,
            ),
        );
    object.position.y += top - box.min.y - sink;
    object.updateMatrixWorld(true);
}

/**
 * A throw dropped over `supports`: a cloth grid laid over whatever is below,
 * falling steeply off edges (as a blanket hangs) and rumpled where it lies on
 * the floor. Striped near both ends.
 */
export function throwBlanket(
    supports: THREE.Object3D[],
    at: { x: number; z: number; yaw: number },
    size: { width: number; depth: number },
    floor: number,
    seed: number,
    stripes = true,
) {
    const random = seeded(seed);
    const nx = 44,
        nz = 36;
    const cell = Math.max(size.width / nx, size.depth / nz);
    const cos = Math.cos(at.yaw),
        sin = Math.sin(at.yaw);
    const count = (nx + 1) * (nz + 1);
    const plane = new Float32Array(count * 2);
    const support = new Float32Array(count);
    for (let j = 0; j <= nz; j++)
        for (let i = 0; i <= nx; i++) {
            const k = j * (nx + 1) + i;
            // Local offsets, then yaw into the room.
            const lx = (i / nx - 0.5) * size.width;
            const lz = (j / nz - 0.5) * size.depth;
            plane[k * 2] = at.x + lx * cos + lz * sin;
            plane[k * 2 + 1] = at.z - lx * sin + lz * cos;
            support[k] = surfaceAt(
                supports,
                plane[k * 2],
                plane[k * 2 + 1],
                floor,
            );
        }
    // Hang: never below support, and falling at most `slope` per cell away
    // from where it rests, so it drops steeply off an edge.
    const thick = 0.022 * M;
    const slope = 4 * cell;
    const h = Float32Array.from(support, (s) => s + thick);
    const neighbours = (k: number) => {
        const i = k % (nx + 1),
            j = Math.floor(k / (nx + 1));
        const out: number[] = [];
        if (i > 0) out.push(k - 1);
        if (i < nx) out.push(k + 1);
        if (j > 0) out.push(k - nx - 1);
        if (j < nz) out.push(k + nx + 1);
        return out;
    };
    for (let pass = 0; pass < nx + nz; pass++)
        for (let k = 0; k < count; k++)
            for (const n of neighbours(k)) h[k] = Math.max(h[k], h[n] - slope);
    // Soften the tented folds, still resting on everything below.
    for (let pass = 0; pass < 5; pass++) {
        const next = Float32Array.from(h);
        for (let k = 0; k < count; k++) {
            const ns = neighbours(k);
            const mean = ns.reduce((sum, n) => sum + h[n], 0) / ns.length;
            next[k] = Math.max(support[k] + thick, 0.5 * h[k] + 0.5 * mean);
        }
        h.set(next);
    }
    // Rumples: soft ridges where it lies, finer creases where it hangs.
    const waves = Array.from({ length: 5 }, () => ({
        a: random() * Math.PI,
        f: (2 + random() * 5) / size.width,
        p: random() * Math.PI * 2,
    }));
    const positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const colors = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
        const x = plane[k * 2],
            z = plane[k * 2 + 1];
        const lying = THREE.MathUtils.smoothstep(
            support[k] + thick - h[k],
            -0.05 * M,
            0,
        );
        let rumple = 0;
        for (const w of waves)
            rumple += Math.sin(
                (x * Math.cos(w.a) + z * Math.sin(w.a)) * w.f * Math.PI * 2 +
                    w.p,
            );
        rumple = (rumple / waves.length) * (0.5 + 0.5 * lying);
        positions[k * 3] = x;
        // Rumples only lift the cloth, so nothing below pokes through.
        positions[k * 3 + 1] = h[k] + (0.5 + 0.5 * rumple) * 0.03 * M;
        positions[k * 3 + 2] = z;
        const i = k % (nx + 1),
            j = Math.floor(k / (nx + 1));
        uvs[k * 2] = (i / nx) * (size.width / M);
        uvs[k * 2 + 1] = (j / nz) * (size.depth / M);
        // Two bands of stripes near each end of the throw.
        const e = Math.min(j, nz - j) / nz;
        const band =
            stripes && ((e > 0.06 && e < 0.09) || (e > 0.115 && e < 0.13));
        colors[k * 3] = band ? 0.72 : 1;
        colors[k * 3 + 1] = band ? 0.42 : 1;
        colors[k * 3 + 2] = band ? 0.3 : 1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    const index: number[] = [];
    for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++) {
            const a = j * (nx + 1) + i;
            index.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
        }
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    // Stripes survive the crease shading: multiply them in afterwards.
    shadeCreases(geometry, 0.04 * M, 0.45);
    const shade = geometry.getAttribute('color') as THREE.BufferAttribute;
    const raw = shade.array as Float32Array;
    for (let k = 0; k < count * 3; k++) raw[k] *= colors[k];
    shade.needsUpdate = true;
    return geometry;
}

/** A ceramic mug, optionally with the dregs of a coffee in it. */
function mug(color: string, coffee: boolean) {
    const group = new THREE.Group();
    const r = 0.043 * M,
        h = 0.095 * M,
        wall = 0.004 * M;
    const glaze = new THREE.MeshPhysicalMaterial({
        color: srgb(color),
        roughness: 0.35,
        clearcoat: 0.6,
        clearcoatRoughness: 0.25,
    });
    const body = new THREE.Mesh(
        new THREE.LatheGeometry(
            [
                [0, 0],
                [r - 0.004 * M, 0],
                [r, 0.006 * M],
                [r, h],
                [r - wall, h],
                [r - wall, 0.012 * M],
                [0, 0.012 * M],
            ].map(([x, y]) => new THREE.Vector2(x, y)),
            40,
        ),
        glaze,
    );
    const handle = new THREE.Mesh(
        new THREE.TorusGeometry(0.028 * M, 0.006 * M, 10, 24, Math.PI),
        glaze,
    );
    handle.rotation.z = -Math.PI / 2;
    handle.position.set(r + 0.002 * M, h * 0.52, 0);
    group.add(body, handle);
    if (coffee) {
        const dregs = new THREE.Mesh(
            new THREE.CircleGeometry(r - wall, 32),
            new THREE.MeshStandardMaterial({
                color: srgb('#2b1a10'),
                roughness: 0.15,
            }),
        );
        dregs.rotation.x = -Math.PI / 2;
        dregs.position.y = h * 0.34;
        group.add(dregs);
    }
    group.traverse((part) => {
        part.castShadow = part.receiveShadow = true;
    });
    return group;
}

/** A hardback lying flat: cover boards around a cream page block. */
function book(width: number, depth: number, thick: number, color: string) {
    const cover = new THREE.MeshStandardMaterial({
        color: srgb(color),
        roughness: 0.88,
        envMapIntensity: 0.4,
    });
    const pages = new THREE.MeshStandardMaterial({
        color: srgb('#e9e1cf'),
        roughness: 0.95,
    });
    // BoxGeometry faces: +x, -x (spine), +y, -y (covers), +z, -z.
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, thick, depth), [
        pages,
        cover,
        cover,
        cover,
        pages,
        pages,
    ]);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
}

/** Scanned shoe length (353 mm) scaled to a UK 9 Spezial (~300 mm). */
const SHOE = 0.3 / 0.353;

/**
 * One of a pair of Night Indigo Handball Spezials. The scan is a right
 * shoe; the left one is the same mesh mirrored across its length, so keep
 * its outer side (and the mirrored gold lettering) out of view.
 */
function spezial(model: THREE.Object3D | undefined, left: boolean) {
    let source: THREE.Mesh | undefined;
    model?.traverse((o) => {
        if (!source && (o as THREE.Mesh).isMesh) source = o as THREE.Mesh;
    });
    if (!source) return undefined;
    const mesh = new THREE.Mesh(source.geometry, source.material);
    mesh.castShadow = mesh.receiveShadow = true;
    const shoe = new THREE.Group();
    shoe.add(mesh);
    shoe.scale.set(SHOE * M, SHOE * M, (left ? -1 : 1) * SHOE * M);
    return shoe;
}

/** Take a named prop mesh out of the Poly Haven bundle, as a fresh copy. */
function prop(props: THREE.Object3D | undefined, name: string) {
    const source = props?.getObjectByName(name) as THREE.Mesh | undefined;
    if (!source) return undefined;
    const mesh = new THREE.Mesh(source.geometry, source.material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
}

export interface LoungeOptions {
    room: THREE.Object3D;
    floor: number;
    /** The Poly Haven prop bundle's scene, if it loaded. */
    props?: THREE.Object3D;
    /** The Night Indigo Handball Spezial scan, if it loaded. */
    shoes?: THREE.Object3D;
    /** Surfaces things may be tossed onto besides the new furniture. */
    sofa?: THREE.Object3D;
}

/**
 * Furnish the lounge. Positions are room units with the TV at +Z (screen at
 * z ≈ 18100), the window at -X and the bed at +X.
 */
export function furnishLounge({
    room,
    floor,
    props,
    shoes,
    sofa,
}: LoungeOptions) {
    room.updateMatrixWorld(true);
    const lounge = new THREE.Group();
    lounge.name = 'Lived-in lounge';
    room.add(lounge);
    const place = <T extends THREE.Object3D>(
        object: T,
        name: string,
        x: number,
        z: number,
        yaw: number,
        y = floor,
    ) => {
        object.name = name;
        object.position.set(x, y, z);
        object.rotation.y = yaw;
        lounge.add(object);
        object.updateMatrixWorld(true);
        return object;
    };
    // Facing the screen, give or take: `yaw` turns +Z toward the TV centre,
    // then `off` twists it away the way a bag gets shoved around.
    const towardTV = (x: number, z: number, off: number) =>
        Math.atan2(-x, 18100 - z) + off;

    // Bean bags: the blue one dragged close on the window side, twisted off
    // the screen; the burgundy one pushed back on the bed side, turned in
    // toward the sofa. Different slumps, different sizes.
    const bags: THREE.Mesh[] = [];
    for (const [name, color, seed, x, z, off, size] of [
        [
            'Blue match night bean bag',
            '#46679a',
            11,
            -7700,
            13750,
            0.32,
            { width: 1.05 * M, depth: 1.1 * M, height: 0.8 * M },
        ],
        [
            'Burgundy match night bean bag',
            '#9a3a4b',
            29,
            8550,
            11900,
            -0.2,
            { width: 0.96 * M, depth: 1.02 * M, height: 0.74 * M },
        ],
    ] as const) {
        const bag = new THREE.Mesh(
            beanBagGeometry(seed, size),
            upholstery(color, 30, {
                normalScale: new THREE.Vector2(0.35, 0.35),
                sheen: 0.75,
                sheenRoughness: 0.4,
            }),
        );
        bag.castShadow = bag.receiveShadow = true;
        place(bag, name, x, z, towardTV(x, z, off));
        bags.push(bag);
    }
    const [, redBag] = bags;

    // Window side: side table by the blue bag, a little crooked, with a mug
    // and the succulent; books piled on the floor beside it.
    const table = prop(props, 'side_table_01');
    if (table) {
        table.scale.setScalar(M);
        place(table, 'Lounge side table', -10650, 12250, 0.23);
        rest(table, [], floor);
    }
    const plantParts = [
        'potted_plant_04_pot',
        'potted_plant_04_dirt',
        'potted_plant_04_ground',
        'potted_plant_04_plant',
    ]
        .map((name) => prop(props, name))
        .filter(Boolean) as THREE.Mesh[];
    if (plantParts.length) {
        const plant = new THREE.Group();
        plantParts.forEach((part) => plant.add(part));
        plant.scale.setScalar(M);
        place(plant, 'Side table succulent', -10950, 12050, 0.9);
        if (table) rest(plant, [table], floor);
    }
    const tableMug = place(
        mug('#e8e4da', true),
        'Half-drunk coffee mug',
        -10300,
        12550,
        2.1,
    );
    if (table) rest(tableMug, [table], floor);
    const books: [number, number, number, string, number, number][] = [
        [0.16, 0.24, 0.035, '#2f5240', 0.25, 0],
        [0.15, 0.23, 0.028, '#b08a2e', -0.1, 0.012],
        [0.14, 0.21, 0.022, '#7d2a2e', 0.42, -0.01],
    ];
    books.forEach(([w, d, t, color, yaw, shift], i) => {
        const b = place(
            book(w * M, d * M, t * M, color),
            `Floor book ${i + 1}`,
            -9650 + shift * M,
            11350 + shift * 0.6 * M,
            yaw,
        );
        const pile = lounge.children.filter(
            (c) => c.name.startsWith('Floor book') && c !== b,
        );
        rest(b, pile, floor);
    });
    // One that slid off the pile.
    place(
        book(0.17 * M, 0.25 * M, 0.03 * M, '#24406e'),
        'Floor book 4',
        -9180,
        11020,
        -0.55,
        floor + 0.015 * M,
    );

    // Bed side: the ottoman pulled up as a footrest, skewed; the grey throw
    // half off it; a pillow on the bag and another fallen on the floor;
    // trainers kicked off; a mug left on the floor by the bag.
    const ottoman = prop(props, 'Ottoman_01');
    if (ottoman) {
        ottoman.scale.setScalar(M);
        place(ottoman, 'Leather ottoman footrest', 7300, 14400, 0.52);
        rest(ottoman, [], floor);
    }
    const pillows = ['throw_pillows_01_pillow01', 'throw_pillows_01_pillow02'];
    const pillow = (i: number) => {
        const p = prop(props, pillows[i % 2]);
        if (!p) return undefined;
        const holder = new THREE.Group();
        // The pillow mesh lies in its XZ plane with the face up; centre it.
        p.geometry.computeBoundingBox();
        const b = p.geometry.boundingBox!;
        p.position.set(
            -(b.min.x + b.max.x) / 2,
            -b.min.y,
            -(b.min.z + b.max.z) / 2,
        );
        holder.add(p);
        holder.scale.setScalar(M);
        return holder;
    };
    const onBag = pillow(0);
    if (onBag) {
        // Tossed into the seat hollow, propped against the back.
        place(onBag, 'Pillow on the burgundy bean bag', 8550, 11900, 0);
        const local = new THREE.Vector3(0.05 * M, 0, 0.02 * M).applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            redBag.rotation.y,
        );
        onBag.position.x += local.x;
        onBag.position.z += local.z;
        // The scanned pillows lie face up, already slumped.
        onBag.rotation.set(0.08, redBag.rotation.y + 0.35, 0.12, 'YXZ');
        onBag.updateMatrixWorld(true);
        rest(onBag, [redBag], floor, 0.1 * M, true);
    }
    const fallen = pillow(1);
    if (fallen) {
        place(fallen, 'Pillow fallen on the floor', 5500, 12900, 0.9);
        fallen.rotation.set(0.12, 0.9, -0.08, 'YXZ');
        rest(fallen, [], floor);
    }
    const onSofa = pillow(1);
    if (onSofa && sofa) {
        place(onSofa, 'Pillow tossed on the Dune', -1900, 12450, -0.6);
        onSofa.rotation.set(0.1, -0.6, 0.14, 'YXZ');
        rest(onSofa, [sofa], floor - 2 * M, 0.05 * M);
    }
    const floorMug = place(
        mug('#c9a227', false),
        'Mug left by the bean bag',
        10650,
        13450,
        -0.8,
    );
    rest(floorMug, [], floor);
    // Night Indigo Spezials, kicked off: one upright with its toe turned
    // toward the bag, the other rolled onto its outer side a stride away.
    const right = spezial(shoes, false);
    if (right) {
        place(right, 'Kicked-off Spezial (right)', 9800, 15000, 2.25);
        rest(right, [], floor, 0, false, true);
    }
    const left = spezial(shoes, true);
    if (left) {
        place(left, 'Kicked-off Spezial (left)', 10550, 15650, 0);
        left.rotation.set(-Math.PI / 2 + 0.14, -2.05, 0.06, 'YXZ');
        rest(left, [], floor, 0, false, true);
    }

    // Keep the bean bags uncovered; only the ottoman gets a small throw.
    if (ottoman) {
        // Folded in a hurry and dropped on the ottoman, a corner sliding off.
        const wool = upholstery('#9aa0a6', 16, {
            side: THREE.DoubleSide,
            normalScale: new THREE.Vector2(0.35, 0.35),
            sheen: 0.25,
        });
        const supports: THREE.Object3D[] = [ottoman];
        const along = new THREE.Vector3(1, 0, 0).applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            ottoman.rotation.y,
        );
        [
            [0.19, 0.56, 0.4, 0.2],
            [0.23, 0.46, 0.32, 0.55],
        ].forEach(([offset, width, depth, turn], layer) => {
            const fold = new THREE.Mesh(
                throwBlanket(
                    supports,
                    {
                        x: ottoman.position.x + along.x * offset * M,
                        z: ottoman.position.z + along.z * offset * M,
                        yaw: ottoman.rotation.y + turn,
                    },
                    { width: width * M, depth: depth * M },
                    floor,
                    17 + layer,
                    false,
                ),
                wool,
            );
            fold.name = `Grey throw on the ottoman (fold ${layer + 1})`;
            fold.castShadow = fold.receiveShadow = true;
            lounge.add(fold);
            fold.updateMatrixWorld(true);
            supports.push(fold);
        });
    }
    return lounge;
}
