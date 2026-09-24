import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPortfolioServer } from '../server/index.mjs';
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
                headers: { 'Content-Type': 'application/json', ...headers },
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
                headers: { 'Content-Type': 'application/json' },
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
                headers: { 'Content-Type': 'application/json' },
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
