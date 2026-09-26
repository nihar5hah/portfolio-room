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
            // const hb = new Hitboxes();
            // this.cursor = new Cursor();
        });
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
