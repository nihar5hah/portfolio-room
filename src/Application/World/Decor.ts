import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import Application from '../Application';
import BakedModel from '../Utils/BakedModel';
import Husky from './Husky';
import bus from '../UI/EventBus';
import { occluded } from '../Utils/Occlusion';

export default class Decor {
    app = new Application();
    dog: THREE.Group;
    husky: Husky;
    hover = false;
    labelBlocked = false;
    labelCheck = 0;
    constructor() {
        const { scene, resources } = this.app;
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
        this.makeBegu();
        const ray = new THREE.Raycaster();
        const point = new THREE.Vector2();
        const hit = (event: PointerEvent) => {
            if (
                document.querySelector('.boot-screen') ||
                (event.target as Element)?.closest?.('.room-interface')
            )
                return false;
            point.set(
                (event.clientX / innerWidth) * 2 - 1,
                (-event.clientY / innerHeight) * 2 + 1,
            );
            ray.setFromCamera(point, this.app.camera.instance);
            return ray.intersectObject(this.dog, true).length > 0;
        };
        document.addEventListener('pointermove', (event) => {
            this.hover = hit(event);
            document.body.classList.toggle('over-begu', this.hover);
        });
        document.addEventListener('pointerdown', (event) => {
            if (hit(event)) {
                event.preventDefault(); // Keep the compatibility mousedown from zooming away mid-greeting.
                this.openBegu();
            }
        });
    }
    makeBegu() {
        this.husky = new Husky(this.app.resources.items.gltfModel.beguModel);
        this.dog = this.husky.group;
        this.app.scene.add(this.dog);
        // Begu keeps you company: he sits facing the desk while you use the Mac,
        // and hops when a record starts from the room.
        const desk = new THREE.Vector3(-350, 0, 480);
        bus.on('enterMonitor', () => (this.husky.watching = desk));
        bus.on('leftMonitor', () => (this.husky.watching = null));
        bus.on('albumPicked', () =>
            this.husky.hop(this.app.reducedMotion.matches),
        );
    }
    openBegu() {
        this.husky.greet(
            this.app.camera.instance.position,
            this.app.reducedMotion.matches,
        );
    }
    update() {
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
