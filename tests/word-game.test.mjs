import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function loadGame() {
    const ts = require('typescript');
    const load = (file) => {
        const exports = {};
        new Function(
            'require',
            'exports',
            ts.transpileModule(
                fs.readFileSync(
                    new URL(
                        `../desktop/src/components/wordle/${file}`,
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
        )((name) => load(`${name.slice(2)}.ts`), exports);
        return exports;
    };
    return {
        ...load('Game.ts'),
        ANSWERS: load('Answers.ts').default,
        WORDS: load('Words.ts').default,
    };
}

test('the word game has many answers, scores repeated letters correctly and keeps stats', () => {
    const g = loadGame();
    // Many different, valid answers; not one fixed word.
    assert.ok(g.ANSWERS.length > 500, `${g.ANSWERS.length} answers`);
    assert.equal(new Set(g.ANSWERS).size, g.ANSWERS.length, 'no repeats');
    for (const word of g.ANSWERS) {
        assert.match(word, /^[a-z]{5}$/);
        assert.ok(g.isWord(word), `${word} is guessable`);
    }
    assert.ok(g.isWord('pupal') && !g.isWord('zzzzz'));
    // Scoring, including the cases the old game got wrong.
    const s = (guess, answer) =>
        g
            .score(guess, answer)
            .map((m) => m[0])
            .join('');
    assert.equal(s('CRANE', 'CRANE'), 'ccccc');
    assert.equal(s('LLAMA', 'HELLO'), 'ppaaa', 'two Ls in HELLO: both yellow');
    assert.equal(
        s('HELLO', 'LLAMA'),
        'aappa',
        'LLAMA has two Ls: both yellow, E and H grey',
    );
    assert.equal(s('SPEED', 'ABIDE'), 'aapap', 'one E in ABIDE: one yellow E');
    assert.equal(
        s('EERIE', 'THEME'),
        'paaac',
        'green E used first, one yellow left',
    );
    assert.equal(
        s('ROBOT', 'FLOOR'),
        'ppaca',
        'R and the first O yellow, second O green',
    );
    // Keyboard hints keep the best result per letter.
    const hints = g.letterHints(['ALERT', 'LATER'], 'LEAST');
    assert.equal(hints.L, 'correct');
    assert.equal(hints.R, 'absent');
    // A different daily word each day, cycling through the whole list.
    const days = Array.from({ length: g.ANSWERS.length }, (_, d) =>
        g.dailyWord(d),
    );
    assert.equal(
        new Set(days).size,
        g.ANSWERS.length,
        'every answer once per cycle',
    );
    assert.notEqual(g.dailyWord(100), g.dailyWord(101));
    assert.equal(
        g.dailyWord(5),
        g.dailyWord(5),
        'same word for everyone that day',
    );
    assert.equal(g.dayNumber(new Date(2026, 0, 1, 23, 59)), 0);
    assert.equal(g.dayNumber(new Date(2026, 0, 2, 0, 1)), 1);
    // Unlimited mode avoids recent answers.
    let i = 0;
    const seq = [0, 0, 0.5];
    const pick = g.randomWord([g.ANSWERS[0].toUpperCase()], () => seq[i++ % 3]);
    assert.notEqual(pick, g.ANSWERS[0].toUpperCase());
    // Stats: daily counts once, streaks follow consecutive days.
    let stats = g.emptyStats();
    stats = g.record(stats, { won: true, tries: 3, daily: 10 });
    stats = g.record(stats, { won: true, tries: 3, daily: 10 });
    assert.equal(stats.played, 1, 'finishing today twice counts once');
    stats = g.record(stats, { won: true, tries: 4, daily: 11 });
    assert.equal(stats.streak, 2);
    stats = g.record(stats, { won: true, tries: 2, daily: 13 });
    assert.equal(stats.streak, 1, 'a skipped day restarts the streak');
    assert.equal(stats.best, 2);
    stats = g.record(stats, { won: false, tries: 6, daily: 14 });
    assert.equal(stats.streak, 0);
    stats = g.record(stats, { won: true, tries: 5, daily: null });
    assert.equal(stats.played, 5);
    assert.equal(stats.won, 4);
    assert.deepEqual(stats.spread, [0, 1, 1, 1, 1, 0]);
    assert.equal(
        g.shareText(['CRANE', 'LEAST'], 'LEAST', 'Word game #12'),
        'Word game #12 2/6\n\n⬛⬛🟩⬛🟨\n🟩🟩🟩🟩🟩',
    );
});
