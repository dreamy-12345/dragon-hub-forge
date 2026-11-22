/**
 * Fun contact staff ends: shapes that push onto the end of the staff instead
 * of a ball. One TPU part each, printed standing on its socket (socket down),
 * with crush ribs inside the socket. Every edge is rounded: they hit bodies.
 * Units mm, the pole runs along z, the socket opens at z = 0.
 */

export const NOVELTY_PARAMS = [
  { key: 'size', label: 'Size', unit: '%', min: 60, max: 150, step: 1, value: 100 },
  { key: 'depth', label: 'Socket depth', unit: 'mm', min: 20, max: 60, step: 1, value: 35, hint: 'How far the pole goes in.' },
  { key: 'balance', label: 'Balance', options: ['steel shot low down', 'as printed'], value: 'steel shot low down', hint: 'Steel shot low down: the top is hollow and there are sealed chambers near the pole tip. Pause the print where it says, pour steel shot into the chambers, and carry on. The weight then sits on the pole tip instead of out at the end, so it rolls and spins true. (Mace, heart and cheeky.)' },
]

const RIB = 0.55
const SHOT = 4.6 // steel shot, packed, g/cm³

// battle axes: a counterweight for the other end of the staff, small and dense
export const AXE_PARAMS = [
  { key: 'size', label: 'Size', unit: '%', min: 60, max: 150, step: 1, value: 100 },
  { key: 'depth', label: 'Socket depth', unit: 'mm', min: 20, max: 60, step: 1, value: 35, hint: 'How far the pole goes in.' },
  { key: 'counter', label: 'Other end', options: ['matched counterweight', 'matched ball', 'none'], value: 'matched counterweight', hint: 'An axe head on one end makes the staff end-heavy. Put a matched end on the other: the compact counterweight (small, packed with steel shot) or a contact ball (rolls on the body, also weighted with shot). Either weighs the same as the axe, so the staff balances in the middle.' },
  { key: 'counterD', label: 'Counterweight / ball size', unit: 'mm', min: 0, max: 130, step: 1, value: 0, hint: '0 = as small as it can be while it still matches the weight. Bigger takes less shot.' },
]

/** A small, dense end that weighs `target` grams: a TPU cap with a steel-shot chamber round and above the socket. */
export function buildCounterweight(wasm, k, p, target, dens = 1.21) {
  const { Manifold } = wasm
  const boreR = (p.poleOD + p.fit) / 2, wall = 3
  const cyl = (h, r, z = 0, n = 64) => k(k(Manifold.cylinder(h, r, r, n)).translate([0, 0, z]))
  const make = (Rw, zc) => {
    // outside: a squat cylinder with a domed top; inside: one chamber round the socket and over it, a 45° roof
    const out = k(Manifold.hull([cyl(zc, Rw), k(k(Manifold.sphere(Rw * 0.62, 64)).translate([0, 0, zc + Rw * 0.12]))]))
    const ri = Rw - wall
    const roof = k(k(Manifold.cylinder(ri * 0.8, ri, ri * 0.2, 64)).translate([0, 0, zc - 0.01]))
    let ch = k(Manifold.union([cyl(zc - 2.4, ri, 2.4), roof]))
    ch = k(ch.subtract(k(Manifold.union([cyl(p.depth + 2.5, boreR + 2.6, -1)]))))
    let m = k(out.subtract(ch))
    let bore = cyl(p.depth + 1, boreR, -1)
    const ribs = []
    for (let i = 0; i < (p.ribs || 6); i++) ribs.push(k(k(k(Manifold.cube([RIB * 2, 2.2, p.depth + 2], true)).translate([boreR, 0, p.depth / 2])).rotate([0, 0, (360 * i) / (p.ribs || 6)])))
    bore = k(bore.subtract(k(Manifold.union(ribs))))
    m = k(m.subtract(bore))
    const shotV = k(ch.intersect(cyl(zc - 2.4, ri + 1, 2.4))).volume() // the roof stays empty
    return { m, g: (m.volume() / 1000) * dens, shot: (shotV / 1000) * SHOT, zc, Rw }
  }
  let Rw = p.counterD > 0 ? p.counterD / 2 : boreR + 13
  const zMin = p.depth + 8
  let best = null
  for (let tries = 0; tries < 8 && !best; tries++) {
    const low = make(Rw, zMin)
    if (low.g + low.shot >= target) {
      // the smallest one already holds enough: fill it part way, by weight
      best = { ...low, shot: Math.max(0, target - low.g), part: true }
      break
    }
    const top = make(Rw, 160)
    if (top.g + top.shot < target && !(p.counterD > 0)) { Rw += 6; continue }
    let lo = zMin, hi = 160
    for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2, r = make(Rw, mid); if (r.g + r.shot < target) lo = mid; else hi = mid }
    const r = make(Rw, hi)
    best = { ...r, shot: Math.max(0, target - r.g), part: false }
  }
  if (!best) { const r = make(Rw, 160); best = { ...r, part: false } }
  return { ...best, D: 2 * best.Rw, H: best.m.boundingBox().max[2], pauseAt: best.zc - 0.3, total: best.g + best.shot }
}

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

