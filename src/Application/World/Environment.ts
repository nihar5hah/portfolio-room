import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import Application from '../Application';
import { ALBUMS } from '../Audio/AlbumAudio';
import BakedModel from '../Utils/BakedModel';
import MatchBoard from './MatchBoard';
import bus from '../UI/EventBus';
import {
    DESK_Z,
    DUNE_AT,
    DUNE_COLOR,
    DUNE_SCALE,
    DUNE_POSES,
    MEDIA_CONSOLE,
    PIT,
    RUG_AT,
    TATAMI,
} from './Layout';
import { bakeDune, shadeCreases, splitDune, wovenFabric } from './DuneSofa';
import { furnishLounge, rest, throwBlanket } from './Lounge';
import { paintSky, skyState, SkyState } from './DayNight';
import { softPillow, towerSpeaker } from './Fixtures';
/** Brightness groups for the room's own lights (see `lighting`). */
type Practical = 'lamp' | 'picture' | 'strip' | 'ceiling' | 'tv';
const mixColor = (a: string, b: string, t: number) =>
    new THREE.Color(a).lerp(new THREE.Color(b), THREE.MathUtils.clamp(t, 0, 1));

export default class Environment {
    /** Repaints the window view for a sky state. */
    paintSky: (sky: SkyState) => void = () => undefined;
    sky: SkyState;
    skyMinute = -1;
    moon: THREE.SpotLight;
    lamp: THREE.PointLight;
    hemisphere: THREE.HemisphereLight;
    key: THREE.DirectionalLight;
    /** The room's own lights and glowing surfaces, at their full level. */
    practicals: { light: THREE.Light; full: number; group: Practical }[];
    glows: {
        material: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
        base: THREE.Color;
        full: number;
        group: Practical;
    }[];
    curtains: { mesh: THREE.Mesh; side: number; open: number }[];
    fanBlades: THREE.Object3D | undefined;
    /** Good Night: 0 awake, 1 asleep, eased in `update`. */
    sleep = 0;
    sleepTarget = 0;
    mirror: THREE.MeshBasicMaterial | undefined;
    reflections = new WeakMap<THREE.Material, number>();
    reflectionLevel = -1;
    lightingKey = '';
    flagLights: { light: THREE.Light; full: number }[] = [];
    flagLightScale = 1;
    flagLightTarget = 1;
    matchBoard: MatchBoard;
    clockMap: THREE.CanvasTexture;
    clockMinute = -1;
    record: THREE.Group;
    recordLabel: THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>;
    sleeveCover: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
    recordMaterial: THREE.MeshStandardMaterial;
    recordAlbum: string;
    recordArtwork: Record<
        string,
        { sleeve: THREE.Texture; label: THREE.Texture; color: string }
    >;
    dust: THREE.Points;
    dustTime = 0;
    constructor() {
        const app = new Application();
        const room = new RoomEnvironment();
        const pmrem = new THREE.PMREMGenerator(app.renderer.instance);
        app.scene.environment = pmrem.fromScene(room, 0.04).texture;
        room.traverse((part) => {
            if (part instanceof THREE.Mesh) {
                part.geometry.dispose();
                (part.material as THREE.Material).dispose();
            }
        });
        pmrem.dispose();
        const original = new BakedModel(
            app.resources.items.gltfModel.environmentModel,
            app.resources.items.texture.environmentTexture,
            900,
        ).getModel();
        // Keep the original room layout and chair mesh; replace the desk, floor and material treatment.
        for (const name of ['desk', 'Background']) {
            const part = original.getObjectByName(name);
            if (part) part.visible = false;
        }
        original.traverse((part) => {
            if (part instanceof THREE.Mesh && part.visible) {
                part.geometry.computeVertexNormals();
                part.material = new THREE.MeshStandardMaterial({
                    color: part.name === 'chair_seat' ? '#353b46' : '#15181e',
                    roughness: 0.65,
                    metalness: 0.12,
                });
                part.castShadow = true;
                part.receiveShadow = true;
            }
        });
        app.scene.background = new THREE.Color('#101218');
        app.scene.fog = null;
        app.scene.add(original);
        const walnut = new THREE.MeshStandardMaterial({
            color: '#60402d',
            roughness: 0.56,
        });
        const frame = new THREE.MeshStandardMaterial({
            color: '#20252e',
            roughness: 0.45,
            metalness: 0.2,
        });
        const desk = new THREE.Group();
        desk.name = 'Walnut studio desk';
        const top = new THREE.Mesh(
            new RoundedBoxGeometry(6300, 135, 2920, 4, 90),
            walnut,
        );
        top.position.set(-550, -520, 220);
        top.castShadow = true;
        top.receiveShadow = true;
        desk.add(top);
        for (const x of [-3260, 2160])
            for (const z of [-930, 1370]) {
                const leg = new THREE.Mesh(
                    new RoundedBoxGeometry(115, 2410, 150, 2, 24),
                    frame,
                );
                leg.position.set(x, -1780, z);
                leg.castShadow = true;
                desk.add(leg);
            }
        const rail = new THREE.Mesh(new THREE.BoxGeometry(5470, 90, 90), frame);
        rail.position.set(-550, -2230, -930);
        rail.castShadow = true;
        desk.add(rail);
        // Desk and its chair stand under the flag (see Layout.ts).
        desk.position.z = DESK_Z;
        original.position.z += DESK_Z;
        app.scene.add(desk);
        app.scene.add(this.buildRoom());
        // Hemisphere fill is free per-fragment; it replaces the room-wide
        // "Ceiling fill" point light that cost a full light loop everywhere.
        // Colour and strength follow Bangalore's sky (see `lighting`).
        this.hemisphere = new THREE.HemisphereLight('#c1cad8', '#6a584d', 0.72);
        app.scene.add(this.hemisphere);
        const light = (this.key = new THREE.DirectionalLight('#bad5ff', 1.05));
        light.name = 'Cool doorway key';
        light.position.set(16800, 6200, 12400);
        light.target.position.set(-4000, -1800, 1500);
        light.castShadow = true;
        light.shadow.mapSize.set(2048, 2048);
        // Cover the full room: the old desk-sized frustum sliced the TV-area shadows.
        Object.assign(light.shadow.camera, {
            left: -26000,
            right: 26000,
            top: 22000,
            bottom: -22000,
            near: 100,
            far: 60000,
        });
        light.shadow.normalBias = 8;
        light.shadow.bias = -0.0002;
        light.shadow.radius = 7;
        app.scene.add(light, light.target);
    }
    // Furniture surrounds the desk while preserving the husky’s route.
    buildRoom() {
        const app = new Application();
        const FLOOR = -3015;
        const BACK = -6500;
        const room = new THREE.Group();
        room.name = 'Nihar’s Barça den';
        this.practicals = [];
        this.glows = [];
        this.curtains = [];
        const practical = <T extends THREE.Light>(
            light: T,
            group: Practical,
        ) => {
            this.practicals.push({ light, full: light.intensity, group });
            return light;
        };
        /** Room units per metre. */
        const M = 3300;
        // Scanned plants and the ceiling fan (Poly Haven, CC0).
        const roomProps = app.resources.items.gltfModel.roomProps?.scene;
        const scanned = (names: string[], scale: number) => {
            const plant = new THREE.Group();
            for (const name of names) {
                const part = roomProps?.getObjectByName(name);
                if (!part) continue;
                const copy = part.clone(true);
                copy.position.multiplyScalar(scale);
                copy.scale.multiplyScalar(scale);
                copy.traverse((o) => (o.castShadow = o.receiveShadow = true));
                plant.add(copy);
            }
            return plant;
        };
        const glowing = <
            T extends THREE.MeshBasicMaterial | THREE.MeshStandardMaterial,
        >(
            material: T,
            group: Practical,
        ) => {
            const standard = material instanceof THREE.MeshStandardMaterial;
            this.glows.push({
                material,
                base: (standard ? material.emissive : material.color).clone(),
                full: standard ? material.emissiveIntensity : 1,
                group,
            });
            return material;
        };
        const material = (color: string, roughness = 0.8) =>
            new THREE.MeshStandardMaterial({ color, roughness });
        const charcoal = material('#23262d');
        const black = material('#14171e', 0.55);
        const wood = material('#513b2c');
        const brass = material('#ab8552', 0.38);
        const fabric = material('#303b51');
        const blue = material('#193969');
        const red = material('#7c263d');
        const cream = material('#d8c6a4');
        const box = (
            w: number,
            h: number,
            d: number,
            mat: THREE.Material,
            x: number,
            y: number,
            z: number,
            radius = 0,
        ) => {
            const mesh = new THREE.Mesh(
                radius
                    ? new RoundedBoxGeometry(w, h, d, 3, radius)
                    : new THREE.BoxGeometry(w, h, d),
                mat,
            );
            mesh.position.set(x, y, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            room.add(mesh);
            return mesh;
        };
        const cylinder = (
            r: number,
            h: number,
            mat: THREE.Material,
            x: number,
            y: number,
            z: number,
        ) => {
            const mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(r, r, h, 40),
                mat,
            );
            mesh.position.set(x, y, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            room.add(mesh);
            return mesh;
        };
        const glow = (color: string) =>
            new THREE.MeshBasicMaterial({ color, toneMapped: false });
        const label = (
            text: string,
            w: number,
            h: number,
            x: number,
            y: number,
            z: number,
            color = '#d8c6a4',
        ) => {
            const canvas = document.createElement('canvas');
            canvas.width = 1024;
            canvas.height = 256;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '500 70px -apple-system, sans-serif';
            ctx.fillText(text, 512, 128, 960);
            const map = new THREE.CanvasTexture(canvas);
            map.encoding = THREE.sRGBEncoding;
            const mesh = new THREE.Mesh(
                new THREE.PlaneGeometry(w, h),
                new THREE.MeshBasicMaterial({
                    map,
                    transparent: true,
                    depthWrite: false,
                }),
            );
            mesh.position.set(x, y, z);
            room.add(mesh);
            return mesh;
        };

        // Conversation pit sized to the Dune (Layout.ts PIT): the boards stop
        // at a walnut nosing around the opening; walnut walls, a carpeted base
        // and a leather tatami step on the TV side sit below.
        // Floor spans x ±18000, z -11000..22000.
        const PIT_FLOOR = FLOOR - PIT.drop;
        const NOSING = 150;
        const pitX0 = PIT.x - PIT.width / 2;
        const pitX1 = PIT.x + PIT.width / 2;
        const pitZ0 = PIT.z;
        const pitZ1 = PIT.z + PIT.length;
        const [holeX0, holeX1] = [pitX0 - NOSING, pitX1 + NOSING];
        const [holeZ0, holeZ1] = [pitZ0 - NOSING, pitZ1 + NOSING];
        const slab = (x0: number, x1: number, z0: number, z1: number) => {
            const piece = box(
                x1 - x0,
                100,
                z1 - z0,
                wood,
                (x0 + x1) / 2,
                FLOOR - 50,
                (z0 + z1) / 2,
            );
            piece.name = 'Wood floor';
        };
        slab(-18000, holeX0, -11000, 22000);
        slab(holeX1, 18000, -11000, 22000);
        slab(holeX0, holeX1, -11000, holeZ0);
        slab(holeX0, holeX1, holeZ1, 22000);
        const seam = (x: number, z0: number, z1: number) =>
            box(7, 3, z1 - z0, black, x, FLOOR + 1, (z0 + z1) / 2);
        for (let x = -18000; x <= 18000; x += 900)
            if (x > holeX0 && x < holeX1) {
                seam(x, -11000, holeZ0);
                seam(x, holeZ1, 22000);
            } else seam(x, -11000, 22000);
        const walnut = material('#6a4a33', 0.55);
        const pitWall = material('#3b2b21', 0.7);
        const carpet = material('#20252f', 1);
        // Nosing sits 12 units proud of the boards so its top never z-fights them.
        const nose = (w: number, d: number, x: number, z: number) =>
            box(w, 60, d, walnut, x, FLOOR - 18, z, 18);
        nose(holeX1 - holeX0, NOSING, PIT.x, pitZ0 - NOSING / 2).name =
            'Pit nosing';
        nose(holeX1 - holeX0, NOSING, PIT.x, pitZ1 + NOSING / 2);
        nose(NOSING, PIT.length, pitX0 - NOSING / 2, pitZ0 + PIT.length / 2);
        nose(NOSING, PIT.length, pitX1 + NOSING / 2, pitZ0 + PIT.length / 2);
        const wallH = PIT.drop - 48;
        const wallY = PIT_FLOOR + wallH / 2;
        box(
            holeX1 - holeX0,
            wallH,
            NOSING,
            pitWall,
            PIT.x,
            wallY,
            pitZ0 - NOSING / 2,
        );
        box(
            holeX1 - holeX0,
            wallH,
            NOSING,
            pitWall,
            PIT.x,
            wallY,
            pitZ1 + NOSING / 2,
        );
        box(
            NOSING,
            wallH,
            PIT.length,
            pitWall,
            pitX0 - NOSING / 2,
            wallY,
            pitZ0 + PIT.length / 2,
        );
        box(
            NOSING,
            wallH,
            PIT.length,
            pitWall,
            pitX1 + NOSING / 2,
            wallY,
            pitZ0 + PIT.length / 2,
        );
        box(
            PIT.width,
            100,
            PIT.length,
            carpet,
            PIT.x,
            PIT_FLOOR - 50,
            pitZ0 + PIT.length / 2,
        ).name = 'Pit carpet';
        // Leather tatami along the TV side, at the Dune's seat height: four
        // flat pads, one per Dune column, as the step down and a surface for
        // the table. Seams of 12 units keep neighbouring faces apart.
        const tatamiZ0 = pitZ1 - TATAMI.depth;
        const tatamiTop = PIT_FLOOR + TATAMI.height;
        const leather = new THREE.MeshStandardMaterial({
            color: '#7a4a2e',
            roughness: 0.5,
        });
        const tatami = new THREE.Group();
        tatami.name = 'Dune tatami';
        const pad = PIT.width / 4;
        for (let i = 0; i < 4; i++) {
            const mat = new THREE.Mesh(
                new RoundedBoxGeometry(
                    pad - 12,
                    TATAMI.height,
                    TATAMI.depth - 12,
                    3,
                    45,
                ),
                leather,
            );
            mat.position.set(
                pitX0 + pad * (i + 0.5),
                PIT_FLOOR + TATAMI.height / 2,
                tatamiZ0 + TATAMI.depth / 2,
            );
            mat.castShadow = mat.receiveShadow = true;
            tatami.add(mat);
        }
        room.add(tatami);
        // The camera is constrained inside these four walls and ceiling.
        const back = new THREE.Mesh(
            new THREE.PlaneGeometry(36000, 16000),
            charcoal,
        );
        back.name = 'Back wall';
        back.position.set(0, FLOOR + 8000, BACK);
        back.receiveShadow = true;
        room.add(back);
        for (const side of [-1, 1]) {
            const wall = new THREE.Mesh(
                new THREE.PlaneGeometry(33000, 16000),
                charcoal,
            );
            wall.position.set(side * 18000, FLOOR + 8000, 5500);
            wall.rotation.y = (-side * Math.PI) / 2;
            wall.receiveShadow = true;
            room.add(wall);
        }
        const front = back.clone();
        front.name = 'Front wall';
        front.position.z = 18500;
        front.rotation.y = Math.PI;
        room.add(front);
        const CEILING = FLOOR + 13900;
        const ceiling = new THREE.Mesh(
            new THREE.PlaneGeometry(36000, 25000),
            charcoal,
        );
        ceiling.name = 'Ceiling';
        // Just above the highest authored camera point (loading shot, y 10000):
        // lower would cut through the original camera sweep.
        ceiling.position.set(0, CEILING, 6000);
        ceiling.rotation.x = Math.PI / 2;
        room.add(ceiling);
        box(36000, 180, 80, black, 0, FLOOR + 90, BACK + 40);
        box(36000, 180, 80, black, 0, FLOOR + 90, 18460);
        for (const side of [-1, 1])
            box(80, 180, 25000, black, side * 17960, FLOOR + 90, 6000);
        // Cornice where the walls meet the ceiling reads as a finished room, not a box.
        const CORNICE = CEILING - 110;
        box(36000, 220, 220, black, 0, CORNICE, BACK + 110).name = 'Cornice';
        box(36000, 220, 220, black, 0, CORNICE, 18390);
        for (const side of [-1, 1])
            box(220, 220, 25000, black, side * 17890, CORNICE, 6000);
        // A picture rail above the door, transom and window, lit by a dim warm
        // cove line, gives the upper wall an edge instead of an empty dark band.
        const RAIL = 6900;
        const cove = glowing(glow('#7c5f43'), 'strip');
        box(36000, 90, 70, wood, 0, RAIL, BACK + 35).name = 'Picture rail';
        box(36000, 16, 24, cove, 0, RAIL + 60, BACK + 60).name = 'Cove light';
        box(36000, 90, 70, wood, 0, RAIL, 18465);
        box(36000, 16, 24, cove, 0, RAIL + 60, 18440);
        for (const side of [-1, 1]) {
            box(70, 90, 25000, wood, side * 17965, RAIL, 6000);
            box(24, 16, 25000, cove, side * 17940, RAIL + 60, 6000);
        }
        // The slatted wall brings texture without making the space bright.
        for (let x = -11000; x <= -2400; x += 180)
            box(55, 6800, 90, wood, x, 385, BACK + 50);
        for (const x of [-11090, -2350])
            box(85, 6800, 130, wood, x, 385, BACK + 60).name = 'Slat end trim';
        box(8825, 85, 130, wood, -6720, 3827.5, BACK + 60).name =
            'Slat top trim';
        // A brass picture light on two wall arms: a free-floating glow strip
        // parallel to the flag rail read as a second, stray rail.
        box(2600, 110, 190, brass, -550, 4690, BACK + 250, 30).name =
            'Picture light hood';
        for (const x of [-1450, 350])
            box(45, 45, 250, brass, x, 4690, BACK + 125);
        box(
            2480,
            14,
            120,
            glowing(glow('#ffd29a'), 'picture'),
            -550,
            4628,
            BACK + 260,
        ).name = 'Desk flag accent light';
        const wallWash = new THREE.PointLight('#ffbb77', 0.65, 9500, 2);
        wallWash.position.set(-3500, 4300, -4800);
        room.add(practical(wallWash, 'picture'));
        // Thick pile, no trim strip: a framed edge read as a picture, not a rug.
        // Runs from the wall under the desk out past the chair and Begu's walk.
        const deskRug = box(
            10000,
            70,
            6400,
            material('#28323d'),
            -550,
            FLOOR + 35,
            BACK + 100 + 3200,
            34,
        );
        deskRug.name = 'Desk rug';

        // Reading lamp, with an actual pool of warm light.
        cylinder(420, 75, black, 10100, FLOOR + 40, -3700);
        cylinder(32, 3700, brass, 10100, FLOOR + 1900, -3700);
        const shade = new THREE.Mesh(
            new THREE.CylinderGeometry(460, 690, 620, 48, 1, true),
            glowing(
                new THREE.MeshStandardMaterial({
                    color: '#b09267',
                    emissive: '#ffb877',
                    emissiveIntensity: 0.65,
                    side: THREE.DoubleSide,
                    roughness: 0.8,
                }),
                'lamp',
            ),
        );
        shade.position.set(10100, 640, -3700);
        shade.name = 'Warm linen lampshade';
        room.add(shade);
        const diffuser = cylinder(
            390,
            12,
            glowing(glow('#ffe4ad'), 'lamp'),
            10100,
            325,
            -3700,
        );
        diffuser.name = 'Lamp diffuser';
        diffuser.castShadow = false;
        const lamp = (this.lamp = new THREE.PointLight(
            '#ffb877',
            3.2,
            14500,
            2,
        ));
        lamp.name = 'Warm floor lamp';
        // Keep the emitter inside the shade, clear of the opaque central pole.
        lamp.position.set(10260, 550, -3700);
        // No shadow: a point-light shadow is a 6-face cubemap, i.e. six extra
        // full-scene passes per shadow update. The window key light already
        // grounds everything on the desk; the lamp only needs to glow.
        lamp.castShadow = false;
        room.add(practical(lamp, 'lamp'));
        const mote = document.createElement('canvas');
        mote.width = mote.height = 32;
        const mc = mote.getContext('2d')!;
        const fade = mc.createRadialGradient(16, 16, 0, 16, 16, 16);
        fade.addColorStop(0, '#fff2d5');
        fade.addColorStop(1, 'rgba(255,242,213,0)');
        mc.fillStyle = fade;
        mc.fillRect(0, 0, 32, 32);
        this.dust = new THREE.Points(
            new THREE.BufferGeometry().setAttribute(
                'position',
                new THREE.Float32BufferAttribute(new Float32Array(96 * 3), 3),
            ),
            new THREE.PointsMaterial({
                map: new THREE.CanvasTexture(mote),
                color: '#ffd3a1',
                size: 28,
                transparent: true,
                opacity: 0.32,
                depthWrite: false,
            }),
        );
        this.dust.name = 'Dust in the lamp light';
        this.dust.frustumCulled = false;
        room.add(this.dust);

        // Bookshelf: technical books, records and a football on the lower shelf.
        for (const x of [-9800, -5900])
            box(90, 5100, 1000, black, x, FLOOR + 2550, -5240).name =
                'Bookshelf';
        for (const y of [250, 1650, 3100, 4700])
            box(4000, 80, 1000, wood, -7850, FLOOR + y, -5240).name =
                'Bookshelf';
        const titles = [
            'SYSTEMS',
            'DEEP LEARNING',
            'DESIGN',
            'FOOTBALL',
            'BUILD',
        ];
        for (let i = 0; i < 12; i++) {
            const x = -9550 + i * 225;
            const h = 880 + (i % 3) * 70;
            const m = [blue, red, cream, black, fabric][i % 5];
            box(180, h, 660, m, x, FLOOR + 3150 + h / 2, -5200).name =
                'Bookshelf';
            if (i % 2 === 0) {
                const t = label(
                    titles[i % 5],
                    780,
                    120,
                    x,
                    FLOOR + 3600,
                    -4860,
                );
                t.rotation.z = Math.PI / 2;
            }
        }
        for (let i = 0; i < 4; i++)
            box(
                1500 - i * 80,
                110,
                650,
                [cream, red, blue, black][i],
                -8500,
                FLOOR + 1800 + i * 110,
                -5200,
            );
        const ball = new THREE.Mesh(
            new THREE.IcosahedronGeometry(470, 2),
            cream,
        );
        ball.position.set(-6800, FLOOR + 800, -5230);
        ball.castShadow = true;
        room.add(ball);
        for (let i = 0; i < 12; i++) {
            const a = i * 2.39996,
                y = 1 - (2 * (i + 0.5)) / 12;
            const n = new THREE.Vector3(
                Math.cos(a) * Math.sqrt(1 - y * y),
                y,
                Math.sin(a) * Math.sqrt(1 - y * y),
            );
            const patch = new THREE.Mesh(
                new THREE.CircleGeometry(134, 5),
                black,
            );
            patch.position.copy(ball.position).addScaledVector(n, 473);
            patch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
            room.add(patch);
        }
        // Matching shadow boxes flank the TV on a shared centerline.
        const jerseyBacking = material('#24272c');
        for (const [x, texture, name, caption, outline] of [
            [
                7600,
                app.resources.items.texture.messiJersey,
                'Barcelona',
                'BARCELONA  ·  MESSI 10',
                [
                    [0.40527, 0.1543],
                    [0.42773, 0.15332],
                    [0.45996, 0.16406],
                    [0.5, 0.16602],
                    [0.53516, 0.16504],
                    [0.56641, 0.15918],
                    [0.58887, 0.14941],
                    [0.60547, 0.1543],
                    [0.65527, 0.1709],
                    [0.70801, 0.19043],
                    [0.74121, 0.20996],
                    [0.75488, 0.22949],
                    [0.76367, 0.24902],
                    [0.77051, 0.26855],
                    [0.77637, 0.28809],
                    [0.78223, 0.30762],
                    [0.78809, 0.32715],
                    [0.79395, 0.34668],
                    [0.80078, 0.36621],
                    [0.80762, 0.38574],
                    [0.81543, 0.40527],
                    [0.82129, 0.4248],
                    [0.82812, 0.44434],
                    [0.83301, 0.46387],
                    [0.83984, 0.4834],
                    [0.84766, 0.50293],
                    [0.8291, 0.5127],
                    [0.79883, 0.52246],
                    [0.78418, 0.53223],
                    [0.78613, 0.54199],
                    [0.78613, 0.55664],
                    [0.78711, 0.57617],
                    [0.78613, 0.63477],
                    [0.78418, 0.69336],
                    [0.78027, 0.75195],
                    [0.77734, 0.81055],
                    [0.77539, 0.86914],
                    [0.77734, 0.92773],
                    [0.78027, 0.94727],
                    [0.77148, 0.95605],
                    [0.75195, 0.95996],
                    [0.73242, 0.95996],
                    [0.71289, 0.96191],
                    [0.69336, 0.96387],
                    [0.67383, 0.96582],
                    [0.6543, 0.96777],
                    [0.63477, 0.96973],
                    [0.61523, 0.96777],
                    [0.5957, 0.96582],
                    [0.57617, 0.96387],
                    [0.55664, 0.96191],
                    [0.53711, 0.96094],
                    [0.51758, 0.96094],
                    [0.49805, 0.96387],
                    [0.47852, 0.96875],
                    [0.45898, 0.97168],
                    [0.43945, 0.97168],
                    [0.41992, 0.96582],
                    [0.40039, 0.95996],
                    [0.38086, 0.95898],
                    [0.36133, 0.95898],
                    [0.3418, 0.95801],
                    [0.32227, 0.95801],
                    [0.30273, 0.95801],
                    [0.2832, 0.95996],
                    [0.26367, 0.95898],
                    [0.24414, 0.95703],
                    [0.22656, 0.94727],
                    [0.22754, 0.92773],
                    [0.22559, 0.86914],
                    [0.22754, 0.81055],
                    [0.22656, 0.75195],
                    [0.22168, 0.69336],
                    [0.21777, 0.63477],
                    [0.2168, 0.57617],
                    [0.22168, 0.55664],
                    [0.22754, 0.54199],
                    [0.2207, 0.53223],
                    [0.20117, 0.52246],
                    [0.18164, 0.5127],
                    [0.1582, 0.50293],
                    [0.15723, 0.4834],
                    [0.16406, 0.46387],
                    [0.16992, 0.44434],
                    [0.17871, 0.4248],
                    [0.1875, 0.40527],
                    [0.19336, 0.38574],
                    [0.2002, 0.36621],
                    [0.20801, 0.34668],
                    [0.21484, 0.32715],
                    [0.2207, 0.30762],
                    [0.22754, 0.28809],
                    [0.23438, 0.26855],
                    [0.24219, 0.24902],
                    [0.25195, 0.22949],
                    [0.26855, 0.20996],
                    [0.29688, 0.19043],
                    [0.35645, 0.1709],
                ],
            ],
            [
                -7600,
                app.resources.items.texture.argentinaJersey,
                'Argentina',
                'ARGENTINA  ·  MESSI 10',
                [
                    [0.411, 0.044],
                    [0.464, 0.047],
                    [0.532, 0.047],
                    [0.575, 0.046],
                    [0.614, 0.053],
                    [0.696, 0.083],
                    [0.798, 0.123],
                    [0.985, 0.257],
                    [0.957, 0.326],
                    [0.915, 0.427],
                    [0.868, 0.41],
                    [0.82, 0.388],
                    [0.814, 0.544],
                    [0.807, 0.71],
                    [0.804, 0.79],
                    [0.794, 0.884],
                    [0.807, 0.928],
                    [0.793, 0.94],
                    [0.71, 0.95],
                    [0.621, 0.955],
                    [0.487, 0.955],
                    [0.355, 0.952],
                    [0.268, 0.948],
                    [0.187, 0.933],
                    [0.178, 0.918],
                    [0.189, 0.788],
                    [0.185, 0.679],
                    [0.183, 0.53],
                    [0.182, 0.388],
                    [0.133, 0.407],
                    [0.081, 0.416],
                    [0.047, 0.333],
                    [0.015, 0.25],
                    [0.196, 0.104],
                    [0.243, 0.082],
                    [0.325, 0.059],
                    [0.392, 0.044],
                ],
            ],
        ] as const) {
            const frame = new THREE.Group();
            frame.name = `${name} jersey frame`;
            frame.position.set(x, 1900, 18100);
            frame.rotation.y = Math.PI;
            frame.add(box(2800, 3750, 160, black, 0, 0, 0, 35));
            const backing = box(2570, 3520, 12, jerseyBacking, 0, 0, 87);
            backing.name = `${name} jersey backing`;
            frame.add(backing);
            // Trace the garment silhouette in photo UVs; original image pixels stay intact.
            const ys = outline.map((point) => point[1]);
            const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
            const xs = outline.map((point) => point[0]);
            const scale = Math.min(
                2610 / (Math.max(...ys) - Math.min(...ys)),
                2430 / (Math.max(...xs) - Math.min(...xs)),
            );
            const silhouette = new THREE.ShapeGeometry(
                new THREE.Shape(
                    outline.map(
                        ([u, v]) =>
                            new THREE.Vector2(
                                (u - 0.5) * scale,
                                (centerY - v) * scale,
                            ),
                    ),
                ),
            );
            const vertices = silhouette.attributes.position;
            const uv = silhouette.attributes.uv;
            for (let i = 0; i < vertices.count; i++)
                uv.setXY(
                    i,
                    vertices.getX(i) / scale + 0.5,
                    1 - centerY + vertices.getY(i) / scale,
                );
            const shirt = new THREE.Mesh(
                silhouette,
                new THREE.MeshStandardMaterial({
                    map: texture,
                    roughness: 0.9,
                }),
            );
            shirt.name = `${name} Messi 10 jersey`;
            shirt.position.set(0, 180, 105);
            frame.add(shirt);
            frame.add(label(caption, 2350, 230, 0, -1520, 109));
            frame.traverse((part) => {
                part.castShadow = false;
            });
            room.add(frame);
        }
        // Fabric flag uses the club's original crest, with modeled folds.
        const flagCanvas = document.createElement('canvas');
        flagCanvas.width = 1024;
        flagCanvas.height = 640;
        const ctx = flagCanvas.getContext('2d')!;
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = i % 2 ? '#9f173d' : '#153c78';
            ctx.fillRect(i * 205, 0, 205, 640);
        }
        ctx.drawImage(
            app.resources.items.texture.barcaCrest.image,
            326,
            112,
            372,
            380,
        );
        const flagMap = new THREE.CanvasTexture(flagCanvas);
        flagMap.encoding = THREE.sRGBEncoding;
        const flagGeometry = new THREE.PlaneGeometry(7800, 4875, 60, 20);
        const positions = flagGeometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i),
                y = positions.getY(i);
            positions.setZ(
                i,
                Math.sin(x * 0.007) * 38 +
                    Math.cos(x * 0.002) * (2437.5 - y) * 0.028,
            );
        }
        flagGeometry.computeVertexNormals();
        const flag = new THREE.Mesh(
            flagGeometry,
            new THREE.MeshStandardMaterial({
                map: flagMap,
                roughness: 0.96,
                side: THREE.DoubleSide,
            }),
        );
        flag.name = 'FC Barcelona flag';
        // Clear the slat trim even at the deepest fabric fold.
        flag.position.set(-550, 1900, BACK + 320);
        room.add(flag);
        box(7950, 55, 80, brass, -550, 4365, flag.position.z);
        // (The "MÉS QUE UN CLUB" caption sat where the desk now stands.)
        // The collection is left around the room rather than framed on the walls:
        // single sleeves propped on shelves, consoles and skirting for anyone
        // who looks twice. Each sits on the surface named beside it.
        const SLEEVE = 620;
        for (const [texture, x, y, z, turn, lean] of [
            ['poster_yeezus', -6700, FLOOR + 2000, -5050, 0.16, -0.16], // bookshelf, middle shelf
            ['poster_rodeo', -13750, FLOOR + 1880, -6200, 0, -0.15], // record cabinet, beside the turntable
            ['poster_honestly', -9150, FLOOR + 5050, -5050, -0.12, -0.14], // bookshelf, top shelf
            ['poster_tlop', -4400, FLOOR + 1935, 17700, Math.PI, -0.13], // media console, left end
            [
                'poster_currents',
                6400,
                FLOOR + 3160,
                17400,
                Math.PI - 0.2,
                -0.12,
            ], // on the right speaker tower
            [
                'poster_graduation',
                -16700,
                FLOOR + 1275,
                4100,
                Math.PI / 2 - 0.25,
                -0.15,
            ], // window bench
            ['poster_blonde', 17520, 2360, 5600, -Math.PI / 2, -0.15], // right-wall ledge
            ['poster_808s', 15480, FLOOR + 310, 1410, -Math.PI / 2, -0.18], // floor, against the bedside table
            ['poster_jackboys', 17500, FLOOR + 310, -2400, -Math.PI / 2, -0.18], // skirting, by the mirror
            [
                'poster_livelove',
                pitX0 + 450,
                tatamiTop + 310,
                tatamiZ0 + TATAMI.depth / 2,
                Math.PI / 2,
                -0.18,
            ], // leather tatami, against the pit's window-side wall
            ['poster_mbdtf', -15600, FLOOR + 310, -4230, 0.12, -0.2], // floor, against the display cabinet
        ] as const) {
            const sleeve = box(SLEEVE, SLEEVE, 46, black, x, y, z, 10);
            sleeve.name = `Album sleeve: ${texture}`;
            sleeve.rotation.order = 'YXZ';
            sleeve.rotation.set(lean, turn, 0);
            const cover = new THREE.Mesh(
                new THREE.PlaneGeometry(SLEEVE - 34, SLEEVE - 34),
                new THREE.MeshStandardMaterial({
                    map: app.resources.items.texture[texture],
                    roughness: 0.92,
                }),
            );
            cover.position.z = 25;
            sleeve.add(cover);
        }
        const memorabilia = new THREE.SpotLight(
            '#ffebcb',
            1.8,
            15000,
            0.85,
            0.6,
            1.5,
        );
        memorabilia.position.set(1000, 5800, -1500);
        memorabilia.target.position.set(500, 1600, BACK);
        room.add(practical(memorabilia, 'picture'), memorabilia.target);
        // The flag sits right behind the laptop: its lights ease down while the
        // visitor is on the Mac so the crest stops competing with the screen.
        const flagLights = [memorabilia, wallWash].map((light) => ({
            light,
            full: light.intensity,
        }));
        this.flagLightScale = 1;
        this.flagLightTarget = 1;
        this.flagLights = flagLights;
        bus.on('enterMonitor', () => (this.flagLightTarget = 0.25));
        bus.on('leftMonitor', () => (this.flagLightTarget = 1));
        // Good night: every lamp, strip and screen fades out and the curtains
        // close (see `lighting`). Lights only ever change intensity, never
        // visibility: toggling a light recompiles every shader in the room,
        // which was the second-long freeze.
        this.sleep = this.sleepTarget = 0;
        bus.on('goodNight', (asleep: boolean) => {
            this.sleepTarget = asleep ? 1 : 0;
        });

        // A window onto Bangalore and a reading bench give the left wall a
        // purpose. The view follows the real time in Bangalore (DayNight.ts):
        // the sun and moon at their actual height, a skyline that lights up
        // through the evening.
        const window = new THREE.Group();
        window.name = 'Bangalore window';
        window.position.set(-17800, 2900, 6200);
        window.rotation.y = Math.PI / 2;
        window.add(box(7200, 5700, 140, black, 0, 0, 0));
        const sky = document.createElement('canvas');
        sky.width = 1024;
        sky.height = 768;
        const skyContext = sky.getContext('2d')!;
        const skyMap = new THREE.CanvasTexture(sky);
        this.paintSky = (state: SkyState) => {
            paintSky(skyContext, 1024, 768, state);
            skyMap.needsUpdate = true;
        };
        skyMap.encoding = THREE.sRGBEncoding;
        window.add(
            new THREE.Mesh(
                new THREE.PlaneGeometry(6900, 5400),
                new THREE.MeshBasicMaterial({ map: skyMap }),
            ),
        );
        window.children[window.children.length - 1].position.z = 76;
        window.add(box(60, 5400, 75, black, 0, 0, 120));
        window.add(box(6900, 65, 75, black, 0, -450, 120));
        window.add(box(7600, 100, 430, wood, 0, -2890, 120));
        // Plain heavy linen: a printed pattern at this scale read as noise, and
        // the pleats carry the shape on their own.
        const curtainGeometry = new THREE.PlaneGeometry(1640, 6500, 40, 12);
        const cp = curtainGeometry.attributes.position;
        for (let i = 0; i < cp.count; i++)
            cp.setZ(i, Math.cos(cp.getX(i) * 0.021) * 90);
        curtainGeometry.computeVertexNormals();
        const curtainMaterial = new THREE.MeshStandardMaterial({
            color: '#9a8f7c',
            roughness: 1,
            side: THREE.DoubleSide,
        });
        for (const side of [-1, 1]) {
            const curtain = new THREE.Mesh(curtainGeometry, curtainMaterial);
            curtain.name = 'Curtain';
            curtain.position.set(side * 3760, -100, 250);
            curtain.castShadow = true;
            window.add(curtain);
            this.curtains.push({ mesh: curtain, side, open: 3760 });
        }
        room.add(window);
        // Moonlight through the window: a cool, narrow spill across the bench and
        // floor so the left wall reads as an opening, not a painted rectangle.
        const moon = new THREE.SpotLight(
            '#9fb8e6',
            1.4,
            26000,
            Math.PI / 5,
            0.6,
            1.4,
        );
        // Sunlight by day, moonlight by night (see `lighting`).
        moon.name = 'Window moonlight';
        moon.position.set(-20500, 9800, 6200);
        moon.target.position.set(-9500, FLOOR, 7200);
        room.add(moon, moon.target);
        this.moon = moon;
        box(1300, 570, 6400, wood, -16700, FLOOR + 500, 6200, 90);
        box(1220, 180, 6100, fabric, -16700, FLOOR + 875, 6200, 100);

        // The opposite wall becomes a match-night media corner, visible on a full orbit.
        const media = new THREE.Group();
        media.name = 'Match night media wall';
        media.position.set(0, 1900, 18100);
        media.rotation.y = Math.PI;
        const mediaFrame = box(9200, 5200, 180, black, 0, 0, 0, 80);
        mediaFrame.name = 'Wall mounted TV frame';
        // Outside the desk light's shadow frustum, this frame cast a detached triangular shadow on the floor.
        mediaFrame.castShadow = false;
        media.add(mediaFrame);
        this.matchBoard = new MatchBoard();
        const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(8800, 4800),
            glowing(
                new THREE.MeshBasicMaterial({
                    map: this.matchBoard.map,
                    toneMapped: false,
                }),
                'tv',
            ),
        );
        screen.position.z = 96;
        media.add(screen);
        room.add(media);
        // A lit TV spills cool light onto the console and the floor in front of it.
        const tvGlow = new THREE.PointLight('#8fb7ff', 0.9, 9000, 2);
        tvGlow.name = 'TV glow';
        tvGlow.position.set(0, 1900, 16200);
        room.add(practical(tvGlow, 'tv'));
        box(
            11000,
            1250,
            MEDIA_CONSOLE.depth,
            wood,
            0,
            FLOOR + 1000,
            MEDIA_CONSOLE.z,
            100,
        ).name = 'Media console';
        for (const x of [-3750, 0, 3750]) {
            box(3530, 1030, 35, black, x, FLOOR + 1000, 16200, 30);
            box(700, 40, 80, brass, x, FLOOR + 1330, 16160);
        }
        for (const x of [-4700, 4700])
            box(100, 400, 1200, black, x, FLOOR + 200, 17100);
        // Floor-standing tower speakers either side of the console, toed in
        // toward the pit: lacquered walnut, black baffle, four drivers.
        const veneer = new THREE.MeshPhysicalMaterial({
            color: '#4f3322',
            roughness: 0.42,
            clearcoat: 0.35,
            clearcoatRoughness: 0.4,
        });
        for (const x of [-6400, 6400]) {
            const speaker = towerSpeaker(veneer);
            speaker.name = `Tower speaker (${x < 0 ? 'left' : 'right'})`;
            speaker.position.set(x, FLOOR, 17500);
            speaker.rotation.y = x < 0 ? -0.12 : 0.12;
            room.add(speaker);
        }

        // Entry door and a small display shelf complete the right-hand view.
        box(180, 7200, 3300, black, 17880, FLOOR + 3600, 12400).name =
            'Entry door';
        box(70, 6890, 2970, wood, 17750, FLOOR + 3450, 12400);
        box(260, 45, 380, brass, 17670, FLOOR + 3400, 11280, 18);
        // A high window over the doorway gives the cool key a visible source.
        box(120, 2300, 3200, black, 17800, 5450, 12400).name =
            'Doorway transom frame';
        const transom = new THREE.Mesh(
            new THREE.PlaneGeometry(2960, 2060),
            new THREE.MeshBasicMaterial({ map: skyMap, color: '#dfe7f2' }),
        );
        transom.name = 'Cool doorway window';
        transom.rotation.y = -Math.PI / 2;
        transom.position.set(17730, 5450, 12400);
        room.add(transom);
        // The sleeping corner borrows the headboard, mirror and bedside clock from Nihar's room.
        const bed = new THREE.Group();
        bed.name = 'Bed and walnut headboard';
        // Sized off the entry door rather than the sofa: 6600 wide reads as a king
        // beside a 7200-tall doorway, and the headboard lands flush on the wall.
        bed.position.set(13400, FLOOR, 5650);
        bed.rotation.y = -Math.PI / 2;
        const linen = material('#b2aa9b');
        const duvet = material('#514047');
        const frame = box(6600, 560, 8600, wood, 0, 380, 0, 120);
        bed.add(frame);
        const mattress = box(6300, 420, 8250, linen, 0, 850, 0, 170);
        mattress.name = 'Mattress';
        bed.add(mattress);
        bed.add(box(6850, 2450, 180, wood, 0, 1330, -4190, 60));
        for (const x of [-2210, 0, 2210])
            bed.add(
                box(2110, 1830, 95, material('#493328'), x, 1560, -4070, 35),
            );
        // Soft pillows, slept on: two side by side, the far one pushed up
        // against the headboard, a third shoved half on top.
        const pillowCase = new THREE.MeshStandardMaterial({
            color: '#c9c1b2',
            roughness: 0.95,
            envMapIntensity: 0.5,
        });
        const bedPillows: THREE.Mesh[] = [];
        for (const [x, z, yaw, tilt, seed] of [
            [-1550, -3050, -0.06, -0.18, 1],
            [1500, -3000, 0.09, -0.1, 2],
            [900, -2600, 0.32, -0.05, 3],
        ]) {
            const pillow = softPillow(2400, 560, 1400, pillowCase, seed);
            pillow.position.set(x, 1400, z);
            pillow.rotation.set(tilt, yaw, 0, 'YXZ');
            bed.add(pillow);
            bedPillows.push(pillow);
        }
        // Backpack dropped on the bed, and a folded tee with a tablet on it.
        const backpack = new THREE.Group();
        backpack.name = 'Backpack on the bed';
        backpack.add(box(1050, 1280, 560, black, -1500, 1960, 1770, 180));
        backpack.add(box(830, 590, 110, fabric, -1500, 1630, 2100, 90));
        const handle = new THREE.Mesh(
            new THREE.TorusGeometry(220, 35, 8, 20, Math.PI),
            black,
        );
        handle.position.set(-1500, 2600, 1760);
        backpack.add(handle);
        backpack.rotation.y = 0.2;
        bed.add(backpack);
        const tee = new THREE.Group();
        tee.name = 'Folded tee and tablet';
        tee.add(box(950, 110, 850, cream, 1570, 1440, 2390, 35));
        tee.add(box(620, 95, 700, black, 1570, 1540, 2390, 30));
        bed.add(tee);
        const bedsideTable = box(1530, 1030, 1530, wood, -4240, 600, -2920, 65);
        bedsideTable.name = 'Bedside table';
        bed.add(bedsideTable);
        bed.add(box(1330, 700, 40, black, -4240, 650, -2130, 25));
        bed.add(box(380, 35, 70, brass, -4240, 850, -2090));
        bed.add(box(740, 390, 260, black, -4240, 1330, -2920, 35));
        const clockCanvas = document.createElement('canvas');
        clockCanvas.width = 512;
        clockCanvas.height = 220;
        this.clockMap = new THREE.CanvasTexture(clockCanvas);
        this.clockMap.encoding = THREE.sRGBEncoding;
        const clockFace = new THREE.Mesh(
            new THREE.PlaneGeometry(650, 265),
            new THREE.MeshBasicMaterial({
                map: this.clockMap,
                toneMapped: false,
            }),
        );
        clockFace.position.set(-4240, 1330, -2785);
        bed.add(clockFace);
        room.add(bed);
        room.updateMatrixWorld(true);
        for (const pillow of bedPillows)
            rest(
                pillow,
                [
                    mattress,
                    ...bedPillows.filter(
                        (p) =>
                            p !== pillow &&
                            p.position.z < pillow.position.z - 100,
                    ),
                ],
                FLOOR,
                60,
            );
        // The duvet is dropped over the mattress as cloth (Lounge.ts
        // throwBlanket): it drapes off the sides and foot, rumpled where
        // someone got up; its lighter reverse is turned down under the
        // pillows, and a striped throw lies crumpled across the foot.
        // Bed axes: world x = 13400 - bed z, world z = 5650 + bed x.
        const duvetCloth = new THREE.MeshStandardMaterial({
            color: '#514047',
            roughness: 0.95,
            side: THREE.DoubleSide,
            vertexColors: true,
            envMapIntensity: 0.5,
        });
        const quilt = new THREE.Mesh(
            throwBlanket(
                [mattress, frame],
                { x: 12150, z: 5650, yaw: 0 },
                { width: 6300, depth: 7050 },
                FLOOR,
                41,
                false,
            ),
            duvetCloth,
        );
        quilt.name = 'Rumpled burgundy duvet';
        quilt.castShadow = quilt.receiveShadow = true;
        room.add(quilt);
        quilt.updateMatrixWorld(true);
        const reverse = new THREE.Mesh(
            throwBlanket(
                [quilt, mattress],
                { x: 14900, z: 5650, yaw: 0 },
                { width: 900, depth: 6950 },
                FLOOR,
                43,
                false,
            ),
            new THREE.MeshStandardMaterial({
                color: '#7d6a70',
                roughness: 0.95,
                side: THREE.DoubleSide,
                vertexColors: true,
                envMapIntensity: 0.5,
            }),
        );
        reverse.name = 'Turned-down duvet';
        reverse.castShadow = reverse.receiveShadow = true;
        room.add(reverse);
        reverse.updateMatrixWorld(true);
        const footThrow = new THREE.Mesh(
            throwBlanket(
                [reverse, quilt, mattress, frame],
                { x: 10150, z: 5500, yaw: 0.06 },
                { width: 1500, depth: 7300 },
                FLOOR,
                47,
                true,
            ),
            new THREE.MeshStandardMaterial({
                color: '#c0aa87',
                roughness: 1,
                side: THREE.DoubleSide,
                vertexColors: true,
                envMapIntensity: 0.4,
            }),
        );
        footThrow.name = 'Striped throw at the foot of the bed';
        footThrow.castShadow = footThrow.receiveShadow = true;
        room.add(footThrow);
        footThrow.updateMatrixWorld(true);
        for (const thing of [backpack, tee])
            rest(thing, [footThrow, reverse, quilt, mattress], FLOOR, 25);
        box(
            70,
            35,
            5800,
            glowing(glow('#df4852'), 'strip'),
            17550,
            FLOOR + 650,
            5650,
        );
        const bedsideGlow = new THREE.PointLight('#b36f68', 0.9, 9000, 2);
        bedsideGlow.position.set(16320, FLOOR + 900, 1410);
        room.add(practical(bedsideGlow, 'strip'));

        const rugMap = app.resources.items.texture.graduationRug;
        rugMap.anisotropy = 8;
        // Fine, irregular pile catches the light without altering the printed album artwork.
        const fibers = new Uint8Array(512 * 512 * 4);
        for (let i = 0; i < 512 * 512; i++) {
            let grain = Math.imul(i + 1, 1597334677);
            grain = Math.imul(grain ^ (grain >>> 16), 2246822507);
            const height = 110 + (grain >>> 25);
            fibers.set([height, height, height, 255], i * 4);
        }
        const pile = new THREE.DataTexture(fibers, 512, 512, THREE.RGBAFormat);
        pile.magFilter = THREE.LinearFilter;
        pile.minFilter = THREE.LinearMipmapLinearFilter;
        pile.generateMipmaps = true;
        pile.needsUpdate = true;
        const plaster = pile.clone();
        plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping;
        plaster.repeat.set(5, 3);
        charcoal.bumpMap = plaster;
        charcoal.bumpScale = 24;
        const navyPile = pile.clone();
        navyPile.wrapS = navyPile.wrapT = THREE.RepeatWrapping;
        navyPile.repeat.set(6, 4);
        deskRug.material = new THREE.MeshPhysicalMaterial({
            color: '#28323d',
            roughness: 1,
            bumpMap: navyPile,
            bumpScale: 26,
            sheen: 0.6,
            sheenRoughness: 1,
            sheenColor: new THREE.Color('#4a5670'),
        });
        // Nihar's real rug is a thin printed pile mat: the whole poster, a dark
        // bound edge and softened corners, no fringe. Square corners on a flat
        // plane over a cream box read as paper lying on the floor.
        const rugW = 4860;
        const rugD = 7290;
        const corner = 90;
        const outline = new THREE.Shape();
        outline.moveTo(-rugW / 2 + corner, -rugD / 2);
        outline.lineTo(rugW / 2 - corner, -rugD / 2);
        outline.quadraticCurveTo(
            rugW / 2,
            -rugD / 2,
            rugW / 2,
            -rugD / 2 + corner,
        );
        outline.lineTo(rugW / 2, rugD / 2 - corner);
        outline.quadraticCurveTo(
            rugW / 2,
            rugD / 2,
            rugW / 2 - corner,
            rugD / 2,
        );
        outline.lineTo(-rugW / 2 + corner, rugD / 2);
        outline.quadraticCurveTo(
            -rugW / 2,
            rugD / 2,
            -rugW / 2,
            rugD / 2 - corner,
        );
        outline.lineTo(-rugW / 2, -rugD / 2 + corner);
        outline.quadraticCurveTo(
            -rugW / 2,
            -rugD / 2,
            -rugW / 2 + corner,
            -rugD / 2,
        );
        const rugGeometry = new THREE.ExtrudeGeometry(outline, {
            depth: 8,
            bevelEnabled: true,
            bevelThickness: 20,
            bevelSize: 42,
            bevelSegments: 3,
            curveSegments: 6,
        });
        // The top face samples the complete print once; the rolled bevel and
        // sides (material group 1) are the stitched binding.
        const rugUv = rugGeometry.getAttribute('uv');
        const rugPosition = rugGeometry.getAttribute('position');
        for (let i = 0; i < rugUv.count; i++)
            rugUv.setXY(
                i,
                rugPosition.getX(i) / rugW + 0.5,
                rugPosition.getY(i) / rugD + 0.5,
            );
        // Soft tufts at a ~5 mm pitch (18 units) catch grazing light like pile.
        const tuftData = new Uint8Array(64 * 64 * 4);
        for (let y = 0; y < 64; y++)
            for (let x = 0; x < 64; x++) {
                let seed =
                    Math.imul((x >> 3) + 1, 73856093) ^
                    Math.imul((y >> 3) + 1, 19349663);
                seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
                const lift = 0.65 + ((seed >>> 24) / 255) * 0.35;
                const dx = (x & 7) - 3.5 + (((seed >>> 8) & 3) - 1.5) * 0.4;
                const dy = (y & 7) - 3.5 + (((seed >>> 12) & 3) - 1.5) * 0.4;
                const height =
                    255 * lift * Math.max(0, 1 - (dx * dx + dy * dy) / 14);
                tuftData.set([height, height, height, 255], (y * 64 + x) * 4);
            }
        const tufts = new THREE.DataTexture(tuftData, 64, 64, THREE.RGBAFormat);
        tufts.wrapS = tufts.wrapT = THREE.RepeatWrapping;
        tufts.repeat.set(rugW / 144, rugD / 144);
        tufts.magFilter = THREE.LinearFilter;
        tufts.minFilter = THREE.LinearMipmapLinearFilter;
        tufts.generateMipmaps = true;
        tufts.needsUpdate = true;
        const graduation = new THREE.Mesh(rugGeometry, [
            new THREE.MeshPhysicalMaterial({
                map: rugMap,
                roughness: 1,
                bumpMap: tufts,
                bumpScale: 16,
                sheen: 0.7,
                sheenRoughness: 0.85,
                sheenColor: new THREE.Color('#8f8579'),
            }),
            // Matte serged binding; room reflections would turn it grey at grazing angles.
            new THREE.MeshStandardMaterial({
                color: '#181614',
                roughness: 1,
                envMapIntensity: 0.25,
            }),
        ]);
        graduation.name = 'Graduation album rug';
        graduation.rotation.x = -Math.PI / 2;
        // Underside sits 2 units over the boards; the mat is ~13 mm thick.
        // In the window nook beside the reading bench; the pit takes the centre.
        graduation.position.set(RUG_AT.x, FLOOR + 22, RUG_AT.z);
        graduation.receiveShadow = true;
        room.add(graduation);

        const mirror = new THREE.Group();
        mirror.name = 'Standing full length mirror';
        mirror.position.set(17730, FLOOR + 2950, -1510);
        mirror.rotation.y = -Math.PI / 2;
        mirror.add(box(1830, 5900, 140, wood, 0, 0, 0, 70));
        // ponytail: a live Reflector re-rendered the whole room every frame
        // (+100 draw calls, ~40% of frame time). The scene already has a PMREM
        // env map of the room, so a mirror-finish metal plane reflects the
        // room's colours for free. Upgrade path: Reflector throttled to 1/4 fps.
        // Reflection only, no lighting: a mirror-finish standard material
        // turned the floor lamp into a hard white hotspot. Its brightness
        // follows the room's light level (see `lighting`).
        this.mirror = new THREE.MeshBasicMaterial({
            color: 0x9aa3ab,
            envMap: app.scene?.environment ?? null,
            reflectivity: 1,
        });
        const glass = new THREE.Mesh(
            new THREE.PlaneGeometry(1600, 5650),
            this.mirror,
        );
        glass.position.z = 76;
        mirror.add(glass);
        room.add(mirror);
        // Wardrobe and a bedside ledge make this a lived-in bedroom, not an empty display set.
        box(4550, 6200, 1350, wood, 13500, FLOOR + 3100, -5700, 70).name =
            'Walnut wardrobe';
        for (const x of [12360, 14640]) {
            box(
                2150,
                5910,
                80,
                material('#453027'),
                x,
                FLOOR + 3100,
                -4975,
                30,
            );
            box(
                45,
                1050,
                80,
                brass,
                x + (x < 13500 ? 820 : -820),
                FLOOR + 3200,
                -4910,
                16,
            );
        }
        box(670, 100, 6150, wood, 17570, 2000, 5800, 28).name =
            'Bedside wall ledge';
        for (let i = 0; i < 7; i++)
            box(
                490,
                1100 + (i % 3) * 110,
                140,
                [blue, red, cream, fabric][i % 4],
                17520,
                2630,
                3710 + i * 170,
                12,
            );
        const ledgePlant = scanned(
            ['potted_plant_02_pot', 'potted_plant_02_leaves'],
            0.38 * M,
        );
        ledgePlant.name = 'Ledge plant';
        ledgePlant.position.set(17560, 2050, 7300);
        ledgePlant.rotation.y = -1.9;
        room.add(ledgePlant);
        const eveningGlow = new THREE.PointLight('#d4ab91', 1.1, 9000, 2);
        eveningGlow.position.set(16900, 1800, 5400);
        room.add(practical(eveningGlow, 'lamp'));
        // Move the case, wheels and telescopic handle together, clear of the bedside table.
        const luggage = new THREE.Group();
        luggage.name = 'Travel suitcase';
        luggage.position.set(14600, FLOOR, -350);
        luggage.add(box(1330, 1910, 850, material('#4c3038'), 0, 1090, 0, 140));
        for (let i = 0; i < 6; i++)
            luggage.add(box(34, 1460, 18, black, -520 + i * 210, 1110, 436, 8));
        for (const x of [-390, 390]) {
            luggage.add(cylinder(90, 160, black, x, 100, 0));
            luggage.add(box(35, 690, 35, brass, x, 2190, 0));
        }
        luggage.add(box(850, 80, 70, black, 0, 2540, 0, 25));
        room.add(luggage);

        // A dedicated listening surface: sleeve, 12-inch record, platter and tonearm.
        box(5600, 1370, 1900, wood, -13250, FLOOR + 885, -5390, 55).name =
            'Display cabinet';
        for (const x of [-14640, -11860])
            box(2620, 1160, 40, black, x, FLOOR + 900, -4420, 18);
        const turntable = new THREE.Group();
        turntable.name = 'Walnut record player';
        turntable.position.set(-12050, FLOOR + 1570, -5390);
        for (const x of [-1040, 1040])
            for (const z of [-650, 650])
                turntable.add(cylinder(100, 80, black, x, 40, z));
        turntable.add(box(2600, 160, 1780, wood, 0, 160, 0, 45));
        turntable.add(box(2530, 12, 1710, black, 0, 246, 0, 25));
        const silver = new THREE.MeshStandardMaterial({
            color: '#a4a9ad',
            metalness: 0.75,
            roughness: 0.3,
        });
        turntable.add(cylinder(760, 65, silver, -400, 280, 0));
        this.record = new THREE.Group();
        this.record.name = 'Spinning vinyl';
        this.record.position.set(-400, 313, 0);
        this.recordMaterial = material('#08090b', 0.27);
        this.record.add(cylinder(735, 12, this.recordMaterial, 0, 6, 0));
        const grooveMaterial = material('#25272b', 0.35);
        for (let radius = 270; radius < 720; radius += 24) {
            const groove = new THREE.Mesh(
                new THREE.TorusGeometry(radius, 1.5, 3, 96),
                grooveMaterial,
            );
            groove.rotation.x = -Math.PI / 2;
            groove.position.y = 13;
            this.record.add(groove);
        }
        const textures = app.resources.items.texture;
        this.recordArtwork = Object.fromEntries(
            Object.keys(ALBUMS).map((id) => [
                id,
                {
                    sleeve: textures[`poster_${id}`],
                    label: textures[`${id}Vinyl`],
                    color: id === 'jackboys' ? '#008fcf' : '#08090b',
                },
            ]),
        );
        const albumMap = this.recordArtwork.mbdtf.sleeve;
        const recordLabel = (this.recordLabel = new THREE.Mesh(
            new THREE.CircleGeometry(244, 64),
            new THREE.MeshStandardMaterial({
                map: this.recordArtwork.mbdtf.label,
                roughness: 0.8,
            }),
        ));
        recordLabel.name = 'Current vinyl label';
        recordLabel.rotation.x = -Math.PI / 2;
        recordLabel.position.y = 14;
        this.record.add(recordLabel);
        turntable.add(this.record);
        turntable.add(cylinder(15, 58, silver, -400, 340, 0));
        turntable.add(cylinder(110, 180, silver, 910, 342, -600));
        const armPoints = [
            new THREE.Vector3(910, 444, -740),
            new THREE.Vector3(910, 444, -520),
            new THREE.Vector3(390, 374, 230),
            new THREE.Vector3(140, 360, 400),
        ];
        for (let i = 1; i < armPoints.length; i++) {
            const start = armPoints[i - 1],
                end = armPoints[i];
            const arm = cylinder(22, start.distanceTo(end), silver, 0, 0, 0);
            arm.position.copy(start).add(end).multiplyScalar(0.5);
            arm.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                end.clone().sub(start).normalize(),
            );
            turntable.add(arm);
        }
        turntable.add(box(145, 50, 205, black, 140, 360, 400, 12));
        turntable.add(box(12, 12, 12, silver, 140, 333, 420));
        turntable.add(cylinder(75, 210, black, 910, 444, -740));
        turntable.add(cylinder(55, 20, silver, 1080, 262, 670));
        turntable.add(cylinder(12, 6, glow('#78bd9c'), 950, 257, 670));
        room.add(turntable);
        const sleeve = new THREE.Group();
        sleeve.name = 'Current album sleeve';
        sleeve.position.set(-15040, FLOOR + 1590, -5390);
        sleeve.rotation.x = -Math.PI / 2;
        sleeve.add(box(1800, 1800, 40, black, 0, 0, 0, 8));
        const cover = (this.sleeveCover = new THREE.Mesh(
            new THREE.PlaneGeometry(1800, 1800),
            new THREE.MeshStandardMaterial({ map: albumMap, roughness: 0.9 }),
        ));
        cover.position.z = 22;
        sleeve.add(cover);
        room.add(sleeve);
        label('ON ROTATION', 1950, 220, -12050, FLOOR + 1260, -4390);

        // The Dune (qasimroy, CC BY 4.0; static/licenses/models.txt), sunk into
        // the conversation pit. Its continuous backrest runs along the desk and
        // window sides and a double-backed spine splits the seating, so the
        // front row faces the TV across the tatami. Authored Z-up in inches.
        const S = 3300;
        const lounge = new THREE.Group();
        lounge.name = 'Dune sofa';
        lounge.position.set(DUNE_AT.x, PIT_FLOOR, DUNE_AT.z);
        const duneModel = app.resources.items.gltfModel.duneModel;
        if (duneModel) {
            const sofa = duneModel.scene;
            // The GLB is Meshopt-quantized (normalized ints). This three.js
            // reads those raw in raycasts and precise bounds, so expand them
            // to floats once; the node transforms still scale them correctly.
            sofa.traverse((part: THREE.Object3D) => {
                if (!(part instanceof THREE.Mesh)) return;
                const geometry = part.geometry as THREE.BufferGeometry;
                for (const name of Object.keys(geometry.attributes)) {
                    const source = geometry.getAttribute(name);
                    if (!source.normalized) continue;
                    const array = (source as THREE.BufferAttribute).array;
                    const data =
                        'data' in source
                            ? (source as THREE.InterleavedBufferAttribute).data
                                  .array
                            : array;
                    const max =
                        data instanceof Int8Array
                            ? 127
                            : data instanceof Uint8Array
                              ? 255
                              : data instanceof Int16Array
                                ? 32767
                                : 65535;
                    const size = source.itemSize;
                    const out = new Float32Array(source.count * size);
                    const read = ['getX', 'getY', 'getZ', 'getW'] as const;
                    for (let i = 0; i < source.count; i++)
                        for (let c = 0; c < size; c++)
                            out[i * size + c] = Math.max(
                                source[read[c]](i) / max,
                                -1,
                            );
                    geometry.setAttribute(
                        name,
                        new THREE.BufferAttribute(out, size),
                    );
                }
                geometry.computeBoundingBox();
                geometry.computeBoundingSphere();
            });
            sofa.rotation.x = -Math.PI / 2;
            sofa.scale.setScalar(DUNE_SCALE);
            sofa.updateMatrixWorld(true);
            // Centre the footprint on DUNE_AT and stand the hem on the pit floor.
            const extent = new THREE.Box3().setFromObject(sofa);
            const centre = extent.getCenter(new THREE.Vector3());
            sofa.position.set(-centre.x, -extent.min.y, -centre.z);
            // Backrests to the desk (-Z) and window (-X); open toward TV and
            // bed. The turn is baked in so modules below are room-aligned.
            const turned = new THREE.Group();
            turned.rotation.y = Math.PI;
            turned.add(sofa);
            const baked = bakeDune(turned);
            // Upholstery: folds and seams sink into shadow (~7 cm reach).
            shadeCreases(baked, 0.07 * S, 0.55);
            // Woven wool: UVs span the ensemble once, so 22 repeats give
            // ~11 cm tiles of 16 yarns, as colour and a normal map. The
            // model's fine twill (~28 cm tiles) stays on as the bump.
            const weave = wovenFabric();
            for (const t of [weave.map, weave.normalMap]) t.repeat.set(22, 22);
            const bump = app.resources.items.texture.duneFabricBump;
            if (bump) {
                bump.encoding = THREE.LinearEncoding;
                bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
                bump.repeat.set(10, 10);
                bump.needsUpdate = true;
            }
            const duneFabric = new THREE.MeshPhysicalMaterial({
                color: DUNE_COLOR,
                map: weave.map,
                normalMap: weave.normalMap,
                normalScale: new THREE.Vector2(0.75, 0.75),
                vertexColors: true,
                roughness: 0.94,
                bumpMap: bump,
                bumpScale: 1.2,
                sheen: 0.6,
                sheenRoughness: 0.55,
                sheenColor: new THREE.Color('#9fb1c9').convertSRGBToLinear(),
            });
            lounge.add(splitDune(baked, duneFabric, DUNE_POSES));
        }
        room.add(lounge);
        // Poly Haven's Modern Coffee Table 01 (CC0, concrete and oak) on the
        // tatami in front of the TV-facing seats: turned so its 0.6 m depth
        // sits inside the 0.7 m tatami, a touch off square.
        const tableX = DUNE_AT.x + 1500;
        const tableZ = tatamiZ0 + TATAMI.depth / 2;
        const oasis = new THREE.Group();
        oasis.name = 'Match night controller table';
        oasis.position.set(tableX, tatamiTop, tableZ);
        oasis.rotation.y = Math.PI / 2 + 0.035;
        const coffeeScan =
            app.resources.items.gltfModel.loungeProps?.scene.getObjectByName(
                'modern_coffee_table_01',
            ) as THREE.Mesh | undefined;
        if (coffeeScan) {
            const coffee = new THREE.Mesh(
                coffeeScan.geometry,
                coffeeScan.material,
            );
            coffee.name = 'Concrete and oak coffee table';
            coffee.scale.setScalar(S);
            coffee.castShadow = coffee.receiveShadow = true;
            oasis.add(coffee);
        }
        room.add(oasis);
        oasis.updateMatrixWorld(true);
        const tableTop = coffeeScan
            ? new THREE.Box3().setFromObject(oasis, true).max.y - tatamiTop
            : 0.39 * S;
        // Two DualSense controllers (AHarmlessPotato, CC BY 4.0) put down on
        // the table, face up, grips toward the sofa, never quite square.
        const dualSense = app.resources.items.gltfModel.dualSenseModel?.scene;
        for (const [x, z, yaw] of [
            [-420, -60, -0.28],
            [360, 90, 0.41],
        ]) {
            const pad = new THREE.Group();
            pad.name = 'Match night gamepad';
            if (dualSense) {
                const model = dualSense.clone(true);
                model.traverse((part) => {
                    const mesh = part as THREE.Mesh;
                    if (!mesh.isMesh) return;
                    mesh.castShadow = mesh.receiveShadow = true;
                    const skin = mesh.material as THREE.MeshStandardMaterial;
                    // Switched off: no light bar glow.
                    if (skin.emissiveMap) {
                        mesh.material = skin.clone();
                        (
                            mesh.material as THREE.MeshStandardMaterial
                        ).emissiveIntensity = 0;
                    }
                });
                // The scan stands upright, face to +Z and 2 units wide: lay it
                // face up and size it to a real DualSense (160 mm across).
                model.rotation.x = -Math.PI / 2;
                model.scale.setScalar((0.16 * S) / 2);
                pad.add(model);
            }
            pad.position.set(
                tableX + x,
                tatamiTop + tableTop + 400,
                tableZ + z,
            );
            pad.rotation.y = Math.PI + yaw;
            room.add(pad);
            if (coffeeScan) rest(pad, [oasis], FLOOR - 2 * S, 0, false, true);
        }
        // The lived-in lounge around the pit's TV end (Lounge.ts).
        furnishLounge({
            room,
            floor: FLOOR,
            props: app.resources.items.gltfModel.loungeProps?.scene,
            shoes: app.resources.items.gltfModel.spezialModel?.scene,
            sofa: lounge,
        });
        // A PlayStation 5 (rtql8d, CC BY 4.0) lying flat on the console under
        // the TV, front to the room. The scan stands upright on its base
        // stand (a separate, very short part), which is removed.
        const ps5 = new THREE.Group();
        ps5.name = 'Match night game console';
        const ps5Scan = app.resources.items.gltfModel.ps5Model?.scene;
        if (ps5Scan) {
            const model = ps5Scan.clone(true);
            model.updateMatrixWorld(true);
            const whole = new THREE.Box3().setFromObject(model, true);
            const height = whole.max.y - whole.min.y;
            const parts: THREE.Mesh[] = [];
            model.traverse((part) => {
                if ((part as THREE.Mesh).isMesh) parts.push(part as THREE.Mesh);
            });
            for (const part of parts) {
                const b = new THREE.Box3().setFromObject(part, true);
                if (b.max.y - b.min.y < 0.15 * height) part.removeFromParent();
                else part.castShadow = part.receiveShadow = true;
            }
            const lying = new THREE.Group();
            lying.add(model);
            // Upright height becomes length along +X; the front (+Z) stays.
            lying.rotation.z = -Math.PI / 2;
            lying.updateMatrixWorld(true);
            const flat = new THREE.Box3().setFromObject(lying, true);
            // A PS5 is 390 mm tall standing up.
            lying.scale.setScalar((0.39 * S) / (flat.max.x - flat.min.x));
            lying.updateMatrixWorld(true);
            flat.setFromObject(lying, true);
            const centre = flat.getCenter(new THREE.Vector3());
            lying.position.set(-centre.x, -flat.min.y, -centre.z);
            ps5.add(lying);
        }
        // Front toward the room (-Z), a little off square.
        ps5.rotation.y = Math.PI + 0.04;
        ps5.position.set(3500, FLOOR + 1625, 16900);
        room.add(ps5);

        // A real-size ceiling fan (Poly Haven, CC0; 1.46 m across) with a
        // light kit, turning slowly. Its bowl light is the room's main light
        // after dark (see `lighting`).
        const fan = new THREE.Group();
        fan.name = 'Ceiling fan';
        fan.position.set(1300, CEILING, 5500);
        const fanBody = roomProps?.getObjectByName('ceiling_fan');
        const fanBlades = roomProps?.getObjectByName('ceiling_fan_blades');
        if (fanBody && fanBlades) {
            for (const part of [fanBody, fanBlades]) {
                const copy = part.clone(true);
                copy.traverse((o) => {
                    o.castShadow = false;
                    o.receiveShadow = true;
                });
                // Keep the scan's own placement (quantized nodes carry it).
                copy.position.multiplyScalar(M);
                copy.scale.multiplyScalar(M);
                fan.add(copy);
                if (part === fanBlades) this.fanBlades = copy;
            }
        }
        const bowl = new THREE.Mesh(
            new THREE.SphereGeometry(
                300,
                32,
                12,
                0,
                Math.PI * 2,
                Math.PI / 2,
                Math.PI / 2,
            ),
            glowing(glow('#ffe2b8'), 'ceiling'),
        );
        bowl.scale.y = 0.45;
        bowl.position.y = -0.47 * M;
        fan.add(bowl);
        const fanLight = new THREE.PointLight('#ffd9a8', 1.8, 28000, 2);
        fanLight.name = 'Ceiling fan light';
        fanLight.position.y = -0.62 * M;
        fan.add(practical(fanLight, 'ceiling'));
        room.add(fan);
        // A real potted plant (Poly Haven, CC0; 1.35 m) in the window corner.
        const floorPlant = scanned(
            [
                'potted_plant_01_pot',
                'potted_plant_01_stem',
                'potted_plant_01_leaves',
            ],
            M,
        );
        floorPlant.name = 'Window corner plant';
        floorPlant.position.set(-14600, FLOOR, 13000);
        floorPlant.rotation.y = 0.7;
        room.add(floorPlant);

        // Begu's corner, away from chair wheels and desk legs.
        cylinder(1050, 220, fabric, -4800, FLOOR + 110, 800 + DESK_Z);
        cylinder(
            880,
            80,
            material('#6b727e'),
            -4800,
            FLOOR + 255,
            800 + DESK_Z,
        );
        cylinder(280, 140, brass, -4600, FLOOR + 70, -800 + DESK_Z);
        cylinder(
            240,
            12,
            material('#5187a0', 0.2),
            -4600,
            FLOOR + 143,
            -800 + DESK_Z,
        );
        label('BEGU', 1000, 200, -4800, FLOOR + 155, 1865 + DESK_Z);
        return room;
    }

    /**
     * Now, or a Bangalore time given as `?time=HH:MM` (for checking how the
     * room looks at any hour).
     */
    now() {
        const query =
            typeof location !== 'undefined'
                ? new URLSearchParams(location.search).get('time')
                : null;
        const match = query && /^(\d{1,2})(?::(\d{2}))?$/.exec(query);
        if (!match) return new Date();
        const ist = 5.5 * 3600e3;
        const today = new Date(Date.now() + ist);
        const midnight =
            Date.UTC(
                today.getUTCFullYear(),
                today.getUTCMonth(),
                today.getUTCDate(),
            ) - ist;
        return new Date(
            midnight + (Number(match[1]) * 60 + Number(match[2] ?? 0)) * 60e3,
        );
    }

    /**
     * Light the room for Bangalore's time of day and for Good Night.
     * Daylight comes through the west window (direct sun in the afternoon,
     * warm at sunset) and the transom; after dark the lamps, ceiling light,
     * picture lights and LED strips take over. Asleep, everything the room
     * can switch off fades out, the curtains close and only a little
     * moonlight or daylight leaks past them. Only intensities change.
     */
    lighting() {
        const app = new Application();
        const dt = Math.min(app.time?.delta ?? 16, 100) / 1000;
        const ease = (from: number, to: number, rate: number) => {
            const next = from + (to - from) * Math.min(1, dt * rate);
            return Math.abs(to - next) < 0.001 ? to : next;
        };
        // Good Night fades over about a second and a half.
        this.sleep = ease(this.sleep ?? 0, this.sleepTarget ?? 0, 2.6);
        this.flagLightScale = ease(
            this.flagLightScale,
            this.flagLightTarget,
            3.6,
        );
        if (this.fanBlades && !app.reducedMotion?.matches && !document.hidden)
            this.fanBlades.rotation.y -= dt * 1.9;
        const now = this.now();
        const minute = Math.floor(now.getTime() / 60000);
        if (!this.sky || minute !== this.skyMinute) {
            this.skyMinute = minute;
            this.sky = skyState(now);
            this.paintSky(this.sky);
            this.lightingKey = '';
        }
        const key = `${this.sleep.toFixed(3)}|${this.flagLightScale.toFixed(3)}`;
        if (key === this.lightingKey || !this.practicals) return;
        this.lightingKey = key;
        const { day, golden, moonlight, westSun } = this.sky;
        const asleep = this.sleep,
            awake = 1 - asleep;
        const dark = 1 - THREE.MathUtils.smoothstep(day, 0.25, 0.8);
        const level: Record<Practical, number> = {
            lamp: dark * awake,
            picture: (0.3 + 0.7 * dark) * awake * this.flagLightScale,
            strip: (0.2 + 0.8 * dark) * awake,
            ceiling: dark * awake,
            tv: awake,
        };
        for (const { light, full, group } of this.practicals)
            light.intensity =
                full * level[group] * (group === 'tv' ? 0.55 + 0.45 * dark : 1);
        for (const glow of this.glows) {
            const v = level[glow.group];
            if (glow.material instanceof THREE.MeshStandardMaterial)
                glow.material.emissiveIntensity = glow.full * v;
            // The TV drops to a standby black, not a hole.
            else
                glow.material.color
                    .copy(glow.base)
                    .multiplyScalar(glow.group === 'tv' ? 0.03 + 0.97 * v : v);
        }
        // Curtains draw across the window.
        const closed = asleep * asleep * (3 - 2 * asleep);
        for (const c of this.curtains) {
            c.mesh.position.x = c.side * (c.open - (c.open - 1760) * closed);
            c.mesh.scale.x = 1 + 1.15 * closed;
        }
        const through = 1 - 0.85 * closed;
        // Sun or moon through the west window.
        if (this.moon) {
            this.moon.intensity =
                (0.2 +
                    1.4 * moonlight +
                    day * (1.5 + 2.4 * westSun) +
                    golden * westSun) *
                through;
            this.moon.color
                .copy(mixColor('#9fb8e6', '#fff1dc', day))
                .lerp(new THREE.Color('#ffae6b'), golden * 0.8);
        }
        if (this.hemisphere) {
            this.hemisphere.intensity =
                (0.38 + 1.05 * day + 0.1 * golden) * (1 - 0.8 * closed);
            this.hemisphere.color
                .copy(mixColor('#46557a', '#dbe6f4', day))
                .lerp(new THREE.Color('#f0b890'), golden * 0.3);
            this.hemisphere.groundColor.copy(
                mixColor('#2d2622', '#8c7663', day),
            );
        }
        if (this.key) {
            this.key.intensity = (0.42 + 1.35 * day) * (1 - 0.7 * asleep);
            this.key.color.copy(mixColor('#8fb0ff', '#fff3e0', day));
        }
        const renderer = app.renderer as
            | {
                  roomExposure: number;
                  targetExposure: number;
                  monitor?: boolean;
              }
            | undefined;
        if (renderer) {
            renderer.roomExposure = (0.84 + 0.1 * day) * (1 - 0.1 * asleep);
            if (!renderer.monitor)
                renderer.targetExposure = renderer.roomExposure;
        }
        // Reflections of the (bright, studio-lit) environment map follow the
        // light level too, or a dark room still gleams.
        const reflections =
            (0.35 + 0.65 * day + 0.25 * dark * awake) * (1 - 0.7 * closed);
        if (app.scene && Math.abs(reflections - this.reflectionLevel) > 0.01) {
            this.reflectionLevel = reflections;
            this.mirror?.color
                .setRGB(0.42, 0.45, 0.48)
                .multiplyScalar(reflections);
            app.scene.traverse((object) => {
                const material = (object as THREE.Mesh).material;
                if (!material) return;
                for (const m of Array.isArray(material)
                    ? material
                    : [material]) {
                    if (!(m instanceof THREE.MeshStandardMaterial)) continue;
                    if (!this.reflections.has(m))
                        this.reflections.set(m, m.envMapIntensity);
                    m.envMapIntensity = this.reflections.get(m)! * reflections;
                }
            });
        }
    }

    update() {
        this.matchBoard?.update();
        if (this.dust) {
            const app = new Application();
            this.dust.visible = !app.reducedMotion.matches;
            if (!app.reducedMotion.matches && !document.hidden) {
                this.dustTime =
                    (this.dustTime || 0) + Math.min(app.time.delta, 50) / 1000;
                const positions = this.dust.geometry.attributes.position;
                for (let i = 0; i < positions.count; i++) {
                    const height = (i * 331 + this.dustTime * 18) % 2600;
                    const radius =
                        (350 + (2600 - height) * 0.28) *
                        Math.sqrt(((i * 73) % 97) / 97);
                    const angle =
                        i * 2.39996 + Math.sin(this.dustTime * 0.1 + i) * 0.08;
                    positions.setXYZ(
                        i,
                        10100 + Math.cos(angle) * radius,
                        -2200 + height,
                        -3700 + Math.sin(angle) * radius,
                    );
                }
                positions.needsUpdate = true;
            }
        }
        if (this.record) {
            const app = new Application();
            const album = app.world?.audioManager?.album;
            const id = album?.tracks[album.index]?.album;
            if (id && id !== this.recordAlbum && this.recordArtwork[id]) {
                const art = this.recordArtwork[id];
                this.sleeveCover.material.map = art.sleeve;
                this.recordLabel.material.map = art.label;
                this.recordMaterial.color.set(art.color).convertSRGBToLinear();
                this.recordAlbum = id;
            }
            if (
                !app.reducedMotion.matches &&
                !document.hidden &&
                (!album?.tracks.length || (!album.audio.paused && !album.error))
            )
                this.record.rotation.y -=
                    ((Math.min(app.time.delta, 50) / 1000) * Math.PI * 10) / 9;
        }
        this.lighting();
        const minute = Math.floor(Date.now() / 60000);
        if (this.clockMap && this.clockMinute !== minute) {
            this.clockMinute = minute;
            const ctx = (this.clockMap.image as HTMLCanvasElement).getContext(
                '2d',
            )!;
            ctx.fillStyle = '#10222c';
            ctx.fillRect(0, 0, 512, 220);
            ctx.fillStyle = '#9fe3fa';
            ctx.font = '130px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
                new Intl.DateTimeFormat('en-GB', {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                }).format(new Date()),
                256,
                110,
            );
            this.clockMap.needsUpdate = true;
        }
    }
}
