import * as THREE from 'three';
import bus from '../UI/EventBus';
import { dequantize } from '../Utils/Dequantize';

/**
 * The reward for finding every hidden record sleeve: a framed gold record
 * goes up on the wall beside the clock, and the Graduation-era Dropout
 * Bear turns up on the window bench beside the Graduation rug.
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

/** Seated height of the bear, room units (about 35 cm). */
const BEAR_HEIGHT = 1150;

/**
 * The Dropout Bear in his Graduation-era form (Takashi Murakami's cartoon
 * redesign: shutter shades, camo varsity jacket, blue pants, white
 * sneakers), from the supplied Blender model, posed sitting and baked to
 * static meshes (static/models/Bear/dropout-bear.glb). Stands on its origin,
 * facing +Z, sized to a shelf plush.
 */
export function graduationBear(model: THREE.Object3D) {
    const bear = new THREE.Group();
    bear.name = 'Graduation Bear';
    // Unpacked to floats, or clicks (raycasts) miss him.
    const copy = dequantize(model).clone(true);
    copy.traverse((part) => {
        const mesh = part as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = mesh.receiveShadow = true;
        const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
        for (const m of materials as THREE.MeshStandardMaterial[]) {
            // glTF colours are already linear (World.ts converts the rest).
            m.userData.linearColor = true;
            m.envMapIntensity = 0.12;
            // Cut-out eyes and patches: no sorting against the shades.
            if (m.transparent) {
                m.transparent = false;
                m.alphaTest = 0.5;
            }
        }
    });
    const box = new THREE.Box3().setFromObject(copy, true);
    const size = box.getSize(new THREE.Vector3());
    copy.scale.setScalar(BEAR_HEIGHT / size.y);
    const centre = box.getCenter(new THREE.Vector3());
    copy.position.set(
        -centre.x * copy.scale.x,
        -box.min.y * copy.scale.y,
        -centre.z * copy.scale.z,
    );
    bear.add(copy);
    return shaded(bear);
}

/**
 * The shutter shades' glow (click the bear): the shades light up like LED
 * party glasses, drifting through the Graduation cover's pinks, violets
 * and blues, with a soft halo standing in for bloom. Their materials are
 * the bear's own shades only (cloned: the arms share the white).
 */
const GRADUATION_GLOW = ['#ff4fa3', '#a46bff', '#3fd2ff', '#ffc94d'];
export function shadesGlow(bear: THREE.Object3D) {
    const parts = ['glasses', 'glasssesline']
        .map((name) => bear.getObjectByName(name) as THREE.Mesh | undefined)
        .filter((mesh): mesh is THREE.Mesh => !!mesh?.isMesh);
    if (!parts.length) return null;
    const materials = parts.map((mesh) => {
        const glow = (mesh.material as THREE.MeshStandardMaterial).clone();
        glow.emissive = new THREE.Color(0, 0, 0);
        glow.emissiveIntensity = 0;
        mesh.material = glow;
        return glow;
    });
    // A halo in front of the lenses (the room has no bloom pass).
    bear.updateMatrixWorld(true);
    const lenses = new THREE.Box3();
    for (const mesh of parts) lenses.expandByObject(mesh, true);
    const inverse = bear.matrixWorld.clone().invert();
    lenses.applyMatrix4(inverse);
    const size = lenses.getSize(new THREE.Vector3());
    const centre = lenses.getCenter(new THREE.Vector3());
    const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: haloTexture(),
            color: GRADUATION_GLOW[0],
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        }),
    );
    halo.name = 'Shutter shades halo';
    halo.position.copy(centre).add(new THREE.Vector3(0, 0, size.z * 0.6));
    halo.scale.set(size.x * 1.9, size.x * 1.1, 1);
    halo.visible = false;
    halo.raycast = () => undefined;
    halo.renderOrder = 2;
    bear.add(halo);
    const base = materials.map((m) => m.color.clone());
    return { materials, base, halo, on: false, level: 0, time: 0 };
}

let haloMap: THREE.CanvasTexture | null = null;
function haloTexture() {
    if (haloMap) return haloMap;
    haloMap = canvasTexture(128, 128, (ctx) => {
        const fade = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        fade.addColorStop(0, 'rgba(255,255,255,0.9)');
        fade.addColorStop(0.35, 'rgba(255,255,255,0.35)');
        fade.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, 128, 128);
    });
    return haloMap;
}

