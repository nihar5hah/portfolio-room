import React, { useEffect, useRef, useState } from 'react';
import bus from '../EventBus';
import {
    Match,
    Outcome,
    Point,
    SHOTS,
    ShotResult,
    OUTCOME_TEXT,
    clampAim,
    history,
    isOver,
    loadBest,
    newMatch,
    record,
    saveBest,
    score,
    seeded,
    shoot,
    spread,
} from './penalty';
import './ps5.css';

/**
 * The room's PS5: a small home screen with one game, a five-kick penalty
 * shootout drawn on a canvas. Opened by `bus.dispatch('openPs5', {})`;
 * Escape or Close returns to the room.
 */

// Canvas layout (internal pixels). The goal mouth is 640 × 213 px, so one
// metre is ~87 px on the goal line.
const W = 1280;
const H = 720;
const CX = W / 2;
const GROUND = 440;
const HALF = 320; // goal half-width in px
const TALL = 213; // goal height in px
const TOP = GROUND - TALL;
const SPOT = 668;
const BALL_NEAR = 24; // ball radius on the spot
const BALL_FAR = 9.6; // ball radius on the goal line
const NET = { left: 352, right: 928, top: TOP + 16, bottom: GROUND - 26 };
const FLIGHT = 560; // ms from strike to the goal line
const AFTER = 650; // ms of follow-through after it
const PAUSE = 1500; // ms the result shows before the next kick
const TAU = Math.PI * 2;
const KIT = { shirt: '#6f7a8c', trim: '#c9d1dc', shorts: '#2b323d' };

type Phase = 'aim' | 'flight' | 'result' | 'over';
type Game = {
    aim: Point;
    shot: ShotResult | null;
    struck: number;
    still: boolean;
    phase: Phase;
    match: Match;
    pressed: boolean;
    timer: number;
};

const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));
const gx = (x: number) => CX + x * HALF;
const gy = (y: number) => GROUND - y * TALL;

function storage(): Storage | null {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function reducedMotion() {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function clock() {
    return new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    });
}

/* ── Drawing ─────────────────────────────────────────────────── */

