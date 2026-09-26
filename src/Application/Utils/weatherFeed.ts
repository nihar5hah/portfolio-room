/**
 * One `/api/weather` request shared by everything in the room that shows
 * the weather (the lock screen's readout, the rain on the window), instead
 * of one each at start-up. A reading is reused for `maxAge` ms.
 */
let pending: { at: number; promise: Promise<unknown> } | null = null;

export function weatherFeed(maxAge = 60_000): Promise<any> {
    const now = Date.now();
    if (pending && now - pending.at < maxAge) return pending.promise;
    const promise = fetch('/api/weather')
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
    pending = { at: now, promise };
    return promise;
}