function centroid({ positions: P, indices: I }) {
  let V = 0, cx = 0, cy = 0, cz = 0
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, d = I[t + 2] * 3
    const v = (P[a] * (P[b + 1] * P[d + 2] - P[b + 2] * P[d + 1]) - P[a + 1] * (P[b] * P[d + 2] - P[b + 2] * P[d]) + P[a + 2] * (P[b] * P[d + 1] - P[b + 1] * P[d])) / 6
    V += v; cx += (v * (P[a] + P[b] + P[d])) / 4; cy += (v * (P[a + 1] + P[b + 1] + P[d + 1])) / 4; cz += (v * (P[a + 2] + P[b + 2] + P[d + 2])) / 4
  }
  return { V, x: cx / V, y: cy / V, z: cz / V }
}

/** A contact ball for the other end that weighs `target` grams: TPU shell, steel shot in a chamber with a 45° roof. */
export function buildCounterBall(wasm, k, p, target, dens = 1.21) {
  const { Manifold } = wasm
  const boreR = (p.poleOD + p.fit) / 2, wall = 3.2
  const make = (Rb) => {
    const c = [0, 0, Rb]
    const out = k(k(Manifold.sphere(Rb, 96)).translate(c))
    const ri = Rb - wall
    // the chamber: the inner sphere below the middle, a 45° cone above it (prints closed with no supports)
    const below = k(k(Manifold.cube([4 * Rb, 4 * Rb, Rb], false)).translate([-2 * Rb, -2 * Rb, 0]))
    const cone = k(k(Manifold.cylinder(ri, ri, 0.01, 64)).translate([0, 0, Rb]))
    let ch = k(k(k(Manifold.sphere(ri, 64)).translate(c)).intersect(k(below.add(cone))))
    ch = k(ch.subtract(k(Manifold.cylinder(p.depth + 2.5, boreR + 2.6, boreR + 2.6, 48))))
    let m = k(out.subtract(ch))
    // a flat foot round the socket so it prints standing up
    m = k(m.trimByPlane([0, 0, 1], 1.2))
    m = k(m.translate([0, 0, -1.2]))
    ch = k(ch.translate([0, 0, -1.2]))
    let bore = k(k(Manifold.cylinder(p.depth + 1, boreR, boreR, 64)).translate([0, 0, -1]))
    const ribs = []
    for (let i = 0; i < (p.ribs || 6); i++) ribs.push(k(k(k(Manifold.cube([RIB * 2, 2.2, p.depth + 2], true)).translate([boreR, 0, p.depth / 2])).rotate([0, 0, (360 * i) / (p.ribs || 6)])))
    bore = k(bore.subtract(k(Manifold.union(ribs))))
    m = k(m.subtract(bore))
    const shotV = k(ch.trimByPlane([0, 0, -1], -(Rb - 1.2))).volume() // shot fills the lower half; the cone stays empty
    return { m, g: (m.volume() / 1000) * dens, cap: (shotV / 1000) * SHOT, Rb, pauseAt: Rb - 1.2 - 0.3 }
  }
  const minR = Math.max(boreR + 20, (p.depth + 12) / 1.3)
  if (p.counterD > 0) {
    const r = make(Math.max(minR, p.counterD / 2))
    return { ...r, shot: Math.max(0, Math.min(r.cap, target - r.g)), D: 2 * r.Rb, H: r.m.boundingBox().max[2] }
  }
  let lo = minR, hi = 80
  const low = make(lo)
  if (low.g + low.cap >= target) return { ...low, shot: Math.max(0, target - low.g), D: 2 * lo, H: low.m.boundingBox().max[2] }
  for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2, r = make(mid); if (r.g + r.cap < target) lo = mid; else hi = mid }
  const r = make(hi)
  return { ...r, shot: Math.max(0, Math.min(r.cap, target - r.g)), D: 2 * hi, H: r.m.boundingBox().max[2] }
}

