import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [sveltekit(), tailwindcss()],
    // Pin a distinct port with strictPort so the dev server never silently
    // shares an ambiguous localhost socket with another app on 5173. Host is
    // left at Vite's default (localhost / IPv6 ::1).
    server: {
        port: 5273,
        strictPort: true
    },
    preview: {
        port: 5273,
        strictPort: true
    },
    test: {
        include: ['src/**/*.{test,spec}.{js,ts}'],
        environment: 'jsdom',
        globals: true
    },
    // Tell Vitest to use the `browser` entry points in `package.json` files, even though it's running in Node
    resolve: process.env.VITEST
        ? {
            conditions: ['browser']
        }
        : undefined
});
