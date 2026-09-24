import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('screen hover focuses and unfocuses the camera, deferring exit until a drag finishes', () => {
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
    const move = (inside) =>
        listeners.get('mousemove')({
            target: { id: inside ? 'computer-screen' : 'webgl' },
        });
    move(true);
    assert.equal(transitions.at(-1), 'enterMonitor');
    move(false);
    assert.equal(
        transitions.at(-1),
        'leftMonitor',
        'leaving the screen zooms back to the desk',
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
