import Application from '../Application';
import * as THREE from 'three';
import Resources from '../Utils/Resources';
import ComputerSetup from './Computer';
import MonitorScreen from './MonitorScreen';
import Environment from './Environment';
import Decor from './Decor';
import CoffeeSteam from './CoffeeSteam';
import Cursor from './Cursor';
import Hitboxes from './Hitboxes';
import AudioManager from '../Audio/AudioManager';
import Interactables from './Interactables';
import RecordsReward from './Reward';
import bus from '../UI/EventBus';
import { batchStatic } from '../Utils/StaticBatch';
import type { QualitySettings } from '../Utils/Quality';
export default class World {
    application: Application;
    scene: THREE.Scene;
    resources: Resources;

    // Objects in the scene
    environment: Environment;
    decor: Decor;
    computerSetup: ComputerSetup;
    monitorScreen: MonitorScreen;
    coffeeSteam: CoffeeSteam;
    cursor: Cursor;
    audioManager: AudioManager;
    interactables: Interactables;
    reward: RecordsReward;

    constructor() {
        this.application = new Application();
        this.scene = this.application.scene;
        this.resources = this.application.resources;
        // Wait for resources
        this.resources.on('ready', () => {
            // Setup
            this.environment = new Environment();
            this.decor = new Decor();
            this.computerSetup = new ComputerSetup();
            this.monitorScreen = new MonitorScreen();
            this.coffeeSteam = new CoffeeSteam();
            this.audioManager = new AudioManager();
            const room = this.scene.getObjectByName('Nihar’s Barça den');
            if (room) this.interactables = new Interactables(room);
            // Begu: click him to pet him; his name label opens the chat.
            if (this.interactables && this.decor?.dog)
                this.interactables.add(this.decor.dog, () => ({
                    label: this.decor.petLabel(),
                    run: () => this.decor.pet(),
                    instant: true,
                }));
            // Every hidden record found: a gold record and the Graduation Bear.
            if (room && this.interactables) {
                const interact = this.interactables;
                this.reward = new RecordsReward(
                    room,
                    interact.found.size,
                    interact.sleeves,
                    (plaque, bear) => {
                        const album = () => this.audioManager.album;
                        interact.add(plaque, () => ({
                            label: `Gold record · all ${interact.sleeves} found · shuffle`,
                            run: () => {
                                album().next();
                                bus.dispatch('muteToggle', false);
                            },
                        }));
                        // The Graduation-era bear plays Graduation.
                        if (bear)
                            interact.add(bear, () => ({
                                label: 'The Graduation Bear · play Graduation',
                                run: () => album().playAlbum('graduation'),
                            }));
                    },
                    this.resources.items.gltfModel.dropoutBearModel?.scene ??
                        null,
                );
                bus.on('recordsComplete', () =>
                    this.decor?.husky.hop(
                        this.application.reducedMotion.matches,
                    ),
                );
            }
            // The football: kick it and Begu fetches it.
            if (this.interactables && this.decor?.football)
                this.interactables.add(this.decor.football.group, () => ({
                    label: this.decor.kickLabel(),
                    run: () => this.decor.kick(),
                    instant: true,
                }));
            const converted = new Set<THREE.Material>();
            this.scene.traverse((part) => {
                if (!(part instanceof THREE.Mesh)) return;
                const material = part.material;
                if (material instanceof THREE.MeshStandardMaterial)
                    material.envMapIntensity = Math.min(
                        material.envMapIntensity,
                        material.userData.linearColor ? 0.75 : 0.12,
                    );
                if (
                    material instanceof THREE.MeshStandardMaterial &&
                    !converted.has(material) &&
                    !material.userData.linearColor
                ) {
                    material.color.convertSRGBToLinear();
                    converted.add(material);
                }
            });
            // Draw calls: merge each group's unnamed static pieces that share
            // a material (Utils/StaticBatch.ts). After everything that reads
            // the original pieces (Begu's floor plan, click targets) is built.
            this.batching = batchStatic(this.scene);
            const quality = this.application.quality;
            // The starting tier's materials, set once: a low tier trades the
            // clearcoat and sheen shading for plain PBR.
            if (quality.tier === 'low') simplifyMaterials(this.scene);
            // Shadow pass: small pieces cast shadows nobody can see at
            // phone sizes; low tier also halves big textures' memory.
            if (quality.tier !== 'high')
                trimShadowCasters(
                    this.scene,
                    quality.tier === 'low' ? 260 : 160,
                );
            if (quality.tier === 'low') shrinkTextures(this.scene, 512);
            this.applyQuality(quality.settings, true);
            // const hb = new Hitboxes();
            // this.cursor = new Cursor();
        });
    }

    batching: ReturnType<typeof batchStatic> | undefined;

    /**
     * A quality tier, at start-up or when the governor drops one. Changes
     * that recompile shaders (how many lights run, physical materials) are
     * made only at start-up: a mid-visit recompile froze the room for over
     * a second. Later drops trade resolution, shadow updates and effects.
     */
    applyQuality(settings: QualitySettings, initial = false) {
        this.environment?.applyQuality(settings, initial);
        if (!initial && settings.tier !== 'high')
            trimShadowCasters(this.scene, settings.tier === 'low' ? 260 : 160);
        // Begu and the ball cast real shadows only where the shadow map is
        // redrawn as they move; otherwise Begu gets a soft contact shadow.
        const dynamic = settings.dynamicShadows && settings.shadowMapSize > 0;
        for (const moving of [this.decor?.dog, this.decor?.football?.group])
            moving?.traverse((part) => {
                if (
                    (part as THREE.Mesh).isMesh &&
                    part.name !== 'Contact shadow'
                )
                    part.castShadow = dynamic;
            });
        this.decor?.contactShadow(!dynamic);
        if (this.computerSetup && initial)
            this.computerSetup.screenGlow.visible = settings.lights === 'all';
    }

