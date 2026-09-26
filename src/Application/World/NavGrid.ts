/**
 * A floor plan for Begu: the room's floor as a grid of walkable cells, with
 * furniture footprints (padded by his body) blocked out, and the height of
 * whatever he would be standing on (boards, a rug, his bed). Paths are A*
 * over 8-connected cells, then pulled taut so he walks straight lines
 * between corners instead of staircasing.
 *
 * Plain numbers only (no three.js), so it is cheap to test.
 */
export interface Rect {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}
export interface Point {
    x: number;
    z: number;
}

export default class NavGrid {
    readonly cols: number;
    readonly rows: number;
    readonly blocked: Uint8Array;
    readonly height: Float32Array;

    constructor(
        readonly bounds: Rect,
        readonly cell: number,
        readonly floor: number,
    ) {
        this.cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
        this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
        this.blocked = new Uint8Array(this.cols * this.rows);
        this.height = new Float32Array(this.cols * this.rows).fill(floor);
    }

    private col(x: number) {
        return Math.floor((x - this.bounds.minX) / this.cell);
    }
    private row(z: number) {
        return Math.floor((z - this.bounds.minZ) / this.cell);
    }
    private centre(i: number): Point {
        return {
            x: this.bounds.minX + ((i % this.cols) + 0.5) * this.cell,
            z: this.bounds.minZ + (Math.floor(i / this.cols) + 0.5) * this.cell,
        };
    }
    private index(x: number, z: number) {
        const c = this.col(x),
            r = this.row(z);
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
        return r * this.cols + c;
    }
    private cells(rect: Rect, pad: number, visit: (i: number) => void) {
        const c0 = Math.max(0, this.col(rect.minX - pad)),
            c1 = Math.min(this.cols - 1, this.col(rect.maxX + pad)),
            r0 = Math.max(0, this.row(rect.minZ - pad)),
            r1 = Math.min(this.rows - 1, this.row(rect.maxZ + pad));
        for (let r = r0; r <= r1; r++)
            for (let c = c0; c <= c1; c++) visit(r * this.cols + c);
    }

