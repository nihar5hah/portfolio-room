import bus from '../UI/EventBus';

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
export type AlbumState = {
    title: string;
    album: keyof typeof ALBUMS;
    playing: boolean;
    index: number;
    count: number;
    error: boolean;
    queue: { title: string; album: keyof typeof ALBUMS }[];
};

// Licensed, locally hosted tracks; each page load starts a fresh shuffled queue.
export default class AlbumAudio {
    audio = document.createElement('audio');
    tracks: Track[] = [];
    index = 0;
    entered = false;
    muted = true;
    error = false;

    constructor() {
        this.audio.id = 'album-audio';
        this.audio.hidden = true;
        this.audio.preload = 'none';
        this.audio.volume = 0.06;
        document.body.append(this.audio);
        this.audio.onplaying = () => this.publish();
        this.audio.onpause = () => this.publish();
        this.audio.onended = () => this.next();
        this.audio.onerror = () => {
            this.error = true;
            this.publish();
        };
        bus.on('muteToggle', (muted: boolean) => {
            this.muted = muted;
            if (muted) this.audio.pause();
            else this.play();
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
            if (
                !Array.isArray(data.tracks) ||
                !data.tracks.length ||
                data.tracks.length > 128
            )
                throw new Error('Invalid library');
            this.tracks = data.tracks.map((track: Track) => {
                if (
                    typeof track.title !== 'string' ||
                    !track.title.trim() ||
                    typeof track.src !== 'string' ||
                    !Object.prototype.hasOwnProperty.call(ALBUMS, track.album)
                )
                    throw new Error('Invalid track');
                const url = new URL(track.src, location.origin);
                if (
                    url.origin !== location.origin ||
                    !url.pathname.startsWith(`/audio/${track.album}/`) ||
                    !/\.(mp3|m4a|ogg|wav|flac)$/i.test(url.pathname)
                )
                    throw new Error('Track must be a local audio file');
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

    play() {
        if (!this.entered || this.muted || !this.tracks.length) return;
        if (this.error) this.audio.src = this.tracks[this.index].src;
        this.error = false;
        void this.audio.play().catch(() => {
            if (!this.muted) {
                this.error = true;
                this.publish();
            }
        });
    }

    toggle() {
        if (this.audio.paused || this.error) bus.dispatch('muteToggle', false);
        else this.audio.pause();
    }

    next() {
        if (!this.tracks.length) return;
        const resume = !this.audio.paused || this.audio.ended;
        const previous = this.tracks[this.index].src;
        this.index = (this.index + 1) % this.tracks.length;
        if (this.index === 0) this.shuffle(previous);
        this.error = false;
        this.audio.src = this.tracks[this.index].src;
        this.publish();
        if (resume) this.play();
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