    shadowSignature = { structural: '', dynamic: '' };
    /**
     * Has anything under the key light moved since the last shadow pass?
     * `dynamic` asks about Begu and the ball; otherwise the room's own
     * moving parts (curtains, the MacBook lid, the gold record going up).
     */
    shadowsChanged(dynamic: boolean) {
        const round = (v: number, step: number) => Math.round(v / step);
        let signature: string;
        if (dynamic) {
            const dog = this.decor?.dog;
            const husky = this.decor?.husky;
            const ball = this.decor?.football?.group.position;
            signature = [
                dog ? round(dog.position.x, 12) : 0,
                dog ? round(dog.position.y, 12) : 0,
                dog ? round(dog.position.z, 12) : 0,
                dog ? round(dog.rotation.y, 0.03) : 0,
                husky?.lying ? 1 : 0,
                husky?.current?.getClip().name ?? '',
                ball ? round(ball.x, 12) : 0,
                ball ? round(ball.z, 12) : 0,
            ].join(',');
        } else {
            signature = [
                round(this.environment?.sleep ?? 0, 0.02),
                round(this.computerSetup?.openness ?? 0, 0.02),
                round(this.reward?.plaque?.scale.x ?? 0, 0.05),
                this.reward?.bear ? 1 : 0,
            ].join(',');
        }
        const key = dynamic ? 'dynamic' : 'structural';
        if (signature === this.shadowSignature[key]) return false;
        this.shadowSignature[key] = signature;
        return true;
    }

    update() {
        if (this.computerSetup) this.computerSetup.update();
        if (this.monitorScreen) this.monitorScreen.update();
        if (this.decor) this.decor.update();
        if (this.environment) this.environment.update();
        if (this.coffeeSteam) this.coffeeSteam.update();
        this.reward?.update(
            this.application.time.delta / 1000,
            this.application.reducedMotion.matches,
        );
        if (this.audioManager)
            this.audioManager.update(
                this.application.camera.instance.position.length(),
                Math.min(this.application.time.delta, 100) / 1000,
            );
    }
}

/**
 * Low tier: clearcoat, sheen and the other physical-material extras cost
 * extra shader work on every pixel they cover; plain PBR looks nearly the
 * same at phone sizes.
 */
function simplifyMaterials(root: THREE.Object3D) {
    const swapped = new Map<THREE.Material, THREE.Material>();
    const simpler = (material: THREE.Material) => {
        if (
            !(material as { isMeshPhysicalMaterial?: boolean })
                .isMeshPhysicalMaterial
        )
            return material;
        let standard = swapped.get(material);
        if (!standard) {
            const copy = new THREE.MeshStandardMaterial();
            THREE.MeshStandardMaterial.prototype.copy.call(copy, material);
            copy.userData = { ...material.userData };
            standard = copy;
            swapped.set(material, standard);
        }
        return standard;
    };
    root.traverse((part) => {
        const mesh = part as THREE.Mesh;
        if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
        mesh.material = Array.isArray(mesh.material)
            ? mesh.material.map(simpler)
            : simpler(mesh.material);
    });
}

/**
 * Stop small things casting shadows (world radius under `radius` room
 * units, ~5–8 cm): each is a draw call in every shadow pass for a shadow a
 * few pixels across.
 */
function trimShadowCasters(root: THREE.Object3D, radius: number) {
    const scale = new THREE.Vector3();
    let trimmed = 0;
    root.updateMatrixWorld(true);
    root.traverse((part) => {
        const mesh = part as THREE.Mesh;
        if (!mesh.isMesh || !mesh.castShadow) return;
        const geometry = mesh.geometry;
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();
        mesh.matrixWorld.decompose(
            new THREE.Vector3(),
            new THREE.Quaternion(),
            scale,
        );
        const size =
            (geometry.boundingSphere?.radius ?? 0) *
            Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
        if (size < radius) {
            mesh.castShadow = false;
            trimmed++;
        }
    });
    return trimmed;
}

/**
 * Low tier: images bigger than `max` pixels are redrawn at `max` (their
 * GPU memory drops to a quarter or less), and no anisotropic filtering.
 * Canvases that redraw themselves (the TV, the window) are left alone.
 */
function shrinkTextures(root: THREE.Object3D, max: number) {
    const done = new Set<THREE.Texture>();
    const keys = [
        'map',
        'normalMap',
        'roughnessMap',
        'metalnessMap',
        'emissiveMap',
        'bumpMap',
        'aoMap',
        'alphaMap',
    ] as const;
    root.traverse((part) => {
        const mesh = part as THREE.Mesh;
        if (!mesh.material) return;
        const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
        for (const material of materials)
            for (const key of keys) {
                const texture = (material as any)[key] as
                    | THREE.Texture
                    | undefined;
                if (!texture || done.has(texture)) continue;
                done.add(texture);
                texture.anisotropy = 1;
                const image = texture.image as
                    | HTMLImageElement
                    | ImageBitmap
                    | undefined;
                const isImage =
                    (typeof HTMLImageElement !== 'undefined' &&
                        image instanceof HTMLImageElement) ||
                    (typeof ImageBitmap !== 'undefined' &&
                        image instanceof ImageBitmap);
                if (!isImage || !image) continue;
                const { width, height } = image;
                if (Math.max(width, height) <= max) continue;
                const k = max / Math.max(width, height);
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(width * k));
                canvas.height = Math.max(1, Math.round(height * k));
                const ctx = canvas.getContext('2d');
                if (!ctx) continue;
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                // Immutable WebGL2 storage: free it before the new size.
                texture.dispose();
                texture.image = canvas;
                texture.needsUpdate = true;
            }
    });
}
