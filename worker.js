// Geometry runs here so the sliders stay smooth while a hub rebuilds.
import Module from './vendor/manifold.js'
import { DESIGNS, MATERIALS, buildHub, buildFitTest, buildCapsuleTest } from './hub.js'
import { buildPlate, buildSpokeHub, matOf } from './cnc.js'
import { buildDart } from './darts.js'

const ready = Module(self.__MANIFOLD_OPTS || {}).then((w) => (w.setup(), w))
const design = (id) => DESIGNS.find((d) => d.id === id)

function buffers(obj, out = []) {
  if (obj && typeof obj === 'object') {
    if (ArrayBuffer.isView(obj)) out.push(obj.buffer)
    else for (const v of Object.values(obj)) buffers(v, out)
  }
  return out
}

self.onmessage = async ({ data }) => {
  const { id, op } = data
  try {
    const wasm = await ready
    let result
    if (op === 'build') {
      result = buildHub(wasm, design(data.design), data.params, { material: MATERIALS[data.material], bed: data.bed })
    } else if (op === 'balance') {
      // centre of mass y is near-linear in the balance param: a few secant steps zero it
      const d = design(data.design), p = data.params, key = data.key
      const def = d.params.find((x) => x.key === key)
      const at = (v) => buildHub(wasm, d, { ...p, [key]: v }, { material: MATERIALS[data.material] }).stats
      // a design can also aim its counterweight: point it opposite the imbalance first
      const aim = d.params.find((x) => x.balanceAngle)
      if (aim) {
        const s = at(p[key])
        let a = (Math.atan2(-s.cy, -s.cx) * 180) / Math.PI - (p.rotate || 0)
        a = ((((a + 180) % 360) + 360) % 360) - 180
        p[aim.key] = Math.round(a)
      }
      // zero the centre of mass along the direction it is off in at the start
      const s0 = at(p[key])
      const L = Math.hypot(s0.cx, s0.cy) || 1
      const ux = s0.cx / L, uy = s0.cy / L
      const cyAt = (v) => { const s = at(v); return s.cx * ux + s.cy * uy }
      let y0 = p[key], c0 = L, y1 = Math.min(def.max, y0 + (def.max - def.min) / 10), c1 = cyAt(y1)
      if (y1 === y0) (y1 = y0 - (def.max - def.min) / 10), (c1 = cyAt(y1))
      for (let i = 0; i < 6 && Math.abs(c1) > 0.01 && c1 !== c0; i++) {
        const y2 = Math.max(def.min, Math.min(def.max, y1 - (c1 * (y1 - y0)) / (c1 - c0)))
        ;[y0, c0, y1] = [y1, c1, y2]
        c1 = cyAt(y1)
      }
      result = { [key]: Math.round(y1 / def.step) * def.step, ...(aim ? { [aim.key]: p[aim.key] } : {}) }
    } else if (op === 'cnc') {
      // CNC: the design as drawn for print, flattened and fixed for the cutter
      const d = design(data.design), c = data.cnc
      result = d.dart ? buildDart(wasm, data.params, { style: d.style, density: matOf(c).density, cnc: true })
        : d.grip || d.ballEnd || d.sleeve || d.practiceSpoke || d.novelty ? buildHub(wasm, d, data.params, { material: MATERIALS.tpu95 }) : d.spokeHub
        ? buildSpokeHub(wasm, data.params, { mode: 'cnc', shape: d.shape, density: matOf(c).density, fireSafe: matOf(c).kind === 'metal' })
        : buildPlate(wasm, buildHub(wasm, d, { ...data.params, ring: 'off', snap: 'off' }), data.params, c)
    } else if (op === 'fit') result = buildFitTest(wasm, data.params)
    else if (op === 'captest') result = buildCapsuleTest(wasm, data.params)
    self.postMessage({ id, result }, buffers(result))
  } catch (e) {
    self.postMessage({ id, error: String(e && e.message ? e.message : e) })
  }
}
