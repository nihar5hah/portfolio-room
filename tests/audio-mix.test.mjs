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
    for (let i = 0; i < 10; i++) await new Promise(setImmediate);
};

/** A minimal HTMLAudioElement: enough to observe what the room plays. */
class Media {
    attrs = {};
    paused = true;
    ended = false;
    currentTime = 0;
    volume = 1;
    loop = false;
    preload = '';
    playbackRate = 1;
    defaultPlaybackRate = 1;
    preservesPitch = true;
    plays = 0;
    pauses = 0;
    set src(value) {
        this.attrs.src = value;
        this.paused = true;
        this.ended = false;
    }
    get src() {
        return this.attrs.src ?? '';
    }
    removeAttribute(name) {
        delete this.attrs[name];
    }
    load() {}
    cloneNode() {
        const copy = new Media();
        copy.attrs = { ...this.attrs };
        copy.preload = this.preload;
        copy.loop = this.loop;
        return copy;
    }
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

function room() {
    const listeners = new Map();
    const bus = {
        on(name, callback) {
            listeners.set(name, [...(listeners.get(name) || []), callback]);
        },
        dispatch(name, value) {
            for (const callback of listeners.get(name) || []) callback(value);
        },
    };
    const docEvents = {},
        winEvents = {};
    const elements = [];
    const saved = Object.fromEntries(
        ['window', 'document', 'location', 'fetch'].map((key) => [
            key,
            globalThis[key],
        ]),
    );
    const forbidden = class {
        constructor() {
            throw new Error('Room audio must not create an AudioContext');
        }
    };
    globalThis.window = {
        AudioContext: forbidden,
        webkitAudioContext: forbidden,
        OfflineAudioContext: forbidden,
        addEventListener: (type, cb) =>
            (winEvents[type] = [...(winEvents[type] || []), cb]),
    };
    globalThis.document = {
        hidden: false,
        createElement(tag) {
            assert.equal(tag, 'audio', 'only <audio> elements make sound');
            const el = new Media();
            elements.push(el);
            return el;
        },
        body: { append() {} },
        addEventListener: (type, cb) =>
            (docEvents[type] = [...(docEvents[type] || []), cb]),
    };
    globalThis.location = { origin: 'http://localhost:5181' };
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
            tracks: [
                { title: 'Track', album: 'mbdtf', src: '/audio/mbdtf/1.m4a' },
            ],
        }),
    });
    const albumModule = load('../src/Application/Audio/AlbumAudio.ts', {
        '../UI/EventBus': { default: bus },
        '../../../config/audio-library.json': {
            default: JSON.parse(source('../config/audio-library.json')),
        },
    });
    const Manager = load('../src/Application/Audio/AudioManager.ts', {
        './AlbumAudio': albumModule,
        '../UI/EventBus': { default: bus },
    }).default;
    const fire = (type, event = {}) =>
        (docEvents[type] || []).forEach((cb) => cb(event));
    const fireWindow = (type) => (winEvents[type] || []).forEach((cb) => cb());
    const restore = () => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete globalThis[key];
            else globalThis[key] = value;
        }
    };
    return { Manager, bus, fire, fireWindow, elements, restore };
}

