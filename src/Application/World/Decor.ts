import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import Application from '../Application';
import BakedModel from '../Utils/BakedModel';
import Husky from './Husky';
import bus from '../UI/EventBus';
import { occluded } from '../Utils/Occlusion';
import { DESK_Z, PIT } from './Layout';
import NavGrid, { Point } from './NavGrid';
import Football, { BALL_RADIUS } from './Football';
/** Face of the back wall (the flag wall), room units. */
const BACK_WALL = -6500;

export default class Decor {
    app = new Application();
    dog: THREE.Group;
    husky: Husky;
    labelBlocked = false;
    labelCheck = 0;
    nav: NavGrid;
    football: Football | undefined;
    /** Hearts and Zzz floating up from Begu. */
    floaters: {
        sprite: THREE.Sprite;
        age: number;
        life: number;
        drift: THREE.Vector3;
        still: boolean;
    }[] = [];
    heart: THREE.SpriteMaterial;
    zzz: THREE.SpriteMaterial;
    zzzTimer = 0;
    constructor() {
        const { scene, resources } = this.app;
        const deskPropsStart = scene.children.length;
        const old = new BakedModel(
            resources.items.gltfModel.decorModel,
            resources.items.texture.decorTexture,
            900,
        ).getModel();
        old.traverse((part) => {
            if (part instanceof THREE.Mesh)
                part.visible = part.name === 'coffee';
        });
        scene.add(old);
        const ceramic = new THREE.MeshStandardMaterial({
            color: '#d3d8cb',
            roughness: 0.85,
        });
        const soil = new THREE.MeshStandardMaterial({
            color: '#38372b',
            roughness: 1,
        });
        const leaf = new THREE.MeshStandardMaterial({
            color: '#617b52',
            roughness: 0.8,
            side: THREE.DoubleSide,
        });
        const leafLight = new THREE.MeshStandardMaterial({
            color: '#849967',
            roughness: 0.8,
            side: THREE.DoubleSide,
        });
        const pot = new THREE.Mesh(
            new THREE.CylinderGeometry(260, 200, 400, 48),
            ceramic,
        );
        pot.position.set(1890, -250, -770);
        pot.castShadow = true;
        pot.receiveShadow = true;
        scene.add(pot);
        const dirt = new THREE.Mesh(new THREE.CircleGeometry(243, 40), soil);
        dirt.rotation.x = -Math.PI / 2;
        dirt.position.set(1890, -45, -770);
        scene.add(dirt);
        for (let i = 0; i < 12; i++) {
            const angle = i * 2.4;
            const stemHeight = 430 + (i % 4) * 170;
            const stem = new THREE.Mesh(
                new THREE.CylinderGeometry(6, 10, stemHeight, 7),
                leaf,
            );
            stem.position.set(
                1890 + Math.sin(angle) * 55,
                -45 + stemHeight / 2,
                -770 + Math.cos(angle) * 55,
            );
            stem.rotation.z = Math.sin(angle) * 0.25;
            scene.add(stem);
            const blade = new THREE.Mesh(
                new THREE.SphereGeometry(1, 18, 12),
                i % 2 ? leaf : leafLight,
            );
            blade.scale.set(90, stemHeight * 0.62, 24);
            blade.position.set(
                1890 + Math.sin(angle) * 140,
                stemHeight * 0.56,
                -770 + Math.cos(angle) * 140,
            );
            blade.rotation.set(
                Math.cos(angle) * 0.4,
                angle,
                Math.sin(angle) * 0.48,
            );
            blade.castShadow = true;
            scene.add(blade);
        }
        const notebook = new THREE.Mesh(
            new RoundedBoxGeometry(890, 55, 680, 3, 20),
            new THREE.MeshStandardMaterial({
                color: '#3e666e',
                roughness: 0.9,
            }),
        );
        notebook.position.set(-2470, -425, -650);
        notebook.rotation.y = -0.18;
        notebook.castShadow = true;
        scene.add(notebook);
        const pages = new THREE.Mesh(
            new THREE.BoxGeometry(852, 33, 645),
            new THREE.MeshStandardMaterial({ color: '#e8e5d9', roughness: 1 }),
        );
        pages.position.copy(notebook.position);
        pages.position.y += 8;
        pages.rotation.copy(notebook.rotation);
        scene.add(pages);
        const cover = notebook.clone();
        cover.scale.y = 0.15;
        cover.position.y = -394;
        scene.add(cover);
        const pencil = new THREE.Mesh(
            new THREE.CylinderGeometry(10, 10, 670, 6),
            new THREE.MeshStandardMaterial({
                color: '#d8b55a',
                roughness: 0.6,
            }),
        );
        pencil.rotation.z = Math.PI / 2;
        pencil.rotation.y = 0.27;
        pencil.position.set(-2470, -380, -590);
        pencil.castShadow = true;
        scene.add(pencil);
        // Desk props were authored around the old island desk (Layout.ts).
        for (const prop of scene.children.slice(deskPropsStart))
            prop.position.z += DESK_Z;
        this.makeBegu();
    }
    makeBegu() {
        this.husky = new Husky(this.app.resources.items.gltfModel.beguModel);
        this.dog = this.husky.group;
        // The floor plan is read from the furnished room before he joins it.
        this.nav = this.floorPlan();
        this.husky.nav = this.nav;
        this.husky.spots = this.spots();
        // The football rolls on its own plan: furniture padded by its radius,
        // and his bed is an obstacle (its rim), not somewhere to lie.
        const ballNav = this.floorPlan(BALL_RADIUS, BALL_RADIUS, false);
        this.football = new Football(
            ballNav,
            ballNav.nearestFree({ x: 3500, z: -2100 }) ?? { x: 3500, z: -2100 },
            undefined,
            this.app.resources.items.gltfModel.footballModel?.scene,
        );
        this.app.scene.add(this.football.group);
        this.app.scene.add(this.dog);
        this.heart = this.floaterMaterial((ctx) => {
            ctx.fillStyle = '#ff5d7a';
            ctx.beginPath();
            ctx.moveTo(64, 108);
            ctx.bezierCurveTo(12, 70, 8, 34, 36, 22);
            ctx.bezierCurveTo(52, 16, 62, 26, 64, 38);
            ctx.bezierCurveTo(66, 26, 76, 16, 92, 22);
            ctx.bezierCurveTo(120, 34, 116, 70, 64, 108);
            ctx.fill();
        });
        this.zzz = this.floaterMaterial((ctx) => {
            ctx.fillStyle = '#dfe8ff';
            ctx.font = 'bold 84px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('z', 64, 64);
        });
        bus.on('goodNight', (asleep: boolean) => this.husky.goodNight(asleep));
        // Begu keeps you company: he sits facing the desk while you use the Mac,
        // and hops when a record starts from the room.
        const desk = new THREE.Vector3(-350, 0, 480 + DESK_Z);
        bus.on('enterMonitor', () => (this.husky.watching = desk));
        bus.on('leftMonitor', () => (this.husky.watching = null));
        bus.on('albumPicked', () =>
            this.husky.hop(this.app.reducedMotion.matches),
        );
    }
    /**
     * Begu's floor plan: every piece of furniture (anything standing up
     * between the boards and his head height) blocked out and padded for his
     * body, the pit fenced off, rugs and his bed as surfaces he steps onto.
     */
    floorPlan(PAD = 380, LOW_PAD = 120, openBed = true) {
        const FLOOR = -3015;
        const nav = new NavGrid(
            { minX: -17900, maxX: 17900, minZ: -6450, maxZ: 18400 },
            150,
            FLOOR,
        );
        // PAD: half his body width plus a little: he fits between furniture
        // a real husky would squeeze through.
        const box = new THREE.Box3();
        const shown = (o: THREE.Object3D | null): boolean =>
            !o || (o.visible && shown(o.parent));
        const scene = this.app.scene;
        scene.updateMatrixWorld(true);
        const bed: { box: THREE.Box3; y: number }[] = [];
        scene.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh || !shown(mesh)) return;
            const material = Array.isArray(mesh.material)
                ? mesh.material[0]
                : mesh.material;
            // Floating labels and glows are not furniture.
            if (material?.transparent && !material.depthWrite) return;
            box.setFromObject(mesh);
            if (box.isEmpty()) return;
            const size = box.getSize(new THREE.Vector3());
            if (size.x > 20000 || size.z > 20000) return; // walls, floor, ceiling
            const rect = {
                minX: box.min.x,
                maxX: box.max.x,
                minZ: box.min.z,
                maxZ: box.max.z,
            };
            if (openBed && mesh.name.startsWith('Begu bed')) {
                if (mesh.userData.surface !== undefined)
                    bed.push({ box: box.clone(), y: mesh.userData.surface });
                return;
            }
            if (box.max.y < FLOOR + 130) {
                // Rugs: something to stand on (sinking a little into the pile).
                if (box.max.y > FLOOR + 5 && box.min.y > FLOOR - 60)
                    nav.surface(rect, box.max.y - 20);
                return;
            }
            if (box.min.y > FLOOR + 1700) return; // above his head
            // Floor clutter (shoes, a mug, a dropped cushion, books) he steps
            // around closely; furniture gets his full body's clearance.
            const low =
                box.max.y < FLOOR + 800 && size.x < 2600 && size.z < 2600;
            const pad = low ? LOW_PAD : PAD;
            // Big, organic shapes (bean bags, the ottoman, cloth) block their
            // real footprint below his head height, not their bounding box.
            const position = mesh.geometry.getAttribute('position');
            if (size.x * size.z > 1.5e6 && position && position.count > 200) {
                const xs: number[] = [],
                    zs: number[] = [];
                const v = new THREE.Vector3();
                const every = Math.max(1, Math.floor(position.count / 6000));
                for (let i = 0; i < position.count; i += every) {
                    v.fromBufferAttribute(position, i).applyMatrix4(
                        mesh.matrixWorld,
                    );
                    if (v.y > FLOOR + 1700 || v.y < FLOOR - 50) continue;
                    xs.push(v.x);
                    zs.push(v.z);
                }
                nav.blockPoints(xs, zs, pad + nav.cell / 2);
                return;
            }
            nav.block(rect, pad);
        });
        // The pit is a drop, not furniture.
        nav.block(
            {
                minX: PIT.x - PIT.width / 2,
                maxX: PIT.x + PIT.width / 2,
                minZ: PIT.z,
                maxZ: PIT.z + PIT.length,
            },
            PAD + 150,
        );
        // The ball also bounces off the walls, a radius from the skirting.
        if (!openBed) {
            const { minX, maxX, minZ, maxZ } = {
                minX: -17960,
                maxX: 17960,
                minZ: BACK_WALL,
                maxZ: 18460,
            };
            for (const rect of [
                { minX, maxX, minZ, maxZ: minZ },
                { minX, maxX, minZ: maxZ, maxZ },
                { minX, maxX: minX, minZ, maxZ },
                { minX: maxX, maxX, minZ, maxZ },
            ])
                nav.block(rect, PAD);
        }
        // His bed is his: walkable, and he lies on the cushion.
        for (const { box: b, y } of openBed ? bed : []) {
            const rect = {
                minX: b.min.x + 250,
                maxX: b.max.x - 250,
                minZ: b.min.z + 250,
                maxZ: b.max.z - 250,
            };
            nav.open(rect);
            nav.surface(rect, y);
        }
        return nav;
    }

    /** Where things are, from the room itself. */
    spots() {
        const at = (name: string): Point | null => {
            const o = this.app.scene.getObjectByName(name);
            if (!o) return null;
            const c = new THREE.Box3()
                .setFromObject(o)
                .getCenter(new THREE.Vector3());
            return { x: c.x, z: c.z };
        };
        const free = (p: Point) => this.nav.nearestFree(p) ?? p;
        const bed = at('Begu bed') ?? { x: -4650, z: 800 + DESK_Z };
        const shoes = at('Kicked-off Spezial (right)') ?? undefined;
        // Favourite places, each with something to look at.
        const haunts: [Point, Point | null][] = [
            [
                { x: -14700, z: 6200 },
                { x: -18000, z: 6200 },
            ], // by the window
            [{ x: -11500, z: 6200 }, null], // on the Graduation rug
            [
                { x: -6300, z: 10800 },
                { x: 0, z: 17500 },
            ], // by the blue bean bag, TV
            [
                { x: 5600, z: 9200 },
                { x: 0, z: 17500 },
            ], // pit side, TV
            [
                { x: 8000, z: 2600 },
                { x: 12500, z: 4500 },
            ], // by the bed
            [
                { x: -600, z: -1300 },
                { x: -350, z: -4200 },
            ], // by the desk chair
            [
                { x: -12400, z: -2600 },
                { x: -12400, z: -6000 },
            ], // by the record player
            [{ x: -2500, z: 2400 }, null], // middle of the room
            [
                { x: 12500, z: 15600 },
                { x: 10000, z: 15300 },
            ], // by the shoes
        ];
        return {
            bed,
            bowl: at('Begu bowl') ?? { x: -7000, z: 950 + DESK_Z },
            haunts: haunts.map(([p]) => free(p)),
            looks: haunts.map(([, look]) => look),
            shoes,
            window: {
                stand: free({ x: -14900, z: 6200 }),
                look: { x: -18000, z: 6200 },
            },
            door: {
                stand: free({ x: 15800, z: 12400 }),
                look: { x: 18000, z: 12400 },
            },
        };
    }

    floaterMaterial(draw: (ctx: CanvasRenderingContext2D) => void) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        draw(canvas.getContext('2d')!);
        const map = new THREE.CanvasTexture(canvas);
        map.encoding = THREE.sRGBEncoding;
        return new THREE.SpriteMaterial({
            map,
            transparent: true,
            depthWrite: false,
            toneMapped: false,
        });
    }

    float(
        material: THREE.SpriteMaterial,
        size: number,
        life: number,
        spread: number,
    ) {
        const still = this.app.reducedMotion.matches;
        const sprite = new THREE.Sprite(material.clone());
        sprite.scale.setScalar(size);
        sprite.position
            .copy(this.husky.headPosition())
            .add(
                new THREE.Vector3(
                    (Math.random() - 0.5) * spread,
                    350,
                    (Math.random() - 0.5) * spread,
                ),
            );
        sprite.renderOrder = 10;
        sprite.raycast = () => undefined; // never in the way of a click
        this.app.scene.add(sprite);
        this.floaters.push({
            sprite,
            age: 0,
            life,
            still,
            drift: new THREE.Vector3(
                (Math.random() - 0.5) * 250,
                520,
                (Math.random() - 0.5) * 250,
            ),
        });
    }

    /**
     * Click the football: it is kicked out into the room, away from the
     * visitor, and Begu gives chase and brings it back here.
     */
    kick() {
        const ball = this.football;
        if (!ball || ball.carried) return;
        const camera = this.app.camera.instance;
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const from = ball.position;
        const target = ball.target(
            { x: forward.x, z: forward.z },
            Math.random,
            // Somewhere he can get to (cheap: close to his own free floor).
            (p) => {
                const q = this.nav.nearestFree(p);
                return !!q && Math.hypot(q.x - p.x, q.z - p.z) < 900;
            },
        );
        if (!target) return;
        if (this.app.reducedMotion.matches) return ball.place(target);
        ball.kick(target);
        this.app.world.audioManager?.play('mouseDown', 0.3, -900);
        if (this.husky.fetch(ball, from)) this.float(this.heart, 200, 1.2, 300);
    }

    kickLabel() {
        if (this.football?.carried) return 'Begu’s bringing it back';
        if (this.husky.bedtime) return 'Kick the ball · Begu’s asleep';
        return 'Kick the ball for Begu';
    }

    /** Clicking Begu pets him. */
    pet() {
        const result = this.husky.pet(
            this.app.camera.instance.position,
            this.app.reducedMotion.matches,
        );
        const hearts = result === 'zoomies' ? 6 : result === 'sleepy' ? 1 : 3;
        for (let i = 0; i < hearts; i++)
            setTimeout(() => this.float(this.heart, 230, 1.5, 420), i * 170);
    }

    /** What the hover label says over Begu. */
    petLabel() {
        return this.husky.asleep ? 'Pet Begu · he’s asleep' : 'Pet Begu';
    }

    openBegu() {
        this.husky.greet(
            this.app.camera.instance.position,
            this.app.reducedMotion.matches,
        );
    }
    update() {
        const dt = this.app.time.delta / 1000;
        for (const f of this.floaters) {
            f.age += dt;
            const t = f.age / f.life;
            if (!f.still)
                f.sprite.position.addScaledVector(f.drift, dt / f.life);
            f.sprite.material.opacity = Math.min(1, t * 6) * (1 - t) ** 1.5;
            if (t >= 1) {
                this.app.scene.remove(f.sprite);
                f.sprite.material.dispose();
            }
        }
        this.floaters = this.floaters.filter((f) => f.age < f.life);
        if (!this.app.reducedMotion.matches) this.football?.update(dt);
        else if (this.football) this.football.velocity.set(0, 0);
        // Zzz while he sleeps.
        if (this.husky.asleep) {
            this.zzzTimer -= dt;
            if (this.zzzTimer <= 0) {
                this.zzzTimer = 1.6;
                this.float(this.zzz, 200 + Math.random() * 90, 3, 120);
            }
        }
        if (
            this.husky.update(
                this.app.time.delta / 1000,
                this.app.reducedMotion.matches,
            )
        ) {
            this.app.camera.trigger('enterMonitor', ['begu']);
            document
                .querySelector<HTMLIFrameElement>('#computer-screen')
                ?.contentWindow?.postMessage(
                    { type: 'openBegu' },
                    location.origin,
                );
        }
        const label = document.getElementById('begu-label');
        if (label) {
            const point = this.dog.position
                .clone()
                .add(new THREE.Vector3(0, 2000, 0))
                .project(this.app.camera.instance);
            const x = ((point.x + 1) * innerWidth) / 2,
                y = ((-point.y + 1) * innerHeight) / 2;
            label.style.left = Math.round(x) + 'px';
            label.style.top = Math.round(y) + 'px';
            const mood = {
                idle: 'Chat',
                wandering: 'Chat',
                watching: 'Chat',
                eating: 'Eating',
                napping: 'Napping',
                asleep: 'Asleep',
                zoomies: 'Zoomies!',
                playing: 'Playing',
                fetching: 'Fetch!',
            }[this.husky.mood];
            const span = label.querySelector('span');
            if (span && span.textContent !== mood) span.textContent = mood;
            if (this.app.time.elapsed - this.labelCheck > 200) {
                this.labelCheck = this.app.time.elapsed;
                this.labelBlocked = occluded(
                    this.app.scene,
                    this.app.camera.instance,
                    this.dog.position.clone().add(new THREE.Vector3(0, 500, 0)),
                    this.dog,
                );
            }
            label.hidden =
                this.labelBlocked ||
                this.app.camera.currentKeyframe === 'monitor' ||
                this.app.camera.targetKeyframe === 'monitor' ||
                point.z > 1 ||
                x < 60 ||
                x > innerWidth - 60 ||
                y < 70 ||
                y > innerHeight - 80;
        }
    }
}
