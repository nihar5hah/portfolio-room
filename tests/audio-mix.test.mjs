import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = (path) =>
    fs.readFileSync(new URL(path, import.meta.url), 'utf8');
function load(path, dependencies) {
    const exports = {};
    const code = require('typescript').transpileModule(source(path), {
        compilerOptions: {
            module: require('typescript').ModuleKind.CommonJS,
        },
    }).outputText;
    new Function('require', 'exports', code)((name) => {
        assert.ok(
            Object.hasOwn(dependencies, name),
            `Unexpected dependency: ${name}`,
        );
        return dependencies[name];
    }, exports);
    return exports;
}
const flush = async () => {
    for (let i = 0; i < 20; i++) await new Promise(setImmediate);
};

/**
 * A fake Web Audio engine. The live context throws on every node that has
 * internal state or feedback (the class of node that screeched); decoded
 * buffers deliberately contain NaN, ±Infinity and over-full-scale samples.
 */
function fakeWebAudio() {
    const live = [],
        offline = [];
    const param = (value) => ({
        value,
        targets: [],
        setTargetAtTime(target) {
            this.targets.push(target);
        },
        setValueAtTime(target) {
            this.value = target;
        },
        cancelScheduledValues() {},
    });
    const node = (kind, list) => {
        const n = {
            kind,
            connections: new Set(),
            gain: param(1),
            playbackRate: param(1),
            connect(target) {
                this.connections.add(target);
                return target;
            },
            disconnect() {
                this.connections.clear();
            },
            start() {
                this.started = true;
            },
        };
        list.push(n);
        return n;
    };
    const corrupt = [0.5, NaN, Infinity, -Infinity, 5, -5, 0, -0.25];
    const buffer = () => {
        const channels = [
            Float32Array.from(corrupt),
            Float32Array.from(corrupt),
        ];
        return {
            numberOfChannels: 2,
            length: corrupt.length,
            sampleRate: 44100,
            getChannelData: (c) => channels[c],
        };
    };
    class Context {
        currentTime = 0;
        state = 'suspended';
        destination = { kind: 'destination' };
        resumes = 0;
        createGain() {
            return node('gain', live);
        }
        createBufferSource() {
            return node('source', live);
        }
        resume() {
            this.resumes++;
            this.state = 'running';
            return Promise.resolve();
        }
        decodeAudioData(_data, resolve) {
            resolve(buffer());
        }
    }
    for (const forbidden of [
        'createBiquadFilter',
        'createIIRFilter',
        'createDelay',
        'createOscillator',
        'createPanner',
        'createConvolver',
        'createWaveShaper',
        'createDynamicsCompressor',
        'createMediaElementSource',
        'createScriptProcessor',
    ])
        Context.prototype[forbidden] = () => {
            throw new Error(`live room audio must not use ${forbidden}`);
        };
    class Offline {
        destination = { kind: 'offline-destination' };
        createBufferSource() {
            return node('source', offline);
        }
        createBiquadFilter() {
            const filter = node('biquad', offline);
            let frequency = 350;
            filter.writes = 0;
            filter.frequency = {
                get value() {
                    return frequency;
                },
                set value(v) {
                    filter.writes++;
                    frequency = v;
                },
            };
            return filter;
        }
        startRendering() {
            return Promise.resolve(buffer());
        }
    }
    return { live, offline, Context, Offline };
}

