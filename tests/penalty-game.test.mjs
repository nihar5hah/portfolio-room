import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function loadPenalty() {
    const ts = require('typescript');
    const exports = {};
    new Function(
        'require',
        'exports',
        ts.transpileModule(
            fs.readFileSync(
                new URL(
                    '../src/Application/UI/components/penalty.ts',
                    import.meta.url,
                ),
                'utf8',
            ),
            {
                compilerOptions: {
                    module: ts.ModuleKind.CommonJS,
                    target: ts.ScriptTarget.ES2022,
                },
            },
        ).outputText,
    )(require, exports);
    return exports;
}

const p = loadPenalty();

/** Tally outcomes of many seeded shots at one aim point. */
function tally(aim, n = 4000, seed = 7) {
    const rng = p.seeded(seed);
    const counts = { goal: 0, saved: 0, wide: 0, over: 0, post: 0 };
    for (let i = 0; i < n; i++) counts[p.shoot(aim, rng).outcome]++;
    for (const k of Object.keys(counts)) counts[k] /= n;
    return counts;
}

test('a seeded rng gives the same penalty every time', () => {
    const aims = [
        { x: 0.7, y: 0.4 },
        { x: -0.9, y: 0.9 },
        { x: 0, y: 0.1 },
    ];
    const run = (seed) => {
        const rng = p.seeded(seed);
        return aims.map((aim) => p.shoot(aim, rng));
    };
    assert.deepEqual(run(42), run(42));
    assert.notDeepEqual(run(42), run(43));
    for (const r of run(42)) {
        assert.ok(
            ['goal', 'saved', 'wide', 'over', 'post'].includes(r.outcome),
        );
        assert.ok([-1, 0, 1].includes(r.dive));
        assert.ok(Number.isFinite(r.ball.x) && r.ball.y >= 0);
    }
    // A scripted rng pins every draw: no error, dive right, save roll 0.99.
    const script = (values) => {
        let i = 0;
        return () => values[i++ % values.length];
    };
    // u = 1 makes the Box-Muller radius 0: the ball goes exactly where aimed.
    const exact = p.shoot({ x: -0.6, y: 0.5 }, script([1, 0, 0.99, 0.99]));
    assert.deepEqual(exact.ball, { x: -0.6, y: 0.5 });
    assert.equal(exact.dive, 1, 'keeper went the wrong way');
    assert.equal(exact.outcome, 'goal');
});

test('the keeper saves a centre shot when he stays in the middle', () => {
    const rng = p.seeded(3);
    let saved = 0;
    for (let i = 0; i < 500; i++)
        if (p.shoot({ x: 0, y: 0.35 }, rng, { dive: 0 }).outcome === 'saved')
            saved++;
    assert.ok(saved / 500 > 0.85, `saved ${saved}/500`);
    assert.ok(p.saveChance({ x: 0, y: 0.35 }, 0) > 0.9);
    assert.equal(p.saveChance({ x: 0.9, y: 0.9 }, 0), 0, 'nowhere near');
    assert.equal(p.saveChance({ x: -0.9, y: 0.9 }, 1), 0, 'wrong way');
    assert.ok(p.saveChance({ x: 0.6, y: 0.4 }, 1) > 0.6, 'right way');
    // Centre-low is the worst spot overall.
    assert.ok(tally({ x: 0, y: 0.15 }).saved > 0.5);
});

test('top corners are rarely saved but often missed', () => {
    for (const aim of [
        { x: 0.85, y: 0.85 },
        { x: -0.85, y: 0.85 },
    ]) {
        const t = tally(aim);
        const missed = t.wide + t.over + t.post;
        assert.ok(t.goal + missed > 0.93, `mostly goals or misses: ${t.saved}`);
        assert.ok(t.saved < 0.07, `rarely saved: ${t.saved}`);
        assert.ok(missed > 0.2 && missed < 0.4, `missed ${missed}`);
    }
    // Aiming outside the frame almost always misses.
    assert.ok(tally({ x: 1.25, y: 0.5 }, 500).goal < 0.1);
    assert.ok(tally({ x: 0, y: 1.3 }, 500).goal < 0.1);
    assert.ok(tally({ x: 0, y: 1.3 }, 500).over > 0.9);
});

