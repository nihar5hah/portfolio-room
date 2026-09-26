import React, { useCallback, useEffect, useRef, useState } from 'react';
import Application from '../../Application';
import eventBus from '../EventBus';
import useWeather from '../useWeather';

/**
 * The boot screen, after Henry Heffernan's original (see README): a BIOS
 * power-on self-test while the room loads, then a START prompt that zooms
 * away into the room. Phones and tablets are told the room is best on a
 * computer, with a way into the plain portfolio instead.
 */

/** Friendlier names for the resource list; unknown names show as they are. */
const LABELS: Record<string, string> = {
    macbookModel: 'MacBook Pro M3',
    beguModel: 'Begu, Siberian husky',
    duneModel: 'Pierre Paulin Dune',
    loungeProps: 'Lounge props',
    spezialModel: 'adidas Spezial',
    roomProps: 'Plants and ceiling fan',
    ps5Model: 'PlayStation 5',
    dualSenseModel: 'DualSense controllers',
    chairModel: 'Herman Miller Embody',
    footballModel: 'Brazuca match ball',
    dropoutBearModel: 'Graduation Bear',
    duneFabricBump: 'Dune fabric weave',
    decorModel: 'Coffee mug',
    decorTexture: 'Coffee mug texture',
    messiJersey: 'Barcelona No. 10 shirt',
    argentinaJersey: 'Argentina No. 10 shirt',
    graduationRug: 'Graduation rug',
    barcaCrest: 'FC Barcelona crest',
};
export const label = (name: string) =>
    LABELS[name] ??
    (name.startsWith('poster_')
        ? `Sleeve: ${name.slice(7)}`
        : name.endsWith('Vinyl')
          ? `Vinyl: ${name.slice(0, -5)}`
          : name);

const pad = (text: string, width: number) =>
    text.length >= width ? text : text + '\xa0'.repeat(width - text.length);

const today = () => {
    const d = new Date();
    const two = (n: number) => String(n).padStart(2, '0');
    return `${two(d.getMonth() + 1)}/${two(d.getDate())}/${d.getFullYear()}`;
};

/** Phones and tablets: touch-first, or simply too narrow for the room. */
const handheld = () =>
    window.innerWidth < 768 ||
    (matchMedia('(pointer: coarse)').matches &&
        !matchMedia('(hover: hover)').matches);

/** Number of POST lines revealed before the resource list. */
const POST_LINES = 7;

