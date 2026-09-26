import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DESK_Z } from './Layout';
import type NavGrid from './NavGrid';
import type { Point } from './NavGrid';

/** Places in the room Begu has opinions about (room units, XZ). */
export interface Spots {
    /** His bed: where he curls up. */
    bed: Point;
    /** His water/food bowl, and the side he eats from. */
    bowl: Point;
    /** Places worth wandering to: the window, the door, by the pit… */
    haunts: Point[];
    /** Something to look at from each haunt (optional, same order). */
    looks?: (Point | null)[];
    /** The kicked-off Spezials, for a rare pounce. */
    shoes?: Point;
    /** The window, for a rare long look outside. */
    window?: { stand: Point; look: Point };
    /** The front door, for a rare wait for someone to come home. */
    door?: { stand: Point; look: Point };
}

type Step =
    | { kind: 'walk'; to: Point; gallop?: boolean; path?: Point[] }
    | { kind: 'face'; at: Point }
    | {
          kind: 'pose';
          clip: string;
          seconds: number;
          once?: boolean;
          speed?: number;
      }
    | { kind: 'lie'; seconds: number; sleep?: boolean; speed?: number }
    | { kind: 'rise' }
    | { kind: 'spin'; turns: number }
    | { kind: 'mood'; mood: Mood };

export type Mood =
    | 'idle'
    | 'wandering'
    | 'eating'
    | 'napping'
    | 'asleep'
    | 'zoomies'
    | 'playing'
    | 'watching';

/** Paw speed of each gait, measured from the clips (no foot sliding). */
const WALK = 1300;
const GALLOP = 4000;
/** Body centre sits this far behind the model origin's +Z (nose at +1128). */
const CENTRE = 272;
/**
 * Lying down (the Death clip) rolls him onto his side, about 830 units to
 * his left: shift the model back as he lies, so he stays on his bed.
 */
const LIE_SHIFT = -830;

const angleTo = (from: THREE.Vector3, to: Point) =>
    Math.atan2(to.x - from.x, to.z - from.z);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Begu: the Quaternius husky's authored clips, driven by a small routine.
 * He idles, sniffs, wanders the room on a navigation grid (no walking
 * through furniture or into the pit), naps in his bed, eats from his bowl,
 * and, rarely, gets the zoomies, chases his tail, plays dead, pounces on the
 * kicked-off Spezials, watches the window or waits by the door. Click him to
 * pet him (tail wag, ears back, a lean into your hand); click his name to
 * chat. At Good Night he goes to bed until the room wakes.
 */
export default class Husky {
    group = new THREE.Group();
    mixer: THREE.AnimationMixer;
    actions: Record<string, THREE.AnimationAction> = {};
    current: THREE.AnimationAction;
    elapsed = 0;
    phase = 0;
    greeting = 0;
    cheer = 0; // a hop that does not open chat (music started, record found)
    /** While set (the visitor is at the Mac), Begu stops and faces this point. */
    watching: THREE.Vector3 | null = null;
    readonly floor = -2970;

    /** Floor plan and favourite places; without them he pads a small loop. */
    nav: NavGrid | null = null;
    spots: Spots | null = null;
    random: () => number = Math.random;
    queue: Step[] = [];
    step: Step | null = null;
    stepTime = 0;
    mood: Mood = 'idle';
    lying = false;
    asleep = false;
    /** Good Night: he stays in bed until the room wakes. */
    bedtime = false;
    /** Seconds of petting left (tail wag, ears back). */
    petting = 0;
    pets: number[] = [];
    wag = 0;
    lastRare = -60;
    cooldowns: Record<string, number> = {};
    tail: THREE.Object3D[] = [];
    ears: THREE.Object3D[] = [];
    head: THREE.Object3D | undefined;
    y: number;
    /** Tail and ear angles added last frame, undone before the clips run. */
    extra = { tail: 0, ears: 0 };
    model: THREE.Object3D;
    baseX = 0;
    /** 0 standing, 1 lying on his side (eases the lying shift). */
    down = 0;

