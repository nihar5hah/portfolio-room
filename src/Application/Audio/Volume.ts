/**
 * A media element's volume, on every browser.
 *
 * iOS and iPadOS Safari ignore `HTMLMediaElement.volume`: every element plays
 * at full level, so the music meant for 6% played at 100%, and the ambience
 * crossfades and the rain's fade did nothing. There, and only there, each
 * element plays through a Web Audio gain node instead.
 *
 * Gain only. The room keeps no live filters (see AudioManager.ts: a lowpass
 * retuned every frame once ran away into a screech); a fixed gain node has
 * nothing to run away. Everywhere else this is exactly `el.volume = v`.
 */

let fixed: boolean | undefined;
let context: AudioContext | null | undefined;
const gains = new WeakMap<
    HTMLMediaElement,
    { source: MediaElementAudioSourceNode; gain: GainNode }
>();

/** True where setting `volume` has no effect (iOS and iPadOS Safari). */
export function volumeIsFixed() {
    if (fixed === undefined) {
        try {
            const probe = document.createElement('audio');
            probe.volume = 0.5;
            fixed = probe.volume !== 0.5;
        } catch {
            fixed = false;
        }
    }
    return fixed;
}

function audioContext() {
    if (context !== undefined) return context;
    const Context: typeof AudioContext | undefined =
        window.AudioContext ?? (window as any).webkitAudioContext;
    try {
        context = Context ? new Context() : null;
    } catch {
        context = null;
    }
    if (context) {
        // Made before the visitor's first tap it starts suspended, which is
        // silent, never loud; a tap (Enter) starts it, and brings it back
        // after the phone locks or a call interrupts.
        const wake = () => {
            if (context && context.state !== 'running')
                void context.resume().catch(() => undefined);
        };
        for (const type of ['pointerdown', 'touchend', 'click', 'keydown'])
            document.addEventListener(type, wake, true);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) wake();
        });
    }
    return context;
}

/** Set `el` to `volume` (0 to 1). */
export function setVolume(el: HTMLMediaElement, volume: number) {
    const level = Math.min(
        1,
        Math.max(0, Number.isFinite(volume) ? volume : 0),
    );
    if (!volumeIsFixed()) {
        el.volume = level;
        return;
    }
    let node = gains.get(el);
    if (!node) {
        const ctx = audioContext();
        if (!ctx) return;
        try {
            // Cross-origin media (the music host) must be fetched with CORS
            // (`crossOrigin` set before its src), or this plays silence.
            const source = ctx.createMediaElementSource(el);
            const gain = ctx.createGain();
            source.connect(gain);
            gain.connect(ctx.destination);
            node = { source, gain };
            gains.set(el, node);
        } catch {
            return;
        }
    }
    node.gain.gain.value = level;
}

/** A one-shot sound is done: let its gain node go. */
export function releaseVolume(el: HTMLMediaElement) {
    const node = gains.get(el);
    if (!node) return;
    node.source.disconnect();
    node.gain.disconnect();
    gains.delete(el);
}
