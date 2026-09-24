import React from 'react';
import { IconName } from '../../assets/icons';
export interface ButtonProps {
    icon?: IconName;
    text?: string;
    onClick?: () => void;
}
export default function Button({ icon, text, onClick }: ButtonProps) {
    const label =
        icon === 'maximize'
            ? 'Maximize or restore window'
            : icon === 'minimize'
              ? 'Minimize window'
              : icon === 'close'
                ? 'Close window'
                : text;
    return (
        <button
            type="button"
            className={'traffic-button traffic-' + icon}
            aria-label={label}
            title={label}
            onClick={onClick}
        >
            {/* Geometric glyphs: text characters centre on their em box, not their ink. */}
            <span aria-hidden="true">
                <svg viewBox="0 0 8 8">
                    {icon === 'close' ? (
                        <path
                            d="M1.75 1.75l4.5 4.5M6.25 1.75l-4.5 4.5"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                        />
                    ) : icon === 'minimize' ? (
                        <path
                            d="M1.5 4h5"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                        />
                    ) : (
                        <path
                            d="M1.4 1.4h4L1.4 5.4zM6.6 6.6h-4l4-4z"
                            fill="currentColor"
                        />
                    )}
                </svg>
            </span>
        </button>
    );
}
