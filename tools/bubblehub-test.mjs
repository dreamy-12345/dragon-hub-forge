import Module from '../vendor/manifold.js'
import { DESIGNS, defaults, buildHub, MATERIALS } from '../hub.js'
const w = await Module(); w.setup()
for (const d of DESIGNS.filter((x) => x.bubbleHub)) {
  const t = performance.now()
  try {
    const h = buildHub(w, d, defaults(d), { material: MATERIALS.petg, bed: 300 })
    const M = new w.Manifold(new w.Mesh({ numProp: 3, vertProperties: h.meshes.combined.positions, triVerts: h.meshes.combined.indices }))
    const b = M.boundingBox()
    console.log(d.id.padEnd(12), `${(performance.now() - t).toFixed(0)}ms`, `${h.stats.grams.toFixed(0)}g`, `mix ${h.bubbleHub.liquidMl.toFixed(0)}ml`, `loops ${h.bubbleHub.loops}`, `pcs ${M.decompose().length}`, `z ${b.min[2].toFixed(1)}..${b.max[2].toFixed(1)}`, `span ${h.bubbleHub.span.toFixed(0)}`, h.stats.warns.join(' | '))
  } catch (e) { console.log(d.id, 'ERR', e.stack.split('\n').slice(0,4).join(' | ')) }
}
