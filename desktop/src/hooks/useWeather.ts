import { useEffect, useState } from 'react';

export type CityWeather = {
    id: string;
    name: string;
    note: string;
    temp: number;
    condition: string;
    isDay: boolean;
};

const REFRESH = 15 * 60_000;

/**
 * Ahmedabad (home) and Bengaluru (internship), refreshed every 15 minutes
 * while the page is visible; a tab that comes back after longer catches up.
 */
export default function useWeather() {
    const [cities, setCities] = useState<CityWeather[]>([]);
    useEffect(() => {
        let alive = true;
        let loaded = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const load = () =>
            fetch('/api/weather')
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => alive && data?.cities && setCities(data.cities))
                .catch(() => undefined); // weather is decoration; never an error state
        const schedule = () => {
            clearTimeout(timer);
            if (document.visibilityState === 'hidden') return;
            const wait = loaded + REFRESH - Date.now();
            if (wait <= 0) {
                loaded = Date.now();
                void load();
            }
            timer = setTimeout(schedule, wait > 0 ? wait : REFRESH);
        };
        schedule();
        document.addEventListener('visibilitychange', schedule);
        return () => {
            alive = false;
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', schedule);
        };
    }, []);
    return cities;
}