    /** Mark a footprint as furniture, grown by `pad` for Begu's body. */
    block(rect: Rect, pad = 0) {
        this.distance = null;
        this.cells(rect, pad, (i) => (this.blocked[i] = 1));
    }
    /**
     * Mark the cells under a set of points (a mesh's vertices seen from
     * above) as furniture, grown by `pad`: round and slanted things block
     * only what they really cover, not their whole bounding box.
     */
    blockPoints(xs: ArrayLike<number>, zs: ArrayLike<number>, pad = 0) {
        this.distance = null;
        const hit = new Uint8Array(this.blocked.length);
        for (let k = 0; k < xs.length; k++) {
            const i = this.index(xs[k], zs[k]);
            if (i >= 0) hit[i] = 1;
        }
        // Fill small holes between sparse vertices, then grow by the pad.
        const reach = Math.ceil(pad / this.cell);
        const r2 = (pad / this.cell + 0.5) ** 2;
        hit.forEach((h, i) => {
            if (!h) return;
            const c = i % this.cols,
                r = Math.floor(i / this.cols);
            for (let dr = -reach; dr <= reach; dr++)
                for (let dc = -reach; dc <= reach; dc++) {
                    if (dr * dr + dc * dc > r2) continue;
                    const nc = c + dc,
                        nr = r + dr;
                    if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows)
                        continue;
                    this.blocked[nr * this.cols + nc] = 1;
                }
        });
    }

    /** Make a footprint walkable again (his bed, inside a blocked margin). */
    open(rect: Rect) {
        this.distance = null;
        this.cells(rect, 0, (i) => (this.blocked[i] = 0));
    }
    /** A surface he can stand on (rug, bed) at height `y`. */
    surface(rect: Rect, y: number) {
        this.cells(
            rect,
            0,
            (i) => (this.height[i] = Math.max(this.height[i], y)),
        );
    }

    private distance: Float32Array | null = null;
    /**
     * Distance from (x, z) to the nearest furniture margin, so he only stops
     * where there is room to stand nose to tail in any direction.
     */
    clearance(x: number, z: number) {
        if (!this.distance) {
            // Multi-source breadth-first search out from blocked cells.
            const d = new Float32Array(this.blocked.length).fill(Infinity);
            const queue: number[] = [];
            this.blocked.forEach((b, i) => {
                if (b) {
                    d[i] = 0;
                    queue.push(i);
                }
            });
            for (let head = 0; head < queue.length; head++) {
                const i = queue[head];
                const c = i % this.cols,
                    r = Math.floor(i / this.cols);
                for (const [dc, dr] of [
                    [1, 0],
                    [-1, 0],
                    [0, 1],
                    [0, -1],
                ]) {
                    const nc = c + dc,
                        nr = r + dr;
                    if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows)
                        continue;
                    const j = nr * this.cols + nc;
                    if (d[j] > d[i] + 1) {
                        d[j] = d[i] + 1;
                        queue.push(j);
                    }
                }
            }
            this.distance = d;
        }
        const i = this.index(x, z);
        return i < 0 ? 0 : this.distance[i] * this.cell;
    }

    free(x: number, z: number) {
        const i = this.index(x, z);
        return i >= 0 && !this.blocked[i];
    }
    heightAt(x: number, z: number) {
        const i = this.index(x, z);
        return i < 0 ? this.floor : this.height[i];
    }

    /** The free cell centre nearest to (x, z), searching outward. */
    nearestFree(p: Point): Point | null {
        if (this.free(p.x, p.z)) return { x: p.x, z: p.z };
        for (let ring = 1; ring < Math.max(this.cols, this.rows); ring++) {
            let best: Point | null = null,
                bestD = Infinity;
            for (let dr = -ring; dr <= ring; dr++)
                for (let dc = -ring; dc <= ring; dc++) {
                    if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
                    const x = p.x + dc * this.cell,
                        z = p.z + dr * this.cell;
                    if (!this.free(x, z)) continue;
                    const d = dc * dc + dr * dr;
                    if (d < bestD) {
                        bestD = d;
                        best = this.centre(this.index(x, z));
                    }
                }
            if (best) return best;
        }
        return null;
    }

    /** A random walkable spot (uniform over free cells). */
    randomFree(random: () => number): Point | null {
        for (let tries = 0; tries < 400; tries++) {
            const i = Math.floor(random() * this.blocked.length);
            if (!this.blocked[i]) return this.centre(i);
        }
        return null;
    }

    /** Straight line from a to b stays on free cells (sampled finely). */
    clear(a: Point, b: Point) {
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        const steps = Math.max(1, Math.ceil(d / (this.cell * 0.2)));
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const x = a.x + (b.x - a.x) * t,
                z = a.z + (b.z - a.z) * t;
            if (!this.free(x, z)) return false;
            // Keep a little off corners: check either side of the line too.
            if (d > 0) {
                const ox = (-(b.z - a.z) / d) * this.cell * 0.45,
                    oz = ((b.x - a.x) / d) * this.cell * 0.45;
                if (!this.free(x + ox, z + oz) || !this.free(x - ox, z - oz))
                    return false;
            }
        }
        return true;
    }

    /**
     * Waypoints from `from` to `to` (excluding `from`), or null if there is
     * no way. Either end on furniture snaps to the nearest free cell.
     */
    path(from: Point, to: Point): Point[] | null {
        const start = this.nearestFree(from),
            goal = this.nearestFree(to);
        if (!start || !goal) return null;
        const s = this.index(start.x, start.z),
            g = this.index(goal.x, goal.z);
        if (s === g) return [goal];
        const n = this.blocked.length;
        const cost = new Float32Array(n).fill(Infinity);
        const came = new Int32Array(n).fill(-1);
        const closed = new Uint8Array(n);
        // Binary heap of [priority, index].
        const heap: number[] = [];
        const push = (p: number, i: number) => {
            heap.push(p, i);
            let k = heap.length / 2 - 1;
            while (k > 0) {
                const up = (k - 1) >> 1;
                if (heap[up * 2] <= heap[k * 2]) break;
                [heap[up * 2], heap[k * 2]] = [heap[k * 2], heap[up * 2]];
                [heap[up * 2 + 1], heap[k * 2 + 1]] = [
                    heap[k * 2 + 1],
                    heap[up * 2 + 1],
                ];
                k = up;
            }
        };
        const pop = () => {
            const top = heap[1];
            const lastP = heap[heap.length - 2],
                lastI = heap[heap.length - 1];
            heap.length -= 2;
            if (heap.length) {
                heap[0] = lastP;
                heap[1] = lastI;
                let k = 0;
                const size = heap.length / 2;
                for (;;) {
                    const l = k * 2 + 1,
                        r = l + 1;
                    let m = k;
                    if (l < size && heap[l * 2] < heap[m * 2]) m = l;
                    if (r < size && heap[r * 2] < heap[m * 2]) m = r;
                    if (m === k) break;
                    [heap[m * 2], heap[k * 2]] = [heap[k * 2], heap[m * 2]];
                    [heap[m * 2 + 1], heap[k * 2 + 1]] = [
                        heap[k * 2 + 1],
                        heap[m * 2 + 1],
                    ];
                    k = m;
                }
            }
            return top;
        };
        const gc = g % this.cols,
            gr = Math.floor(g / this.cols);
        const h = (i: number) => {
            const dc = Math.abs((i % this.cols) - gc),
                dr = Math.abs(Math.floor(i / this.cols) - gr);
            return Math.max(dc, dr) + 0.414 * Math.min(dc, dr);
        };
        cost[s] = 0;
        push(h(s), s);
        while (heap.length) {
            const i = pop();
            if (closed[i]) continue;
            if (i === g) break;
            closed[i] = 1;
            const c = i % this.cols,
                r = Math.floor(i / this.cols);
            for (let dr = -1; dr <= 1; dr++)
                for (let dc = -1; dc <= 1; dc++) {
                    if (!dr && !dc) continue;
                    const nc = c + dc,
                        nr = r + dr;
                    if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows)
                        continue;
                    const j = nr * this.cols + nc;
                    if (this.blocked[j] || closed[j]) continue;
                    // No cutting corners past furniture.
                    if (
                        dr &&
                        dc &&
                        (this.blocked[r * this.cols + nc] ||
                            this.blocked[nr * this.cols + c])
                    )
                        continue;
                    const next = cost[i] + (dr && dc ? 1.414 : 1);
                    if (next < cost[j]) {
                        cost[j] = next;
                        came[j] = i;
                        push(next + h(j), j);
                    }
                }
        }
        if (came[g] < 0) return null;
        const cells: Point[] = [];
        for (let i = g; i !== s; i = came[i]) cells.push(this.centre(i));
        cells.reverse();
        cells[cells.length - 1] = goal;
        // Pull the path taut: skip ahead to the furthest point in sight.
        const taut: Point[] = [];
        let at: Point = start;
        let k = 0;
        while (k < cells.length) {
            let far = k;
            for (let j = cells.length - 1; j > k; j--)
                if (this.clear(at, cells[j])) {
                    far = j;
                    break;
                }
            taut.push(cells[far]);
            at = cells[far];
            k = far + 1;
        }
        return taut;
    }
}
