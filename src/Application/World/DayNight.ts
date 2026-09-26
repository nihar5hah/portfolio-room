/**
 * Bangalore's sky, worked out from the real clock: where the sun and moon
 * are, how much daylight there is, and what the room's lights should do
 * about it. Pure functions, so the room and its tests share one source.
 *
 * Solar position: the NOAA low-precision formulae (good to ~0.1°), for
 * Bengaluru (12.97° N, 77.59° E). The moon is approximated from its phase:
 * it trails the sun by `phase × 360°` of hour angle and sits on the equator,
 * which puts moonrise and moonset within the right hour or so.
 */
export const BANGALORE = { lat: 12.9716, lon: 77.5946, zone: 'Asia/Kolkata' };

const rad = Math.PI / 180;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smoothstep = (x: number, a: number, b: number) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
};

/** Hours since midnight in Bangalore (e.g. 21.5 for 9:30 pm IST). */
export function bangaloreHour(date: Date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: BANGALORE.zone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) =>
        Number(parts.find((p) => p.type === type)?.value ?? 0);
    return get('hour') + get('minute') / 60 + get('second') / 3600;
}

/** Days since J2000.0. */
const j2000 = (date: Date) => date.getTime() / 86400000 + 2440587.5 - 2451545;

/** Sun's elevation and hour angle (degrees) over Bangalore. */
export function sunPosition(
    date: Date,
    lat = BANGALORE.lat,
    lon = BANGALORE.lon,
) {
    const n = j2000(date);
    const L = (280.46 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * rad;
    const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
    const epsilon = (23.439 - 0.0000004 * n) * rad;
    const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
    const ascension =
        Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) /
        rad;
    const gmst = (280.46061837 + 360.98564736629 * n) % 360;
    let hourAngle = (gmst + lon - ascension) % 360;
    if (hourAngle > 180) hourAngle -= 360;
    if (hourAngle < -180) hourAngle += 360;
    return {
        elevation: elevationOf(hourAngle, declination / rad, lat),
        hourAngle,
        declination: declination / rad,
    };
}

function elevationOf(hourAngle: number, declination: number, lat: number) {
    return (
        Math.asin(
            Math.sin(lat * rad) * Math.sin(declination * rad) +
                Math.cos(lat * rad) *
                    Math.cos(declination * rad) *
                    Math.cos(hourAngle * rad),
        ) / rad
    );
}

/** Moon phase, 0 = new, 0.5 = full, 1 = new again. */
export function moonPhase(date: Date) {
    const synodic = 29.530588853;
    const newMoon = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
    const days = date.getTime() / 86400000 - newMoon;
    return (((days / synodic) % 1) + 1) % 1;
}

export function moonPosition(date: Date) {
    const sun = sunPosition(date);
    const phase = moonPhase(date);
    let hourAngle = sun.hourAngle - phase * 360;
    hourAngle = ((((hourAngle + 180) % 360) + 360) % 360) - 180;
    return {
        elevation: elevationOf(hourAngle, 0, BANGALORE.lat),
        hourAngle,
        phase,
    };
}

export interface SkyState {
    /** Bangalore clock, hours. */
    hour: number;
    sun: { elevation: number; hourAngle: number };
    moon: { elevation: number; hourAngle: number; phase: number };
    /** 0 at night → 1 in full daylight. */
    day: number;
    /** Warm light of sunrise and sunset, 0–1. */
    golden: number;
    /** 1 in full dark, stars out. */
    night: number;
    /** Share of the city's windows lit, 0–1. */
    cityLights: number;
    /** Moonlight strength: moon up, sky dark, scaled by how full it is. */
    moonlight: number;
    /** Direct sun through the west-facing window (afternoon and sunset). */
    westSun: number;
}

