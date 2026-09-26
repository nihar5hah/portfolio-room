import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function loadWindowState() {
    const ts = require('typescript');
    const exports = {};
    new Function(
        'exports',
        ts.transpileModule(
            fs.readFileSync(
                new URL(
                    '../desktop/src/components/os/windowState.ts',
                    import.meta.url,
                ),
                'utf8',
            ),
            {
                compilerOptions: {
                    module: ts.ModuleKind.CommonJS,
                    target: ts.ScriptTarget.ES2022,
                },
            },
        ).outputText,
    )(exports);
    return exports;
}

const app = (name) => ({ name, icon: name.toLowerCase() });

test('opening apps stacks windows and reopening brings one forward', () => {
    const w = loadWindowState();
    let windows = w.open({}, 'showcase', app('Portfolio'));
    windows = w.open(windows, 'begu', app('Begu'));
    assert.deepEqual(windows.showcase, {
        zIndex: 1,
        minimized: false,
        name: 'Portfolio',
        icon: 'portfolio',
    });
    assert.equal(windows.begu.zIndex, 2, 'the newest window is on top');
    assert.equal(
        w.open(windows, 'begu', app('Begu')),
        windows,
        'reopening the front window changes nothing',
    );
    const raised = w.open(windows, 'showcase', app('Portfolio'));
    assert.equal(
        raised.showcase.zIndex,
        3,
        'reopening a back window raises it',
    );
    const hidden = w.minimize(raised, 'showcase');
    assert.equal(
        w.open(hidden, 'showcase', app('Portfolio')).showcase.minimized,
        false,
        'reopening a minimised window restores it',
    );
});

test('clicks and focus inside the front window keep the same state object', () => {
    const w = loadWindowState();
    let windows = w.open({}, 'showcase', app('Portfolio'));
    windows = w.open(windows, 'music', app('Music'));
    // mousedown and focus both report the same click: neither may re-render.
    assert.equal(w.raise(windows, 'music'), windows);
    assert.equal(
        w.raise(windows, 'missing'),
        windows,
        'closed windows are ignored',
    );
    const raised = w.raise(windows, 'showcase');
    assert.notEqual(raised, windows);
    assert.equal(raised.showcase.zIndex, 3);
    assert.equal(raised.music, windows.music, 'other windows are untouched');
    assert.equal(
        w.raise(raised, 'showcase'),
        raised,
        'a second event is a no-op',
    );
});

test('closing, minimising and the dock toggle', () => {
    const w = loadWindowState();
    let windows = w.open({}, 'showcase', app('Portfolio'));
    windows = w.open(windows, 'begu', app('Begu'));
    const closed = w.close(windows, 'begu');
    assert.deepEqual(Object.keys(closed), ['showcase']);
    assert.ok(windows.begu, 'the previous state is not mutated');
    assert.equal(w.close(closed, 'begu'), closed);
    const minimised = w.minimize(windows, 'begu');
    assert.equal(minimised.begu.minimized, true);
    assert.equal(
        windows.begu.minimized,
        false,
        'the previous state is not mutated',
    );
    assert.equal(w.minimize(minimised, 'begu'), minimised);
    // Dock: the front window minimises, a minimised one restores on top, and
    // one behind is brought forward without minimising.
    const toggled = w.toggle(windows, 'begu');
    assert.equal(toggled.begu.minimized, true);
    const restored = w.toggle(toggled, 'begu');
    assert.equal(restored.begu.minimized, false);
    assert.equal(restored.begu.zIndex, w.highestZIndex(restored));
    const forward = w.toggle(restored, 'showcase');
    assert.equal(forward.showcase.minimized, false);
    assert.equal(forward.showcase.zIndex, w.highestZIndex(forward));
    assert.equal(w.toggle(forward, 'missing'), forward);
    assert.equal(w.highestZIndex({}), 0);
});
