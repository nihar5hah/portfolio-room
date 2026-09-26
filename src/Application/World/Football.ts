import * as THREE from 'three';
import type NavGrid from './NavGrid';
import { dequantize } from '../Utils/Dequantize';
import type { Point } from './NavGrid';

/** A size 5 football: 22 cm across, in room units (3300 per metre). */
export const BALL_RADIUS = 363;
/** Rolling friction on boards and rugs, room units per second². */
const DECEL = 2600;

/**
 * The football by the desk. Click it and it is kicked out across the room
 * (Decor picks a spot with a clear run), rolls, bounces off furniture and
 * slows to a stop; Begu chases it down and noses it back (Husky.fetch).
 * Positions are XZ on the floor; the ball sits on whatever surface the
 * floor plan says is there (a rug lifts it a little).
 */
export default class Football {
    group = new THREE.Group();
    velocity = new THREE.Vector2();
    /** Begu has it: physics pauses and he pushes it along. */
    carried = false;
    private spin = new THREE.Quaternion();
    private axis = new THREE.Vector3();

    constructor(
        public nav: NavGrid,
        at: Point,
        materials?: { leather: THREE.Material; patch: THREE.Material },
        /** The Brazuca scan (static/models/Football/brazuca.glb), if loaded. */
        model?: THREE.Object3D,
    ) {
        this.group.name = 'Football';
        if (model) {
            // Adidas Brazuca (CadNav 37220): a unit-radius textured sphere.
            // Unpacked to floats, or clicks (raycasts) miss it.
            const ball = dequantize(model).clone(true);
            // Precise (vertex) bounds: the scan's node is rotated.
            const box = new THREE.Box3().setFromObject(ball, true);
            const size = box.getSize(new THREE.Vector3());
            ball.scale.setScalar(
                (2 * BALL_RADIUS) / Math.max(size.x, size.y, size.z),
            );
            ball.traverse((part) => {
                const mesh = part as THREE.Mesh;
                if (!mesh.isMesh) return;
                mesh.castShadow = mesh.receiveShadow = true;
                const m = mesh.material as THREE.MeshStandardMaterial;
                m.userData.linearColor = true; // glTF colours are linear
                m.roughness = 0.42;
            });
            this.group.add(ball);
            this.group.rotation.set(0.4, 1.1, 0.2);
            this.place(at);
            return;
        }
        const leather =
            materials?.leather ??
            new THREE.MeshStandardMaterial({
                color: '#e9e4d8',
                roughness: 0.55,
            });
        const patch =
            materials?.patch ??
            new THREE.MeshStandardMaterial({
                color: '#15171c',
                roughness: 0.5,
            });
        const ball = new THREE.Mesh(
            new THREE.IcosahedronGeometry(BALL_RADIUS, 3),
            leather,
        );
        ball.castShadow = ball.receiveShadow = true;
        this.group.add(ball);
        // Twelve black pentagons, spread evenly (golden-angle spiral).
        for (let i = 0; i < 12; i++) {
            const a = i * 2.39996,
                y = 1 - (2 * (i + 0.5)) / 12;
            const n = new THREE.Vector3(
                Math.cos(a) * Math.sqrt(1 - y * y),
                y,
                Math.sin(a) * Math.sqrt(1 - y * y),
            );
            const piece = new THREE.Mesh(
                new THREE.CircleGeometry(BALL_RADIUS * 0.285, 5),
                patch,
            );
            piece.position.copy(n).multiplyScalar(BALL_RADIUS + 3);
            piece.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
            this.group.add(piece);
        }
        this.group.rotation.set(0.4, 1.1, 0.2);
        this.place(at);
    }

    get position(): Point {
        return { x: this.group.position.x, z: this.group.position.z };
    }

    get speed() {
        return this.velocity.length();
    }

    place(at: Point) {
        this.group.position.set(
            at.x,
            this.nav.heightAt(at.x, at.z) + BALL_RADIUS,
            at.z,
        );
    }

    /** Kick it so it comes to rest at `target` (friction permitting). */
    kick(target: Point) {
        const from = this.position;
        const dx = target.x - from.x,
            dz = target.z - from.z;
        const d = Math.hypot(dx, dz);
        if (d < 1) return;
        this.carried = false;
        const v = Math.sqrt(2 * DECEL * d);
        this.velocity.set((dx / d) * v, (dz / d) * v);
    }

