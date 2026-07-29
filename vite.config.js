import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/veezi': {
          target: 'https://api.eu.veezi.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/veezi/, ''),
          headers: {
            'VeeziAccessToken': env.VEEZI_TOKEN,
          }
        },
        '/api/connect': {
          target: 'https://connect.eu.veezi.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/connect/, ''),
          headers: {
            'vista-tenant': env.CONNECT_TENANT,
            'connectApiToken': env.CONNECT_TOKEN,
          }
        },
        '/media': {
          target: 'https://cinepax.mg',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/media/, ''),
        }
      }
    }
  }
})
