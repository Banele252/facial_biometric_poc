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
    // Local dev only: management-backend runs standalone on :8001 (see
    // management-console/management-backend/main.py).
    proxy: {
      '/api': 'http://localhost:8001',
    },
  },
})
