import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const regenerate = 'regenerate with node desktop/scripts/optimize-images.mjs';

/** Width and height of a WebP file, from its RIFF header. */
function webpSize(path) {
    const b = fs.readFileSync(new URL(path, root));
    assert.equal(b.toString('ascii', 0, 4), 'RIFF', path);
    assert.equal(b.toString('ascii', 8, 12), 'WEBP', path);
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X')
        return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (chunk === 'VP8 ')
        return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    const bits = b.readUInt32LE(21); // VP8L
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
}

test('Music shows small album art, with a copy for every album', () => {
    const music = read('desktop/src/components/applications/Music.tsx');
    const slugs = [
        ...music
            .match(/const NAMES = \{([\s\S]*?)\} as const/)[1]
            .matchAll(/^\s{4}(\w+|'808s'):/gm),
    ].map((m) => m[1].replaceAll("'", ''));
    assert.ok(slugs.length > 10);
    for (const slug of slugs)
        for (const size of [96, 264]) {
            const file = `static/room/albums/thumbs/${slug}-${size}.webp`;
            assert.ok(
                fs.existsSync(new URL(file, root)),
                `${file}: ${regenerate}`,
            );
            assert.deepEqual(webpSize(file), [size, size], file);
        }
    // Queue rows are lazy and sized; the originals stay as the fallback.
    assert.match(music, /loading="lazy"/);
    assert.match(music, /decoding="async"/);
    assert.match(music, /\/room\/albums\/\$\{slug\}\.jpg/);
});

test('dock icons and the wallpaper ship at the size they are shown', () => {
    const icons = read('desktop/src/assets/icons/index.ts');
    for (const [, file] of icons.matchAll(/from '\.\/([^']+)'/g)) {
        const path = `desktop/src/assets/icons/${file}`;
        assert.ok(fs.existsSync(new URL(path, root)), path);
        if (file.startsWith('mac-')) {
            assert.match(
                file,
                /\.webp$/,
                'app icons use the 128px WebP copies',
            );
            assert.deepEqual(webpSize(path), [128, 128], path);
        }
    }
    const css = read('desktop/src/index.css');
    const wallpapers = [
        ...css.matchAll(/url\('\.\/assets\/(wallpaper[^']*)'\)/g),
    ].map((m) => m[1]);
    for (const file of new Set(wallpapers))
        assert.ok(
            fs.existsSync(new URL(`desktop/src/assets/${file}`, root)),
            `${file}: ${regenerate}`,
        );
    for (const file of [
        'wallpaper-960.webp',
        'wallpaper-1920.webp',
        'wallpaper.jpg',
    ])
        assert.ok(wallpapers.includes(file), `index.css uses ${file}`);
    assert.deepEqual(
        webpSize('desktop/src/assets/wallpaper-960.webp'),
        [960, 600],
    );
});

test('the desktop starts with only the portfolio; other apps load on demand', () => {
    const desktop = read('desktop/src/components/os/Desktop.tsx');
    const eager = [
        ...desktop.matchAll(/^import \w+ from '\.\.\/applications\/(\w+)'/gm),
    ].map((m) => m[1]);
    assert.deepEqual(eager, ['ShowcaseExplorer']);
    for (const app of ['Henordle', 'Begu', 'Music', 'Resume', 'Credits'])
        assert.match(
            desktop,
            new RegExp(
                `import\\(\\s*/\\* webpackChunkName: "desktop-[a-z]+" \\*/ '\\.\\./applications/${app}'`,
            ),
            `${app} is split into its own chunk`,
        );
    const showcase = read(
        'desktop/src/components/applications/ShowcaseExplorer.tsx',
    );
    assert.doesNotMatch(
        showcase,
        /^import Notes from/m,
        'notes (Markdown) load on demand',
    );
    // Nothing on the desktop needs framer-motion any more.
    const sources = fs
        .readdirSync(new URL('desktop/src/', root), { recursive: true })
        .filter((f) => /\.tsx?$/.test(f));
    for (const file of sources)
        assert.doesNotMatch(
            read(`desktop/src/${file}`),
            /from 'framer-motion'/,
            file,
        );
    // Hidden desktop shortcuts are no longer rendered (or listening on document).
    assert.doesNotMatch(desktop, /DesktopShortcut/);
});

test('phones and touch screens drop the backdrop blur', () => {
    const css = read('desktop/src/index.css');
    const phone = css.match(
        /@media \(max-width: 700px\), \(hover: none\) \{([\s\S]*?)\n\}/,
    );
    assert.ok(phone, 'a phone/touch block exists');
    for (const selector of [
        '.os-window',
        '.system-menu',
        '.os-dock',
        '.start-menu',
    ])
        assert.ok(phone[1].includes(selector), selector);
    assert.match(phone[1], /backdrop-filter: none/);
    assert.doesNotMatch(css, /will-change: transform/);
    // Reduced transparency still wins over the phone tint (it comes later).
    assert.ok(
        css.lastIndexOf('@media (prefers-reduced-transparency: reduce)') >
            css.indexOf('@media (max-width: 700px), (hover: none)'),
    );
});
