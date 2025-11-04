import path from 'path';
import { fileURLToPath } from 'url';

import WebExtPlugin from 'web-ext-plugin';
import CopyPlugin from 'copy-webpack-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
    mode: 'production',
    entry: {
        background: './src/background.js',
        content: './src/content.js',
        popup: './src/popup.js',
        onboarding: './src/onboarding.js'
    },
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: '[name].js'
    },
    module: {
        rules: [
            {
                test: /\.wasm$/,
                type: 'javascript/auto',
                use: 'ignore-loader'
            }
        ]
    },
    plugins: [new WebExtPlugin({ sourceDir: path.resolve(__dirname, 'build') }),
    new CopyPlugin({
        patterns: [
            {
                from: "icons",
                to: "icons"
            },
            {
                from: "manifest.json",
                to: "."
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
                from: "src/popup.html",
                to: "popup.html"
            },
            {
                from: "src/popup.css",
                to: "popup.css"
            },
            {
                from: "src/onboarding.html",
                to: "onboarding.html"
            },
            {
                from: "src/onboarding.css",
                to: "onboarding.css"
            }
        ],
    })
    ],
};