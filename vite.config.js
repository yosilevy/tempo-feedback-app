var _a;
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
var repoName = (_a = process.env.GITHUB_REPOSITORY) === null || _a === void 0 ? void 0 : _a.split('/')[1];
var base = process.env.GITHUB_ACTIONS === 'true' && repoName ? "/".concat(repoName, "/") : '/';
export default defineConfig({
    base: base,
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg'],
            manifest: {
                name: 'Tempo Feedback Coach',
                short_name: 'TempoCoach',
                description: 'Practice tempo and volume awareness',
                theme_color: '#10162d',
                background_color: '#10162d',
                display: 'standalone',
                start_url: '.',
                icons: [
                    {
                        src: 'icon-192.svg',
                        sizes: '192x192',
                        type: 'image/svg+xml'
                    },
                    {
                        src: 'icon-512.svg',
                        sizes: '512x512',
                        type: 'image/svg+xml'
                    }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,svg,png,ico}']
            }
        })
    ]
});
