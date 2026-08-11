import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'push-handler.js'],
      manifest: {
        name: 'Chore Coin',
        short_name: 'Chore Coin',
        description: 'Family chore tracking and rewards',
        theme_color: '#4f46e5',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Anything under /api/ (PocketBase REST + SSE) and /_/ (PocketBase admin UI)
        // must never be intercepted by the SPA navigate-fallback — otherwise the
        // service worker returns the app's index.html for those paths and the app
        // sees an unknown route, redirecting to /login.
        navigateFallbackDenylist: [/^\/api\//, /^\/_\//, /^\/__/],
        // Inject our Web Push handler into the generated service worker.
        importScripts: ['/push-handler.js'],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
})
