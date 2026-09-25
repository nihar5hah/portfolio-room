import * as THREE from 'three';
import Application from '../Application';
import { AmbienceAudio, ComputerAudio } from './AudioSources';
import UIEventBus from '../UI/EventBus';
import AlbumAudio from './AlbumAudio';

const DEFAULT_REF_DISTANCE = 10000;
/**
 * A muffle is a FIXED lowpass in parallel with the dry signal, crossfaded by
 * two gains. Retuning a BiquadFilterNode every frame from the camera (the old
 * approach) drove it unstable in Chrome: a runaway full-scale screech whose
 * huge/NaN samples then silenced the page's whole audio output, music included.
 * A biquad whose coefficients never change is always stable, and gains cannot
 * go unstable, so the crossfade is safe to move every frame.
 */
type Muffle = {
    context: BaseAudioContext;
    lowpass: BiquadFilterNode;
    dry: GainNode;
    wet: GainNode;
    amount: number;
};
export default class Audio {
    application: Application;
    listener: THREE.AudioListener;
    context: AudioContext;
    loadedAudio: { [key in string]: LoadedAudio };
    audioPool: { [key in string]: THREE.PositionalAudio | THREE.Audio };
    muffles: { [key in string]: Muffle };
    audioSources: {
        computer: ComputerAudio;
        ambience: AmbienceAudio;
    };
    scene: THREE.Scene;
    album: AlbumAudio;

    constructor() {
        this.application = new Application();
        this.listener = new THREE.AudioListener();
        this.listener.setMasterVolume(0);
        this.application.camera.instance.add(this.listener);
        this.loadedAudio = this.application.resources.items.audio;
        this.scene = this.application.scene;
        this.audioPool = {};

        this.audioSources = {
            computer: new ComputerAudio(this),
            ambience: new AmbienceAudio(this),
        };

        this.context = this.listener.context;

        UIEventBus.on('muteToggle', (mute: boolean) => {
            this.listener.setMasterVolume(mute ? 0 : 1);
            if (!mute) void this.context.resume();
        });
        this.album = new AlbumAudio();
    }

    playAudio(
        sourceName: string,
        options: {
            volume?: number;
            randDetuneScale?: number;
            loop?: boolean;
            /** Fixed lowpass cutoff for setAudioMuffle; starts fully dry. */
            muffle?: { frequency: number };
            position?: THREE.Vector3;
            refDistance?: number;
            pitch?: number;
        } = {},
    ) {
        // Drop excess transient feedback instead of playing queued input as a burst.
        if (
            !options.loop &&
            Object.values(this.audioPool).filter((sound) => !sound.loop)
                .length >= 4
        )
            return;

        // Resume context if it's suspended
        if (this.context) this.context.resume();

        // Get the audio source
        sourceName = this.getRandomVariant(sourceName);

        // Setup
        const buffer = this.loadedAudio[sourceName];
        const audio = options.position
            ? new THREE.PositionalAudio(this.listener)
            : new THREE.Audio(this.listener);
        const poolKey = sourceName + '_' + audio.id;

        if (options.position) {
            // @ts-ignore
            audio.setRefDistance(options.refDistance || DEFAULT_REF_DISTANCE);
            audio.position.copy(options.position);
            this.scene.add(audio);
        }
        audio.setBuffer(buffer);

        let muffle: Muffle | undefined;
        if (options.muffle) {
            const ac = audio.context;
            const lowpass = ac.createBiquadFilter();
            lowpass.type = 'lowpass';
            // Set once and never automated (see Muffle above).
            lowpass.frequency.value = options.muffle.frequency;
            const dry = ac.createGain();
            const wet = ac.createGain();
            dry.gain.value = 1;
            wet.gain.value = 0;
            lowpass.connect(wet);
            wet.connect(audio.getOutput());
            // Three wires source → dry → output when it plays.
            audio.setFilter(dry);
            muffle = { context: ac, lowpass, dry, wet, amount: 0 };
        }

        // Set options
        audio.setLoop(options.loop ? true : false);
        // Three's setVolume ramps from the new gain node's default of 1.
        // Set the initial gain before playback so quiet sounds never start loud.
        audio.gain.gain.setValueAtTime(
            options.volume ?? 1,
            audio.context.currentTime,
        );

        audio.play();
        // The muffled branch taps the source Three just created.
        if (muffle && audio.source) {
            audio.source.connect(muffle.lowpass);
            (this.muffles ??= {})[poolKey] = muffle;
        }

        // Calculate detune
        const detuneAmount =
            (Math.random() * 200 - 100) *
            (options.randDetuneScale ? options.randDetuneScale : 0);

        // Set detune after .play is called
        audio.setDetune(detuneAmount);

        if (options.pitch) {
            audio.setDetune(options.pitch * 100);
        }

        // Add to pool
        if (audio.source) {
            audio.source.onended = () => {
                audio.onEnded();
                audio.removeFromParent();
                audio.disconnect();
                audio.getOutput().disconnect();
                audio.gain.disconnect();
                if (muffle) {
                    muffle.lowpass.disconnect();
                    muffle.wet.disconnect();
                    delete this.muffles[poolKey];
                }
                delete this.audioPool[poolKey];
            };
            this.audioPool[poolKey] = audio;
        }
        return poolKey;
    }

    /** 0 = dry, 1 = fully through the fixed lowpass. Safe to call every frame. */
    setAudioMuffle(audio: string, amount: number) {
        const muffle = this.muffles?.[audio];
        if (!muffle) return;
        const a = Number.isFinite(amount)
            ? THREE.MathUtils.clamp(amount, 0, 1)
            : 0;
        if (Math.abs(a - muffle.amount) < 0.01) return;
        muffle.amount = a;
        const now = muffle.context.currentTime;
        // Linear: the branches are correlated, so this keeps the low end level.
        muffle.dry.gain.setTargetAtTime(1 - a, now, 0.08);
        muffle.wet.gain.setTargetAtTime(a, now, 0.08);
    }

    setAudioVolume(audio: string, volume: number) {
        const a = this.audioPool[audio];
        if (a) {
            a.setVolume(volume);
        }
    }

    getRandomVariant(sourceName: string) {
        const variants = [];
        for (const key in this.loadedAudio) {
            if (key.includes(sourceName)) {
                variants.push(key);
            }
        }
        return variants[Math.floor(Math.random() * variants.length)];
    }

    update() {
        for (const key in this.audioSources) {
            const _key = key as keyof typeof this.audioSources;
            this.audioSources[_key].update();
        }
    }
}
