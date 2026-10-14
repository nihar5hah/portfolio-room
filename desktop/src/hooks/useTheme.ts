import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'nihar-desktop-theme';

/** The visitor's saved choice, else their system setting (macOS "Auto"). */
export function initialTheme(): Theme {
    let saved: string | null = null;
    try {
        saved = localStorage.getItem(KEY);
    } catch {
        // Storage blocked: follow the system setting.
    }
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
}

export function applyTheme(theme: Theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
}

export default function useTheme(): [Theme, () => void] {
    const [theme, setTheme] = useState<Theme>(initialTheme);
    useEffect(() => applyTheme(theme), [theme]);
    const toggle = () =>
        setTheme((current) => {
            const next = current === 'dark' ? 'light' : 'dark';
            try {
                localStorage.setItem(KEY, next);
            } catch {
                // Storage blocked: the choice lasts for this visit only.
            }
            return next;
        });
    return [theme, toggle];
}
