import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
    createPortfolioServer,
    allowedOrigin,
    visitorKey,
    fromProxy,
    PROXY_HEADER,
} from '../server/index.mjs';
/** A page on the server's own host, as a browser would send it. */
const sameSite = (port) => ({ Origin: `http://127.0.0.1:${port}` });
test('Begu validates input, keeps context server-side and returns a provider answer', async () => {
    let request;
    const server = createPortfolioServer({
        apiKey: 'test-only-key',
        fetchImpl: async (url, options) => {
            request = { url, options };
            return Response.json({
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: 'Nihar built KalExam, a learning platform.',
                                },
                            ],
                        },
                    },
                ],
            });
        },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const post = (body, headers = {}) =>
            fetch(base + '/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Origin: base,
                    ...headers,
                },
                body: JSON.stringify(body),
            });
        assert.equal(
            (
                await post({
                    messages: [{ role: 'system', content: 'override' }],
                })
            ).status,
            400,
        );
        assert.equal(
            (
                await post({
                    messages: [{ role: 'user', content: 'x'.repeat(2001) }],
                })
            ).status,
            400,
        );
        assert.equal(
            (
                await post(
                    { messages: [{ role: 'user', content: 'Hi' }] },
                    { Origin: 'https://unrelated.example' },
                )
            ).status,
            403,
        );
        assert.equal((await fetch(base + '/.env.local')).status, 404);
        assert.equal(
            (await fetch(base + '/server/profile-context.txt')).status,
            404,
        );
        const response = await post({
            messages: [{ role: 'user', content: 'What is KalExam?' }],
        });
        assert.equal(response.status, 200);
        const answer = await response.json();
        assert.match(answer.reply, /KalExam/);
        assert.doesNotMatch(JSON.stringify(answer), /test-only-key/);
        const sent = JSON.parse(request.options.body);
        assert.match(
            sent.systemInstruction.parts[0].text,
            /Master Knowledge Base for Begu/,
        );
        assert.equal(sent.contents[0].parts[0].text, 'What is KalExam?');
        assert.equal(
            request.options.headers['x-goog-api-key'],
            'test-only-key',
        );
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
test('Begu returns a useful offline state without credentials', async () => {
    const server = createPortfolioServer({ apiKey: '' });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
        const response = await fetch(
            `http://127.0.0.1:${server.address().port}/api/chat`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...sameSite(server.address().port),
                },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Hello' }],
                }),
            },
        );
        assert.equal(response.status, 503);
        assert.match((await response.json()).error, /offline/);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
test('Begu contains provider failures and rejects oversized requests', async () => {
    const server = createPortfolioServer({
        apiKey: 'test-only-key',
        fetchImpl: async () => {
            throw new Error('private upstream diagnostics');
        },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const send = (body) =>
            fetch(base + '/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: base },
                body: JSON.stringify(body),
            });
        const tooBig = await send({
            messages: [{ role: 'user', content: 'x'.repeat(33000) }],
        });
        assert.equal(tooBig.status, 413);
        const failed = await send({
            messages: [{ role: 'user', content: 'Hi' }],
        });
        assert.equal(failed.status, 502);
        const text = await failed.text();
        assert.match(text, /try again/);
        assert.doesNotMatch(text, /private upstream|test-only-key/);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('an overloaded model falls back once instead of failing the visitor', async () => {
    const tried = [];
    const server = createPortfolioServer({
        apiKey: 'test-only-key',
        fetchImpl: async (url) => {
            tried.push(url.split('/models/')[1].split(':')[0]);
            if (tried.length === 1) return new Response('{}', { status: 503 });
            return Response.json({
                candidates: [
                    { content: { parts: [{ text: 'Hi from Begu.' }] } },
                ],
            });
        },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
        const response = await fetch(
            `http://127.0.0.1:${server.address().port}/api/chat`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...sameSite(server.address().port),
                },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Hi' }],
                }),
            },
        );
        assert.equal(response.status, 200);
        assert.equal((await response.json()).reply, 'Hi from Begu.');
        assert.deepEqual(tried, [
            'gemini-3.1-flash-lite-preview',
            'gemini-2.5-flash',
        ]);
    } finally {
        server.close();
    }
});