/** Stadium, pitch and net: everything that never moves, drawn once. */
function drawBackdrop(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const sky = ctx.createLinearGradient(0, 0, 0, 380);
    sky.addColorStop(0, '#03060f');
    sky.addColorStop(1, '#0c1a3a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, 380);
    for (const x of [170, W - 170]) {
        const glow = ctx.createRadialGradient(x, 30, 4, x, 30, 260);
        glow.addColorStop(0, 'rgba(220, 235, 255, 0.55)');
        glow.addColorStop(1, 'rgba(220, 235, 255, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, 380);
    }
    // Crowd: a speckle of shirts in the dark stand.
    ctx.fillStyle = '#080f22';
    ctx.fillRect(0, 128, W, 206);
    const rng = seeded(10);
    const shirts = ['#1b3f8f', '#a33a4a', '#d8dce4', '#e0b440', '#2d6d5a'];
    for (let i = 0; i < 1400; i++) {
        const y = 132 + rng() * 196;
        ctx.globalAlpha = 0.25 + 0.4 * ((y - 128) / 206);
        ctx.fillStyle = shirts[Math.floor(rng() * shirts.length)];
        ctx.fillRect(rng() * W, y, 3, 4);
    }
    ctx.globalAlpha = 1;
    // Advertising boards.
    const boards = ctx.createLinearGradient(0, 334, 0, 372);
    boards.addColorStop(0, '#0f3fa8');
    boards.addColorStop(1, '#072a73');
    ctx.fillStyle = boards;
    ctx.fillRect(0, 334, W, 38);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(0, 334, W, 2);
    // Grass: stripes that widen toward the camera.
    const bands = 12;
    for (let k = 0; k < bands; k++) {
        const y0 = 372 + (H - 372) * (k / bands) ** 1.6;
        const y1 = 372 + (H - 372) * ((k + 1) / bands) ** 1.6;
        ctx.fillStyle = k % 2 ? '#2f7f36' : '#37903d';
        ctx.fillRect(0, y0, W, y1 - y0 + 1);
    }
    const haze = ctx.createLinearGradient(0, 372, 0, H);
    haze.addColorStop(0, 'rgba(4, 10, 30, 0.45)');
    haze.addColorStop(1, 'rgba(4, 10, 30, 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 372, W, H - 372);
    // Lines: goal line, six-yard box, spot.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(W, GROUND);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 506);
    ctx.lineTo(W, 506);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.ellipse(CX, SPOT, 10, 4, 0, 0, TAU);
    ctx.fill();
    drawNet(ctx);
    return canvas;
}

function drawNet(ctx: CanvasRenderingContext2D) {
    const l = gx(-1);
    const r = gx(1);
    const panels: [number, number][][] = [
        // back, left, right, roof, floor
        [
            [NET.left, NET.top],
            [NET.right, NET.top],
            [NET.right, NET.bottom],
            [NET.left, NET.bottom],
        ],
        [
            [l, TOP],
            [NET.left, NET.top],
            [NET.left, NET.bottom],
            [l, GROUND],
        ],
        [
            [r, TOP],
            [NET.right, NET.top],
            [NET.right, NET.bottom],
            [r, GROUND],
        ],
        [
            [l, TOP],
            [r, TOP],
            [NET.right, NET.top],
            [NET.left, NET.top],
        ],
        [
            [l, GROUND],
            [r, GROUND],
            [NET.right, NET.bottom],
            [NET.left, NET.bottom],
        ],
    ];
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    for (const p of [panels[0], panels[4]]) {
        ctx.moveTo(p[0][0], p[0][1]);
        for (const [x, y] of p.slice(1)) ctx.lineTo(x, y);
        ctx.closePath();
    }
    ctx.fill();
    // Mesh: lines across each quad between opposite edges.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    const lerp = (a: [number, number], b: [number, number], t: number) => [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
    ];
    for (const [a, b, c, d] of panels) {
        const across = Math.max(
            2,
            Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 16),
        );
        const down = Math.max(
            2,
            Math.round(Math.hypot(d[0] - a[0], d[1] - a[1]) / 16),
        );
        ctx.beginPath();
        for (let i = 0; i <= across; i++) {
            const [x0, y0] = lerp(a, b, i / across);
            const [x1, y1] = lerp(d, c, i / across);
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
        }
        for (let i = 0; i <= down; i++) {
            const [x0, y0] = lerp(a, d, i / down);
            const [x1, y1] = lerp(b, c, i / down);
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
        }
        ctx.stroke();
    }
}

function drawFrame(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(gx(-1) - 4, GROUND - 2, HALF * 2 + 8, 6);
    ctx.fillStyle = '#f4f6fa';
    ctx.fillRect(gx(-1) - 5.5, TOP - 5.5, 11, TALL + 5.5);
    ctx.fillRect(gx(1) - 5.5, TOP - 5.5, 11, TALL + 5.5);
    ctx.fillRect(gx(-1) - 5.5, TOP - 5.5, HALF * 2 + 11, 11);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(gx(-1) + 2, TOP - 5.5, 3.5, TALL + 5.5);
    ctx.fillRect(gx(1) + 2, TOP - 5.5, 3.5, TALL + 5.5);
}

function pentagon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    turn: number,
) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const a = turn + (i * TAU) / 5;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
}

function drawBall(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    spin: number,
    alpha = 1,
) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const shade = ctx.createRadialGradient(
        x - r * 0.35,
        y - r * 0.4,
        r * 0.1,
        x,
        y,
        r,
    );
    shade.addColorStop(0, '#ffffff');
    shade.addColorStop(1, '#aeb4c0');
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = '#1c2230';
    pentagon(ctx, x, y, r * 0.3, spin);
    for (let i = 0; i < 5; i++) {
        const a = spin + (i * TAU) / 5 + Math.PI / 5;
        pentagon(
            ctx,
            x + Math.cos(a) * r * 0.78,
            y + Math.sin(a) * r * 0.78,
            r * 0.24,
            a,
        );
    }
    ctx.restore();
}

