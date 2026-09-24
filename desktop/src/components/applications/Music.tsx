import React, { useEffect, useState } from 'react';
import Window from '../os/Window';
import AlbumAudio, {
    AlbumState,
} from '../../../../src/Application/Audio/AlbumAudio';
import bus from '../../../../src/Application/UI/EventBus';

const NAMES = {
    mbdtf: 'My Beautiful Dark Twisted Fantasy · Kanye West',
    jackboys: 'JACKBOYS · JACKBOYS & Travis Scott',
    rodeo: 'Rodeo · Travis Scott',
    tlop: 'The Life of Pablo · Kanye West',
    '808s': '808s & Heartbreak · Kanye West',
    graduation: 'Graduation · Kanye West',
    yeezus: 'Yeezus · Kanye West',
    melodicblue: 'The Melodic Blue · Baby Keem',
    blonde: 'Blonde · Frank Ocean',
    currents: 'Currents · Tame Impala',
    longlive: 'LONG.LIVE.A$AP · A$AP Rocky',
    honestly: 'Honestly, Nevermind · Drake',
    livelove: 'LIVE.LOVE.A$AP · A$AP Rocky',
    atlonglast: 'AT.LONG.LAST.A$AP · A$AP Rocky',
    utopia: 'UTOPIA · Travis Scott',
    thankmelater: 'Thank Me Later · Drake',
    astroworld: 'ASTROWORLD · Travis Scott',
    collegedropout: 'The College Dropout · Kanye West',
    fouryou: 'Four You · Karan Aujla',
} as const;
type Album = keyof typeof NAMES;
const ART = Object.fromEntries(
    Object.keys(NAMES).map((slug) => [slug, `/room/albums/${slug}.jpg`]),
) as Record<Album, string>;

// Both entry points use AlbumAudio; keep standalone audio alive across window closes.
let standalone: AlbumAudio | undefined;
const send = (action: 'toggle' | 'next' | 'state' | 'retry') => {
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'album', action }, location.origin);
        return;
    }
    if (!standalone) {
        standalone = new AlbumAudio();
        standalone.entered = true;
    }
    if (action === 'toggle') standalone.toggle();
    else if (action === 'next') standalone.next();
    else if (action === 'retry') void standalone.load();
    else standalone.publish();
};

export default function Music(props: WindowAppProps) {
    const [state, setState] = useState<AlbumState | null>();
    useEffect(() => {
        const receive = (event: MessageEvent) => {
            if (
                event.origin === location.origin &&
                event.source === window.parent &&
                event.data?.type === 'albumState'
            )
                setState(event.data.state);
        };
        window.addEventListener('message', receive);
        const off =
            window.parent === window
                ? bus.on('albumChange', setState)
                : () => {};
        send('state');
        return () => {
            off();
            window.removeEventListener('message', receive);
        };
    }, []);
    return (
        <Window
            top={72}
            left={Math.max(16, innerWidth / 2 - 260)}
            width={Math.min(520, innerWidth - 32)}
            height={Math.min(620, innerHeight - 160)}
            windowTitle="Music"
            windowBarIcon="music"
            closeWindow={props.onClose}
            minimizeWindow={props.onMinimize}
            onInteract={props.onInteract}
            bottomLeftText={
                state
                    ? `${state.count} songs · shuffled`
                    : state === null
                      ? 'Library unavailable'
                      : 'Loading library…'
            }
        >
            <section className="music-app">
                {state ? (
                    <>
                        <header className="music-now">
                            <img src={ART[state.album]} alt="" />
                            <div>
                                <small>Now playing</small>
                                <h1>{state.title}</h1>
                                <p>{NAMES[state.album]}</p>
                                <div className="music-controls">
                                    <button
                                        onClick={() => send('toggle')}
                                        aria-label={
                                            state.playing ? 'Pause' : 'Play'
                                        }
                                    >
                                        {state.playing ? '⏸' : '▶'}
                                    </button>
                                    <button
                                        onClick={() => send('next')}
                                        aria-label="Next song"
                                    >
                                        ⏭
                                    </button>
                                    {state.error && (
                                        <span>Playback unavailable</span>
                                    )}
                                </div>
                            </div>
                        </header>
                        <ol className="music-queue">
                            {state.queue.map((track, i) => (
                                <li
                                    key={i}
                                    data-current={i === state.index}
                                    data-played={i < state.index}
                                >
                                    <img src={ART[track.album]} alt="" />
                                    <span>{track.title}</span>
                                    <small>
                                        {NAMES[track.album].split(' · ')[0]}
                                    </small>
                                </li>
                            ))}
                        </ol>
                    </>
                ) : state === null ? (
                    <div className="music-empty" role="status">
                        <p>The music library couldn’t load.</p>
                        <button
                            onClick={() => {
                                setState(undefined);
                                send('retry');
                            }}
                        >
                            Try again
                        </button>
                    </div>
                ) : (
                    <p className="music-empty">Loading library…</p>
                )}
            </section>
        </Window>
    );
}
