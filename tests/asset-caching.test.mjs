import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
const require = createRequire(import.meta.url);
const ts = require('typescript');

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');

/** Transpile one of the room's modules; `stubs` answers its imports. */
function load(path, stubs = {}, globals = {}) {
    const compiled = ts.transpileModule(read(path), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    }).outputText;
    const exports = {};
    new Function('require', 'exports', ...Object.keys(globals), compiled)(
        (name) => stubs[name] ?? (name === 'three' ? THREE : require(name)),
        exports,
        ...Object.values(globals),
    );
    return exports;
}

/** The room's sources, with the real album list. */
function sources() {
    const slugs = [
        ...read('src/Application/Audio/AlbumAudio.ts')
            .match(/export const ALBUMS = \{([\s\S]*?)\};/)[1]
            .matchAll(/^\s{4}(\w+|'808s'):/gm),
    ].map((m) => m[1].replaceAll("'", ''));
    assert.ok(slugs.length > 10);
    const ALBUMS = Object.fromEntries(slugs.map((slug) => [slug, slug]));
    return load('src/Application/sources.ts', {
        './Audio/AlbumAudio': { ALBUMS },
    }).default;
}

/** What the build defines as __ASSET_VERSIONS__ (bundler/webpack.common.js). */
function versions() {
    const config = require('../bundler/webpack.common.js');
    const define = config.plugins.find(
        (plugin) => plugin.definitions?.__ASSET_VERSIONS__,
    );
    return JSON.parse(define.definitions.__ASSET_VERSIONS__);
}

test('models and textures are asked for by content hash; other paths pass through', () => {
    const { default: assetUrl } = load(
        'src/Application/Utils/assetUrl.ts',
        {},
        {
            __ASSET_VERSIONS__: {
                'models/a.glb': 'abc123',
                'room/b.webp': 'f00',
            },
        },
    );
    assert.equal(assetUrl('models/a.glb'), 'models/a.glb?v=abc123');
    assert.equal(assetUrl('/room/b.webp'), '/room/b.webp?v=f00');
    assert.equal(assetUrl('fonts/x.woff2'), 'fonts/x.woff2');
    // Tests and tools without the build's table: plain paths.
    const { default: plain } = load('src/Application/Utils/assetUrl.ts');
    assert.equal(plain('models/a.glb'), 'models/a.glb');
});

test('every file the room loads exists, ships, and has a content hash', () => {
    const table = versions();
    for (const source of sources()) {
        const file = new URL(`static/${source.path}`, root);
        assert.ok(fs.existsSync(file), `${source.path} is missing`);
        assert.match(
            table[source.path] ?? '',
            /^[0-9a-f]{10}$/,
            `${source.path} has no content hash`,
        );
    }
    assert.ok(table['room/blueprint.webp'], 'the loading screen image too');
    // The JPEG originals stay as sources: never shipped, never hashed.
    assert.ok(
        !Object.keys(table).some((path) => /albums\/\w+\.jpg$/.test(path)),
    );
    assert.ok(!('room/messi-10.jpg' in table));
});

test('hashed requests are cached for a year; everything else revalidates', () => {
    const { headers } = JSON.parse(read('vercel.json'));
    const rule = headers.find((h) => h.source === '/(models|room)/(.*)');
    assert.ok(rule, 'a rule for models and room textures');
    assert.deepEqual(rule.has, [{ type: 'query', key: 'v' }]);
    assert.match(
        rule.headers.find((h) => h.key === 'Cache-Control').value,
        /max-age=31536000, immutable/,
    );
    // The local server agrees (server/index.mjs).
    assert.match(read('server/index.mjs'), /searchParams\.has\('v'\)/);
});

test('the warm-up uploads real images, not placeholders still waiting for theirs', () => {
    const { texturesIn } = load('src/Application/Renderer.ts', {
        'three/examples/jsm/renderers/CSS3DRenderer.js': {
            CSS3DRenderer: class {},
        },
        './Application': { default: class {} },
        './UI/EventBus': { default: { on() {} } },
    });
    const image = (width) => ({ width, height: width });
    const real = new THREE.Texture(image(512));
    real.needsUpdate = true;
    const normal = new THREE.Texture(image(256));
    normal.needsUpdate = true;
    const unset = new THREE.Texture(image(64)); // never marked for upload
    const empty = new THREE.Texture(undefined);
    empty.needsUpdate = true;
    const scene = new THREE.Scene();
    scene.add(
        new THREE.Mesh(
            new THREE.BoxGeometry(),
            new THREE.MeshStandardMaterial({ map: real, normalMap: normal }),
        ),
        new THREE.Mesh(
            new THREE.BoxGeometry(),
            new THREE.MeshStandardMaterial({ map: real, emissiveMap: unset }),
        ),
        new THREE.Mesh(
            new THREE.BoxGeometry(),
            new THREE.MeshBasicMaterial({ map: empty }),
        ),
    );
    const found = texturesIn(scene);
    assert.equal(found.length, 2, 'each texture once');
    assert.ok(found.includes(real) && found.includes(normal));
});
