import React, { useCallback, useEffect, useRef, useState } from 'react';
import Application from '../../Application';
import eventBus from '../EventBus';

/**
 * The loading screen is a technical drawing of the room. The linework is
 * rendered from the real scene, from the camera the room opens at
 * (scripts/render-blueprint.js), so a plotter line can draw it in as the
 * files arrive and the live room can fade in exactly underneath. Numbered
 * callouts point at real objects; the title block says who this is and
 * that the room is designed for a laptop or desktop (loudly on a phone).
 */

/** Blueprint plate: 2.4:1, rendered with the loading camera's 44° lens. */
export const PLATE_ASPECT = 2.4;

/** Where objects sit on the plate (0–1), from scripts/render-blueprint.js. */
export const CALLOUTS = [
    {
        n: '01',
        title: 'MacBook Pro',
        note: 'projects · résumé · contact',
        u: 0.4415,
        v: 0.3929,
        dir: 'up',
    },
    {
        n: '02',
        title: 'Begu',
        note: 'AI companion · ask about my work',
        u: 0.3646,
        v: 0.5971,
        dir: 'down',
    },
    {
        n: '03',
        title: 'Bookshelf',
        note: 'notes on what I build',
        u: 0.2015,
        v: 0.3764,
        dir: 'up',
    },
    {
        n: '04',
        title: 'Match night',
        note: 'Barça, live on the TV',
        u: 0.6989,
        v: 0.8838,
        dir: 'up',
    },
] as const;

/** Phones and tablets: touch-first, or too narrow for the room. */
export const handheld = () =>
    window.innerWidth < 768 ||
    (matchMedia('(pointer: coarse)').matches &&
        !matchMedia('(hover: hover)').matches);

/**
 * The part of the plate a screen shows (u from, to). The live camera keeps
 * its vertical angle in landscape and its horizontal angle in portrait
 * (Camera.ts), and the plate is sized the same way (style.css).
 */
export function visibleSpan(width: number, height: number) {
    const aspect = width / height;
    const fraction =
        aspect >= 1 ? Math.min(1, aspect / PLATE_ASPECT) : 1 / PLATE_ASPECT;
    return [0.5 - fraction / 2, 0.5 + fraction / 2] as const;
}

/**
 * Loading progress without the album art, whose placeholders are counted
 * the moment the page starts (Resources.ts): otherwise the drawing would
 * begin two-thirds done.
 */
export const drafted = (loaded: number, toLoad: number, lazy: number) =>
    toLoad - lazy <= 0 ? 1 : Math.max(0, (loaded - lazy) / (toLoad - lazy));

/** The drawing always takes at least this long, even from cache. */
const DRAW_SECONDS = 1.6;