    /**
     * Pick a landing spot for a kick from here: open floor with a clear
     * run, preferring the direction `toward` (the way the visitor is
     * looking) and somewhere `reachable` by Begu. A long kick out into the
     * room first; boxed in (between the chair and a desk leg, say) a
     * shorter one; failing that, whichever way has the longest free run.
     * Only a ball walled in on every side stays put.
     */
    target(
        toward: Point,
        random: () => number = Math.random,
        reachable: (p: Point) => boolean = () => true,
        min = 4500,
        max = 9500,
    ): Point | null {
        const from = this.position;
        const look = Math.hypot(toward.x, toward.z) || 1;
        const cell = this.nav.cell;
        for (const [lo, hi] of [
            [min, max],
            [min * 0.5, max * 0.6],
            [Math.min(1200, min), Math.min(4000, max)],
        ]) {
            let best: Point | null = null,
                score = -Infinity;
            for (let tries = 0; tries < 100; tries++) {
                const angle = random() * Math.PI * 2;
                const d = lo + random() * (hi - lo);
                const dx = Math.sin(angle),
                    dz = Math.cos(angle);
                const p = { x: from.x + dx * d, z: from.z + dz * d };
                // Test the run from a cell out: a ball resting against
                // furniture would otherwise fail every line at its start.
                const ahead = { x: from.x + dx * cell, z: from.z + dz * cell };
                if (
                    !this.nav.free(p.x, p.z) ||
                    !this.nav.free(ahead.x, ahead.z) ||
                    !this.nav.clear(ahead, p) ||
                    !reachable(p)
                )
                    continue;
                const along = (dx * toward.x + dz * toward.z) / look;
                // Out into open floor, loosely the way the visitor is facing.
                const s =
                    0.35 * along +
                    Math.min(this.nav.clearance(p.x, p.z), 3000) / 1500 +
                    random() * 0.6;
                if (s > score) {
                    score = s;
                    best = p;
                }
            }
            if (best) return best;
        }
        // Boxed in: roll it along the longest free line (it will bounce).
        let best: Point | null = null,
            run = 0;
        for (let i = 0; i < 32; i++) {
            const angle = (i / 32) * Math.PI * 2;
            const dx = Math.sin(angle),
                dz = Math.cos(angle);
            let d = 0;
            while (
                d < max &&
                this.nav.free(from.x + dx * (d + 60), from.z + dz * (d + 60))
            )
                d += 60;
            if (d > run) {
                run = d;
                best = { x: from.x + dx * d * 0.85, z: from.z + dz * d * 0.85 };
            }
        }
        return run > 150 ? best : null;
    }

    /** Begu pushes it: move toward `to` if the ball fits there. */
    carry(to: Point) {
        this.carried = true;
        this.velocity.set(0, 0);
        const from = this.position;
        if (!this.nav.free(to.x, to.z)) {
            // Tight spot: slide along whichever axis is open.
            if (this.nav.free(to.x, from.z)) to = { x: to.x, z: from.z };
            else if (this.nav.free(from.x, to.z)) to = { x: from.x, z: to.z };
            else return;
        }
        this.roll(to.x - from.x, to.z - from.z);
        this.place(to);
    }

    /** Let go, with a little push along (dx, dz) per second. */
    drop(dx = 0, dz = 0) {
        this.carried = false;
        this.velocity.set(dx, dz);
    }

    private roll(dx: number, dz: number) {
        const d = Math.hypot(dx, dz);
        if (d < 1e-3) return;
        // Rolling without slipping: turn about the horizontal axis
        // perpendicular to the motion by distance / radius.
        this.axis.set(dz / d, 0, -dx / d);
        this.spin.setFromAxisAngle(this.axis, d / BALL_RADIUS);
        this.group.quaternion.premultiply(this.spin);
    }

    update(seconds: number) {
        if (this.carried) return;
        const dt = Math.min(Math.max(seconds, 0), 0.05);
        const v = this.velocity;
        const speed = v.length();
        if (speed < 1) {
            v.set(0, 0);
            return;
        }
        const p = this.position;
        let nx = p.x + v.x * dt,
            nz = p.z + v.y * dt;
        // Bounce off furniture: reverse whichever direction is blocked,
        // losing half the pace.
        if (!this.nav.free(nx, nz)) {
            const xOpen = this.nav.free(nx, p.z),
                zOpen = this.nav.free(p.x, nz);
            if (!xOpen || xOpen === zOpen) v.x *= -0.5;
            if (!zOpen || xOpen === zOpen) v.y *= -0.5;
            nx = p.x + v.x * dt;
            nz = p.z + v.y * dt;
            if (!this.nav.free(nx, nz)) {
                nx = p.x;
                nz = p.z;
            }
        }
        this.roll(nx - p.x, nz - p.z);
        this.place({ x: nx, z: nz });
        const slower = Math.max(0, speed - DECEL * dt);
        v.multiplyScalar(slower / speed);
    }
}
