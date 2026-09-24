import * as THREE from 'three';
import Application from '../Application';
import bus from '../UI/EventBus';

/** What a room object opens, and how it is described on hover. */
type Action = { label: string; run: () => void };

export const FOUND_KEY = 'nihar-found-records';

/**
 * Room objects that do something: hover shows a small label, click acts.
 * Matching is by object name (the room builder names each piece), so no
 * geometry is duplicated for hit-testing.
 */
export default class Interactables {
    app = new Application();
    ray = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    targets: { object: THREE.Object3D; action: (o: THREE.Object3D) => Action }[] =
        [];
    found = new Set<string>(
        JSON.parse(localStorage.getItem(FOUND_KEY) || '[]') as string[],
    );
    sleeves = 0;

    constructor(room: THREE.Object3D) {
        const openApp = (app: string, route?: string) => () =>
            this.app.camera.trigger('enterMonitor', [app, route]);
        room.traverse((object) => {
            const name = object.name;
            if (name === 'Walnut record player')
                this.add(object, () => ({
                    label: 'Music',
                    run: openApp('music'),
                }));
            else if (name === 'Bookshelf')
                this.add(object, () => ({
                    label: 'Notes',
                    run: openApp('showcase', '/notes'),
                }));
            else if (name.endsWith(' jersey frame'))
                this.add(object, () => ({
                    label: 'About Nihar',
                    run: openApp('showcase', '/about'),
                }));
            else if (name === 'Graduation album rug')
                this.add(object, () => ({
                    label: 'Play Graduation',
                    run: () => this.app.world.audioManager.album.playAlbum('graduation'),
                }));
            else if (name.startsWith('Album sleeve: poster_')) {
                this.sleeves++;
                const album = name.slice('Album sleeve: poster_'.length);
                this.add(object, () => ({
                    label: this.found.has(album)
                        ? `Found · ${this.found.size}/${this.sleeves}`
                        : 'A record…',
                    run: () => this.find(album),
                }));
            }
        });
        this.publish();
        const label = document.createElement('div');
        label.id = 'object-label';
        label.hidden = true;
        document.body.append(label);

        document.addEventListener('pointermove', (event) => {
            if (event.pointerType === 'touch') return; // labels come from taps
            const hit = this.hit(event);
            document.body.classList.toggle('over-object', !!hit);
            label.hidden = !hit;
            if (hit) {
                label.textContent = hit.label;
                label.style.left = `${event.clientX}px`;
                label.style.top = `${event.clientY}px`;
            }
        });
        // Act on release, only if the pointer barely moved: dragging to look
        // around must never open something. On touch there is no hover, so
        // the first tap shows the label and a second tap on it opens it.
        let pressed: { x: number; y: number; hit: Action } | null = null;
        let armed: string | null = null;
        document.addEventListener('pointerdown', (event) => {
            const hit = this.hit(event);
            pressed = hit ? { x: event.clientX, y: event.clientY, hit } : null;
            if (hit) event.preventDefault(); // no compatibility mousedown camera move
        });
        document.addEventListener('pointerup', (event) => {
            const press = pressed;
            pressed = null;
            if (
                !press ||
                Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10
            )
                return;
            const hit = this.hit(event);
            if (!hit || hit.label !== press.hit.label) return;
            if (event.pointerType === 'touch' && armed !== hit.label) {
                armed = hit.label;
                label.textContent = `${hit.label} · tap again`;
                label.style.left = `${event.clientX}px`;
                label.style.top = `${event.clientY}px`;
                label.hidden = false;
                return;
            }
            armed = null;
            label.hidden = true;
            hit.run();
        });
    }

    add(object: THREE.Object3D, action: (o: THREE.Object3D) => Action) {
        this.targets.push({ object, action });
    }

    hit(event: PointerEvent): Action | null {
        const camera = this.app.camera;
        const key = camera.targetKeyframe || camera.currentKeyframe;
        if (
            key === 'monitor' ||
            key === 'loading' ||
            document.querySelector('.boot-screen') ||
            (event.target as Element)?.closest?.('.room-interface, button, a')
        )
            return null;
        this.pointer.set(
            (event.clientX / innerWidth) * 2 - 1,
            (-event.clientY / innerHeight) * 2 + 1,
        );
        this.ray.setFromCamera(this.pointer, camera.instance);
        // Nearest hit decides, so a desk in front of the shelf blocks it.
        const hits = this.ray.intersectObjects(this.app.scene.children, true);
        const first = hits.find((h) => h.object.visible);
        if (!first) return null;
        for (let o: THREE.Object3D | null = first.object; o; o = o.parent) {
            const target = this.targets.find((t) => t.object === o);
            if (target) return target.action(target.object);
        }
        return null;
    }

    find(album: string) {
        if (!this.found.has(album)) {
            this.found.add(album);
            localStorage.setItem(FOUND_KEY, JSON.stringify(Array.from(this.found)));
            this.publish();
        }
        this.app.world.audioManager.album.playAlbum(album);
    }

    publish() {
        bus.dispatch('recordsFound', {
            found: this.found.size,
            total: this.sleeves,
        });
    }
}
