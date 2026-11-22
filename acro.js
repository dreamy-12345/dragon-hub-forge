/**
 * Acro staff ends: the weighted ends of a contact or acro staff. They roll over
 * the body, sit in the hand, stand on a finger or the floor, so the shape is all
 * smooth curves, and every size is set in the forge: pole, circumference, length,
 * profile, tip, faces, twist, grip rings, coin and weight.
 *
 * Why a coin: a pole is a thin-walled tube, and its end is a ring that cuts into
 * soft TPU or silicone, a little more with every drop. A hard disc at the bottom of
 * the socket, at least as wide as the pole, takes the ring instead and spreads the
 * load over the whole end. A plug that fills the bore keeps the end centred and the
 * tube round, but the tube's edge still lands on rubber, so the coin is what stops
 * the cutting; the plug is an extra.
 *
 * Printed: TPU, standing on its mouth (the socket opens on the bed), every outside
 * slope at 45° or less, so nothing needs supports. Pause once to drop the coins in
 * and once to pour steel shot into the sealed chamber.
 * Metal: turned on a lathe, either a socket over the pole held by a grub screw, or
 * a plug-in end that expands inside the pole with an allen key and sits on the pole
 * end with a lip.
 * Units mm; z up from the mouth (z = 0) to the tip.
 */
import { TAU } from './geom.js'
import { coneScales, CONE_PARAMS } from './pinecone.js'

const SHOT = 4.6 // steel shot, g/cm³ poured
const COIN = 7.9 // a coin or steel washer, g/cm³ (weigh yours)

export const PROFILES = {
  dome: 'dome: round tip, straight sides',
  ball: 'ball: round all over',
  bell: 'bell: flat foot for standing balances',
  barrel: 'barrel: widest in the middle',
  taper: 'taper: wide at the pole, narrower tip',
  mushroom: 'mushroom: slim neck, big round cap',
  cylinder: 'cylinder: straight, rounded edge',
}
const profKey = (p) => Object.keys(PROFILES).find((k) => PROFILES[k] === p.profile) || 'dome'

const WEIGHTS = ['steel shot chamber (pause and pour)', 'coins only', 'none: solid TPU']
const SEATS = ['sleeve over the pole', 'sleeve and a plug inside the pole']

// ------------------------------------------------------------------ params --
export const ACRO_SHAPE_PARAMS = [
  { key: 'profile', label: 'Shape', options: Object.values(PROFILES), value: PROFILES.dome, hint: 'The side profile. Round tips roll over the body; a flat foot stands on a hand, a head or the floor for balances.' },
  { key: 'circ', label: 'Circumference', unit: 'mm', min: 80, max: 300, step: 1, value: 157, presets: [126, 141, 157, 176, 188], hint: 'Round the widest part, the way you would wrap a tape measure: 126 = Ø40, 157 = Ø50, 188 = Ø60. Bigger ends are easier on the body and sit flatter in the hand.' },
  { key: 'len', label: 'Length', unit: 'mm', min: 25, max: 160, step: 1, value: 64, hint: 'From the pole end to the tip, socket and all.' },
  { key: 'mouthWall', label: 'Wall at the pole', unit: 'mm', min: 2, max: 25, step: 0.5, value: 4, hint: 'How thick the end is round the pole where it opens. Thin blends smoothly into the pole; thick makes a step you can feel.' },
  { key: 'tipR', label: 'Tip rounding', unit: 'mm', min: 0, max: 60, step: 0.5, value: 22, hint: 'The radius from the side round onto the tip. Big = a dome; small = a crisp, flat-ish end. Ball shapes are round anyway.' },
  { key: 'tipFlat', label: 'Flat on the tip', unit: 'mm', min: 0, max: 80, step: 0.5, value: 0, hint: 'Diameter of a flat on the very end: 0 = fully round. A 20–30 mm flat lets the staff stand on its end.' },
  { key: 'sides', label: 'Faces round', unit: '', min: 0, max: 12, step: 1, value: 0, hint: '0 = round. 3 to 12 makes it faceted (6 = hex): it rolls in steps and does not run away when you put it down. Circumference stays what you set.' },
  { key: 'twist', label: 'Twist', unit: '°', min: 0, max: 180, step: 5, value: 0, hint: 'Twists the faces round the end from pole to tip. Only shows with faces.' },
  { key: 'ribs', label: 'Grip rings', unit: '', min: 0, max: 12, step: 1, value: 0, hint: 'Shallow rings round the side for grip. 0 = smooth (best for rolls).' },
  { key: 'ribDepth', label: 'Ring depth', unit: 'mm', min: 0.4, max: 3, step: 0.1, value: 1, showIf: (p) => p.ribs > 0 },
]

