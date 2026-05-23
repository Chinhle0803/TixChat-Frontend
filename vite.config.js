import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const normalizeProxyTarget = (apiUrl = '') =>
  String(apiUrl || 'http://localhost:5000/api')
    .trim()
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = normalizeProxyTarget(env.VITE_API_URL)

  return {
    plugins: [react()],
    define: {
      global: 'globalThis',
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  }
})
