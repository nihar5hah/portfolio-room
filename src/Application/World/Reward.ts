import * as THREE from 'three';
import bus from '../UI/EventBus';

/**
 * The reward for finding every hidden record sleeve: a framed gold record
 * goes up on the wall beside the clock, and the Dropout Bear, in a
 * mortarboard, turns up on the window bench beside the Graduation rug.
 * Both appear only once the count is complete (and stay for returning
 * visitors, whose finds are saved). The gold record shuffles everything;
 * the bear plays Graduation.
 */

const FLOOR = -3015;
const BACK = -6500;

const standard = (color: string, roughness = 0.8, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

function shaded<T extends THREE.Object3D>(o: T) {
    o.traverse((part) => (part.castShadow = part.receiveShadow = true));
    return o;
}

function canvasTexture(
    width: number,
    height: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) draw(ctx);
    const map = new THREE.CanvasTexture(canvas);
    map.encoding = THREE.sRGBEncoding;
    return map;
}

/** A framed RIAA-style gold record: frame, matte, disc, label and plate. */
export function goldRecord(found: number) {
    const plaque = new THREE.Group();
    plaque.name = 'Gold record';
    const walnut = standard('#4a3325', 0.55);
    const matte = standard('#101114', 0.95);
    const gold = new THREE.MeshStandardMaterial({
        color: '#d9b25a',
        metalness: 1,
        roughness: 0.22,
    });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2000, 2500, 90), walnut);
    frame.position.z = 45;
    plaque.add(frame);
    const inset = new THREE.Mesh(new THREE.BoxGeometry(1830, 2330, 20), matte);
    inset.position.z = 100;
    plaque.add(inset);
    // The disc, with fine grooves and a centre label.
    const disc = new THREE.Group();
    disc.position.set(0, 230, 112);
    const platter = new THREE.Mesh(
        new THREE.CylinderGeometry(680, 680, 10, 96),
        gold,
    );
    platter.rotation.x = Math.PI / 2;
    disc.add(platter);
    const groove = standard('#b8923f', 0.35, 1);
    for (let r = 260; r < 660; r += 36) {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(r, 2.5, 3, 96),
            groove,
        );
        ring.position.z = 6;
        disc.add(ring);
    }
    const labelMap = canvasTexture(512, 512, (ctx) => {
        ctx.fillStyle = '#f2ead8';
        ctx.fillRect(0, 0, 512, 512);
        ctx.fillStyle = '#a50044';
        ctx.fillRect(0, 300, 512, 90);
        ctx.fillStyle = '#1b1c20';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 58px -apple-system, Helvetica, Arial, sans-serif';
        ctx.fillText('NIHAR’S', 256, 170);
        ctx.font = '500 38px -apple-system, Helvetica, Arial, sans-serif';
        ctx.fillText('ROOM RECORDS', 256, 230);
        ctx.fillStyle = '#f2ead8';
        ctx.font = '600 40px -apple-system, Helvetica, Arial, sans-serif';
        ctx.fillText('GOLD', 256, 346);
    });
    const label = new THREE.Mesh(
        new THREE.CircleGeometry(220, 64),
        new THREE.MeshStandardMaterial({ map: labelMap, roughness: 0.7 }),
    );
    label.position.z = 8;
    disc.add(label);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(16, 20), matte);
    hole.position.z = 9;
    disc.add(hole);
    plaque.add(disc);
    // Engraved plate under the disc.
    const plateMap = canvasTexture(1024, 256, (ctx) => {
        ctx.fillStyle = '#c9a45e';
        ctx.fillRect(0, 0, 1024, 256);
        ctx.fillStyle = '#2b2116';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '600 52px Georgia, serif';
        ctx.fillText('Presented to a very good listener', 512, 92);
        ctx.font = '400 40px Georgia, serif';
        ctx.fillText(`for finding all ${found} records in the room`, 512, 170);
    });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1350, 340, 12), [
        gold,
        gold,
        gold,
        gold,
        new THREE.MeshStandardMaterial({
            map: plateMap,
            metalness: 0.6,
            roughness: 0.35,
        }),
        gold,
    ]);
    plate.position.set(0, -840, 116);
    plaque.add(plate);
    return shaded(plaque);
}

/**
 * The Dropout Bear, sitting: a plush brown teddy with a lighter muzzle and
 * paw pads, button eyes, and a mortarboard with a gold tassel. Sits on its
 * origin, facing +Z. About 35 cm tall seated.
 */
