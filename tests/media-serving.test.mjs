import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createPortfolioServer } from '../server/index.mjs';

test('static media serves exact byte ranges for native audio playback and seeking', async () => {
    const file = await readFile(new URL('../dist/resume.pdf', import.meta.url));
    const server = createPortfolioServer({ apiKey: '' });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}/resume.pdf`;
    try {
        for (const [range, start, end] of [
            ['bytes=0-15', 0, 15],
            [`bytes=${file.length - 8}-`, file.length - 8, file.length - 1],
            ['bytes=-8', file.length - 8, file.length - 1],
            [
                `bytes=${file.length - 8}-${file.length + 10}`,
                file.length - 8,
                file.length - 1,
            ],
        ]) {
            const response = await fetch(url, { headers: { Range: range } });
            assert.equal(response.status, 206);
            assert.equal(response.headers.get('accept-ranges'), 'bytes');
            assert.equal(
                response.headers.get('content-range'),
                `bytes ${start}-${end}/${file.length}`,
            );
            assert.deepEqual(
                Buffer.from(await response.arrayBuffer()),
                file.subarray(start, end + 1),
            );
        }
        for (const range of [
            `bytes=${file.length}-`,
            'bytes=9-2',
            'bytes=-0',
        ]) {
            const response = await fetch(url, { headers: { Range: range } });
            assert.equal(response.status, 416);
            assert.equal(
                response.headers.get('content-range'),
                `bytes */${file.length}`,
            );
            assert.equal((await response.arrayBuffer()).byteLength, 0);
        }
        // Unsupported multipart/malformed ranges are ignored as a normal full GET.
        for (const range of ['bytes=0-1,4-5', 'bytes=oops', 'bytes=-']) {
            const response = await fetch(url, { headers: { Range: range } });
            assert.equal(response.status, 200);
            assert.equal(
                (await response.arrayBuffer()).byteLength,
                file.length,
            );
        }
        const head = await fetch(url, {
            method: 'HEAD',
            headers: { Range: 'bytes=0-15' },
        });
        assert.equal(head.status, 200);
        assert.equal(head.headers.get('content-length'), String(file.length));
        assert.equal((await head.arrayBuffer()).byteLength, 0);
        // Files that keep their names when edited (models, textures, the
        // résumé) revalidate: a stale copy is never reused, an unchanged one
        // costs a 304.
        const full = await fetch(url);
        await full.arrayBuffer();
        assert.equal(full.headers.get('cache-control'), 'no-cache');
        const etag = full.headers.get('etag');
        assert.ok(etag, 'unhashed files carry an ETag');
        const again = await fetch(url, { headers: { 'If-None-Match': etag } });
        assert.equal(again.status, 304);
        assert.equal((await again.arrayBuffer()).byteLength, 0);
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});

test('text assets are served from the precompressed build copies the browser accepts', async () => {
    const { writeFile, rm } = await import('node:fs/promises');
    const { brotliCompressSync, gzipSync, brotliDecompressSync, gunzipSync } =
        await import('node:zlib');
    const http = await import('node:http');
    const { accepts } = await import('../server/index.mjs');
    assert.ok(accepts('gzip, deflate, br', 'br'));
    assert.ok(accepts('br;q=1.0, gzip;q=0.5', 'gzip'));
    assert.ok(!accepts('br;q=0, gzip', 'br'));
    assert.ok(!accepts('', 'br'));
    const body = Buffer.from('const room = "Nihar";\n'.repeat(400));
    const file = new URL(
        '../dist/compress-check.0123456789abcdef0123.js',
        import.meta.url,
    );
    await writeFile(file, body);
    await writeFile(new URL(file.href + '.br'), brotliCompressSync(body));
    await writeFile(new URL(file.href + '.gz'), gzipSync(body));
    const server = createPortfolioServer({ apiKey: '' });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const get = (headers) =>
        new Promise((resolve, reject) =>
            http
                .get(
                    {
                        host: '127.0.0.1',
                        port: server.address().port,
                        path: '/compress-check.0123456789abcdef0123.js',
                        headers,
                    },
                    (res) => {
                        const chunks = [];
                        res.on('data', (c) => chunks.push(c));
                        res.on('end', () =>
                            resolve({ res, data: Buffer.concat(chunks) }),
                        );
                    },
                )
                .on('error', reject),
        );
    try {
        const br = await get({ 'Accept-Encoding': 'gzip, deflate, br' });
        assert.equal(br.res.headers['content-encoding'], 'br');
        assert.equal(
            br.res.headers['content-type'],
            'text/javascript; charset=utf-8',
        );
        assert.equal(br.res.headers.vary, 'Accept-Encoding');
        assert.match(br.res.headers['cache-control'], /immutable/);
        assert.deepEqual(brotliDecompressSync(br.data), body);
        const gz = await get({ 'Accept-Encoding': 'gzip' });
        assert.equal(gz.res.headers['content-encoding'], 'gzip');
        assert.deepEqual(gunzipSync(gz.data), body);
        assert.notEqual(gz.res.headers.etag, br.res.headers.etag);
        const plain = await get({});
        assert.equal(plain.res.headers['content-encoding'], undefined);
        assert.deepEqual(plain.data, body);
        // Byte ranges always come from the original file.
        const range = await get({
            'Accept-Encoding': 'br',
            Range: 'bytes=0-9',
        });
        assert.equal(range.res.statusCode, 206);
        assert.equal(range.res.headers['content-encoding'], undefined);
        assert.deepEqual(range.data, body.subarray(0, 10));
    } finally {
        server.close();
        for (const suffix of ['', '.br', '.gz'])
            await rm(new URL(file.href + suffix), { force: true });
    }
});
