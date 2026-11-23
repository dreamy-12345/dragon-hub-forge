/**
 * Gloving lights: pockets for the small LED lights worn on glove fingertips, set
 * into a printed design wherever you click. A gloving light is a short cylinder:
 * a round board with the LED on top sitting on two coin cells, so its width is
 * set by the cells. Three size classes cover most of them:
 *   nano     about 12.5 mm (2 x CR1225)
 *   mid      14.5 mm (built-in rechargeable)
 *   classic  about 16 mm (2 x CR1620)
 * or measure your own (custom). Each pocket is the light plus 0.4 mm, with a
 * 4 mm seat at the mouth for a push-in diffuser cap (print it in clear or natural
 * TPU: it spreads the light and holds the light in) and a finger notch to lift
 * the light out to change its mode.
 * Units mm. Spots are [point, outward normal] on the design as shown.
 */
import { fitRigid } from './finish.js'

export const LIGHT_SIZES = {
  nano: { d: 12.5, len: 24, label: 'Nano: about 12.5 mm (2 × CR1225)' },
  mid: { d: 14.5, len: 26, label: 'Mid: 14.5 mm (rechargeable)' },
  classic: { d: 16, len: 28, label: 'Classic: about 16 mm (2 × CR1620)' },
  custom: { d: 13, len: 25, label: 'Custom: my own measurements' },
}
export const LIGHTS0 = { on: false, size: 'nano', d: 13, len: 25, spots: [] }
export const CAP_H = 4, CLEAR = 0.4, WALL = 1.5

/** Lights that fit each size class. Plain links: not affiliated with any maker. */
export const LIGHTS_THAT_FIT = [
  { size: 'nano', name: 'LEDGloves Nano range (Uber, Aurora, Flux and others)', url: 'https://ledgloves.com/products/cr1225-batteries-nano-size', note: 'their nano lights run on 2 × CR1225' },
  { size: 'nano', name: 'Futuristic Lights Ion (nano)', url: 'https://futuristiclights.com/products/ion-c2c-led-microlight' },
  { size: 'nano', name: 'Futuristic Lights Atom (nano, motion reactive)', url: 'https://futuristiclights.com/products/atom-motion-reactive-c2c-led-microlight' },
  { size: 'mid', name: 'LEDGloves Aurora V2 rechargeable (14.5 mm)', url: 'https://ledgloves.com/products/rechargeable-aurora-led-glove-set-v2' },
  { size: 'mid', name: 'LEDGloves Synergy (14.5 mm)', url: 'https://ledgloves.com/products/synergy-wireless-sync-led-glove-single-chip' },
  { size: 'classic', name: 'LEDGloves classic-size chips (about 16 mm)', url: 'https://ledgloves.com/', note: 'they describe classic chips as 16 mm wide' },
]

export function lightDims(L) {
  const s = LIGHT_SIZES[L.size] || LIGHT_SIZES.nano
  return L.size === 'custom' ? { d: L.d, len: L.len } : { d: s.d, len: s.len }
}

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l) }
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** A column-major 4x4 that takes z along -normal (into the part), origin at the point. */
function frame(p, n) {
  const w = norm(n.map((v) => -v))
  const u = norm(Math.abs(w[2]) < 0.9 ? cross([0, 0, 1], w) : cross([1, 0, 0], w))
  const v = cross(w, u)
  return [u[0], u[1], u[2], 0, v[0], v[1], v[2], 0, w[0], w[1], w[2], 0, p[0], p[1], p[2], 1]
}

/** Cut the pockets into a built design (mutates the result's meshes). */
export function applyLights(wasm, result, L) {
  const { Manifold, Mesh } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    if (!L?.on || !L.spots?.length) return result
    const data = result.meshes?.combined
    if (!data) return result
    const { d, len } = lightDims(L)
    const r = (d + CLEAR) / 2, depth = len + CAP_H
    const M = k(new Manifold(new Mesh({ numProp: 3, vertProperties: data.positions, triVerts: data.indices })))
    const pockets = [], broken = []
    L.spots.forEach(([p, n], i) => {
      const T = frame(p, n)
      // the pocket from 2 mm outside the surface to the full depth, a cap seat, and a finger notch at one side of the mouth
      const pocket = k(Manifold.union([
        k(k(Manifold.cylinder(depth + 2, r, r, 48)).translate([0, 0, -2])),
        k(k(Manifold.cylinder(5, 3, 3, 20)).translate([r, 0, -2])),
      ]))
      pockets.push(k(pocket.transform(T)))
      // does it break through? a sleeve WALL thick round the pocket, below the surface, must be all material
      const sleeve = k(k(k(Manifold.cylinder(depth + WALL - 1.5, r + WALL, r + WALL, 48)).translate([0, 0, 1.5])).transform(T))
      const outside = k(sleeve.subtract(M)).volume()
      if (outside > 0.06 * sleeve.volume()) broken.push(i + 1)
    })
    const P = k(Manifold.union(pockets))
    const out = k(M.subtract(P))
    result.meshes.combined = meshData(out)
    // the coloured parts of two-colour hubs, and flat print copies of the same part, get the pockets too
    for (const key of ['frame', 'glow', 'lids']) {
      const md = result.meshes[key]
      if (!md?.positions) continue
      const O = k(new Manifold(new Mesh({ numProp: 3, vertProperties: md.positions, triVerts: md.indices })))
      result.meshes[key] = meshData(k(O.subtract(P)))
    }
    for (const [key, md] of Object.entries(result.meshes)) {
      if (['combined', 'frame', 'glow', 'lids'].includes(key) || !md?.positions || md.positions.length !== data.positions.length) continue
      const T = fitRigid(data.positions, md.positions)
      if (T) result.meshes[key] = meshData(k(out.transform(T)))
    }
    // the diffuser caps, in a row: a plug that presses into the seat with a low dome
    const caps = []
    const cap = k(Manifold.union([k(Manifold.cylinder(CAP_H - 0.3, r + 0.1, r + 0.1, 48)), k(k(k(Manifold.sphere(r + 0.1, 48)).scale([1, 1, 0.18])).translate([0, 0, CAP_H - 0.3]))]))
    L.spots.forEach((_, i) => caps.push(k(cap.translate([i * (2 * r + 6), 0, 0]))))
    const C = k(Manifold.union(caps))
    const cb = C.boundingBox()
    result.meshes.lightCaps = meshData(k(C.translate([0, 0, -cb.min[2]])))
    const g0 = result.stats?.grams || 0
    const removed = (M.volume() - out.volume()) / 1000
    if (result.stats) {
      const dens = g0 && M.volume() ? g0 / (M.volume() / 1000) : 1.2
      result.stats = { ...result.stats, grams: g0 - removed * dens, gramsTotal: (result.stats.gramsTotal || g0) - removed * dens }
      if (broken.length) result.stats.warns = [...(result.stats.warns || []), `Light ${broken.join(', ')} ${broken.length > 1 ? 'are' : 'is'} too close to an edge or a hollow and would break through: move ${broken.length > 1 ? 'them' : 'it'} somewhere thicker (the marker shows green where it fits).`]
    }
    result.lights = { n: L.spots.length, d, len, broken, depth, capD: 2 * (r + 0.1) }
    return result
  } catch (e) {
    result.stats?.warns?.push(`The light pockets could not be cut (${e.message || e}).`)
    return result
  } finally {
    for (const o of live) o.delete?.()
  }
}
