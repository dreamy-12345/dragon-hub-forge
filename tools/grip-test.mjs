// Build the pole grips and collapsible joints, and the spoke hubs with each pole grip.
import Module from '../vendor/manifold.js'
import { DESIGNS, defaults, buildHub, MATERIALS } from '../hub.js'
import { buildSpokeHub } from '../cnc.js'
const w = await Module(); w.setup()
for (const d of DESIGNS.filter((d) => d.grip)) {
  const t = performance.now(), h = buildHub(w, d, defaults(d), { material: MATERIALS.pa })
  console.log(d.id.padEnd(13), `${(performance.now() - t).toFixed(0)}ms`, `${h.stats.grams.toFixed(0)}g`, h.grip.bolt, h.stats.warns.join('|'))
}
for (const grip of ['inside the pole (expanding spigot)', 'split clamp (pinch bolt)', 'grub screws']) {
  const d = DESIGNS.find((x) => x.id === 'spokeMinimal'), p = { ...defaults(d), poleGrip: grip }
  const h = buildSpokeHub(w, p, { mode: 'cnc', shape: d.shape, density: 2.7, fireSafe: true })
  console.log('spokeMinimal', grip.padEnd(36), `${h.stats.gHub.toFixed(0)}g hub`, h.meshes.wedgeFlat ? 'wedge' : '', h.stats.warns.join('|'))
}
