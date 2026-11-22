/**
 * Rope dart heads: the weight on the end of a rope dart. 3D print them (TPU for
 * soft practice, PETG for a firmer feel) or have them turned in metal on a CNC
 * lathe (the classic ones are solids of revolution: the forge gives the lathe
 * profile as a drawing and a DXF). The modern faceted and twisted ones need a
 * 4-axis mill or metal 3D printing: send the STL.
 *
 * Every head has an eye at the top for the rope, rounded through and edged so
 * it does not cut the rope. Units mm, the dart's axis is z, tip at the bottom.
 */
import { TAU } from './geom.js'
import { geoEdges } from './balls.js'
import { coneScales, CONE_SHAPES, CONE_PARAMS } from './pinecone.js'

export const DART_PARAMS = [
  { key: 'length', label: 'Length', unit: 'mm', min: 60, max: 180, step: 1, value: 110, hint: 'Tip to the top of the eye.' },
  { key: 'maxD', label: 'Widest', unit: 'mm', min: 20, max: 70, step: 0.5, value: 34 },
  { key: 'attach', label: 'Rope attaches by', options: ['eye', 'swivel socket (M8)'], value: 'eye', hint: 'Eye: tie the rope through the hole (figure-eight loop). Swivel socket: a threaded M8 socket at the top for a stainless swivel eye bolt, so the rope never twists; lock the thread with a drop of thread-locker (metal) or the printed nut trap (print).' },
  { key: 'ropeD', label: 'Rope', unit: 'mm', min: 3, max: 14, step: 0.5, value: 7, presets: [6, 8, 10], hint: 'The eye fits this rope with a millimetre to spare.' },
]

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

// half-profiles [r, z] from the tip (z = 0) up to the shoulder under the eye, for the turned shapes
function profile(style, L, R) {
  const pts = []
  const add = (r, z) => pts.push([Math.max(0, r), z])
  const N = 48
  if (style === 'classic') {
    // a spike: blunt tip, long cone, round shoulder, neck
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = t * L
      const r = t < 0.72 ? 2.5 + (R - 2.5) * Math.pow(t / 0.72, 0.85) : R * Math.cos(((t - 0.72) / 0.28) * Math.PI * 0.42)
      add(r, z)
    }
  } else if (style === 'bell') {
    // a meteor bell: weight low and round, a waist, two rings below the eye
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = t * L
      let r = R * Math.sin(Math.min(1, t / 0.55) * Math.PI * 0.5) ** 0.6
      if (t > 0.55) r = R - (R * 0.58) * Math.sin(((t - 0.55) / 0.45) * Math.PI * 0.5)
      if (t > 0.7 && t < 0.76) r += 2.2 * Math.sin(((t - 0.7) / 0.06) * Math.PI)
      if (t > 0.84 && t < 0.9) r += 2.2 * Math.sin(((t - 0.84) / 0.06) * Math.PI)
      add(i === 0 ? 0 : Math.max(r, 3), z)
    }
  } else if (style === 'willow') {
    // a willow-leaf spindle: long, slim, both ends drawn out
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = t * L
      add(2.5 + (R - 2.5) * Math.pow(Math.sin(t * Math.PI), 0.75) * (t < 0.5 ? 1 : 0.85 + 0.15 * Math.cos((t - 0.5) * Math.PI)), z)
    }
  } else {
    // glow drop: a teardrop with room for an LED capsule
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = t * L
      const r = t < 0.62 ? R * Math.sin((t / 0.62) * Math.PI * 0.5) ** 0.55 : R * Math.cos(((t - 0.62) / 0.38) * Math.PI * 0.42)
      add(i === 0 ? 0 : Math.max(r, 4), z)
    }
  }
  return pts
}