    constructor(model: {
        scene: THREE.Group;
        animations: THREE.AnimationClip[];
    }) {
        const bounds = new THREE.Box3().setFromObject(model.scene);
        const scale = 1850 / bounds.getSize(new THREE.Vector3()).y;
        const center = bounds.getCenter(new THREE.Vector3());
        model.scene.scale.multiplyScalar(scale);
        // Origin at the middle of his body, so turning pivots on the hips
        // and the grid's padding fits him nose to tail.
        model.scene.position.set(
            -center.x * scale,
            -bounds.min.y * scale,
            -CENTRE,
        );
        this.baseX = model.scene.position.x;
        model.scene.updateMatrixWorld(true);
        model.scene.traverse((part) => {
            if (!(part instanceof THREE.Mesh)) return;
            // Smooth shading without changing the authored vertices or skin weights.
            part.geometry.deleteAttribute('normal');
            part.geometry = mergeVertices(part.geometry);
            part.geometry.computeVertexNormals();
            part.castShadow = true;
            part.receiveShadow = true;
            part.frustumCulled = false;
            const materials = Array.isArray(part.material)
                ? part.material
                : [part.material];
            materials.forEach((m: THREE.MeshStandardMaterial) => {
                m.metalness = 0;
                m.roughness = 0.95;
                m.userData.linearColor = true;
                const coat: Record<string, string> = {
                    Material: '#343c48',
                    'Material.001': '#e1e6ed',
                    'Material.003': '#83bfdc',
                    'Material.006': '#252c35',
                    'Material.002': '#11151c',
                };
                if (coat[m.name])
                    m.color.set(coat[m.name]).convertSRGBToLinear();
            });
        });
        const bone = (name: string) =>
            model.scene.getObjectByName(
                THREE.PropertyBinding.sanitizeNodeName(name),
            );
        this.tail = ['Tail1', 'Tail2', 'Tail3', 'Tail4']
            .map(bone)
            .filter(Boolean) as THREE.Object3D[];
        this.ears = ['Ear1.L', 'Ear1.R']
            .map(bone)
            .filter(Boolean) as THREE.Object3D[];
        this.head = bone('Head');
        this.group.name = 'Begu — animated Siberian husky';
        this.group.add(model.scene);
        this.model = model.scene;
        this.group.position.set(-2600, this.floor, 4200 + DESK_Z);
        this.y = this.floor;
        this.group.rotation.y = Math.PI / 2;
        this.mixer = new THREE.AnimationMixer(model.scene);
        for (const clip of model.animations) {
            if (clip.name.includes('|')) continue;
            this.actions[clip.name] = this.mixer.clipAction(clip);
        }
        this.play('Idle_2');
        this.mixer.update(0);
    }

    play(name: string, once = false, speed = 1) {
        const next = this.actions[name];
        if (!next) return;
        if (next === this.current && !once) {
            next.setEffectiveTimeScale(speed);
            return;
        }
        if (next === this.current) {
            // Replaying the pose he is in (getting up is lying down backwards):
            // no fade, or he would blend through the bind pose.
            next.reset().setEffectiveWeight(1).setEffectiveTimeScale(speed);
            next.setLoop(THREE.LoopOnce, 1);
            next.clampWhenFinished = true;
            if (speed < 0) next.time = next.getClip().duration;
            next.play();
            return;
        }
        next.reset().setEffectiveWeight(1).setEffectiveTimeScale(speed);
        next.setLoop(
            once ? THREE.LoopOnce : THREE.LoopRepeat,
            once ? 1 : Infinity,
        );
        next.clampWhenFinished = once;
        // Played backwards (getting up), a one-shot starts from its end.
        if (speed < 0) next.time = next.getClip().duration;
        if (this.current && this.current !== next) this.current.fadeOut(0.3);
        next.fadeIn(0.3).play();
        this.current = next;
    }

