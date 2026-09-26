// Regenerates the desktop's derived images from their full-size masters:
//   desktop/src/assets/wallpaper-{960,1920,2560}.webp  from wallpaper.jpg
//   desktop/src/assets/wallpaper-960.jpg               (for older phone browsers)
//   desktop/src/assets/icons/mac-*.webp (128px)        from mac-*.png (256px)
//   static/room/albums/thumbs/<slug>-{96,264}.webp     from static/room/albums/<slug>.jpg
// Run after adding an album or changing a master:
//   node desktop/scripts/optimize-images.mjs
// sharp is not a project dependency; point SHARP at any install of it, e.g.
//   SHARP=/tmp/gt/node_modules/sharp node desktop/scripts/optimize-images.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP || 'sharp');
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
);
const at = (...parts) => path.join(root, ...parts);

const jobs = [];
const wallpaper = at('desktop/src/assets/wallpaper.jpg');
for (const width of [960, 1920, 2560])
    jobs.push([
        at(`desktop/src/assets/wallpaper-${width}.webp`),
        sharp(wallpaper).resize(width).webp({ quality: 78, effort: 6 }),
    ]);
// Phones whose browsers can't choose by type in image-set() still get a small file.
jobs.push([
    at('desktop/src/assets/wallpaper-960.jpg'),
    sharp(wallpaper)
        .resize(960)
        .jpeg({ quality: 78, mozjpeg: true, progressive: true }),
]);
const icons = at('desktop/src/assets/icons');
for (const file of fs.readdirSync(icons).filter((f) => /^mac-.*\.png$/.test(f)))
    jobs.push([
        path.join(icons, file.replace(/\.png$/, '.webp')),
        sharp(path.join(icons, file))
            .resize(128, 128)
            .webp({ quality: 85, alphaQuality: 100, effort: 6 }),
    ]);
const albums = at('static/room/albums');
fs.mkdirSync(path.join(albums, 'thumbs'), { recursive: true });
for (const file of fs.readdirSync(albums).filter((f) => f.endsWith('.jpg')))
    for (const size of [96, 264])
        jobs.push([
            path.join(
                albums,
                'thumbs',
                file.replace(/\.jpg$/, `-${size}.webp`),
            ),
            sharp(path.join(albums, file))
                .resize(size, size, { fit: 'cover' })
                .webp({ quality: 80, effort: 6 }),
        ]);

for (const [out, image] of jobs) {
    await image.toFile(out);
    console.log(path.relative(root, out), fs.statSync(out).size);
}
