import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api/kalshi': {
        target: 'https://external-api.kalshi.com',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost');
          const kalshiPath = url.searchParams.get('path');
          const params = new URLSearchParams(url.searchParams);
          params.delete('path');
          return `/trade-api/v2${kalshiPath}?${params.toString()}`;
        },
      },
      '/api/football': {
        target: 'https://api.football-data.org',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost');
          const apiPath = url.searchParams.get('path');
          const params = new URLSearchParams(url.searchParams);
          params.delete('path');
          return `/v4${apiPath}?${params.toString()}`;
        },
        headers: {
          'X-Auth-Token': '82bc59a2988d42a7b2c65f5abffd582b',
        },
      },
    },
  },
})