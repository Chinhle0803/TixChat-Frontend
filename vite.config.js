import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const normalizeProxyTarget = (apiUrl = '') =>
  String(apiUrl || 'http://localhost:5000/api')
    .trim()
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '')

const patchAxiosFetchAdapter = () => ({
  name: 'patch-axios-fetch-adapter',
  enforce: 'pre',
  transform(code, id) {
    if (!id.includes('/node_modules/axios/')) return null
    if (!code.includes('const globalFetchAPI = (({ Request, Response }) => ({')) return null

    let nextCode = code.replace(
      'const globalFetchAPI = (({ Request, Response }) => ({',
      'const globalFetchAPI = (({ Request, Response } = {}) => ({'
    )

    nextCode = nextCode.replace(
      'const { ReadableStream, TextEncoder } = utils.global;',
      'const { ReadableStream, TextEncoder } = utils.global || {};'
    )

    if (nextCode === code) return null

    return {
      code: nextCode,
      map: null,
    }
  },
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = normalizeProxyTarget(env.VITE_API_URL)

  return {
    plugins: [patchAxiosFetchAdapter(), react()],
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
        '/socket.io': {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  }
})
