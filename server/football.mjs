// ESPN's public scoreboard provides event coordinates, not continuous player tracking.
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
// Standings live on a different ESPN base than the scoreboard. Always the
// domestic table: it is the one competition running the whole season, so it
// says something on any day of the year.
const STANDINGS =
    'https://site.api.espn.com/apis/v2/sports/soccer/esp.1/standings';
const TEAM = '83';
const text = (value, length = 160) =>
    typeof value === 'string' ? value.slice(0, length) : '';
const coordinate = (value) =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100;
const competition = (event) => event?.competitions?.[0];
const isBarcelona = (event) =>
    competition(event)?.competitors?.some((c) => c.team?.id === TEAM);

export function selectMatch(events, now) {
    const matches = events.filter(
        (e) =>
            isBarcelona(e) &&
            /^\d+$/.test(e.id) &&
            /^[a-z0-9.]+$/.test(e.league?.slug) &&
            Number.isFinite(Date.parse(e.date)),
    );
    const ascending = matches.sort(
        (a, b) => Date.parse(a.date) - Date.parse(b.date),
    );
    return (
        ascending.find((e) => competition(e).status?.type?.state === 'in') ||
        [...ascending]
            .reverse()
            .find(
                (e) =>
                    Date.parse(e.date) <= now &&
                    now - Date.parse(e.date) < 86400000,
            ) ||
        ascending.find((e) => Date.parse(e.date) > now) ||
        ascending.at(-1)
    );
}

export function normalizeStandings(payload) {
    const table = payload?.children?.[0]?.standings;
    const entries = Array.isArray(table?.entries) ? table.entries : [];
    const stat = (entry, name) => {
        const found = entry.stats?.find((s) => s.name === name);
        const value = Number(found?.value ?? found?.displayValue);
        return Number.isFinite(value) ? value : null;
    };
    const rows = entries
        .map((entry) => ({
            rank: stat(entry, 'rank'),
            id: text(entry.team?.id),
            name: text(entry.team?.shortDisplayName || entry.team?.name, 30),
            played: stat(entry, 'gamesPlayed'),
            wins: stat(entry, 'wins'),
            draws: stat(entry, 'ties'),
            losses: stat(entry, 'losses'),
            goalDifference: stat(entry, 'pointDifferential'),
            points: stat(entry, 'points'),
        }))
        .filter((row) => row.rank && row.name && row.points !== null)
        .sort((a, b) => a.rank - b.rank);
    if (!rows.some((row) => row.id === TEAM))
        throw new Error('Invalid standings');
    return {
        competition: text(payload.name || 'Spanish LALIGA', 70),
        rows,
    };
}

