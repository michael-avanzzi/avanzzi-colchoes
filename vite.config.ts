import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Versão exibida nos registros de erro: commit no build do Cloudflare, data no build local.
const commit = process.env.WORKERS_CI_COMMIT_SHA ?? process.env.CF_PAGES_COMMIT_SHA
const versaoApp = commit?.slice(0, 7) ?? `local-${new Date().toISOString().slice(0, 10)}`

export default defineConfig({
  define: {
    'import.meta.env.VITE_VERSAO_APP': JSON.stringify(versaoApp),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'push-sw.js'],
      manifest: {
        id: '/',
        name: 'Avanzzi Agendamentos',
        short_name: 'Agendamentos',
        description: 'Agenda de atendimentos da Avanzzi Colchões.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#111111',
        theme_color: '#111111',
        categories: ['business', 'productivity'],
        icons: [
          // Provisórios: gerados de public/icons/icon.svg por `npm run icones`.
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        // Recebe as notificações push dos lembretes.
        importScripts: ['push-sw.js'],
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Dados do Supabase nunca vêm do cache do Service Worker.
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