    /** Head position in the room, for hearts and Zzz. */
    headPosition(target = new THREE.Vector3()) {
        if (this.head) return this.head.getWorldPosition(target);
        return target
            .copy(this.group.position)
            .add(new THREE.Vector3(0, 1500, 0));
    }

    greet(camera: THREE.Vector3, reducedMotion: boolean) {
        if (this.greeting > 0) return;
        this.interrupt();
        this.group.rotation.y = Math.atan2(
            camera.x - this.group.position.x,
            camera.z - this.group.position.z,
        );
        this.greeting = reducedMotion ? 0.01 : 2.6;
        this.play(reducedMotion ? 'Idle_2' : 'Jump_ToIdle', !reducedMotion);
    }

    hop(reducedMotion: boolean) {
        if (
            this.greeting > 0 ||
            this.cheer > 0 ||
            reducedMotion ||
            this.lying ||
            this.bedtime
        )
            return;
        this.interrupt();
        this.cheer = 2.2;
        this.play('Jump_ToIdle', true);
    }

    /**
     * Petted. Returns what he did: 'lean' (awake: he turns to you, leans
     * into the hand and wags), 'sleepy' (asleep or lying: a sleepy wag, he
     * stays put) or 'zoomies' (petted five times in quick succession).
     */
    pet(camera: THREE.Vector3, reducedMotion: boolean) {
        const now = this.elapsed;
        this.pets = this.pets.filter((t) => now - t < 8);
        this.pets.push(now);
        this.petting = 2.4;
        if (reducedMotion || this.greeting > 0) return 'lean';
        if (this.lying) return 'sleepy';
        if (this.pets.length >= 5 && !this.bedtime) {
            this.pets = [];
            this.interrupt();
            this.zoomies();
            return 'zoomies';
        }
        this.interrupt();
        const toCamera = Math.atan2(
            camera.x - this.group.position.x,
            camera.z - this.group.position.z,
        );
        const side = wrap(toCamera - this.group.rotation.y);
        this.queue.push(
            { kind: 'mood', mood: 'idle' },
            {
                kind: 'face',
                at: {
                    x: this.group.position.x + Math.sin(toCamera) * 1000,
                    z: this.group.position.z + Math.cos(toCamera) * 1000,
                },
            },
            {
                kind: 'pose',
                clip: side > 0 ? 'Idle_HitReact_Left' : 'Idle_HitReact_Right',
                seconds: 0.65,
                once: true,
                speed: 0.8,
            },
            { kind: 'pose', clip: 'Idle_2_HeadLow', seconds: 2.2 },
        );
        return 'lean';
    }

    /** Good Night (true): go to bed and sleep. Morning (false): get up. */
    goodNight(asleep: boolean) {
        this.bedtime = asleep;
        if (asleep) {
            this.interrupt();
            this.goToBed(Infinity);
        } else {
            const down = this.lying;
            this.interrupt(false);
            if (down)
                this.queue.push(
                    { kind: 'rise' },
                    { kind: 'mood', mood: 'idle' },
                    { kind: 'pose', clip: 'Idle_2_HeadLow', seconds: 2.5 },
                );
        }
    }

    /** Drop whatever he was doing. Lying down, he stays down unless told. */
    interrupt(keepLying = true) {
        this.queue = [];
        this.step = null;
        this.stepTime = 0;
        if (!keepLying) return;
        if (this.lying) this.queue.push({ kind: 'rise' });
    }

    // --- Routines --------------------------------------------------------

