// Loads src/Application/World/Layout.ts for tests that transpile modules by hand.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const exports = {};
new Function(
    'exports',
    ts.transpileModule(
        fs.readFileSync(
            new URL('../src/Application/World/Layout.ts', import.meta.url),
            'utf8',
        ),
        { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
)(exports);
export default exports;
