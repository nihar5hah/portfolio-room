import React from 'react';
import { NavLink } from 'react-router-dom';
const symbols: Record<string, string> = {
    computerBig: 'M3 10 12 3l9 7v10H3z M9 20v-7h6v7',
    showcaseIcon: 'M3 6h7l2 3h9v11H3z',
    myComputer: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-3a8 8 0 0 1 16 0v3',
    windowExplorerIcon: 'M8 7V4h8v3 M3 7h18v14H3z M3 12h18 M10 12v3h4v-3',
    credits: 'M5 3h11l3 4v14H5z M9 11h6 M9 15h6',
    mail: 'M3 5h18v14H3z M3 5l9 8 9-8',
};
export default function VerticalNavbar() {
    return (
        <nav className="portfolio-nav" aria-label="Portfolio">
            <NavLink to="/" className="nav-identity">
                <span>
                    Nihar Shah<small>Ahmedabad, India</small>
                </span>
            </NavLink>
            <div className="nav-links">
                {(
                    [
                        ['/', 'Home', 'computerBig'],
                        ['/projects', 'Projects', 'showcaseIcon'],
                        ['/about', 'About', 'myComputer'],
                        ['/experience', 'Experience', 'windowExplorerIcon'],
                        ['/notes', 'Notes', 'credits'],
                        ['/contact', 'Contact', 'mail'],
                    ] as const
                ).map(([to, label, icon]) => (
                    <NavLink key={to} end={to === '/'} to={to}>
                        <svg
                            width="19"
                            height="19"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                        >
                            <path
                                d={symbols[icon]}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                        <span>{label}</span>
                    </NavLink>
                ))}
                <button
                    type="button"
                    onClick={() =>
                        window.dispatchEvent(new Event('openResume'))
                    }
                >
                    <svg
                        width="19"
                        height="19"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <path
                            d="M5 3h9l5 5v13H5z M14 3v5h5 M9 12h6 M9 16h6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                    <span>Résumé</span>
                </button>
            </div>
        </nav>
    );
}
