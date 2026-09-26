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
    )((name) => {
        if (name === 'react') return require('react');
        if (name.endsWith('AlbumAudio')) return { ALBUMS: { mbdtf: 'MBDTF' } };
        return { default: {} };
    }, exports);
    return exports;
}

test('the tonearm is the progress bar: rest, then across to the lead-in groove', () => {
    const { armAngle, ARM } = load();
    assert.equal(armAngle(0), ARM.rest);
    assert.equal(armAngle(1), ARM.lead);
    assert.equal(armAngle(2), ARM.lead, 'never past the lead-in');
    assert.equal(armAngle(-1), ARM.rest);
    let last = -Infinity;
    for (let p = 0; p <= 1; p += 0.1) {
        assert.ok(armAngle(p) >= last, 'only ever swings inward');
        last = armAngle(p);
    }
});

test('loading lines read as things being set out, sleeves grouped', () => {
    const { label } = load();
    assert.equal(label('beguModel'), 'Begu');
    assert.equal(label('poster_mbdtf'), 'the record sleeves');
    assert.equal(label('mbdtfVinyl'), 'the record sleeves');
    assert.equal(label('somethingNew'), 'somethingNew');
});
