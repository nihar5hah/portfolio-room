// Pre-compresses the build (run after webpack; `npm run build` does both):
// every text-like file in dist/ gets a Brotli (.br) and gzip (.gz) copy,
// kept only when it is meaningfully smaller. server/index.mjs serves the
// best one the browser accepts. Audio, video and images are already
// compressed and are skipped.
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const COMPRESSIBLE = new Set([
    '.js',
    '.css',
    '.html',
    '.svg',
    '.json',
    '.txt',
    '.glb',
    '.ttf',
    '.xml',
    '.webmanifest',
]);

async function* files(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            // Album audio is streamed as-is.
            if (entry.name === 'audio') continue;
            yield* files(path);
        } else yield path;
    }
}

export async function compressDist(root) {
    let before = 0,
        after = 0,
        count = 0;
    for await (const path of files(root)) {
        if (!COMPRESSIBLE.has(extname(path))) continue;
        const info = await stat(path);
        if (info.size < 1024) continue;
        const data = await readFile(path);
        const br = brotliCompressSync(data, {
            params: {
                [constants.BROTLI_PARAM_QUALITY]: 11,
                [constants.BROTLI_PARAM_SIZE_HINT]: data.length,
            },
        });
        const gz = gzipSync(data, { level: 9 });
        // Not worth a second request path for under ~5% savings.
        if (br.length < data.length * 0.95) await writeFile(`${path}.br`, br);
        if (gz.length < data.length * 0.95) await writeFile(`${path}.gz`, gz);
        before += data.length;
        after += Math.min(br.length, data.length);
        count++;
    }
    return { count, before, after };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const root = fileURLToPath(new URL('../dist/', import.meta.url));
    const { count, before, after } = await compressDist(root);
    console.log(
        `compressed ${count} files: ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB (brotli)`,
    );
}
