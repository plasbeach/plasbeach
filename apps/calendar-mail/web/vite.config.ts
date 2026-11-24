import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // Served at www.plasbea.ch/mail/ (Caddy strips the prefix before the Node backend).
  base: '/mail/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@theme': fileURLToPath(new URL('../../../theme', import.meta.url)),
    },
  },
  server: {
    // Listen on the LAN so the app can be opened from other devices when running on the Pi.
    host: true,
    port: 5173,
    // The shared theme lives outside this folder
    fs: { allow: ['..', '../../../theme'] },
    // In development, API calls go to the local backend (cd server && npm run dev).
    proxy: { '/mail/api': { target: 'http://127.0.0.1:8787', rewrite: (p) => p.replace(/^\/mail/, '') } },
  },
})
