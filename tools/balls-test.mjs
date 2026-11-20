// Build every contact ball end and report weight, grip and that each part sits flat.
import Module from '../vendor/manifold.js'
import { DESIGNS, defaults, buildHub, MATERIALS } from '../hub.js'
const w = await Module(); w.setup()
for (const d of DESIGNS.filter((d) => d.ballEnd)) {
  const p = { ...defaults(d), fill: 'steel shot' }
  const t = performance.now()
  const h = buildHub(w, d, p, { material: MATERIALS.tpu95 })
  const parts = ['lowerFlat', 'upperFlat', 'joinerFlat'].map((k) => { const P = h.meshes[k].positions; let z = 1e9; for (let i = 2; i < P.length; i += 3) z = Math.min(z, P[i]); return `${k} z0 ${z.toFixed(2)}` })
  console.log(d.id, `${(performance.now() - t).toFixed(0)}ms`, `${h.stats.gShell.toFixed(0)}g shell`, `${h.stats.gFill.toFixed(0)}g fill`, 'squeeze', h.ball.squeeze.toFixed(2), parts.join(', '), h.stats.warns.join('|'))
}