test('frame edges: wide, over and off the post', () => {
    assert.equal(p.frameOutcome({ x: 0.5, y: 0.5 }), 'in');
    assert.equal(p.frameOutcome({ x: 1.0, y: 0.5 }), 'post');
    assert.equal(p.frameOutcome({ x: -1.0, y: 0.5 }), 'post');
    assert.equal(p.frameOutcome({ x: 0.2, y: 1.0 }), 'post', 'crossbar');
    assert.equal(p.frameOutcome({ x: 1.2, y: 0.5 }), 'wide');
    assert.equal(p.frameOutcome({ x: 0.2, y: 1.2 }), 'over');
    assert.equal(p.frameOutcome({ x: 1.3, y: 1.06 }), 'wide');
    assert.deepEqual(p.clampAim({ x: 9, y: -3 }), { x: 1.25, y: 0 });
    const centre = p.spread({ x: 0, y: 0.2 });
    const corner = p.spread({ x: 0.9, y: 0.9 });
    assert.ok(corner.x > centre.x * 2 && corner.y > centre.y * 2);
});

test('a sensible player scores about 3-4 of 5', () => {
    const rng = p.seeded(11);
    let total = 0;
    const matches = 2000;
    for (let m = 0; m < matches; m++) {
        let match = p.newMatch();
        while (!p.isOver(match)) {
            const side = rng() < 0.5 ? -1 : 1;
            const aim = {
                x: side * (0.55 + rng() * 0.3),
                y: 0.15 + rng() * 0.7,
            };
            match = p.record(
                match,
                p.shoot(aim, rng, { history: p.history(match) }),
            );
        }
        total += p.score(match);
    }
    const avg = total / matches;
    assert.ok(avg > 3 && avg < 4, `average ${avg}`);
});

test('a match is five shots and keeps the score', () => {
    let match = p.newMatch();
    assert.equal(p.score(match), 0);
    assert.equal(p.isOver(match), false);
    const shot = (outcome) => ({
        outcome,
        aim: { x: 0.5, y: 0.5 },
        ball: { x: 0.5, y: 0.5 },
        dive: 0,
    });
    const outcomes = ['goal', 'saved', 'goal', 'post', 'goal'];
    for (const [i, o] of outcomes.entries()) {
        const before = match;
        match = p.record(match, shot(o));
        assert.equal(before.shots.length, i, 'record does not mutate');
        assert.equal(match.shots.length, i + 1);
        assert.equal(p.isOver(match), i === 4);
    }
    assert.equal(p.score(match), 3);
    assert.equal(p.record(match, shot('goal')), match, 'no sixth shot');
    assert.equal(p.history(match).length, 5);
    assert.equal(p.SHOTS, 5);
    assert.equal(p.OUTCOME_TEXT.post, 'Off the post');
    assert.equal(p.OUTCOME_TEXT.over, 'Over the bar');
});

test('the best score persists and survives garbage storage', () => {
    const memory = () => {
        const data = new Map();
        return {
            data,
            getItem: (k) => (data.has(k) ? data.get(k) : null),
            setItem: (k, v) => data.set(k, String(v)),
        };
    };
    const s = memory();
    assert.equal(p.loadBest(s), 0);
    assert.equal(p.saveBest(s, 3), 3);
    assert.equal(s.data.get('nihar-ps5-penalty-best'), '3');
    assert.equal(p.saveBest(s, 2), 3, 'a worse score keeps the best');
    assert.equal(p.loadBest(s), 3);
    assert.equal(p.saveBest(s, 5), 5);
    assert.equal(p.saveBest(s, 99), 5, 'clamped to five');
    for (const junk of ['banana', '-1', '7', '2.5', '', '{}', 'NaN', '1e1']) {
        s.data.set(p.BEST_KEY, junk);
        assert.equal(p.loadBest(s), 0, `junk ${JSON.stringify(junk)}`);
    }
    assert.equal(p.saveBest(s, 4), 4, 'junk is overwritten');
    const broken = {
        getItem() {
            throw new Error('denied');
        },
        setItem() {
            throw new Error('full');
        },
    };
    assert.equal(p.loadBest(broken), 0);
    assert.equal(p.saveBest(broken, 2), 2);
    assert.equal(p.loadBest(null), 0);
    assert.equal(p.saveBest(undefined, 4), 4);
});
