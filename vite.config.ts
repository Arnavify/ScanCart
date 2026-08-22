import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@zxing/browser': fileURLToPath(new URL('./src/vendor/zxing-browser.ts', import.meta.url)),
      '@zxing/library': fileURLToPath(new URL('./src/vendor/zxing-library.ts', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 8443),
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 8443),
  },
})
