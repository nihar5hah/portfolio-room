import React, { useEffect, useState } from 'react';
import Icon from '../general/Icon';
import { IconName } from '../../assets/icons';
import useWeather from '../../hooks/useWeather';
import useTheme from '../../hooks/useTheme';
const PINNED: { name: string; label: string; icon: IconName }[] = [
    { name: 'My Portfolio', label: 'Portfolio', icon: 'showcaseIcon' },
    { name: 'Begu', label: 'Begu · AI companion', icon: 'begu' },
    {
        name: 'Music',
        label: 'Music · what’s playing in the room',
        icon: 'music',
    },
    { name: 'Word game', label: 'A little break', icon: 'henordleIcon' },
    { name: 'Résumé', label: 'Résumé', icon: 'resume' },
];

export interface ToolbarProps {
    windows: DesktopWindows;
    toggleMinimize: (key: string) => void;
    shutdown: () => void;
    launch: (name: string) => void;
}
export default function Toolbar({
    windows,
    toggleMinimize,
    shutdown,
    launch,
}: ToolbarProps) {
    const [menu, setMenu] = useState(false);
    const weather = useWeather();
    const [theme, toggleTheme] = useTheme();
    const [time, setTime] = useState('');
    useEffect(() => {
        const tick = () =>
            setTime(
                new Intl.DateTimeFormat('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: 'Asia/Kolkata',
                })
                    .format(new Date())
                    .replace(/,/g, ''),
            );
        tick();
        const t = setInterval(tick, 30000);
        return () => clearInterval(t);
    }, []);
    useEffect(() => {
        if (!menu) return;
        const close = (e: MouseEvent) => {
            if (!(e.target as Element).closest('.system-menu')) setMenu(false);
        };
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setMenu(false);
                document
                    .querySelector<HTMLButtonElement>('.system-brand')
                    ?.focus();
            }
        };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', key);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', key);
        };
    }, [menu]);
    return (
        <>
            <div className="system-menu">
                <button
                    className="system-brand"
                    aria-label="Workspace menu"
                    aria-controls="workspace-menu"
                    aria-expanded={menu}
                    onClick={() => setMenu(!menu)}
                >
                    <svg
                        className="system-logo"
                        viewBox="0 0 24 28"
                        aria-hidden="true"
                    >
                        <path d="M17.5 0c.3 2.6-1.6 5.1-4.1 5.6C13 3.2 15.2.5 17.5 0ZM20.9 21.2c-1.1 2.5-2.8 5.9-5.3 5.8-1.7-.1-2.1-1-4-1s-2.5 1-4 1C4.8 27 .6 20.7.6 15.6c0-4.8 2.7-7.6 5.8-7.6 1.7 0 3.6 1.1 4.6 1.1S14.1 8 16.1 8c2.1 0 4 1.1 5.1 2.6-4.3 2.4-3.8 8.3-.3 10.6Z" />
                    </svg>
                </button>
                <button
                    className="system-action system-app"
                    onClick={() => launch('My Portfolio')}
                >
                    Portfolio
                </button>
                <button
                    className="system-action"
                    onClick={() => launch('Begu')}
                >
                    Begu
                </button>
                <button
                    className="system-action"
                    onClick={() => launch('Credits')}
                >
                    About
                </button>
                <span className="system-spacer" />
                {weather.length > 0 && (
                    <span
                        className="system-weather"
                        title={weather
                            .map((c) => `${c.name} (${c.note}): ${c.temp}°C, ${c.condition}`)
                            .join(' · ')}
                    >
                        {weather.map((c) => `${c.id.toUpperCase()} ${c.temp}°`).join('  ')}
                    </span>
                )}
                <button
                    className="system-appearance"
                    onClick={toggleTheme}
                    aria-pressed={theme === 'dark'}
                    aria-label={theme === 'dark' ? 'Use light mode' : 'Use dark mode'}
                    title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                >
                    {theme === 'dark' ? (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="12" cy="12" r="4.2" />
                            <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6Z" />
                        </svg>
                    )}
                </button>
                <span className="system-status" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                        <path d="M2 8.6a15 15 0 0 1 20 0M5 12.2a10 10 0 0 1 14 0M8.2 15.8a5 5 0 0 1 7.6 0M12 19.5h.01" />
                    </svg>
                    <svg viewBox="0 0 28 14" className="system-battery">
                        <rect x="1" y="1.5" width="22" height="11" rx="3" />
                        <rect
                            x="24.5"
                            y="5"
                            width="2"
                            height="4"
                            rx="1"
                            fill="currentColor"
                            stroke="none"
                        />
                        <rect
                            x="3"
                            y="3.5"
                            width="15"
                            height="7"
                            rx="1.5"
                            fill="currentColor"
                            stroke="none"
                        />
                    </svg>
                    <svg viewBox="0 0 24 24">
                        <circle cx="10.5" cy="10.5" r="6.5" />
                        <path d="M15.5 15.5 21 21" />
                    </svg>
                    <svg viewBox="0 0 24 24">
                        <rect x="3" y="5" width="18" height="5.5" rx="2.75" />
                        <circle
                            cx="16.5"
                            cy="7.75"
                            r="1.6"
                            fill="currentColor"
                            stroke="none"
                        />
                        <rect
                            x="3"
                            y="13.5"
                            width="18"
                            height="5.5"
                            rx="2.75"
                        />
                        <circle
                            cx="7.5"
                            cy="16.25"
                            r="1.6"
                            fill="currentColor"
                            stroke="none"
                        />
                    </svg>
                </span>
                <time title="Ahmedabad, India · IST">{time}</time>
                {menu && (
                    <div className="start-menu" id="workspace-menu">
                        <strong>Nihar’s workspace</strong>
                        <a href="/" target="_top">
                            Back to the room
                        </a>
                        <button
                            onClick={() => {
                                launch('Credits');
                                setMenu(false);
                            }}
                        >
                            About this workspace
                        </button>
                        <button
                            onClick={() => {
                                setMenu(false);
                                shutdown();
                            }}
                        >
                            Shut down
                        </button>
                    </div>
                )}
            </div>
            <footer className="os-dock" aria-label="Applications">
                {PINNED.map((app) => {
                    const entry = Object.entries(windows).find(
                        ([, w]) => w.name === app.name,
                    );
                    return (
                        <button
                            key={app.name}
                            className="dock-app"
                            aria-label={app.label}
                            onClick={() => {
                                if (!entry) return launch(app.name);
                                const [key, w] = entry;
                                const top = Math.max(
                                    ...Object.values(windows).map(
                                        (x) => x.zIndex,
                                    ),
                                );
                                if (w.minimized || w.zIndex !== top)
                                    toggleMinimize(key);
                            }}
                        >
                            <Icon icon={app.icon} size={52} />
                            <span className="dock-tooltip">{app.label}</span>
                            {entry && <i />}
                        </button>
                    );
                })}
                <span className="dock-divider" />
                {Object.entries(windows)
                    .filter(([, w]) => !PINNED.some((a) => a.name === w.name))
                    .map(([key, w]) => (
                        <button
                            key={key}
                            className="dock-window"
                            aria-label={
                                (w.minimized ? 'Restore ' : 'Minimize ') +
                                w.name
                            }
                            aria-pressed={!w.minimized}
                            onClick={() => toggleMinimize(key)}
                        >
                            <Icon icon={w.icon} size={52} />
                            <span className="dock-tooltip">{w.name}</span>
                            <i />
                        </button>
                    ))}
                {/* Trash sits past the divider as in macOS; it has nothing to open here. */}
                <span className="dock-app dock-trash" aria-hidden="true">
                    <Icon icon="trash" size={52} />
                    <span className="dock-tooltip">Trash</span>
                </span>
            </footer>
        </>
    );
}
