import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** The backend repo's mastertrust_intraday_api.py, which /intraday reads real Master Trust data from. */
const intradayApiTarget = process.env.INTRADAY_API_TARGET ?? 'http://127.0.0.1:8000'
const proxy = { '/api': { target: intradayApiTarget, changeOrigin: true } }

// https://vite.dev/config/
// Test configuration lives in vitest.config.ts (which extends this file).
export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
})
