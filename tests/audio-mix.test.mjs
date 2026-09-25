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

test('room audio creates only the music player, with no Three graph or restart timers', () => {
    let albums = 0;
    class Album {
        constructor() {
            albums++;
        }
    }
    // Any reintroduction of Three, Application, effects, or an event bus fails
    // the dependency allowlist rather than silently substituting a stub.
    const Manager = load('../src/Application/Audio/AudioManager.ts', {
        './AlbumAudio': { default: Album },
    }).default;
    const manager = new Manager();
    assert.equal(albums, 1);
    assert.ok(manager.album instanceof Album);
    assert.deepEqual(Object.keys(manager), ['album']);
    const code = source('../src/Application/Audio/AudioManager.ts');
    assert.doesNotMatch(code, /setInterval\s*\(|setTimeout\s*\(/);
});

test('room resources cannot preload effects or create a decoding AudioContext', () => {
    const { default: resources } = load('../src/Application/sources.ts', {
        './Audio/AlbumAudio': { ALBUMS: { mbdtf: 'MBDTF' } },
    });
    assert.ok(resources.length > 0);
    assert.ok(resources.every((r) => r.type !== 'audio'));
    assert.ok(resources.every((r) => !r.path.toString().startsWith('audio/')));
    const loader = source('../src/Application/Utils/Resources.ts');
    assert.doesNotMatch(loader, /AudioLoader|AudioContext|decodeAudioData/);
    assert.doesNotMatch(
        source('../src/Application/World/World.ts'),
        /audioManager\.update\s*\(/,
        'camera frames must not drive audio parameters',
    );
});

test('laptop open/close and input leave the same music element playing; mute still works', async () => {
    const listeners = new Map();
    const bus = {
        on(name, callback) {
            const callbacks = listeners.get(name) || [];
            callbacks.push(callback);
            listeners.set(name, callbacks);
        },
        dispatch(name, value) {
            for (const callback of listeners.get(name) || []) callback(value);
        },
    };
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
        ['document', 'location', 'fetch'].map((key) => [key, globalThis[key]]),
    );
    globalThis.document = {
        createElement(tag) {
            assert.equal(tag, 'audio');
            const el = new Media();
            elements.push(el);
            return el;
        },
        body: { append() {} },
        addEventListener() {
            assert.fail('No keyboard/mouse sound handlers should be installed');
        },
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
    try {
        const albumModule = load('../src/Application/Audio/AlbumAudio.ts', {
            '../UI/EventBus': { default: bus },
        });
        const Manager = load('../src/Application/Audio/AudioManager.ts', {
            './AlbumAudio': albumModule,
        }).default;
        const manager = new Manager();
        await new Promise(setImmediate);
        const audio = manager.album.audio;
        assert.equal(audio.paused, true);
        bus.dispatch('loadingScreenDone');
        assert.equal(audio.paused, false);
        const url = audio.src;
        for (let cycle = 0; cycle < 100; cycle++) {
            bus.dispatch('enterMonitor');
            bus.dispatch('keydown', { inComputer: true, key: 'a' });
            bus.dispatch('mousedown', { inComputer: true });
            bus.dispatch('leftMonitor');
            audio.currentTime++;
            assert.equal(audio.paused, false);
            assert.equal(audio.src, url);
            assert.equal(manager.album.audio, audio);
        }
        assert.equal(elements.length, 1);
        assert.equal(audio.plays, 1, 'no transition-triggered restarts');
        assert.equal(audio.pauses, 0, 'no transition-triggered pauses');
        assert.equal(audio.volume, 0.06);
        bus.dispatch('muteToggle', true);
        assert.equal(audio.paused, true);
        bus.dispatch('enterMonitor');
        bus.dispatch('leftMonitor');
        assert.equal(audio.paused, true, 'laptop never overrides mute');
        bus.dispatch('muteToggle', false);
        assert.equal(audio.paused, false);
        assert.equal(
            audio.currentTime,
            100,
            'unmute resumes without resetting',
        );
    } finally {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete globalThis[key];
            else globalThis[key] = value;
        }
    }
});
