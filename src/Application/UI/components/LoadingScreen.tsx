import React, { useCallback, useEffect, useRef, useState } from 'react';
import Application from '../../Application';
import { ALBUMS } from '../../Audio/AlbumAudio';
import eventBus from '../EventBus';

/**
 * The loading screen is a record going on. A vinyl from Nihar's collection
 * spins at 33⅓ rpm, and the tonearm is the progress bar: it swings in from
 * its rest and tracks across the grooves as the room loads. When everything
 * is in, "Drop the needle" zooms the record into the room.
 *
 * It always says the room is made for a laptop or desktop; on a phone that
 * becomes a clear notice with the 2D portfolio as the alternative.
 */

/** Friendlier names for the loading line; unknown names show as they are. */
const LABELS: Record<string, string> = {
    macbookModel: 'the MacBook',
    beguModel: 'Begu',
    duneModel: 'the Dune sofa',
    loungeProps: 'the lounge',
    spezialModel: 'the Spezials',
    roomProps: 'the plants and fan',
    ps5Model: 'the PS5',
    dualSenseModel: 'the controllers',
    chairModel: 'the Embody chair',
    footballModel: 'the Brazuca',
    dropoutBearModel: 'the Graduation Bear',
    duneFabricBump: 'the Dune fabric',
    decorModel: 'the coffee mug',
    decorTexture: 'the coffee',
    messiJersey: 'the Barça shirt',
    argentinaJersey: 'the Argentina shirt',
    graduationRug: 'the Graduation rug',
    barcaCrest: 'the Barça crest',
};
export const label = (name: string) =>
    LABELS[name] ??
    (name.startsWith('poster_') || name.endsWith('Vinyl')
        ? 'the record sleeves'
        : name);

/** Phones and tablets: touch-first, or too narrow for the room. */
export const handheld = () =>
    window.innerWidth < 768 ||
    (matchMedia('(pointer: coarse)').matches &&
        !matchMedia('(hover: hover)').matches);

/**
 * Tonearm angle (degrees clockwise from straight down, about its pivot).
 * With the deck's proportions (measured in the browser) the stylus is off
 * the record at `rest` and over the lead-in groove, 94% of the radius out,
 * at `lead`. While
 * the room loads the arm swings from its rest to the record's edge; it is
 * over the lead-in exactly when everything has arrived.
 */
export const ARM = { rest: 0, lead: 24 };
export const armAngle = (progress: number) =>
    ARM.rest + (ARM.lead - ARM.rest) * Math.min(1, Math.max(0, progress));

const Laptop = () => (
    <svg viewBox="0 0 32 22" aria-hidden="true">
        <rect x="5" y="2" width="22" height="14" rx="1.6" />
        <path d="M2 18.5h28l-1.5 2H3.5z" />
    </svg>
);
const Phone = () => (
    <svg viewBox="0 0 14 22" aria-hidden="true">
        <rect x="1.5" y="1" width="11" height="20" rx="2.2" />
        <path d="M5.5 3.4h3" />
    </svg>
);

export default function LoadingScreen() {
    const app = useRef(new Application()).current;
    const [progress, setProgress] = useState(
        () => app.resources.loaded / app.resources.toLoad,
    );
    const [current, setCurrent] = useState('');
    const [failed, setFailed] = useState(() => app.resources.failed);
    const [leaving, setLeaving] = useState(false);
    const [gone, setGone] = useState(false);
    const [mobile, setMobile] = useState(handheld);
    // A different record on each visit.
    const [album] = useState(() => {
        const slugs = Object.keys(ALBUMS);
        return slugs[Math.floor(Math.random() * slugs.length)];
    });
    const reduced = app.reducedMotion.matches;
    const ready = progress >= 1 && !failed;

    useEffect(() => {
        const offLoaded = eventBus.on('loadedSource', (data) => {
            setProgress(data.progress);
            setCurrent(label(data.sourceName));
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

    const start = useCallback(() => {
        if (leaving || !ready) return;
        document.getElementById('css')?.removeAttribute('inert');
        setLeaving(true);
        eventBus.dispatch('loadingScreenDone', {});
        document.getElementById('ui')!.style.pointerEvents = 'none';
        setTimeout(() => setGone(true), reduced ? 0 : 700);
    }, [leaving, ready]);

    // ?debug skips straight in; Enter drops the needle; P opens the 2D site.
    useEffect(() => {
        if (ready && new URLSearchParams(location.search).has('debug')) start();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Enter') start();
            else if (event.key === 'p' || event.key === 'P')
                location.assign('/desktop/');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [ready, start]);

    if (gone) return null;
    const percent = Math.round(progress * 100);

    return (
        <main
            className="boot-screen"
            data-ready={ready}
            data-leaving={leaving}
            data-mobile={mobile}
            aria-busy={!ready}
            aria-label="Loading Nihar Shah's room"
        >
            <header className="deck-title">
                <h1>Nihar Shah</h1>
                <p>Applied AI systems · Ahmedabad</p>
            </header>

            <div className="deck" aria-hidden="true">
                <div className="deck-platter">
                    <div className="deck-record" data-spinning={!reduced}>
                        <img
                            className="deck-label"
                            src={`/room/albums/thumbs/${album}-264.webp`}
                            alt=""
                            decoding="async"
                        />
                        <span className="deck-spindle" />
                    </div>
                </div>
                <div
                    className="deck-arm"
                    style={{
                        transform: `rotate(${armAngle(progress)}deg)`,
                    }}
                >
                    <span className="deck-arm-pivot" />
                    <span className="deck-arm-tube" />
                    <span className="deck-arm-head" />
                </div>
            </div>

            <div className="deck-status" aria-live="polite">
                {failed ? (
                    <p className="deck-error">
                        The room couldn’t load. Check your connection and
                        reload, or open the 2D portfolio.
                    </p>
                ) : ready ? (
                    <p>
                        {ALBUMS[album as keyof typeof ALBUMS]} is on the
                        platter.
                    </p>
                ) : (
                    <p>
                        <span className="deck-percent">{percent}%</span>
                        {current
                            ? ` · setting out ${current}`
                            : ' · warming up'}
                    </p>
                )}
                <div
                    className="deck-progress"
                    role="progressbar"
                    aria-label="Loading the room"
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                >
                    <span style={{ transform: `scaleX(${progress})` }} />
                </div>
            </div>

            <div className="deck-actions">
                <button
                    className="deck-start"
                    onClick={start}
                    disabled={!ready}
                    autoFocus
                >
                    {ready
                        ? mobile
                            ? 'Enter anyway'
                            : 'Drop the needle'
                        : 'Loading…'}
                </button>
                <a className="deck-plain" href="/desktop/">
                    {mobile ? 'Open the 2D portfolio' : 'or the 2D portfolio'}
                </a>
            </div>

            <aside
                className="deck-device"
                data-warn={mobile}
                aria-label="Best experienced on a laptop or desktop"
            >
                <div className="deck-device-icons">
                    <span className="deck-device-on">
                        <Laptop />
                    </span>
                    <span className="deck-device-off">
                        <Phone />
                    </span>
                </div>
                {mobile ? (
                    <p>
                        <b>You’re on a phone.</b> This room is built for a
                        laptop or desktop: a big screen, a mouse and a keyboard.
                        It works here, but it shines on a computer.
                    </p>
                ) : (
                    <p>
                        <b>Best on a laptop or desktop.</b> Use your mouse to
                        look around and your keyboard at the Mac.
                    </p>
                )}
            </aside>
        </main>
    );
}
