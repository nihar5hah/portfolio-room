import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
const require = createRequire(import.meta.url);
function load(path, dependencies) {
    const exports = {};
    const code = require('typescript').transpileModule(
        fs.readFileSync(new URL(path, import.meta.url), 'utf8'),
        {
            compilerOptions: {
                module: require('typescript').ModuleKind.CommonJS,
            },
        },
    ).outputText;
    new Function('require', 'exports', code)(
        (name) => dependencies[name] || { default: class {} },
        exports,
    );
    return exports;
}

test('ambience starts quietly and remains slightly softer at every camera distance', () => {
    const events = {},
        starts = [];
    let volume;
    const { AmbienceAudio } = load('../src/Application/Audio/AudioSources.ts', {
        three: THREE,
        '../UI/EventBus': {
            default: { on: (name, fn) => (events[name] = fn) },
        },
    });
    const position = new THREE.Vector3();
    const ambience = new AmbienceAudio({
        application: { camera: { instance: { position } } },
        playAudio: (name, options) => starts.push({ name, options }),
        setAudioFilterFrequency() {},
        setAudioVolume: (_key, value) => (volume = value),
    });
    events.loadingScreenDone();
    assert.equal(starts.find((s) => s.name === 'office').options.volume, 0.075);
    assert.equal(starts.find((s) => s.name === 'startup').options.volume, 0.25);
    for (const distance of [0, 1200, 4000, 10000, 40000]) {
        position.set(distance, 0, 0);
        ambience.update();
        const previous = THREE.MathUtils.clamp(
            THREE.MathUtils.mapLinear(distance, 1200, 10000, 0, 0.2),
            0.05,
            0.1,
        );
        assert.ok(Math.abs(volume - previous * 0.75) < 1e-9);
    }
});

test('effects have the requested gain before play and release their native scene nodes', () => {
    class Sound extends THREE.Object3D {
        gain = {
            disconnect() {},
            gain: {
                value: 1,
                setValueAtTime(value) {
                    this.value = value;
                },
                setTargetAtTime(value) {
                    this.target = value;
                },
            },
        };
        context = { currentTime: 10 };
        source = {};
        setBuffer() {}
        setLoop() {}
        setRefDistance() {}
        setDetune() {}
        setVolume(value) {
            this.gain.gain.setTargetAtTime(value);
        }
        getOutput() {
            return this.gain;
        }
        play() {
            this.gainAtStart = this.gain.gain.value;
            this.isPlaying = true;
        }
        onEnded() {
            this.isPlaying = false;
        }
        disconnect() {
            this.disconnected = true;
        }
    }
    const Manager = load('../src/Application/Audio/AudioManager.ts', {
        three: { ...THREE, Audio: Sound, PositionalAudio: Sound },
    }).default;
    const manager = Object.assign(Object.create(Manager.prototype), {
        loadedAudio: { mouseDown: {} },
        audioPool: {},
        scene: new THREE.Scene(),
        listener: {},
    });
    for (const volume of [0, 0.075, 0.4]) {
        const position = new THREE.Vector3(800, -300, 1200);
        const key = manager.playAudio('mouseDown', { volume, position });
        const sound = manager.audioPool[key];
        assert.equal(
            sound.gainAtStart,
            volume,
            'no transient from the default gain of 1',
        );
        assert.equal(
            manager.scene.children[0],
            sound,
            'position the sound itself; no invisible geometry',
        );
        assert.ok(sound.position.equals(position));
        sound.source.onended();
        assert.equal(sound.isPlaying, false);
        assert.equal(sound.disconnected, true);
        assert.equal(manager.scene.children.length, 0);
        assert.equal(Object.keys(manager.audioPool).length, 0);
    }
    const first = manager.playAudio('mouseDown');
    const second = manager.playAudio('mouseDown');
    const third = manager.playAudio('mouseDown');
    manager.audioPool[first].source.onended();
    const fourth = manager.playAudio('mouseDown');
    assert.notEqual(
        fourth,
        third,
        'overlapping effects cannot reuse a live pool key',
    );
    for (const key of [second, third, fourth])
        manager.audioPool[key].source.onended();
    assert.equal(Object.keys(manager.audioPool).length, 0);
});

test('sustained input has bounded overlap and releases the entire Three audio graph', () => {
    const nodes = [];
    const param = () => ({
        value: 1,
        setValueAtTime(value) {
            this.value = value;
        },
        setTargetAtTime() {},
    });
    const node = () => {
        const n = {
            connections: new Set(),
            gain: param(),
            playbackRate: param(),
            detune: param(),
            connect(target) {
                this.connections.add(target);
            },
            disconnect(target) {
                target
                    ? this.connections.delete(target)
                    : this.connections.clear();
            },
            start() {},
        };
        nodes.push(n);
        return n;
    };
    const context = {
        currentTime: 0,
        createGain: node,
        createPanner: node,
        createBufferSource: node,
        resume() {},
    };
    const input = node();
    const Manager = load('../src/Application/Audio/AudioManager.ts', {
        three: THREE,
    }).default;
    const manager = Object.assign(Object.create(Manager.prototype), {
        loadedAudio: { mouseDown: {}, mouseUp: {}, keyboardKeydown1: {} },
        context,
        audioPool: {},
        scene: new THREE.Scene(),
        listener: { context, getInput: () => input },
    });
    for (let batch = 0; batch < 20; batch++) {
        for (let event = 0; event < 30; event++) {
            manager.playAudio(
                ['mouseDown', 'mouseUp', 'keyboardKeydown'][event % 3],
                {
                    volume: 0.16,
                    position: new THREE.Vector3(0, 0, 1),
                },
            );
        }
        const playing = Object.values(manager.audioPool);
        assert.ok(
            playing.length <= 4,
            `${playing.length} overlapping effects can burst together`,
        );
        for (const sound of playing) sound.source.onended();
        assert.equal(Object.keys(manager.audioPool).length, 0);
        assert.equal(
            nodes.filter((n) => n.connections.size).length,
            0,
            'finished sources, panners and gains must all be disconnected',
        );
    }
});

test('computer feedback stays quiet and avoids spatial audio processing', () => {
    const listeners = {},
        starts = [];
    globalThis.document = {
        addEventListener: (name, callback) => (listeners[name] = callback),
    };
    const { ComputerAudio } = load('../src/Application/Audio/AudioSources.ts', {
        three: THREE,
    });
    new ComputerAudio({
        playAudio: (name, options) => starts.push({ name, options }),
    });
    for (const type of ['mousedown', 'mouseup', 'keydown', 'keyup'])
        listeners[type]({ inComputer: true, key: 'a' });
    assert.deepEqual(
        starts.map((s) => s.name),
        ['mouseDown', 'mouseUp', 'keyboardKeydown'],
    );
    for (const sound of starts) {
        assert.ok(
            sound.options.volume <= 0.16,
            'short UI feedback must stay subtle',
        );
        assert.equal(
            sound.options.position,
            undefined,
            'UI feedback does not need an HRTF panner',
        );
    }
});
