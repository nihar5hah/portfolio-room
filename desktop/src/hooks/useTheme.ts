import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'nihar-desktop-theme';

/** The visitor's saved choice, else their system setting (macOS "Auto"). */
export function initialTheme(): Theme {
    const saved = localStorage.getItem(KEY);
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
            localStorage.setItem(KEY, next);
            return next;
        });
    return [theme, toggle];
}
