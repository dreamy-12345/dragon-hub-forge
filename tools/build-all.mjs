// Build every design at its defaults and report strength/balance stats.
// usage: node tools/build-all.mjs [outdir]   (writes <id>.svg + <id>.stl there if given)
import fs from 'node:fs'
import Module from '../vendor/manifold.js'
import { DESIGNS, defaults, buildHub, buildCapsuleTest, toSTL, toSVG } from '../hub.js'

const wasm = await Module()
wasm.setup()
const out = process.argv[2]
for (const d of DESIGNS) {
  if (d.spokeHub || d.ballEnd || d.sleeve || d.practiceSpoke || d.novelty || d.dart || d.cage || d.grip) continue // tools/cnc-all.mjs and tools/balls-test.mjs cover these
  const p = defaults(d)
  const t0 = performance.now()
  let hub
  try { hub = buildHub(wasm, d, p) } catch (e) { console.log(d.id, 'FAILED', e.stack); continue }
  const s = hub.stats
  console.log(
    `${d.id.padEnd(10)} ${(performance.now() - t0).toFixed(0).padStart(5)}ms  ${s.grams.toFixed(0)}g  ` +
      `dropped ${s.dropped} parts ${s.parts}  off-axis ${s.centroidOffset.toFixed(2)}mm  weak ${s.weakArea.toFixed(0)}mm²  caps ${s.capsules} total ${s.gramsTotal.toFixed(0)}g ${s.capWarn.join('; ')}`
  )
  if (out) {
    // preview: base grey, relief white, pods coloured
    const r = p.diameter / 2 + 2
    const path = (polys) => polys.map((poly) => 'M' + poly.map((q) => `${q[0].toFixed(2)},${(-q[1]).toFixed(2)}`).join('L') + 'Z').join('')
    fs.writeFileSync(`${out}/${d.id}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="${-r} ${-r} ${2 * r} ${2 * r}"><rect x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" fill="#111"/><path d="${path(hub.polygons.base)}" fill="#666" fill-rule="evenodd"/><path d="${path(hub.polygons.relief)}" fill="#eee" fill-rule="evenodd"/><path d="${path(hub.polygons.pods)}" fill="${d.glow || '#fa0'}" fill-rule="evenodd"/><path d="${path(hub.polygons.weak)}" fill="red"/></svg>`)
    fs.writeFileSync(`${out}/${d.id}.stl`, Buffer.from(toSTL(hub.meshes.combined, d.name)))
  }
}

const ct = buildCapsuleTest(wasm, defaults(DESIGNS[0]))
console.log('capsule test tris', ct.indices.length / 3)
if (out) fs.writeFileSync(`${out}/capsule-test.stl`, Buffer.from(toSTL(ct, 'capsule test')))
