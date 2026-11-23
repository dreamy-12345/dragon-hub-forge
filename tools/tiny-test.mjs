import Module from '../vendor/manifold.js'
import { DESIGNS, defaults, buildHub, MATERIALS } from '../hub.js'
const w = await Module(); w.setup()
const tiny = DESIGNS.filter((d) => String(d.group).startsWith('Tiny'))
console.log('tiny designs:', tiny.length, tiny.map((d) => d.id).join(' '))
for (const d of tiny.filter((x) => x.club)) { const h = buildHub(w, d, defaults(d), { material: MATERIALS.petg }); const M = new w.Manifold(new w.Mesh({ numProp: 3, vertProperties: h.meshes.printFlat.positions, triVerts: h.meshes.printFlat.indices })); console.log(d.id, h.stats.grams.toFixed(1) + 'g', 'pcs', M.decompose().length, 'stripes', h.club.stripes) }
for (const d of tiny.filter((x) => !x.club).slice(0, 30)) { try { buildHub(w, d, defaults(d), { material: MATERIALS.tpu95 }); } catch (e) { console.log(d.id, 'ERR', e.message) } }
console.log('built all tiny')
