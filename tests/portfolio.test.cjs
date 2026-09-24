const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { decodeHTML } = require('entities');
const data = require('../desktop/src/data/content.json');
const notes = require('../desktop/src/data/notes.json');
const root = path.resolve(__dirname, '..');
const digest = (p) =>
    crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

test('upstream source assets remain available for provenance', () => {
    const upstream = require('../docs/upstream-assets.json');
    for (const [file, hash] of Object.entries(upstream))
        assert.equal(digest(path.join(root, file)), hash, file);
});

test('Nihar content is complete and public destinations are safe', () => {
    assert.equal(data.siteConfig.name, 'Nihar Shah');
    assert.equal(data.projects.length, 7);
    assert.equal(new Set(data.projects.map((p) => p.id)).size, 7);
    for (const project of data.projects) {
        assert.ok(project.longDescription.length > 150, project.id);
        assert.ok(project.highlights.length >= 3, project.id);
        assert.ok(fs.existsSync(path.join(root, 'static', project.image)));
        for (const url of Object.values(project.links))
            assert.equal(new URL(url).protocol, 'https:');
    }
    assert.equal(data.experiences.length, 2);
    assert.equal(data.skillCategories.length, 6);
    assert.equal(notes.length, 2);
    for (const note of notes) assert.ok(note.body.length > 1000);
});

test('production room and desktop include resolvable entry assets and original resume', () => {
    for (const entry of ['index.html', 'desktop/index.html']) {
        const html = fs.readFileSync(path.join(root, 'dist', entry), 'utf8');
        for (const [, asset] of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g))
            assert.ok(fs.existsSync(path.join(root, 'dist', asset)), asset);
        assert.doesNotMatch(html, /googletagmanager|os\.henryheffernan\.com/);
    }
    assert.equal(
        digest(path.join(root, 'dist/resume.pdf')),
        require('../docs/upstream-assets.json')['static/resume.pdf'],
    );
});

test('readable resume preview stays paired with the downloadable PDF', () => {
    const preview = fs.readFileSync(
        path.join(root, 'static/resume-preview.html'),
        'utf8',
    );
    assert.ok(
        preview.includes(
            `Source PDF SHA-256: ${digest(path.join(root, 'static/resume.pdf'))}`,
        ),
        'Run python3 scripts/render-resume.py after updating the PDF',
    );
    const content = (html) =>
        decodeHTML(
            html
                .match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1]
                .replace(/<[^>]*>/g, ' '),
        )
            .replace(/\s+/g, ' ')
            .trim();
    assert.equal(
        content(
            fs.readFileSync(
                path.join(root, 'dist/resume-preview.html'),
                'utf8',
            ),
        ),
        content(preview),
        'production HTML minification preserves the complete résumé',
    );
});
