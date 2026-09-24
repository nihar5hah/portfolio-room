import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import Application from '../Application';
import { ALBUMS } from '../Audio/AlbumAudio';
import BakedModel from '../Utils/BakedModel';
import MatchBoard from './MatchBoard';
export default class Environment {
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
        app.scene.add(desk);
        app.scene.add(this.buildRoom());
        // Hemisphere fill is free per-fragment; it replaces the room-wide
        // "Ceiling fill" point light that cost a full light loop everywhere.
        app.scene.add(new THREE.HemisphereLight('#c1cad8', '#6a584d', 0.72));
        const light = new THREE.DirectionalLight('#bad5ff', 1.05);
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

        box(36000, 100, 33000, wood, 0, FLOOR - 50, 5500).name = 'Wood floor';
        for (let x = -18000; x <= 18000; x += 900)
            box(7, 3, 33000, black, x, FLOOR + 1, 5500);
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
        const ceiling = new THREE.Mesh(
            new THREE.PlaneGeometry(36000, 25000),
            charcoal,
        );
        ceiling.name = 'Ceiling';
        ceiling.position.set(0, FLOOR + 16000, 6000);
        ceiling.rotation.x = Math.PI / 2;
        room.add(ceiling);
        box(36000, 180, 80, black, 0, FLOOR + 90, BACK + 40);
        box(36000, 180, 80, black, 0, FLOOR + 90, 18460);
        for (const side of [-1, 1])
            box(80, 180, 25000, black, side * 17960, FLOOR + 90, 6000);
        // Cornice where the walls meet the ceiling reads as a finished room, not a box.
        const CORNICE = FLOOR + 16000 - 110;
        box(36000, 220, 220, black, 0, CORNICE, BACK + 110).name = 'Cornice';
        box(36000, 220, 220, black, 0, CORNICE, 18390);
        for (const side of [-1, 1])
            box(220, 220, 25000, black, side * 17890, CORNICE, 6000);
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
        box(2480, 14, 120, glow('#ffd29a'), -550, 4628, BACK + 260).name =
            'Desk flag accent light';
        const wallWash = new THREE.PointLight('#ffbb77', 0.65, 9500, 2);
        wallWash.position.set(-3500, 4300, -4800);
        room.add(wallWash);
        // Thick pile, no trim strip: a framed edge read as a picture, not a rug.
        const deskRug = box(
            11200,
            70,
            7800,
            material('#28323d'),
            -550,
            FLOOR + 35,
            1100,
            34,
        );
        deskRug.name = 'Desk rug';

