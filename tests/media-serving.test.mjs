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
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});
