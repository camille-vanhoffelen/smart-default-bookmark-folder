import path from 'path';
import { fileURLToPath } from 'url';

import WebExtPlugin from 'web-ext-plugin';
import CopyPlugin from 'copy-webpack-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
    mode: 'production',
    entry: {
        background: './background.js',
        content: './content.js'
    },
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: '[name].js'
    },
    plugins: [new WebExtPlugin({ sourceDir: path.resolve(__dirname, 'build') }),
    new CopyPlugin({
        patterns: [
            {
                from: "icons",
                to: "icons"
            },
            {
                from: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm',
                to: 'static/wasm/[name][ext]'
            },
            {
                from: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs',
                to: 'static/wasm/[name][ext]'
            },
            {
                from: "manifest.json",
                to: "."
            }
        ],
    })
    ],
};