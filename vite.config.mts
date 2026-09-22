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
        port: 5173,
        // 本地开发时把 /api 转发到排行榜后端（server/src/main.ts，默认 8781）。
        // 生产环境由 nginx 做同样的反代（见 deploy/nginx/）。
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8781',
                changeOrigin: true
            }
        }
    },
    preview: {
        port: 4173
    }
});
