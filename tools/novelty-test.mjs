// Build the fun contact ends at their defaults, with and without the steel-shot balance.
import Module from '../vendor/manifold.js'
import { DESIGNS, defaults, buildHub, MATERIALS } from '../hub.js'
const w = await Module(); w.setup()
for (const d of DESIGNS.filter((d) => d.novelty)) for (const balance of ['steel shot low down', 'as printed']) {
  const t = performance.now()
  const h = buildHub(w, d, { ...defaults(d), balance }, { material: MATERIALS.tpu95 })
  const s = h.stats
  console.log(d.id.padEnd(11), balance.padEnd(20), `${(performance.now() - t).toFixed(0)}ms`, `${s.grams.toFixed(0)}g print + ${s.gShot.toFixed(0)}g shot`, `CoM ${s.comAbove.toFixed(0)}mm past tip, ${s.comOff.toFixed(2)} off axis`, s.pauseAt ? `pause ${s.pauseAt.toFixed(1)}` : '')
}
