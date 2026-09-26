import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function loadNavGrid() {
    const ts = require('typescript');
    const exports = {};
    new Function(
        'require',
        'exports',
        ts.transpileModule(
            fs.readFileSync(
                new URL('../src/Application/World/NavGrid.ts', import.meta.url),
                'utf8',
            ),
            { compilerOptions: { module: ts.ModuleKind.CommonJS } },
        ).outputText,
    )(require, exports);
    return exports.default;
}

test('Begu finds his way around furniture without cutting corners through it', () => {
    const NavGrid = loadNavGrid();
    const nav = new NavGrid(
        { minX: 0, maxX: 10000, minZ: 0, maxZ: 10000 },
        100,
        -3000,
    );
    // A wall across the middle with one gap near the top.
    nav.block({ minX: 4800, maxX: 5200, minZ: 0, maxZ: 8000 });
    const path = nav.path({ x: 1000, z: 1000 }, { x: 9000, z: 1000 });
    assert.ok(path && path.length >= 2, 'goes round through the gap');
    let from = { x: 1000, z: 1000 };
    for (const p of path) {
        assert.ok(nav.clear(from, p), 'every leg stays on free floor');
        from = p;
    }
    assert.ok(Math.max(...path.map((p) => p.z)) > 8000, 'through the gap');
    // Taut: a clear straight line is one leg, not a staircase.
    assert.equal(
        nav.path({ x: 1000, z: 1000 }, { x: 3000, z: 6000 }).length,
        1,
    );
    // Sealed off: no path.
    nav.block({ minX: 4800, maxX: 5200, minZ: 8000, maxZ: 10000 });
    assert.equal(nav.path({ x: 1000, z: 1000 }, { x: 9000, z: 1000 }), null);
    // Ends on furniture snap to the nearest free floor.
    const snapped = nav.nearestFree({ x: 5000, z: 3000 });
    assert.ok(nav.free(snapped.x, snapped.z));
    assert.ok(Math.abs(snapped.x - 5000) < 400);
    // Surfaces and clearance.
    nav.surface({ minX: 1000, maxX: 2000, minZ: 1000, maxZ: 2000 }, -2800);
    assert.equal(nav.heightAt(1500, 1500), -2800);
    assert.equal(nav.heightAt(3000, 3000), -3000);
    assert.ok(
        nav.clearance(4600, 3000) < 300 && nav.clearance(2000, 3000) > 2000,
    );
    // Real footprints: points block only where they are, plus the pad.
    const round = new NavGrid(
        { minX: 0, maxX: 4000, minZ: 0, maxZ: 4000 },
        100,
        0,
    );
    const xs = [],
        zs = [];
    for (let a = 0; a < 200; a++) {
        xs.push(2000 + Math.cos(a) * 500);
        zs.push(2000 + Math.sin(a) * 500);
    }
    round.blockPoints(xs, zs, 200);
    assert.ok(!round.free(2000, 2650), 'ring plus pad is blocked');
    assert.ok(
        round.free(2000 + 700, 2000 + 700),
        'its bounding-box corner stays free',
    );
});
