import { defineConfig } from 'vite';

/**
 * Build contract relied on by the deploy workflow (docs/DEPLOYMENT.md):
 * `npm run build` must produce `dist/index.html` plus its hashed assets.
 *
 * `base` stays at the domain root — the site is served from `/`, and absolute
 * paths like `/img/icons/...` in index.html only resolve there.
 */
export default defineConfig({
    base: '/',
    build: {
        outDir: 'dist',
        emptyOutDir: true
    },
    server: {
        port: 5173
    },
    preview: {
        port: 4173
    }
});
