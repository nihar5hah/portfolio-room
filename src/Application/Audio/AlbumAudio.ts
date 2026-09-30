import bus from '../UI/EventBus';
import audioLibrary from '../../../config/audio-library.json';
import { setVolume } from './Volume';

/** Background level for the album player. */
const VOLUME = 0.06;
export const ALBUMS = {
    mbdtf: 'MBDTF',
    jackboys: 'JACKBOYS',
    rodeo: 'Rodeo',
    tlop: 'The Life of Pablo',
    '808s': '808s & Heartbreak',
    graduation: 'Graduation',
    yeezus: 'Yeezus',
    melodicblue: 'The Melodic Blue',
    blonde: 'Blonde',
    currents: 'Currents',
    longlive: 'LONG.LIVE.A$AP',
    honestly: 'Honestly, Nevermind',
    livelove: 'LIVE.LOVE.A$AP',
    atlonglast: 'AT.LONG.LAST.A$AP',
    utopia: 'UTOPIA',
    thankmelater: 'Thank Me Later',
    astroworld: 'ASTROWORLD',
    collegedropout: 'The College Dropout',
    fouryou: 'Four You',
};
type Track = { title: string; src: string; album: keyof typeof ALBUMS };
// Guards against a runaway manifest; raise it deliberately if the library grows.
export const MAX_TRACKS = 500;
export type AlbumState = {
    title: string;
    album: keyof typeof ALBUMS;
    playing: boolean;
    index: number;
    count: number;
    error: boolean;
    queue: { title: string; album: keyof typeof ALBUMS }[];
};

// Full tracks from the site or its configured audio host; shuffled on each load.
export default class AlbumAudio {
    audio = document.createElement('audio');
    tracks: Track[] = [];
    index = 0;
    entered = false;
    muted = true;
    error = false;
    failures = 0; // consecutive tracks that failed to load since the last one played
    userPaused = false; // the visitor pressed pause (not Sound off): stay paused
    sleepPaused = false; // stopped by Good Night; resumes on waking
    fade: ReturnType<typeof setInterval> | undefined;

    constructor() {
        this.audio.id = 'album-audio';
        this.audio.hidden = true;
        this.audio.preload = 'none';
        // The music host serves CORS headers; with them, iOS can set the
        // level through Volume.ts (before any src, which fixes the mode).
        this.audio.crossOrigin = 'anonymous';
        setVolume(this.audio, VOLUME);
        document.body.append(this.audio);
        this.audio.onplaying = () => {
            this.failures = 0;
            this.publish();
        };
        this.audio.onpause = () => this.publish();
        this.audio.onended = () => this.next();
        // A missing or undecodable file skips to the next song; only a library
        // where every track fails stops and offers retry.
        this.audio.onerror = () => {
            this.failures++;
            if (this.failures < this.tracks.length) return this.next(true);
            this.error = true;
            this.publish();
        };
        bus.on('muteToggle', (muted: boolean) => {
            this.muted = muted;
            if (muted) this.audio.pause();
            else this.play();
        });
        // Good Night: the music fades out and stops with the lights; waking
        // the room brings it back if it was playing.
        bus.on('goodNight', (asleep: boolean) => {
            if (asleep) {
                this.sleepPaused = !this.audio.paused && !this.error;
                if (this.sleepPaused) this.fadeOut();
            } else {
                // Waking mid-fade: stop the fade before it pauses anything.
                clearInterval(this.fade);
                setVolume(this.audio, VOLUME);
                if (this.sleepPaused && !this.userPaused) this.play();
                this.sleepPaused = false;
            }
        });
        bus.on('loadingScreenDone', () => {
            this.entered = true;
            // Enter is the visitor's gesture; don't attempt playback behind the lock screen.
            bus.dispatch('muteToggle', false);
        });
        void this.load();
    }

