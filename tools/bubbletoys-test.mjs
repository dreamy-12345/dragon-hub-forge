import Module from '../vendor/manifold.js'
import { DESIGNS, defaults, buildHub, MATERIALS } from '../hub.js'
const w = await Module(); w.setup()
for (const d of DESIGNS.filter((x) => x.bubbleToy)) {
  const t = performance.now()
  try {
    const h = buildHub(w, d, defaults(d), { material: MATERIALS.petg, bed: 300 })
    const parts = h.bubbleToy.pieces.map((pc) => { const md = h.meshes[pc.key]; const M = new w.Manifold(new w.Mesh({ numProp: 3, vertProperties: md.positions, triVerts: md.indices })); const b = M.boundingBox(); return `${pc.label.split(' ')[0]}:${M.decompose().length}pc ${(b.max[0] - b.min[0]).toFixed(0)}x${(b.max[1] - b.min[1]).toFixed(0)}x${(b.max[2] - b.min[2]).toFixed(0)}` })
    console.log(d.id.padEnd(12), `${(performance.now() - t).toFixed(0)}ms`, `${h.stats.grams.toFixed(0)}g`, parts.join(' | '), h.stats.warns.join(' | '))
  } catch (e) { console.log(d.id, 'ERR', e.stack.split('\n').slice(0, 3).join(' ')) }
}
