import React, { useEffect, useState } from 'react';
import Application from '../../Application';
import bus from '../EventBus';
import { ALBUMS, AlbumState } from '../../Audio/AlbumAudio';
import TvView from './TvView';
import MessiCard from './MessiCard';
import Ps5View from './Ps5View';
const ART = Object.fromEntries(
    Object.keys(ALBUMS).map((slug) => [slug, `/room/albums/${slug}.jpg`]),
) as Record<keyof typeof ALBUMS, string>;
export default function InterfaceUI() {
    const [visible, setVisible] = useState(false);
    const [inside, setInside] = useState(false);
    const [mute, setMute] = useState(true);
    const [free, setFree] = useState(false);
    const [album, setAlbum] = useState<AlbumState | null>(null);
    const [records, setRecords] = useState({ found: 0, total: 0 });
    const [asleep, setAsleep] = useState(false);
    const [hint, setHint] = useState(false);
    const [reward, setReward] = useState(0);
    // The moment the last record is found: say what just appeared.
    useEffect(() => {
        if (!reward) return;
        const t = setTimeout(() => setReward(0), 9000);
        return () => clearTimeout(t);
    }, [reward]);
    // Show how to move around for a few seconds each time Look Around starts.
    useEffect(() => {
        setHint(free);
        if (!free) return;
        const t = setTimeout(() => setHint(false), 9000);
        return () => clearTimeout(t);
    }, [free]);
    useEffect(() => {
        const off = [
            bus.on('loadingScreenDone', () => setVisible(true)),
            bus.on('enterMonitor', () => {
                setInside(true);
                setFree(false);
            }),
            bus.on('leftMonitor', () => setInside(false)),
            bus.on('muteToggle', setMute),
            bus.on('albumChange', setAlbum),
            bus.on('recordsFound', setRecords),
            bus.on('goodNight', setAsleep),
            bus.on('freeCamToggle', setFree),
            bus.on('recordsComplete', ({ total }: { total: number }) =>
                setReward(total),
            ),
        ];
        return () => off.forEach((f) => f());
    }, []);
    if (!visible) return null;
    function enter() {
        const camera = new Application().camera;
        camera.freeCam = false;
        setFree(false);
        camera.trigger('enterMonitor');
    }
    function leave() {
        new Application().camera.trigger('leftMonitor');
    }
    return (
        <div
            className="room-interface"
            data-inside={inside}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <button
                id="begu-label"
                onClick={() => new Application().world.decor.openBegu()}
                aria-label="Chat with Begu, the husky (click Begu himself to pet him)"
            >
                Begu <span>Say hi</span>
            </button>
            <button
                id="laptop-label"
                onClick={enter}
                aria-label="Open my portfolio"
                hidden
            >
                Open my portfolio
            </button>
            <TvView />
            <MessiCard />
            <Ps5View />
            {reward > 0 && (
                <p className="records-reward" role="status">
                    All {reward} records found.
                    <span>
                        A gold record just went up by the clock, and the
                        Graduation Bear is waiting on the window bench.
                    </span>
                </p>
            )}
            {asleep && (
                <p className="good-night" role="status">
                    Good night. <span>Tap the bed to wake the room.</span>
                </p>
            )}
            <header>
                <span className="room-name">Nihar Shah</span>
                {records.found > 0 && !inside && (
                    // Only appears once someone has found a hidden record.
                    <span className="records-found" role="status">
                        {records.found === records.total
                            ? `All ${records.total} records found`
                            : `Records found · ${records.found}/${records.total}`}
                    </span>
                )}
                {inside && (
                    // Inside the laptop the desktop renders at ~0.67 scale; offer it at full size.
                    <a className="full-size-link" href="/desktop/">
                        Open full size ↗
                    </a>
                )}
            </header>
            <footer>
                {album ? (
                    <div className="album-controls">
                        <button
                            onClick={() =>
                                new Application().world.audioManager.album.toggle()
                            }
                            aria-label={`${album.playing ? 'Pause' : 'Play'} ${album.title}`}
                        >
                            <span
                                className="album-thumb"
                                data-playing={album.playing}
                            >
                                <img src={ART[album.album]} alt="" />
                            </span>
                            <span>
                                {album.title}
                                <small>
                                    {album.error
                                        ? 'Playback unavailable · retry'
                                        : `${ALBUMS[album.album]} · Shuffle`}
                                </small>
                            </span>
                        </button>
                        <button
                            aria-label="Next album track"
                            onClick={() =>
                                new Application().world.audioManager.album.next()
                            }
                        >
                            →
                        </button>
                    </div>
                ) : (
                    <div className="room-caption">
                        <p>Open the Mac to explore my work and résumé.</p>
                    </div>
                )}
                {hint && (
                    <p className="look-hint" role="status">
                        {window.matchMedia('(pointer: coarse)').matches
                            ? 'Drag to look · two fingers to move and zoom · double-tap to go there'
                            : 'Drag to look · right-drag or arrow keys to move · scroll to zoom · double-click to go there'}
                    </p>
                )}
                <div className="room-controls">
                    <button
                        onClick={() => {
                            bus.dispatch('muteToggle', !mute);
                            setMute(!mute);
                        }}
                        aria-pressed={!mute}
                    >
                        {mute ? 'Sound off' : 'Sound on'}
                    </button>
                    <button
                        className="look-around"
                        onClick={() => {
                            bus.dispatch('freeCamToggle', !free);
                            setFree(!free);
                            setInside(false);
                        }}
                        aria-pressed={free}
                    >
                        {free ? 'Reset camera' : 'Look around'}
                    </button>
                    <button
                        className="enter-computer"
                        onClick={inside ? leave : enter}
                    >
                        {inside ? 'Step back' : 'Use the Mac'}
                    </button>
                </div>
            </footer>
        </div>
    );
}
