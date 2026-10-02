/**
 * A media element's volume, on every browser.
 *
 * iOS and iPadOS ignore `HTMLMediaElement.volume` for what you hear: every
 * element plays at full level, so the music meant for 6% played at 100%,
 * and the ambience crossfades and the rain's fade did nothing. Current iOS
 * even reads the set value back, so this can't be detected by setting it:
 * Apple's mobile devices are recognised by name (or, for iPads that report
 * a Mac, by their touch screen). There, and only there, each element plays
 * through a Web Audio gain node instead.
 *
 * Gain only. The room keeps no live filters (see AudioManager.ts: a lowpass
 * retuned every frame once ran away into a screech); a fixed gain node has
 * nothing to run away. Everywhere else this is exactly `el.volume = v`.
 *
 * `?audiodebug` in the address shows what is in effect, for checking on a
 * phone (development builds and `DEBUG_TOOLS=1` builds only).
 */
/** Debug tools: dev builds and `DEBUG_TOOLS=1 npm run build` only (webpack). */
declare const __DEBUG_TOOLS__: boolean | undefined;

let fixed: boolean | undefined;
let context: AudioContext | null | undefined;
type Node = { source: MediaElementAudioSourceNode; gain: GainNode };
const gains = new WeakMap<HTMLMediaElement, Node>();
/** Every element given a level, for `?audiodebug`. */
const levels = new Map<HTMLMediaElement, number>();

/** iPhone, iPod or iPad (including iPads that report a Mac). */
export function isAppleMobile() {
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as Navigator & { platform?: string };
    const ua = nav.userAgent ?? '';
    return (
        /iPhone|iPad|iPod/.test(ua) ||
        ((nav.platform === 'MacIntel' || /Macintosh/.test(ua)) &&
            (nav.maxTouchPoints ?? 0) > 1)
    );
}

/** True where setting `volume` has no audible effect (iOS and iPadOS). */
export function volumeIsFixed() {
    if (fixed === undefined) {
        fixed = isAppleMobile();
        // Older iOS also reads volume back as 1 whatever is set.
        if (!fixed)
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
        // Plain <audio> ignores the ring/silent switch; through Web Audio
        // the room would go quiet on a silenced phone. Keep it like media.
        const session = (navigator as any).audioSession;
        if (session)
            try {
                session.type = 'playback';
            } catch {
                // Older Safari: no Audio Session API.
            }
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
    levels.set(el, level);
    if (!volumeIsFixed()) {
        el.volume = level;
        return;
    }
    let node = gains.get(el);
    if (!node) {
        const ctx = audioContext();
        try {
            if (!ctx) throw new Error('No Web Audio');
            // Cross-origin media (the music host) must be fetched with CORS
            // (`crossOrigin` set before its src), or this plays silence.
            const source = ctx.createMediaElementSource(el);
            const gain = ctx.createGain();
            source.connect(gain);
            gain.connect(ctx.destination);
            node = { source, gain };
            gains.set(el, node);
        } catch {
            el.volume = level; // the best this browser allows
            return;
        }
    }
    node.gain.gain.value = level;
}

/** A one-shot sound is done: let its gain node go. */
export function releaseVolume(el: HTMLMediaElement) {
    levels.delete(el);
    const node = gains.get(el);
    if (!node) return;
    node.source.disconnect();
    node.gain.disconnect();
    gains.delete(el);
}

/** What is in effect, one line per playing element (for `?audiodebug`). */
export function describeVolume() {
    const lines = [
        `device: ${isAppleMobile() ? 'iPhone/iPad' : 'other'}`,
        `levels by: ${volumeIsFixed() ? 'gain node' : 'element volume'}`,
        `audio context: ${context ? context.state : 'none'}`,
    ];
    for (const [el, level] of levels) {
        const name = (el.currentSrc || el.src).split('/').pop() || '?';
        const node = gains.get(el);
        lines.push(
            `${el.paused ? '·' : '▶'} ${name}: ${Math.round(level * 1000) / 10}%` +
                (node ? ` (gain ${node.gain.gain.value.toFixed(3)})` : ''),
        );
    }
    return lines.join('\n');
}

/** `?audiodebug`: a small readout of the above, refreshed every second. */
export function showVolumeDebug() {
    if (
        !(typeof __DEBUG_TOOLS__ !== 'undefined' && __DEBUG_TOOLS__) ||
        !/[?&]audiodebug\b/.test(location.search)
    )
        return;
    const panel = document.createElement('pre');
    panel.style.cssText =
        'position:fixed;left:8px;top:8px;z-index:2147483647;margin:0;' +
        'padding:8px 10px;max-width:calc(100vw - 16px);overflow:hidden;' +
        'font:11px/1.4 ui-monospace,monospace;color:#9fe3fa;' +
        'background:rgba(0,0,0,.78);border-radius:8px;pointer-events:none;' +
        'white-space:pre-wrap';
    document.body.append(panel);
    const update = () => (panel.textContent = describeVolume());
    update();
    setInterval(update, 1000);
}