export default function LoadingScreen() {
    const app = useRef(new Application()).current;
    const lazy = app.resources.lazySources?.size ?? 0;
    const [target, setTarget] = useState(() =>
        drafted(app.resources.loaded, app.resources.toLoad, lazy),
    );
    const [shown, setShown] = useState(0);
    const position = useRef(0);
    const [failed, setFailed] = useState(() => app.resources.failed);
    const [leaving, setLeaving] = useState(false);
    const [gone, setGone] = useState(false);
    const [mobile, setMobile] = useState(handheld);
    const [span, setSpan] = useState(() =>
        visibleSpan(innerWidth, innerHeight),
    );
    const reduced = app.reducedMotion.matches;
    const drawn = shown >= 1 && target >= 1 && !failed;

    useEffect(() => {
        const offLoaded = eventBus.on('loadedSource', (data) =>
            setTarget(drafted(data.loaded, data.toLoad, lazy)),
        );
        const offError = eventBus.on('resourceError', () => setFailed(true));
        const onResize = () => {
            setMobile(handheld());
            setSpan(visibleSpan(innerWidth, innerHeight));
        };
        window.addEventListener('resize', onResize);
        return () => {
            offLoaded();
            offError();
            window.removeEventListener('resize', onResize);
        };
    }, []);

    // The plotter: eases toward real progress, never faster than a full
    // sheet in DRAW_SECONDS.
    useEffect(() => {
        if (reduced) {
            position.current = target;
            setShown(target);
            return;
        }
        let frame = 0;
        let last = performance.now();
        const step = (now: number) => {
            const dt = Math.min(0.1, (now - last) / 1000);
            last = now;
            const next = Math.min(target, position.current + dt / DRAW_SECONDS);
            position.current = next;
            setShown(next);
            if (next < target) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [target]);

    const start = useCallback(() => {
        if (leaving || !drawn) return;
        setLeaving(true);
        // The camera leaves the drawing's viewpoint as soon as the room is
        // entered, so the linework clears first. Well inside the ~1 s a
        // browser keeps the click's permission to start sound.
        setTimeout(
            () => {
                document.getElementById('css')?.removeAttribute('inert');
                eventBus.dispatch('loadingScreenDone', {});
                document.getElementById('ui')!.style.pointerEvents = 'none';
                setGone(true);
            },
            reduced ? 0 : 420,
        );
    }, [leaving, drawn]);

    // ?debug skips straight in; Enter goes in; P opens the 2D portfolio.
    useEffect(() => {
        if (drawn && new URLSearchParams(location.search).has('debug')) start();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Enter') start();
            else if (event.key === 'p' || event.key === 'P')
                location.assign('/desktop/');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [drawn, start]);

    if (gone) return null;

    // The plotter's position on the plate, across what this screen shows.
    const scan = span[0] + (span[1] - span[0]) * shown;
    const percent = Math.round(target * 100);
    const status = failed
        ? 'Error · reload the page'
        : drawn
          ? 'Rendered · ready'
          : `Drafting · ${percent}%`;

    return (
        <main
            className="boot-screen"
            data-drawn={drawn}
            data-leaving={leaving}
            data-mobile={mobile}
            aria-busy={!drawn}
            aria-label="Loading Nihar Shah's room"
        >
            <div className="bp-paper" aria-hidden="true" />
            <div
                className="bp-plate"
                aria-hidden="true"
                style={{ '--scan': `${scan * 100}%` } as React.CSSProperties}
            >
                <img
                    className="bp-lines"
                    src="/room/blueprint.webp"
                    alt=""
                    decoding="async"
                />
                {!drawn && !reduced && <span className="bp-plotter" />}
                {CALLOUTS.map((c) => {
                    const onScreen =
                        c.u > span[0] + 0.02 && c.u < span[1] - 0.12;
                    return (
                        <div
                            key={c.n}
                            className="bp-callout"
                            data-dir={c.dir}
                            data-shown={onScreen && scan > c.u}
                            style={{
                                left: `${c.u * 100}%`,
                                top: `${c.v * 100}%`,
                            }}
                        >
                            <span className="bp-callout-dot" />
                            <span className="bp-callout-leader" />
                            <span className="bp-callout-tag">
                                <b>{c.n}</b> {c.title}
                                <small>{c.note}</small>
                            </span>
                        </div>
                    );
                })}
            </div>

            <header className="bp-sheet-head">
                <span>DWG NS-A101</span>
                <span>ROOM 01 · PERSPECTIVE</span>
                <span>SCALE 1:50</span>
            </header>

            <section className="bp-title" aria-live="polite">
                <div className="bp-title-name">
                    <h1>Nihar Shah</h1>
                    <p>Applied AI systems builder</p>
                </div>
                <dl>
                    <dt>Project</dt>
                    <dd>My room, as a portfolio</dd>
                    <dt>Location</dt>
                    <dd>Ahmedabad · Bengaluru</dd>
                    <dt>Status</dt>
                    <dd className="bp-status">{status}</dd>
                </dl>
                <p className="bp-note" data-warn={mobile}>
                    <b>Note 1</b>
                    {mobile ? (
                        <span>
                            You’re on a phone. This room is designed for a{' '}
                            <b>laptop or desktop</b>: a big screen, a mouse and
                            a keyboard. It works here, but it’s at its best on a
                            computer.
                        </span>
                    ) : (
                        <span>
                            Designed for a <b>laptop or desktop</b>. Look around
                            with the mouse; type at the Mac.
                        </span>
                    )}
                </p>
                <div className="bp-actions">
                    <button
                        className="bp-enter"
                        onClick={start}
                        disabled={!drawn}
                    >
                        {drawn
                            ? mobile
                                ? 'Enter anyway'
                                : 'Enter the room'
                            : 'Drafting…'}
                    </button>
                    <a className="bp-plain" href="/desktop/">
                        {mobile ? 'Open the 2D portfolio' : '2D portfolio'}
                    </a>
                </div>
            </section>
        </main>
    );
}
