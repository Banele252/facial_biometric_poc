import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8081,
    proxy: {
      '/api': {
        target:
            'https://team21-ca.livelycoast-bbf4360d.southafricanorth.azurecontainerapps.io',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});