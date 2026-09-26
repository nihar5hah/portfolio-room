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
    assert.equal(
        stale.stale,
        true,
        'last good reading is kept when the provider fails',
    );
    assert.equal(stale.cities[0].temp, 31);
    assert.equal(describe(0, false), 'Clear night');
    assert.equal(describe(95, true), 'Thunderstorm');
});

test('when Open-Meteo rate-limits (shared hosts), MET Norway answers instead', async () => {
    const { describeSymbol } = await import('../server/weather.mjs');
    assert.equal(describeSymbol('lightrainshowers_day'), 'Rain');
    assert.equal(describeSymbol('heavyrainandthunder'), 'Thunderstorm');
    assert.equal(describeSymbol('partlycloudy_night'), 'Partly cloudy');
    assert.equal(describeSymbol('clearsky_day'), 'Clear');
    const asked = [];
    const feed = createWeatherFeed({
        now: () => Date.parse('2026-09-26T16:30:00Z'), // 22:00 IST
        fetchImpl: async (url, options) => {
            asked.push(String(url));
            if (String(url).includes('open-meteo'))
                return new Response('slow down', { status: 429 });
            assert.match(options.headers['User-Agent'], /nihar-room/);
            return Response.json({
                properties: {
                    timeseries: [
                        {
                            data: {
                                instant: { details: { air_temperature: 21.6 } },
                                next_1_hours: {
                                    summary: { symbol_code: 'clearsky_night' },
                                },
                            },
                        },
                    ],
                },
            });
        },
    });
    const value = await feed();
    assert.equal(value.cities.length, 2);
    assert.deepEqual(
        value.cities.map((c) => [c.id, c.temp, c.condition, c.isDay]),
        [
            ['amd', 22, 'Clear night', false],
            ['blr', 22, 'Clear night', false],
        ],
    );
    assert.equal(asked.filter((u) => u.includes('api.met.no')).length, 2);
});