function roomGlobals({ Context, Offline }) {
    const listeners = new Map();
    const bus = {
        on(name, callback) {
            listeners.set(name, [...(listeners.get(name) || []), callback]);
        },
        dispatch(name, value) {
            for (const callback of listeners.get(name) || []) callback(value);
        },
    };
    const input = {};
    const elements = [];
    class Media {
        paused = true;
        currentTime = 0;
        plays = 0;
        pauses = 0;
        play() {
            this.paused = false;
            this.plays++;
            this.onplaying?.();
            return Promise.resolve();
        }
        pause() {
            this.paused = true;
            this.pauses++;
            this.onpause?.();
        }
    }
    const saved = Object.fromEntries(
        ['window', 'document', 'location', 'fetch'].map((key) => [
            key,
            globalThis[key],
        ]),
    );
    const requests = [];
    globalThis.window = { AudioContext: Context, OfflineAudioContext: Offline };
    globalThis.document = {
        createElement(tag) {
            assert.equal(tag, 'audio');
            const el = new Media();
            elements.push(el);
            return el;
        },
        body: { append() {} },
        addEventListener: (type, callback) =>
            (input[type] = [...(input[type] || []), callback]),
    };
    globalThis.location = { origin: 'http://localhost:5181' };
    globalThis.fetch = async (url) => {
        requests.push(url);
        if (url === '/audio/playlist.json')
            return {
                ok: true,
                json: async () => ({
                    tracks: [
                        {
                            title: 'Track',
                            album: 'mbdtf',
                            src: '/audio/mbdtf/1.m4a',
                        },
                    ],
                }),
            };
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    };
    const albumModule = load('../src/Application/Audio/AlbumAudio.ts', {
        '../UI/EventBus': { default: bus },
    });
    const Manager = load('../src/Application/Audio/AudioManager.ts', {
        './AlbumAudio': albumModule,
        '../UI/EventBus': { default: bus },
    }).default;
    const fire = (type, event) =>
        (input[type] || []).forEach((callback) => callback(event));
    const restore = () => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete globalThis[key];
            else globalThis[key] = value;
        }
    };
    return { Manager, bus, fire, elements, requests, restore };
}

test('ambience and effects play through players and gains only, never a live filter', async () => {
    const audio = fakeWebAudio();
    const room = roomGlobals(audio);
    try {
        const manager = new room.Manager();
        await flush();
        const context = manager.context;

        // Every decoded sound is clean before it can reach the speakers.
        for (const name of [
            'office',
            'startup',
            'mouseDown',
            'mouseUp',
            'keyboardKeydown',
            'ccType',
        ]) {
            assert.ok(manager.buffers[name].length, `${name} loaded`);
            for (const buffer of manager.buffers[name])
                for (let c = 0; c < buffer.numberOfChannels; c++)
                    for (const v of buffer.getChannelData(c))
                        assert.ok(Number.isFinite(v) && Math.abs(v) <= 1);
        }
        assert.equal(manager.buffers.keyboardKeydown.length, 6);
        // The muffle is rendered once, offline, and sanitized too.
        const biquads = audio.offline.filter((n) => n.kind === 'biquad');
        assert.equal(biquads.length, 1);
        assert.equal(biquads[0].frequency.value, 600);
        assert.equal(biquads[0].writes, 1, 'cutoff set once, never automated');
        for (let c = 0; c < 2; c++)
            for (const v of manager.muffledOffice.getChannelData(c))
                assert.ok(Number.isFinite(v) && Math.abs(v) <= 1);

        // Silent until Enter.
        assert.equal(manager.master.gain.value, 0);
        assert.equal(manager.ambience, undefined);
        room.bus.dispatch('loadingScreenDone');
        assert.ok(manager.ambience, 'office ambience starts on Enter');
        const loops = audio.live.filter((n) => n.kind === 'source' && n.loop);
        assert.equal(loops.length, 2, 'dry and pre-muffled loops');
        assert.ok(loops.every((n) => n.started));
        assert.equal(manager.effects, 1, 'startup chime plays');
        assert.deepEqual(manager.master.gain.targets.at(-1), 1, 'sound on');
        assert.ok(context.resumes > 0);
        assert.equal(room.elements[0].paused, false, 'music plays too');

        // Sweep the camera to the Mac and back many times, plus garbage.
        for (let frame = 0; frame < 2000; frame++)
            manager.update(800 + ((Math.sin(frame / 15) + 1) / 2) * 20000);
        for (const bad of [NaN, Infinity, -Infinity, -1e9, 1e12])
            manager.update(bad);
        const at = (d) => {
            manager.update(d);
            return manager.ambience;
        };
        assert.equal(at(1000).muffle, 1, 'muffled at the Mac');
        assert.equal(at(1000).volume, 0.0375, 'quieter at the Mac');
        assert.equal(at(20000).muffle, 0, 'open across the room');
        assert.equal(at(20000).volume, 0.075);
        for (const n of audio.live)
            for (const value of [...n.gain.targets, n.gain.value])
                assert.ok(
                    Number.isFinite(value) && value >= 0 && value <= 1,
                    `gain ${value} stays within 0..1`,
                );

        // Clicks and keys inside the Mac: subtle, bounded, and released.
        for (let i = 0; i < 30; i++) {
            room.fire('mousedown', { inComputer: true });
            room.fire('keydown', { inComputer: true, key: `k${i}` });
        }
        assert.equal(manager.effects, 4, 'overlap capped at four');
        const oneShots = audio.live.filter(
            (n) => n.kind === 'source' && !n.loop && n.started,
        );
        for (const shot of oneShots) shot.onended();
        assert.equal(manager.effects, 0);
        assert.ok(oneShots.every((n) => n.connections.size === 0));
        room.fire('keydown', { inComputer: true, key: 'a' });
        room.fire('keydown', { inComputer: true, key: 'a' });
        assert.equal(manager.effects, 1, 'held keys do not repeat clicks');
        room.fire('keydown', { key: 'x_AUTO_' });
        const typed = audio.live.filter((n) => n.kind === 'source').at(-1);
        assert.ok(typed.playbackRate.value > 3, 'typing effect is pitched up');
        room.fire('mousedown', { inComputer: false });
        assert.equal(manager.effects, 2, 'clicks outside the Mac are silent');

        room.bus.dispatch('muteToggle', true);
        assert.equal(manager.master.gain.targets.at(-1), 0, 'sound off');
        assert.equal(room.elements[0].paused, true);
    } finally {
        room.restore();
    }
});

