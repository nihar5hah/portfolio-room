import React, {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    LENGTH,
    Mark,
    TRIES,
    Stats,
    dailyWord,
    dayNumber,
    emptyStats,
    isWord,
    letterHints,
    randomWord,
    record,
    score,
    shareText,
} from './Game';

/**
 * A Wordle clone: a daily word (the same for everyone that day) and an
 * unlimited mode with a new word every game. Guess in six tries; tiles flip
 * to show green (right letter, right place), yellow (in the word elsewhere)
 * or grey. Type or click the keyboard. Progress and stats stay in the browser.
 */
type Mode = 'daily' | 'endless';
interface Saved {
    mode: Mode;
    answer: string;
    guesses: string[];
    day: number;
    recent: string[];
}
const SAVE = 'nihar-word-game';
const STATS = 'nihar-word-game-stats';

const load = <T,>(key: string, fallback: T): T => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    } catch {
        return fallback;
    }
};
const store = (key: string, value: unknown) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* private browsing: play without saving */
    }
};

const fresh = (mode: Mode, recent: string[] = []): Saved => {
    const day = dayNumber();
    const answer = mode === 'daily' ? dailyWord(day) : randomWord(recent);
    return { mode, answer, guesses: [], day, recent };
};

/** Resume the saved game; a new day brings a new daily word. */
const restore = (): Saved => {
    const saved = load<Saved | null>(SAVE, null);
    if (!saved || !saved.answer) return fresh('daily');
    if (saved.mode === 'daily' && saved.day !== dayNumber())
        return fresh('daily', saved.recent);
    return { ...saved, recent: saved.recent ?? [] };
};

const COLORS: Record<Mark | 'empty', string> = {
    correct: 'var(--tile-correct, #6aaa64)',
    present: 'var(--tile-present, #c9b458)',
    absent: 'var(--tile-absent, #787c7e)',
    empty: 'var(--tile-empty, #fff)',
};

// Tile and row motion runs on the Web Animations API: transforms only, so the
// browser composites it off the main thread. Each segment eases in and out
// (quadratic), like the tween it replaces.
const EASE = 'cubic-bezier(0.455, 0.03, 0.515, 0.955)';
const reducedMotion = () =>
    matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Plays a transform animation; resolves when it finishes, rejects if cancelled. */
const play = (
    element: HTMLElement | null,
    transforms: string[],
    options: KeyframeAnimationOptions,
    running?: Animation[],
): Promise<void> => {
    if (!element?.animate) return Promise.resolve();
    const animation = element.animate(
        transforms.map((transform) => ({ transform, easing: EASE })),
        options,
    );
    running?.push(animation);
    return animation.finished.then(() => undefined);
};

const Tile = memo(function Tile({
    letter,
    mark,
    index,
    reveal,
    pop,
    bounce,
}: {
    letter: string;
    mark?: Mark;
    index: number;
    reveal: boolean;
    pop: boolean;
    bounce: boolean;
}) {
    const tile = useRef<HTMLDivElement>(null);
    const [shown, setShown] = useState<Mark | undefined>(
        reveal ? undefined : mark,
    );
    useEffect(() => {
        if (!mark) {
            setShown(undefined);
            return;
        }
        if (!reveal) {
            setShown(mark);
            return;
        }
        // Flip one after another, turning colour at the halfway point. A
        // timer backs the animation up, so colours always appear even when
        // animation frames are paused (a background tab) or motion is off.
        if (reducedMotion() || !tile.current?.animate) {
            setShown(mark);
            return;
        }
        let cancelled = false;
        const running: Animation[] = [];
        const delay = index * 280;
        const backup = setTimeout(
            () => !cancelled && setShown(mark),
            delay + 200,
        );
        play(
            tile.current,
            ['rotateX(0deg)', 'rotateX(90deg)'],
            { delay, duration: 180, fill: 'forwards' },
            running,
        )
            .then(() => {
                if (cancelled) return;
                setShown(mark);
                // Starts at 90deg, so the held first half can go at once.
                const back = play(
                    tile.current,
                    ['rotateX(90deg)', 'rotateX(0deg)'],
                    { duration: 180 },
                    running,
                );
                running[0].cancel();
                return back;
            })
            .then(() => {
                if (cancelled || !bounce) return;
                return play(
                    tile.current,
                    ['translateY(0)', 'translateY(-14px)', 'translateY(0)'],
                    { delay: index * 90, duration: 350 },
                    running,
                );
            })
            .catch(() => undefined); // cancelled: the tile unmounted or changed
        return () => {
            cancelled = true;
            clearTimeout(backup);
            running.forEach((animation) => animation.cancel());
        };
    }, [mark, reveal, index, bounce]);
    useEffect(() => {
        if (pop && letter && !reducedMotion())
            play(tile.current, ['scale(1)', 'scale(1.1)', 'scale(1)'], {
                duration: 100,
            }).catch(() => undefined);
    }, [letter, pop]);
    const filled = !!shown;
    return (
        <div
            ref={tile}
            className="word-tile"
            data-mark={shown ?? (letter ? 'typed' : 'empty')}
            aria-label={
                letter ? `${letter}${shown ? `, ${shown}` : ''}` : 'empty'
            }
            style={{
                ...styles.tile,
                backgroundColor: filled ? COLORS[shown!] : COLORS.empty,
                borderColor: filled
                    ? 'transparent'
                    : letter
                      ? 'var(--tile-typed, #878a8c)'
                      : 'var(--tile-border, #d3d6da)',
                color: filled ? '#fff' : undefined,
            }}
        >
            {letter}
        </div>
    );
});

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', '+ZXCVBNM-'];

