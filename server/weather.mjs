// Current weather for the two cities Nihar splits his time between.
// Open-Meteo needs no key; one request covers both, cached for 15 minutes,
// and the last good reading is served (marked stale) if the provider fails.
// Open-Meteo limits by IP, and shared hosts (Render's free tier) hit that
// limit; MET Norway, which limits by User-Agent instead, is the fallback.
export const CITIES = [
    { id: 'amd', name: 'Ahmedabad', note: 'home', lat: 23.0225, lon: 72.5714 },
    {
        id: 'blr',
        name: 'Bengaluru',
        note: 'internship',
        lat: 12.9716,
        lon: 77.5946,
    },
];

// WMO weather codes, collapsed to the handful a small readout needs.
export function describe(code, isDay) {
    if (code === 0) return isDay ? 'Clear' : 'Clear night';
    if (code <= 2) return 'Partly cloudy';
    if (code === 3) return 'Cloudy';
    if (code <= 48) return 'Fog';
    if (code <= 57) return 'Drizzle';
    if (code <= 67 || (code >= 80 && code <= 82)) return 'Rain';
    if (code <= 77 || code === 85 || code === 86) return 'Snow';
    if (code >= 95) return 'Thunderstorm';
    return 'Cloudy';
}

/** MET Norway symbol codes (e.g. "lightrainshowers_day") to the readout. */
export function describeSymbol(symbol) {
    const base = String(symbol || '').replace(
        /_(day|night|polartwilight)$/,
        '',
    );
    if (base.includes('thunder')) return 'Thunderstorm';
    if (base.includes('snow') || base.includes('sleet')) return 'Snow';
    if (base.includes('rain')) return 'Rain';
    if (base === 'fog') return 'Fog';
    if (base === 'clearsky') return 'Clear';
    if (base === 'fair' || base === 'partlycloudy') return 'Partly cloudy';
    return 'Cloudy';
}

/** Is it daytime in India (IST) at this moment? Roughly 06:00–18:30. */
function daytimeIST(ms) {
    const minutes =
        (new Date(ms).getUTCHours() * 60 + new Date(ms).getUTCMinutes() + 330) %
        1440;
    return minutes >= 360 && minutes < 1110;
}

export function createWeatherFeed({ fetchImpl = fetch, now = Date.now } = {}) {
    let cached = null;
    let pending = null;
    const url =
        'https://api.open-meteo.com/v1/forecast?' +
        new URLSearchParams({
            latitude: CITIES.map((c) => c.lat).join(','),
            longitude: CITIES.map((c) => c.lon).join(','),
            current: 'temperature_2m,weather_code,is_day',
            timezone: 'Asia/Kolkata',
        });
    async function load() {
        try {
            return await loadOpenMeteo();
        } catch (error) {
            try {
                return await loadMetNorway();
            } catch {
                throw error;
            }
        }
    }
    async function loadMetNorway() {
        const cities = await Promise.all(
            CITIES.map(async ({ id, name, note, lat, lon }) => {
                const response = await fetchImpl(
                    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`,
                    {
                        signal: AbortSignal.timeout(8000),
                        // Required by MET Norway's terms: identify the app.
                        headers: {
                            'User-Agent':
                                'nihar-room/1.0 github.com/nihar5hah/portfolio-room niharshah0405@gmail.com',
                        },
                    },
                );
                if (!response.ok) throw new Error(`met.no ${response.status}`);
                const data = await response.json();
                const step = data?.properties?.timeseries?.[0]?.data;
                const temp = Number(step?.instant?.details?.air_temperature);
                if (!Number.isFinite(temp)) throw new Error('met.no value');
                const symbol = step?.next_1_hours?.summary?.symbol_code;
                const isDay = daytimeIST(now());
                let condition = describeSymbol(symbol);
                if (condition === 'Clear' && !isDay) condition = 'Clear night';
                return {
                    id,
                    name,
                    note,
                    temp: Math.round(temp),
                    condition,
                    isDay,
                };
            }),
        );
        return { cities, updated: new Date(now()).toISOString(), stale: false };
    }
    async function loadOpenMeteo() {
        const response = await fetchImpl(url, {
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error(`weather ${response.status}`);
        const data = await response.json();
        const rows = Array.isArray(data) ? data : [data];
        if (rows.length !== CITIES.length) throw new Error('weather shape');
        return {
            cities: CITIES.map(({ id, name, note }, i) => {
                const current = rows[i].current;
                const temp = Number(current?.temperature_2m);
                if (!Number.isFinite(temp)) throw new Error('weather value');
                return {
                    id,
                    name,
                    note,
                    temp: Math.round(temp),
                    condition: describe(
                        Number(current.weather_code),
                        current.is_day === 1,
                    ),
                    isDay: current.is_day === 1,
                };
            }),
            updated: new Date(now()).toISOString(),
            stale: false,
        };
    }
    return async function weather() {
        if (cached && now() - cached.at < 15 * 60_000) return cached.value;
        pending ??= load()
            .then((value) => {
                cached = { at: now(), value };
                return value;
            })
            .catch((error) => {
                if (cached) return { ...cached.value, stale: true };
                throw error;
            })
            .finally(() => (pending = null));
        return pending;
    };
}
