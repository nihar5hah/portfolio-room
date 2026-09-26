import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('licensed album playback is quiet, shuffled, gesture-started, muteable and recoverable', async () => {
    const listeners = new Map();
    const events = [];
    const bus = {
        on: (name, callback) => listeners.set(name, callback),
        dispatch(name, value) {
            events.push([name, value]);
            listeners.get(name)?.(value);
        },
    };
    class Audio {
        paused = true;
        ended = false;
        plays = 0;
        rejectPlay = false;
        set src(value) {
            this.url = value;
            this.paused = true;
            this.ended = false;
        }
        get src() {
            return this.url;
        }
        play() {
            if (this.rejectPlay)
                return Promise.reject(new Error('Autoplay denied'));
            this.paused = false;
            this.plays++;
            this.onplaying?.();
            return Promise.resolve();
        }
        pause() {
            this.paused = true;
            this.onpause?.();
        }
        finish() {
            this.paused = true;
            this.ended = true;
            this.onended();
        }
    }
    globalThis.document = {
        createElement: () => new Audio(),
        body: { append() {} },
    };
    globalThis.location = { origin: 'http://localhost:5181' };
    const tracks = ['First', 'Second', 'Third'].map((title, index) => ({
        title,
        src: `/audio/${['mbdtf', 'jackboys', 'rodeo'][index]}/${index + 1}.mp3`,
        album: ['mbdtf', 'jackboys', 'rodeo'][index],
    }));
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ tracks }),
    });
    const compiled = require('typescript').transpileModule(
        fs.readFileSync(
            new URL('../src/Application/Audio/AlbumAudio.ts', import.meta.url),
            'utf8',
        ),
        {
            compilerOptions: {
                module: require('typescript').ModuleKind.CommonJS,
            },
        },
    ).outputText;
    const exports = {};
    let random = 0;
    const math = Object.create(Math);
    math.random = () => random;
    new Function('require', 'exports', 'Math', compiled)(
        () => ({ default: bus }),
        exports,
        math,
    );
    const album = new exports.default();
    await new Promise(setImmediate);
    assert.equal(
        album.audio.volume,
        0.06,
        'a small lift from the previous 0.05 music level',
    );
    assert.equal(album.audio.preload, 'none');
    assert.equal(album.audio.plays, 0, 'never play before Enter');
    assert.deepEqual(
        album.tracks.map((t) => t.title),
        ['Second', 'Third', 'First'],
        'shuffle spans all three albums',
    );
    bus.dispatch('loadingScreenDone', {});
    assert.equal(album.audio.paused, false);
    const firstRound = new Set([album.audio.src]);
    for (const expected of [1, 2]) {
        album.audio.finish();
        assert.equal(album.index, expected);
        firstRound.add(album.audio.src);
        assert.equal(album.audio.src, album.tracks[expected].src);
        const state = events
            .filter(([name]) => name === 'albumChange')
            .at(-1)[1];
        assert.equal(
            state.album,
            album.tracks[expected].album,
            'artwork identity follows every song',
        );
        assert.equal(album.audio.paused, false);
    }
    assert.equal(
        firstRound.size,
        3,
        'each supplied song plays once per shuffle',
    );
    const previous = album.audio.src;
    album.audio.finish();
    assert.equal(album.index, 0);
    assert.notEqual(
        album.audio.src,
        previous,
        'reshuffle avoids immediate repetition',
    );
    // Good Night: the music fades out and stops; waking brings it back.
    const timers = [];
    const realSet = globalThis.setInterval,
        realClear = globalThis.clearInterval;
    globalThis.setInterval = (fn) => (timers.push(fn), timers.length);
    globalThis.clearInterval = (id) => id && (timers[id - 1] = null);
    bus.dispatch('goodNight', true);
    assert.equal(album.audio.paused, false, 'the fade starts, not a cut');
    for (let i = 0; i < 12; i++) timers.forEach((fn) => fn?.());
    assert.equal(album.audio.paused, true, 'Good Night stops the music');
    assert.equal(album.audio.volume, 0.06, 'volume restored for later');
    bus.dispatch('goodNight', false);
    assert.equal(album.audio.paused, false, 'waking resumes the music');
    // Asleep while already paused by the visitor: waking keeps it paused.
    album.toggle();
    bus.dispatch('goodNight', true);
    bus.dispatch('goodNight', false);
    assert.equal(album.audio.paused, true, 'a chosen pause survives the night');
    album.toggle();
    globalThis.setInterval = realSet;
    globalThis.clearInterval = realClear;
    bus.dispatch('muteToggle', true);
    assert.equal(album.audio.paused, true);
    album.next();
    assert.equal(album.audio.paused, true, 'Next must respect mute');
    bus.dispatch('muteToggle', false);
    assert.equal(album.audio.paused, false);
    album.toggle();
    assert.equal(album.audio.paused, true);
    album.audio.rejectPlay = true;
    album.toggle();
    await new Promise(setImmediate);
    assert.equal(album.error, true, 'autoplay denial is surfaced for retry');
    album.audio.rejectPlay = false;
    album.toggle();
    assert.equal(album.error, false);
    assert.equal(album.audio.paused, false);
    const before = album.index;
    album.audio.rejectPlay = true; // a broken file never reaches 'playing'
    album.audio.onerror();
    assert.equal(
        album.error,
        false,
        'a missing track skips instead of stopping',
    );
    assert.equal(album.index, (before + 1) % 3, 'skips to the next song');
    album.audio.onerror();
    album.audio.onerror();
    assert.equal(
        album.error,
        true,
        'only a library where every track fails stops and offers retry',
    );
    album.audio.rejectPlay = false;
    album.toggle();
    assert.equal(album.error, false);
    assert.ok(
        events.some(
            ([name, state]) =>
                name === 'albumChange' &&
                state.title === 'Second' &&
                state.count === 3,
        ),
    );

    const startingSongs = new Set();
    for (const value of [0, 0.4, 0.999]) {
        random = value;
        const refreshed = new exports.default();
        await new Promise(setImmediate);
        startingSongs.add(refreshed.audio.src);
        assert.deepEqual(
            new Set(refreshed.tracks.map((t) => t.title)),
            new Set(tracks.map((t) => t.title)),
        );
        assert.equal(
            refreshed.audio.plays,
            0,
            'refresh still waits for a gesture',
        );
    }
    assert.equal(startingSongs.size, 3, 'a fresh page can start on any album');

    for (const muteBeforeLoaded of [false, true]) {
        let finishLoading;
        globalThis.fetch = () =>
            new Promise((resolve) => {
                finishLoading = resolve;
            });
        const delayed = new exports.default();
        bus.dispatch('loadingScreenDone');
        assert.equal(
            delayed.muted,
            false,
            'Enter enables sound even while the library loads',
        );
        if (muteBeforeLoaded) bus.dispatch('muteToggle', true);
        finishLoading({ ok: true, json: async () => ({ tracks }) });
        await new Promise(setImmediate);
        assert.equal(
            delayed.audio.paused,
            muteBeforeLoaded,
            'late loading starts playback unless the visitor has since muted',
        );
    }

    for (const bad of [
        'https://elsewhere.test/track.mp3',
        '/audio/mbdtf/../../private.mp3',
        '/audio/mbdtf/track.js',
        '/audio/jackboys/track.mp3',
        '/audio/previews/jackboys/track.m4a',
    ]) {
        globalThis.fetch = async () => ({
            ok: true,
            json: async () => ({
                tracks: [{ title: 'Bad', src: bad, album: 'mbdtf' }],
            }),
        });
        await album.load();
        assert.equal(
            album.tracks.length,
            0,
            'reject invalid audio destinations',
        );
    }
    globalThis.fetch = async () => {
        throw new Error('Offline');
    };
    await album.load();
    assert.equal(album.tracks.length, 0, 'album loading cannot block the room');
    assert.deepEqual(
        events.at(-1),
        ['albumChange', null],
        'an unavailable manifest must end the Music loading state',
    );
    events.length = 0;
    album.publish();
    assert.deepEqual(
        events.at(-1),
        ['albumChange', null],
        'late subscribers see the failure',
    );
    globalThis.fetch = async () => ({ ok: false });
    await album.load();
    assert.deepEqual(
        events.at(-1),
        ['albumChange', null],
        'HTTP failures are terminal too',
    );
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ tracks }),
    });
    await album.load();
    assert.equal(album.error, false, 'retry recovers after a manifest failure');
    assert.equal(
        events.filter(([name]) => name === 'albumChange').at(-1)[1].count,
        3,
    );
});

