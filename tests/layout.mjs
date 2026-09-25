// Loads room modules (Layout.ts) for tests that transpile by hand.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const load = (file) => {
    const exports = {};
    new Function(
        'require',
        'exports',
        ts.transpileModule(
            fs.readFileSync(
                new URL(`../src/Application/World/${file}`, import.meta.url),
                'utf8',
            ),
            { compilerOptions: { module: ts.ModuleKind.CommonJS } },
        ).outputText,
    )((name) => (name === 'three' ? THREE : require(name)), exports);
    return exports;
};
export default load('Layout.ts');