export function buildDart(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const style = opts.style || 'classic'
    const R = p.maxD / 2
    const eyeR = p.ropeD / 2 + 0.5 // the hole
    const bossR = Math.max(eyeR + 4, p.ropeD * 1.1)
    const bossH = 2 * eyeR + 8
    let L = p.length - bossH + 2 // the body below the eye (round ones reset it from their size)
    const warns = []
    let body, prof = null, Lr = 0
    const turned = ['classic', 'bell', 'willow', 'glow'].includes(style)
    const round = ['orb', 'saturn', 'geodesic'].includes(style)
    if (round || style === 'pod') {
      // round ones: the ball sets the length (the Length slider is ignored)
      Lr = style === 'pod' ? 3 * R : 2 * R
    }
    if (style === 'acorn') Lr = 2.4 * R
    if (round || style === 'pod') {
      body = k(k(k(Manifold.sphere(R, 96)).scale([1, 1, style === 'pod' ? 1.5 : 1])).translate([0, 0, Lr / 2]))
      if (style === 'saturn') {
        // a ring round the middle, tilted a little, joined to the ball all the way round
        const ring = k(k(k(CrossSection.circle(2.8, 24)).translate([R + 4, 0])).revolve(128))
        const web = k(k(Manifold.cylinder(1.6, R + 4, R + 4, 128)).translate([0, 0, -0.8]))
        body = k(body.add(k(k(k(ring.add(web)).rotate([12, 0, 0])).translate([0, 0, Lr / 2]))))
      } else if (style === 'pod') {
        // eight long grooves, like a seed pod or a hop flower
        const g = []
        for (let i = 0; i < 8; i++) {
          const a = (TAU * i) / 8
          g.push(k(k(k(Manifold.sphere(1, 24)).scale([2.6, 2.6, Lr * 0.42])).translate([R * 1.02 * Math.cos(a), R * 1.02 * Math.sin(a), Lr / 2])))
        }
        body = k(body.subtract(k(Manifold.union(g))))
      } else if (style === 'geodesic') {
        // a fine raised geodesic web over the whole ball (an icosahedron subdivided twice)
        const rr = 1.15, rad = R - 0.3, ball = k(Manifold.sphere(rr, 10))
        const bits = []
        for (const [a, b] of geoEdges('geodesic fine')) {
          const pa = a.map((x) => x * rad), pb = b.map((x) => x * rad)
          bits.push(k(Manifold.hull([k(ball.translate(pa)), k(ball.translate(pb))])))
        }
        body = k(body.add(k(k(Manifold.union(bits)).translate([0, 0, Lr / 2]))))
      }
    } else if (style === 'scales' || style === 'fibonacci') {
      // a teardrop covered in a golden-angle spiral of raised scales (or dimples)
      prof = profile('glow', L, R)
      const poly = [[0, 0], ...prof.filter(([r]) => r > 0), [0, L]]
      body = k(k(new CrossSection([poly], 'Positive')).revolve(96))
      const rAt = (z) => { for (let i = 1; i < prof.length; i++) if (prof[i][1] >= z) { const [r0, z0] = prof[i - 1], [r1, z1] = prof[i]; return r0 + ((r1 - r0) * (z - z0)) / Math.max(1e-6, z1 - z0) } return 0 }
      const N = style === 'scales' ? 260 : 420, bits = []
      const size = style === 'scales' ? Math.max(2.2, R * 0.16) : Math.max(1.4, R * 0.1)
      for (let i = 0; i < N; i++) {
        const z = L * (0.06 + (0.86 * i) / N), r = rAt(z)
        if (r < size * 1.6) continue
        const a = i * Math.PI * (3 - Math.sqrt(5))
        const push = style === 'scales' ? r - size * 0.35 : r + size * 0.45
        const b = k(k(Manifold.sphere(size, style === 'scales' ? 10 : 8)).scale(style === 'scales' ? [1, 1, 0.7] : [1, 1, 1]))
        bits.push(k(b.translate([push * Math.cos(a), push * Math.sin(a), z])))
      }
      const u = k(Manifold.union(bits))
      body = style === 'scales' ? k(body.add(u)) : k(body.subtract(u))
      prof = null // not a plain lathe job any more: the pattern needs a 4-axis mill or a metal print
    } else if (style.startsWith('cone-')) {
      // a pine cone hanging from the eye: golden-angle scales, their ends pointing down to the tip
      const shape = style.slice(5)
      const Lb = shape === 'stone' ? (Lr = 2.3 * R) : L
      const f = CONE_SHAPES[shape] || CONE_SHAPES.pine
      const rAt = (z) => R * 0.8 * f(Math.min(1, Math.max(0, z / Lb)))
      const pr = []
      for (let i = 1; i <= 64; i++) pr.push([rAt((Lb * i) / 64), (Lb * i) / 64])
      body = k(k(new CrossSection([[[0, 0], [rAt(0), 0], ...pr, [0, Lb]]], 'Positive')).revolve(96))
      const cartoon = shape === 'cartoon', faceZ = Lb * 0.5
      // a cartoon cone keeps a clear patch on its front for a face
      const skip = cartoon ? (a, z) => { const aa = Math.atan2(Math.sin(a), Math.cos(a)); return Math.abs(aa) < 0.75 && Math.abs(z - faceZ) < R * 0.55 } : null
      const sc = coneScales(wasm, k, { rAt, z0: Lb * 0.02, z1: Lb * 0.94, N: p.scales ?? 120, open: p.open ?? 0.3, dir: -1, minR: 2.5, skip })
      if (sc) body = k(body.add(sc))
      if (cartoon) {
        // big googly eyes and a smile
        const fr = rAt(faceZ)
        const eye = (s) => k(k(Manifold.sphere(R * 0.24, 32)).translate([fr * 0.88, s * R * 0.27, faceZ + R * 0.16]))
        const pupil = (s) => k(k(Manifold.sphere(R * 0.11, 20)).translate([fr * 0.88 + R * 0.2, s * R * 0.25, faceZ + R * 0.13]))
        body = k(Manifold.union([body, eye(1), eye(-1)]))
        body = k(body.subtract(k(Manifold.union([pupil(1), pupil(-1)]))))
        const smile = []
        for (let i = 0; i <= 8; i++) { const t = -0.6 + (1.2 * i) / 8; smile.push(k(k(Manifold.sphere(R * 0.06, 12)).translate([fr * 0.97 + R * 0.02, Math.sin(t) * R * 0.32, faceZ - R * 0.18 - Math.cos(t) * R * 0.1 + R * 0.08]))) }
        body = k(body.subtract(k(Manifold.hull(smile.slice(0, 5))).add(k(Manifold.hull(smile.slice(4))))))
      }
      warns.push('Pine cone scales overhang: print with tree supports touching the bed only, or print it in two halves.')
    } else if (style === 'leaf') {
      // a leaf bud: a teardrop wrapped in rows of pointed leaves, each with a raised midrib, laid along the curve
      prof = profile('glow', L, R)
      const poly = [[0, 0], ...prof.filter(([r]) => r > 0), [0, L]]
      body = k(k(new CrossSection([poly], 'Positive')).revolve(96))
      const rAt = (z) => { for (let i = 1; i < prof.length; i++) if (prof[i][1] >= z) { const [r0, z0] = prof[i - 1], [r1, z1] = prof[i]; return r0 + ((r1 - r0) * (z - z0)) / Math.max(1e-6, z1 - z0) } return 0 }
      const leaves = []
      const rows = 4, per = 6
      for (let row = 0; row < rows; row++) {
        const zc = L * (0.2 + (0.52 * row) / (rows - 1)), r = rAt(zc)
        if (r < 6) continue
        const ll = Math.min(L * 0.34, r * 2.2), lw = Math.min(ll * 0.42, (TAU * r) / per * 0.95), t = Math.max(1.4, R * 0.08)
        // a pointed leaf: two arcs crossing (a lens), in (width, length)
        const half = lw / 2, len = ll / 2, rho = (half * half + len * len) / (2 * half), dd = rho - half
        const lens = k(k(k(CrossSection.circle(rho, 64)).translate([dd, 0])).intersect(k(k(CrossSection.circle(rho, 64)).translate([-dd, 0]))))
        let leaf = k(lens.extrude(t))
        leaf = k(leaf.add(k(k(Manifold.cube([0.9, ll * 0.82, 0.7], true)).translate([0, 0, t + 0.2])))) // the midrib
        leaf = k(k(leaf.rotate([90, 0, 0])).rotate([0, 0, 90])) // width round, length up the dart, thickness outwards
        const slope = (rAt(zc + 1) - rAt(zc - 1)) / 2
        for (let i = 0; i < per; i++) {
          const a = (360 * i) / per + row * 30
          leaves.push(k(k(k(leaf.rotate([0, (Math.atan(slope) * 180) / Math.PI, 0])).translate([r - t * 0.55, 0, zc])).rotate([0, 0, a])))
        }
      }
      body = k(body.add(k(Manifold.union(leaves))))
      prof = null
    } else if (style === 'acorn') {
      // an acorn: a smooth nut, and a scaly cup on top whose stem carries the eye
      const nut = k(k(k(Manifold.sphere(R * 0.95, 96)).scale([1, 1, 1.2])).translate([0, 0, 1.15 * R]))
      const cz = 1.4 * R
      let cup = k(k(k(Manifold.sphere(R * 1.04, 96)).translate([0, 0, cz])).trimByPlane([0, 0, 1], cz + 0.05 * R))
      const bumps = [], n = 70
      for (let i = 0; i < n; i++) {
        const zf = 0.08 + (0.85 * i) / n, ang = i * Math.PI * (3 - Math.sqrt(5))
        const el = Math.asin(zf), rr = R * 1.04
        bumps.push(k(k(k(Manifold.sphere(R * 0.11, 12)).scale([1, 1, 0.6])).translate([rr * Math.cos(el) * Math.cos(ang), rr * Math.cos(el) * Math.sin(ang), cz + rr * zf])))
      }
      cup = k(cup.add(k(k(Manifold.union(bumps)).trimByPlane([0, 0, 1], cz + 0.05 * R))))
      const rim = k(k(k(k(CrossSection.circle(R * 0.07, 16)).translate([R * 1.02, 0])).revolve(96)).translate([0, 0, cz + 0.08 * R]))
      body = k(Manifold.union([nut, cup, rim]))
    } else if (style === 'ent') {
      // a tree herder: a gnarled bark trunk, roots for feet at the tip, branch arms, a carved face, a leafy crown under the eye
      const sph = (r, x, y, z) => k(k(Manifold.sphere(r, 20)).translate([x, y, z]))
      const chain = (pts, r0, r1) => k(Manifold.union(pts.slice(1).map((q, i) => k(Manifold.hull([sph(r0 + ((r1 - r0) * i) / pts.length, ...pts[i]), sph(r0 + ((r1 - r0) * (i + 1)) / pts.length, ...q)])))))
      const prof2 = []
      for (let i = 0; i <= 40; i++) { const t = i / 40; prof2.push([R * (0.72 + 0.12 * Math.sin(t * 9) * (1 - t) + 0.16 * Math.sin(Math.PI * Math.min(1, t * 1.2))) * (t > 0.85 ? 1 - (t - 0.85) * 2.2 : 1), L * (0.1 + 0.9 * t)]) }
      body = k(k(new CrossSection([[[0, L * 0.1], ...prof2, [0, L]]], 'Positive')).revolve(48))
      body = k(body.warp((v) => { const a = (v[2] / L) * 0.9; const c = Math.cos(a), s = Math.sin(a), x = v[0], y = v[1]; v[0] = x * c - y * s; v[1] = x * s + y * c }))
      // bark: wandering grooves down the trunk
      const grooves = []
      for (let g = 0; g < 11; g++) {
        const pts = []
        for (let i = 0; i <= 10; i++) { const z = L * (0.14 + 0.7 * (i / 10)), a = (g / 11) * Math.PI * 2 + 0.25 * Math.sin(i * 1.7 + g) + (z / L) * 0.9; const rr = R * 0.86; pts.push([rr * Math.cos(a), rr * Math.sin(a), z]) }
        grooves.push(chain(pts, R * 0.07, R * 0.05))
      }
      // roots: five tapering roots from low on the trunk down to the tip
      const roots = []
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.3; roots.push(chain([[R * 0.15 * Math.cos(a), R * 0.15 * Math.sin(a), L * 0.3], [R * 0.4 * Math.cos(a), R * 0.4 * Math.sin(a), L * 0.24], [R * 0.85 * Math.cos(a), R * 0.85 * Math.sin(a), L * 0.1], [R * 0.9 * Math.cos(a + 0.2), R * 0.9 * Math.sin(a + 0.2), L * 0.02]], R * 0.26, R * 0.12)) }
      // arms: two branches out and up, each with a twig
      const arms = []
      for (const s of [1, -1]) {
        const root = [0, s * R * 0.15, L * 0.54], base = [0, s * R * 0.75, L * 0.56], el = [0.1 * R, s * R * 1.25, L * 0.62], hand = [0.15 * R, s * R * 1.45, L * 0.76]
        arms.push(chain([root, base, el, hand], R * 0.32, R * 0.12), chain([[0.08 * R, s * R * 1.1, L * 0.6], el, [0.25 * R, s * R * 1.55, L * 0.64]], R * 0.15, R * 0.07))
      }
      // the crown: knobbly leaf clumps round the top, under the eye boss
      const crown = []
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, z = L * (0.84 + 0.06 * (i % 2)); crown.push(k(sph(R * 0.3, R * 0.55 * Math.cos(a), R * 0.55 * Math.sin(a), z).scale([1, 1, 0.75]))) }
      body = k(Manifold.union([body, ...roots, ...arms, ...crown]))
      body = k(body.subtract(k(Manifold.union(grooves))))
      // the face, looking out along +x: deep-set eyes under a heavy brow, a knot of a nose, a crack of a mouth
      const fz = L * 0.66, fr = R * 0.66 // just under the bark, so every feature is fused to the trunk
      body = k(body.add(chain([[fr, -R * 0.42, fz + R * 0.2], [fr + R * 0.12, 0, fz + R * 0.26], [fr, R * 0.42, fz + R * 0.2]], R * 0.14, R * 0.14)))
      body = k(body.add(sph(R * 0.2, fr + R * 0.06, 0, fz - R * 0.12)))
      body = k(body.subtract(k(Manifold.union([sph(R * 0.17, fr + R * 0.02, -R * 0.26, fz + R * 0.04), sph(R * 0.17, fr + R * 0.02, R * 0.26, fz + R * 0.04), chain([[fr + R * 0.02, -R * 0.3, fz - R * 0.42], [fr + R * 0.1, 0, fz - R * 0.47], [fr + R * 0.02, R * 0.3, fz - R * 0.4]], R * 0.06, R * 0.06)]))))
      warns.push('The ent has overhangs (arms, brow, roots): print it with tree supports, eye down.')
    } else if (style.startsWith('shroom-')) {
      // mushrooms, hanging cap-up from the eye: the stem is the dart's point
      const kind = style.slice(7)
      const sph = (r, x, y, z, n = 24) => k(k(Manifold.sphere(r, n)).translate([x, y, z]))
      if (kind === 'amanita' || kind === 'morel') {
        const capZ = L * (kind === 'morel' ? 0.52 : 0.68), stemR = R * (kind === 'morel' ? 0.42 : 0.36)
        const stem = k(k(Manifold.cylinder(capZ - L * 0.1, stemR * 0.9, stemR, 48)).translate([0, 0, L * 0.1]))
        const base = sph(R * (kind === 'morel' ? 0.5 : 0.62), 0, 0, L * 0.12, 48) // the swollen base, at the tip
        let cap
        if (kind === 'amanita') {
          cap = k(k(k(Manifold.sphere(R, 64)).scale([1, 1, 0.62])).translate([0, 0, capZ]))
          cap = k(cap.trimByPlane([0, 0, 1], capZ - R * 0.06))
          // white spots: raised warts on the cap
          const spots = []
          for (let i = 0; i < 22; i++) { const zf = 0.15 + (0.8 * i) / 22, a = i * Math.PI * (3 - Math.sqrt(5)), rr = Math.sqrt(1 - zf * zf); spots.push(k(k(sph(R * 0.11, R * rr * Math.cos(a), R * rr * Math.sin(a), 0, 12).scale([1, 1, 0.7])).translate([0, 0, capZ + R * 0.62 * zf]))) }
          cap = k(cap.add(k(Manifold.union(spots))))
          // the skirt ring hanging round the stem under the cap
          const skirt = k(k(k(k(CrossSection.circle(R * 0.09, 16)).translate([stemR * 1.12, 0])).revolve(48)).translate([0, 0, capZ - R * 0.3]))
          body = k(Manifold.union([stem, base, cap, skirt]))
        } else {
          // a morel: a tall honeycombed cone of a cap
          cap = k(k(k(Manifold.sphere(R, 48)).scale([0.95, 0.95, 1.55])).translate([0, 0, capZ + R * 0.75]))
          const pits = []
          for (let i = 0; i < 70; i++) { const zf = -0.75 + (1.6 * i) / 70, a = i * Math.PI * (3 - Math.sqrt(5)), rr = Math.sqrt(Math.max(0, 1 - zf * zf)); pits.push(sph(R * 0.17, R * 0.95 * rr * Math.cos(a), R * 0.95 * rr * Math.sin(a), capZ + R * 0.75 + R * 1.55 * zf, 10)) }
          cap = k(cap.subtract(k(Manifold.union(pits))))
          body = k(Manifold.union([stem, base, cap]))
        }
        Lr = 0
        L = body.boundingBox().max[2] - 0.5 // the eye boss sits right on top of the cap
      } else {
        // poi heads: a round button cap with gills under it, or a warty puffball
        Lr = 2 * R
        if (kind === 'button') {
          let cap = k(k(k(Manifold.sphere(R, 64)).scale([1, 1, 0.75])).translate([0, 0, Lr * 0.55]))
          const under = k(k(Manifold.cylinder(R * 0.55, R * 0.92, R * 0.5, 64)).translate([0, 0, Lr * 0.55 - R * 0.55]))
          const gills = []
          for (let i = 0; i < 36; i++) gills.push(k(k(k(Manifold.cube([R * 0.5, 1.4, R * 0.5], true)).translate([R * 0.62, 0, Lr * 0.55 - R * 0.28])).rotate([0, 0, (360 * i) / 36])))
          const stem = k(k(Manifold.cylinder(Lr * 0.3, R * 0.32, R * 0.4, 48)).translate([0, 0, Lr * 0.12]))
          body = k(Manifold.union([cap, under, k(Manifold.union(gills)).intersect(k(k(Manifold.sphere(R, 48)).translate([0, 0, Lr * 0.55]))), stem, sph(R * 0.4, 0, 0, Lr * 0.12, 32)]))
        } else {
          body = sph(R, 0, 0, Lr / 2, 64)
          const warts = []
          for (let i = 0; i < 90; i++) { const zf = 1 - (2 * (i + 0.5)) / 90, a = i * Math.PI * (3 - Math.sqrt(5)), rr = Math.sqrt(1 - zf * zf), d = R * 0.98; warts.push(k(k(k(Manifold.cylinder(R * 0.12, R * 0.08, 0.6, 6)).rotate([0, (Math.acos(zf) * 180) / Math.PI, (a * 180) / Math.PI])).translate([d * rr * Math.cos(a), d * rr * Math.sin(a), Lr / 2 + d * zf]))) }
          body = k(body.add(k(Manifold.union(warts))))
        }
      }
      if (Lr) Lr = body.boundingBox().max[2] + 0.5 // round poi heads: the eye on top of the cap
      warns.push('Mushrooms have overhangs (the cap): print with tree supports touching the bed only, eye down.')
    } else if (style === 'gnome') {
      // a garden gnome: round belly, a flowing beard, a big nose, a pointy hat; the rope eye is the hat's tip
      const ell = (rx, ry, rz, x, z) => k(k(k(Manifold.sphere(1, 48)).scale([rx, ry, rz])).translate([x, 0, z]))
      const sph = (r, x, y, z) => k(k(Manifold.sphere(r, 32)).translate([x, y, z]))
      const belly = ell(R, R * 0.92, L * 0.3, 0, L * 0.3)
      const beard = k(Manifold.hull([ell(R * 0.42, R * 0.7, L * 0.12, R * 0.38, L * 0.5), sph(R * 0.16, R * 0.62, 0, L * 0.16)]))
      const head = sph(R * 0.52, 0, 0, L * 0.6)
      const nose = sph(R * 0.2, R * 0.5, 0, L * 0.6)
      const boots = [sph(R * 0.26, R * 0.3, R * 0.38, L * 0.07), sph(R * 0.26, R * 0.3, -R * 0.38, L * 0.07)]
      const hz = L * 0.6 + R * 0.3 // the brim sits above the eyes
      const hat = k(k(Manifold.cylinder(L - hz, R * 0.74, bossR * 0.75, 64)).translate([0, 0, hz]))
      const brim = k(k(k(k(CrossSection.circle(R * 0.09, 16)).translate([R * 0.72, 0])).revolve(64)).translate([0, 0, hz + R * 0.04]))
      // little eyes under the hat brim
      const eyes = [1, -1].map((side) => {
        const u = [0.8, 0.42 * side, 0.22], l = Math.hypot(...u)
        return sph(R * 0.08, (R * 0.52 * u[0]) / l, (R * 0.52 * u[1]) / l, L * 0.6 + (R * 0.52 * u[2]) / l)
      })
      body = k(k(Manifold.union([belly, beard, head, nose, ...boots, hat, brim])).subtract(k(Manifold.union(eyes))))
      warns.push('The gnome has overhangs (beard, nose, belly): print it with tree supports, eye down.')
    } else if (turned) {
      prof = profile(style, L, R)
      const poly = [[0, 0], ...prof.filter(([r]) => r > 0), [0, L]]
      body = k(k(new CrossSection([poly], 'Positive')).revolve(96))
    } else if (style === 'prism') {
      // a faceted bipyramid: 8 flat faces down to the tip, 8 up to the eye, a flat band between
      const pts = []
      const ring = (r, z, n = 8, off = 0) => { for (let i = 0; i < n; i++) pts.push([r * Math.cos((TAU * i) / n + off), r * Math.sin((TAU * i) / n + off), z]) }
      ring(3, 0); ring(R, L * 0.6); ring(R, L * 0.68); ring(bossR + 1, L, 8)
      body = k(Manifold.hull(pts.map((q) => k(k(Manifold.sphere(0.8, 6)).translate(q)))))
    } else {
      // twist: a six-point star, twisted as it narrows to the tip and to the eye
      const star = []
      for (let i = 0; i < 12; i++) { const r = i % 2 ? R * 0.62 : R; star.push([r * Math.cos((TAU * i) / 12), r * Math.sin((TAU * i) / 12)]) }
      const sec = k(k(new CrossSection([star], 'Positive')).offset(-1.5, 'Round', 2, 12))
      const sec2 = k(sec.offset(1.5, 'Round', 2, 12))
      const lower = k(k(k(sec2.extrude(L * 0.62, 24, 90, [0.12, 0.12])).mirror([0, 0, 1])).translate([0, 0, L * 0.62]))
      const upper = k(k(sec2.extrude(L * 0.38, 16, -60, [(bossR + 1) / R, (bossR + 1) / R])).translate([0, 0, L * 0.62]))
      body = k(lower.add(upper))
    }
    // the eye: a round boss with a cross hole, the hole's edges rounded off
    if (Lr) L = Lr - 1 // the eye sits on the top of the ball (or the acorn's cup)
    const boss = k(k(Manifold.cylinder(bossH, bossR, bossR * 0.92, 48)).translate([0, 0, L - 2]))
    const top = k(k(Manifold.sphere(bossR * 0.92, 48)).translate([0, 0, L - 2 + bossH - bossR * 0.92 * 0.5]))
    let m = k(Manifold.union([body, boss]))
    m = k(m.add(k(top.intersect(k(k(Manifold.cylinder(bossR * 2, bossR * 2, bossR * 2, 16)).translate([0, 0, L - 2]))))))
    const eyeZ = L - 2 + bossH / 2 + 1
    const hole = k(k(k(Manifold.cylinder(4 * bossR, eyeR, eyeR, 32)).rotate([90, 0, 0])).translate([0, 2 * bossR, eyeZ]))
    const flare = k(k(k(Manifold.cylinder(2.2, eyeR + 1.4, eyeR, 32)).rotate([90, 0, 0])).translate([0, bossR + 0.6, eyeZ]))
    const flare2 = k(k(k(Manifold.cylinder(2.2, eyeR, eyeR + 1.4, 32)).rotate([90, 0, 0])).translate([0, -bossR + 1.6, eyeZ]))
    if ((p.attach || 'eye').startsWith('swivel')) {
      // no eye: a flat top with an M8 socket (tapped in metal; a hex nut trap in a print)
      m = k(m.subtract(k(k(Manifold.cube([4 * bossR, 4 * bossR, bossH + 4], true)).translate([0, 0, L - 2 + bossH / 2 + 4.5]))))
      const topZ = L + 2.5
      m = k(m.subtract(k(k(Manifold.cylinder(18, opts.cnc ? 3.4 : 4.3, opts.cnc ? 3.4 : 4.3, 24)).translate([0, 0, topZ - 17]))))
      if (!opts.cnc) m = k(m.subtract(k(k(Manifold.cylinder(6.6, 13.2 / Math.sqrt(3), 13.2 / Math.sqrt(3), 6)).translate([0, 0, topZ - 14]))))
    } else m = k(m.subtract(k(Manifold.union([hole, flare, flare2]))))
    m = k(m.trimByPlane([0, 0, 1], 0))

    let plug = null
    if (style === 'glow') {
      // an LED capsule slides in from the tip; a TPU plug closes it
      const cd = (p.capD || 21) + 0.6, cl = (p.capL || 88) + 1
      if (cd / 2 + 1.6 > R) warns.push(`A Ø${p.capD || 21} capsule needs the dart at least ${Math.ceil(cd + 3.2)} mm wide.`)
      if (cl + 6 > L) warns.push(`A ${p.capL || 88} mm capsule needs the dart about ${Math.ceil(cl + 6 + bossH)} mm long.`)
      const pocket = k(k(Manifold.cylinder(cl, cd / 2, cd / 2, 48)).translate([0, 0, 4]))
      const mouth = k(k(Manifold.cylinder(4.01, cd / 2 - 1, cd / 2 - 1, 48)).translate([0, 0, -0.01]))
      m = k(m.subtract(k(pocket.add(mouth))))
      plug = k(k(Manifold.cylinder(4, cd / 2 - 1.1, cd / 2 - 1.1, 48)).add(k(k(Manifold.cylinder(1.2, cd / 2 - 0.4, cd / 2 - 0.4, 48)).translate([0, 0, 4]))))
    }

    const density = opts.density || 1.21
    const g = (m.volume() / 1000) * density
    const vol = m.volume()
    const H = m.boundingBox().max[2]
    // print it eye-down: flip so the boss sits on the bed
    const flat = k(k(m.rotate([180, 0, 0])).translate([0, 0, H]))
    const meshes = { combined: meshData(k(m.translate([0, 0, -H / 2]))), printFlat: meshData(flat) }
    if (plug) meshes.plugFlat = meshData(plug)
    const circle = []
    for (let i = 0; i < 48; i++) circle.push([R * Math.cos((TAU * i) / 48), R * Math.sin((TAU * i) / 48)])
    // lathe profile: the full side outline (both halves) for the drawing and the DXF
    let side = null
    if (prof) {
      const right = prof.map(([r, z]) => [r, z])
      const left = [...prof].reverse().map(([r, z]) => [-r, z])
      side = [[...right, [bossR, L - 2], [bossR * 0.92, L - 2 + bossH], [-bossR * 0.92, L - 2 + bossH], [-bossR, L - 2], ...left]]
    }
    return {
      dart: { style, turned, H, vol, R, bossR, eyeR, eyeZ, prof, side, L, plug: !!plug },
      meshes,
      viewR: Math.min(59, H * 0.55),
      polygons: { base: [circle], relief: [], pods: [], weak: [] },
      layers: side ? { cut: side, holes: [], drill: [], pocket: [], pocketDepth: 0, engrave: [] } : null,
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: g, gramsTotal: g, warns, height: H },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

