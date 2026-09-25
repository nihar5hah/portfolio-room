import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { dune } from './layout.mjs';

const {
    DUNE,
    DUNE_MODULES,
    DUNE_TABLE,
    duneControlPoints,
    duneModuleGeometry,
    duneKnit,
} = dune;

test('Dune uses repeatable level-backed, corner and low upholstered modules', () => {
    assert.equal(DUNE_MODULES.length, 6);
    assert.deepEqual(DUNE_MODULES, [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
        [2, 1],
    ]);
    for (let column = 0; column < 3; column++) {
        const [nw, ne, , , junction] = duneControlPoints(column, 0);
        assert.equal(nw[1], ne[1], 'horizontal back crest, not a pyramid');
        assert.equal(nw[1], DUNE.back);
        assert.ok(
            junction[1] < DUNE.seat,
            'seam junction is scooped below the seat rim',
        );
    }
    const centerSeat = duneControlPoints(1, 1);
    assert.ok(centerSeat.slice(0, 4).every((p) => p[1] === DUNE.seat));
    const left = duneControlPoints(0, 1),
        right = duneControlPoints(2, 1);
    assert.equal(left[0][1], right[1][1], 'outer corner profiles mirror');
    assert.equal(left[1][1], right[0][1]);
    assert.equal(DUNE_TABLE.x, 0.5, 'stem belongs at a four-module junction');
    assert.equal(DUNE_TABLE.z, 1);
    assert.ok(DUNE_TABLE.height > DUNE.seat + 0.15);
});

test('Dune upholstery meshes are closed, consistently wound and finite', () => {
    let totalTriangles = 0;
    for (const [column, row] of DUNE_MODULES) {
        const g = duneModuleGeometry(column, row);
        const p = g.getAttribute('position'),
            n = g.getAttribute('normal');
        const uv = g.getAttribute('uv'),
            colors = g.getAttribute('color');
        const index = g.index.array;
        assert.equal(n.count, p.count);
        assert.equal(uv.count, p.count);
        assert.equal(colors.count, p.count);
        for (const attr of [p, n, uv, colors])
            assert.ok(
                Array.from(attr.array).every(Number.isFinite),
                'no NaNs in shader inputs',
            );
        for (let i = 0; i < n.count; i++)
            assert.ok(
                Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) <
                    1e-5,
                'unit shading normals',
            );
        const edges = new Map();
        const a = new THREE.Vector3(),
            b = new THREE.Vector3(),
            c = new THREE.Vector3();
        const ab = new THREE.Vector3(),
            ac = new THREE.Vector3();
        let volume = 0;
        for (let i = 0; i < index.length; i += 3) {
            const ids = [index[i], index[i + 1], index[i + 2]];
            a.fromBufferAttribute(p, ids[0]);
            b.fromBufferAttribute(p, ids[1]);
            c.fromBufferAttribute(p, ids[2]);
            ab.subVectors(b, a);
            ac.subVectors(c, a);
            assert.ok(
                ab.cross(ac).lengthSq() > 1e-16,
                'no collapsed triangles at rounded corners',
            );
            volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
            for (let j = 0; j < 3; j++) {
                const from = ids[j],
                    to = ids[(j + 1) % 3];
                const key = `${Math.min(from, to)}:${Math.max(from, to)}`;
                const record = edges.get(key) || { count: 0, winding: 0 };
                record.count++;
                record.winding += from < to ? 1 : -1;
                edges.set(key, record);
            }
        }
        for (const edge of edges.values()) {
            assert.equal(edge.count, 2, 'every edge has exactly two faces');
            assert.equal(
                edge.winding,
                0,
                'adjacent faces agree on inside/outside',
            );
        }
        assert.ok(
            volume > 0.2 && volume < 0.65,
            'outward-facing solid upholstery',
        );
        assert.ok(
            Math.abs(g.boundingBox.min.y) < 1e-8,
            'hem is exactly grounded',
        );
        assert.ok(g.boundingBox.max.y < DUNE.back + 0.025);
        assert.ok(g.boundingBox.getSize(new THREE.Vector3()).x < DUNE.module);
        assert.ok(g.boundingBox.getSize(new THREE.Vector3()).z < DUNE.module);
        totalTriangles += index.length / 3;
        g.dispose();
    }
    assert.ok(
        totalTriangles < 115000,
        'bounded geometry budget across six modules',
    );
});

test('Fabric grain is deterministic and supports filtered close-ups', () => {
    const a = duneKnit(),
        b = duneKnit();
    assert.deepEqual(a.image.data, b.image.data);
    assert.equal(a.image.width, 128);
    assert.equal(a.wrapS, THREE.RepeatWrapping);
    assert.equal(a.wrapT, THREE.RepeatWrapping);
    assert.equal(a.minFilter, THREE.LinearMipmapLinearFilter);
    assert.ok(a.generateMipmaps);
    a.dispose();
    b.dispose();
});
