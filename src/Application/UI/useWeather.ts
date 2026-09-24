import { useEffect, useState } from 'react';

export type CityWeather = {
    id: string;
    name: string;
    note: string;
    temp: number;
    condition: string;
    isDay: boolean;
};

/** Ahmedabad (home) and Bengaluru (internship), refreshed every 15 minutes. */
export default function useWeather() {
    const [cities, setCities] = useState<CityWeather[]>([]);
    useEffect(() => {
        let alive = true;
        const load = () =>
            fetch('/api/weather')
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => alive && data?.cities && setCities(data.cities))
                .catch(() => undefined); // weather is decoration; never an error state
        load();
        const id = setInterval(load, 15 * 60_000);
        return () => {
            alive = false;
            clearInterval(id);
        };
    }, []);
    return cities;
}
