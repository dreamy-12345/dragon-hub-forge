// Build the rope dart heads (print + CNC brass), write their lathe DXFs.
import fs from 'node:fs'
import Module from '../vendor/manifold.js'
import { DESIGNS, defaults, buildHub, MATERIALS } from '../hub.js'
import { buildDart } from '../darts.js'
import { toDXF, toCutSVG } from '../cnc.js'
const w = await Module(); w.setup()
const out = process.argv[2]
for (const d of DESIGNS.filter((d) => d.dart)) {
  const t = performance.now(), p = defaults(d)
  if (d.dart) {
    const a = buildHub(w, d, p, { material: MATERIALS.tpu95 }), b = buildDart(w, p, { style: d.style, density: 8.5, cnc: true })
    console.log(d.id.padEnd(12), `${(performance.now() - t).toFixed(0)}ms`, `TPU ${a.stats.grams.toFixed(0)}g brass ${b.stats.grams.toFixed(0)}g`, `${a.dart.H.toFixed(0)}mm`, a.dart.turned ? 'lathe' : 'mill/print', a.stats.warns.join('|'))
    if (out && b.layers) fs.writeFileSync(`${out}/${d.id}.dxf`, toDXF(b.layers, d.name))
  }
}