    /** Choose the next thing to do. */
    decide() {
        const r = this.random();
        const spots = this.spots;
        const nav = this.nav;
        const ready = (name: string, gap: number) =>
            this.elapsed - (this.cooldowns[name] ?? -Infinity) > gap;
        const used = (name: string) => (this.cooldowns[name] = this.elapsed);
        if (!nav || !spots) {
            // No floor plan: a gentle loop on the rug, as before.
            this.queue.push({ kind: 'pose', clip: 'Idle_2', seconds: 6 });
            return;
        }
        // Rare Easter eggs: at most one every 45 s or so.
        if (this.elapsed - this.lastRare > 45 && r < 0.11) {
            const eggs = [
                ['zoomies', () => this.zoomies()],
                ['tail', () => this.chaseTail()],
                ['dead', () => this.playDead()],
                ['shoes', () => this.pounceShoes()],
                ['window', () => this.watchWindow()],
                ['door', () => this.waitAtDoor()],
            ] as const;
            const open = eggs.filter(([name]) => ready(name, 240));
            if (open.length) {
                const [name, run] =
                    open[Math.floor(this.random() * open.length)];
                used(name);
                this.lastRare = this.elapsed;
                run();
                return;
            }
        }
        if (r < 0.2 && ready('eat', 100)) {
            used('eat');
            return this.eat();
        }
        if (r < 0.28 && ready('nap', 180)) {
            used('nap');
            return this.goToBed(25 + this.random() * 20);
        }
        if (r < 0.4) {
            // Stand about: look around or sniff the floor.
            this.queue.push(
                { kind: 'mood', mood: 'idle' },
                {
                    kind: 'pose',
                    clip: this.random() < 0.5 ? 'Idle' : 'Idle_2_HeadLow',
                    seconds: 3 + this.random() * 4,
                },
            );
            return;
        }
        // Wander: mostly to a favourite place, sometimes anywhere roomy.
        const haunt = this.random() < 0.65 && spots.haunts.length;
        let to: Point | null = null;
        let look: Point | null = null;
        if (haunt) {
            const i = Math.floor(this.random() * spots.haunts.length);
            to = spots.haunts[i];
            look = spots.looks?.[i] ?? null;
        } else {
            for (let tries = 0; tries < 20 && !to; tries++) {
                const p = nav.randomFree(this.random);
                if (p && nav.clearance(p.x, p.z) > 1100) to = p;
            }
        }
        if (!to)
            return this.queue.push({ kind: 'pose', clip: 'Idle', seconds: 3 });
        this.queue.push(
            { kind: 'mood', mood: 'wandering' },
            { kind: 'walk', to },
        );
        if (look) this.queue.push({ kind: 'face', at: look });
        this.queue.push(
            { kind: 'mood', mood: 'idle' },
            {
                kind: 'pose',
                clip: this.random() < 0.55 ? 'Idle_2_HeadLow' : 'Idle_2',
                seconds: 2.5 + this.random() * 5,
            },
        );
    }

    goToBed(seconds: number) {
        const bed = this.spots?.bed;
        if (!bed) return;
        this.queue.push(
            { kind: 'mood', mood: 'wandering' },
            { kind: 'walk', to: bed },
            // A turn on the spot before settling, as dogs do.
            { kind: 'spin', turns: 1 },
            { kind: 'mood', mood: seconds === Infinity ? 'asleep' : 'napping' },
            { kind: 'lie', seconds, sleep: true, speed: 0.55 },
        );
        if (seconds !== Infinity)
            this.queue.push(
                { kind: 'rise' },
                { kind: 'mood', mood: 'idle' },
                { kind: 'pose', clip: 'Idle_2_HeadLow', seconds: 2 },
            );
    }

    eat() {
        const bowl = this.spots?.bowl;
        if (!bowl || !this.nav) return;
        // Stand with his mouth over the bowl, approaching from the roomiest side.
        let best: Point | null = null,
            room = -1;
        for (let a = 0; a < 8; a++) {
            const angle = (a / 8) * Math.PI * 2;
            const p = {
                x: bowl.x + Math.sin(angle) * 980,
                z: bowl.z + Math.cos(angle) * 980,
            };
            // Stand on the boards, not with his back feet in his bed.
            const floor = this.nav.floor + 40;
            const onFloor =
                this.nav.heightAt(p.x, p.z) < floor &&
                this.nav.heightAt(
                    p.x + (p.x - bowl.x) * 0.9,
                    p.z + (p.z - bowl.z) * 0.9,
                ) < floor;
            const c =
                this.nav.free(p.x, p.z) && onFloor
                    ? this.nav.clearance(p.x, p.z)
                    : -1;
            if (c > room) {
                room = c;
                best = p;
            }
        }
        if (!best) return;
        this.queue.push(
            { kind: 'mood', mood: 'wandering' },
            { kind: 'walk', to: best },
            { kind: 'face', at: bowl },
            { kind: 'mood', mood: 'eating' },
            { kind: 'pose', clip: 'Eating', seconds: 2.67 * 3 },
            { kind: 'mood', mood: 'idle' },
            { kind: 'pose', clip: 'Idle_2', seconds: 2 },
        );
    }