export function dropoutBear() {
    const bear = new THREE.Group();
    bear.name = 'Dropout Bear';
    const fur = new THREE.MeshStandardMaterial({
        color: '#7a4f33',
        roughness: 1,
    });
    const light = standard('#c89f78', 1);
    const button = standard('#0c0c0e', 0.25);
    const black = standard('#141418', 0.7);
    const tassel = standard('#e0b64f', 0.5, 0.4);
    const blob = (
        material: THREE.Material,
        r: number,
        [x, y, z]: number[],
        [sx, sy, sz] = [1, 1, 1],
        rotation: number[] = [0, 0, 0],
    ) => {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(r, 32, 20),
            material,
        );
        mesh.position.set(x, y, z);
        mesh.scale.set(sx, sy, sz);
        mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
        bear.add(mesh);
        return mesh;
    };
    // Body and head.
    blob(fur, 280, [0, 300, 0], [1, 1.1, 0.9]);
    blob(light, 170, [0, 290, 150], [1, 1.2, 0.5]); // tummy
    blob(fur, 215, [0, 760, 20]);
    blob(light, 95, [0, 720, 200], [1.1, 0.85, 0.8]); // muzzle
    blob(button, 32, [0, 752, 272], [1.3, 0.9, 0.8]); // nose
    for (const side of [-1, 1]) {
        blob(button, 24, [side * 80, 815, 196]); // eyes
        blob(fur, 78, [side * 165, 930, 0], [1, 1, 0.6]); // ears
        blob(light, 46, [side * 165, 930, 30], [1, 1, 0.4]);
        // Arms resting forward on the tummy, legs stuck straight out.
        blob(
            fur,
            95,
            [side * 260, 360, 90],
            [0.9, 1.6, 0.9],
            [0.6, 0, side * 0.5],
        );
        blob(fur, 115, [side * 150, 110, 230], [1, 0.9, 1.8]);
        blob(light, 80, [side * 150, 110, 430], [1, 1, 0.35]); // foot pads
    }
    // Mortarboard, a little askew.
    const cap = new THREE.Group();
    cap.position.set(0, 930, 10);
    cap.rotation.set(-0.12, 0.25, 0.08);
    const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(160, 175, 110, 32),
        black,
    );
    cap.add(crown);
    const board = new THREE.Mesh(new THREE.BoxGeometry(470, 22, 470), black);
    board.position.y = 64;
    cap.add(board);
    const button2 = new THREE.Mesh(new THREE.SphereGeometry(22, 12, 8), tassel);
    button2.position.y = 80;
    cap.add(button2);
    const cord = new THREE.Mesh(
        new THREE.CylinderGeometry(7, 7, 250, 8),
        tassel,
    );
    cord.position.set(118, 80, 0);
    cord.rotation.z = Math.PI / 2;
    cap.add(cord);
    const drop = new THREE.Mesh(
        new THREE.CylinderGeometry(9, 20, 160, 10),
        tassel,
    );
    drop.position.set(232, -5, 0);
    cap.add(drop);
    bear.add(cap);
    return shaded(bear);
}

export default class RecordsReward {
    plaque: THREE.Group | null = null;
    bear: THREE.Group | null = null;
    /** Seconds since the reveal started (for the pop-in). */
    age = Infinity;
    complete = false;

    constructor(
        public room: THREE.Object3D,
        found: number,
        total: number,
        public onShow: (plaque: THREE.Object3D, bear: THREE.Object3D) => void,
    ) {
        // Returning visitors who already found them all: just there.
        if (total > 0 && found >= total) this.show(total, false);
        bus.on('recordsFound', ({ found, total }) => {
            if (!this.complete && total > 0 && found >= total) {
                this.show(total, true);
                bus.dispatch('recordsComplete', { total });
            }
        });
    }

    show(total: number, animate: boolean) {
        this.complete = true;
        this.plaque = goldRecord(total);
        this.plaque.position.set(7700, 2250, BACK + 4);
        this.bear = dropoutBear();
        // On the window bench's cushion, turned to the room.
        this.bear.position.set(-16850, FLOOR + 950, 5700);
        this.bear.rotation.y = Math.PI / 2 - 0.3;
        // The room converts every material's colour to linear once, at load
        // (World.ts); these arrive later, so they convert themselves.
        const converted = new Set<THREE.Material>();
        for (const part of [this.plaque, this.bear])
            part.traverse((o) => {
                const m = (o as THREE.Mesh).material;
                for (const material of Array.isArray(m) ? m : m ? [m] : [])
                    if (
                        material instanceof THREE.MeshStandardMaterial &&
                        !converted.has(material)
                    ) {
                        material.color.convertSRGBToLinear();
                        converted.add(material);
                    }
            });
        this.room.add(this.plaque, this.bear);
        this.age = animate ? 0 : Infinity;
        this.pose(animate ? 0 : 1);
        this.onShow(this.plaque, this.bear);
    }

    /** 0 → 1: the plaque swings up onto its hook, the bear pops in. */
    pose(t: number) {
        if (!this.plaque || !this.bear) return;
        const ease = 1 - (1 - Math.min(1, t)) ** 3;
        const pop = Math.min(1, t * 1.4);
        const overshoot = 1 + Math.sin(pop * Math.PI) * 0.12;
        this.plaque.scale.setScalar(Math.max(0.001, ease));
        this.plaque.rotation.z = (1 - ease) * 0.25;
        this.bear.scale.setScalar(Math.max(0.001, pop * overshoot));
    }

    update(seconds: number, reducedMotion: boolean) {
        if (this.age === Infinity) return;
        this.age += reducedMotion ? 10 : seconds;
        this.pose(this.age / 0.9);
        if (this.age >= 0.9) {
            this.age = Infinity;
            this.pose(1);
        }
    }
}