test('room ambience and effects play on <audio> elements, never Web Audio', async () => {
    const r = room();
    try {
        const manager = new r.Manager();
        await flush();
        const { dry, wet, album } = manager;
        const music = album.audio;
        assert.match(dry.src, /\/audio\/atmosphere\/office\.mp3$/);
        assert.match(wet.src, /\/audio\/atmosphere\/office-muffled\.mp3$/);
        assert.ok(dry.loop && wet.loop);
        assert.equal(Object.keys(manager.templates.keyboardKeydown).length, 6);

        // Nothing plays before Enter, even with input.
        r.fire('mousedown', { inComputer: true });
        assert.ok(r.elements.every((el) => el.paused));
        assert.equal(manager.playing.size, 0);

        assert.equal(dry.preload, 'none', 'nothing is fetched while silent');
        assert.ok(
            Object.values(manager.templates)
                .flat()
                .every((el) => el.preload === 'none'),
        );
        r.bus.dispatch('loadingScreenDone');
        assert.equal(dry.paused, false, 'office ambience plays');
        assert.equal(dry.preload, 'auto', 'fetched once sound is on');
        assert.equal(wet.paused, false, 'muffled copy runs alongside');
        assert.equal(music.paused, false, 'music plays');
        const [startup] = manager.playing;
        assert.match(startup.src, /startup\.mp3$/);
        assert.equal(startup.volume, 0.25);

        // The camera drives the mix, volume only.
        for (let frame = 0; frame < 2000; frame++) {
            manager.update(800 + ((Math.sin(frame / 15) + 1) / 2) * 20000);
            for (const el of [dry, wet])
                assert.ok(el.volume >= 0 && el.volume <= 0.075);
            assert.ok(Math.abs(dry.volume + wet.volume - manager.level) < 1e-9);
        }
        for (const bad of [NaN, Infinity, -Infinity]) manager.update(bad);
        assert.ok(Number.isFinite(dry.volume) && Number.isFinite(wet.volume));
        manager.update(1000);
        assert.equal(dry.volume, 0, 'fully muffled at the Mac');
        assert.equal(wet.volume, 0.0375, 'and quieter');
        manager.update(20000);
        assert.equal(dry.volume, 0.075, 'open across the room');
        assert.equal(wet.volume, 0);

        // Clicks and keys: subtle, capped, released.
        for (let i = 0; i < 30; i++) {
            r.fire('mousedown', { inComputer: true });
            r.fire('keydown', { inComputer: true, key: `k${i}` });
        }
        assert.equal(manager.playing.size, 4, 'overlap capped at four');
        for (const el of [...manager.playing]) el.onended();
        assert.equal(manager.playing.size, 0);
        r.fire('keydown', { inComputer: true, key: 'a' });
        r.fire('keydown', { inComputer: true, key: 'a' });
        assert.equal(manager.playing.size, 1, 'held keys do not repeat');
        const [click] = manager.playing;
        assert.equal(click.volume, 0.16);
        r.fire('keydown', { key: 'x_AUTO_' });
        const typed = [...manager.playing].at(-1);
        assert.ok(typed.playbackRate > 3 && typed.preservesPitch === false);
        r.fire('mousedown', { inComputer: false });
        assert.equal(
            manager.playing.size,
            2,
            'clicks outside the Mac are silent',
        );

        // Sound off silences everything; on brings the room back, in step.
        r.bus.dispatch('muteToggle', true);
        assert.ok(dry.paused && wet.paused && music.paused);
        assert.equal(manager.playing.size, 0);
        assert.equal(click.src, '', 'released effects free their player');
        r.fire('mousedown', { inComputer: true });
        assert.equal(manager.playing.size, 0, 'muted input is silent');
        dry.currentTime = 7.5;
        r.bus.dispatch('muteToggle', false);
        assert.ok(!dry.paused && !wet.paused && !music.paused);
        assert.equal(wet.currentTime, 7.5, 'copies realigned');
    } finally {
        r.restore();
    }
});

test('media the browser paused resumes when the page returns; a chosen pause does not', async () => {
    const r = room();
    try {
        const manager = new r.Manager();
        await flush();
        r.bus.dispatch('loadingScreenDone');
        const music = manager.album.audio;
        // Browser-initiated pause (hidden page / back-forward cache).
        for (const el of [manager.dry, manager.wet, music]) el.paused = true;
        r.fireWindow('pageshow');
        assert.ok(!manager.dry.paused && !manager.wet.paused && !music.paused);
        for (const el of [manager.dry, music]) el.paused = true;
        r.fire('visibilitychange');
        assert.ok(!manager.dry.paused && !music.paused);
        for (const el of [manager.wet, music]) el.paused = true;
        r.fire('resume'); // a frozen page wakes
        assert.ok(!manager.wet.paused && !music.paused);
        // The visitor pauses the music: returning keeps it paused.
        manager.album.toggle();
        assert.equal(music.paused, true);
        r.fireWindow('pageshow');
        assert.equal(music.paused, true, 'a chosen pause is respected');
        assert.equal(manager.dry.paused, false, 'ambience still resumes');
        manager.album.toggle();
        assert.equal(music.paused, false);
        // Sound off stays off.
        r.bus.dispatch('muteToggle', true);
        r.fireWindow('pageshow');
        assert.ok(manager.dry.paused && music.paused);
    } finally {
        r.restore();
    }
});

