import AlbumAudio from './AlbumAudio';
import bus from '../UI/EventBus';
import { releaseVolume, setVolume } from './Volume';

/**
 * Room ambience and computer feedback on plain <audio> elements: the same
 * playback path as the music. No Web Audio processing anywhere; only on
 * iOS, which ignores element volume, does each element get a plain gain
 * node (Volume.ts) so its level applies at all.
 *
 * Why: the room first used a Three/Web Audio graph whose lowpass filter was
 * retuned from the camera every frame. It ran away into a full-scale screech
 * that also silenced the music. A rebuilt, bounded Web Audio graph still drew
 * screech reports around laptop open/close in the embedded browser, while the
 * music element never did. So every room sound now plays the way the music
 * does: decoded by the media pipeline, with only element volumes changing.
 * "Muffled at the Mac" is a pre-rendered file (600 Hz lowpass of the loop),
 * crossfaded by volume; nothing is ever filtered live.
 */
const EFFECTS = {
    startup: ['startup/startup.mp3'],
    mouseDown: ['mouse/mouse_down.mp3'],
    mouseUp: ['mouse/mouse_up.mp3'],
    keyboardKeydown: [1, 2, 3, 4, 5, 6].map((n) => `keyboard/key_${n}.mp3`),
    ccType: ['cc/type.mp3'],
    thunder: ['atmosphere/thunder.mp3'],
};
type Effect = keyof typeof EFFECTS;
const MAX_EFFECTS = 4;
const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

function element(file: string, loop = false) {
    const el = document.createElement('audio');
    el.src = `/audio/${file}`;
    // Sound starts off: nothing is fetched until the visitor turns it on
    // (the ambience alone is ~0.9 MB).
    el.preload = 'none';
    el.loop = loop;
    return el;
}

export default class AudioManager {
    readonly album = new AlbumAudio();
    /** Same 22.07 s loop, plain and pre-muffled, kept in step. */
    readonly dry = element('atmosphere/office.mp3', true);
    readonly wet = element('atmosphere/office-muffled.mp3', true);
    /**
     * Rain against the window while it is raining in Bangalore (Weather.ts),
     * synthesized for the room (scripts/make-rain.py). Loaded only once it
     * rains; eased in and out by volume.
     */
    readonly rain = element('atmosphere/rain.mp3', true);
    rainTarget = 0;
    rainLevel = 0;
    templates = {} as Record<Effect, HTMLAudioElement[]>;
    playing = new Set<HTMLAudioElement>();
    entered = false;
    muted = true;
    muffle = 0;
    level = 0.075;
    lastKey = '';

