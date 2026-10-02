import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = (path) =>
    fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const exports = {};
new Function(
    'exports',
    ts.transpileModule(
        source('../desktop/src/components/applications/beguLinks.ts'),
        { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
)(exports);
const { safeBeguLink } = exports;

test("Begu's replies link only to Nihar's own pages", () => {
    for (const ok of [
        'https://www.niharshah.me/desktop/?app=resume',
        'https://niharshah.in',
        'https://github.com/nihar5hah/KalExam',
        'https://github.com/nihar5hah',
        'https://linkedin.com/in/niharshah0405/',
        'https://www.linkedin.com/in/niharshah0405',
        'mailto:niharshah0405@gmail.com',
        '/resume.pdf',
    ])
        assert.ok(safeBeguLink(ok), ok);
    for (const bad of [
        'https://evil.example/niharshah.me',
        'https://niharshah.me.evil.example/',
        'https://github.com/someone-else',
        'https://github.com/nihar5hahh',
        'https://linkedin.com/in/someone',
        'http://niharshah.me',
        'https://user:pw@niharshah.me',
        'javascript:alert(1)',
        'data:text/html,hi',
        'mailto:attacker@example.com',
        '//evil.example',
        '/\\evil.example',
        'vbscript:x',
        '',
        undefined,
    ])
        assert.equal(safeBeguLink(bad), null, String(bad));
});

test('the chat renders model Markdown through the link filter, no raw HTML, no images', () => {
    const begu = source('../desktop/src/components/applications/Begu.tsx');
    assert.match(begu, /<ReactMarkdown\s+skipHtml\s+components=\{MARKDOWN\}/);
    assert.match(begu, /const safe = safeBeguLink\(href\)/);
    assert.match(begu, /img: \(\{ alt \}/);
    assert.doesNotMatch(begu, /rehype-raw|dangerouslySetInnerHTML/);
});
