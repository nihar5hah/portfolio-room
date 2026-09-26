// Cuts the coffee mug out of the old 4096² desk bake: its model alone and
// its texture region (512 px), UVs remapped. Run from a folder with
// @gltf-transform/core, @gltf-transform/functions and sharp installed.
import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
const io = new NodeIO();
const doc = await io.read(
    '/Users/niharshah/Misc/portfolio-remix/static/models/Decor/decor.glb',
);
const root = doc.getRoot();
let keep = null;
for (const node of root.listNodes()) {
    if (node.getName() === 'coffee') keep = node;
    else if (node.getMesh()) node.dispose();
}
const prim = keep.getMesh().listPrimitives()[0];
const uv = prim.getAttribute('TEXCOORD_0');
let min = [1, 1],
    max = [0, 0];
for (let i = 0; i < uv.getCount(); i++) {
    const [u, v] = uv.getElement(i, []);
    min = [Math.min(min[0], u), Math.min(min[1], v)];
    max = [Math.max(max[0], u), Math.max(max[1], v)];
}
const S = 4096,
    pad = 8;
const x0 = Math.max(0, Math.floor(min[0] * S) - pad),
    y0 = Math.max(0, Math.floor(min[1] * S) - pad);
const x1 = Math.min(S, Math.ceil(max[0] * S) + pad),
    y1 = Math.min(S, Math.ceil(max[1] * S) + pad);
console.log('uv box', min, max, 'px', x0, y0, x1, y1, 'size', x1 - x0, y1 - y0);
// UVs of a glTF are top-left origin (flipY false in BakedModel), same as image rows.
for (let i = 0; i < uv.getCount(); i++) {
    const [u, v] = uv.getElement(i, []);
    uv.setElement(i, [(u * S - x0) / (x1 - x0), (v * S - y0) / (y1 - y0)]);
}
const w = x1 - x0,
    h = y1 - y0;
const out = 256;
await sharp(
    '/Users/niharshah/Misc/portfolio-remix/static/models/Decor/baked_decor_modified.jpg',
)
    .extract({ left: x0, top: y0, width: w, height: h })
    .resize(512, Math.round((512 * h) / w), { fit: 'fill' })
    .jpeg({ quality: 88 })
    .toFile(
        '/Users/niharshah/Misc/portfolio-remix/static/models/Decor/coffee.jpg',
    );
// Drop unused nodes/buffers.
const { prune } = await import('@gltf-transform/functions');
await doc.transform(prune());
await io.write(
    '/Users/niharshah/Misc/portfolio-remix/static/models/Decor/coffee.glb',
    doc,
);
