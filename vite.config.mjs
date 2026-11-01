import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const clientRoot = fileURLToPath(new URL('./client', import.meta.url))

// The operator console is a static bundle served by any static host; the dev
// server proxies /api and /health to the service on loopback so no CORS
// configuration is needed and the session cookie stays first-party.
export default defineConfig({
  root: clientRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': clientRoot },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 3106,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3006', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:3006', changeOrigin: true },
    },
  },
})
