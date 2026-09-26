import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

function load() {
    const exports = {};
    const source = fs.readFileSync(
        new URL(
            '../src/Application/UI/components/LoadingScreen.tsx',
            import.meta.url,
        ),
        'utf8',
    );
    new Function(
        'require',
        'exports',
        ts.transpileModule(source, {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                jsx: ts.JsxEmit.React,
                esModuleInterop: true,
            },
        }).outputText,
    )(
        (name) => (name === 'react' ? require('react') : { default: {} }),
        exports,
    );
    return exports;
}

test('the drawing starts blank even though album-art placeholders count at once', () => {
    const { drafted } = load();
    // 58 sources, 38 of them lazy placeholders counted immediately.
    assert.equal(drafted(38, 58, 38), 0);
    assert.equal(drafted(48, 58, 38), 0.5);
    assert.equal(drafted(58, 58, 38), 1);
    assert.equal(drafted(0, 0, 0), 1, 'nothing to load is done');
});

test('the plate lines up with the camera on wide, laptop and portrait screens', () => {
    const { visibleSpan, PLATE_ASPECT } = load();
    // Exactly the plate's aspect: all of it.
    assert.deepEqual(visibleSpan(2400, 1000), [0, 1]);
    // 16:10 laptop: the middle two-thirds (the camera keeps its vertical angle).
    const [a, b] = visibleSpan(1280, 800);
    assert.ok(Math.abs(b - a - 1.6 / PLATE_ASPECT) < 1e-9);
    assert.ok(Math.abs(a + b - 1) < 1e-9, 'centred');
    // Portrait phone: the horizontal angle is kept, so 1/2.4 of the plate.
    const [c, d] = visibleSpan(390, 844);
    assert.ok(Math.abs(d - c - 1 / PLATE_ASPECT) < 1e-9);
});

test('every callout points at something inside the plate', () => {
    const { CALLOUTS } = load();
    assert.equal(CALLOUTS.length, 4);
    for (const c of CALLOUTS) {
        assert.ok(c.u > 0 && c.u < 1 && c.v > 0 && c.v < 1, c.title);
        assert.ok(['up', 'down'].includes(c.dir));
    }
});

test('the blueprint the screen draws is shipped and small', () => {
    const file = new URL('../static/room/blueprint.webp', import.meta.url);
    assert.ok(fs.existsSync(file), 'scripts/render-blueprint.js makes it');
    assert.ok(fs.statSync(file).size < 250_000);
});