    async load() {
        try {
            const response = await fetch('/audio/playlist.json', {
                cache: 'no-store',
                signal: AbortSignal.timeout(10_000),
            });
            if (!response.ok) throw new Error('Library unavailable');
            const data = await response.json();
            if (!Array.isArray(data.tracks) || !data.tracks.length)
                throw new Error('Invalid library');
            if (data.tracks.length > MAX_TRACKS) {
                console.error(
                    `Music library has ${data.tracks.length} tracks; the limit is ${MAX_TRACKS} (AlbumAudio.ts).`,
                );
                throw new Error('Library too large');
            }
            this.tracks = data.tracks.map((track: Track) => {
                if (
                    typeof track.title !== 'string' ||
                    !track.title.trim() ||
                    typeof track.src !== 'string' ||
                    typeof track.album !== 'string' ||
                    !Object.prototype.hasOwnProperty.call(ALBUMS, track.album)
                )
                    throw new Error('Invalid track');
                const url = new URL(track.src, location.origin);
                const trustedHost =
                    url.protocol === 'https:' &&
                    url.origin === audioLibrary.origin;
                // Require canonical full-track paths, before URL normalization
                // can hide traversal. No previews, redirects via query strings,
                // nested paths, encoded separators, or embedded credentials.
                if (
                    (url.origin !== location.origin && !trustedHost) ||
                    !['http:', 'https:'].includes(url.protocol) ||
                    url.username ||
                    url.password ||
                    url.search ||
                    url.hash ||
                    (track.src !== url.pathname && track.src !== url.href) ||
                    !url.pathname.startsWith(`/audio/${track.album}/`) ||
                    !/^\/audio\/[^/]+\/[a-z0-9][a-z0-9._-]*\.(mp3|m4a|ogg|wav|flac)$/i.test(
                        url.pathname,
                    )
                )
                    throw new Error('Track must be a trusted full-song file');
                return {
                    title: track.title.trim().slice(0, 120),
                    src: url.href,
                    album: track.album,
                };
            });
            this.error = false;
            this.shuffle();
            this.index = 0;
            this.audio.src = this.tracks[0].src;
            this.publish();
            if (this.entered && !this.muted) this.play();
        } catch {
            // An absent album must never prevent the portfolio from opening.
            this.tracks = [];
            this.error = true;
            this.audio.pause();
            this.publish();
        }
    }

    shuffle(previous?: string) {
        for (let i = this.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
        }
        // A new round must not immediately repeat the song that just ended.
        if (this.tracks.length > 1 && this.tracks[0].src === previous) {
            const j = 1 + Math.floor(Math.random() * (this.tracks.length - 1));
            [this.tracks[0], this.tracks[j]] = [this.tracks[j], this.tracks[0]];
        }
    }

    /** Ease the volume down over ~1.2 s, then pause and restore the level. */
    fadeOut() {
        clearInterval(this.fade);
        const volume = VOLUME;
        let step = 0;
        this.fade = setInterval(() => {
            step++;
            setVolume(this.audio, volume * Math.max(0, 1 - step / 12));
            if (step < 12) return;
            clearInterval(this.fade);
            this.audio.pause();
            setVolume(this.audio, volume);
        }, 100);
    }

    play() {
        if (!this.entered || this.muted || !this.tracks.length) return;
        clearInterval(this.fade);
        setVolume(this.audio, VOLUME);
        this.userPaused = false;
        if (this.error) this.audio.src = this.tracks[this.index].src;
        this.error = false;
        this.failures = 0;
        void this.audio.play().catch(() => {
            if (!this.muted) {
                this.error = true;
                this.publish();
            }
        });
    }

    toggle() {
        if (this.audio.paused || this.error) bus.dispatch('muteToggle', false);
        else {
            this.userPaused = true;
            this.audio.pause();
        }
    }

    /** The browser paused playback (hidden page, back/forward cache): continue. */
    resume() {
        if (this.userPaused || this.error || !this.audio.paused) return;
        this.play();
    }

    next(skipping = false) {
        if (!this.tracks.length) return;
        const resume = skipping || !this.audio.paused || this.audio.ended;
        const previous = this.tracks[this.index].src;
        this.index = (this.index + 1) % this.tracks.length;
        if (this.index === 0) this.shuffle(previous);
        this.error = false;
        this.audio.src = this.tracks[this.index].src;
        this.publish();
        if (resume && !skipping) this.play();
        else if (resume && this.entered && !this.muted)
            void this.audio.play().catch(() => undefined); // keep the failure count
    }

    /** Jump to the next queued track from one album (room rug and records). */
    playAlbum(album: string) {
        if (!this.tracks.length) return;
        for (let step = 1; step <= this.tracks.length; step++) {
            const i = (this.index + step) % this.tracks.length;
            if (this.tracks[i].album !== album) continue;
            this.index = i;
            this.error = false;
            this.audio.src = this.tracks[i].src;
            this.publish();
            bus.dispatch('muteToggle', false);
            bus.dispatch('albumPicked', album);
            return;
        }
    }

    publish() {
        if (!this.tracks.length) {
            if (this.error) bus.dispatch('albumChange', null);
            return;
        }
        const state: AlbumState = {
            title: this.tracks[this.index].title,
            album: this.tracks[this.index].album,
            index: this.index,
            count: this.tracks.length,
            playing: !this.audio.paused && !this.error,
            error: this.error,
            queue: this.tracks.map(({ title, album }) => ({ title, album })),
        };
        bus.dispatch('albumChange', state);
    }
}
