import React, { useEffect, useState } from 'react';
import Application from '../../Application';
import eventBus from '../EventBus';

// Boot (black screen + thin bar) → lock screen laid over the live room.
export default function LoadingScreen() {
    const [progress, setProgress] = useState(0);
    const [started, setStarted] = useState(false);
    const [failed, setFailed] = useState(false);
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 10_000);
        return () => clearInterval(id);
    }, []);
    useEffect(() => {
        const app = new Application();
        setProgress(app.resources.loaded / app.resources.toLoad);
        setFailed(app.resources.failed);
        const off = eventBus.on('loadedSource', (data) =>
            setProgress(data.progress),
        );
        const error = eventBus.on('resourceError', () => setFailed(true));
        return () => {
            off();
            error();
        };
    }, []);
    function start() {
        document.getElementById('css')?.removeAttribute('inert');
        setStarted(true);
        eventBus.dispatch('loadingScreenDone', {});
        document.getElementById('ui')!.style.pointerEvents = 'none';
    }
    if (started) return null;
    const ready = progress >= 1 || failed;
    return (
        <main className="boot-screen" data-ready={ready}>
            <div className="boot-stage">
                <div
                    className="boot-progress"
                    role="progressbar"
                    aria-valuenow={Math.round(progress * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                >
                    <span style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
            </div>
            <div className="login-stage">
                <div className="login-clock">
                    <span>
                        {now.toLocaleDateString(undefined, {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                        })}
                    </span>
                    <time dateTime={now.toISOString()}>
                        {now
                            .toLocaleTimeString(undefined, {
                                hour: 'numeric',
                                minute: '2-digit',
                            })
                            .replace(/\s?[AP]M$/i, '')}
                    </time>
                </div>
                <div className="login-user">
                    <h1>Nihar Shah</h1>
                    <button
                        className="login-enter"
                        disabled={!ready || failed}
                        onClick={start}
                        autoFocus
                    >
                        {failed
                            ? 'Room unavailable'
                            : ready
                              ? 'Enter'
                              : 'Loading…'}
                    </button>
                </div>
            </div>
            <a className="boot-portfolio-link" href="/desktop/">
                Go directly to my portfolio ↗
            </a>
        </main>
    );
}
