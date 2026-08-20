import { copyFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// src/data/songs.json を単一ソースとして保ちつつ、ビルド時に dist/songs.json へ
// コピーする。これで /medley-generator/songs.json でも生の JSON を配信できる。
//
// アプリ本体もこの JSON を fetch して読む(import すると JS バンドルに同梱され、
// 曲を1曲足すだけでバンドル全体のキャッシュが無効化されるため)。dev サーバーは
// dist を持たないので、開発時は src/data から直接返す。
function songsJson(): Plugin {
  let root = ''
  let outDir = 'dist'
  let base = '/'
  return {
    name: 'songs-json',
    configResolved(config) {
      root = config.root
      outDir = config.build.outDir
      base = config.base
    },
    configureServer(server) {
      const url = `${base}songs.json`
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== url) return next()
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(readFileSync(resolve(root, 'src/data/songs.json')))
      })
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
  plugins: [react(), songsJson()],
  // GitHub Pages (https://naturalclar.github.io/medley-generator/) 配信用
  base: '/medley-generator/',
})