export const ACRO_POLE_PARAMS = [
  { key: 'poleOD', label: 'Pole outside', unit: 'mm', min: 10, max: 40, step: 0.1, value: 25.4, presets: [19, 22, 25.4, 28, 32], hint: 'Measure across the pole with calipers. Acro staffs are often 25 mm (1") aluminium or 22–28 mm.' },
  { key: 'poleWall', label: 'Pole wall', unit: 'mm', min: 0.5, max: 5, step: 0.05, value: 1.6, hint: 'Measure at a cut end. Sets the plug size, and the inside for a plug-in end.' },
  { key: 'grip', label: 'Socket depth', unit: 'mm', min: 15, max: 90, step: 1, value: 35, hint: 'How far the pole goes in. Deeper holds better and spreads a hit along more pole.' },
  { key: 'fit', label: 'Socket fit', unit: 'mm', min: -1.5, max: 0.8, step: 0.05, value: -0.3, hint: 'Socket = pole + this. TPU stretches: −0.3 pushes on firmly by hand and stays on. Print a short test first.' },
  { key: 'seat', label: 'On the pole', options: SEATS, value: SEATS[0], rerender: true, hint: 'Sleeve: the end goes over the pole. With a plug: a core also fills the inside of the pole, which keeps the end centred and the tube from going oval; use a washer instead of a coin.' },
]

export const ACRO_COIN_PARAMS = [
  { key: 'coin', label: 'Coin or washer at the bottom', options: ['yes', 'no'], value: 'yes', rerender: true, hint: 'A hard disc at the bottom of the socket stops the pole edge cutting into the end. It should be at least as wide as the pole.' },
  { key: 'coinD', label: 'Coin width', unit: 'mm', min: 10, max: 45, step: 0.1, value: 26, presets: [20, 22, 24, 26, 28, 30], showIf: (p) => p.coin === 'yes', hint: 'Measure your coin or washer with calipers. At least the pole width so the tube edge lands on metal.' },
  { key: 'coinT', label: 'Coin thickness', unit: 'mm', min: 0.8, max: 6, step: 0.05, value: 2, showIf: (p) => p.coin === 'yes' },
  { key: 'coinN', label: 'Coins stacked', unit: '', min: 1, max: 12, step: 1, value: 1, showIf: (p) => p.coin === 'yes', hint: 'Stack more for weight: each one adds about its own weight right at the end.' },
]

export const ACRO_WEIGHT_PARAMS = [
  { key: 'weight', label: 'Weight', options: WEIGHTS, value: WEIGHTS[0], rerender: true, hint: 'Steel shot: a sealed chamber you pour shot into when the print pauses. Coins only: just the coin stack. None: solid TPU.' },
  { key: 'addG', label: 'Steel shot', unit: 'g', min: 5, max: 600, step: 5, value: 80, showIf: (p) => p.weight === WEIGHTS[0], hint: 'How much shot to put in. The chamber is made to that size so it is packed full and does not rattle (up to what fits).' },
]

export const ACRO_PARAMS = [...ACRO_SHAPE_PARAMS, ...ACRO_POLE_PARAMS, ...ACRO_COIN_PARAMS, ...ACRO_WEIGHT_PARAMS]

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

// ---------------------------------------------------------------- profile --
/**
 * The side profile as [[r, z], ...] from the mouth (z = 0) to the tip (z = len),
 * in round-equivalent radius (multiply by facet.f for a faceted end's corners).
 * rb: the socket radius, so the mouth wall is measured from it.
 * print: every outward slope held to 45° so it prints mouth-down with no supports.
 */
export function acroProfile(p, { rb, print = true, sides = p.sides }) {
  const n = sides >= 3 ? Math.round(sides) : 0
  const ins = n ? Math.PI / n / Math.tan(Math.PI / n) : 1 // flat radius / round-equivalent radius
  const L = p.len, R = p.circ / TAU
  const kind = profKey(p)
  const Rm = Math.min(R, (rb + p.mouthWall) / ins)
  let c = kind === 'ball' ? Math.min(R, L * 0.95) : Math.min(p.tipR, L * 0.6, R)
  c = Math.max(0.01, c)
  const zCap = L - c
  const side = (z) => {
    const t = z / L
    switch (kind) {
      case 'ball': { const zc = L - R; return z >= zc ? R : Math.sqrt(Math.max(0, R * R - (z - zc) ** 2)) }
      case 'bell': return Rm + (R - Rm) * Math.pow(t, 1.5)
      case 'barrel': return Rm + (R - Rm) * Math.pow(Math.sin(Math.PI * Math.min(1, t / 0.9)), 0.55)
      case 'taper': return R - (R - Math.max(Rm, R * 0.62)) * t
      case 'mushroom': return z < L * 0.42 ? Math.max(Rm, Math.min(R, rb / ins + 3.5)) : R
      case 'cylinder': return R
      default: return R
    }
  }
  const rf = Math.min(p.tipFlat / 2, side(zCap))
  const dz = 0.5
  const out = []
  const ribs = p.ribDepth > 0 ? p.ribs || 0 : 0 // (a hub's crush 'ribs' can leak in: only grip rings count)
  const z0r = ribs > 0 ? L * 0.12 : 0, z1r = zCap - 2
  for (let z = 0; z <= L + 1e-9; z = Math.min(L, z + dz)) {
    let r = side(z)
    if (z > zCap) { const u = (z - zCap) / c; r = rf + (side(zCap) - rf) * Math.sqrt(Math.max(0, 1 - u * u)) }
    if (ribs > 0 && z > z0r && z < z1r) r -= p.ribDepth * 0.5 * (1 - Math.cos((TAU * ribs * (z - z0r)) / (z1r - z0r)))
    if (z <= zCap) r = Math.max(r, Rm) // never thinner than the wall round the pole
    out.push([Math.max(0, r), z])
    if (z >= L) break
  }
  // the mouth: the open end of the socket is at least the mouth radius
  out[0][0] = Math.max(out[0][0], Math.min(R, Rm))
  if (print) for (let i = 1; i < out.length; i++) out[i][0] = Math.min(out[i][0], out[i - 1][0] + (out[i][1] - out[i - 1][1])) // 45°
  return { prof: out, R, Rm, ins, f: n ? Math.PI / n / Math.sin(Math.PI / n) : 1, n, L, kind }
}