export default class RecordsReward {
    plaque: THREE.Group | null = null;
    bear: THREE.Group | null = null;
    glow: ReturnType<typeof shadesGlow> = null;
    /** Seconds since the reveal started (for the pop-in). */
    age = Infinity;
    complete = false;

    constructor(
        public room: THREE.Object3D,
        found: number,
        total: number,
        public onShow: (
            plaque: THREE.Object3D,
            bear: THREE.Object3D | null,
        ) => void,
        public bearModel: THREE.Object3D | null = null,
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
        // On the window bench's cushion, turned to the room.
        this.bear = this.bearModel ? graduationBear(this.bearModel) : null;
        this.bear?.position.set(-16900, FLOOR + 965, 5700);
        if (this.bear) this.bear.rotation.y = Math.PI / 2 - 0.3;
        this.glow = this.bear ? shadesGlow(this.bear) : null;
        // The room converts every material's colour to linear once, at load
        // (World.ts); these arrive later, so they convert themselves.
        const converted = new Set<THREE.Material>();
        for (const part of [this.plaque])
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
        this.room.add(this.plaque);
        if (this.bear) this.room.add(this.bear);
        this.age = animate ? 0 : Infinity;
        this.pose(animate ? 0 : 1);
        this.onShow(this.plaque, this.bear);
    }

    /** 0 → 1: the plaque swings up onto its hook, the bear pops in. */
    pose(t: number) {
        if (!this.plaque) return;
        const ease = 1 - (1 - Math.min(1, t)) ** 3;
        const pop = Math.min(1, t * 1.4);
        const overshoot = 1 + Math.sin(pop * Math.PI) * 0.12;
        this.plaque.scale.setScalar(Math.max(0.001, ease));
        this.plaque.rotation.z = (1 - ease) * 0.25;
        this.bear?.scale.setScalar(Math.max(0.001, pop * overshoot));
    }

    /** Click the bear: his shades light up; click again, they go out. */
    toggleGlow() {
        if (!this.glow) return false;
        this.glow.on = !this.glow.on;
        return this.glow.on;
    }

    /** The shades warm up and fade over ~0.3 s, and drift through colours. */
    updateGlow(seconds: number, reducedMotion: boolean) {
        const glow = this.glow;
        if (!glow || (!glow.on && glow.level === 0)) return;
        const target = glow.on ? 1 : 0;
        glow.level += (target - glow.level) * Math.min(1, seconds * 8);
        if (Math.abs(target - glow.level) < 0.005) glow.level = target;
        glow.time += reducedMotion ? 0 : seconds;
        // Through the palette every ~6 s, with a slow LED-like pulse.
        const t = (glow.time / 1.5) % GRADUATION_GLOW.length;
        const i = Math.floor(t);
        const colour = new THREE.Color(GRADUATION_GLOW[i]).lerp(
            new THREE.Color(GRADUATION_GLOW[(i + 1) % GRADUATION_GLOW.length]),
            t - i,
        );
        const pulse = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(glow.time * 3);
        const linear = colour.clone().convertSRGBToLinear();
        glow.materials.forEach((material, k) => {
            // The white frames darken as they light, so the neon colour
            // reads instead of washing out to white.
            material.color
                .copy(glow.base[k])
                .multiplyScalar(1 - 0.8 * glow.level);
            material.emissive.copy(linear);
            material.emissiveIntensity = 2.4 * glow.level * pulse;
        });
        const halo = glow.halo.material as THREE.SpriteMaterial;
        halo.color.copy(linear);
        halo.opacity = 0.55 * glow.level * pulse;
        glow.halo.visible = glow.level > 0;
    }

    update(seconds: number, reducedMotion: boolean) {
        this.updateGlow(seconds, reducedMotion);
        if (this.age === Infinity) return;
        this.age += reducedMotion ? 10 : seconds;
        this.pose(this.age / 0.9);
        if (this.age >= 0.9) {
            this.age = Infinity;
            this.pose(1);
        }
    }
}
