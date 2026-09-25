import AlbumAudio from './AlbumAudio';
import bus from '../UI/EventBus';

/**
 * Room ambience and computer feedback, built so a screech is impossible.
 *
 * The old graph retuned a live BiquadFilterNode from the camera every frame.
 * Chrome's biquad could then run away into a full-scale screech whose huge/NaN
 * samples also silenced the page's music. Now:
 * - every decoded sound is sanitized once (finite, within -1..1);
 * - the muffled ambience is rendered ONCE offline, then sanitized;
 * - the live graph is only buffer players and gains. Neither has feedback or
 *   internal state, so the output is bounded by the sum of gains (< 1) and can
 *   never run away, whatever the camera does.
 */
const SOUNDS = {
    office: ['atmosphere/office.mp3'],
    startup: ['startup/startup.mp3'],
    mouseDown: ['mouse/mouse_down.mp3'],
    mouseUp: ['mouse/mouse_up.mp3'],
    keyboardKeydown: [1, 2, 3, 4, 5, 6].map((n) => `keyboard/key_${n}.mp3`),
    ccType: ['cc/type.mp3'],
};
type SoundName = keyof typeof SOUNDS;
const MUFFLE_HZ = 600;
const MAX_EFFECTS = 4;
const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

/** Replace anything speakers must never receive: NaN, ±Infinity, > full scale. */
export function sanitize<T extends AudioBuffer>(buffer: T): T {
    for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < data.length; i++) {
            const v = data[i];
            // NaN fails every comparison and becomes silence.
            data[i] = v > 1 ? 1 : v < -1 ? -1 : v === v ? v : 0;
        }
    }
    return buffer;
}

/** Fixed lowpass applied offline, once; the live graph never holds a filter. */
async function renderMuffled(buffer: AudioBuffer): Promise<AudioBuffer> {
    const Offline =
        window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!Offline) return buffer;
    const offline: OfflineAudioContext = new Offline(
        buffer.numberOfChannels,
        buffer.length,
        buffer.sampleRate,
    );
    const source = offline.createBufferSource();
    source.buffer = buffer;
    const lowpass = offline.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = MUFFLE_HZ;
    source.connect(lowpass);
    lowpass.connect(offline.destination);
    source.start();
    return sanitize(await offline.startRendering());
}

type Ambience = {
    dry: GainNode;
    wet: GainNode;
    level: GainNode;
    muffle: number;
    volume: number;
};

export default class AudioManager {
    readonly album = new AlbumAudio();
    context?: AudioContext;
    master?: GainNode;
    buffers: { [name: string]: AudioBuffer[] } = {};
    muffledOffice?: AudioBuffer;
    ambience?: Ambience;
    entered = false;
    effects = 0;
    lastKey = '';

    constructor() {
        const Context =
            window.AudioContext || (window as any).webkitAudioContext;
        try {
            if (Context) this.context = new Context();
        } catch {
            // No Web Audio: the room stays silent, music still plays.
        }
        if (this.context) {
            this.master = this.context.createGain();
            this.master.gain.value = 0; // silent until Enter/Sound on
            this.master.connect(this.context.destination);
            void this.load();
        }
        bus.on('muteToggle', (muted: boolean) => this.setMuted(muted));
        bus.on('loadingScreenDone', () => {
            this.entered = true;
            this.startAmbience();
            this.play('startup', 0.25);
        });
        this.listenForInput();
    }

    async load() {
        const context = this.context!;
        await Promise.all(
            (Object.keys(SOUNDS) as SoundName[]).map(async (name) => {
                const decoded = await Promise.all(
                    SOUNDS[name].map(async (file) => {
                        try {
                            const response = await fetch(`/audio/${file}`);
                            if (!response.ok) return undefined;
                            const data = await response.arrayBuffer();
                            // Callback form also works on older Safari.
                            const buffer = await new Promise<AudioBuffer>(
                                (resolve, reject) =>
                                    context.decodeAudioData(
                                        data,
                                        resolve,
                                        reject,
                                    ),
                            );
                            return sanitize(buffer);
                        } catch {
                            return undefined; // a missing effect is just silent
                        }
                    }),
                );
                this.buffers[name] = decoded.filter(
                    (b): b is AudioBuffer => !!b,
                );
            }),
        );
        const office = this.buffers.office?.[0];
        if (office)
            this.muffledOffice = await renderMuffled(office).catch(
                () => office,
            );
        this.startAmbience();
    }

    setMuted(muted: boolean) {
        if (!this.context || !this.master) return;
        const now = this.context.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(muted ? 0 : 1, now, 0.05);
        if (!muted) void this.context.resume().catch(() => undefined);
    }

    /** Office loop: dry and pre-muffled copies, sample-aligned, crossfaded. */
    startAmbience() {
        const context = this.context;
        const dryBuffer = this.buffers.office?.[0];
        const wetBuffer = this.muffledOffice;
        if (!context || !this.master || !this.entered || this.ambience) return;
        if (!dryBuffer || !wetBuffer) return; // starts when loading finishes
        const level = context.createGain();
        level.gain.value = 0.075;
        level.connect(this.master);
        const dry = context.createGain();
        const wet = context.createGain();
        dry.gain.value = 1;
        wet.gain.value = 0;
        dry.connect(level);
        wet.connect(level);
        const at = context.currentTime + 0.05;
        for (const [buffer, gain] of [
            [dryBuffer, dry],
            [wetBuffer, wet],
        ] as const) {
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            source.connect(gain);
            source.start(at);
        }
        this.ambience = { dry, wet, level, muffle: 0, volume: 0.075 };
    }

    /** Muffled and quieter at the Mac, open across the room. Every frame. */
    update(distance: number) {
        const ambience = this.ambience;
        if (!ambience || !this.context || !Number.isFinite(distance)) return;
        const muffle = 1 - clamp((distance - 1500) / 9500, 0, 1);
        const volume = clamp(((distance - 1200) / 8800) * 0.15, 0.0375, 0.075);
        const now = this.context.currentTime;
        if (Math.abs(muffle - ambience.muffle) >= 0.01) {
            ambience.muffle = muffle;
            ambience.dry.gain.setTargetAtTime(1 - muffle, now, 0.08);
            ambience.wet.gain.setTargetAtTime(muffle, now, 0.08);
        }
        if (Math.abs(volume - ambience.volume) >= 0.001) {
            ambience.volume = volume;
            ambience.level.gain.setTargetAtTime(volume, now, 0.1);
        }
    }

    /** One-shot effect; excess overlapping input is dropped, not queued. */
    play(name: SoundName, volume: number, cents = 0) {
        const context = this.context;
        const variants = this.buffers[name];
        if (!context || !this.master || !variants?.length) return;
        if (this.effects >= MAX_EFFECTS) return;
        if (context.state === 'suspended')
            void context.resume().catch(() => undefined);
        const source = context.createBufferSource();
        source.buffer = variants[Math.floor(Math.random() * variants.length)];
        if (cents) source.playbackRate.value = 2 ** (cents / 1200);
        const gain = context.createGain();
        gain.gain.value = clamp(volume, 0, 1);
        source.connect(gain);
        gain.connect(this.master);
        this.effects++;
        source.onended = () => {
            this.effects--;
            source.disconnect();
            gain.disconnect();
        };
        source.start();
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
