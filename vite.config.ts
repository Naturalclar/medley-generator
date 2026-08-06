import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// src/data/songs.json を単一ソースとして保ちつつ、ビルド時に dist/songs.json へ
// コピーする。これで /medley-generator/songs.json でも生の JSON を配信できる。
function copySongsJson(): Plugin {
  let root = ''
  let outDir = 'dist'
  return {
    name: 'copy-songs-json',
    apply: 'build',
    configResolved(config) {
      root = config.root
      outDir = config.build.outDir
    },
    closeBundle() {
      copyFileSync(
        resolve(root, 'src/data/songs.json'),
        resolve(root, outDir, 'songs.json'),
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copySongsJson()],
  // GitHub Pages (https://naturalclar.github.io/medley-generator/) 配信用
  base: '/medley-generator/',
})
