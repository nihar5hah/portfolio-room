/**
 * Word game rules, kept free of React so they can be tested: Wordle scoring
 * (with repeated letters handled correctly), the daily word, keyboard hints,
 * and stats saved in the browser.
 */
import ANSWERS from './Answers';
import WORDS from './Words';

export type Mark = 'correct' | 'present' | 'absent';
export const LENGTH = 5;
export const TRIES = 6;

const VALID = new Set(WORDS);
for (const word of ANSWERS) VALID.add(word);

export const isWord = (guess: string) => VALID.has(guess.toLowerCase());

/**
 * Colour a guess against the answer. Greens first; then each remaining
 * letter is yellow only while the answer still has an unmatched copy of it,
 * so guessing "LLAMA" against "HELLO" gives one green L and one yellow L,
 * not two yellows.
 */
export function score(guess: string, answer: string): Mark[] {
    const g = guess.toLowerCase(),
        a = answer.toLowerCase();
    const marks: Mark[] = Array(g.length).fill('absent');
    const left: Record<string, number> = {};
    for (let i = 0; i < a.length; i++) {
        if (g[i] === a[i]) marks[i] = 'correct';
        else left[a[i]] = (left[a[i]] ?? 0) + 1;
    }
    for (let i = 0; i < g.length; i++) {
        if (marks[i] === 'correct') continue;
        if (left[g[i]]) {
            marks[i] = 'present';
            left[g[i]]--;
        }
    }
    return marks;
}

/** The best thing learned about each letter so far, for the keyboard. */
export function letterHints(guesses: string[], answer: string) {
    const rank = { absent: 0, present: 1, correct: 2 };
    const hints: Record<string, Mark> = {};
    for (const guess of guesses)
        score(guess, answer).forEach((mark, i) => {
            const letter = guess[i].toUpperCase();
            if (!hints[letter] || rank[mark] > rank[hints[letter]])
                hints[letter] = mark;
        });
    return hints;
}

/** Days since the first puzzle, in the visitor's own calendar. */
export function dayNumber(date = new Date()) {
    const start = Date.UTC(2026, 0, 1);
    const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.floor((today - start) / 86400000);
}

/**
 * The daily word: the same for everyone on the same date, walking the list
 * in a fixed shuffled order so consecutive days never feel related.
 */
export function dailyWord(day = dayNumber()) {
    const n = ANSWERS.length;
    // A stride coprime with the list length visits every word once per cycle.
    let stride = 409;
    while (gcd(stride, n) !== 1) stride++;
    const i = (((day * stride + 137) % n) + n) % n;
    return ANSWERS[i].toUpperCase();
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** A random word for unlimited play, avoiding the last few answers. */
export function randomWord(avoid: string[] = [], random = Math.random) {
    for (let tries = 0; tries < 50; tries++) {
        const word =
            ANSWERS[Math.floor(random() * ANSWERS.length)].toUpperCase();
        if (!avoid.includes(word)) return word;
    }
    return ANSWERS[0].toUpperCase();
}

export interface Stats {
    played: number;
    won: number;
    streak: number;
    best: number;
    /** Wins by number of guesses, 1–6. */
    spread: number[];
    /** Last daily puzzle finished, so it is only counted once. */
    lastDaily: number;
}

export const emptyStats = (): Stats => ({
    played: 0,
    won: 0,
    streak: 0,
    best: 0,
    spread: [0, 0, 0, 0, 0, 0],
    lastDaily: -1,
});

/** Record a finished game. Daily puzzles count once and drive the streak. */
export function record(
    stats: Stats,
    result: { won: boolean; tries: number; daily: number | null },
): Stats {
    if (result.daily !== null && stats.lastDaily === result.daily) return stats;
    const next: Stats = { ...stats, spread: [...stats.spread] };
    next.played++;
    if (result.won) {
        next.won++;
        next.spread[result.tries - 1]++;
    }
    if (result.daily !== null) {
        const continues = stats.lastDaily === result.daily - 1;
        next.streak = result.won ? (continues ? stats.streak + 1 : 1) : 0;
        next.best = Math.max(next.best, next.streak);
        next.lastDaily = result.daily;
    }
    return next;
}

/** Emoji grid for sharing, like the original. */
export function shareText(guesses: string[], answer: string, label: string) {
    const won = guesses.at(-1)?.toUpperCase() === answer.toUpperCase();
    const squares = { correct: '🟩', present: '🟨', absent: '⬛' };
    return [
        `${label} ${won ? guesses.length : 'X'}/${TRIES}`,
        '',
        ...guesses.map((g) =>
            score(g, answer)
                .map((m) => squares[m])
                .join(''),
        ),
    ].join('\n');
}