test('laptop open/close and input leave the same music element playing; mute still works', async () => {
    const audio = fakeWebAudio();
    const room = roomGlobals(audio);
    try {
        const manager = new room.Manager();
        await flush();
        const music = manager.album.audio;
        assert.equal(music.paused, true);
        room.bus.dispatch('loadingScreenDone');
        assert.equal(music.paused, false);
        const url = music.src;
        for (let cycle = 0; cycle < 100; cycle++) {
            room.bus.dispatch('enterMonitor');
            manager.update(1600);
            room.fire('keydown', { inComputer: true, key: `k${cycle}` });
            room.fire('mousedown', { inComputer: true });
            room.bus.dispatch('leftMonitor');
            manager.update(19000);
            music.currentTime++;
            assert.equal(music.paused, false);
            assert.equal(music.src, url);
        }
        assert.equal(room.elements.length, 1);
        assert.equal(music.plays, 1, 'no transition-triggered restarts');
        assert.equal(music.pauses, 0, 'no transition-triggered pauses');
        assert.equal(music.volume, 0.06);
        room.bus.dispatch('muteToggle', true);
        room.bus.dispatch('enterMonitor');
        room.bus.dispatch('leftMonitor');
        assert.equal(music.paused, true, 'laptop never overrides mute');
        room.bus.dispatch('muteToggle', false);
        assert.equal(music.paused, false);
        assert.equal(music.currentTime, 100, 'unmute resumes, not restarts');
    } finally {
        room.restore();
    }
});

test('without Web Audio the room stays usable and music still plays', async () => {
    const room = roomGlobals({ Context: undefined, Offline: undefined });
    try {
        const manager = new room.Manager();
        await flush();
        room.bus.dispatch('loadingScreenDone');
        manager.update(5000);
        room.fire('mousedown', { inComputer: true });
        assert.equal(manager.context, undefined);
        assert.equal(room.elements[0].paused, false);
    } finally {
        room.restore();
    }
});

test('room resources stay light: sounds load inside AudioManager, not the loader', () => {
    const { default: resources } = load('../src/Application/sources.ts', {
        './Audio/AlbumAudio': { ALBUMS: { mbdtf: 'MBDTF' } },
    });
    assert.ok(resources.every((r) => r.type !== 'audio'));
    const loader = source('../src/Application/Utils/Resources.ts');
    assert.doesNotMatch(loader, /AudioLoader|AudioContext|decodeAudioData/);
    assert.match(
        source('../src/Application/World/World.ts'),
        /audioManager\.update\(\s*this\.application\.camera\.instance\.position\.length\(\)/,
    );
    const manager = source('../src/Application/Audio/AudioManager.ts');
    assert.doesNotMatch(manager, /from 'three'|setInterval/);
});