export function normalizeMatch(summary, fixture, now) {
    const game = summary.header?.competitions?.[0];
    if (
        !game ||
        String(summary.header.id) !== fixture.id ||
        !game.competitors?.some((c) => c.team?.id === TEAM)
    )
        throw new Error('Invalid match');
    const state = game.status?.type?.state;
    if (!['pre', 'in', 'post'].includes(state))
        throw new Error('Invalid match state');
    const teams = ['home', 'away'].map((side) => {
        const entry = game.competitors.find((c) => c.homeAway === side);
        const score =
            typeof entry?.score === 'object'
                ? entry.score.displayValue
                : entry?.score;
        if (
            !entry?.team?.displayName ||
            (state !== 'pre' && !/^\d+$/.test(String(score)))
        )
            throw new Error('Invalid score');
        return {
            id: text(entry.team.id),
            name: text(entry.team.displayName, 60),
            abbreviation: text(entry.team.abbreviation, 8),
            score: state === 'pre' ? null : Number(score),
        };
    });
    const events = new Map();
    for (const play of [
        ...(summary.keyEvents || []),
        ...(summary.commentary || []).map((c) => c.play).filter(Boolean),
    ]) {
        if (
            !play.id ||
            !coordinate(play.fieldPositionX) ||
            !coordinate(play.fieldPositionY)
        )
            continue;
        const team = teams.find(
            (t) => t.id === play.team?.id || t.name === play.team?.displayName,
        );
        events.set(String(play.id), {
            id: String(play.id),
            minute: text(play.clock?.displayValue, 20),
            seconds: Number(play.clock?.value) || 0,
            type: text(play.type?.type, 40),
            label: text(play.shortText || play.text),
            team: team?.id || null,
            player: text(play.participants?.[0]?.athlete?.displayName, 60),
            x: play.fieldPositionX,
            y: play.fieldPositionY,
            end:
                coordinate(play.fieldPosition2X) &&
                coordinate(play.fieldPosition2Y)
                    ? { x: play.fieldPosition2X, y: play.fieldPosition2Y }
                    : null,
        });
    }
    return {
        id: fixture.id,
        competition: text(
            summary.header.league?.name || fixture.league.name,
            70,
        ),
        kickoff: fixture.date,
        state,
        clock: text(
            game.status.type.shortDetail ||
                game.status.displayClock ||
                game.status.type.description,
            40,
        ),
        teams,
        events: [...events.values()]
            .sort((a, b) => a.seconds - b.seconds)
            .slice(-30),
        commentary: (summary.commentary || [])
            .filter((c) => typeof c.text === 'string')
            .slice(-4)
            .reverse()
            .map((c) => ({
                minute: text(c.time?.displayValue, 20),
                text: text(c.text, 250),
            })),
        source: 'ESPN',
        sourceUrl: `https://www.espn.com/soccer/match/_/gameId/${fixture.id}`,
        updatedAt: new Date(now).toISOString(),
        stale: false,
        tracking: 'event-locations',
    };
}

export function createBarcelonaFeed({
    fetchImpl = fetch,
    now = Date.now,
} = {}) {
    let fixtures = [],
        fixturesAt = -Infinity,
        cached,
        table,
        tableAt = -Infinity,
        lastAttempt = -Infinity,
        pending;
    async function get(path) {
        const url = path.startsWith('http') ? path : `${BASE}/${path}`;
        const response = await fetchImpl(url, {
            signal: AbortSignal.timeout(8000),
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error('Match provider unavailable');
        return response.json();
    }
    // The table only moves on a matchday, and it is the screen's filler rather
    // than its headline, so a stale one is better than a failed match payload:
    // any error here keeps the last table and leaves the match alone.
    async function standings() {
        if (now() - tableAt < 600000) return table;
        tableAt = now();
        try {
            table = normalizeStandings(await get(STANDINGS));
        } catch {
            /* keep whatever table we already had */
        }
        return table;
    }
    async function refresh() {
        try {
            if (now() - fixturesAt >= 120000) {
                const [next, previous] = await Promise.all([
                    get(`all/teams/${TEAM}/schedule?fixture=true`),
                    get(`all/teams/${TEAM}/schedule`),
                ]);
                if (
                    !Array.isArray(next.events) ||
                    !Array.isArray(previous.events)
                )
                    throw new Error('Invalid schedule');
                fixtures = [
                    ...new Map(
                        [...previous.events, ...next.events].map((e) => [
                            e.id,
                            e,
                        ]),
                    ).values(),
                ];
                fixturesAt = now();
            }
            const fixture = selectMatch(fixtures, now());
            if (!fixture) throw new Error('No Barcelona fixture available');
            const summary = await get(
                `${fixture.league.slug}/summary?event=${fixture.id}`,
            );
            cached = normalizeMatch(summary, fixture, now());
        } catch {
            if (cached) cached = { ...cached, stale: true };
            else throw new Error('Live match data is temporarily unavailable.');
        }
        // A match that isn't being played leaves the pitch panel empty, so the
        // league table goes there instead. Skipped while play is live.
        cached = {
            ...cached,
            table: cached.state === 'in' ? null : await standings(),
        };
        return cached;
    }
    return function read() {
        if (pending) return pending;
        if (now() - lastAttempt < 20000)
            return cached
                ? Promise.resolve(cached)
                : Promise.reject(
                      new Error('Live match data is temporarily unavailable.'),
                  );
        lastAttempt = now();
        pending = refresh().finally(() => {
            pending = null;
        });
        return pending;
    };
}
