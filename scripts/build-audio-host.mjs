import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateTrack } = require('../bundler/audio-library.js');
const manifest = require('../static/audio/playlist.json');
const root = fileURLToPath(new URL('../', import.meta.url));
const stage = path.join(root, '.agent-artifacts/audio-host');
const output = path.join(stage, '.vercel/output');
const publicDir = path.join(output, 'static');

// Validate the entire library before replacing any generated output. A partial
// library must fail, never silently substitute clips or remove playlist entries.
const files = manifest.tracks.map((track) => {
    validateTrack(track);
    const source = path.join(root, 'static', track.src);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile())
        throw new Error(`Full track missing: ${source}`);
    return { source, relative: track.src.slice(1) };
});
if (
    !files.length ||
    new Set(files.map((f) => f.relative)).size !== files.length
)
    throw new Error(
        'The full-song library must be nonempty and contain no duplicates',
    );

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });
for (const { source, relative } of files) {
    const target = path.join(publicDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}
fs.writeFileSync(
    path.join(publicDir, 'audio/playlist.json'),
    JSON.stringify(manifest),
);
fs.writeFileSync(
    path.join(publicDir, 'index.html'),
    '<!doctype html><meta charset="utf-8"><title>Portfolio audio</title><p>Portfolio audio assets.</p>\n',
);
fs.writeFileSync(
    path.join(publicDir, 'robots.txt'),
    'User-agent: *\nDisallow: /\n',
);
fs.writeFileSync(
    path.join(output, 'config.json'),
    JSON.stringify(
        {
            version: 3,
            routes: [
                {
                    src: '^/audio/(.*)$',
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Expose-Headers':
                            'Accept-Ranges, Content-Length, Content-Range',
                        // Paths are stable, not content-hashed; never mark them immutable.
                        'Cache-Control': 'public, max-age=3600',
                    },
                    continue: true,
                },
                {
                    src: '^/(.*)$',
                    headers: {
                        'X-Robots-Tag': 'noindex, nofollow',
                        'X-Content-Type-Options': 'nosniff',
                    },
                    continue: true,
                },
                { handle: 'filesystem' },
            ],
        },
        null,
        2,
    ),
);
console.log(`Prepared ${files.length} full tracks in ${stage}`);
console.log(
    'Deploy this directory to the dedicated audio project, never the portfolio project.',
);
