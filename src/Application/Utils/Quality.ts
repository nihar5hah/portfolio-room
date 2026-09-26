/**
 * Adaptive quality: pick a starting tier from what the device says about
 * itself, then let a frame-time governor trade resolution (and, if that is
 * not enough, the tier) for a steady frame rate. Pure decisions live in
 * `detectTier`, `settingsFor` and `Governor`, so they are testable in node.
 *
 * `?quality=low|medium|high` forces a tier (and turns the governor's tier
 * changes off) for checking how the room looks and runs on each.
 */
export type Tier = 'low' | 'medium' | 'high';
const ORDER: Tier[] = ['low', 'medium', 'high'];

export interface DeviceInfo {
    /** navigator.deviceMemory (GB), when the browser reports it. */
    memory?: number;
    /** navigator.hardwareConcurrency. */
    cores?: number;
    /** A touch-first device (coarse pointer, no hover). */
    touch: boolean;
    /** Shortest side of the screen, CSS pixels. */
    screen: number;
    devicePixelRatio: number;
    /** Unmasked WebGL renderer string, if available. */
    gpu?: string;
    /** WebGL2 available. */
    webgl2: boolean;
    /** navigator.connection.saveData, or prefers-reduced-data. */
    saveData?: boolean;
}

export interface QualitySettings {
    tier: Tier;
    /** MSAA on the main canvas (fixed once the context is created). */
    antialias: boolean;
    /** Highest pixel ratio the governor may use, and where it starts. */
    maxPixelRatio: number;
    /** Lowest pixel ratio the governor may drop to before a tier change. */
    minPixelRatio: number;
    /** Shadow-map size for the key light; 0 = no shadows. */
    shadowMapSize: number;
    /**
     * Frames between shadow-map refreshes while something under the light
     * moves (Begu, the ball). 0 = draw the shadows once and keep them.
     */
    shadowInterval: number;
    /** Begu casts a real shadow (otherwise a soft contact blob). */
    dynamicShadows: boolean;
    /**
     * Which of the room's practical lights run in the shader: every one,
     * the ones that shape the room ('key'), or just the fan light and the
     * reading lamp ('minimal'). The rest still glow; their light is folded
     * into the fill.
     */
    lights: 'all' | 'key' | 'minimal';
    /** Dust motes, rain beads and other small ambient effects. */
    ambientDetail: boolean;
    /** Load the laptop's desktop early (idle) rather than on demand. */
    preloadDesktop: boolean;
}

const LOW_GPU =
    /swiftshader|llvmpipe|software|mali-(4|t[678])|mali-g(31|51|52|57|68)|adreno \(tm\) ([1-5]\d\d|6[01]\d)\b|powervr|sgx|intel.*(hd graphics [2-5]\d{2}\b|gma)/i;
const MID_GPU =
    /mali|adreno \(tm\) 6[2-9]\d|intel.*(hd|uhd|iris)|apple gpu|apple m1\b/i;

/** Starting tier from what the device reports. */
export function detectTier(d: DeviceInfo): Tier {
    const gpu = d.gpu ?? '';
    if (!d.webgl2 || d.saveData) return 'low';
    if (/swiftshader|llvmpipe|software/i.test(gpu)) return 'low';
    if (d.memory !== undefined && d.memory <= 2) return 'low';
    if (LOW_GPU.test(gpu)) return 'low';
    if (d.touch && d.cores !== undefined && d.cores <= 4) return 'low';
    if (d.touch || d.screen < 700) return 'medium';
    if (d.memory !== undefined && d.memory <= 4) return 'medium';
    if (d.cores !== undefined && d.cores <= 4) return 'medium';
    if (
        MID_GPU.test(gpu) &&
        !/apple m[2-9]|apple m1 (pro|max|ultra)/i.test(gpu)
    )
        return 'medium';
    return 'high';
}

export function settingsFor(tier: Tier, d: DeviceInfo): QualitySettings {
    // Phones: small screens at 2–3× density. 1.25 already looks sharp at
    // arm's length; the governor goes lower if the GPU needs it.
    const small = d.touch || d.screen < 900;
    const dpr = d.devicePixelRatio || 1;
    if (tier === 'high')
        return {
            tier,
            antialias: true,
            maxPixelRatio: Math.min(dpr, small ? 1.5 : 1.75),
            minPixelRatio: Math.min(dpr, 0.85),
            shadowMapSize: 2048,
            shadowInterval: 2,
            dynamicShadows: true,
            lights: 'all',
            ambientDetail: true,
            preloadDesktop: true,
        };
    if (tier === 'medium')
        return {
            tier,
            antialias: !small,
            maxPixelRatio: Math.min(dpr, small ? 1.25 : 1.35),
            minPixelRatio: Math.min(dpr, 0.75),
            shadowMapSize: 1024,
            shadowInterval: 4,
            dynamicShadows: true,
            lights: 'key',
            ambientDetail: true,
            preloadDesktop: !small,
        };
    return {
        tier,
        antialias: false,
        maxPixelRatio: Math.min(dpr, 1),
        minPixelRatio: Math.min(dpr, 0.6),
        shadowMapSize: 1024,
        shadowInterval: 0,
        dynamicShadows: false,
        lights: 'minimal',
        ambientDetail: false,
        preloadDesktop: false,
    };
}

export const lowerTier = (tier: Tier): Tier =>
    ORDER[Math.max(0, ORDER.indexOf(tier) - 1)];

/**
 * Frame-time governor. Feed it every frame's duration; every `window`
 * seconds it looks at the median frame time and answers with a change:
 * a lower or higher pixel ratio (in small steps, with hysteresis so it
 * never see-saws), or a request to drop a tier when resolution alone
 * cannot hold the frame rate.
 */
