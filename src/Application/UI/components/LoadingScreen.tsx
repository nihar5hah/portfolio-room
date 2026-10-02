import React, { useCallback, useEffect, useRef, useState } from 'react';
import Application from '../../Application';
import eventBus from '../EventBus';
import assetUrl from '../../Utils/assetUrl';

/** Debug tools: dev builds and `DEBUG_TOOLS=1 npm run build` only (webpack). */
declare const __DEBUG_TOOLS__: boolean | undefined;

/** Linework rendered from the room's opening camera; see render-blueprint.js. */
export const PLATE_ASPECT = 2.4;

export const handheld = () =>
    window.innerWidth < 768 ||
    (matchMedia('(pointer: coarse)').matches &&
        !matchMedia('(hover: hover)').matches);

/** Match the live camera's vertical/landscape and horizontal/portrait lens. */
export function visibleSpan(width: number, height: number) {
    const aspect = width / height;
    const fraction =
        aspect >= 1 ? Math.min(1, aspect / PLATE_ASPECT) : 1 / PLATE_ASPECT;
    return [0.5 - fraction / 2, 0.5 + fraction / 2] as const;
}

/** Exclude immediately counted lazy album-art placeholders. */
export const drafted = (loaded: number, toLoad: number, lazy: number) =>
    toLoad - lazy <= 0
        ? 1
        : Math.min(1, Math.max(0, (loaded - lazy) / (toLoad - lazy)));

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
    const started = useRef(false);
    const exitTimer = useRef<ReturnType<typeof setTimeout>>();
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
            clearTimeout(exitTimer.current);
        };
    }, []);

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
    }, [target, reduced]);

    const start = useCallback(() => {
        if (started.current || !drawn) return;
        started.current = true;
        setLeaving(true);
        exitTimer.current = setTimeout(
            () => {
                document.getElementById('css')?.removeAttribute('inert');
                eventBus.dispatch('loadingScreenDone', {});
                document.getElementById('ui')!.style.pointerEvents = 'none';
                setGone(true);
            },
            reduced ? 0 : 420,
        );
    }, [drawn, reduced]);

    useEffect(() => {
        if (leaving || gone) return;
        if (
            typeof __DEBUG_TOOLS__ !== 'undefined' &&
            __DEBUG_TOOLS__ &&
            drawn &&
            new URLSearchParams(location.search).has('debug')
        )
            start();
        const onKey = (event: KeyboardEvent) => {
            // Preserve native keyboard activation of the alternative link.
            if (
                event.target instanceof HTMLElement &&
                event.target.closest('a, button')
            )
                return;
            if (event.key === 'Enter') start();
            else if (event.key === 'p' || event.key === 'P')
                location.assign('/desktop/');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [drawn, start, leaving, gone]);

    if (gone) return null;
    const scan = span[0] + (span[1] - span[0]) * shown;

    return (
        <main
            className="boot-screen"
            data-drawn={drawn}
            data-leaving={leaving}
            data-mobile={mobile}
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
                    src={assetUrl('/room/blueprint.webp')}
                    alt=""
                    decoding="async"
                />
                {!drawn && !reduced && <span className="bp-plotter" />}
            </div>
            <div className="bp-shade" aria-hidden="true" />
            <div className="bp-controls">
                <p className="bp-note">
                    Best experienced on a laptop or desktop.
                </p>
                <div className="bp-actions">
                    {failed ? (
                        <p className="bp-status" role="alert">
                            Unable to load the room. Please reload.
                        </p>
                    ) : (
                        <button
                            className="bp-enter"
                            onClick={start}
                            disabled={!drawn || leaving}
                        >
                            {drawn
                                ? mobile
                                    ? 'Enter anyway'
                                    : 'Enter the room'
                                : `Loading · ${Math.round(shown * 100)}%`}
                            {drawn && <span aria-hidden="true">↗</span>}
                        </button>
                    )}
                    <a className="bp-plain" href="/desktop/">
                        2D portfolio
                    </a>
                </div>
            </div>
        </main>
    );
}