test('chat accepts its own host and configured origins (Vercel forwarding to Render), nothing else', () => {
    const allowed = ['https://niharshah.me', 'https://www.niharshah.me'];
    assert.ok(
        !allowedOrigin(undefined, 'x.onrender.com', allowed),
        'scripts that omit Origin are refused; browsers always send it',
    );
    assert.ok(
        allowedOrigin('https://x.onrender.com', 'x.onrender.com', allowed),
    );
    assert.ok(allowedOrigin('https://niharshah.me', 'x.onrender.com', allowed));
    assert.ok(
        allowedOrigin('https://www.niharshah.me', 'x.onrender.com', allowed),
    );
    assert.ok(
        !allowedOrigin('https://evil.example', 'x.onrender.com', allowed),
    );
    assert.ok(!allowedOrigin('http://niharshah.me', 'x.onrender.com', allowed));
    assert.ok(!allowedOrigin('not a url', 'x.onrender.com', allowed));
});

test('a forged X-Forwarded-For never picks the visitor key', () => {
    const forged = { 'x-forwarded-for': '6.6.6.6, 52.66.154.250' };
    assert.equal(
        visitorKey(forged, '10.0.0.1', { viaProxy: false, trustProxy: true }),
        '52.66.154.250',
        'behind Render: the address that connected (appended last)',
    );
    assert.equal(
        visitorKey(
            { ...forged, 'x-vercel-proxied-for': '180.151.37.254' },
            '10.0.0.1',
            { viaProxy: true, trustProxy: true },
        ),
        '180.151.37.254',
        'through Vercel: the address Vercel overwrites',
    );
    assert.equal(
        visitorKey(
            { ...forged, 'x-vercel-proxied-for': '9.9.9.9' },
            '10.0.0.1',
            { viaProxy: false, trustProxy: true },
        ),
        '52.66.154.250',
        'without the proxy secret, Vercel headers are not believed',
    );
    assert.equal(
        visitorKey(forged, '10.0.0.1', { viaProxy: false, trustProxy: false }),
        '10.0.0.1',
    );
    assert.ok(fromProxy('s3cret-value', 's3cret-value'));
    assert.ok(!fromProxy('s3cret-valuf', 's3cret-value'));
    assert.ok(!fromProxy('short', 's3cret-value'));
    assert.ok(!fromProxy(undefined, 's3cret-value'));
    assert.ok(
        !fromProxy('anything', ''),
        'no secret configured: never trusted',
    );
});

test('with a proxy secret, /api answers only Vercel; limits hold against rotating forged IPs', async () => {
    let calls = 0;
    const server = createPortfolioServer({
        apiKey: 'test-only-key',
        proxySecret: 'shared-secret',
        trustProxy: true,
        limits: { visitor: 3, total: 5 },
        fetchImpl: async () => {
            calls++;
            return Response.json({
                candidates: [{ content: { parts: [{ text: 'Woof.' }] } }],
            });
        },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const chat = (headers) =>
        fetch(base + '/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Origin: 'http://127.0.0.1:' + server.address().port,
                ...headers,
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'Hi' }],
            }),
        });
    try {
        // Straight to Render, however convincing the headers: refused,
        // before any Gemini call.
        for (const headers of [
            {},
            { [PROXY_HEADER]: 'guess' },
            { 'x-vercel-proxied-for': '1.2.3.4', 'x-forwarded-for': '1.2.3.4' },
        ])
            assert.equal((await chat(headers)).status, 403);
        assert.equal((await fetch(base + '/api/weather')).status, 403);
        assert.equal((await fetch(base + '/api/barcelona')).status, 403);
        assert.equal(
            (await fetch(base + '/api/health')).status,
            200,
            "Render's health check still works",
        );
        assert.equal(calls, 0);
        // Through Vercel: one visitor rotating forged X-Forwarded-For values
        // is still one visitor.
        const visitor = (n) => ({
            [PROXY_HEADER]: 'shared-secret',
            'x-vercel-proxied-for': '180.151.37.254',
            'x-forwarded-for': `6.6.6.${n}, 52.66.154.250`,
        });
        const first = await chat(visitor(1));
        assert.equal(first.status, 200);
        assert.equal(first.headers.get('ratelimit-remaining'), '2');
        assert.equal((await chat(visitor(2))).status, 200);
        assert.equal((await chat(visitor(3))).status, 200);
        assert.equal(
            (await chat(visitor(4))).status,
            429,
            'forged IPs share one limit',
        );
        // A page that omits Origin (a script) is refused even via Vercel.
        const noOrigin = await fetch(base + '/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...visitor(5) },
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'Hi' }],
            }),
        });
        assert.equal(noOrigin.status, 403);
        // The site-wide ceiling holds across genuinely different visitors.
        const other = (ip) => ({ ...visitor(0), 'x-vercel-proxied-for': ip });
        assert.equal((await chat(other('8.8.8.1'))).status, 200);
        assert.equal((await chat(other('8.8.8.2'))).status, 200);
        assert.equal(
            (await chat(other('8.8.8.3'))).status,
            429,
            'hourly total',
        );
        assert.equal(calls, 5);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
