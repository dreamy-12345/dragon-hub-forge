// Build every mould both ways and check each printed part is one clean solid.
import Module from '../vendor/manifold.js'
import { DESIGNS, defaults, buildHub, MATERIALS } from '../hub.js'
const w = await Module(); w.setup()
const only = process.argv[2]
for (const d of DESIGNS.filter((d) => d.mould && (!only || d.id === only))) {
  for (const method of d.params.find((x) => x.key === 'method').options) for (const attach of d.kind === 'dart' ? ['cast-in M8 nut (screw in a swivel)', 'rope cast in (knotted end set in the rubber)', 'moulded eye'] : [null]) {
    const t = performance.now(), p = { ...defaults(d), method, ...(attach ? { attach } : {}) }
    const h = buildHub(w, d, p, { material: MATERIALS.petg })
    const m = h.mould
    const flats = Object.entries(h.meshes).filter(([k]) => k.endsWith('Flat'))
    const bad = []
    for (const [k, mesh] of flats) {
      const M = new w.Manifold(new w.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }))
      const parts = M.decompose().length
      const b = M.boundingBox()
      if (k === 'castFlat') continue
      if (M.status() !== 'NoError' || parts !== (k === 'boardFlat' ? 1 + m.plugs : 1)) bad.push(`${k}:${M.status()}/${parts}pcs`)
      if (b.min[2] < -0.01 || b.min[2] > 0.01) bad.push(`${k}:z0=${b.min[2].toFixed(2)}`)
    }
    console.log(d.id.padEnd(13), method.slice(0, 9), (attach || '').slice(0, 7).padEnd(7), `${(performance.now() - t).toFixed(0)}ms`,
      `size ${m.size.map((x) => x.toFixed(0)).join('x')}`, `print ${m.gPrint.toFixed(0)}g`, m.box ? `rubber ${m.rubberMl.toFixed(0)}ml copy ${m.copyG.toFixed(0)}g` : `cast ${m.castG.toFixed(0)}g`,
      `keys ${m.keys} bolts ${m.bolts} vents ${m.vents}+${m.markVents} uc ${(m.undercut*100).toFixed(1)}% shr ${m.shrinkPct}`, m.nut ? `nut@${m.nut.z.toFixed(0)} w${m.nut.washer} M8x${m.nut.bolt}` : '', bad.join(' '), h.stats.warns.join(' | '))
  }
}
