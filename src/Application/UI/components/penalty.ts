/**
 * Penalty shootout rules for the PS5 mini-game. Pure logic: no DOM, React
 * or three.js, so it runs (and is tested) in node.
 *
 * Aim and ball points are normalised to the goal mouth: x runs from -1 (left
 * post) to 1 (right post), y from 0 (ground) to 1 (crossbar). The mouth is
 * 7.32 m by 2.44 m, so one unit of x is 3.66 m and one unit of y is 2.44 m.
 */

export const GOAL_WIDTH = 7.32;
export const GOAL_HEIGHT = 2.44;
export const SHOTS = 5;
export const BEST_KEY = 'nihar-ps5-penalty-best';

export type Point = { x: number; y: number };
export type Dive = -1 | 0 | 1;
export type Outcome = 'goal' | 'saved' | 'wide' | 'over' | 'post';
export type Rng = () => number;
export type ShotResult = {
    outcome: Outcome;
    /** Where the player aimed. */
    aim: Point;
    /** Where the ball actually crossed the goal line (or would have). */
    ball: Point;
    dive: Dive;
};
export type Match = { shots: ShotResult[] };
export type StorageLike = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
};

export const OUTCOME_TEXT: Record<Outcome, string> = {
    goal: 'GOAL!',
    saved: 'Saved!',
    wide: 'Wide',
    over: 'Over the bar',
    post: 'Off the post',
};

/** How far the player may aim outside the frame (deliberately risky). */
export const AIM_LIMIT = { x: 1.25, y: 1.3 };

// Frame and ball sizes in goal units (12 cm posts, 22 cm ball): a ball whose
// centre passes within OUT of the post (or bar) clips it and stays out; one
// that clips the inside by less than IN goes in off the frame.
const POST = { out: 0.035, in: 0.012 };
const BAR = { out: 0.05, in: 0.018 };

const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));

export function clampAim(aim: Point): Point {
    return {
        x: clamp(aim.x, -AIM_LIMIT.x, AIM_LIMIT.x),
        y: clamp(aim.y, 0, AIM_LIMIT.y),
    };
}

/**
 * Standard deviation of the shot error for an aim point: tight through the
 * middle, loose toward the corners and the bar. Drives the reticle size too.
 */
export function spread(aim: Point): Point {
    const ax = Math.min(1, Math.abs(aim.x));
    const ay = Math.min(1, Math.max(0, aim.y));
    return {
        x: 0.03 + 0.1 * ax * ax + 0.03 * ay,
        y: 0.03 + 0.11 * ay * ay + 0.025 * ax,
    };
}

/** Two independent standard normals (Box-Muller) from two rng draws. */
function normals(rng: Rng): [number, number] {
    const u = Math.max(1e-9, rng());
    const v = rng();
    const r = Math.sqrt(-2 * Math.log(u));
    return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}

/** Which third of the goal an aim falls in, from the keeper's view. */
export function zone(x: number): Dive {
    return x < -0.33 ? -1 : x > 0.33 ? 1 : 0;
}

/**
 * The keeper guesses before the ball is struck: mostly a side, sometimes
 * staying up, with a small read of the run-up and of the side the player has
 * favoured so far.
 */
export function keeperDive(aim: Point, rng: Rng, history: Point[] = []): Dive {
    const weights: Record<Dive, number> = { [-1]: 0.38, 0: 0.24, 1: 0.38 };
    weights[zone(aim.x)] += 0.12;
    if (history.length) {
        for (const side of [-1, 0, 1] as Dive[])
            weights[side] +=
                (0.15 * history.filter((p) => zone(p.x) === side).length) /
                history.length;
    }
    const total = weights[-1] + weights[0] + weights[1];
    let pick = rng() * total;
    for (const side of [-1, 0, 1] as Dive[]) {
        pick -= weights[side];
        if (pick < 0) return side;
    }
    return 1;
}

// Reach regions (ellipses in goal units) and their best save chance.
const REACH: Record<
    'stay' | 'dive' | 'legs',
    { cx: number; cy: number; rx: number; ry: number; best: number }
