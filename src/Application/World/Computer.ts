import * as THREE from 'three';
import Application from '../Application';

export const LAPTOP_SCREEN = { width: 1512, height: 982 };
const MODEL_SCALE = 2540 / 35.482;
const CLOSED_ANGLE = THREE.MathUtils.degToRad(110);
// Imported aluminum surfaces; keep the keys, legends, glass, and logo intact.
const ALUMINUM_MATERIALS = new Set([
    'zhGRTuGrQoJflBD',
    'lmWQsEjxpsebDlK',
    'bsmYIMHYRqMuLqz',
    'iyDJFXmHelnMTbD',
    'CRQixVLpahJzhJc',
    'bsEIHfblEXNcUMs',
    'LpqXZqhaGCeSzdu',
    'wjAYtisbflXilXi',
    'RyKTMHTpkkwQkvB',
]);

export default class Computer {
    app = new Application();
    hinge = new THREE.Group();
    screenAnchor = new THREE.Object3D();
    openness = 0;
    screenGlow = new THREE.PointLight('#b8d6ff', 0, 3800, 2);

    constructor() {
        const model = this.app.resources.items.gltfModel.macbookModel.scene;
        const root = model.getObjectByName('XUSrUKqmCVOWkVt_64')!;
        const lid = root.getObjectByName('VCQqxpxkUlzqcJI_62')!;
        root.removeFromParent();
        // Calibrated in the asset's XY/Z coordinates: aligned front edges and
        // a 0.4 mm display-to-deck seam when closed (hinge hardware stays recessed).
        this.hinge.position.set(0, -12.11, 0.12);
        root.add(this.hinge);
        root.updateMatrixWorld(true);
        this.hinge.attach(lid);

        // The imported display is replaced by the live desktop at its actual panel plane.
        root.getObjectByName('Object_123')!.visible = false;
        this.screenAnchor.position.set(-0.0000324, -16.9565, -11.74944);
        this.screenAnchor.rotation.x = THREE.MathUtils.degToRad(-110);
        this.screenAnchor.scale.set(
            34.38515 / LAPTOP_SCREEN.width,
            22.256 / LAPTOP_SCREEN.height,
            1,
        );
        root.add(this.screenAnchor);
        root.updateMatrixWorld(true);
        this.hinge.attach(this.screenAnchor);
        root.rotation.x = Math.PI / 2;
        root.scale.setScalar(MODEL_SCALE);
        root.position.set(-350, -395, 480);
        root.name = 'MacBook Pro M3';
        root.traverse((part) => {
            if (!(part instanceof THREE.Mesh)) return;
            part.castShadow = !part.material.transparent;
            part.receiveShadow = false;
            const materials = Array.isArray(part.material)
                ? part.material
                : [part.material];
            materials.forEach((material) => {
                material.userData.linearColor = true;
                if (ALUMINUM_MATERIALS.has(material.name)) {
                    material.color.set('#282a2d').convertSRGBToLinear();
                }
            });
        });
        const glass = (root.getObjectByName('Object_129') as THREE.Mesh)
            .material as THREE.MeshStandardMaterial;
        glass.envMapIntensity = 0;
        glass.roughness = 0.65;
        glass.metalness = 0;
        this.hinge.rotation.x = CLOSED_ANGLE;
        this.app.scene.add(root);
        this.screenGlow.name = 'MacBook screen glow';
        this.screenGlow.position.set(-350, 320, 50);
        this.app.scene.add(this.screenGlow);
    }

    update() {
        const camera = this.app.camera;
        const target = camera.targetKeyframe || camera.currentKeyframe;
        const open = target === 'monitor' || target === 'desk';
        // Camera state starts the animation; distance must not limit its endpoint.
        const desired = open ? 1 : 0;
        this.openness = this.app.reducedMotion.matches
            ? open
                ? 1
                : 0
            : THREE.MathUtils.damp(
                  this.openness,
                  desired,
                  5,
                  Math.min(this.app.time.delta, 50) / 1000,
              );
        if (Math.abs(this.openness - desired) < 0.001) this.openness = desired;
        this.hinge.rotation.x = CLOSED_ANGLE * (1 - this.openness);
        this.screenGlow.intensity =
            1.15 * THREE.MathUtils.smoothstep(this.openness, 0.35, 1);
        this.screenAnchor.updateWorldMatrix(true, false);
        const label = document.getElementById('laptop-label');
        if (label) {
            const point = new THREE.Vector3(-350, 300, 480).project(
                camera.instance,
            );
            const x = ((point.x + 1) * innerWidth) / 2;
            const y = ((1 - point.y) * innerHeight) / 2;
            label.style.left = Math.round(x) + 'px';
            label.style.top = Math.round(y) + 'px';
            label.hidden =
                open ||
                this.openness > 0 ||
                target === 'loading' ||
                point.z < -1 ||
                point.z > 1 ||
                x < 100 ||
                x > innerWidth - 100 ||
                y < 110 ||
                y > innerHeight - 100;
        }
    }
}