        // A sofa for match nights, behind and to the right of the working desk.
        box(4700, 600, 1550, black, 6600, FLOOR + 450, -3700, 180).name =
            'Sofa';
        box(4700, 1700, 440, fabric, 6600, FLOOR + 1270, -4500, 190);
        for (const x of [5000, 6600, 8200]) {
            box(1450, 400, 1400, fabric, x, FLOOR + 920, -3700, 170);
            box(1410, 1150, 320, fabric, x, FLOOR + 1620, -4220, 140);
        }
        for (const x of [4080, 9120])
            box(400, 1000, 1800, fabric, x, FLOOR + 1130, -3700, 140);
        box(750, 760, 270, blue, 4750, FLOOR + 1500, -3710, 120).rotation.z =
            0.12;
        box(
            750,
            760,
            270,
            material('#583c43'),
            8330,
            FLOOR + 1500,
            -3710,
            120,
        ).rotation.z = -0.14;
        // Low coffee table, book and controller.
        // Sized to the sofa: a coffee table sits a hand below the seat cushion.
        box(1800, 80, 860, wood, 6720, FLOOR + 560, -1720, 160);
        for (const x of [6050, 7390])
            box(60, 500, 560, black, x, FLOOR + 250, -1720);
        box(620, 75, 450, red, 6360, FLOOR + 640, -1800, 12);
        const controller = box(
            440,
            100,
            220,
            black,
            7100,
            FLOOR + 655,
            -1600,
            70,
        );
        controller.rotation.y = -0.25;
        for (const x of [6990, 7230]) {
            const knob = cylinder(40, 20, brass, x, FLOOR + 713, -1600);
            knob.castShadow = false;
        }
        // Reading lamp, with an actual pool of warm light.
        cylinder(420, 75, black, 10100, FLOOR + 40, -3700);
        cylinder(32, 3700, brass, 10100, FLOOR + 1900, -3700);
        const shade = new THREE.Mesh(
            new THREE.CylinderGeometry(460, 690, 620, 48, 1, true),
            new THREE.MeshStandardMaterial({
                color: '#b09267',
                emissive: '#ffb877',
                emissiveIntensity: 0.65,
                side: THREE.DoubleSide,
                roughness: 0.8,
            }),
        );
        shade.position.set(10100, 640, -3700);
        shade.name = 'Warm linen lampshade';
        room.add(shade);
        const diffuser = cylinder(390, 12, glow('#ffe4ad'), 10100, 325, -3700);
        diffuser.name = 'Lamp diffuser';
        diffuser.castShadow = false;
        const lamp = new THREE.PointLight('#ffb877', 3.2, 14500, 2);
        lamp.name = 'Warm floor lamp';
        // Keep the emitter inside the shade, clear of the opaque central pole.
        lamp.position.set(10260, 550, -3700);
        // No shadow: a point-light shadow is a 6-face cubemap, i.e. six extra
        // full-scene passes per shadow update. The window key light already
        // grounds everything on the desk; the lamp only needs to glow.
        lamp.castShadow = false;
        room.add(lamp);
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
            box(90, 5100, 1000, black, x, FLOOR + 2550, -5240);
        for (const y of [250, 1650, 3100, 4700])
            box(4000, 80, 1000, wood, -7850, FLOOR + y, -5240);
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
            box(180, h, 660, m, x, FLOOR + 3150 + h / 2, -5200);
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
        label('MÉS QUE UN CLUB', 4000, 400, -550, -880, BACK + 225);
        // The collection is left around the room rather than framed on the walls:
        // single sleeves propped on shelves, consoles and skirting for anyone
        // who looks twice. Each sits on the surface named beside it.
        const SLEEVE = 620;
        for (const [texture, x, y, z, turn, lean] of [
            ['poster_yeezus', -6700, FLOOR + 2000, -5050, 0.16, -0.16], // bookshelf, middle shelf
            ['poster_rodeo', -13750, FLOOR + 1880, -6200, 0, -0.15], // record cabinet, beside the turntable
            ['poster_honestly', -9150, FLOOR + 5050, -5050, -0.12, -0.14], // bookshelf, top shelf
            ['poster_tlop', -4400, FLOOR + 1935, 17700, Math.PI, -0.13], // media console, left end
            ['poster_currents', 6400, FLOOR + 3160, 17400, Math.PI - 0.2, -0.12], // on the right speaker tower
            ['poster_graduation', -16700, FLOOR + 1275, 4100, Math.PI / 2 - 0.25, -0.15], // window bench
            ['poster_blonde', 17520, 2360, 5600, -Math.PI / 2, -0.15], // right-wall ledge
            ['poster_808s', 15480, FLOOR + 310, 1410, -Math.PI / 2, -0.18], // floor, against the bedside table
            ['poster_jackboys', 17500, FLOOR + 310, -2400, -Math.PI / 2, -0.18], // skirting, by the mirror
            ['poster_livelove', 9500, FLOOR + 310, -4300, Math.PI / 2, -0.18], // floor, against the sofa arm
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
        room.add(memorabilia, memorabilia.target);

        // A night window and reading bench give the left wall a purpose.
        const window = new THREE.Group();
        window.name = 'Ahmedabad night window';
        window.position.set(-17800, 2900, 6200);
        window.rotation.y = Math.PI / 2;
        window.add(box(7200, 5700, 140, black, 0, 0, 0));
        const sky = document.createElement('canvas');
        sky.width = 1024;
        sky.height = 768;
        const skyContext = sky.getContext('2d')!;
        skyContext.fillStyle = '#142335';
        skyContext.fillRect(0, 0, 1024, 768);
        skyContext.fillStyle = '#ddcaa0';
        skyContext.beginPath();
        skyContext.arc(770, 130, 36, 0, Math.PI * 2);
        skyContext.fill();
        for (let i = 0; i < 18; i++) {
            const x = i * 62,
                height = 130 + ((i * 73) % 230);
            skyContext.fillStyle = i % 2 ? '#0b121d' : '#101a27';
            skyContext.fillRect(x, 768 - height, 70, height);
            skyContext.fillStyle = '#ad8552';
            for (let row = 0; row < 6; row++)
                for (let col = 0; col < 3; col++)
                    if ((row + col + i) % 3 === 0)
                        skyContext.fillRect(
                            x + col * 18 + 9,
                            785 - height + row * 38,
                            5,
                            9,
                        );
        }
        const skyMap = new THREE.CanvasTexture(sky);
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
            window.add(curtain);
        }
        room.add(window);
        // Moonlight through the window: a cool, narrow spill across the bench and
        // floor so the left wall reads as an opening, not a painted rectangle.
        const moon = new THREE.SpotLight('#9fb8e6', 1.4, 26000, Math.PI / 5, 0.6, 1.4);
        moon.name = 'Window moonlight';
        moon.position.set(-20500, 9800, 6200);
        moon.target.position.set(-9500, FLOOR, 7200);
        room.add(moon, moon.target);
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
            new THREE.MeshBasicMaterial({
                map: this.matchBoard.map,
                toneMapped: false,
            }),
        );
        screen.position.z = 96;
        media.add(screen);
        room.add(media);
        // A lit TV spills cool light onto the console and the floor in front of it.
        const tvGlow = new THREE.PointLight('#8fb7ff', 0.9, 9000, 2);
        tvGlow.name = 'TV glow';
        tvGlow.position.set(0, 1900, 16200);
        room.add(tvGlow);
        box(11000, 1250, 1750, wood, 0, FLOOR + 1000, 17100, 100).name =
            'Media console';
        for (const x of [-3750, 0, 3750]) {
            box(3530, 1030, 35, black, x, FLOOR + 1000, 16200, 30);
            box(700, 40, 80, brass, x, FLOOR + 1330, 16160);
        }
        for (const x of [-4700, 4700])
            box(100, 400, 1200, black, x, FLOOR + 200, 17100);
        for (const x of [-6400, 6400]) {
            box(1100, 2850, 1100, black, x, FLOOR + 1425, 17500, 100);
            for (const y of [FLOOR + 850, FLOOR + 2100]) {
                const speaker = new THREE.Mesh(
                    new THREE.CircleGeometry(350, 48),
                    fabric,
                );
                speaker.position.set(x, y, 16940);
                speaker.rotation.y = Math.PI;
                room.add(speaker);
            }
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
            new THREE.MeshBasicMaterial({ map: skyMap, color: '#91b2e2' }),
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
        bed.add(box(6600, 560, 8600, wood, 0, 380, 0, 120));
        bed.add(box(6300, 420, 8250, linen, 0, 850, 0, 170));
        bed.add(box(6850, 2450, 180, wood, 0, 1330, -4190, 60));
        for (const x of [-2210, 0, 2210])
            bed.add(
                box(2110, 1830, 95, material('#493328'), x, 1560, -4070, 35),
            );
        for (const x of [-1600, 1600]) {
            const pillow = box(2450, 420, 1450, linen, x, 1260, -2810, 190);
            pillow.rotation.y = x < 0 ? -0.07 : 0.08;
            bed.add(pillow);
        }
        bed.add(box(6280, 110, 5740, duvet, 0, 1100, 1170, 50));
        // Shallow geometric folds keep the fabric tactile at the room's scale.
        const folds = new THREE.PlaneGeometry(6100, 5450, 40, 32);
        const fp = folds.attributes.position;
        for (let i = 0; i < fp.count; i++) {
            const x = fp.getX(i),
                y = fp.getY(i);
            fp.setZ(
                i,
                55 +
                    THREE.MathUtils.smoothstep(y, -1200, -700) *
                        (Math.sin(x * 0.0032 + y * 0.0017) * 45 +
                            Math.sin(y * 0.005 + Math.sin(x * 0.001)) * 23 +
                            80 *
                                Math.exp(
                                    -(((x + 1550) / 1300) ** 2) -
                                        ((y - 1200) / 900) ** 2,
                                )),
            );
        }
        folds.computeVertexNormals();
        const quilt = new THREE.Mesh(folds, duvet);
        quilt.name = 'Rumpled burgundy duvet';
        quilt.rotation.x = -Math.PI / 2;
        quilt.position.set(0, 1180, 1170);
        quilt.castShadow = true;
        quilt.receiveShadow = true;
        bed.add(quilt);
        const throwMat = material('#c0aa87');
        bed.add(box(6440, 90, 1400, throwMat, 0, 1300, 2800, 40));
        bed.add(box(80, 640, 1400, throwMat, -3190, 1030, 2800, 30));
        // Backpack on the bed and a folded tee, as in the reference photo.
        bed.add(box(1050, 1280, 560, black, -1500, 1960, 1770, 180));
        bed.add(box(830, 590, 110, fabric, -1500, 1630, 2100, 90));
        const handle = new THREE.Mesh(
            new THREE.TorusGeometry(220, 35, 8, 20, Math.PI),
            black,
        );
        handle.position.set(-1500, 2600, 1760);
        bed.add(handle);
        bed.add(box(950, 110, 850, cream, 1570, 1440, 2390, 35));
        bed.add(box(620, 95, 700, black, 1570, 1540, 2390, 30));
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
        box(70, 35, 5800, glow('#df4852'), 17550, FLOOR + 650, 5650);
        const bedsideGlow = new THREE.PointLight('#b36f68', 0.9, 9000, 2);
        bedsideGlow.position.set(16320, FLOOR + 900, 1410);
        room.add(bedsideGlow);

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
        outline.quadraticCurveTo(rugW / 2, -rugD / 2, rugW / 2, -rugD / 2 + corner);
        outline.lineTo(rugW / 2, rugD / 2 - corner);
        outline.quadraticCurveTo(rugW / 2, rugD / 2, rugW / 2 - corner, rugD / 2);
        outline.lineTo(-rugW / 2 + corner, rugD / 2);
        outline.quadraticCurveTo(-rugW / 2, rugD / 2, -rugW / 2, rugD / 2 - corner);
        outline.lineTo(-rugW / 2, -rugD / 2 + corner);
        outline.quadraticCurveTo(-rugW / 2, -rugD / 2, -rugW / 2 + corner, -rugD / 2);
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
                let seed = Math.imul((x >> 3) + 1, 73856093) ^
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
        graduation.position.set(6450, FLOOR + 22, 8840);
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
        const glass = new THREE.Mesh(
            new THREE.PlaneGeometry(1600, 5650),
            new THREE.MeshStandardMaterial({
                color: 0xc9d1d8,
                metalness: 1,
                roughness: 0.04,
                envMapIntensity: 1.6,
            })
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
        cylinder(280, 500, cream, 17520, 2300, 7320);
        for (let i = 0; i < 5; i++) {
            const leaf = new THREE.Mesh(
                new THREE.SphereGeometry(1, 12, 8),
                material('#526443'),
            );
            leaf.scale.set(110, 660, 70);
            leaf.position.set(
                17520 + Math.sin(i * 2.4) * 180,
                2820,
                7320 + Math.cos(i * 2.4) * 180,
            );
            leaf.rotation.z = Math.sin(i * 2.4) * 0.5;
            room.add(leaf);
        }
        const eveningGlow = new THREE.PointLight('#d4ab91', 1.1, 9000, 2);
        eveningGlow.position.set(16900, 1800, 5400);
        room.add(eveningGlow);
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

        // Two sculpted bean bags face the TV, with space between them for controllers.
        for (const [x, color, name] of [
            [-2200, '#33425d', 'Blue match night bean bag'],
            [2200, '#793e49', 'Burgundy match night bean bag'],
        ] as const) {
            const bag = new THREE.Group();
            bag.name = name;
            bag.position.set(x, FLOOR, 11700);
            bag.rotation.y = Math.atan2(-x, 18100 - 11700);
            const geometry = new THREE.SphereGeometry(1, 48, 32);
            const vertices = geometry.attributes.position;
            for (let i = 0; i < vertices.count; i++) {
                const vx = vertices.getX(i),
                    vy = vertices.getY(i),
                    vz = vertices.getZ(i);
                const upper = Math.max(0, vy);
                // A settled seat hollow and a taller back, all one continuous fabric shell.
                vertices.setXYZ(
                    i,
                    vx * 1550,
                    Math.max(
                        0,
                        (vy + 1) * 700 +
                            Math.max(0, -vz) * upper * 1550 -
                            Math.pow(upper, 6) *
                                Math.exp(-Math.pow(vz - 0.25, 2) / 0.3) *
                                450,
                    ),
                    vz * 1720,
                );
            }
            geometry.computeVertexNormals();
            const cushion = new THREE.Mesh(geometry, material(color, 1));
            cushion.castShadow = true;
            cushion.receiveShadow = true;
            bag.add(cushion);
            const seamMaterial = new THREE.LineBasicMaterial({
                color: color === '#33425d' ? '#475671' : '#8b5059',
            });
            for (const column of [6, 18, 30, 42]) {
                const points = [];
                for (let row = 0; row <= 32; row++)
                    points.push(
                        new THREE.Vector3().fromBufferAttribute(
                            vertices,
                            row * 49 + column,
                        ),
                    );
                bag.add(
                    new THREE.Line(
                        new THREE.BufferGeometry().setFromPoints(points),
                        seamMaterial,
                    ),
                );
            }
            room.add(bag);
        }
        cylinder(600, 100, wood, 0, FLOOR + 950, 13000).name =
            'Match night controller table';
        cylinder(65, 865, black, 0, FLOOR + 482.5, 13000);
        cylinder(400, 50, black, 0, FLOOR + 25, 13000);
        for (const x of [-240, 240]) {
            const pad = new THREE.Group();
            pad.name = 'Match night gamepad';
            pad.position.set(x, FLOOR + 1045, 13000);
            pad.rotation.y = x < 0 ? -0.22 : 0.22;
            pad.add(box(390, 80, 210, cream, 0, 0, 0, 65));
            for (const side of [-1, 1]) {
                const grip = box(135, 90, 240, cream, side * 145, -5, 90, 60);
                grip.rotation.y = side * -0.2;
                pad.add(grip);
                pad.add(cylinder(30, 24, black, side * 70, 52, 50));
            }
            pad.add(box(72, 12, 22, black, -115, 48, -40));
            pad.add(box(22, 12, 72, black, -115, 48, -40));
            for (let i = 0; i < 4; i++)
                pad.add(
                    cylinder(
                        12,
                        12,
                        black,
                        117 + Math.sin((i * Math.PI) / 2) * 29,
                        48,
                        -40 + Math.cos((i * Math.PI) / 2) * 29,
                    ),
                );
            room.add(pad);
        }
        box(1000, 220, 660, black, 3650, FLOOR + 1740, 17000, 45).name =
            'Match night game console';
        box(930, 12, 580, cream, 3650, FLOOR + 1856, 17000, 25);
        box(500, 9, 4, glow('#82bbff'), 3500, FLOOR + 1770, 16668);

        const fan = new THREE.Group();
        fan.name = 'Ceiling fan';
        fan.position.set(1300, 10500, 5500);
        const hub = cylinder(420, 260, cream, 0, 0, 0);
        fan.add(hub);
        for (let i = 0; i < 3; i++) {
            const blade = box(
                2900,
                55,
                540,
                cream,
                1800 * Math.cos((i * Math.PI * 2) / 3),
                0,
                1800 * Math.sin((i * Math.PI * 2) / 3),
                70,
            );
            blade.rotation.y = (-i * Math.PI * 2) / 3;
            fan.add(blade);
        }
        cylinder(90, 2300, cream, 1300, 11700, 5500);
        room.add(fan);
        // A broad-leaf plant softens the window corner.
        cylinder(600, 700, cream, -14600, FLOOR + 350, 13000);
        for (let i = 0; i < 9; i++) {
            const angle = i * 2.4;
            const leaf = new THREE.Mesh(
                new THREE.SphereGeometry(1, 16, 10),
                material(i % 2 ? '#42543e' : '#617351'),
            );
            leaf.scale.set(230, 1250 + (i % 3) * 250, 100);
            leaf.position.set(
                -14600 + Math.sin(angle) * 500,
                FLOOR + 1800,
                13000 + Math.cos(angle) * 500,
            );
            leaf.rotation.set(
                Math.cos(angle) * 0.42,
                angle,
                Math.sin(angle) * 0.42,
            );
            leaf.castShadow = true;
            room.add(leaf);
        }

        // Begu's corner, away from chair wheels and desk legs.
        cylinder(1050, 220, fabric, -5100, FLOOR + 110, 800);
        cylinder(880, 80, material('#6b727e'), -5100, FLOOR + 255, 800);
        cylinder(280, 140, brass, -4900, FLOOR + 70, -800);
        cylinder(240, 12, material('#5187a0', 0.2), -4900, FLOOR + 143, -800);
        label('BEGU', 1000, 200, -5100, FLOOR + 155, 1865);
        return room;
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