export function buildNovelty(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const s = p.size / 100
    const kind = opts.kind
    const boreR = (p.poleOD + p.fit) / 2
    const cR = boreR + 3.5 // socket collar
    const z0 = p.depth + 4 // the shape starts on top of the socket
    const sph = (r, x, y, z, n = 48) => k(k(Manifold.sphere(r, n)).translate([x, y, z]))
    const hull = (list) => k(Manifold.hull(list))
    // a flat outline drawn in (x, height), made T thick, standing up, edges rounded
    const plate = (polys, T, round = 2.5) => {
      let c = k(new CrossSection(polys, 'Positive'))
      c = k(k(c.offset(round, 'Round', 2, 16)).offset(-2 * round, 'Round', 2, 16))
      c = k(c.offset(round, 'Round', 2, 16))
      return k(k(k(c.extrude(T)).translate([0, 0, -T / 2])).rotate([90, 0, 0]))
    }
    const rect = (x0, z_0, x1, z1) => [[x0, z_0], [x1, z_0], [x1, z1], [x0, z1]]
    const parts = [k(Manifold.cylinder(z0 + 2, cR, cR, 64))]
    const chambers = [], hollows = [] // steel shot goes in the chambers; hollows stay empty
    let blurbName = kind
    let haft = null // a one-sided head moved over the pole gets a 45° neck down to the socket

    if (kind === 'trident') {
      const T = 14 * s, w = 12 * s
      const top = z0 + 40 * s, bar = top + 12 * s
      const polys = [rect(-w / 2, z0 - 4, w / 2, top + 2), rect(-36 * s, top, 36 * s, bar)]
      const sl = (p.spikeLen ?? 100) / 100, sm = (p.midLen ?? 100) / 100
      for (const [x, L] of [[-30 * s, 42 * s * sl], [0, 58 * s * sl * sm], [30 * s, 42 * s * sl]]) {
        const tipZ = bar + L
        polys.push(rect(x - 5 * s, bar - 1, x + 5 * s, tipZ - 14 * s))
        // a fat arrow head with blunt barbs
        polys.push([[x - 11 * s, tipZ - 20 * s], [x + 11 * s, tipZ - 20 * s], [x + 3 * s, tipZ], [x - 3 * s, tipZ]])
      }
      parts.push(plate(polys, T, 2.4))
    } else if (kind === 'heart') {
      // two lobes and a point, rounded, a little flattened front to back
      const r = 27 * s, lz = z0 + 58 * s
      const L = sph(r, -17 * s, 0, lz), R = sph(r, 17 * s, 0, lz), tip = sph(7 * s, 0, 0, z0 + 4 * s)
      let h = k(Manifold.union([hull([L, tip]), hull([R, tip])]))
      h = k(h.scale([1, 0.62, 1]))
      parts.push(h)
      // hollow lobes; a shot chamber down in the point, right on top of the pole
      hollows.push(k(k(Manifold.union([sph(r - 4, -17 * s, 0, lz, 32), sph(r - 4, 17 * s, 0, lz, 32)])).scale([1, 0.5, 1])))
      chambers.push(k(k(Manifold.cylinder(22 * s, 4 * s, 13 * s, 32)).translate([0, 0, z0 + 3])))
    } else if (kind === 'mace') {
      const r = 30 * s, cz = z0 + r - 2
      parts.push(sph(r, 0, 0, cz, 64))
      // the ball is hollow: a shot chamber in its lower half keeps the weight near the pole tip
      chambers.push(k(sph(r - 4, 0, 0, cz, 40).intersect(k(k(Manifold.cube([3 * r, 3 * r, r], true)).translate([0, 0, cz - r / 2 + 1])))))
      hollows.push(k(sph(r - 4, 0, 0, cz, 40).intersect(k(k(Manifold.cube([3 * r, 3 * r, r], true)).translate([0, 0, cz + r / 2 + 1])))))
      const g = (1 + Math.sqrt(5)) / 2
      const dirs = [[-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1]]
        .map((v) => { const l = Math.hypot(...v); return v.map((x) => x / l) })
      for (const d of dirs) {
        if (d[2] < -0.6) continue // nothing pointing into the socket
        const base = k(k(Manifold.cylinder(1, 9 * s, 9 * s, 24)).translate([0, 0, -0.5]))
        // a cone from inside the ball out, with a soft round tip
        const tipP = d.map((x) => x * (r + 18 * s))
        const baseP = d.map((x) => x * (r - 4))
        const ax = [d[0], d[1], d[2]]
        const pitch = (Math.acos(ax[2]) * 180) / Math.PI, yaw = (Math.atan2(ax[1], ax[0]) * 180) / Math.PI
        const disc = k(k(k(base.rotate([0, pitch, 0])).rotate([0, 0, yaw])).translate(baseP))
        parts.push(k(hull([disc, sph(3 * s, ...tipP, 16)]).translate([0, 0, cz])))
      }
    } else if (kind === 'axe') {
      const T = 13 * s, hw = 9 * s
      haft = { hw, T }
      const polys = [rect(-hw, z0 - 4, hw, z0 + 118 * s)]
      // a bearded blade: the lower edge climbs at 45° so it prints without supports
      const e = 58 * s
      const blade = [[hw - 1, z0 + 40 * s], [e, z0 + 40 * s + (e - hw)]]
      for (let i = 1; i <= 12; i++) { const a = -0.55 + (1.1 * i) / 12; blade.push([e + 10 * s * Math.cos(a * 1.4) - 10 * s, z0 + 98 * s + 40 * s * Math.sin(a)]) }
      blade.push([hw - 1, z0 + 112 * s])
      polys.push(blade)
      // a small back spike
      polys.push([[-hw + 1, z0 + 82 * s], [-30 * s, z0 + 100 * s], [-hw + 1, z0 + 104 * s]])
      parts.push(plate(polys, T, 3))
      // the blade edge is round and thick: it's TPU and it hits people
    } else if (['labrys', 'dane', 'halberd', 'moon', 'great'].includes(kind)) {
      // a blade is a crescent: its lower edge climbs from the haft at 45°, then the bit is an arc that
      // starts at -45° (so nothing on it overhangs) and runs up and back to the haft
      const T = 13 * s, hw = 9 * s
      haft = { hw, T }
      const blade = (side, E, rho, cz, thTop, back = 1) => {
        const cx = E - rho
        const at = (th) => [cx + rho * Math.cos(th), cz + rho * Math.sin(th)]
        const P1 = at(-Math.PI / 4)
        const pts = [[hw - 1, P1[1] - (P1[0] - (hw - 1))]]
        for (let i = 0; i <= 16; i++) pts.push(at(-Math.PI / 4 + ((thTop + Math.PI / 4) * i) / 16))
        const P2 = pts[pts.length - 1]
        pts.push([hw - 1, Math.max(P2[1] - 10 * s * back, pts[0][1] + 10)])
        return pts.map(([x, z]) => [side * x, z])
      }
      const polys = []
      const deg = Math.PI / 180
      const holes = []
      if (kind === 'labrys') {
        // the double axe: two crescents, one each side, and a rounded spike on top
        const cz = z0 + 82 * s
        polys.push(rect(-hw, z0 - 4, hw, z0 + 120 * s), blade(1, 54 * s, 34 * s, cz, 55 * deg), blade(-1, 54 * s, 34 * s, cz, 55 * deg))
        polys.push([[-hw, z0 + 118 * s], [hw, z0 + 118 * s], [3 * s, z0 + 140 * s], [-3 * s, z0 + 140 * s]])
      } else if (kind === 'great') {
        // the great axe: two big bearded crescents on a long haft, a spike on top and a langet down the haft
        const cz = z0 + 120 * s
        polys.push(rect(-hw, z0 - 4, hw, z0 + 168 * s), blade(1, 78 * s, 52 * s, cz, 58 * deg, 1.3), blade(-1, 78 * s, 52 * s, cz, 58 * deg, 1.3))
        polys.push([[-hw, z0 + 166 * s], [hw, z0 + 166 * s], [4 * s, z0 + 196 * s], [-4 * s, z0 + 196 * s]])
        polys.push(rect(-hw - 3 * s, z0 + 30 * s, hw + 3 * s, z0 + 60 * s)) // a thicker band where the head meets the haft
      } else if (kind === 'dane') {
        // the long-bearded war axe: one wide crescent, the beard sweeping down the haft
        polys.push(rect(-hw, z0 - 4, hw, z0 + 132 * s), blade(1, 72 * s, 52 * s, z0 + 100 * s, 50 * deg, 1.6))
        polys.push([[-hw, z0 + 130 * s], [hw, z0 + 130 * s], [hw - 3 * s, z0 + 138 * s], [-hw + 3 * s, z0 + 138 * s]])
      } else if (kind === 'halberd') {
        // axe blade, a hooked beak behind it, and a blunt spear point on top
        polys.push(rect(-hw, z0 - 4, hw, z0 + 122 * s), blade(1, 50 * s, 30 * s, z0 + 82 * s, 55 * deg))
        const bz = z0 + 70 * s, bx = 40 * s
        polys.push([[-hw + 1, bz], [-bx, bz + (bx - hw + 1)], [-bx + 4 * s, bz + (bx - hw + 1) + 6 * s], [-hw + 1, bz + 30 * s]])
        polys.push([[-hw, z0 + 120 * s], [hw, z0 + 120 * s], [4 * s, z0 + 162 * s], [-4 * s, z0 + 162 * s]])
      } else {
        // the moon axe: a big crescent with two diamond windows (diamonds print without supports)
        const cz = z0 + 92 * s
        polys.push(rect(-hw, z0 - 4, hw, z0 + 124 * s), blade(1, 66 * s, 46 * s, cz, 62 * deg, 1.2))
        polys.push([[-hw + 1, z0 + 86 * s], [-28 * s, z0 + 86 * s + (28 * s - hw + 1)], [-hw + 1, z0 + 112 * s]])
        for (const [x, z, r] of [[34 * s, cz - 6 * s, 9 * s], [42 * s, cz + 20 * s, 7 * s]]) holes.push([[x, z - r], [x + r, z], [x, z + r], [x - r, z]])
      }
      let plateM = plate(polys, T, 3)
      if (holes.length) {
        const hole = k(k(k(k(new CrossSection(holes, 'Positive')).offset(-1.5, 'Round', 2, 12)).extrude(T + 4)).translate([0, 0, -T / 2 - 2])).rotate([90, 0, 0])
        plateM = k(plateM.subtract(k(hole)))
      }
      parts.push(plateM)
    } else if (kind === 'cheeky') {
      const r = 16 * s
      const shaftTop = z0 + 70 * s
      parts.push(k(Manifold.cylinder(shaftTop, Math.max(r, cR + 1.5), r, 64)))
      parts.push(k(k(sph(r * 1.12, 0, 0, 0, 48).scale([1, 1, 1.25])).translate([0, 0, shaftTop + 4 * s])))
      parts.push(k(k(k(k(CrossSection.circle(2.6 * s, 16)).translate([r * 1.05, 0])).revolve(64)).translate([0, 0, shaftTop - 2 * s])))
      const br = 17 * s
      for (const x of [-1, 1]) parts.push(sph(br, x * (r + br * 0.55), 0, br, 40))
      blurbName = 'cheeky'
      // hollow shaft and head, shot chambers in the balls: weight down on the pole tip, even both sides
      chambers.push(...[-1, 1].map((x) => sph(br - 3.2, x * (r + br * 0.55), 0, br, 32)))
      hollows.push(k(k(Manifold.cylinder(shaftTop - z0 - 4, r - 3.2, r - 3.2, 48)).translate([0, 0, z0 + 4])), k(k(sph((r * 1.12 - 3.2), 0, 0, 0, 32).scale([1, 1, 1.25])).translate([0, 0, shaftTop + 4 * s])))
    }

    // centre the shape's weight over the pole (an axe blade is one-sided): move the shape, not the socket.
    // A big move would leave the haft hanging off the socket, so a neck climbs from the socket to the
    // moved haft at 45° (prints with no supports); a few passes settle the centre with the neck in it.
    {
      const base = parts.slice(1)
      let sh = [0, 0, 0], neck = null
      for (let pass = 0; pass < 4; pass++) {
        const moved = base.map((q) => k(q.translate(sh)))
        const d = Math.hypot(sh[0], sh[1])
        neck = null
        if (haft && d > 1) {
          const slab = k(k(Manifold.cube([2 * haft.hw - 2, haft.T - 2, 6], true)).translate([sh[0], sh[1], z0 - 1 + d]))
          neck = k(Manifold.hull([k(k(Manifold.cylinder(6, cR, cR, 64)).translate([0, 0, z0 - 4])), slab]))
        }
        const c = centroid(meshData(k(Manifold.union(neck ? [...moved, neck] : moved))))
        if (Math.hypot(c.x, c.y) < 0.05) break
        sh = [sh[0] - c.x, sh[1] - c.y, 0]
      }
      for (let i = 1; i < parts.length; i++) parts[i] = k(parts[i].translate(sh))
      for (let i = 0; i < chambers.length; i++) chambers[i] = k(chambers[i].translate(sh))
      for (let i = 0; i < hollows.length; i++) hollows[i] = k(hollows[i].translate(sh))
      if (haft && Math.hypot(sh[0], sh[1]) > 1) {
        const d = Math.hypot(sh[0], sh[1])
        const slab = k(k(Manifold.cube([2 * haft.hw - 2, haft.T - 2, 6], true)).translate([sh[0], sh[1], z0 - 1 + d]))
        parts.push(k(Manifold.hull([k(k(Manifold.cylinder(6, cR, cR, 64)).translate([0, 0, z0 - 4])), slab])))
      }
    }
    let m = k(Manifold.union(parts))
    const shot = p.balance !== 'as printed' && chambers.length
    let chamber = null, pauseAt = 0
    if (shot) {
      chamber = k(Manifold.union(chambers))
      m = k(m.subtract(k(Manifold.union([chamber, ...hollows]))))
      pauseAt = chamber.boundingBox().max[2] - 0.3
    }
    // anything under the bed goes (the balls on the cheeky one, the heart tip)
    m = k(m.trimByPlane([0, 0, 1], 0))
    // socket with crush ribs
    let bore = k(k(Manifold.cylinder(p.depth + 1, boreR, boreR, 64)).translate([0, 0, -1]))
    const ribs = []
    for (let i = 0; i < (p.ribs || 6); i++) ribs.push(k(k(k(Manifold.cube([RIB * 2, 2.2, p.depth + 2], true)).translate([boreR, 0, p.depth / 2])).rotate([0, 0, (360 * i) / (p.ribs || 6)])))
    bore = k(bore.subtract(k(Manifold.union(ribs))))
    m = k(m.subtract(bore))
    // the view: the pole runs up into it from below
    const box = m.boundingBox()
    const dens = opts.density || 1.21
    const g = (m.volume() / 1000) * dens
    // balance: centre of mass of the print plus any steel shot, against the pole axis and the pole tip
    const cm = centroid
    const body = cm(meshData(m))
    const shotC = chamber ? cm(meshData(chamber)) : null
    const gShot = shotC ? (shotC.V / 1000) * 4.6 : 0
    const tot = g + gShot
    const com = shotC ? ['x', 'y', 'z'].map((q) => (body[q] * g + shotC[q] * gShot) / tot) : [body.x, body.y, body.z]
    const meshes = { combined: meshData(m) }
    const R = Math.max(...box.max.map(Math.abs), ...box.min.map(Math.abs))
    // the matched counterweight for the other end of the staff
    let counter = null
    if (opts.axe && p.counter !== 'none') {
      const isBall = p.counter === 'matched ball'
      const c = isBall ? buildCounterBall(wasm, k, p, tot, dens) : buildCounterweight(wasm, k, p, tot, dens)
      counter = { ball: isBall, D: c.D, H: c.H, g: c.g, shot: c.shot, total: c.g + c.shot, pauseAt: c.pauseAt, short: c.g + c.shot < tot - 2, heavy: c.g > tot + 2 }
      meshes.counterFlat = meshData(c.m)
      meshes.practice = meshData(k(c.m.translate([box.min[0] - c.D / 2 - 40, 0, 0])))
    }
    return {
      novelty: { counter, axe: !!opts.axe, kind: blurbName, height: box.max[2], width: box.max[0] - box.min[0], squeeze: p.poleOD - 2 * (boreR - RIB) },
      meshes,
      viewR: Math.max(140, R * 1.05),
      polygons: { base: [k(CrossSection.circle(Math.max(box.max[0], box.max[1]), 64)).toPolygons()[0]], relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: g, gramsTotal: tot, gShot, pauseAt, comOff: Math.hypot(com[0], com[1]), comAbove: com[2] - p.depth, comPrinted: body.z - p.depth, warns: [], height: box.max[2] },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function noveltyDesigns() {
  const d = (id, name, kind, blurb) => ({
    id, name, group: 'Contact', blurb, novelty: true, kind, added: '2026-11-20',
    params: NOVELTY_PARAMS.map((x) => ({ ...x })),
    draw: () => {},
  })
  const a = (id, name, kind, blurb) => ({ ...d(id, name, kind, blurb), group: 'Axes', axe: true, params: AXE_PARAMS.map((x) => ({ ...x })) })
  return [
    { ...d('endTrident', 'Trident End', 'trident', 'A sea-god trident for the end of your contact staff: three prongs with fat, blunt barbs, all edges rounded. Make the spikes as long as you like. Prints standing on its socket in TPU.'), params: [...NOVELTY_PARAMS.map((x) => ({ ...x })), { key: 'spikeLen', label: 'Spike length', unit: '%', min: 60, max: 300, step: 5, value: 100, hint: 'All three prongs. 100% is the standard; 200% doubles them.' }, { key: 'midLen', label: 'Middle spike', unit: '%', min: 70, max: 200, step: 5, value: 100, hint: 'The middle prong compared with the outer two.' }] },
    d('endHeart', 'Big Heart End', 'heart', 'A big chunky heart on the end of the staff. Soft TPU, prints standing on its point, no supports.'),
    d('endMace', 'Mace End', 'mace', 'A medieval mace head with soft, round-tipped spikes: looks fierce, bounces off you in TPU.'),
    { ...d('endAxe', 'Axe End', 'axe', 'A bearded battle-axe head with a back spike. The blade is thick and round-edged (it is a toy), and its lower edge climbs at 45° so it prints without supports. Comes with a matched counterweight for the other end.'), group: 'Axes', axe: true, params: [...NOVELTY_PARAMS.map((x) => ({ ...x })), ...AXE_PARAMS.slice(2).map((x) => ({ ...x }))] },
    { ...a('endGreat', 'Great Axe End', 'great', 'A big double-bitted great axe for a contact staff: two bearded crescent blades, a spike on top, a long haft. Comes with a matched contact ball for the other end, weighted with steel shot so the staff balances in the middle.'), params: AXE_PARAMS.map((x) => ({ ...x, ...(x.key === 'counter' ? { value: 'matched ball' } : {}) })) },
    a('endLabrys', 'Double Axe End', 'labrys', 'A double-bitted battle axe: two crescent blades, one each side, and a rounded spike on top. Balanced side to side by its shape. Comes with a matched counterweight for the other end.'),
    a('endDane', 'War Axe End', 'dane', 'A long-bearded war axe: one wide crescent blade whose beard sweeps down the haft. The forge centres its weight over the pole and makes a matched counterweight for the other end.'),
    a('endHalberd', 'Halberd End', 'halberd', 'A halberd head: an axe blade, a hooked beak behind it, and a blunt spear point on top. All edges round and thick: it is TPU. Matched counterweight for the other end.'),
    a('endMoon', 'Moon Axe End', 'moon', 'A big crescent moon blade with two diamond windows and a back spike. The windows print without supports. Matched counterweight for the other end.'),
    d('endCheeky', 'Cheeky End', 'cheeky', 'For the cheeky ones: an unmistakable rude shape for the end of your contact staff, all soft rounded TPU. Adult humour.'),
  ]
}
