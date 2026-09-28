import * as THREE from 'three';
import Application from '../Application';
import { occluded } from '../Utils/Occlusion';
import { DESK_Z } from './Layout';
import { mergeModel } from '../Utils/StaticBatch';

export const LAPTOP_SCREEN = { width: 1512, height: 982 };
const MODEL_SCALE = 2540 / 35.482;
const CLOSED_ANGLE = THREE.MathUtils.degToRad(110);
/** Set once the visitor has opened the Mac: no more beckoning after that. */
export const OPENED_KEY = 'nihar-opened-mac';

/** A soft pool of screen-coloured light for the desk under the laptop. */
function beckonGlow() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(184, 214, 255, 1)');
        gradient.addColorStop(0.6, 'rgba(184, 214, 255, 0.75)');
        gradient.addColorStop(1, 'rgba(184, 214, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);
    }
    const glow = new THREE.Mesh(
        // Wider than the laptop, which covers the brightest middle.
        new THREE.PlaneGeometry(4900, 3600),
        new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(canvas),
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        }),
    );
    glow.name = 'MacBook first-visit glow';
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(-350, -446, 480 + DESK_Z); // just above the desk top
    glow.renderOrder = 1;
    glow.raycast = () => undefined; // light, not a thing to click
    return glow;
}
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
    'YYwBgwvcyZVOOAA', // lid-lift notch; left silver it read as a white slit
]);

export default class Computer {
    app = new Application();
    hinge = new THREE.Group();
    screenAnchor = new THREE.Object3D();
    openness = 0;
    screenGlow = new THREE.PointLight('#b8d6ff', 0, 3800, 2);
    root!: THREE.Object3D;
    labelBlocked = false;
    labelCheck = 0;
    /** Draw calls before and after merging the parts (for ?debug). */
    merged = { before: 0, after: 0 };
    /**
     * Until the visitor first opens the Mac, the desk under it glows softly
     * and its label pulses: the one thing to find, found without reading.
     */
    neverOpened = true;
    glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | undefined;

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
        root.position.set(-350, -395, 480 + DESK_Z);
        root.name = 'MacBook Pro M3';
        this.root = root;
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
        // 60 parts, one draw call each (twice with shadows): merge them by
        // material, the base into the root and the lid into its hinge, so
        // the lid still opens. Nothing looks the parts up after this.
        const base = mergeModel(
            root,
            root,
            (part) => part === this.hinge,
            true,
        );
        const lidParts = mergeModel(
            this.hinge,
            this.hinge,
            (part) => part === this.screenAnchor,
            true,
        );
        this.merged = {
            before: base.before + lidParts.before,
            after: base.after + lidParts.after,
        };
        this.hinge.rotation.x = CLOSED_ANGLE;
        this.app.scene.add(root);
        this.screenGlow.name = 'MacBook screen glow';
        this.screenGlow.position.set(-350, 320, 50 + DESK_Z);
        this.app.scene.add(this.screenGlow);
        try {
            this.neverOpened = localStorage.getItem(OPENED_KEY) !== '1';
        } catch {
            // Storage blocked: beckon this visit only.
        }
        if (this.neverOpened) {
            this.glow = beckonGlow();
            this.app.scene.add(this.glow);
        }
    }

    /** The Mac has been opened: stop beckoning, now and on later visits. */
    opened() {
        this.neverOpened = false;
        try {
            localStorage.setItem(OPENED_KEY, '1');
        } catch {
            // Storage blocked: nothing to remember.
        }
        if (this.glow) {
            this.glow.removeFromParent();
            this.glow.geometry.dispose();
            this.glow.material.map?.dispose();
            this.glow.material.dispose();
            this.glow = undefined;
        }
    }

    update() {
        const camera = this.app.camera;
        const target = camera.targetKeyframe || camera.currentKeyframe;
        const open = target === 'monitor' || target === 'desk';
        if (open && this.neverOpened) this.opened();
        if (this.glow) {
            // Breathes like a sleeping Mac's light; steady for reduced motion.
            const seconds = (this.app.time.elapsed ?? 0) / 1000;
            this.glow.material.opacity = this.app.reducedMotion.matches
                ? 0.6
                : 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(seconds * 2.1));
            this.glow.visible = target !== 'loading';
        }
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
            label.classList.toggle('beckon', this.neverOpened);
            const point = new THREE.Vector3(-350, 300, 480 + DESK_Z).project(
                camera.instance,
            );
            const x = ((point.x + 1) * innerWidth) / 2;
            const y = ((1 - point.y) * innerHeight) / 2;
            label.style.left = Math.round(x) + 'px';
            label.style.top = Math.round(y) + 'px';
            if (this.app.time.elapsed - this.labelCheck > 200) {
                this.labelCheck = this.app.time.elapsed;
                this.labelBlocked = occluded(
                    this.app.scene,
                    camera.instance,
                    new THREE.Vector3(-350, -360, 480 + DESK_Z),
                    this.root,
                );
            }
            label.hidden =
                this.labelBlocked ||
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
