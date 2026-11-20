// Build the pole inserts and practice spokes at their defaults.
import Module from '../vendor/manifold.js'
import { DESIGNS, defaults, buildHub, MATERIALS } from '../hub.js'
const w = await Module(); w.setup()
for (const d of DESIGNS.filter((d) => d.sleeve || d.practiceSpoke)) {
  const t = performance.now()
  const h = buildHub(w, d, defaults(d), { material: MATERIALS.petg })
  const z = (mesh) => { const P = mesh.positions; let a = 1e9; for (let i = 2; i < P.length; i += 3) a = Math.min(a, P[i]); return a.toFixed(2) }
  console.log(d.id, `${(performance.now() - t).toFixed(0)}ms`, `${h.stats.grams.toFixed(0)}g`, h.sleeve ? `od ${h.sleeve.od.toFixed(2)} in id ${h.sleeve.id}` : `head ${h.practiceSpoke.head} Ø${h.practiceSpoke.headD.toFixed(0)} ${h.practiceSpoke.gHead.toFixed(0)}g spoke z0 ${z(h.meshes.spokeFlat)} head z0 ${z(h.meshes.practiceFlat)}`, h.stats.warns.join('|'))
}
