// Build a single self-contained HTML file of the designer: no server, no internet.
// usage: node tools/build-portable.mjs   → dist/Dragon Hub Forge.html
//
// Everything is inlined: three.js, the app, the geometry worker (started from a
// data: URL — Chrome blocks blob: workers on pages opened from disk), manifold's wasm (base64, handed to it as wasmBinary), the LED ring
// plan, and the designs saved so far as a starting list. Saved designs then
// live in that browser's localStorage. Only the web fonts need the internet;
// without it the page falls back to system fonts.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const at = (...p) => path.join(root, ...p)
// inline <script> bodies must never contain a literal "</script"
const safe = (js) => js.replaceAll('</script', '<\\/script')
const asString = (text) => JSON.stringify(text).replaceAll('</', '<\\/')

const wasm = fs.readFileSync(at('vendor/manifold.wasm')).toString('base64')
const common = { bundle: true, format: 'esm', platform: 'browser', minify: true, write: false, external: ['node:*'], logLevel: 'warning' }

const worker = await esbuild.build({
  ...common,
  entryPoints: [at('worker.js')],
  banner: { js: `self.__MANIFOLD_OPTS={wasmBinary:Uint8Array.from(atob(${JSON.stringify(wasm)}),c=>c.charCodeAt(0)),locateFile:()=>"manifold.wasm"};` },
})
const app = await esbuild.build({ ...common, entryPoints: [at('app.js')], alias: { three: at('vendor/three.module.js') } })

const ideas = fs.existsSync(at('ideas.json')) ? fs.readFileSync(at('ideas.json'), 'utf8') : '[]'
const plan = fs.readFileSync(at('led-ring-plan.html'), 'utf8')
const wick = fs.readFileSync(at('wicking-guide.html'), 'utf8')
const grip = fs.readFileSync(at('pole-grip-guide.html'), 'utf8')
const mould = fs.readFileSync(at('mould-guide.html'), 'utf8')
const hoopG = fs.readFileSync(at('hoop-guide.html'), 'utf8')
const knotG = fs.readFileSync(at('knot-guide.html'), 'utf8')

let html = fs.readFileSync(at('index.html'), 'utf8')
const drop = (re, what) => {
  if (!re.test(html)) throw new Error(`index.html: could not find ${what}`)
  html = html.replace(re, '')
}
drop(/<script type="importmap">.*?<\/script>\s*/, 'the import map')
drop(/<script src="\/projects-sdk\.js"><\/script>\s*/, 'the projects-sdk script')
const boot = `<script>
window.__PORTABLE = true
window.__SEED_IDEAS = ${ideas.trim().replaceAll('</', '<\\/')}
window.__WORKER_URL = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(${asString(worker.outputFiles[0].text)})
window.__LED_PLAN_HTML = ${asString(plan)}
window.__WICK_GUIDE_HTML = ${asString(wick)}
window.__GRIP_GUIDE_HTML = ${asString(grip)}
window.__MOULD_GUIDE_HTML = ${asString(mould)}
window.__HOOP_GUIDE_HTML = ${asString(hoopG)}
window.__KNOT_GUIDE_HTML = ${asString(knotG)}
</script>
<script type="module">${safe(app.outputFiles[0].text)}</script>`
const tag = '<script type="module" src="./app.js"></script>'
if (!html.includes(tag)) throw new Error('index.html: could not find the app script tag')
html = html.replace(tag, () => boot)

fs.mkdirSync(at('dist'), { recursive: true })
const out = at('dist', 'Dragon Hub Forge.html')
fs.writeFileSync(out, html)
console.log(`${out}  ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`)