    zoomies() {
        const nav = this.nav;
        const loop: Point[] = [];
        if (nav)
            for (let tries = 0; tries < 60 && loop.length < 4; tries++) {
                const p = nav.randomFree(this.random);
                if (p && nav.clearance(p.x, p.z) > 1500) loop.push(p);
            }
        this.queue.push({ kind: 'mood', mood: 'zoomies' });
        for (const to of loop)
            this.queue.push({ kind: 'walk', to, gallop: true });
        this.queue.push(
            { kind: 'pose', clip: 'Gallop_Jump', seconds: 0.9, once: true },
            { kind: 'mood', mood: 'idle' },
            { kind: 'pose', clip: 'Idle_2', seconds: 3 },
        );
    }

    chaseTail() {
        this.queue.push(
            { kind: 'mood', mood: 'playing' },
            { kind: 'spin', turns: 3 },
            { kind: 'pose', clip: 'Jump_ToIdle', seconds: 1.3, once: true },
            { kind: 'mood', mood: 'idle' },
            { kind: 'pose', clip: 'Idle_2', seconds: 2 },
        );
    }

    playDead() {
        this.queue.push(
            { kind: 'mood', mood: 'playing' },
            { kind: 'lie', seconds: 2.8, speed: 1.2 },
            { kind: 'pose', clip: 'Jump_ToIdle', seconds: 1.3, once: true },
            { kind: 'mood', mood: 'idle' },
        );
        // He pops back up from the floor.
        this.queue.splice(2, 0, { kind: 'rise' });
    }

    pounceShoes() {
        const shoes = this.spots?.shoes;
        if (!shoes || !this.nav) return;
        const stand = this.nav.nearestFree({
            x: shoes.x - 1200,
            z: shoes.z - 900,
        });
        if (!stand) return;
        this.queue.push(
            { kind: 'mood', mood: 'playing' },
            { kind: 'walk', to: stand },
            { kind: 'face', at: shoes },
            { kind: 'pose', clip: 'Idle_2_HeadLow', seconds: 1.2 },
            { kind: 'pose', clip: 'Attack', seconds: 1.15, once: true },
            { kind: 'pose', clip: 'Attack', seconds: 1.15, once: true },
            {
                kind: 'pose',
                clip: 'Idle_HitReact_Left',
                seconds: 0.7,
                once: true,
            },
            { kind: 'mood', mood: 'idle' },
            { kind: 'pose', clip: 'Idle_2', seconds: 2 },
        );
    }

    watchWindow() {
        const w = this.spots?.window;
        if (!w) return;
        this.queue.push(
            { kind: 'mood', mood: 'wandering' },
            { kind: 'walk', to: w.stand },
            { kind: 'face', at: w.look },
            { kind: 'mood', mood: 'watching' },
            { kind: 'pose', clip: 'Idle', seconds: 12 },
            { kind: 'mood', mood: 'idle' },
        );
    }

    waitAtDoor() {
        const d = this.spots?.door;
        if (!d) return;
        this.queue.push(
            { kind: 'mood', mood: 'wandering' },
            { kind: 'walk', to: d.stand },
            { kind: 'face', at: d.look },
            { kind: 'mood', mood: 'watching' },
            { kind: 'pose', clip: 'Idle', seconds: 6 },
            { kind: 'pose', clip: 'Idle_2_HeadLow', seconds: 4 },
            { kind: 'mood', mood: 'idle' },
        );
    }