export default function LoadingScreen() {
    const app = useRef(new Application()).current;
    const [progress, setProgress] = useState(
        () => app.resources.loaded / app.resources.toLoad,
    );
    const [counts, setCounts] = useState(() => [
        app.resources.loaded,
        app.resources.toLoad,
    ]);
    const [recent, setRecent] = useState<string[]>([]);
    const [failed, setFailed] = useState(() => app.resources.failed);
    /** How many POST lines have appeared (they come in one by one). */
    const [lines, setLines] = useState(0);
    const [phase, setPhase] = useState<'boot' | 'fade' | 'start' | 'gone'>(
        'boot',
    );
    const [leaving, setLeaving] = useState(false);
    const [mobile, setMobile] = useState(handheld);
    const weather = useWeather();
    const reduced = app.reducedMotion.matches;

    useEffect(() => {
        const offLoaded = eventBus.on('loadedSource', (data) => {
            setProgress(data.progress);
            setCounts([data.loaded, data.toLoad]);
            setRecent((list) =>
                [
                    ...list,
                    `Loaded ${pad(label(data.sourceName), 26)} ... ${Math.round(
                        data.progress * 100,
                    )}%`,
                ].slice(-8),
            );
        });
        const offError = eventBus.on('resourceError', () => setFailed(true));
        const onResize = () => setMobile(handheld());
        window.addEventListener('resize', onResize);
        return () => {
            offLoaded();
            offError();
            window.removeEventListener('resize', onResize);
        };
    }, []);

    // POST lines appear one at a time, like an old machine checking itself.
    useEffect(() => {
        if (lines >= POST_LINES) return;
        const t = setTimeout(() => setLines((n) => n + 1), reduced ? 0 : 180);
        return () => clearTimeout(t);
    }, [lines]);

    const ready = progress >= 1 && lines >= POST_LINES;

    // Loaded: a beat on "launching", fade the text, then the START prompt.
    useEffect(() => {
        if (!ready || failed || phase !== 'boot') return;
        const t = setTimeout(() => setPhase('fade'), reduced ? 0 : 1000);
        return () => clearTimeout(t);
    }, [ready, failed, phase]);
    useEffect(() => {
        if (phase !== 'fade') return;
        const t = setTimeout(() => setPhase('start'), reduced ? 0 : 500);
        return () => clearTimeout(t);
    }, [phase]);

    const start = useCallback(() => {
        if (leaving) return;
        document.getElementById('css')?.removeAttribute('inert');
        setLeaving(true);
        eventBus.dispatch('loadingScreenDone', {});
        document.getElementById('ui')!.style.pointerEvents = 'none';
        setTimeout(() => setPhase('gone'), reduced ? 0 : 450);
    }, [leaving]);

    // ?debug skips straight in; Enter presses START; P opens the portfolio.
    useEffect(() => {
        if (phase !== 'start') return;
        if (new URLSearchParams(location.search).has('debug')) start();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Enter') start();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [phase, start]);
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'p' || event.key === 'P')
                location.assign('/desktop/');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    if (phase === 'gone') return null;

    const memory = (navigator as Navigator & { deviceMemory?: number })
        .deviceMemory;
    const gpu = (app.quality.device.gpu ?? 'WebGL')
        .replace(/^ANGLE \((.*)\)$/, '$1')
        .replace(/,? ?(Unspecified Version|Direct3D\d*.*|OpenGL.*)$/i, '')
        .split(',')
        .pop()!
        .trim()
        .replace(/^ANGLE \w+ Renderer: /, '')
        .slice(0, 38);
    const blr = weather.find((c) => c.id === 'blr');
    const post = [
        <p key="spec">NSP A26 2004-2026 Applied AI Special AMD-BLR</p>,
        <div key="s1" className="bios-spacer" />,
        <p key="show">NS Room Showcase(tm) V3.0</p>,
        <p key="ram">Checking RAM : {memory ? memory * 1024 : 8192} OK</p>,
        <p key="gpu">
            Graphics : {gpu} · quality {app.quality.tier.toUpperCase()}
        </p>,
        <p key="begu">Begu(tm) Husky Coprocessor ........ OK</p>,
        <p key="wx">
            Bengaluru sensor :{' '}
            {blr ? `${blr.temp}°C ${blr.condition}` : 'waiting'}
        </p>,
    ];

    return (
        <main
            className="boot-screen"
            data-leaving={leaving}
            aria-busy={!ready}
            aria-label="Loading Nihar Shah's room"
        >
            {phase === 'fade' && (
                <div className="bios-cursor-only">
                    <span className="blinking-cursor" />
                </div>
            )}
            <div className="bios-text" data-hidden={phase !== 'boot'}>
                <header className="bios-header">
                    <div className="bios-logo">
                        <p>
                            <b>Shah,</b>
                        </p>
                        <p>
                            <b>Nihar Inc.</b>
                        </p>
                    </div>
                    <div className="bios-header-info">
                        <p>Released: 09/26/2026</p>
                        <p>NSBIOS (C)2026 Shah, Nihar Inc.,</p>
                    </div>
                </header>
                <div className="bios-body">
                    {post.slice(0, lines)}
                    {lines >= POST_LINES && (
                        <>
                            <div className="bios-spacer" />
                            <div className="bios-spacer" />
                            {failed ? (
                                <p>
                                    <b className="bios-red">ERROR:</b> a
                                    required file could not be loaded
                                </p>
                            ) : progress >= 1 ? (
                                <p>FINISHED LOADING RESOURCES</p>
                            ) : (
                                <p className="bios-loading">
                                    LOADING RESOURCES ({counts[0]}/
                                    {counts[1] || '-'})
                                </p>
                            )}
                            <div className="bios-spacer" />
                            <div className="bios-resources">
                                {recent.map((line, i) => (
                                    <p key={`${i}-${line}`}>{line}</p>
                                ))}
                            </div>
                            <div className="bios-spacer" />
                            {ready && !failed && (
                                <p>
                                    All Content Loaded, launching{' '}
                                    <b className="bios-green">
                                        'Nihar Shah Portfolio Showcase'
                                    </b>{' '}
                                    V3.0
                                </p>
                            )}
                        </>
                    )}
                    <div className="bios-spacer" />
                    <span className="blinking-cursor" />
                </div>
                <footer className="bios-footer">
                    <p>
                        Press <b>ENTER</b> to start ,{' '}
                        <a href="/desktop/">
                            <b>P</b> for the plain portfolio
                        </a>
                    </p>
                    <p>{today()}</p>
                </footer>
            </div>
            {failed && (
                <div className="bios-popup-wrap">
                    <div className="bios-popup" role="alertdialog">
                        <p>
                            <b className="bios-red">CRITICAL ERROR:</b> the room
                            could not load
                        </p>
                        <div className="bios-spacer" />
                        <p>Check your connection and reload, or</p>
                        <div className="bios-actions">
                            <a className="bios-start-button" href="/desktop/">
                                <p>OPEN PORTFOLIO</p>
                            </a>
                        </div>
                    </div>
                </div>
            )}
            {phase === 'start' && !failed && (
                <div className="bios-popup-wrap">
                    <div
                        className="bios-popup"
                        role="dialog"
                        aria-label="Start"
                    >
                        <p>Nihar Shah Portfolio Showcase 2026</p>
                        {mobile && (
                            <>
                                <div className="bios-spacer" />
                                <p className="bios-warning">
                                    <b>
                                        WARNING: This experience is best viewed
                                        on a desktop or laptop computer.
                                    </b>
                                </p>
                                <div className="bios-spacer" />
                            </>
                        )}
                        <div className="bios-prompt">
                            <p>Click start to begin{'\xa0'}</p>
                            <span className="blinking-cursor" />
                        </div>
                        <div className="bios-actions">
                            <button
                                className="bios-start-button"
                                onClick={start}
                                autoFocus
                            >
                                <p>START</p>
                            </button>
                            {mobile && (
                                <a
                                    className="bios-start-button"
                                    href="/desktop/"
                                >
                                    <p>2D PORTFOLIO</p>
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
