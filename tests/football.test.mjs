import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    createBarcelonaFeed,
    normalizeMatch,
    selectMatch,
} from '../server/football.mjs';
import { createPortfolioServer } from '../server/index.mjs';

const now = Date.parse('2026-09-13T15:00Z');
const teams = [
    {
        homeAway: 'home',
        score: '0',
        team: { id: '1538', displayName: 'Levante', abbreviation: 'LEV' },
    },
    {
        homeAway: 'away',
        score: '2',
        team: { id: '83', displayName: 'Barcelona', abbreviation: 'BAR' },
    },
];
const fixture = (
    id = '401882883',
    date = '2026-09-13T14:15Z',
    state = 'in',
    slug = 'esp.1',
) => ({
    id,
    date,
    league: { slug, name: 'LALIGA' },
    competitions: [{ competitors: teams, status: { type: { state } } }],
});
// Small recorded-shaped example: actual goal coordinates are kept, formation dots are never invented.
const play = {
    id: '52356538',
    type: { type: 'goal' },
    shortText: 'Lamine Yamal Goal',
    clock: { value: 1099, displayValue: "19'" },
    team: { id: '83' },
    participants: [{ athlete: { displayName: 'Lamine Yamal' } }],
    fieldPositionX: 92.5,
    fieldPositionY: 49.8,
    fieldPosition2X: 100,
    fieldPosition2Y: 50.6,
};
const summary = {
    header: {
        id: '401882883',
        league: { name: 'LALIGA' },
        competitions: [
            {
                competitors: teams,
                status: { type: { state: 'in', shortDetail: "37'" } },
            },
        ],
    },
    keyEvents: [play],
    commentary: [
        {
            time: { displayValue: "19'" },
            text: 'Goal. Barcelona lead 2–0.',
            play,
        },
    ],
};

test('match discovery follows live fixtures across competitions and handles off days', () => {
    const next = fixture('222', '2026-09-16T19:30Z', 'pre');
    const previous = fixture('111', '2026-09-09T19:00Z', 'post');
    assert.equal(selectMatch([next, previous, fixture()], now).id, '401882883');
    assert.equal(selectMatch([next, previous], now).id, '222');
    assert.equal(
        selectMatch([fixture('333', '2026-09-13T14:15Z', 'post'), next], now)
            .id,
        '333',
    );
    assert.equal(
        selectMatch(
            [fixture('444', '2026-09-13T14:15Z', 'in', 'uefa.champions'), next],
            now,
        ).league.slug,
        'uefa.champions',
    );
    assert.equal(
        selectMatch([fixture('bad', 'no date', 'in', '../../host')], now),
        undefined,
    );
});

test('normalized scores and event coordinates preserve provenance and reject malformed data', () => {
    const match = normalizeMatch(summary, fixture(), now);
    assert.deepEqual(
        match.teams.map((t) => t.score),
        [0, 2],
    );
    assert.equal(match.clock, "37'");
    assert.equal(
        match.events.length,
        1,
        'duplicate commentary play is deduplicated',
    );
    assert.deepEqual(
        [match.events[0].x, match.events[0].y, match.events[0].end.x],
        [92.5, 49.8, 100],
    );
    assert.equal(match.tracking, 'event-locations');
    const bad = structuredClone(summary);
    bad.keyEvents[0].fieldPositionX = 999;
    bad.commentary = [];
    assert.equal(normalizeMatch(bad, fixture(), now).events.length, 0);
    bad.header.competitions[0].competitors[1].score = 'unknown';
    assert.throws(() => normalizeMatch(bad, fixture(), now));
    assert.throws(() => normalizeMatch(summary, fixture('999'), now));
});

test('live feed coalesces requests, caches, marks failures stale, and recovers', async () => {
    let time = now,
        calls = 0,
        failing = false;
    const read = createBarcelonaFeed({
        now: () => time,
        fetchImpl: async (url) => {
            calls++;
            if (failing) throw new Error('offline');
            return {
                ok: true,
                json: async () =>
                    url.includes('/summary?')
                        ? summary
                        : { events: [fixture()] },
            };
        },
    });
    const [first, same] = await Promise.all([read(), read()]);
    assert.equal(first, same);
    assert.equal(calls, 3);
    await read();
    assert.equal(calls, 3);
    time += 21000;
    failing = true;
    const stale = await read();
    assert.equal(stale.stale, true);
    assert.equal(stale.updatedAt, first.updatedAt);
    await read();
    assert.equal(calls, 4, 'failed provider is not hammered');
    time += 21000;
    failing = false;
    const fresh = await read();
    assert.equal(fresh.stale, false);
    assert.notEqual(fresh.updatedAt, first.updatedAt);
});

test('match API exposes an explicit outage instead of fake live scores', async () => {
    const server = createPortfolioServer({
        fetchImpl: async () => {
            throw new Error('offline');
        },
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const response = await fetch(base + '/api/barcelona');
        assert.equal(response.status, 503);
        assert.equal(
            (await response.json()).error,
            'Live match data is temporarily unavailable.',
        );
        assert.equal(
            (await fetch(base + '/api/barcelona', { method: 'POST' })).status,
            405,
        );
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
