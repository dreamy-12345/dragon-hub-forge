// Build every acro end and check: one clean solid, sealed chamber, weights add up.
import Module from '../vendor/manifold.js'
import { DESIGNS, defaults, buildHub, MATERIALS } from '../hub.js'
import { buildAcroMetal } from '../acro.js'
const w = await Module(); w.setup()
const only = process.argv[2]
const solid = (mesh) => new w.Manifold(new w.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }))
const variants = [{}, { coin: 'no' }, { weight: 'coins only', coinN: 4 }, { seat: 'sleeve and a plug inside the pole' }, { sides: 8, twist: 60 }, { poleOD: 32, circ: 140 }, { poleOD: 19, circ: 120, len: 40 }]
for (const d of DESIGNS.filter((d) => d.acro && (!only || d.id === only))) {
  for (const v of d.acroMetal ? [{}, { poleOD: 22, oRings: 0, lighten: 12 }] : variants) {
    const t = performance.now(), p = { ...defaults(d), ...v }
    const h = d.acroMetal ? buildAcroMetal(w, p, { plugIn: d.plugIn, density: 2.7 }) : buildHub(w, d, p, { material: MATERIALS.tpu95 })
    const a = h.acro, M = solid(h.meshes.combined)
    const parts = M.decompose()
    const neg = parts.filter((q) => q.volume() < 0).length
    const bad = []
    if (M.status() !== 'NoError') bad.push('status ' + M.status())
    if (parts.length - (a.shot ? 1 : 0) !== 1 || neg !== (a.shot ? 1 : 0)) bad.push(`${parts.length} pieces (${neg} sealed voids)`)
    const b = M.boundingBox()
    console.log(d.id.padEnd(13), JSON.stringify(v).slice(0, 40).padEnd(40), `${(performance.now() - t).toFixed(0)}ms`, `Ø${a.D.toFixed(0)}x${a.L}`,
      a.metal ? `metal ${a.g.toFixed(0)}g ${a.bolt || ''} grooves ${a.grooves.length}` : `tpu ${a.g.toFixed(0)}g coin ${a.coin ? a.coin.g.toFixed(0) : '-'} shot ${a.shot ? a.shot.g.toFixed(0) + '@' + a.shot.pauseAt.toFixed(1) : '-'} total ${a.total.toFixed(0)} wall ${a.wallS.toFixed(1)}`,
      `z ${b.min[2].toFixed(1)}..${b.max[2].toFixed(1)}`, bad.join(' '), h.stats.warns.join(' | '))
  }
}
