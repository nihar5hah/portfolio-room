import React, { useEffect, useState } from 'react';
import bus from '../EventBus';

/**
 * Clicking either framed No. 10 shirt: one word over the room, then gone.
 * No card, nothing to close; it never blocks the room.
 */
export default function Goat() {
    const [shown, setShown] = useState(0);
    useEffect(() => bus.on('openMessi', () => setShown(Date.now())), []);
    useEffect(() => {
        if (!shown) return;
        const t = setTimeout(() => setShown(0), 2600);
        return () => clearTimeout(t);
    }, [shown]);
    if (!shown) return null;
    return (
        // Re-keyed so a second click replays it.
        <p
            key={shown}
            className="goat"
            role="status"
            aria-label="GOAT: Lionel Messi"
        >
            GOAT
        </p>
    );
}
