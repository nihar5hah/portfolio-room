import React, {
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import Colors from '../../constants/colors';
import ShowcaseExplorer from '../applications/ShowcaseExplorer';
import ShutdownSequence from './ShutdownSequence';
import Toolbar from './Toolbar';
import { IconName } from '../../assets/icons';
import GEOMETRY, { WindowGeometry } from '../applications/geometry';
import lazyApp, { LazyApp } from './lazyApp';
import WindowPlaceholder, { AppErrorBoundary } from './WindowPlaceholder';
import * as windowState from './windowState';

export interface DesktopProps {}

interface Application {
    key: string;
    name: string;
    /** The app window's title, for the frame shown while its code loads. */
    title: string;
    shortcutIcon: IconName;
    geometry: () => WindowGeometry;
    /** Apps that start with the desktop are bundled with it... */
    component?: React.ComponentType<WindowAppProps>;
    /** ...the rest download the first time they open. */
    lazy?: LazyApp<WindowAppProps>;
}

const APPLICATIONS: { [key in string]: Application } = {
    showcase: {
        key: 'showcase',
        name: 'My Portfolio',
        title: 'Nihar Shah',
        shortcutIcon: 'showcaseIcon',
        geometry: GEOMETRY.showcase,
        component: ShowcaseExplorer,
    },
    henordle: {
        key: 'henordle',
        name: 'Word game',
        title: 'Word game',
        shortcutIcon: 'henordleIcon',
        geometry: GEOMETRY.henordle,
        lazy: lazyApp(
            () =>
                import(
                    /* webpackChunkName: "desktop-wordle" */ '../applications/Henordle'
                ),
        ),
    },
    begu: {
        key: 'begu',
        name: 'Begu',
        title: 'Begu',
        shortcutIcon: 'begu',
        geometry: GEOMETRY.begu,
        lazy: lazyApp(
            () =>
                import(
                    /* webpackChunkName: "desktop-begu" */ '../applications/Begu'
                ),
        ),
    },
    music: {
        key: 'music',
        name: 'Music',
        title: 'Music',
        shortcutIcon: 'music',
        geometry: GEOMETRY.music,
        lazy: lazyApp(
            () =>
                import(
                    /* webpackChunkName: "desktop-music" */ '../applications/Music'
                ),
        ),
    },
    resume: {
        key: 'resume',
        name: 'Résumé',
        title: 'Résumé — Nihar Shah',
        shortcutIcon: 'resume',
        geometry: GEOMETRY.resume,
        lazy: lazyApp(
            () =>
                import(
                    /* webpackChunkName: "desktop-resume" */ '../applications/Resume'
                ),
        ),
    },
    credits: {
        key: 'credits',
        name: 'Credits',
        title: 'About this computer',
        shortcutIcon: 'credits',
        geometry: GEOMETRY.credits,
        lazy: lazyApp(
            () =>
                import(
                    /* webpackChunkName: "desktop-credits" */ '../applications/Credits'
                ),
        ),
    },
};

const isApp = (key: unknown): key is string =>
    typeof key === 'string' &&
    Object.prototype.hasOwnProperty.call(APPLICATIONS, key);

const keyForName = (name: string) =>
    Object.keys(APPLICATIONS).find((key) => APPLICATIONS[key].name === name);

interface WindowSlotProps {
    appKey: string;
    zIndex: number;
    minimized: boolean;
    active: boolean;
    onInteract: (key: string) => void;
    onClose: (key: string) => void;
    onMinimize: (key: string) => void;
}

/**
 * One open window. Memoised with callbacks bound once per window, so raising,
 * focusing or minimising one window leaves the others (and their apps) alone.
 */
const WindowSlot = React.memo(function WindowSlot({
    appKey,
    zIndex,
    minimized,
    active,
    onInteract,
    onClose,
    onMinimize,
}: WindowSlotProps) {
    const app = APPLICATIONS[appKey];
    const [attempt, setAttempt] = useState(0);
    const interact = useCallback(
        () => onInteract(appKey),
        [onInteract, appKey],
    );
    const close = useCallback(() => onClose(appKey), [onClose, appKey]);
    const minimize = useCallback(
        () => onMinimize(appKey),
        [onMinimize, appKey],
    );
    const retry = useCallback(() => {
        app.lazy?.retry();
        setAttempt((n) => n + 1);
    }, [app]);
    const placeholder = (failed: boolean) => (
        <WindowPlaceholder
            title={app.title}
            geometry={app.geometry}
            active={active}
            onInteract={interact}
            onClose={close}
            onMinimize={minimize}
            onRetry={failed ? retry : undefined}
        />
    );
    // Chosen once per mount (and per retry), never switched while mounted: an
    // app whose code already arrived (hover preload, or opened before) renders
    // straight away instead of suspending for a frame.
    const App = useMemo(
        () =>
            app.lazy ? (app.lazy.loaded ?? app.lazy.Component) : app.component!,
        [app, attempt], // eslint-disable-line react-hooks/exhaustive-deps
    );
    return (
        <div style={minimized ? { zIndex, ...styles.minimized } : { zIndex }}>
            <AppErrorBoundary key={attempt} fallback={placeholder(true)}>
                <Suspense fallback={placeholder(false)}>
                    <App
                        active={active}
                        onInteract={interact}
                        onClose={close}
                        onMinimize={minimize}
                    />
                </Suspense>
            </AppErrorBoundary>
        </div>
    );
});

const Desktop: React.FC<DesktopProps> = (props) => {
    const [windows, setWindows] = useState<DesktopWindows>({});

    const [shutdown, setShutdown] = useState(false);
    // Clicking bare wallpaper leaves no window active, like clicking the macOS desktop.
    const [desktopFocused, setDesktopFocused] = useState(false);
    const visible = Object.entries(windows).filter(([, w]) => !w.minimized);
    const topKey = visible.length
        ? visible.reduce((a, b) => (b[1].zIndex > a[1].zIndex ? b : a))[0]
        : null;
    const [numShutdowns, setNumShutdowns] = useState(1);

    const rebootDesktop = useCallback(() => {
        setWindows({});
    }, []);

    useEffect(() => {
        if (shutdown === true) {
            rebootDesktop();
        }
    }, [shutdown, rebootDesktop]);

    // Open an app, or bring its window back to the front. Every window change
    // (see windowState.ts) keeps the previous state when nothing would change, so
    // clicks and focus in the front window don't re-render the desktop at all.
    const openApp = useCallback((key: string) => {
        if (!isApp(key)) return;
        const { name, shortcutIcon: icon } = APPLICATIONS[key];
        setDesktopFocused(false);
        setWindows((prev) => windowState.open(prev, key, { name, icon }));
    }, []);

    const launch = useCallback(
        (name: string) => {
            const key = keyForName(name);
            if (key) openApp(key);
        },
        [openApp],
    );

    // Hovering a dock icon starts fetching that app's code.
    const preload = useCallback((name: string) => {
        const key = keyForName(name);
        key && APPLICATIONS[key].lazy?.preload().catch(() => undefined);
    }, []);

    useEffect(() => {
        openApp('showcase');
        const requested = new URLSearchParams(location.search).get('app');
        if (requested && requested !== 'showcase') openApp(requested);
    }, [openApp]);

    useEffect(() => {
        const open = () => openApp('begu');
        const openResume = () => openApp('resume');
        // The room asks for an app when a visitor clicks an object (turntable,
        // bookshelf, jerseys, Begu). Route is a portfolio page such as /notes.
        const openRoute = (key: string, route?: string) => {
            if (typeof route === 'string' && /^\/[a-z-/]*$/.test(route))
                location.hash = route;
            openApp(key);
        };
        const receive = (event: MessageEvent) => {
            if (
                event.origin !== location.origin ||
                event.source !== window.parent
            )
                return;
            if (event.data?.type === 'openBegu') open();
            else if (event.data?.type === 'openApp' && isApp(event.data.app))
                openRoute(event.data.app, event.data.route);
        };
        window.addEventListener('message', receive);
        window.addEventListener('openBegu', open);
        window.addEventListener('openResume', openResume);
        return () => {
            window.removeEventListener('message', receive);
            window.removeEventListener('openBegu', open);
            window.removeEventListener('openResume', openResume);
        };
    }, [openApp]);

    const removeWindow = useCallback((key: string) => {
        setWindows((prev) => windowState.close(prev, key));
    }, []);

    // Standalone only: inside the room, Escape belongs to the camera (Step back).
    useEffect(() => {
        if (window.parent !== window) return;
        const close = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || !topKey || desktopFocused) return;
            if (document.querySelector('#workspace-menu')) return; // menu closes first
            const field = (event.target as HTMLElement)?.closest?.(
                'input, textarea',
            );
            if (field && (field as HTMLInputElement).value) return;
            removeWindow(topKey);
        };
        window.addEventListener('keydown', close);
        return () => window.removeEventListener('keydown', close);
    }, [topKey, desktopFocused, removeWindow]);

    const minimizeWindow = useCallback((key: string) => {
        setWindows((prev) => windowState.minimize(prev, key));
    }, []);

    const toggleMinimize = useCallback((key: string) => {
        setWindows((prev) => windowState.toggle(prev, key));
    }, []);

    // Called on every mousedown and focus inside a window (both fire for one
    // click): a no-op unless the window is behind another or the wallpaper
    // had focus, so the second call never renders.
    const onWindowInteract = useCallback((key: string) => {
        setDesktopFocused(false);
        setWindows((prev) => windowState.raise(prev, key));
    }, []);

    const startShutdown = useCallback(() => {
        setTimeout(() => {
            setShutdown(true);
            setNumShutdowns((n) => n + 1);
        }, 600);
    }, []);

    return !shutdown ? (
        <div
            style={styles.desktop}
            className="os-desktop"
            onMouseDown={(event) => {
                const target = event.target as HTMLElement;
                if (
                    target === event.currentTarget ||
                    target.classList.contains('desktop-wallpaper')
                )
                    setDesktopFocused(true);
            }}
        >
            <div className="desktop-wallpaper" aria-hidden="true">
                <span>
                    Make room
                    <br />
                    for good ideas.
                </span>
                <small>NIHAR’S WORKSPACE</small>
            </div>
            {Object.keys(windows).map((key) => (
                <WindowSlot
                    key={`win-${key}`}
                    appKey={key}
                    zIndex={windows[key].zIndex}
                    minimized={windows[key].minimized}
                    active={!desktopFocused && key === topKey}
                    onInteract={onWindowInteract}
                    onClose={removeWindow}
                    onMinimize={minimizeWindow}
                />
            ))}
            <Toolbar
                windows={windows}
                toggleMinimize={toggleMinimize}
                shutdown={startShutdown}
                launch={launch}
                preload={preload}
            />
        </div>
    ) : (
        <ShutdownSequence
            setShutdown={setShutdown}
            numShutdowns={numShutdowns}
        />
    );
};

const styles: StyleSheetCSS = {
    desktop: {
        minHeight: '100%',
        flex: 1,
        backgroundColor: Colors.turquoise,
    },
    minimized: {
        display: 'none',
    },
};

export default Desktop;
