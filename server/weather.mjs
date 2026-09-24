// Current weather for the two cities Nihar splits his time between.
// Open-Meteo needs no key; one request covers both, cached for 15 minutes,
// and the last good reading is served (marked stale) if the provider fails.
export const CITIES = [
    { id: 'amd', name: 'Ahmedabad', note: 'home', lat: 23.0225, lon: 72.5714 },
    { id: 'blr', name: 'Bengaluru', note: 'internship', lat: 12.9716, lon: 77.5946 },
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
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
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
                    condition: describe(Number(current.weather_code), current.is_day === 1),
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
