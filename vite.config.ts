import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages (https://naturalclar.github.io/medley-generator/) 配信用
  base: '/medley-generator/',
})
