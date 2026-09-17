import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // The console authenticates at /auth/token (see src/lib/auth.ts).
      // Without this it would hit the dev server instead of the API and 404,
      // so the login screen could never obtain a token. In the container,
      // nginx.conf forwards both prefixes for the same reason.
      '/auth': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