/** The outside of the end as a solid (no socket), mouth at z = 0. */
export function acroOuter(wasm, k, p, { rb, print = true, sides = p.sides, chamfer = print ? 0.6 : 0.4 }) {
  const { CrossSection } = wasm
  const P = acroProfile(p, { rb, print, sides })
  const pts = [[0, 0]]
  const r0 = P.prof[0][0] * P.f
  pts.push([Math.max(0.1, r0 - chamfer), 0], [r0, chamfer])
  for (const [r, z] of P.prof) if (z > chamfer) pts.push([r * P.f, z])
  if (pts[pts.length - 1][0] > 0.01) pts.push([0, P.L])
  let m = k(k(new CrossSection([pts], 'Positive')).revolve(P.n || 96))
  if (P.n && p.twist) {
    const L = P.L, tw = (p.twist * Math.PI) / 180
    m = k(m.warp((v) => { const a = (tw * v[2]) / L, c = Math.cos(a), s = Math.sin(a), x = v[0], y = v[1]; v[0] = x * c - y * s; v[1] = x * s + y * c }))
  }
  return { m, ...P }
}

// ---------------------------------------------------------- printed end --
export function buildAcro(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const warns = []
    const rb = (p.poleOD + p.fit) / 2
    const O = acroOuter(wasm, k, p, { rb })
    const { prof, ins, L } = O
    let m = O.m
    if (opts.cone) {
      // pine cone scales over the outside, their ends pointing up to the tip
      const rAt = (z) => { for (let i = 1; i < prof.length; i++) if (prof[i][1] >= z) { const [r0, z0] = prof[i - 1], [r1, z1] = prof[i]; return (r0 + ((r1 - r0) * (z - z0)) / Math.max(1e-6, z1 - z0)) * O.f } return 0 }
      const sc = coneScales(wasm, k, { rAt, z0: Math.min(L * 0.12, 8), z1: L - Math.max(2.5, Math.min(p.tipR, O.R) * 0.3), N: p.scales ?? 110, open: p.open ?? 0.3, dir: 1, minR: 4 })
      if (sc) m = k(m.add(sc))
    }
    const flatR = (z) => { // the flat (inscribed) radius of the outside at height z
      for (let i = 1; i < prof.length; i++) if (prof[i][1] >= z) return prof[i - 1][0] * ins
      return 0
    }
    const minFlat = (z0, z1) => { let r = Infinity; for (const [rr, z] of prof) if (z >= z0 && z <= z1) r = Math.min(r, rr * ins); return r }
    const cyl = (r, z0, z1, n = 64) => k(k(Manifold.cylinder(z1 - z0, r, r, n)).translate([0, 0, z0]))
    const coin = p.coin === 'yes'
    const stack = coin ? p.coinN * p.coinT + 0.2 : 0
    const grip = Math.max(8, Math.min(p.grip, L - stack - 5))
    if (grip < p.grip) warns.push(`The end is only ${L} mm long: the socket is cut to ${grip.toFixed(0)} mm. Make it longer for a deeper socket.`)
    const pocketR = coin ? p.coinD / 2 + 0.2 : 0
    const plug = (p.seat || '').includes('plug')
    const poleIn = p.poleOD - 2 * p.poleWall
    const plugR = poleIn / 2 - 0.25
    // socket, with a 45° lead-in so it starts onto the pole easily
    const cuts = [cyl(rb, -1, grip), k(k(Manifold.cylinder(1.6, rb + 1.5, rb - 0.1, 64)).translate([0, 0, -0.01]))]
    if (coin) cuts.push(cyl(pocketR, grip - 0.01, grip + stack))
    m = k(m.subtract(k(Manifold.union(cuts))))
    if (plug) {
      if (plugR < 3) warns.push('The pole is too narrow inside for a plug: switch to Sleeve.')
      else m = k(m.add(cyl(plugR, 0.6, grip + stack + 0.5, 48)))
    }
    // walls round the socket and the coin
    const wallS = minFlat(1.6, grip) - rb, wallC = coin ? minFlat(grip, grip + stack) - pocketR : Infinity
    if (wallS < 2) warns.push(`The wall round the pole is ${Math.max(0, wallS).toFixed(1)} mm somewhere: give it a bigger circumference, more wall at the pole, or a shorter socket. 2.5 mm or more.`)
    if (wallC < 2) warns.push(`The coin is close to the outside (${Math.max(0, wallC).toFixed(1)} mm of wall): a smaller coin or a bigger end.`)
    if (coin && p.coinD < p.poleOD - 0.5) warns.push(`The coin (Ø${p.coinD}) is narrower than the pole (Ø${p.poleOD}): the pole edge lands on TPU round it. Use a coin or washer at least Ø${Math.ceil(p.poleOD)}.`)
    const coinTrapped = coin && pocketR > rb + 1.2
    // the steel shot chamber, sized to the shot so it packs full and cannot rattle
    let shot = null
    const zc0 = grip + stack + 2.5, wallT = 3, dz = 0.5
    if (p.weight === WEIGHTS[0]) {
      const rows = []
      for (let z = zc0; z <= L - wallT; z += dz) rows.push([Math.max(0, Math.min(flatR(z), flatR(z + wallT)) - wallT), z])
      for (let i = rows.length - 2; i >= 0; i--) rows[i][0] = Math.min(rows[i][0], rows[i + 1][0] + dz) // 45° roof
      if (rows.length) rows[rows.length - 1][0] = 0
      const vol = (i) => (Math.PI * rows[i][0] ** 2 * dz) / 1000 // cm³ in the slice above row i
      let acc = 0, iFill = -1
      const want = p.addG / SHOT
      for (let i = 0; i < rows.length - 1; i++) {
        if (rows[i][0] < 3.5 && i > 2) break // past here the roof is too narrow to pour into
        acc += vol(i); iFill = i
        if (acc >= want) break
      }
      if (iFill < 2 || rows[0][0] < 4) warns.push('There is no room for a shot chamber: make the end longer or wider, or pick coins only.')
      else {
        const zp = rows[iFill + 1][1], rp = rows[iFill + 1][0]
        // above the fill line, close the roof at 45° from there
        const ch = [[0, zc0]]
        for (let i = 0; i <= iFill + 1; i++) ch.push([rows[i][0], rows[i][1]])
        for (let z = zp + dz, r = rp - dz; r > 0.3 && z < L - wallT; z += dz, r -= dz) ch.push([Math.min(r, flatR(z) - wallT), z])
        ch.push([0, ch[ch.length - 1][1] + 0.3])
        const chamber = k(k(new CrossSection([ch], 'Positive')).revolve(64))
        m = k(m.subtract(chamber))
        shot = { g: acc * SHOT, pauseAt: zp, full: acc * SHOT < p.addG - 2 }
        if (shot.full) warns.push(`Only ${shot.g.toFixed(0)} g of shot fits in this end: fill it to the top. Make it longer or wider for more.`)
      }
    }
    const dens = opts.density || 1.21
    const g = (m.volume() / 1000) * dens
    const coinG = coin ? ((Math.PI * ((p.coinD / 2) ** 2 - (plug ? (plugR + 0.25) ** 2 : 0)) * p.coinT * p.coinN) / 1000) * COIN : 0
    const total = g + coinG + (shot?.g || 0)
    if (plug && coin) warns.push(`With a plug, use washers (hole at least Ø${(2 * plugR + 0.8).toFixed(1)}) instead of coins: the plug goes through them.`)
    const hw = []
    if (coin) for (let i = 0; i < p.coinN; i++) hw.push(cyl(p.coinD / 2, grip + i * p.coinT + 0.05, grip + (i + 1) * p.coinT - 0.05))
    const meshes = { combined: meshData(m) }
    if (hw.length) meshes.rods = meshData(k(Manifold.union(hw)))
    const R = O.R * O.f
    const circle = []
    for (let i = 0; i < 64; i++) circle.push([R * Math.cos((TAU * i) / 64), R * Math.sin((TAU * i) / 64)])
    return {
      acro: {
        R: O.R, D: 2 * O.R, circ: p.circ, L, kind: O.kind, sides: O.n, rb, grip, coin: coin ? { n: p.coinN, d: p.coinD, g: coinG, pauseAt: coinTrapped ? grip + stack : null, push: !coinTrapped } : null,
        shot, plug: plug ? { d: 2 * plugR } : null, g, total, wallS, mouth: O.Rm * ins,
      },
      meshes,
      viewR: Math.max(L, 2 * R) * 0.75,
      polygons: { base: [circle], relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: g, gramsTotal: total, warns, height: L },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

// --------------------------------------------------------- turned metal --
/**
 * A turned metal end. Two ways onto the pole:
 *   socket   bored to slide over the pole (0.15 mm clear), held by an M5 grub screw
 *            (cup point) through the side; a Pole Insert under it in a carbon pole
 *   plug-in  a slotted spigot goes INSIDE the pole and a cone wedge on an M6 cap screw
 *            expands it when you turn the allen key (from the tip, under a rubber
 *            cap); the body sits on the pole end with a lip that wraps the outside
 * Weight: the metal itself; take some out with a lightening bore, or add it with a
 * brass slug in that bore. O-ring grooves take rubber rings for grip and softness.
 */
export const ACRO_METAL_PARAMS = [
  { key: 'profile', label: 'Shape', options: Object.values(PROFILES).filter((o) => !o.startsWith('barrel')), value: PROFILES.dome },
  ...ACRO_SHAPE_PARAMS.filter((q) => ['circ', 'len', 'tipR', 'tipFlat', 'mouthWall'].includes(q.key)).map((q) => q.key === 'len' ? { ...q, value: 55 } : q.key === 'circ' ? { ...q, value: 141 } : q),
  { key: 'oRings', label: 'O-ring grooves', unit: '', min: 0, max: 6, step: 1, value: 2, hint: 'Grooves for rubber O-rings round the side: grip, and softer on the body and the floor. 0 = bare metal.' },
  { key: 'oRingCS', label: 'O-ring thickness', unit: 'mm', min: 1.5, max: 5, step: 0.1, value: 3, presets: [2.5, 3, 3.5, 4], showIf: (p) => p.oRings > 0, hint: 'The cross-section of the O-rings you buy.' },
  ...ACRO_POLE_PARAMS.filter((q) => ['poleOD', 'poleWall', 'grip'].includes(q.key)),
  { key: 'lighten', label: 'Weight bore', unit: 'mm', min: 0, max: 30, step: 0.5, value: 0, hint: 'A blind hole up the middle from the socket: takes weight out, or press a brass or steel slug in to add it. 0 = solid.' },
  { key: 'lipL', label: 'Lip over the pole', unit: 'mm', min: 0, max: 20, step: 0.5, value: 6, showIf: (p) => p.plugIn, hint: 'How far the lip wraps down the outside of the pole. It stops the end moving sideways and protects the pole end. 0 = flat.' },
  { key: 'lipW', label: 'Lip wall', unit: 'mm', min: 1, max: 5, step: 0.1, value: 2, showIf: (p) => p.plugIn },
]

export function buildAcroMetal(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const warns = []
    const plugIn = opts.plugIn
    const density = opts.density || 2.7
    const ri = (p.poleOD - 2 * p.poleWall) / 2
    const rb = plugIn ? p.poleOD / 2 + 0.15 : p.poleOD / 2 + 0.08 // a lip skirt / a socket: slides on
    const lipL = plugIn ? p.lipL : 0
    // the body: for plug-in, z = 0 is the pole end; the lip skirt hangs below it
    const q = { ...p, sides: 0, twist: 0, ribs: 0, mouthWall: plugIn ? Math.max(p.mouthWall, p.lipW) : p.mouthWall }
    const O = acroOuter(wasm, k, q, { rb: plugIn ? rb : rb, print: false })
    const L = O.L
    let body = O.m
    const cyl = (r, z0, z1, n = 64) => k(k(Manifold.cylinder(z1 - z0, r, r, n)).translate([0, 0, z0]))
    const parts = {}
    let info = {}
    if (!plugIn) {
      const grip = Math.min(p.grip, L - 8)
      body = k(body.subtract(cyl(rb, -1, grip)))
      body = k(body.subtract(k(k(Manifold.cylinder(1, rb + 0.8, rb, 64)).translate([0, 0, -0.01]))))
      if (p.lighten > 0) body = k(body.subtract(cyl(p.lighten / 2, grip - 0.5, Math.min(L - 6, grip + (L - grip) * 0.75), 32)))
      // M5 grub screw through the side, a third of the way up the socket
      const gz = Math.max(6, grip * 0.4)
      body = k(body.subtract(k(k(k(Manifold.cylinder(O.R + 2, 2.1, 2.1, 20)).rotate([0, 90, 0])).translate([0, 0, gz]))))
      info = { grip, gz, tap: 'M5 (4.2 mm drill, tap M5)' }
      const wall = O.R - rb
      if (wall < 3) warns.push('Less than 3 mm of metal round the pole: make it wider.')
    } else {
      // the spigot inside the pole, slotted, with the taper inside it
      const sL = Math.max(20, p.grip)
      const sr = ri - 0.1
      if (sr < 5.5) warns.push('The pole is too narrow inside for an expanding spigot (needs about 11 mm inside): use the socket end.')
      let sp = cyl(sr, -sL, 0.01)
      sp = k(sp.subtract(cyl(3.3, -sL - 1, 1, 24)))
      const taperL = Math.min(sL - 6, 22), rBot = sr - 1.6, rTop = 3.6
      sp = k(sp.subtract(k(k(Manifold.cylinder(taperL, rBot, rTop, 48)).translate([0, 0, -sL - 0.01]))))
      const slots = []
      for (let i = 0; i < 3; i++) slots.push(k(k(k(Manifold.cube([2 * sr + 2, 1.2, sL - 6 + 0.01], false)).translate([0, -0.6, -sL - 0.01])).rotate([0, 0, 120 * i])))
      sp = k(sp.subtract(k(Manifold.union(slots))))
      // the lip: a skirt over the outside of the pole end
      if (lipL > 0) {
        const skirt = k(cyl(p.poleOD / 2 + p.lipW, -lipL, 0.01).subtract(cyl(rb, -lipL - 1, 0.02)))
        body = k(body.add(skirt))
        // round the skirt's lower outside edge
        body = k(body.subtract(k(k(k(Manifold.cylinder(1, p.poleOD / 2 + p.lipW + 0.01, p.poleOD / 2 + p.lipW + 0.01, 64)).subtract(k(Manifold.cylinder(1, p.poleOD / 2 + p.lipW - 0.8, p.poleOD / 2 + p.lipW + 0.2, 64)))).translate([0, 0, -lipL]))))
      }
      body = k(body.add(sp))
      // the bolt goes up the middle; its head sits in a counterbore at the tip, under a rubber cap
      body = k(body.subtract(cyl(3.3, -sL - 1, L + 1, 24)))
      body = k(body.subtract(cyl(5.6, L - 7, L + 1, 32)))
      // the wedge: same taper, tapped M6
      const wL = Math.min(16, taperL - 2), wTop = rBot - ((rBot - rTop) * wL) / taperL
      let wedge = k(Manifold.cylinder(wL, rBot - 0.1, wTop - 0.1, 48))
      wedge = k(wedge.subtract(cyl(2.5, -1, wL + 1, 20)))
      parts.wedge = k(wedge.translate([0, 0, -sL - 2]))
      const boltL = Math.ceil((L - 7 + sL + 2) / 5) * 5
      info = { sL, sr, lipL, boltL, bolt: `M6 × ${boltL} socket cap screw`, wedge: { L: wL, d0: 2 * rBot - 0.2, d1: 2 * wTop - 0.2 } }
    }
    // O-ring grooves round the widest part
    const grooves = []
    if (p.oRings > 0) {
      const cs = p.oRingCS, depth = cs * 0.75, w = cs * 1.25
      const zs = O.prof.filter(([r]) => r > O.R - 0.6).map(([, z]) => z)
      const za = Math.max(zs.length ? zs[0] : L * 0.3, plugIn ? 3 : (info.grip || 0) * 0.2 + 2), zb = Math.min(zs.length ? zs[zs.length - 1] : L * 0.6, L - Math.max(4, p.tipR * 0.3))
      const n = p.oRings, step = n > 1 ? (zb - za - w) / (n - 1) : 0
      if (zb - za < n * (w + 2)) warns.push('Not every O-ring groove fits on the straight part of the side: fewer rings, or a longer end.')
      for (let i = 0; i < n; i++) {
        const z = n > 1 ? za + i * step : (za + zb - w) / 2
        if (z < 0 || z + w > L) continue
        const ring = k(cyl(O.R + 1, z, z + w).subtract(cyl(O.R - depth, z - 1, z + w + 1)))
        grooves.push({ z, d: 2 * (O.R - depth), w })
        body = k(body.subtract(ring))
      }
    }
    const g = (body.volume() / 1000) * density
    const wedgeG = parts.wedge ? (parts.wedge.volume() / 1000) * 7.9 : 0
    const meshes = { combined: meshData(body) }
    const hw = []
    if (parts.wedge) hw.push(parts.wedge, cyl(2.95, -info.sL - 2, L - 7), cyl(5, L - 7, L - 1))
    if (grooves.length) for (const gr of grooves) hw.push(k(k(k(k(CrossSection.circle(p.oRingCS / 2, 16)).translate([gr.d / 2 + p.oRingCS / 2 - 0.3, 0])).revolve(64)).translate([0, 0, gr.z + gr.w / 2])))
    if (hw.length) meshes.rods = meshData(k(Manifold.union(hw)))
    if (parts.wedge) meshes.wedgeFlat = meshData(k(parts.wedge.translate([0, 0, info.sL + 2])))
    // the lathe profile: the outside, both halves, for the drawing and the DXF
    const half = O.prof.map(([r, z]) => [r, z])
    const side = [[...half, ...[...half].reverse().map(([r, z]) => [-r, z])]]
    const R = O.R
    const circle = []
    for (let i = 0; i < 64; i++) circle.push([R * Math.cos((TAU * i) / 64), R * Math.sin((TAU * i) / 64)])
    return {
      acro: { metal: true, plugIn, R, D: 2 * R, circ: p.circ, L, kind: O.kind, g, wedgeG, total: g + wedgeG, grooves, ...info, density },
      dart: null,
      meshes,
      viewR: Math.max(L + lipL + (info.sL || 0), 2 * R) * 0.65,
      polygons: { base: [circle], relief: [], pods: [], weak: [] },
      layers: { cut: side, holes: [], drill: [], pocket: [], pocketDepth: 0, engrave: [] },
      lathe: { prof: O.prof, L, R, title: plugIn ? 'plug-in acro end' : 'socket acro end' },
      podH: 0, ring: null, snap: null, cnc: true,
      stats: { tris: meshes.combined.indices.length / 3, grams: g, gramsTotal: g + wedgeG, warns, height: L },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

/** A lathe drawing of a turned end: the profile 1:1 and the diameters every 5 mm. */
export function acroDrawingSVG(hub, p, matName, name) {
  const a = hub.acro, prof = hub.lathe.prof, L = a.L, R = a.R
  const below = a.plugIn ? a.sL : 0
  const W = Math.max(120, 2 * R + 80), pad = 22, H = L + below
  const X = (x) => (x + W / 2).toFixed(2), Y = (z) => (L - z + pad).toFixed(2)
  const path = 'M' + hub.layers.cut[0].map(([x, z]) => `${X(x)},${Y(z)}`).join('L') + 'Z'
  const rows = []
  for (let z = 0; z <= L + 0.01; z += 5) {
    let r = 0
    for (let i = 1; i < prof.length; i++) if (prof[i][1] >= z) { r = prof[i][0]; break }
    rows.push(`<text x="${W + 8}" y="${pad + 14 + rows.length * 5}" font-size="3.6">${z.toFixed(0)} mm: Ø${(2 * r).toFixed(2)}</text>`)
  }
  const notes = []
  if (a.plugIn) {
    notes.push(`Spigot into the pole: Ø${(2 * a.sr).toFixed(2)} × ${a.sL} mm below the shoulder, 3 slots 1.2 mm wide, ${(a.sL - 6).toFixed(0)} mm long from the bottom. Taper bore inside it to match the wedge.`)
    notes.push(`Wedge: cone Ø${a.wedge.d0.toFixed(2)} → Ø${a.wedge.d1.toFixed(2)} over ${a.wedge.L} mm, drilled 5.0 and tapped M6. Steel or brass.`)
    if (a.lipL) notes.push(`Lip: a skirt bored Ø${(p.poleOD + 0.3).toFixed(2)} × ${a.lipL} mm deep, wall ${p.lipW} mm, over the outside of the pole.`)
    notes.push(`Centre: Ø6.6 through; counterbore Ø11.2 × 7 deep at the tip for the ${a.bolt} head. A rubber cap or a dab of silicone closes it.`)
  } else {
    notes.push(`Socket: bore Ø${(p.poleOD + 0.16).toFixed(2)} × ${a.grip.toFixed(0)} deep, 0.8 × 45° chamfer at the mouth.`)
    notes.push(`Grub screw: drill 4.2 and tap M5 through one side at ${a.gz.toFixed(0)} mm from the mouth. Cup-point M5 set screw.`)
  }
  if (p.lighten > 0) notes.push(`Weight bore: Ø${p.lighten} up the middle (shown in the STL).`)
  for (const g of a.grooves || []) notes.push(`O-ring groove at ${g.z.toFixed(1)} mm: Ø${g.d.toFixed(2)} bottom, ${g.w.toFixed(2)} wide.`)
  notes.push('Break and polish every edge: it is a contact prop that rolls on skin.')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W + 70}mm" height="${H + 2 * pad + 12 + notes.length * 5.5}mm" viewBox="0 0 ${W + 70} ${H + 2 * pad + 12 + notes.length * 5.5}">
<rect width="100%" height="100%" fill="#fff"/>
<g font-family="Helvetica,Arial,sans-serif">
<text x="6" y="10" font-size="6" font-weight="700">${name}: ${hub.lathe.title}, lathe profile, 1:1 (mm)</text>
<text x="6" y="16" font-size="4">${matName}. Body ${L.toFixed(1)} mm long, Ø${(2 * R).toFixed(2)} widest. Pole end at 0 (bottom of the drawing), tip at the top. Turn from bar Ø${Math.ceil(2 * R + 3)}.</text>
<path d="${path}" fill="#eef1f5" stroke="#000" stroke-width="0.35"/>
<line x1="${W / 2}" y1="${pad - 5}" x2="${W / 2}" y2="${L + pad + 5}" stroke="#06c" stroke-width="0.2" stroke-dasharray="3 2"/>
<text x="${W + 8}" y="${pad + 6}" font-size="4.5" font-weight="700">Diameters</text>
${rows.join('\n')}
${notes.map((t, i) => `<text x="6" y="${L + below + 2 * pad + 4 + i * 5.5}" font-size="3.8">${t}</text>`).join('\n')}
</g></svg>\n`
}

// ---------------------------------------------------------------- designs --
export function acroDesigns() {
  const over = (list, o) => list.map((x) => ({ ...x, ...(o[x.key] !== undefined ? { value: o[x.key] } : {}) }))
  const d = (id, name, blurb, o) => ({ id, name, group: 'Acro', blurb, acro: true, added: '2026-11-22', params: over(ACRO_PARAMS, o), draw: () => {} })
  const cone = (id, name, blurb, o) => ({ ...d(id, name, blurb, o), group: 'PineContact', cone: true, params: [...over(ACRO_PARAMS.filter((q) => !['sides', 'twist', 'ribs', 'ribDepth'].includes(q.key)), o), ...over(CONE_PARAMS, o)] })
  const m = (id, name, blurb, plugIn, o) => ({
    id, name, group: 'AcroMetal', blurb, acro: true, acroMetal: true, plugIn, cncOnly: true, added: '2026-11-22',
    cnc: { material: 'al6061' },
    params: over(ACRO_METAL_PARAMS.map((q) => (q.showIf && q.key.startsWith('lip') ? { ...q, showIf: () => plugIn } : q)), o).filter((q) => (plugIn ? q.key !== 'lighten' : !q.key.startsWith('lip'))),
    draw: () => {},
  })
  return [
    d('acroDome', 'Acro Dome', 'The everyday acro staff end: straight sides and a big round dome that rolls smoothly over the body. A coin at the bottom of the socket takes the pole edge, and a steel-shot chamber gives it weight. Every size is yours to set.', { len: 70, addG: 70 }),
    d('acroBall', 'Acro Ball', 'A round ball end on a slim 45° neck: rolls in every direction, kind to the body, and the classic contact feel. Printed with no supports.', { profile: PROFILES.ball, circ: 176, len: 78, addG: 90, grip: 30 }),
    d('acroFoot', 'Balance Foot', 'A bell that flares to a wide flat foot: stand the staff on your hand, chin, head or the floor. Rounded edge so it still rolls when you tip it.', { profile: PROFILES.bell, circ: 170, len: 58, tipR: 6, tipFlat: 40, mouthWall: 3 }),
    d('acroGrip', 'Ringed Grip', 'A barrel end with soft grip rings round its middle: sure in a sweaty hand for isolations and passes.', { profile: PROFILES.barrel, circ: 160, len: 70, ribs: 6, ribDepth: 1, tipR: 16 }),
    d('acroHex', 'Hex Roller', 'Six flat faces with a gentle twist: rolls in clicks over the body, never runs away when you set it down, and catches the light.', { sides: 6, twist: 30, circ: 160, len: 68, tipR: 18, addG: 60 }),
    d('acroMushroom', 'Mushroom Cap', 'A slim neck under a big round cap: the weight sits right at the very end, for long, slow, floaty rolls.', { profile: PROFILES.mushroom, circ: 190, len: 70, tipR: 26, addG: 90, mouthWall: 3, grip: 30 }),
    cone('acroPine', 'Pine Cone End', 'A pine cone for the end of a contact or acro staff: wide by the pole, tapering to a rounded tip, covered in golden-angle scales. Coin, weight and every size are yours to set.', { profile: PROFILES.taper, circ: 170, len: 80, tipR: 16, scales: 110, open: 0.25, addG: 80 }),
    cone('acroPineOpen', 'Open Pine Cone End', 'A dry, open pine cone end: the scale ends stand out for grip in the hand and on the body. Domed tip so it still rolls.', { circ: 176, len: 74, tipR: 22, scales: 90, open: 0.85, addG: 70 }),
    cone('acroFir', 'Fir Cone End', 'A long, slim fir cone with fine, tight scales: smooth enough for rolls, textured enough to hold.', { profile: PROFILES.cylinder, circ: 145, len: 95, tipR: 18, scales: 170, open: 0.15, addG: 80 }),
    cone('acroConeBall', 'Cone Ball End', 'A round ball of chunky stone-pine scales on a slim neck: a contact ball with texture.', { profile: PROFILES.ball, circ: 180, len: 80, grip: 30, scales: 140, open: 0.4, addG: 90 }),
    m('acroTurned', 'Turned Metal End', 'Turned from aluminium or brass bar: a socket over the pole held with a grub screw, O-ring grooves round it for grip and softness, and a weight bore to tune it. The lathe drawing and profile come with it.', false, {}),
    m('acroPlugIn', 'Plug-In Metal End', 'A turned metal end that goes INTO the pole: turn the allen key and a cone wedge expands the spigot against the inside of the tube, while a lip wraps the outside of the pole end so it can never fly off or walk sideways. Safe for carbon.', true, { circ: 150, len: 50 }),
  ]
}
