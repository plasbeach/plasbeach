import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Listen on the LAN so the app can be opened from other devices when running on the Pi.
    host: true,
    port: 5173,
    // In development, API calls go to the local backend (cd server && npm run dev).
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})
