import React, { useEffect, useState } from 'react';
import bus from '../EventBus';

/** Clicking either framed No. 10 shirt: Nihar's idol, not his profile. */
export default function MessiCard() {
    const [open, setOpen] = useState(false);
    useEffect(() => bus.on('openMessi', () => setOpen(true)), []);
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);
    if (!open) return null;
    return (
        <div
            className="messi-card"
            role="dialog"
            aria-label="Lionel Messi"
            onMouseDown={(e) => e.stopPropagation()}
        >
            <span className="messi-number" aria-hidden="true">
                10
            </span>
            <p className="messi-eyebrow">My idol</p>
            <h2>Lionel Messi</h2>
            <ul>
                <li>672 goals for Barça, the club record</li>
                <li>8 Ballon d’Or awards</li>
                <li>World Cup winner, Qatar 2022</li>
            </ul>
            <p className="messi-note">
                Barcelona 2015 and Argentina, both No. 10. Every build session
                starts under these two.
            </p>
            <button onClick={() => setOpen(false)} autoFocus>
                Close
            </button>
        </div>
    );
}