    // --- Running steps ---------------------------------------------------

    /** Turn toward `heading` at up to `rate` rad/s; returns what is left. */
    turn(heading: number, dt: number, rate: number) {
        const left = wrap(heading - this.group.rotation.y);
        const by = Math.sign(left) * Math.min(Math.abs(left), rate * dt);
        this.group.rotation.y = wrap(this.group.rotation.y + by);
        return Math.abs(left - by);
    }

    /** Advance the current step; true when it is finished. */
    run(step: Step, dt: number): boolean {
        this.stepTime += dt;
        const p = this.group.position;
        switch (step.kind) {
            case 'mood':
                this.mood = step.mood;
                return true;
            case 'walk': {
                if (!step.path) {
                    step.path =
                        this.nav?.path({ x: p.x, z: p.z }, step.to) ?? [];
                    if (!step.path.length) return true;
                }
                const next = step.path[0];
                const dx = next.x - p.x,
                    dz = next.z - p.z;
                const far = Math.hypot(dx, dz);
                if (far < 60) {
                    step.path.shift();
                    return !step.path.length;
                }
                const off = this.turn(
                    Math.atan2(dx, dz),
                    dt,
                    step.gallop ? 4.5 : 3.2,
                );
                // Slow right down to turn sharp corners; never walk sideways.
                const pace =
                    (step.gallop ? GALLOP : WALK) *
                    Math.max(0, Math.cos(Math.min(off, Math.PI / 2)));
                const move = Math.min(far, pace * dt);
                const nx = p.x + (dx / far) * move,
                    nz = p.z + (dz / far) * move;
                // Never step onto furniture: if the corner is tighter than the
                // path assumed, re-plan from here.
                if (
                    this.nav &&
                    !this.nav.free(nx, nz) &&
                    this.nav.free(p.x, p.z)
                ) {
                    step.path =
                        this.nav.path({ x: p.x, z: p.z }, step.to) ?? [];
                    if (!step.path.length) return true;
                    return false;
                }
                p.x = nx;
                p.z = nz;
                const gait = pace < WALK * 0.35 ? 0.6 : 1;
                this.play(step.gallop ? 'Gallop' : 'Walk', false, gait);
                return false;
            }
            case 'face': {
                const left = this.turn(angleTo(p, step.at), dt, 2.6);
                this.play(left > 0.05 ? 'Walk' : 'Idle_2', false, 0.7);
                return left < 0.05;
            }
            case 'pose':
                if (this.stepTime <= dt)
                    this.play(step.clip, !!step.once, step.speed ?? 1);
                return this.stepTime >= step.seconds;
            case 'spin': {
                // Tail chasing: tight gallop circles on the spot.
                this.play(
                    step.turns > 1 ? 'Gallop' : 'Walk',
                    false,
                    step.turns > 1 ? 1 : 0.8,
                );
                const rate = step.turns > 1 ? 7 : 3.4;
                this.group.rotation.y = wrap(this.group.rotation.y + rate * dt);
                return this.stepTime * rate >= step.turns * Math.PI * 2;
            }
            case 'lie':
                if (this.stepTime <= dt) {
                    this.play('Death', true, step.speed ?? 0.6);
                    this.lying = true;
                }
                this.asleep = !!step.sleep && this.stepTime > 1.8;
                return this.stepTime >= step.seconds;
            case 'rise':
                if (!this.lying) return true;
                if (this.stepTime <= dt) {
                    this.asleep = false;
                    this.play('Death', true, -0.9);
                }
                if (this.stepTime >= 1.2) {
                    this.lying = false;
                    return true;
                }
                return false;
        }
    }

