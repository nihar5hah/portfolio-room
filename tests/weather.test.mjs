import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherFeed, describe } from '../server/weather.mjs';

const reading = (temp, code, isDay) => ({
    current: { temperature_2m: temp, weather_code: code, is_day: isDay },
});

test('both cities are read in one cached request and survive an outage', async () => {
    let calls = 0;
    let fail = false;
    let clock = 0;
    const feed = createWeatherFeed({
        now: () => clock,
        fetchImpl: async (url) => {
            calls++;
            assert.match(url, /latitude=23\.0225%2C12\.9716/);
            if (fail) return new Response('{}', { status: 500 });
            return Response.json([reading(31.4, 1, 1), reading(23.6, 61, 1)]);
        },
    });
    const first = await feed();
    assert.deepEqual(
        first.cities.map((c) => [c.name, c.temp, c.condition]),
        [
            ['Ahmedabad', 31, 'Partly cloudy'],
            ['Bengaluru', 24, 'Rain'],
        ],
    );
    await feed();
    assert.equal(calls, 1, 'cached for 15 minutes');
    clock += 16 * 60_000;
    fail = true;
    const stale = await feed();
    assert.equal(stale.stale, true, 'last good reading is kept when the provider fails');
    assert.equal(stale.cities[0].temp, 31);
    assert.equal(describe(0, false), 'Clear night');
    assert.equal(describe(95, true), 'Thunderstorm');
});