test('the shuffled library includes every supplied album file exactly once', () => {
    const root = new URL('../static/', import.meta.url);
    const manifest = JSON.parse(
        fs.readFileSync(new URL('audio/playlist.json', root), 'utf8'),
    );
    assert.equal(manifest.tracks.length, 114);
    assert.equal(new Set(manifest.tracks.map((t) => t.src)).size, 114);
    for (const [album, count] of [
        ['mbdtf', 8],
        ['jackboys', 5],
        ['rodeo', 8],
        ['tlop', 5],
        ['808s', 3],
        ['graduation', 9],
        ['yeezus', 1],
        ['melodicblue', 12],
        ['blonde', 6],
        ['currents', 8],
        ['longlive', 5],
        ['honestly', 6],
        ['livelove', 5],
        ['atlonglast', 6],
        ['utopia', 9],
        ['thankmelater', 3],
        ['astroworld', 10],
        ['collegedropout', 4],
        ['fouryou', 1],
    ]) {
        const tracks = manifest.tracks.filter((t) => t.album === album);
        assert.equal(tracks.length, count);
        const files = fs
            .readdirSync(new URL(`audio/${album}/`, root))
            .filter((f) => /\.(mp3|m4a)$/.test(f));
        assert.deepEqual(
            new Set(tracks.map((t) => t.src.split('/').pop())),
            new Set(files),
        );
        for (const track of tracks)
            assert.ok(
                fs.statSync(new URL(track.src.slice(1), root)).size > 1000,
            );
    }
    const compiledAlbums = require('typescript').transpileModule(
        fs.readFileSync(
            new URL('../src/Application/Audio/AlbumAudio.ts', import.meta.url),
            'utf8',
        ),
        {
            compilerOptions: {
                module: require('typescript').ModuleKind.CommonJS,
            },
        },
    ).outputText;
    const albumExports = {};
    new Function('require', 'exports', compiledAlbums)(
        () => ({ default: { on() {} } }),
        albumExports,
    );
    const music = fs.readFileSync(
        new URL(
            '../desktop/src/components/applications/Music.tsx',
            import.meta.url,
        ),
        'utf8',
    );
    assert.deepEqual(
        Object.keys(albumExports.ALBUMS).sort(),
        [
            ...music
                .match(/const NAMES = \{([\s\S]*?)\} as const/)[1]
                .matchAll(/^\s{4}(\w+|'808s'):/gm),
        ]
            .map((m) => m[1].replaceAll("'", ''))
            .sort(),
        'Music.app names stay in lockstep with the shuffle pool',
    );
});

test('every track has a 30-second preview for the live site', async () => {
    const { execFileSync } = await import('node:child_process');
    const root = new URL('../static/', import.meta.url);
    const manifest = JSON.parse(
        fs.readFileSync(new URL('audio/playlist.json', root), 'utf8'),
    );
    for (const track of manifest.tracks) {
        const preview = new URL(
            track.src.replace(/^\/audio\//, 'audio/previews/'),
            root,
        );
        assert.ok(
            fs.existsSync(preview),
            `${track.src} has a preview (python3 scripts/make-previews.py)`,
        );
        assert.ok(fs.statSync(preview).size < 500_000, 'a short clip');
    }
    // Spot-check the length of one clip with ffprobe when it is installed.
    const first = new URL(
        manifest.tracks[0].src.replace(/^\/audio\//, 'audio/previews/'),
        root,
    );
    try {
        const seconds = Number(
            execFileSync('ffprobe', [
                '-v',
                'error',
                '-show_entries',
                'format=duration',
                '-of',
                'default=nw=1:nk=1',
                first.pathname,
            ]).toString(),
        );
        assert.ok(Math.abs(seconds - 30) < 0.5, `30 s, not ${seconds}`);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
});
