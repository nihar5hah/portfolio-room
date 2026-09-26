import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function loadLazyApp() {
    const ts = require('typescript');
    const exports = {};
    new Function(
        'require',
        'exports',
        ts.transpileModule(
            fs.readFileSync(
                new URL(
                    '../desktop/src/components/os/lazyApp.ts',
                    import.meta.url,
                ),
                'utf8',
            ),
            {
                compilerOptions: {
                    module: ts.ModuleKind.CommonJS,
                    target: ts.ScriptTarget.ES2022,
                    esModuleInterop: true,
                },
            },
        ).outputText,
    )(require, exports);
    return exports.default;
}

test('a lazy app downloads once, whether preloaded or rendered', async () => {
    const lazyApp = loadLazyApp();
    let loads = 0;
    const module = { default: () => null };
    const app = lazyApp(async () => {
        loads++;
        return module;
    });
    assert.equal(loads, 0, 'nothing is fetched until asked');
    assert.equal(app.loaded, undefined);
    assert.equal(app.Component.$$typeof, Symbol.for('react.lazy'));
    const [a, b] = await Promise.all([app.preload(), app.preload()]);
    assert.equal(a, module);
    assert.equal(b, module);
    assert.equal(loads, 1, 'hover and open share one download');
    assert.equal(
        app.loaded,
        module.default,
        'once loaded, the app renders without suspending',
    );
});

test('a failed download can be retried with a fresh lazy component', async () => {
    const lazyApp = loadLazyApp();
    let attempts = 0;
    const app = lazyApp(async () => {
        attempts++;
        if (attempts === 1) throw new Error('ChunkLoadError');
        return { default: () => null };
    });
    await assert.rejects(app.preload(), /ChunkLoadError/);
    assert.equal(app.loaded, undefined);
    const failed = app.Component;
    app.retry();
    assert.notEqual(app.Component, failed, 'React.lazy caches rejections');
    assert.ok(
        (await app.preload()).default,
        'the next attempt downloads again',
    );
    assert.equal(attempts, 2);
});