/** A lathe drawing: the side profile at 1:1 with a table of diameters every 10 mm. */
export function dartDrawingSVG(hub, p, matName, name) {
  const d = hub.dart
  if (!d.side) return null
  const H = d.H, W = Math.max(120, 2 * d.R + 120), pad = 20
  const path = 'M' + d.side[0].map(([x, z]) => `${(x + W / 2).toFixed(2)},${(H - z + pad).toFixed(2)}`).join('L') + 'Z'
  const rows = []
  for (let z = 0; z <= d.L; z += 10) {
    let r = 0
    for (let i = 1; i < d.prof.length; i++) if (d.prof[i][1] >= z) { const [r0, z0] = d.prof[i - 1], [r1, z1] = d.prof[i]; r = r0 + ((r1 - r0) * (z - z0)) / Math.max(1e-6, z1 - z0); break }
    rows.push(`<text x="${W + 10}" y="${pad + 14 + rows.length * 5.5}" font-size="4">z ${z.toFixed(0)} mm: Ø${(2 * r).toFixed(1)}</text>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W + 90}mm" height="${H + 2 * pad + 30}mm" viewBox="0 0 ${W + 90} ${H + 2 * pad + 30}">
<rect width="100%" height="100%" fill="#fff"/>
<g font-family="Helvetica,Arial,sans-serif">
<text x="6" y="10" font-size="6" font-weight="700">${name}: rope dart head, lathe profile, 1:1 (mm)</text>
<text x="6" y="16" font-size="4">${matName}. Overall ${H.toFixed(1)} mm long, Ø${(2 * d.R).toFixed(1)} widest. Tip at z = 0.</text>
<path d="${path}" fill="#eef1f5" stroke="#000" stroke-width="0.35"/>
<line x1="${W / 2}" y1="${pad - 5}" x2="${W / 2}" y2="${H + pad + 5}" stroke="#06c" stroke-width="0.2" stroke-dasharray="3 2"/>
<circle cx="${W / 2}" cy="${H - d.eyeZ + pad}" r="${d.eyeR}" fill="#fff" stroke="#c00" stroke-width="0.35"/>
<text x="${W + 10}" y="${pad + 6}" font-size="4.5" font-weight="700">Diameters</text>
${rows.join('\n')}
<text x="6" y="${H + 2 * pad + 12}" font-size="4">Eye: Ø${(2 * d.eyeR).toFixed(1)} cross hole at z ${d.eyeZ.toFixed(1)}, both ends chamfered/rounded 1.4 mm so the rope cannot fray. Break all edges.</text>
<text x="6" y="${H + 2 * pad + 18}" font-size="4">Turn on a lathe from bar Ø${Math.ceil(2 * d.R + 3)} mm; drill the eye on a mill or drill press.</text>
</g></svg>\n`
}

export function dartDesigns() {
  const d = (id, name, style, group, blurb, over = {}) => ({
    id, name, group, blurb, dart: true, style, added: '2026-11-20',
    params: DART_PARAMS.map((x) => ({ ...x, ...(over[x.key] !== undefined ? { value: over[x.key] } : {}) })),
    draw: () => {},
  })
  const ROUND = ['orb', 'geodesic', 'pod', 'cone-stone', 'shroom-button', 'shroom-puff']
  const p = (id, name, style, blurb, over) => {
    const x = { ...d(id, name, style, 'Poi', blurb, over), poi: true }
    x.params = x.params.filter((q) => !(q.key === 'length' && ROUND.includes(style))).map((q) => q.key === 'ropeD' ? { ...q, label: 'Leash cord', hint: 'The eye fits this cord with a millimetre to spare; clip a swivel through it.' } : q)
    return x
  }
  return [
    d('dartClassic', 'Classic Dart', 'classic', 'DartClassic', 'The traditional rope dart: a long cone with a blunt tip, a rounded shoulder and an eye for the rope. Turn it in brass or steel on a lathe, or print it in TPU to practise.'),
    d('dartBell', 'Meteor Bell', 'bell', 'DartClassic', 'A round, bell-shaped weight with its mass low and two rings under the eye: the meteor-hammer feel, smooth to wrap and unwrap.', { length: 95, maxD: 42 }),
    d('dartWillow', 'Willow Leaf', 'willow', 'DartClassic', 'A long, slim willow-leaf spindle, drawn out at both ends: fast through the air and easy to catch.', { length: 140, maxD: 28 }),
    d('dartGlow', 'Glow Drop', 'glow', 'DartModern', 'A teardrop in clear TPU with an LED capsule inside: slide the capsule in from the tip and press the plug in. Lights your whole rope dart.', { length: 140, maxD: 32 }),
    d('dartPrism', 'Prism', 'prism', 'DartModern', 'A faceted crystal: eight flat faces down to the tip and eight up to the eye. Flashes as it spins. Print it, or have it milled or metal-printed.', { length: 105, maxD: 36 }),
    d('dartOrb', 'Orb', 'orb', 'DartRound', 'A plain, perfect ball on the rope: rolls off the body smoothly and is the easiest to catch. Size it with Widest.', { maxD: 46 }),
    d('dartSaturn', 'Saturn', 'saturn', 'DartRound', 'A ball with a ring round it, tilted a little like the planet: the ring flashes in a wobble as it spins.', { maxD: 42 }),
    d('dartPod', 'Seed Pod', 'pod', 'DartRound', 'A long oval with eight deep grooves, like a seed pod or a hop flower: grippy to catch, and the grooves stripe the light as it turns.', { maxD: 38 }),
    d('dartScales', 'Dragon Scales', 'scales', 'DartPattern', 'A teardrop covered in hundreds of raised scales laid out on a golden-angle spiral, the way scales and seeds grow: dense, tactile, catches every bit of light.', { length: 125, maxD: 38 }),
    d('dartFibonacci', 'Fibonacci', 'fibonacci', 'DartPattern', 'Four hundred little dimples spiralling round a teardrop on the golden angle: look at it and the spirals run both ways at once.', { length: 125, maxD: 38 }),
    d('dartGeo', 'Geodesic Orb', 'geodesic', 'DartPattern', 'A ball wrapped in a fine raised geodesic web, hundreds of tiny triangles: a little planet on a rope. Print it fine (0.12 mm layers) to get every line.', { maxD: 48 }),
    d('dartLeaf', 'Leaf Bud', 'leaf', 'DartNature', 'A teardrop bud wrapped in rows of pointed leaves, each with a raised midrib, laid along its curve like a closed spring bud. Soft in TPU, and it catches the light leaf by leaf.', { length: 120, maxD: 38 }),
    d('dartAcorn', 'Acorn', 'acorn', 'DartNature', 'An acorn: a smooth nut with a scaly cup on top, and the rope eye is its stem. Size it with Widest.', { maxD: 40 }),
    d('dartGnome', 'Garden Gnome', 'gnome', 'DartNature', 'A garden gnome on a rope: round belly, flowing beard, big nose, little boots, and a pointy hat whose tip is the rope eye. Print in TPU with tree supports.', { length: 120, maxD: 42 }),
    ...[
      ['dartPine', 'Pine Cone', 'cone-pine', 'A pine cone on a rope: a fat cone hanging from the eye by its stem, covered in scales on the golden-angle spirals real cones grow. Soft and grippy in TPU.', { length: 120, maxD: 40, scales: 120, open: 0.3 }],
      ['dartPineOpen', 'Open Pine Cone', 'cone-pine', 'A dry, open pine cone: the scale ends stand right out. Lots of grip to catch, and it throws the light about as it spins.', { length: 115, maxD: 44, scales: 90, open: 0.9 }],
      ['dartEnt', 'Ent', 'ent', 'A walking tree on a rope: a gnarled, twisting bark trunk, roots for feet at the tip, two branch arms, a deep-set face with a knotted nose, and a leafy crown with the rope eye in it. Print in TPU with tree supports.', { length: 130, maxD: 40 }],
      ['dartAmanita', 'Toadstool', 'shroom-amanita', 'A red-and-white fairy-tale toadstool on a rope: a domed cap covered in raised white spots, a frilly skirt round the stem, and a swollen base for the tip. The rope eye is on top of the cap. Print the cap red and the spots white.', { length: 120, maxD: 46 }],
      ['dartMorel', 'Morel', 'shroom-morel', 'A morel mushroom: a tall, honeycombed cap full of pits on a short, fat stem. Lovely in the hand, and the pits grab the light.', { length: 125, maxD: 36 }],
      ['dartFir', 'Fir Cone', 'cone-fir', 'A long, slim fir cone with fine, tight scales: fast through the air and easy on the hands.', { length: 140, maxD: 30, scales: 170, open: 0.15 }],
      ['dartPineCartoon', 'Happy Pine Cone', 'cone-cartoon', 'A cartoon pine cone: short and fat, big chunky scales, two big round eyes and a cheeky smile. Print the eyes white with a colour change, or paint the pupils.', { length: 110, maxD: 48, scales: 46, open: 0.55 }],
      ['dartStonePine', 'Stone Pine', 'cone-stone', 'A round stone-pine cone: a ball of chunky scales that rolls off the body. Size it with Widest.', { maxD: 44, scales: 110, open: 0.35 }],
    ].map(([id, name, st, blurb, o]) => { const x = d(id, name, st, 'DartPine', blurb, o); x.params = [...x.params.filter((q) => !(q.key === 'length' && st === 'cone-stone')), ...CONE_PARAMS.map((q) => ({ ...q, value: o[q.key] ?? q.value }))]; return x }),
    d('dartTwist', 'Twist', 'twist', 'DartModern', 'A six-pointed star twisted down to the tip: it looks like it is spinning even when it hangs still.', { length: 120, maxD: 34 }),
    // poi heads: the same shapes, sized for poi, with the eye for the leash swivel
    p('poiBall', 'Poi Ball', 'orb', 'A plain round poi head: rolls off the arms smoothly, the classic contact-poi feel. Print in TPU 95A at 100% for weight; clip the leash swivel through the eye.', { maxD: 70, ropeD: 5 }),
    p('poiGeo', 'Geo Poi', 'geodesic', 'A poi head wrapped in a fine geodesic web: catches the light on every turn. Print fine (0.12 mm layers).', { maxD: 66, ropeD: 5 }),
    p('poiPod', 'Seed Poi', 'pod', 'A long grooved seed-pod poi head: the grooves stripe the light as it spins, and it sits nicely in the hand.', { maxD: 50, ropeD: 5 }),
    p('poiScales', 'Dragon Scale Poi', 'scales', 'A teardrop poi head covered in raised dragon scales on a golden-angle spiral.', { length: 95, maxD: 56, ropeD: 5 }),
    ...[
      ['poiPine', 'Pine Cone Poi', 'cone-pine', 'A pine cone poi head hanging from the leash by its stem: golden-angle scales all over, soft in TPU. Make a pair.', { length: 105, maxD: 56, ropeD: 5, scales: 120, open: 0.3 }],
      ['poiShroom', 'Button Mushroom Poi', 'shroom-button', 'A round button-mushroom poi head: a smooth domed cap, fine gills underneath and a short stem. The leash clips to the top of the cap.', { maxD: 64, ropeD: 5 }],
      ['poiPuffball', 'Puffball Poi', 'shroom-puff', 'A puffball poi: a round ball covered in tiny soft warts, just like the ones that puff spores when you squeeze them. Grippy for contact.', { maxD: 62, ropeD: 5 }],
      ['poiStonePine', 'Stone Pine Poi', 'cone-stone', 'A round stone-pine poi head of chunky scales: rolls off the arms, and the scales give the light something to play on.', { maxD: 64, ropeD: 5, scales: 120, open: 0.35 }],
    ].map(([id, name, st, blurb, o]) => { const x = p(id, name, st, blurb, o); x.params = [...x.params, ...CONE_PARAMS.map((q) => ({ ...q, value: o[q.key] ?? q.value }))]; return x }),
    p('poiGlow', 'Glow Poi', 'glow', 'A clear TPU teardrop that holds an LED capsule: slide it in from the tip and press the plug in. Glow poi you can print.', { length: 130, maxD: 36, ropeD: 5 }),
  ]
}
