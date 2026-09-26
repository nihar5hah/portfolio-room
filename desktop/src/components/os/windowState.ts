/**
 * The desktop's window list as pure state transitions. Each returns the same
 * object when nothing would change, so React skips the render entirely: a
 * click or focus inside the front window costs nothing.
 */
type Windows = DesktopWindows;

export const highestZIndex = (windows: Windows) =>
    Math.max(0, ...Object.values(windows).map((w) => w.zIndex));

const isFront = (windows: Windows, key: string) =>
    windows[key].zIndex >= highestZIndex(windows);

/** Open a window on top, or bring an open one back to the front. */
export function open(
    windows: Windows,
    key: string,
    app: { name: string; icon: Windows[string]['icon'] },
): Windows {
    const current = windows[key];
    if (current && !current.minimized && isFront(windows, key)) return windows;
    return {
        ...windows,
        [key]: {
            zIndex: 1 + highestZIndex(windows),
            minimized: false,
            name: app.name,
            icon: app.icon,
        },
    };
}

/** A click or focus inside a window raises it above the others. */
export function raise(windows: Windows, key: string): Windows {
    if (!windows[key] || isFront(windows, key)) return windows;
    return {
        ...windows,
        [key]: { ...windows[key], zIndex: 1 + highestZIndex(windows) },
    };
}

export function close(windows: Windows, key: string): Windows {
    if (!windows[key]) return windows;
    const next = { ...windows };
    delete next[key];
    return next;
}

export function minimize(windows: Windows, key: string): Windows {
    if (!windows[key] || windows[key].minimized) return windows;
    return { ...windows, [key]: { ...windows[key], minimized: true } };
}

/**
 * A dock click on an open window: restore it if minimised, minimise it if it
 * is in front, otherwise bring it forward.
 */
export function toggle(windows: Windows, key: string): Windows {
    const w = windows[key];
    if (!w) return windows;
    const highest = highestZIndex(windows);
    const flip = w.minimized || w.zIndex === highest;
    return {
        ...windows,
        [key]: {
            ...w,
            minimized: flip ? !w.minimized : w.minimized,
            zIndex: highest + 1,
        },
    };
}
