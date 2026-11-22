// Build every design in CNC mode at its CNC defaults (and spoke hubs in print mode too).
// usage: node tools/cnc-all.mjs [outdir] [id,id]   (writes <id>.dxf + <id>-cut.svg there if given)
import fs from 'node:fs'
import Module from '../vendor/manifold.js'
import { DESIGNS, MATERIALS, defaults, buildHub } from '../hub.js'
import { buildPlate, buildSpokeHub, cncDefaults, matOf, toDXF, toCutSVG } from '../cnc.js'

const wasm = await Module()
wasm.setup()
const [out, only] = process.argv.slice(2)
let fails = 0
for (const d of DESIGNS) {
  if (d.adaptor || d.ballEnd || d.sleeve || d.practiceSpoke || d.novelty || d.dart || d.cage || d.grip || d.mould || d.hoop || d.bubblePoi || d.sword || d.acro || d.dowel || d.tsword || d.taxe || d.fist || d.hilt || d.cageBall || (only && !only.split(',').includes(d.id))) continue
  const p = defaults(d), c = cncDefaults(d)
  const t0 = performance.now()
  try {
    let r
    if (d.spokeHub) {
      const pr = buildHub(wasm, d, p, { material: MATERIALS.pa })
      r = buildSpokeHub(wasm, p, { mode: 'cnc', shape: d.shape, density: matOf(c).density, fireSafe: matOf(c).kind === 'metal' })
      const s = r.stats
      console.log(`${d.id.padEnd(14)} ${(performance.now() - t0).toFixed(0).padStart(5)}ms  hub ${s.gHub.toFixed(0)}g (print ${pr.stats.gHub.toFixed(0)}g)  spoke ${s.gSpoke.toFixed(0)}g  total ${s.gTotal.toFixed(0)}g  Ø${s.overD.toFixed(0)}  wall ${r.spoke.minWall.toFixed(1)}  ${s.warns.join(' | ')}`)
    } else {
      const hub = buildHub(wasm, d, { ...p, ring: 'off', snap: 'off' })
      r = buildPlate(wasm, hub, p, c)
      const s = r.stats
      console.log(`${d.id.padEnd(14)} ${(performance.now() - t0).toFixed(0).padStart(5)}ms  ${matOf(c).name.slice(0, 14).padEnd(14)} ${s.thick}mm plate ${s.gPlate.toFixed(0)}g ends ${s.gEnds.toFixed(0)}g  off ${s.offset.toFixed(2)}mm  Ø${s.overD.toFixed(0)}  cut ${(s.cutLen / 1000).toFixed(1)}m  ${s.fixes.join('; ')}${s.warns.length ? '  WARN ' + s.warns.join(' | ') : ''}`)
    }
    if (out) {
      fs.writeFileSync(`${out}/${d.id}.dxf`, toDXF(r.layers, d.name))
      fs.writeFileSync(`${out}/${d.id}-cut.svg`, toCutSVG(r.layers, r.viewR))
    }
  } catch (e) { fails++; console.log(d.id, 'FAILED', e.stack) }
}
console.log(fails ? `${fails} FAILED` : 'all built')
