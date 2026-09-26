// Loads Utils/Dequantize.ts for tests that parse the room's quantized models.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const exports = {};
new Function(
    'require',
    'exports',
    ts.transpileModule(
        fs.readFileSync(
            new URL('../src/Application/Utils/Dequantize.ts', import.meta.url),
            'utf8',
        ),
        { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
)((name) => (name === 'three' ? THREE : require(name)), exports);
export const dequantize = exports.dequantize;