> = {
    stay: { cx: 0, cy: 0.42, rx: 0.32, ry: 0.68, best: 0.95 },
    dive: { cx: 0.45, cy: 0.35, rx: 0.42, ry: 0.58, best: 0.9 },
    legs: { cx: 0.1, cy: 0.08, rx: 0.22, ry: 0.2, best: 0.8 },
};

/** Chance the keeper, having gone `dive`, keeps out a ball at `ball`. */
export function saveChance(ball: Point, dive: Dive): number {
    const regions =
        dive === 0
            ? [{ ...REACH.stay }]
            : [
                  { ...REACH.dive, cx: REACH.dive.cx * dive },
                  { ...REACH.legs, cx: REACH.legs.cx * dive },
              ];
    let chance = 0;
    for (const r of regions) {
        const e = ((ball.x - r.cx) / r.rx) ** 2 + ((ball.y - r.cy) / r.ry) ** 2;
        // Full strength in the middle of the reach, about half at its edge.
        if (e < 1) chance = Math.max(chance, r.best * (1 - 0.45 * e));
    }
    return chance;
}

/** Where a ball at `ball` ends up relative to the frame. */
export function frameOutcome(ball: Point): 'in' | 'wide' | 'over' | 'post' {
    const ax = Math.abs(ball.x);
    const outX = ax - 1 - POST.out; // > 0: clear of the post
    const outY = ball.y - 1 - BAR.out; // > 0: clear of the bar
    if (outX > 0 || outY > 0)
        return outX * GOAL_WIDTH > outY * GOAL_HEIGHT ? 'wide' : 'over';
    if (ax > 1 - POST.in || ball.y > 1 - BAR.in) return 'post';
    return 'in';
}

/**
 * Takes one penalty. Draws from `rng` in a fixed order (two for the shot
 * error, one for the keeper's dive unless forced, one for the save), so a
 * seeded rng always gives the same result.
 */
export function shoot(
    aim: Point,
    rng: Rng = Math.random,
    options: { dive?: Dive; history?: Point[] } = {},
): ShotResult {
    const target = clampAim(aim);
    const sd = spread(target);
    const [ex, ey] = normals(rng);
    const ball = {
        x: target.x + ex * sd.x,
        y: Math.max(0, target.y + ey * sd.y),
    };
    const dive = options.dive ?? keeperDive(target, rng, options.history);
    const frame = frameOutcome(ball);
    let outcome: Outcome;
    if (frame !== 'in') outcome = frame;
    else outcome = rng() < saveChance(ball, dive) ? 'saved' : 'goal';
    return { outcome, aim: target, ball, dive };
}

export function newMatch(): Match {
    return { shots: [] };
}

/** Adds a shot to the match (ignored once all five are taken). */
export function record(match: Match, result: ShotResult): Match {
    if (isOver(match)) return match;
    return { shots: [...match.shots, result] };
}

export function isOver(match: Match): boolean {
    return match.shots.length >= SHOTS;
}

export function score(match: Match): number {
    return match.shots.filter((s) => s.outcome === 'goal').length;
}

/** Aims so far, for the keeper's read. */
export function history(match: Match): Point[] {
    return match.shots.map((s) => s.aim);
}

/** Best score so far (0-5). Missing, garbage or unreadable storage is 0. */
export function loadBest(storage?: StorageLike | null): number {
    try {
        const raw = storage?.getItem(BEST_KEY);
        if (raw == null || !/^\s*\d+\s*$/.test(raw)) return 0;
        const n = Number(raw);
        return Number.isInteger(n) && n >= 0 && n <= SHOTS ? n : 0;
    } catch {
        return 0;
    }
}

/** Stores `value` if it beats the saved best; returns the best either way. */
export function saveBest(
    storage: StorageLike | null | undefined,
    value: number,
): number {
    const n = clamp(Math.round(Number(value) || 0), 0, SHOTS);
    const best = Math.max(loadBest(storage), n);
    try {
        storage?.setItem(BEST_KEY, String(best));
    } catch {
        // Private mode or full storage: keep playing without saving.
    }
    return best;
}

/** Small seeded generator (mulberry32) for tests and replays. */
export function seeded(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
