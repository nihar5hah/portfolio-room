import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('screen hover focuses and unfocuses the camera, deferring exit until a drag finishes', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const listeners = new Map();
    let focused = false;
    globalThis.document = {
        addEventListener: (name, listener) => listeners.set(name, listener),
        querySelector: () => ({ focus: () => (focused = true) }),
    };
    const compiled = require('typescript').transpileModule(
        fs.readFileSync(
            new URL(
                '../src/Application/World/MonitorScreen.ts',
                import.meta.url,
            ),
            'utf8',
        ),
        {
            compilerOptions: {
                module: require('typescript').ModuleKind.CommonJS,
            },
        },
    ).outputText;
    const exports = {};
    new Function('require', 'exports', compiled)(
        (name) =>
            name === './Computer'
                ? { LAPTOP_SCREEN: { width: 1, height: 1 } }
                : { default: class {} },
        exports,
    );
    const transitions = [];
    const forwarded = [];
    const screen = Object.create(exports.default.prototype);
    screen.camera = {
        currentKeyframe: 'monitor',
        trigger: (name) => transitions.push(name),
    };
    screen.application = { mouse: { trigger: (name) => forwarded.push(name) } };
    screen.initializeScreenEvents();
    // The top bar (with "Open full size") ends at y 50; the screen below it.
    const BAR = 50;
    screen.rect = { top: 80, height: 500 };
    const header = { getBoundingClientRect: () => ({ bottom: BAR }) };
    document.querySelector = (selector) =>
        selector === '.room-interface header'
            ? header
            : { focus: () => (focused = true) };
    // Off the screen: below/beside it by default, or up by the top bar.
    const move = (inside, clientY = 400) =>
        listeners.get('mousemove')({
            target: { id: inside ? 'computer-screen' : 'webgl' },
            clientY,
        });
    const up = BAR + 10;
    move(true);
    assert.equal(transitions.at(-1), 'enterMonitor');
    move(false);
    assert.equal(
        transitions.at(-1),
        'leftMonitor',
        'leaving the screen downwards or sideways steps back at once',
    );
    transitions.length = 0;
    move(true);
    listeners.get('mousedown')({ inComputer: true });
    move(false);
    move(false);
    assert.ok(
        !transitions.includes('leftMonitor'),
        'dragging outside keeps focus until release',
    );
    listeners.get('mouseup')({});
    assert.equal(
        transitions.at(-1),
        'leftMonitor',
        'release outside unfocuses the screen',
    );
    transitions.length = 0;
    move(true);
    listeners.get('mousedown')({ inComputer: true });
    move(false);
    move(true);
    listeners.get('mouseup')({ inComputer: true });
    assert.ok(
        !transitions.includes('leftMonitor'),
        'returning inside cancels the pending exit',
    );
    assert.ok(forwarded.includes('mousedown') && forwarded.includes('mouseup'));

    // Heading up to the top bar gets a moment, enough to reach "Open full
    // size"; reaching it keeps the Mac in focus.
    transitions.length = 0;
    const button = {
        target: {
            id: '',
            closest: (selector) => (selector === '.room-interface' ? {} : null),
        },
        clientY: 25,
    };
    move(true);
    move(false, up);
    assert.ok(!transitions.includes('leftMonitor'), 'not at once, going up');
    t.mock.timers.tick(exports.LEAVE_GRACE / 2);
    move(false, up - 20);
    listeners.get('mousemove')(button);
    t.mock.timers.tick(exports.LEAVE_GRACE * 3);
    assert.ok(
        !transitions.includes('leftMonitor'),
        'reaching Open full size in time keeps focus',
    );
    move(false, up);
    t.mock.timers.tick(exports.LEAVE_GRACE);
    assert.equal(
        transitions.at(-1),
        'leftMonitor',
        'lingering by the top bar off the button steps back after a moment',
    );
    transitions.length = 0;
    move(true);
    move(false, 120); // right edge, near the top of the screen: diagonal exit
    assert.ok(!transitions.includes('leftMonitor'), 'a diagonal exit counts');
    move(false, 400);
    assert.equal(
        transitions.at(-1),
        'leftMonitor',
        'turning away from the top bar steps back at once',
    );
    transitions.length = 0;
    move(true);
    move(false, up);
    t.mock.timers.tick(exports.LEAVE_GRACE / 2);
    move(true);
    t.mock.timers.tick(exports.LEAVE_GRACE * 3);
    assert.ok(
        !transitions.includes('leftMonitor'),
        'coming back to the screen in time keeps focus',
    );
    move(false, up);
    t.mock.timers.tick(exports.LEAVE_GRACE * 2);
    move(false, up);
    t.mock.timers.tick(exports.LEAVE_GRACE * 2);
    listeners.get('mousemove')(button);
    t.mock.timers.tick(exports.LEAVE_GRACE * 2);
    assert.equal(
        transitions.filter((name) => name === 'leftMonitor').length,
        1,
        'a button reached after stepping back does not refocus or repeat',
    );
    listeners.get('keydown')({ key: 'Escape' });
    assert.equal(transitions.at(-1), 'leftMonitor');
    assert.equal(focused, true);
    transitions.length = 0;
    move(true);
    listeners.get('mousedown')({ inComputer: true });
    listeners.get('mousemove')({
        target: { id: 'computer-screen' },
        inComputer: false,
    });
    assert.ok(
        !transitions.includes('leftMonitor'),
        'captured drag still defers exit',
    );
    listeners.get('mouseup')({ inComputer: false });
    assert.equal(
        transitions.at(-1),
        'leftMonitor',
        'captured release outside exits the monitor',
    );
});
