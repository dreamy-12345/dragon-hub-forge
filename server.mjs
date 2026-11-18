// Dragon hub designer: static files + a shared shortlist of saved ideas.
// node server.mjs [port]   (default 9560) -> http://localhost:9560
// No dependencies. Ideas live in ideas.json next to this file.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.argv[2] || process.env.PORT || 9560)
const IDEAS = path.join(ROOT, 'ideas.json')
const SERVE = new Set(['index.html', 'app.js', 'hub.js', 'geom.js', 'designs.js', 'worker.js', 'leds.js', 'bubbles.js', 'dome.js', 'dragonfly.js', 'designs-dogs.js', 'designs-veins.js', 'designs-signature.js', 'designs-loyaldog.js', 'designs-melt.js', 'led-ring-plan.html'])
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' }

const loadIdeas = () => {
  try {
    return JSON.parse(fs.readFileSync(IDEAS, 'utf8'))
  } catch {
    return []
  }
}
const saveIdeas = (list) => {
  fs.writeFileSync(IDEAS + '.tmp', JSON.stringify(list, null, 1))
  fs.renameSync(IDEAS + '.tmp', IDEAS)
}

function readBody(req, limit = 2e6) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) reject(new Error('too big'))
      else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    const p = decodeURIComponent(url.pathname)
    try {
      if (p === '/api/ideas' && req.method === 'GET') return json(res, 200, loadIdeas())
      if (p === '/api/ideas' && req.method === 'POST') {
        const idea = JSON.parse(await readBody(req))
        const clean = {
          id: randomUUID(),
          time: new Date().toISOString(),
          name: String(idea.name || 'Untitled').slice(0, 80),
          note: String(idea.note || '').slice(0, 500),
          design: String(idea.design || ''),
          params: idea.params && typeof idea.params === 'object' ? idea.params : {},
          material: String(idea.material || ''),
          color: String(idea.color || ''),
          thumb: String(idea.thumb || '').startsWith('data:image/') ? idea.thumb : '',
          grams: Number(idea.grams) || 0,
          votes: 0,
        }
        const list = loadIdeas()
        list.push(clean)
        saveIdeas(list)
        return json(res, 200, clean)
      }
      const m = p.match(/^\/api\/ideas\/([\w-]+)(\/vote)?$/)
      if (m) {
        const list = loadIdeas()
        const i = list.findIndex((x) => x.id === m[1])
        if (i < 0) return json(res, 404, { error: 'no such idea' })
        if (m[2] && req.method === 'POST') list[i].votes = (list[i].votes || 0) + 1
        else if (!m[2] && req.method === 'DELETE') list.splice(i, 1)
        else return json(res, 405, { error: 'method' })
        saveIdeas(list)
        return json(res, 200, { ok: true })
      }

      // static: a fixed allow-list plus vendor/
      let rel = p === '/' ? 'index.html' : p.slice(1)
      const ok = SERVE.has(rel) || (/^vendor\/[\w.-]+$/.test(rel) && !rel.includes('..'))
      if (!ok) return json(res, 404, { error: 'not found' })
      const file = path.join(ROOT, rel)
      const data = fs.readFileSync(file) // follows the dome.js symlink
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' })
      res.end(data)
    } catch (e) {
      json(res, 500, { error: String(e.message || e) })
    }
  })
  .listen(PORT, '0.0.0.0', () => console.log(`dragon hubs on :${PORT}`))