    constructor() {
        this.rain.preload = 'none';
        setVolume(this.rain, 0);
        bus.on('weather', (state: { rain: number }) => {
            this.rainTarget = state.rain;
            this.startAmbience();
        });
        // Thunder rolls in a second or two after the flash.
        bus.on('lightning', () =>
            setTimeout(
                () => this.play('thunder', 0.18 + Math.random() * 0.12),
                900 + Math.random() * 2200,
            ),
        );
        for (const name of Object.keys(EFFECTS) as Effect[])
            this.templates[name] = EFFECTS[name].map((file) => element(file));
        this.applyMix();
        bus.on('muteToggle', (muted: boolean) => this.setMuted(muted));
        bus.on('loadingScreenDone', () => {
            this.entered = true;
            this.startAmbience();
            this.play('startup', 0.25);
        });
        // The browser pauses media in hidden or back/forward-cached pages;
        // pick the room (and the music) back up when the page returns.
        window.addEventListener('pageshow', () => this.resume());
        document.addEventListener('resume', () => this.resume()); // unfrozen
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.resume();
        });
        this.listenForInput();
    }

    setMuted(muted: boolean) {
        this.muted = muted;
        if (!muted) {
            // Now worth having ready: the loops and the click/key sounds.
            for (const el of [
                this.dry,
                this.wet,
                ...Object.values(this.templates).flat(),
            ])
                if (el.preload === 'none') el.preload = 'auto';
            return this.startAmbience();
        }
        this.dry.pause();
        this.wet.pause();
        this.rain.pause();
        for (const el of Array.from(this.playing)) this.release(el);
    }

    startAmbience() {
        if (!this.entered || this.muted) return;
        this.applyMix();
        if (Math.abs(this.wet.currentTime - this.dry.currentTime) > 0.05)
            this.wet.currentTime = this.dry.currentTime;
        for (const el of [this.dry, this.wet])
            if (el.paused) void el.play().catch(() => undefined);
        if (this.rainTarget > 0 && this.rain.paused)
            void this.rain.play().catch(() => undefined);
    }

    resume() {
        if (!this.entered || this.muted) return;
        this.startAmbience();
        this.album.resume();
    }

    /** Muffled and quieter at the Mac, open across the room. Every frame. */
    update(distance: number, dt = 1 / 60) {
        if (!Number.isFinite(distance)) return;
        // Rain eases over a few seconds; quieter (behind the screen) at the Mac.
        const rainLevel =
            this.rainLevel +
            (this.rainTarget - this.rainLevel) * Math.min(1, dt * 0.5);
        this.rainLevel =
            Math.abs(rainLevel - this.rainTarget) < 0.002
                ? this.rainTarget
                : rainLevel;
        const muffled = 1 - clamp((distance - 1500) / 9500, 0, 1);
        setVolume(this.rain, this.rainLevel * 0.16 * (1 - 0.6 * muffled));
        if (this.rainLevel === 0 && this.rainTarget === 0 && !this.rain.paused)
            this.rain.pause();
        const muffle = muffled;
        const level = clamp(((distance - 1200) / 8800) * 0.15, 0.0375, 0.075);
        if (
            Math.abs(muffle - this.muffle) < 0.01 &&
            Math.abs(level - this.level) < 0.001
        )
            return;
        this.muffle = muffle;
        this.level = level;
        this.applyMix();
    }

    applyMix() {
        setVolume(this.dry, this.level * (1 - this.muffle));
        setVolume(this.wet, this.level * this.muffle);
    }

    /** One-shot effect; excess overlapping input is dropped, not queued. */
    play(name: Effect, volume: number, cents = 0) {
        if (!this.entered || this.muted) return;
        if (this.playing.size >= MAX_EFFECTS) return;
        const variants = this.templates[name];
        const template = variants[Math.floor(Math.random() * variants.length)];
        // Clones share the template's already-fetched media resource.
        const el = template.cloneNode() as HTMLAudioElement;
        setVolume(el, volume);
        if (cents) {
            const rate = 2 ** (cents / 1200);
            el.defaultPlaybackRate = el.playbackRate = rate;
            el.preservesPitch = false; // pitch up, as the original did
            (el as any).webkitPreservesPitch = false;
        }
        this.playing.add(el);
        const release = () => this.release(el);
        el.onended = release;
        el.onerror = release;
        void el.play().catch(release);
    }

    release(el: HTMLAudioElement) {
        if (!this.playing.delete(el)) return;
        el.onended = el.onerror = null;
        el.pause();
        releaseVolume(el);
        el.removeAttribute('src');
        el.load(); // frees the player
    }

    /** Clicks and keys inside the Mac (the iframe forwards them as inComputer). */
    listenForInput() {
        document.addEventListener('mousedown', (event: any) => {
            if (event.inComputer) this.play('mouseDown', 0.16);
        });
        document.addEventListener('mouseup', (event: any) => {
            if (event.inComputer) this.play('mouseUp', 0.16);
        });
        document.addEventListener('keyup', (event: any) => {
            if (event.inComputer) this.lastKey = '';
        });
        document.addEventListener('keydown', (event: any) => {
            const key = String(event.key ?? '');
            if (key.includes('_AUTO_')) return this.play('ccType', 0.1, 2000);
            if (this.lastKey === key) return;
            this.lastKey = key;
            if (event.inComputer) this.play('keyboardKeydown', 0.16);
        });
    }
}
