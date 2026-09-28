import * as THREE from 'three';
import Application from '../Application';
import bus from '../UI/EventBus';

/** What a room object opens, and how it is described on hover. */
type Action = {
    label: string;
    run: () => void;
    /** Act on the first tap on touch screens too (petting Begu). */
    instant?: boolean;
};

export const FOUND_KEY = 'nihar-found-records';
/** How long a tapped label waits for the second tap (ms). */
const ARMED_FOR = 5000;
/** Camera travel (room units, ~1.5 m) that makes a tapped label stale. */
const TRAVELLED = 1500;

/**
 * Room objects that do something: hover shows a small label, click acts.
 * Matching is by object name (the room builder names each piece), so no
 * geometry is duplicated for hit-testing.
 */
export default class Interactables {
    app = new Application();
    ray = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    /** Where the last successful hit test struck, in world space. */
    point = new THREE.Vector3();
    targets: {
        object: THREE.Object3D;
        action: (o: THREE.Object3D) => Action;
    }[] = [];
    found = new Set<string>(
        JSON.parse(localStorage.getItem(FOUND_KEY) || '[]') as string[],
    );
    sleeves = 0;
    sleeveAlbums = new Set<string>();
    asleep = false;

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
                    label: 'GOAT',
                    run: () => bus.dispatch('openMessi', {}),
                }));
            else if (name === 'Match night media wall')
                this.add(object, () => ({
                    label: 'Match night',
                    run: () => bus.dispatch('openTv', {}),
                }));
            else if (name === 'Bed and walnut headboard')
                this.add(object, () => ({
                    label: this.asleep ? 'Wake up' : 'Good night',
                    run: () => {
                        this.asleep = !this.asleep;
                        bus.dispatch('goodNight', this.asleep);
                    },
                }));
            else if (
                name === 'Match night game console' ||
                name === 'Match night gamepad'
            )
                this.add(object, () => ({
                    label: 'PS5 · Penalty Shootout',
                    run: () => bus.dispatch('openPs5', {}),
                }));
            else if (name === 'Floor lamp' || name === 'Desk lamp') {
                const lamp = name === 'Floor lamp' ? 'floorLamp' : 'deskLamp';
                this.add(object, () => ({
                    label: this.app.world.environment?.lampOn(lamp)
                        ? `Switch the ${name.toLowerCase()} off`
                        : `Switch the ${name.toLowerCase()} on`,
                    run: () => {
                        this.app.world.environment?.toggleLamp(lamp);
                        this.app.world.audioManager?.play('mouseUp', 0.25);
                    },
                    instant: true,
                }));
            } else if (name === 'Graduation album rug')
                this.add(object, () => ({
                    label: 'Play Graduation',
                    run: () =>
                        this.app.world.audioManager.album.playAlbum(
                            'graduation',
                        ),
                }));
            else if (name.startsWith('Album sleeve: poster_')) {
                this.sleeves++;
                const album = name.slice('Album sleeve: poster_'.length);
                this.sleeveAlbums.add(album);
                this.add(object, () => ({
                    label: this.found.has(album)
                        ? `Found · ${this.found.size}/${this.sleeves}`
                        : 'A record…',
                    run: () => this.find(album),
                }));
            }
        });
        // Progress saved before a sleeve was swapped for another album no
        // longer counts, so the tally never reads more than the room holds.
        if (this.sleeveAlbums.size)
            for (const album of this.found)
                if (!this.sleeveAlbums.has(album)) this.found.delete(album);
        this.publish();
        const label = document.createElement('div');
        label.id = 'object-label';
        label.hidden = true;
        document.body.append(label);

        // Hover: one raycast per animation frame at most, however fast the
        // mouse reports (gaming mice send hundreds of moves a second).
        let hover: PointerEvent | null = null;
        let scheduled = false;
        const updateHover = () => {
            scheduled = false;
            const event = hover;
            hover = null;
            if (!event) return;
            const hit = this.hit(event);
            document.body.classList.toggle('over-object', !!hit);
            label.hidden = !hit;
            if (hit) {
                if (label.textContent !== hit.label)
                    label.textContent = hit.label;
                label.style.left = `${event.clientX}px`;
                label.style.top = `${event.clientY}px`;
            }
        };
        document.addEventListener('pointermove', (event) => {
            if (event.pointerType === 'touch') {
                // Labels come from taps; dragging or pinching to look
                // around retires one.
                if (
                    touchStart &&
                    Math.hypot(
                        event.clientX - touchStart.x,
                        event.clientY - touchStart.y,
                    ) > 10
                )
                    disarm();
                return;
            }
            hover = event;
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(updateHover);
        });
        // Act on release, only if the pointer barely moved: dragging to look
        // around must never open something. On touch there is no hover, so
        // the first tap shows the label and a second tap on it opens it.
        let pressed: { x: number; y: number; hit: Action } | null = null;
        let armed: string | null = null;
        // While armed, the label stays pinned to the tapped spot as the view
        // settles, and goes away when it is no longer about that spot: a
        // drag, a pinch, a tap elsewhere, the camera travelling, the spot
        // leaving the screen, or a few seconds without the second tap.
        const anchor = new THREE.Vector3();
        const projected = new THREE.Vector3();
        const armedFrom = new THREE.Vector3();
        let armedAt = 0;
        let touchStart: { x: number; y: number } | null = null;
        const disarm = () => {
            if (armed === null) return;
            armed = null;
            label.hidden = true;
        };
        const follow = () => {
            if (armed === null) return;
            const camera = this.app.camera;
            const key = camera.targetKeyframe || camera.currentKeyframe;
            projected.copy(anchor).project(camera.instance);
            if (
                key === 'monitor' ||
                key === 'loading' ||
                performance.now() - armedAt > ARMED_FOR ||
                camera.instance.position.distanceTo(armedFrom) > TRAVELLED ||
                projected.z > 1 ||
                Math.abs(projected.x) > 1 ||
                Math.abs(projected.y) > 1
            )
                return disarm();
            label.style.left = `${((projected.x + 1) / 2) * innerWidth}px`;
            label.style.top = `${((1 - projected.y) / 2) * innerHeight}px`;
            requestAnimationFrame(follow);
        };
        document.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'touch') {
                touchStart = { x: event.clientX, y: event.clientY };
            }
            const hit = this.hit(event);
            if (armed !== null && hit?.label !== armed) disarm();
            pressed = hit ? { x: event.clientX, y: event.clientY, hit } : null;
            if (hit) event.preventDefault(); // no compatibility mousedown camera move
        });
        document.addEventListener('pointercancel', disarm);
        document.addEventListener('pointerup', (event) => {
            const press = pressed;
            pressed = null;
            if (
                !press ||
                Math.hypot(event.clientX - press.x, event.clientY - press.y) >
                    10
            )
                return;
            const hit = this.hit(event);
            if (!hit || hit.label !== press.hit.label) return;
            if (
                event.pointerType === 'touch' &&
                !hit.instant &&
                armed !== hit.label
            ) {
                const first = armed === null;
                armed = hit.label;
                anchor.copy(this.point);
                armedFrom.copy(this.app.camera.instance.position);
                armedAt = performance.now();
                label.textContent = `${hit.label} · tap again`;
                label.style.left = `${event.clientX}px`;
                label.style.top = `${event.clientY}px`;
                label.hidden = false;
                if (first) requestAnimationFrame(follow);
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
        this.point.copy(first.point);
        for (let o: THREE.Object3D | null = first.object; o; o = o.parent) {
            const target = this.targets.find((t) => t.object === o);
            if (target) return target.action(target.object);
        }
        return null;
    }

    find(album: string) {
        if (!this.found.has(album)) {
            this.found.add(album);
            localStorage.setItem(
                FOUND_KEY,
                JSON.stringify(Array.from(this.found)),
            );
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
