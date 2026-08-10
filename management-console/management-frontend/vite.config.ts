import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5174,
    // Local dev only: once management-backend exists, proxy /api here the
    // same way the root frontend/ proxies to its own backend on :8000.
    // proxy: {
    //   '/api': 'http://localhost:8001',
    // },
  },
})