export function skyState(date: Date): SkyState {
    const sun = sunPosition(date);
    const moon = moonPosition(date);
    const hour = bangaloreHour(date);
    const e = sun.elevation;
    const day = smoothstep(e, -4, 14);
    const golden = e > -8 ? Math.exp(-(((e - 2) / 6.5) ** 2)) : 0;
    const night = 1 - smoothstep(e, -14, -3);
    // Evenings are busiest; the city winds down after midnight.
    const late = smoothstep(hour, 0.5, 3) * (1 - smoothstep(hour, 4.5, 6));
    const cityLights = (1 - day) * (0.85 - 0.6 * late);
    const full = (1 - Math.cos(moon.phase * Math.PI * 2)) / 2;
    const moonlight =
        (1 - day) * smoothstep(moon.elevation, -2, 18) * (0.25 + 0.75 * full);
    // The window is on the room's west wall: the sun only shines straight in
    // after noon, strongest as it sinks, gone once it sets.
    const westSun =
        smoothstep(sun.hourAngle, 5, 40) *
        smoothstep(e, -1, 4) *
        (1 - smoothstep(e, 55, 75));
    return {
        hour,
        sun,
        moon,
        day,
        golden,
        night,
        cityLights,
        moonlight,
        westSun,
    };
}

/** Old name kept for the room's minute-by-minute checks. */
export type SkyPhase = 'day' | 'dusk' | 'night';
export function skyPhaseOf(state: SkyState): SkyPhase {
    if (state.day > 0.75) return 'day';
    if (state.night > 0.75) return 'night';
    return 'dusk';
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
];
const mix = (a: RGB, b: RGB, t: number): RGB => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
];
const css = (c: RGB, alpha = 1) =>
    `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
/** Deterministic noise so the skyline and stars never flicker between repaints. */
const hash = (n: number) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
};

/**
 * Paint the view out of the window: sky gradient, stars, sun or moon at their
 * real height, a few soft clouds, and a two-row skyline whose windows light
 * up through the evening. `width` × `height` canvas, horizon near the bottom.
 */
export function paintSky(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    sky: SkyState,
) {
    const { day, golden, night } = sky;
    const horizon = height * 0.74;
    // Sky: night navy → blue hour → daylight, with sunrise/sunset warmth low.
    const top = mix(
        mix(hex('#050b18'), hex('#1d3563'), 1 - night),
        hex('#3f7cc4'),
        day,
    );
    let low = mix(
        mix(hex('#0d1629'), hex('#41517d'), 1 - night),
        hex('#b4d0ec'),
        day,
    );
    low = mix(low, hex('#f09a62'), golden * 0.85);
    const mid = mix(mix(top, low, 0.55), hex('#d98a8c'), golden * 0.35);
    const gradient = ctx.createLinearGradient(0, 0, 0, horizon);
    gradient.addColorStop(0, css(top));
    gradient.addColorStop(0.6, css(mid));
    gradient.addColorStop(1, css(low));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Stars once it is properly dark.
    if (night > 0.05)
        for (let i = 0; i < 110; i++) {
            const x = hash(i) * width,
                y = hash(i + 500) * horizon * 0.85;
            ctx.fillStyle = `rgba(235,240,255,${(0.25 + 0.6 * hash(i + 900)) * night})`;
            ctx.fillRect(
                x,
                y,
                1.6 + hash(i + 77) * 1.6,
                1.6 + hash(i + 77) * 1.6,
            );
        }

    // Sun and moon travel left (east) to right (west) at their real height;
    // high up they leave the frame, as they would through a real window.
    const across = (hourAngle: number) => width * (0.5 + hourAngle / 200);
    const up = (elevation: number) => horizon - (elevation / 38) * horizon;
    const { moon, sun } = sky;
    if (moon.elevation > -3 && moon.phase > 0.03 && moon.phase < 0.97) {
        const x = across(moon.hourAngle),
            y = up(moon.elevation),
            r = 30;
        const lit = 0.35 + 0.65 * (1 - day);
        const halo = ctx.createRadialGradient(x, y, r, x, y, r * 4);
        halo.addColorStop(0, `rgba(220,228,255,${0.22 * night})`);
        halo.addColorStop(1, 'rgba(220,228,255,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
        ctx.fillStyle = `rgba(242,238,224,${lit})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        // Shadow side: an offset disc in the sky colour cuts the crescent.
        const shade = Math.cos(moon.phase * Math.PI * 2); // 1 new, -1 full
        if (shade > -0.95) {
            ctx.fillStyle = css(mix(top, low, 0.3), 0.92);
            ctx.beginPath();
            ctx.arc(
                x + (moon.phase < 0.5 ? -1 : 1) * r * (1 - shade) * 1.02,
                y,
                r,
                0,
                Math.PI * 2,
            );
            ctx.fill();
        }
    }
    if (sun.elevation > -4) {
        const x = across(sun.hourAngle),
            y = up(sun.elevation),
            warm = 1 - smoothstep(sun.elevation, 0, 20);
        const color = mix(hex('#fff6e0'), hex('#ff9a4a'), warm);
        const glow = ctx.createRadialGradient(x, y, 10, x, y, 260);
        glow.addColorStop(0, css(color, 0.75));
        glow.addColorStop(1, css(color, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(x - 260, y - 260, 520, 520);
        ctx.fillStyle = css(mix(color, hex('#ffffff'), 0.4));
        ctx.beginPath();
        ctx.arc(x, y, 34, 0, Math.PI * 2);
        ctx.fill();
    }

    // Soft clouds: white by day, pink-orange at sunset, dim blue at night.
    const cloud = mix(
        mix(hex('#2a3550'), hex('#f4f6fa'), day),
        hex('#f4b28a'),
        golden * 0.7,
    );
    for (let i = 0; i < 6; i++) {
        const cx = hash(i + 40) * width,
            cy = horizon * (0.18 + 0.5 * hash(i + 60)),
            w = 160 + hash(i + 80) * 220;
        for (let j = 0; j < 5; j++) {
            const puff = ctx.createRadialGradient(
                cx + (j - 2) * w * 0.22,
                cy + Math.sin(j * 1.7) * 10,
                0,
                cx + (j - 2) * w * 0.22,
                cy + Math.sin(j * 1.7) * 10,
                w * 0.3,
            );
            puff.addColorStop(0, css(cloud, 0.22 + 0.12 * day));
            puff.addColorStop(1, css(cloud, 0));
            ctx.fillStyle = puff;
            ctx.fillRect(cx - w, cy - w * 0.4, w * 2, w * 0.8);
        }
    }

    // Skyline: a hazy far row and a near row, windows lit through the evening.
    const rows = [
        { ground: horizon + 24, tall: 0.3, width: 58, haze: 0.45 },
        { ground: height, tall: 0.44, width: 76, haze: 0 },
    ];
    rows.forEach((row, r) => {
        const body = mix(
            mix(hex('#0a0f19'), hex('#58677a'), day),
            low,
            row.haze * (0.5 + 0.3 * day),
        );
        for (let x = -20, i = 0; x < width; i++) {
            const w = row.width * (0.7 + hash(i + r * 97) * 0.8);
            const h = height * row.tall * (0.35 + hash(i * 3 + r * 13) * 0.65);
            const y = row.ground - h;
            ctx.fillStyle = css(mix(body, hex('#ffffff'), 0.04 * hash(i + 5)));
            ctx.fillRect(x, y, w, height - y);
            if (r === 1 && day > 0.4) {
                // Sunlit faces by day.
                ctx.fillStyle = css(hex('#ffffff'), 0.06 * day);
                ctx.fillRect(x, y, w * 0.35, height - y);
            }
            for (let wy = y + 12; wy < height - 8; wy += r ? 22 : 16)
                for (let wx = x + 7; wx < x + w - 8; wx += r ? 15 : 11) {
                    const seed = hash(wx * 0.37 + wy * 1.91 + r * 7);
                    if (seed > sky.cityLights) continue;
                    const warm = hash(seed * 91) > 0.25;
                    ctx.fillStyle = warm
                        ? `rgba(255,205,130,${r ? 0.9 : 0.55})`
                        : `rgba(190,215,255,${r ? 0.8 : 0.5})`;
                    ctx.fillRect(wx, wy, r ? 5 : 3, r ? 8 : 5);
                }
            x += w + 2 + hash(i + 31) * 10;
        }
    });
}
