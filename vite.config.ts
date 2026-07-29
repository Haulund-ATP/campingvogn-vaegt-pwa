import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Egen service worker (src/sw.ts): app-shellen skal serveres cache-first,
      // så appen starter med det samme selv når containeren er skaleret til nul,
      // og køen skal kunne sendes via Background Sync.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Registreringen sker eksplicit i src/lib/serviceWorker.ts. Pluginets
      // automatiske injektion er inline-script, som blokeres af vores CSP.
      injectRegister: null,
      registerType: 'prompt',
      injectManifest: {
        // Klassisk script, ikke ES-modul: modul-service-workers understøttes
        // ikke i alle browsere, og vi har ingen brug for import på runtime.
        rollupFormat: 'iife',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // /api/* er aldrig en del af precachen: tokens, sessioner og historik.
        globIgnores: ['**/node_modules/**/*', 'sw.js'],
      },
      manifest: {
        name: 'Campingvogn Vægt',
        short_name: 'CV Vægt',
        description: 'Registrer vægt i campingvognen på tværs af flere trips',
        theme_color: '#0b5d3b',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
