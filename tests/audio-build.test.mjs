import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    hostedPlaylist,
    audioCopyIgnores,
} = require('../bundler/audio-library.js');
const manifest = require('../static/audio/playlist.json');
const { origin } = require('../config/audio-library.json');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

function expectedPlaylist() {
    return {
        ...manifest,
        tracks: manifest.tracks.map((track) => ({
            ...track,
            src: new URL(track.src, origin).href,
        })),
    };
}

test('every build uses all full songs at the independent host, never local-file availability', () => {
    const exists = fs.existsSync;
    let result;
    try {
        fs.existsSync = () => {
            throw new Error('Playlist selection must not inspect local music');
        };
        result = JSON.parse(
            hostedPlaylist(Buffer.from(JSON.stringify(manifest))),
        );
    } finally {
        fs.existsSync = exists;
    }
    assert.deepEqual(result, expectedPlaylist());
    assert.equal(result.tracks.length, 114);
    assert.ok(
        result.tracks.every(
            (track) => !track.preview && !track.src.includes('/previews/'),
        ),
    );
    assert.ok(audioCopyIgnores.includes('**/audio/previews/**'));
    for (const track of manifest.tracks)
        assert.ok(audioCopyIgnores.includes(`**/audio/${track.album}/**`));
});

test('malformed or snippet manifests fail rather than silently dropping or substituting songs', () => {
    for (const input of [
        {},
        { tracks: [] },
        { tracks: [manifest.tracks[0], manifest.tracks[0]] },
        { tracks: [{ ...manifest.tracks[0], preview: true }] },
        {
            tracks: [
                { ...manifest.tracks[0], src: '/audio/previews/mbdtf/01.m4a' },
            ],
        },
        {
            tracks: [
                { ...manifest.tracks[0], src: '/audio/mbdtf/../secret.m4a' },
            ],
        },
        { tracks: [{ ...manifest.tracks[0], src: '/audio/jackboys/01.m4a' }] },
        {
            tracks: [
                { ...manifest.tracks[0], src: 'https://untrusted.test/01.m4a' },
            ],
        },
        {
            tracks: [
                {
                    ...manifest.tracks[0],
                    album: 'previews',
                    src: '/audio/previews/01.m4a',
                },
            ],
        },
    ]) {
        assert.throws(() => hostedPlaylist(JSON.stringify(input)));
    }
});

function compile(config) {
    return new Promise((resolve, reject) => {
        const compiler = webpack(config);
        compiler.run((error, stats) => {
            compiler.close((closeError) => {
                if (error || closeError) return reject(error || closeError);
                if (stats.hasErrors())
                    return reject(
                        new Error(stats.toString({ all: false, errors: true })),
                    );
                resolve();
            });
        });
    });
}

for (const localMusic of [false, true]) {
    test(`real site copy rules produce full-only playlists with local music ${localMusic ? 'present' : 'absent'}`, async () => {
        const root = fs.mkdtempSync(
            path.join(os.tmpdir(), 'portfolio-audio-build-'),
        );
        const write = (relative, content) => {
            const file = path.join(root, 'static', relative);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, content);
        };
        try {
            write('audio/playlist.json', JSON.stringify(manifest));
            write('audio/startup/startup.mp3', 'keep-room-effects');
            if (localMusic) {
                // Both old clips and full files may exist on a developer's Mac.
                // Neither belongs in the main site's deployment anymore.
                for (const track of manifest.tracks) {
                    write(track.src.slice(1), 'full-track-fixture');
                    write(
                        track.src.replace(/^\/audio\//, 'audio/previews/'),
                        'obsolete-clip-fixture',
                    );
                }
            }
            const site = require('../bundler/webpack.common.js');
            const copy = site.plugins.find(
                (plugin) => plugin instanceof CopyPlugin,
            );
            assert.ok(copy);
            await compile({
                mode: 'production',
                context: root,
                entry: {},
                output: { path: path.join(root, 'dist') },
                plugins: [new CopyPlugin({ patterns: copy.patterns })],
            });
            const built = JSON.parse(
                fs.readFileSync(
                    path.join(root, 'dist/audio/playlist.json'),
                    'utf8',
                ),
            );
            assert.deepEqual(built, expectedPlaylist());
            assert.equal(
                fs.readFileSync(
                    path.join(root, 'dist/audio/startup/startup.mp3'),
                    'utf8',
                ),
                'keep-room-effects',
            );
            assert.equal(
                fs.existsSync(path.join(root, 'dist/audio/previews')),
                false,
            );
            for (const track of manifest.tracks)
                assert.equal(
                    fs.existsSync(path.join(root, 'dist', track.src)),
                    false,
                    track.src,
                );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
}