test('laptop open/close and input never interrupt music or ambience', async () => {
    const r = room();
    try {
        const manager = new r.Manager();
        await flush();
        r.bus.dispatch('loadingScreenDone');
        const music = manager.album.audio;
        const url = music.src;
        for (let cycle = 0; cycle < 100; cycle++) {
            r.bus.dispatch('enterMonitor');
            manager.update(1600);
            r.fire('keydown', { inComputer: true, key: `k${cycle}` });
            r.fire('mousedown', { inComputer: true });
            for (const el of [...manager.playing]) el.onended?.();
            r.bus.dispatch('leftMonitor');
            manager.update(19000);
            music.currentTime++;
            assert.ok(
                !music.paused && !manager.dry.paused && !manager.wet.paused,
            );
            assert.equal(music.src, url);
        }
        assert.equal(music.plays, 1, 'no transition-triggered restarts');
        assert.equal(music.pauses, 0, 'no transition-triggered pauses');
        assert.equal(manager.dry.pauses + manager.wet.pauses, 0);
        assert.equal(music.volume, 0.06);
    } finally {
        r.restore();
    }
});

test('no Web Audio anywhere in room audio, and the muffled loop ships', () => {
    for (const file of [
        '../src/Application/Audio/AudioManager.ts',
        '../src/Application/Audio/AlbumAudio.ts',
        '../src/Application/Utils/Resources.ts',
    ])
        assert.doesNotMatch(
            source(file),
            /new\s+\w*AudioContext|createBiquadFilter|decodeAudioData|AudioLoader|AudioListener/,
            file,
        );
    assert.doesNotMatch(
        source('../src/Application/Audio/AudioManager.ts'),
        /from 'three'/,
    );
    const muffled = new URL(
        '../static/audio/atmosphere/office-muffled.mp3',
        import.meta.url,
    );
    assert.ok(fs.statSync(muffled).size > 100_000);
    const { default: resources } = load('../src/Application/sources.ts', {
        './Audio/AlbumAudio': { ALBUMS: { mbdtf: 'MBDTF' } },
    });
    assert.ok(resources.every((r) => r.type !== 'audio'));
    assert.match(
        source('../src/Application/World/World.ts'),
        /audioManager\.update\(\s*this\.application\.camera\.instance\.position\.length\(\)/,
    );
});

test('rain plays on its own loop only while it rains, eased by volume, and thunder follows lightning', async () => {
    const r = room();
    const timers = [];
    const setTimeoutSaved = globalThis.setTimeout;
    try {
        const manager = new r.Manager();
        await flush();
        const { rain } = manager;
        assert.match(rain.src, /\/audio\/atmosphere\/rain\.mp3$/);
        assert.ok(
            rain.loop && rain.preload === 'none',
            'fetched only once it rains',
        );
        r.bus.dispatch('loadingScreenDone');
        assert.ok(rain.paused, 'dry: silent');
        r.bus.dispatch('weather', { rain: 1 });
        assert.equal(rain.paused, false, 'raining: plays');
        manager.update(20000, 1 / 60);
        assert.ok(rain.volume < 0.01, 'fades in rather than starting loud');
        for (let i = 0; i < 600; i++) manager.update(20000, 1 / 60);
        assert.ok(
            rain.volume > 0.12 && rain.volume <= 0.16,
            'soft, under the music',
        );
        manager.update(1000, 1 / 60);
        assert.ok(rain.volume < 0.08, 'quieter at the Mac');
        r.bus.dispatch('muteToggle', true);
        assert.ok(rain.paused, 'Sound off silences it');
        r.bus.dispatch('muteToggle', false);
        assert.equal(rain.paused, false);
        r.bus.dispatch('weather', { rain: 0 });
        for (let i = 0; i < 900; i++) manager.update(20000, 1 / 60);
        assert.equal(rain.volume, 0);
        assert.ok(rain.paused, 'stops once it has faded out');
        // Lightning: thunder a moment later, as a capped one-shot.
        globalThis.setTimeout = (fn, ms) => timers.push([fn, ms]);
        r.bus.dispatch('lightning', {});
        assert.equal(timers.length, 1);
        assert.ok(timers[0][1] >= 900 && timers[0][1] <= 3100);
        timers[0][0]();
        const thunder = [...manager.playing].at(-1);
        assert.match(thunder.src, /thunder\.mp3$/);
        assert.ok(thunder.volume <= 0.3);
    } finally {
        globalThis.setTimeout = setTimeoutSaved;
        r.restore();
    }
});
