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
// battle axes: each piece one solid, and the counterweight weighs the same as the axe
for (const d of DESIGNS.filter((d) => d.axe)) for (const size of [70, 100, 150]) {
  const h = buildHub(w, d, { ...defaults(d), size }, { material: MATERIALS.tpu95 })
  const c = h.novelty.counter, pcs = {}
  for (const k of ['combined', 'counterFlat']) {
    const M = new w.Manifold(new w.Mesh({ numProp: 3, vertProperties: h.meshes[k].positions, triVerts: h.meshes[k].indices }))
    pcs[k] = M.decompose().filter((q) => q.volume() > 0).length + (M.status() === 'NoError' ? '' : M.status())
  }
  console.log('AXE', d.id.padEnd(11), size, `${h.stats.gramsTotal.toFixed(0)}g ${h.novelty.width.toFixed(0)}x${h.novelty.height.toFixed(0)}`, `off ${h.stats.comOff.toFixed(2)}`,
    `counter Ø${c.D.toFixed(0)}x${c.H.toFixed(0)} ${c.total.toFixed(0)}g (${c.shot.toFixed(0)} shot) pause ${c.pauseAt.toFixed(1)}`, JSON.stringify(pcs))
}