    /** Returns true once the visible greeting has finished and chat can open. */
    update(seconds: number, reducedMotion: boolean) {
        const dt = Math.min(Math.max(seconds, 0), 0.05);
        if (this.greeting > 0) {
            this.greeting -= reducedMotion ? 1 : dt;
            if (!reducedMotion) {
                this.animate(dt);
            }
            if (this.greeting <= 0) {
                this.greeting = 0;
                this.lying = this.asleep = false;
                this.play('Idle_2');
                return true;
            }
            return false;
        }
        if (reducedMotion) return false;
        this.elapsed += dt;
        if (this.cheer > 0) {
            this.cheer -= dt;
            this.animate(dt);
            if (this.cheer <= 0) {
                this.cheer = 0;
                this.play('Idle_2');
            }
            return false;
        }
        if (this.watching && !this.lying && !this.bedtime) {
            this.turn(angleTo(this.group.position, this.watching), dt, 3);
            this.play('Idle_2');
            this.animate(dt);
            return false;
        }
        if (!this.nav) {
            this.loop(dt);
            this.animate(dt);
            return false;
        }
        if (!this.step) {
            if (!this.queue.length) {
                if (this.bedtime) {
                    if (!this.lying) this.goToBed(Infinity);
                    else
                        this.queue.push({
                            kind: 'lie',
                            seconds: Infinity,
                            sleep: true,
                        });
                } else this.decide();
            }
            this.step = this.queue.shift() ?? null;
            this.stepTime = 0;
        }
        if (this.step && this.run(this.step, dt)) {
            this.step = null;
            this.stepTime = 0;
        }
        this.animate(dt);
        return false;
    }

    /** Fallback without a floor plan: the old small loop by the desk. */
    loop(dt: number) {
        const step = this.elapsed % 26;
        const walking = step >= 8 && step < 22;
        this.play(walking ? 'Walk' : step >= 22 ? 'Idle_2_HeadLow' : 'Idle_2');
        if (!walking) return;
        this.phase += (dt * Math.PI * 2) / 14;
        this.group.position.set(
            -2600 + Math.sin(this.phase) * 1400,
            this.floor,
            3500 + DESK_Z + Math.cos(this.phase) * 700,
        );
        const heading = Math.atan2(
            Math.cos(this.phase) * 1400,
            -Math.sin(this.phase) * 700,
        );
        this.turn(heading, dt, 8);
    }

    /** Clips, then the extras layered on top: height, tail wag, ears. */
    animate(dt: number) {
        // Undo last frame's extras: bones a clip does not animate would
        // otherwise keep turning.
        this.tail.forEach((bone, i) =>
            bone.rotateY(-Math.sin(this.wag - i * 0.5) * this.extra.tail),
        );
        this.ears.forEach((ear) => ear.rotateX(this.extra.ears));
        this.mixer.update(dt);
        // Keep him centred while he rolls onto his side, and back.
        const lying = this.lying && !(this.step?.kind === 'rise');
        this.down += ((lying ? 1 : 0) - this.down) * Math.min(1, dt * 2.2);
        this.model.position.x = this.baseX + LIE_SHIFT * this.down;
        if (this.nav) {
            // Step up onto rugs and his bed, down onto the boards.
            const target = this.nav.heightAt(
                this.group.position.x,
                this.group.position.z,
            );
            this.y += (target - this.y) * Math.min(1, dt * 10);
            this.group.position.y = this.y;
        }
        this.petting = Math.max(0, this.petting - dt);
        // Happy tail: a quick wag while petted, a lazy one when moving.
        const happy = this.petting > 0 ? (this.lying ? 0.45 : 1) : 0;
        const moving = this.current === this.actions.Walk ? 0.25 : 0;
        const amount = Math.max(happy, moving);
        this.wag += dt * (this.petting > 0 ? 15 : 7);
        this.extra.tail = 0.22 * amount;
        this.tail.forEach((bone, i) =>
            bone.rotateY(Math.sin(this.wag - i * 0.5) * this.extra.tail),
        );
        // Ears back while petted.
        this.extra.ears = 0.5 * happy;
        this.ears.forEach((ear) => ear.rotateX(-this.extra.ears));
    }
}
