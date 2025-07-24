import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
    plugins: [svelte()],
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/index.js'),
            formats: ['es'],
            fileName: 'index'
        },
        outDir: 'lib',
        rollupOptions: {
            external: [
                'svelte',
                'svelte/internal',
                /^svelte\//,
                '@xterm/xterm',
                '@xterm/addon-attach',
                '@xterm/addon-fit',
                '@xterm/addon-webgl',
                '@xterm/addon-unicode11'
            ]
        }
    }
});
