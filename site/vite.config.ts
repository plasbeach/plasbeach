import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  // Ship fonts as files instead of inlining them (the backend's CSP doesn't allow data: fonts)
  build: { assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined) },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@theme': fileURLToPath(new URL('../theme', import.meta.url)),
    },
  },
  server: { host: true, fs: { allow: ['..'] } },
})
