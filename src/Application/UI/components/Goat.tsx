import React, { useEffect, useState } from 'react';
import bus from '../EventBus';
import assetUrl from '../../Utils/assetUrl';

/** Messi pointing to the sky, Quito 2017 (ANDES, CC BY-SA 2.0; see Credits). */
const PHOTO = assetUrl('/room/messi-goat.webp');

/**
 * Clicking either framed No. 10 shirt: Messi from behind, pointing up for
 * his grandmother, rises out of the dark in front of the word GOAT, then
 * both fade away. Nothing to close; it never blocks the room.
 */
export default function Goat() {
    const [shown, setShown] = useState(0);
    // Fetched once the room has settled, so the first click is instant.
    useEffect(() => {
        const t = setTimeout(() => (new Image().src = PHOTO), 6000);
        return () => clearTimeout(t);
    }, []);
    useEffect(
        () =>
            bus.on('openMessi', () => {
                setShown(Date.now());
            }),
        [],
    );
    useEffect(() => {
        if (!shown) return;
        const t = setTimeout(() => setShown(0), 3400);
        return () => clearTimeout(t);
    }, [shown]);
    if (!shown) return null;
    return (
        // Re-keyed so a second click replays it.
        <div
            key={shown}
            className="goat"
            role="status"
            aria-label="GOAT: Lionel Messi pointing to the sky"
        >
            <p className="goat-word">GOAT</p>
            {/* The glow sits on this wrapper, the fade on the photo: on one
                element the fade's box would clip the glow into a rectangle. */}
            <div className="goat-messi">
                <img src={PHOTO} alt="" decoding="async" />
            </div>
        </div>
    );
}
