import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function loadBridge() {
    const ts = require('typescript');
    const exports = {};
    new Function(
        'exports',
        ts.transpileModule(
            fs.readFileSync(
                new URL('../desktop/src/inputBridge.ts', import.meta.url),
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

/** A bridge with a manual frame clock: run() fires the pending frame. */
function harness() {
    const { createInputBridge } = loadBridge();
    const posted = [];
    let frames = new Map();
    let next = 1;
    const bridge = createInputBridge({
        post: (message) => posted.push(message),
        viewport: () => ({ width: 800, height: 600 }),
        schedule: (callback) => {
            frames.set(next, callback);
            return next++;
        },
        cancel: (handle) => frames.delete(handle),
    });
    const run = () => {
        const due = [...frames.values()];
        frames = new Map();
        due.forEach((callback) => callback());
    };
    return { bridge, posted, run, pending: () => frames.size };
}

test('the laptop bridge keeps the message format the room expects', () => {
    const { toMessage } = loadBridge();
    const viewport = { width: 800, height: 600 };
    assert.deepEqual(
        toMessage('mousemove', { clientX: 10, clientY: 20 }, viewport),
        {
            type: 'mousemove',
            inComputer: true,
            clientX: 10,
            clientY: 20,
            key: undefined,
        },
    );
    assert.equal(
        toMessage('mousemove', { clientX: 801, clientY: 20 }, viewport)
            .inComputer,
        false,
        'a drag that leaves the screen is outside the computer',
    );
    assert.equal(
        toMessage('mouseup', { clientX: 0, clientY: 600 }, viewport).inComputer,
        true,
        'screen edges are inside',
    );
    const cancel = toMessage(
        'pointercancel',
        { clientX: 5, clientY: 5 },
        viewport,
    );
    assert.equal(cancel.type, 'mouseup', 'a cancelled pointer ends the click');
    assert.equal(cancel.inComputer, false);
    const key = toMessage('keydown', { key: 'a' }, viewport);
    assert.equal(key.inComputer, true, 'keys always belong to the computer');
    assert.equal(key.key, 'a');
});

test('mouse moves reach the room at most once per frame, with the latest position', () => {
    const { bridge, posted, run, pending } = harness();
    for (let x = 0; x < 5; x++)
        bridge.handle('mousemove', { clientX: x, clientY: x * 2 });
    assert.equal(posted.length, 0, 'moves wait for the frame');
    assert.equal(pending(), 1, 'one frame is scheduled for many moves');
    run();
    assert.deepEqual(
        posted.map((m) => [m.type, m.clientX, m.clientY]),
        [['mousemove', 4, 8]],
    );
    run();
    assert.equal(posted.length, 1, 'no repeat without a new move');
    bridge.handle('mousemove', { clientX: 9, clientY: 9 });
    run();
    assert.equal(posted.length, 2, 'the next move schedules a new frame');
});

test('clicks and keys go at once, after any pending move, in order', () => {
    const { bridge, posted, run, pending } = harness();
    bridge.handle('mousemove', { clientX: 1, clientY: 1 });
    bridge.handle('mousemove', { clientX: 2, clientY: 3 });
    bridge.handle('mousedown', { clientX: 2, clientY: 3 });
    assert.deepEqual(
        posted.map((m) => [m.type, m.clientX]),
        [
            ['mousemove', 2],
            ['mousedown', 2],
        ],
        'the move to the click position is flushed before the press',
    );
    assert.equal(pending(), 0, 'the flushed move cancels its frame');
    bridge.handle('mousemove', { clientX: 4, clientY: 4 });
    bridge.handle('mouseup', { clientX: 4, clientY: 4 });
    bridge.handle('keydown', { key: 'Enter' });
    bridge.handle('focusin', {});
    run();
    assert.deepEqual(
        posted.map((m) => m.type),
        [
            'mousemove',
            'mousedown',
            'mousemove',
            'mouseup',
            'keydown',
            'focusin',
        ],
    );
});
