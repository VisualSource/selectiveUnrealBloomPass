import { resolve } from 'path';
import { defineConfig } from 'vite';
import Plugin from 'vite-plugin-string';

export default defineConfig({
    plugins: [
        Plugin.default({
            compress: false
        })
    ],
    build: {
        lib: {
            formats: ["es"],
            entry:  './src/UnrealBloomPass.ts',
            name: 'selectiveUnrealBloomPass',
            fileName: (format) => `selectiveunrealbloompass.${format}.js`
        },
        rollupOptions: {
        // make sure to externalize deps that shouldn't be bundled
        // into your library
        external: [
            'three',
            "three/examples/jsm/shaders/CopyShader",
            "three/examples/jsm/shaders/LuminosityHighPassShader",
            "three/examples/jsm/postprocessing/Pass"
        ],
        }
    }
});