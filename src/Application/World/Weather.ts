import bus from '../UI/EventBus';

/**
 * Bangalore's weather for the window: the same Open-Meteo reading the lock
 * screen shows (`/api/weather`, cached server-side for 15 minutes), boiled
 * down to how hard it is raining and whether there is a storm. `?weather=`
 * (`rain`, `drizzle`, `storm` or `clear`) overrides it for checking.
 *
 * The room eases toward the reading: `level` climbs to the target over a
 * few seconds, so a shower arriving mid-visit rolls in rather than snapping.
 */
export interface WeatherState {
    /** 0 dry → 1 heavy rain. */
    rain: number;
    /** Thunder and lightning. */
    storm: boolean;
    /** Grey sky, 0–1 (cloudy days without rain are overcast too). */
    overcast: number;
    /** What the reading said, for labels. */
    condition: string;
    temp: number | null;
}

export const DRY: WeatherState = {
    rain: 0,
    storm: false,
    overcast: 0,
    condition: '',
    temp: null,
};

/** A reading's condition (server/weather.mjs `describe`) as rain and cloud. */
export function weatherOf(condition: string, temp: number | null = null) {
    const c = condition.toLowerCase();
    const state: WeatherState = { ...DRY, condition, temp };
    if (c.includes('thunder')) {
        state.rain = 1;
        state.storm = true;
        state.overcast = 1;
    } else if (c.includes('rain')) {
        state.rain = 0.75;
        state.overcast = 0.85;
    } else if (c.includes('drizzle')) {
        state.rain = 0.35;
        state.overcast = 0.7;
    } else if (c.includes('fog')) state.overcast = 0.6;
    else if (c === 'cloudy') state.overcast = 0.5;
    else if (c.includes('partly')) state.overcast = 0.2;
    return state;
}

const OVERRIDES: Record<string, string> = {
    rain: 'Rain',
    drizzle: 'Drizzle',
    storm: 'Thunderstorm',
    thunderstorm: 'Thunderstorm',
    clear: 'Clear',
    cloudy: 'Cloudy',
};

export default class Weather {
    target: WeatherState = DRY;
    /** Eased rain and cloud the room actually shows. */
    level = { rain: 0, overcast: 0 };
    /** 0–1 brightness of the current lightning flash. */
    flash = 0;
    nextFlash = 8;
    flashes: number[] = [];
    timer: ReturnType<typeof setInterval> | undefined;

    constructor(start = true) {
        const query =
            typeof location !== 'undefined'
                ? new URLSearchParams(location.search).get('weather')
                : null;
        const forced = query && OVERRIDES[query.toLowerCase()];
        if (forced) {
            this.set(weatherOf(forced));
            // Checking a look: start there rather than easing in.
            this.level = {
                rain: this.target.rain,
                overcast: this.target.overcast,
            };
            return;
        }
        if (!start) return;
        void this.load();
        this.timer = setInterval(() => void this.load(), 15 * 60_000);
    }

    async load() {
        try {
            const response = await fetch('/api/weather', {
                signal: AbortSignal.timeout(10_000),
            });
            if (!response.ok) return;
            const data = await response.json();
            const city = data?.cities?.find(
                (c: { id?: string }) => c?.id === 'blr',
            );
            if (city && typeof city.condition === 'string')
                this.set(
                    weatherOf(
                        city.condition,
                        Number.isFinite(city.temp) ? city.temp : null,
                    ),
                );
        } catch {
            // Weather is decoration: a failed reading leaves the sky as it is.
        }
    }

    set(state: WeatherState) {
        this.target = state;
        // Deferred, so listeners built after the room (the audio) hear it too.
        setTimeout(() => bus.dispatch('weather', state), 0);
    }

    /**
     * Advance by `dt` seconds. Returns true on the frame a lightning bolt
     * strikes (the room plays thunder a moment later).
     */
    update(dt: number, random: () => number = Math.random) {
        const ease = (from: number, to: number) => {
            const next = from + (to - from) * Math.min(1, dt * 0.4);
            return Math.abs(to - next) < 0.002 ? to : next;
        };
        this.level.rain = ease(this.level.rain, this.target.rain);
        this.level.overcast = ease(this.level.overcast, this.target.overcast);
        // Lightning: a double or triple flicker every 12–35 s in a storm.
        this.flash = Math.max(0, this.flash - dt * 6);
        let struck = false;
        if (this.target.storm) {
            this.nextFlash -= dt;
            if (this.nextFlash <= 0) {
                this.nextFlash = 12 + random() * 23;
                this.flashes = [0, 0.12 + random() * 0.1];
                if (random() < 0.5) this.flashes.push(0.35 + random() * 0.2);
                struck = true;
            }
        }
        this.flashes = this.flashes.map((t) => t - dt);
        while (this.flashes.length && this.flashes[0] <= 0) {
            this.flashes.shift();
            this.flash = 0.7 + random() * 0.3;
        }
        return struck;
    }

    /** Short text for the window's label, e.g. "Bengaluru · 23° · Rain". */
    describe() {
        const { condition, temp } = this.target;
        if (!condition) return 'Bengaluru';
        return `Bengaluru · ${temp === null ? '' : `${temp}° · `}${condition}`;
    }
}