export class Governor {
    samples: number[] = [];
    elapsed = 0;
    /** Consecutive good windows (for stepping resolution back up). */
    good = 0;
    /** Consecutive bad windows at the lowest resolution. */
    stuck = 0;
    /** Seconds to ignore after a change (shader compiles, reallocation). */
    settle = 0;

    constructor(
        public pixelRatio: number,
        public settings: QualitySettings,
        /** Frame time (ms) above which it steps down: under ~50 fps. */
        public slow = 1000 / 50,
        /** Frame time (ms) below which it may step up: above ~58 fps. */
        public fast = 1000 / 58,
        public window = 2,
    ) {}

    /** Returns what changed this frame, if anything. */
    frame(ms: number): { pixelRatio?: number; tier?: 'lower' } | null {
        // Tab switches and long hitches (loading, compiles) are not load.
        if (!(ms > 0) || ms > 250) return null;
        if (this.settle > 0) {
            this.settle -= ms / 1000;
            return null;
        }
        this.samples.push(ms);
        this.elapsed += ms / 1000;
        if (this.elapsed < this.window) return null;
        const sorted = this.samples.slice().sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        this.samples = [];
        this.elapsed = 0;
        const { minPixelRatio, maxPixelRatio } = this.settings;
        if (median > this.slow) {
            this.good = 0;
            if (this.pixelRatio > minPixelRatio + 0.01) {
                // Bigger steps the further behind it is.
                const factor = median > this.slow * 1.6 ? 0.75 : 0.87;
                this.pixelRatio = Math.max(
                    minPixelRatio,
                    +(this.pixelRatio * factor).toFixed(3),
                );
                this.settle = 1;
                return { pixelRatio: this.pixelRatio };
            }
            if (++this.stuck >= 2) {
                this.stuck = 0;
                this.settle = 3;
                return { tier: 'lower' };
            }
            return null;
        }
        this.stuck = 0;
        if (median < this.fast && this.pixelRatio < maxPixelRatio - 0.01) {
            if (++this.good >= 3) {
                this.good = 0;
                this.pixelRatio = Math.min(
                    maxPixelRatio,
                    +(this.pixelRatio * 1.1).toFixed(3),
                );
                this.settle = 1;
                return { pixelRatio: this.pixelRatio };
            }
        } else this.good = 0;
        return null;
    }

    /** A new tier: new limits, keep within them. */
    retier(settings: QualitySettings) {
        this.settings = settings;
        this.pixelRatio = Math.min(
            settings.maxPixelRatio,
            Math.max(settings.minPixelRatio, this.pixelRatio),
        );
        this.samples = [];
        this.elapsed = 0;
        this.good = this.stuck = 0;
        this.settle = 3;
    }
}

/** Read the device (browser only). */
export function readDevice(): DeviceInfo {
    const nav = navigator as Navigator & {
        deviceMemory?: number;
        connection?: { saveData?: boolean };
    };
    let gpu: string | undefined;
    let webgl2 = false;
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
        webgl2 = !!gl;
        const probe = gl ?? canvas.getContext('webgl');
        if (probe) {
            const info = probe.getExtension('WEBGL_debug_renderer_info');
            gpu = String(
                info
                    ? probe.getParameter(info.UNMASKED_RENDERER_WEBGL)
                    : probe.getParameter(probe.RENDERER),
            );
            probe.getExtension('WEBGL_lose_context')?.loseContext();
        }
    } catch {
        // No WebGL at all: the room will report its own error.
    }
    const media = (query: string) =>
        typeof matchMedia === 'function' && matchMedia(query).matches;
    return {
        memory: nav.deviceMemory,
        cores: nav.hardwareConcurrency || undefined,
        touch: media('(pointer: coarse)') && !media('(hover: hover)'),
        screen: Math.min(
            screen.width || innerWidth,
            screen.height || innerHeight,
        ),
        devicePixelRatio: window.devicePixelRatio || 1,
        gpu,
        webgl2,
        saveData:
            !!nav.connection?.saveData ||
            media('(prefers-reduced-data: reduce)'),
    };
}

/** Everything the room needs to know about quality, for the session. */
export default class Quality {
    device: DeviceInfo;
    settings: QualitySettings;
    forced: Tier | null;
    governor: Governor;
    listeners: ((settings: QualitySettings) => void)[] = [];

    constructor(device: DeviceInfo = readDevice(), query = location.search) {
        this.device = device;
        const param = new URLSearchParams(query).get('quality');
        this.forced = ORDER.includes(param as Tier) ? (param as Tier) : null;
        const tier = this.forced ?? detectTier(device);
        this.settings = settingsFor(tier, device);
        this.governor = new Governor(
            this.settings.maxPixelRatio,
            this.settings,
        );
    }

    get tier() {
        return this.settings.tier;
    }

    get pixelRatio() {
        return this.governor.pixelRatio;
    }

    onChange(listener: (settings: QualitySettings) => void) {
        this.listeners.push(listener);
    }

    /** Called every frame with its duration; returns true if anything changed. */
    frame(ms: number) {
        const change = this.governor.frame(ms);
        if (!change) return false;
        if (change.tier) {
            if (this.forced || this.tier === 'low') {
                // Nothing lower to go to: stay at the floor resolution.
                return false;
            }
            this.settings = settingsFor(lowerTier(this.tier), this.device);
            this.governor.retier(this.settings);
        }
        this.listeners.forEach((listener) => listener(this.settings));
        return true;
    }
}
