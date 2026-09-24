import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Begu's authored skeletal clips, cross-faded around a clear path on the rug. */
export default class Husky {
    group = new THREE.Group();
    mixer: THREE.AnimationMixer;
    actions: Record<string, THREE.AnimationAction> = {};
    current: THREE.AnimationAction;
    elapsed = 0;
    phase = 0;
    greeting = 0;
    readonly floor = -2970;

    constructor(model: {
        scene: THREE.Group;
        animations: THREE.AnimationClip[];
    }) {
        const bounds = new THREE.Box3().setFromObject(model.scene);
        const scale = 1850 / bounds.getSize(new THREE.Vector3()).y;
        const center = bounds.getCenter(new THREE.Vector3());
        model.scene.scale.multiplyScalar(scale);
        model.scene.position.set(-center.x * scale, -bounds.min.y * scale, 0);
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
        this.group.name = 'Begu — animated Siberian husky';
        this.group.add(model.scene);
        this.group.position.set(-2600, this.floor, 4200);
        this.group.rotation.y = Math.PI / 2;
        this.mixer = new THREE.AnimationMixer(model.scene);
        for (const clip of model.animations) {
            if (clip.name.includes('|')) continue;
            this.actions[clip.name] = this.mixer.clipAction(clip);
        }
        this.play('Idle_2');
        this.mixer.update(0);
    }

    play(name: string, once = false) {
        const next = this.actions[name];
        if (!next || next === this.current) return;
        next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
        next.setLoop(
            once ? THREE.LoopOnce : THREE.LoopRepeat,
            once ? 1 : Infinity,
        );
        next.clampWhenFinished = once;
        if (this.current) this.current.fadeOut(0.25);
        next.fadeIn(0.25).play();
        this.current = next;
    }

    greet(camera: THREE.Vector3, reducedMotion: boolean) {
        if (this.greeting > 0) return;
        this.group.rotation.y = Math.atan2(
            camera.x - this.group.position.x,
            camera.z - this.group.position.z,
        );
        this.greeting = reducedMotion ? 0.01 : 2.6;
        this.play(reducedMotion ? 'Idle_2' : 'Jump_ToIdle', !reducedMotion);
    }

    /** Returns true once the visible greeting has finished and chat can open. */
    update(seconds: number, reducedMotion: boolean) {
        const dt = Math.min(Math.max(seconds, 0), 0.05);
        if (this.greeting > 0) {
            this.greeting -= reducedMotion ? 1 : dt;
            if (!reducedMotion) {
                this.mixer.update(dt);
            }
            if (this.greeting <= 0) {
                this.greeting = 0;
                this.elapsed = 0;
                this.play('Idle_2');
                return true;
            }
            return false;
        }
        if (reducedMotion) return false;
        this.elapsed += dt;
        const step = this.elapsed % 26;
        const walking = step >= 8 && step < 22;
        this.play(walking ? 'Walk' : step >= 22 ? 'Idle_2_HeadLow' : 'Idle_2');
        if (walking) {
            this.phase += (dt * Math.PI * 2) / 14;
            this.group.position.set(
                -2600 + Math.sin(this.phase) * 1400,
                this.floor,
                3500 + Math.cos(this.phase) * 700,
            );
            const heading = Math.atan2(
                Math.cos(this.phase) * 1400,
                -Math.sin(this.phase) * 700,
            );
            const turn = heading - this.group.rotation.y;
            this.group.rotation.y +=
                Math.atan2(Math.sin(turn), Math.cos(turn)) *
                Math.min(1, dt * 8);
        }
        this.mixer.update(dt);
        return false;
    }
}
