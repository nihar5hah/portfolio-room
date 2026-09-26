// Loads room modules (Layout.ts) for tests that transpile by hand.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const cache = new Map();
const load = (file) => {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
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
    )(
        (name) =>
            name === 'three'
                ? THREE
                : name.startsWith('./')
                  ? load(`${name.slice(2)}.ts`)
                  : require(name),
        exports,
    );
    return exports;
};
export default load('Layout.ts');
/** Loads another World module the same way, e.g. `world('DuneSofa.ts')`. */
export const world = load;
