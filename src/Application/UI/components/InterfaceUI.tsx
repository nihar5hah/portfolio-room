import React, { useEffect, useState } from 'react';
import Application from '../../Application';
import bus from '../EventBus';
import { ALBUMS, AlbumState } from '../../Audio/AlbumAudio';
import TvView from './TvView';
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
                aria-label="Say hi to Begu, the husky"
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