function shadow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rx: number,
    alpha: number,
) {
    ctx.fillStyle = `rgba(0, 0, 0, ${clamp(alpha, 0, 0.5)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * 0.28, 0, 0, TAU);
    ctx.fill();
}

type Pose = {
    x: number;
    y: number;
    lift: number;
    angle: number;
    scale: number;
    arms: number;
    overhead: boolean;
};

/** Keeper figure: feet at the origin, standing up the -y axis. */
function drawKeeper(ctx: CanvasRenderingContext2D, pose: Pose) {
    shadow(ctx, pose.x, GROUND + 2, 42 * pose.scale, 0.35 - pose.lift / 200);
    ctx.save();
    ctx.translate(pose.x, pose.y - pose.lift);
    ctx.rotate(pose.angle);
    ctx.scale(pose.scale, pose.scale);
    ctx.lineCap = 'round';
    // Legs and boots.
    ctx.strokeStyle = KIT.shirt;
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(-10, -78);
    ctx.lineTo(-17, -8);
    ctx.moveTo(10, -78);
    ctx.lineTo(17, -8);
    ctx.stroke();
    ctx.fillStyle = '#111418';
    ctx.beginPath();
    ctx.ellipse(-19, -4, 10, 5, 0, 0, TAU);
    ctx.ellipse(19, -4, 10, 5, 0, 0, TAU);
    ctx.fill();
    // Shorts and shirt.
    ctx.fillStyle = KIT.shorts;
    ctx.fillRect(-22, -98, 44, 28);
    ctx.fillStyle = KIT.shirt;
    ctx.beginPath();
    ctx.moveTo(-24, -146);
    ctx.lineTo(24, -146);
    ctx.lineTo(21, -94);
    ctx.lineTo(-21, -94);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = KIT.trim;
    ctx.fillRect(-21, -122, 42, 4);
    // Arms: from a ready crouch to overhead (dive) or spread (stay).
    const ready = [
        [-46, -100],
        [46, -100],
    ];
    const reach = pose.overhead
        ? [
              [-11, -202],
              [11, -202],
          ]
        : [
              [-64, -178],
              [64, -178],
          ];
    const hands = ready.map(([x, y], i) => [
        x + (reach[i][0] - x) * pose.arms,
        y + (reach[i][1] - y) * pose.arms,
    ]);
    ctx.strokeStyle = KIT.shirt;
    ctx.lineWidth = 11;
    ctx.beginPath();
    for (const [i, [x, y]] of hands.entries()) {
        ctx.moveTo(i ? 20 : -20, -140);
        ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#eef1f5';
    for (const [x, y] of hands) {
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, TAU);
        ctx.fill();
    }
    // Head.
    ctx.fillStyle = '#b97f55';
    ctx.beginPath();
    ctx.arc(0, -166, 15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2a1d16';
    ctx.beginPath();
    ctx.arc(0, -169, 15, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    ctx.restore();
}

const ease = (t: number) => 1 - (1 - t) ** 3;

function keeperPose(
    shot: ShotResult | null,
    t: number,
    now: number,
    still: boolean,
): Pose {
    const idle = still ? 0 : Math.sin(now / 380) * 7;
    const stand: Pose = {
        x: CX + idle,
        y: GROUND,
        lift: 0,
        angle: 0,
        scale: 1,
        arms: 0,
        overhead: false,
    };
    // The keeper reacts a beat after the strike and is down by the line.
    const p = shot ? clamp((t - 70) / (FLIGHT - 70), 0, 1) : 0;
    if (!shot || p <= 0) return stand;
    const e = ease(p);
    const saved = shot.outcome === 'saved';
    const bx = gx(shot.ball.x);
    const by = gy(Math.max(0.045, shot.ball.y));
    if (shot.dive === 0) {
        const lean = clamp(Math.atan2(bx - CX, GROUND - by), -0.4, 0.4);
        return {
            ...stand,
            x: CX + (saved ? (bx - CX) * 0.35 * e : 0),
            lift: Math.sin(Math.PI * p) * 24,
            angle: lean * (saved ? 1 : 0.3) * e,
            arms: e,
            overhead: saved && by < GROUND - 150,
        };
    }
    // Diving: hands go to the ball on a save, fall just short when the ball
    // is on his side, or stretch to a default spot when he guessed wrong.
    let hx = gx(0.62 * shot.dive);
    let hy = gy(0.48);
    const baseX = (x: number) => CX + (x - CX) * 0.28;
    if (saved) {
        hx = bx;
        hy = by;
    } else if (Math.sign(shot.ball.x) === shot.dive) {
        const b = baseX(bx);
        hx = b + (bx - b) * 0.8;
        hy = GROUND + (by - GROUND) * 0.8;
    }
    const x = baseX(hx);
    const angle = clamp(Math.atan2(hx - x, GROUND - hy), -1.5, 1.5);
    const length = Math.hypot(hx - x, GROUND - hy);
    const settle = saved ? 0 : clamp((t - FLIGHT) / AFTER, 0, 1);
    return {
        x: CX + (x - CX) * e,
        y: GROUND,
        lift: Math.sin(Math.PI * p) * 30,
        angle: angle * e + (Math.sign(angle) * 1.52 - angle) * settle * 0.6,
        scale: 1 + (clamp(length / 205, 0.75, 1.35) - 1) * e,
        arms: e,
        overhead: true,
    };
}

/** Ball position along its flight; p runs 0 → 1 (spot → goal line) and on. */
function flight(shot: ShotResult, p: number) {
    const far = BALL_NEAR / BALL_FAR;
    const z = 1 + (far - 1) * p;
    // Perspective-correct blend between the spot and the goal-line point.
    const w = p / far / (1 - p + p / far);
    const ex = gx(shot.ball.x);
    const ey = gy(Math.max(0.045, shot.ball.y));
    const start = SPOT - BALL_NEAR;
    const q = Math.min(p, 1);
    return {
        x: CX + (ex - CX) * w,
        y: start + (ey - start) * w - (4 * q * (1 - q) * 34) / z,
        r: BALL_NEAR / z,
        ground: SPOT + (GROUND - SPOT) * w,
    };
}

function drawScene(
    ctx: CanvasRenderingContext2D,
    backdrop: HTMLCanvasElement,
    game: Game,
    now: number,
) {
    ctx.drawImage(backdrop, 0, 0);
    const { shot } = game;
    const t = shot ? (game.still ? FLIGHT + AFTER : now - game.struck) : 0;
    let ball = { x: CX, y: SPOT - BALL_NEAR, r: BALL_NEAR, ground: SPOT };
    let alpha = 1;
    let behind = false;
    if (shot) {
        const p = clamp(t / FLIGHT, 0, 1);
        const q = clamp((t - FLIGHT) / AFTER, 0, 1);
        ball = flight(shot, p);
        if (q > 0) {
            const at = flight(shot, 1);
            const side = Math.sign(shot.ball.x) || 1;
            if (shot.outcome === 'goal') {
                ball = flight(shot, 1 + 0.2 * ease(q));
                ball.y = Math.min(
                    ball.y + 70 * q * q,
                    NET.bottom + 12 - ball.r,
                );
                ball.x = clamp(ball.x, NET.left + ball.r, NET.right - ball.r);
                behind = true;
            } else if (shot.outcome === 'wide' || shot.outcome === 'over') {
                ball = flight(shot, 1 + 0.3 * q);
                alpha = 1 - q;
                behind = true;
            } else if (shot.outcome === 'saved') {
                if (shot.dive !== 0) {
                    ball = {
                        ...at,
                        x: at.x + side * 150 * ease(q),
                        y: at.y - 46 * Math.sin(Math.PI * q) + 90 * q * q,
                        r: at.r * (1 + 0.4 * q),
                    };
                    alpha = 1 - q * 0.6;
                }
            } else {
                // Off the frame and back toward the spot.
                const post = Math.abs(shot.ball.x) > 0.95;
                ball = {
                    ...at,
                    x: at.x - (post ? side * 110 : side * 30) * q,
                    y:
                        at.y +
                        (post ? 0 : -40 * Math.sin(Math.PI * q)) +
                        170 * q * q,
                    r: at.r * (1 + 0.7 * q),
                };
            }
        }
    }
    const spin = shot ? t / 60 : 0;
    const drawTheBall = () => {
        if (alpha <= 0) return;
        if (!behind)
            shadow(ctx, ball.x, ball.ground, ball.r * 0.9, 0.4 * alpha);
        drawBall(ctx, ball.x, ball.y, ball.r, spin, alpha);
    };
    if (behind) drawTheBall();
    drawKeeper(ctx, keeperPose(shot, t, now, game.still));
    drawFrame(ctx);
    if (!behind) drawTheBall();
    if (game.phase === 'aim') drawReticle(ctx, game.aim, now, game.still);
}

function drawReticle(
    ctx: CanvasRenderingContext2D,
    aim: Point,
    now: number,
    still: boolean,
) {
    const x = gx(aim.x);
    const y = gy(aim.y);
    const sd = spread(aim);
    const pulse = still ? 1 : 1 + Math.sin(now / 220) * 0.06;
    const rx = Math.max(14, sd.x * HALF * 1.5) * pulse;
    const ry = Math.max(14, sd.y * TALL * 1.5) * pulse;
    ctx.save();
    ctx.shadowColor = 'rgba(80, 160, 255, 0.9)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - rx - 8, y);
    ctx.lineTo(x - rx + 6, y);
    ctx.moveTo(x + rx - 6, y);
    ctx.lineTo(x + rx + 8, y);
    ctx.moveTo(x, y - ry - 8);
    ctx.lineTo(x, y - ry + 6);
    ctx.moveTo(x, y + ry - 6);
    ctx.lineTo(x, y + ry + 8);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
}

/* ── Component ───────────────────────────────────────────────── */

export default function Ps5View() {
    const [open, setOpen] = useState(false);
    const [screen, setScreen] = useState<'home' | 'game'>('home');
    const [phase, setPhase] = useState<Phase>('aim');
    const [shots, setShots] = useState<ShotResult[]>([]);
    const [banner, setBanner] = useState<Outcome | null>(null);
    const [best, setBest] = useState(0);
    const [newBest, setNewBest] = useState(false);
    const [time, setTime] = useState(clock);
    const canvas = useRef<HTMLCanvasElement>(null);
    const start = useRef<HTMLButtonElement>(null);
    const opener = useRef<HTMLElement | null>(null);
    const game = useRef<Game>({
        aim: { x: 0, y: 0.5 },
        shot: null,
        struck: 0,
        still: false,
        phase: 'aim',
        match: newMatch(),
        pressed: false,
        timer: 0,
    });

    useEffect(
        () =>
            bus.on('openPs5', () => {
                opener.current = document.activeElement as HTMLElement;
                setBest(loadBest(storage()));
                setScreen('home');
                setOpen(true);
            }),
        [],
    );

    const go = (next: Phase) => {
        game.current.phase = next;
        setPhase(next);
    };

    function play() {
        const g = game.current;
        window.clearTimeout(g.timer);
        g.match = newMatch();
        g.shot = null;
        g.aim = { x: 0, y: 0.5 };
        g.pressed = false;
        g.still = reducedMotion();
        setShots([]);
        setBanner(null);
        setNewBest(false);
        go('aim');
        setScreen('game');
    }

    function fire() {
        const g = game.current;
        if (g.phase !== 'aim') return;
        g.still = reducedMotion();
        g.shot = shoot(g.aim, Math.random, { history: history(g.match) });
        g.struck = performance.now();
        go('flight');
        g.timer = window.setTimeout(land, g.still ? 0 : FLIGHT);
    }

    function land() {
        const g = game.current;
        if (!g.shot) return;
        g.match = record(g.match, g.shot);
        setShots(g.match.shots);
        setBanner(g.shot.outcome);
        go('result');
        if (isOver(g.match)) {
            const previous = loadBest(storage());
            const total = score(g.match);
            setBest(saveBest(storage(), total));
            setNewBest(total > previous);
        }
        g.timer = window.setTimeout(advance, PAUSE);
    }

    function advance() {
        const g = game.current;
        if (g.phase !== 'result') return;
        window.clearTimeout(g.timer);
        if (isOver(g.match)) return go('over');
        g.shot = null;
        setBanner(null);
        go('aim');
    }

    function aimAt(e: React.PointerEvent<HTMLCanvasElement>) {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * W;
        const py = ((e.clientY - rect.top) / rect.height) * H;
        game.current.aim = clampAim({
            x: (px - CX) / HALF,
            y: (GROUND - py) / TALL,
        });
    }

    function close() {
        window.clearTimeout(game.current.timer);
        game.current.shot = null;
        setOpen(false);
        setScreen('home');
        const back = opener.current;
        opener.current = null;
        if (back && back !== document.body && back.isConnected) back.focus();
    }

    // Keyboard: Escape closes; arrows aim; Space/Enter shoots or skips on.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') return close();
            if (screen !== 'game') return;
            const g = game.current;
            const steps: Record<string, [number, number]> = {
                ArrowLeft: [-0.05, 0],
                ArrowRight: [0.05, 0],
                ArrowUp: [0, 0.05],
                ArrowDown: [0, -0.05],
            };
            if (steps[e.key]) {
                e.preventDefault();
                if (g.phase !== 'aim') return;
                const [dx, dy] = steps[e.key];
                g.aim = clampAim({ x: g.aim.x + dx, y: g.aim.y + dy });
            } else if (e.key === ' ' || e.key === 'Enter') {
                if ((e.target as Element)?.closest?.('button')) return;
                e.preventDefault();
                if (g.phase === 'aim') fire();
                else if (g.phase === 'result') advance();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, screen]);

    // Home screen clock.
    useEffect(() => {
        if (!open) return;
        setTime(clock());
        const id = window.setInterval(() => setTime(clock()), 15000);
        return () => window.clearInterval(id);
    }, [open]);

    // Focus: Start on the home screen, the pitch in the game.
    useEffect(() => {
        if (!open) return;
        if (screen === 'home') start.current?.focus();
        else canvas.current?.focus();
    }, [open, screen]);

    // Draw loop, only while the game is on screen.
    useEffect(() => {
        if (!open || screen !== 'game') return;
        const ctx = canvas.current?.getContext('2d');
        if (!ctx) return;
        const backdrop = drawBackdrop();
        let frame = 0;
        const loop = (now: number) => {
            drawScene(ctx, backdrop, game.current, now);
            frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frame);
    }, [open, screen]);

    // Stop any pending kick on unmount.
    useEffect(() => () => window.clearTimeout(game.current.timer), []);

    if (!open) return null;
    const goals = shots.filter((s) => s.outcome === 'goal').length;
    return (
        <div
            className="ps5-view"
            role="dialog"
            aria-modal="true"
            aria-label="PlayStation 5"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <header className="ps5-header">
                <span className="ps5-logo">PS5</span>
                <span className="ps5-time">{time}</span>
                <button className="ps5-close" onClick={close}>
                    Close
                </button>
            </header>
            {screen === 'home' ? (
                <main className="ps5-home">
                    <p className="ps5-eyebrow">Games</p>
                    <div className="ps5-tile">
                        <div className="ps5-tile-art" aria-hidden="true">
                            <span className="ps5-tile-goal" />
                            <span className="ps5-tile-ball" />
                        </div>
                        <div className="ps5-tile-info">
                            <h2>Penalty Shootout</h2>
                            <p>
                                Five kicks. Best {best}/{SHOTS}
                            </p>
                            <button
                                ref={start}
                                className="ps5-start"
                                onClick={play}
                            >
                                Start
                            </button>
                        </div>
                    </div>
                </main>
            ) : (
                <main className="ps5-game">
                    <div className="ps5-hud">
                        <ol
                            className="ps5-tracker"
                            aria-label={`Scored ${goals} of ${shots.length}`}
                        >
                            {Array.from({ length: SHOTS }, (_, i) => {
                                const s = shots[i];
                                const state = s
                                    ? s.outcome === 'goal'
                                        ? 'goal'
                                        : 'miss'
                                    : i === shots.length
                                      ? 'next'
                                      : 'todo';
                                return (
                                    <li
                                        key={i}
                                        className={`ps5-dot is-${state}`}
                                    />
                                );
                            })}
                        </ol>
                        <span className="ps5-score">
                            {goals} / {SHOTS}
                        </span>
                    </div>
                    <div className="ps5-stage">
                        <canvas
                            ref={canvas}
                            width={W}
                            height={H}
                            tabIndex={0}
                            aria-label="Penalty pitch. Arrow keys aim, Space shoots."
                            onPointerMove={(e) => {
                                if (game.current.phase === 'aim') aimAt(e);
                            }}
                            onPointerDown={(e) => {
                                const g = game.current;
                                if (g.phase === 'result') return advance();
                                if (g.phase !== 'aim') return;
                                aimAt(e);
                                g.pressed = true;
                                e.currentTarget.setPointerCapture?.(
                                    e.pointerId,
                                );
                            }}
                            onPointerUp={(e) => {
                                const g = game.current;
                                if (!g.pressed) return;
                                g.pressed = false;
                                aimAt(e);
                                fire();
                            }}
                            onPointerCancel={() =>
                                (game.current.pressed = false)
                            }
                        />
                        <p
                            className="ps5-banner-slot"
                            role="status"
                            aria-live="polite"
                        >
                            {banner && phase !== 'over' && (
                                <span className={`ps5-banner is-${banner}`}>
                                    {OUTCOME_TEXT[banner]}
                                </span>
                            )}
                        </p>
                        {phase === 'over' && (
                            <div className="ps5-end">
                                <h2>
                                    You scored {goals}/{SHOTS}
                                </h2>
                                <p>
                                    {newBest
                                        ? 'New best!'
                                        : `Best ${best}/${SHOTS}`}
                                </p>
                                <div className="ps5-actions">
                                    <button
                                        className="ps5-start"
                                        onClick={play}
                                        autoFocus
                                    >
                                        Play again
                                    </button>
                                    <button
                                        className="ps5-secondary"
                                        onClick={() => setScreen('home')}
                                    >
                                        Back
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    <p className="ps5-hint">
                        {phase === 'aim'
                            ? `Kick ${shots.length + 1} of ${SHOTS} · aim, then click or press Space`
                            : '\u00a0'}
                    </p>
                </main>
            )}
        </div>
    );
}