const Wordle: React.FC = () => {
    const [game, setGame] = useState<Saved>(restore);
    const [stats, setStats] = useState<Stats>(() => load(STATS, emptyStats()));
    const [typing, setTyping] = useState('');
    const [message, setMessage] = useState('');
    const [revealing, setRevealing] = useState(-1);
    const [showStats, setShowStats] = useState(false);
    const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

    const { answer, guesses, mode } = game;
    const won = guesses.at(-1) === answer;
    const over = won || guesses.length >= TRIES;
    const hints = useMemo(
        () => letterHints(guesses, answer),
        [guesses, answer],
    );

    useEffect(() => store(SAVE, game), [game]);
    useEffect(() => store(STATS, stats), [stats]);

    const say = useCallback((text: string, ms = 1600) => {
        setMessage(text);
        if (ms) setTimeout(() => setMessage((m) => (m === text ? '' : m)), ms);
    }, []);

    const shake = useCallback(() => {
        if (reducedMotion()) return;
        play(
            rowRefs.current[guesses.length],
            [0, -8, 8, -6, 6, 0].map((x) => `translateX(${x}px)`),
            { duration: 350 },
        ).catch(() => undefined);
    }, [guesses.length]);

    const submit = useCallback(() => {
        if (over) return;
        if (typing.length < LENGTH) {
            say('Not enough letters');
            shake();
            return;
        }
        if (!isWord(typing)) {
            say('Not in word list');
            shake();
            return;
        }
        const next = [...guesses, typing];
        setRevealing(guesses.length);
        setGame({ ...game, guesses: next });
        setTyping('');
        const done = typing === answer || next.length >= TRIES;
        if (!done) return;
        const result = {
            won: typing === answer,
            tries: next.length,
            daily: mode === 'daily' ? game.day : null,
        };
        setStats((s) => record(s, result));
        const praise = [
            'Genius',
            'Magnificent',
            'Impressive',
            'Splendid',
            'Great',
            'Phew',
        ];
        setTimeout(
            () => {
                if (result.won) say(praise[next.length - 1], 2200);
                else say(answer, 0);
                setTimeout(() => setShowStats(true), 1400);
            },
            LENGTH * 280 + 300,
        );
    }, [over, typing, guesses, game, answer, mode, say, shake]);

    const press = useCallback(
        (key: string) => {
            if (over) return;
            if (key === '+') return submit();
            if (key === '-') return setTyping((t) => t.slice(0, -1));
            if (/^[A-Z]$/.test(key))
                setTyping((t) => (t.length < LENGTH ? t + key : t));
        },
        [over, submit],
    );

    // Physical keyboard, only while this window is the active one.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const win = document
                .querySelector('.word-game')
                ?.closest('.os-window');
            if (!win?.getClientRects().length) return;
            if (win.getAttribute('data-active') !== 'true') return;
            if ((event.target as Element)?.closest?.('input,textarea')) return;
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key === 'Enter') {
                if ((event.target as Element)?.closest?.('button')) return;
                event.preventDefault();
                press('+');
            } else if (event.key === 'Backspace') press('-');
            else if (/^[a-z]$/i.test(event.key)) press(event.key.toUpperCase());
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [press]);

    const start = (next: Mode) => {
        setShowStats(false);
        setMessage('');
        setTyping('');
        setRevealing(-1);
        const recent = [...(game.recent ?? []), answer].slice(-30);
        if (next === 'daily') {
            // Back to today's puzzle, finished or not.
            const saved = load<Saved | null>(SAVE + '-daily', null);
            setGame(
                saved && saved.day === dayNumber()
                    ? { ...saved, recent }
                    : fresh('daily', recent),
            );
        } else setGame(fresh('endless', recent));
    };
    // Keep today's daily board when switching away from it.
    useEffect(() => {
        if (mode === 'daily') store(SAVE + '-daily', game);
    }, [game, mode]);

    const share = async () => {
        const label =
            mode === 'daily' ? `Word game #${game.day + 1}` : 'Word game';
        const text = shareText(guesses, answer, label);
        try {
            await navigator.clipboard.writeText(text);
            say('Copied results');
        } catch {
            say('Could not copy');
        }
    };

    const rows = [...Array(TRIES)].map((_, r) => {
        if (r < guesses.length)
            return { word: guesses[r], marks: score(guesses[r], answer) };
        if (r === guesses.length && !over)
            return { word: typing, marks: [] as Mark[] };
        return { word: '', marks: [] as Mark[] };
    });
    const best = Math.max(1, ...stats.spread);

    return (
        <div style={styles.container} className="word-game">
            <div style={styles.header}>
                <div style={styles.title}>
                    <h2>Word game</h2>
                    <p>Guess the five-letter word in six tries.</p>
                </div>
                <div style={styles.modes} role="tablist" aria-label="Game mode">
                    {(['daily', 'endless'] as Mode[]).map((m) => (
                        <button
                            key={m}
                            role="tab"
                            aria-selected={mode === m}
                            className="site-button word-mode"
                            data-active={mode === m}
                            onClick={() => start(m)}
                        >
                            {m === 'daily' ? 'Daily' : 'Unlimited'}
                        </button>
                    ))}
                    <button
                        className="site-button word-mode"
                        aria-label="Statistics"
                        onClick={() => setShowStats((s) => !s)}
                    >
                        Stats
                    </button>
                </div>
            </div>
            <div style={styles.toast} aria-live="polite">
                {message && <span className="word-toast">{message}</span>}
            </div>
            <div style={styles.board}>
                {rows.map((row, r) => (
                    <div
                        key={`${game.answer}-${r}`}
                        style={styles.row}
                        ref={(row) => (rowRefs.current[r] = row)}
                    >
                        {[...Array(LENGTH)].map((_, i) => (
                            <Tile
                                key={i}
                                index={i}
                                letter={row.word[i] ?? ''}
                                mark={row.marks[i]}
                                reveal={r === revealing}
                                pop={r === guesses.length}
                                bounce={
                                    r === revealing &&
                                    won &&
                                    r === guesses.length - 1
                                }
                            />
                        ))}
                    </div>
                ))}
            </div>
            <div style={styles.keyboard}>
                {ROWS.map((row) => (
                    <div style={styles.keyRow} key={row}>
                        {row.split('').map((key) => {
                            const mark = hints[key];
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    className="site-button word-key"
                                    data-mark={mark ?? 'none'}
                                    onClick={() => press(key)}
                                    aria-label={
                                        key === '+'
                                            ? 'Enter'
                                            : key === '-'
                                              ? 'Delete'
                                              : key
                                    }
                                    style={{
                                        ...styles.key,
                                        ...(key === '+' || key === '-'
                                            ? styles.wide
                                            : {}),
                                        ...(mark
                                            ? {
                                                  backgroundColor: COLORS[mark],
                                                  color: '#fff',
                                              }
                                            : {}),
                                    }}
                                >
                                    {key === '+'
                                        ? 'ENTER'
                                        : key === '-'
                                          ? '⌫'
                                          : key}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
            {showStats && (
                <div
                    className="word-stats"
                    style={styles.stats}
                    role="dialog"
                    aria-label="Statistics"
                >
                    <button
                        className="word-close"
                        aria-label="Close"
                        onClick={() => setShowStats(false)}
                        style={styles.close}
                    >
                        ×
                    </button>
                    {over && (
                        <p style={styles.result}>
                            {won ? 'Solved it!' : 'The word was'}{' '}
                            <b>{answer}</b>
                        </p>
                    )}
                    <h3>Statistics</h3>
                    <div style={styles.numbers}>
                        {[
                            [stats.played, 'Played'],
                            [
                                stats.played
                                    ? Math.round(
                                          (stats.won / stats.played) * 100,
                                      )
                                    : 0,
                                'Win %',
                            ],
                            [stats.streak, 'Streak'],
                            [stats.best, 'Best'],
                        ].map(([n, label]) => (
                            <div key={label} style={styles.number}>
                                <b>{n}</b>
                                <small>{label}</small>
                            </div>
                        ))}
                    </div>
                    <h3>Guesses</h3>
                    {stats.spread.map((n, i) => (
                        <div key={i} style={styles.bar}>
                            <span>{i + 1}</span>
                            <span
                                className="word-bar"
                                data-now={
                                    over && won && guesses.length === i + 1
                                }
                                style={{
                                    ...styles.fill,
                                    width: `${Math.max(7, (n / best) * 100)}%`,
                                }}
                            >
                                {n}
                            </span>
                        </div>
                    ))}
                    <div style={styles.actions}>
                        {over && (
                            <button
                                className="site-button word-mode"
                                data-active="true"
                                onClick={share}
                            >
                                Share
                            </button>
                        )}
                        <button
                            className="site-button word-mode"
                            onClick={() => start('endless')}
                        >
                            {mode === 'endless' || over
                                ? 'New word'
                                : 'Play unlimited'}
                        </button>
                    </div>
                    {mode === 'daily' && over && (
                        <p style={styles.note}>A new daily word tomorrow.</p>
                    )}
                </div>
            )}
        </div>
    );
};

const styles: StyleSheetCSS = {
    container: {
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        overflowY: 'auto',
        padding: '4px 8px 12px',
    },
    header: {
        width: '100%',
        maxWidth: 480,
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 6,
    },
    title: { flexDirection: 'column', gap: 2 },
    modes: { gap: 6 },
    toast: { height: 34, justifyContent: 'center', alignItems: 'center' },
    board: { flexDirection: 'column', gap: 6, marginBottom: 14 },
    row: { gap: 6 },
    tile: {
        width: 54,
        height: 54,
        border: '2px solid',
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: 28,
        fontWeight: 700,
        textTransform: 'uppercase',
        userSelect: 'none',
    },
    keyboard: { flexDirection: 'column', gap: 7, alignItems: 'center' },
    keyRow: { gap: 5 },
    key: {
        minWidth: 34,
        height: 50,
        padding: '0 6px',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: 14,
        fontWeight: 700,
    },
    wide: { minWidth: 58, fontSize: 12 },
    stats: {
        position: 'absolute',
        top: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(360px, 92%)',
        flexDirection: 'column',
        alignItems: 'stretch',
        padding: '22px 22px 18px',
        borderRadius: 12,
        zIndex: 5,
        gap: 6,
    },
    close: {
        position: 'absolute',
        top: 8,
        right: 12,
        border: 0,
        background: 'none',
        fontSize: 22,
        cursor: 'pointer',
        color: 'inherit',
    },
    result: { justifyContent: 'center', fontSize: 15, gap: 6, marginBottom: 6 },
    numbers: { justifyContent: 'space-between', marginBottom: 8 },
    number: { flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 },
    bar: { alignItems: 'center', gap: 8, fontSize: 13 },
    fill: {
        justifyContent: 'flex-end',
        padding: '1px 7px',
        color: '#fff',
        fontWeight: 700,
        fontSize: 12,
    },
    actions: { gap: 8, justifyContent: 'center', marginTop: 12 },
    note: { justifyContent: 'center', marginTop: 8, opacity: 0.7 },
};

export default Wordle;
