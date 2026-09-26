// Shrinks the room's glTF models for the web (see docs/PERFORMANCE.md):
// welded and deduplicated, simplified where a model carries far more
// triangles than its size on screen needs, textures resized to WebP, and
// Meshopt-compressed with quantized attributes. The room expands quantized
// attributes back to floats on load (Utils/Dequantize.ts).
//
// Run from a folder with @gltf-transform/core, @gltf-transform/extensions,
// @gltf-transform/functions, meshoptimizer and sharp installed:
//   node optimize-models.mjs <static/models dir> [model ...]
import { NodeIO } from '@gltf-transform/core';
import {
    ALL_EXTENSIONS,
    EXTMeshoptCompression,
} from '@gltf-transform/extensions';
import {
    dedup,
    weld,
    simplify,
    prune,
    textureCompress,
    reorder,
    quantize,
    resample,
} from '@gltf-transform/functions';
import {
    MeshoptSimplifier,
    MeshoptEncoder,
    MeshoptDecoder,
} from 'meshoptimizer';
import sharp from 'sharp';

/**
 * Per model: simplify ratio and error, texture size, animation resample.
 * `floatPositions`: keep positions unquantized. Quantizing them moves a
 * dequantization scale into the node transform, and the room reuses some
 * scanned props' geometry without their nodes (Lounge.ts `prop`).
 */
export const PLAN = {
    // 112k triangles for a laptop on a desk; keys and ports survive at 40%.
    'MacBook/macbook-pro-m3.glb': { ratio: 0.4, error: 0.0008, texture: 1024 },
    // Two palm-sized controllers at 24.5k triangles each.
    'PS5/dualsense.glb': {
        ratio: 0.3,
        error: 0.001,
        texture: 512,
        floatPositions: true,
    },
    'PS5/ps5.glb': { ratio: 0.6, error: 0.0008, floatPositions: true },
    // Poly Haven plants and fan: 56k triangles of leaves.
    'Room/room-props.glb': {
        ratio: 0.45,
        error: 0.001,
        texture: 512,
        floatPositions: true,
    },
    'Lounge/lounge-props.glb': {
        ratio: 0.6,
        error: 0.0008,
        texture: 512,
        floatPositions: true,
    },
    'Spezial/spezial-night-indigo.glb': {
        ratio: 0.6,
        error: 0.0008,
        texture: 512,
        floatPositions: true,
    },
    'Chair/embody.glb': { ratio: 0.5, error: 0.0008, floatPositions: true },
    'Begu/husky.glb': { resample: true, floatPositions: true },
    'Bear/dropout-bear.glb': { ratio: 0.7, error: 0.0006 },
};

const [dir, ...only] = process.argv.slice(2);
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
        'meshopt.encoder': MeshoptEncoder,
        'meshopt.decoder': MeshoptDecoder,
    });
const count = (doc) => {
    let tris = 0;
    for (const mesh of doc.getRoot().listMeshes())
        for (const p of mesh.listPrimitives())
            tris +=
                (p.getIndices()?.getCount() ??
                    p.getAttribute('POSITION').getCount()) / 3;
    return Math.round(tris);
};
for (const [file, plan] of Object.entries(PLAN)) {
    if (only.length && !only.includes(file)) continue;
    const path = `${dir}/${file}`;
    const doc = await io.read(path);
    const before = count(doc);
    const steps = [dedup(), prune()];
    if (plan.resample) steps.push(resample());
    steps.push(weld());
    if (plan.ratio)
        steps.push(
            simplify({
                simplifier: MeshoptSimplifier,
                ratio: plan.ratio,
                error: plan.error,
            }),
        );
    if (plan.texture)
        steps.push(
            textureCompress({
                encoder: sharp,
                targetFormat: 'webp',
                resize: [plan.texture, plan.texture],
                quality: 82,
            }),
        );
    steps.push(
        prune(),
        reorder({ encoder: MeshoptEncoder }),
        quantize(
            plan.floatPositions
                ? {
                      pattern:
                          /^(NORMAL|TANGENT|TEXCOORD|COLOR|JOINTS|WEIGHTS)(_\d+)?$/,
                  }
                : {},
        ),
    );
    await doc.transform(...steps);
    doc.createExtension(EXTMeshoptCompression)
        .setRequired(true)
        .setEncoderOptions({
            method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
        });
    await io.write(path, doc);
    console.log(file, before, '→', count(doc), 'triangles');
}
