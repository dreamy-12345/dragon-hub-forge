// Melted-liquid designs: organic punk. See designs.js for the design format.
//
// Everything molten here is one signed-distance field: drips, blobs and spikes
// are distance functions, merged with a smooth minimum so they fuse with the
// fillets real liquid makes, then contoured (marching squares) into closed
// loops for the raised colour-B goo. Sharp punk spikes use a small blend so
// their tips stay sharp while their roots still melt into the rest.
//
// Balance: each design repeats one arm `sym` times. Even arms and odd arms can
// differ (two seeded variants), and each variant on its own is a balanced
// sym/2-fold set, so the hub feels uneven but its centre of mass stays on the axis.

import { drawSpokes, deg } from './designs.js'
import { TAU, rot, rng } from './geom.js'

// ------------------------------------------------------------- distance kit

const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r

/** Tapered capsule from a (radius ra) to b (radius rb). */
function sdTaper(x, y, ax, ay, bx, by, ra, rb) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9
  let t = ((x - ax) * dx + (y - ay) * dy) / L2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(x - ax - dx * t, y - ay - dy * t) - (ra + (rb - ra) * t)
}

/** Exact distance to a triangle (negative inside). */
function sdTri(x, y, [p0, p1, p2]) {
  const e0 = [p1[0] - p0[0], p1[1] - p0[1]], e1 = [p2[0] - p1[0], p2[1] - p1[1]], e2 = [p0[0] - p2[0], p0[1] - p2[1]]
  const v0 = [x - p0[0], y - p0[1]], v1 = [x - p1[0], y - p1[1]], v2 = [x - p2[0], y - p2[1]]
  const cl = (v, e) => { const t = Math.max(0, Math.min(1, (v[0] * e[0] + v[1] * e[1]) / (e[0] * e[0] + e[1] * e[1]))); return [v[0] - e[0] * t, v[1] - e[1] * t] }
  const q0 = cl(v0, e0), q1 = cl(v1, e1), q2 = cl(v2, e2)
  const s = Math.sign(e0[0] * e2[1] - e0[1] * e2[0])
  const d0 = [q0[0] * q0[0] + q0[1] * q0[1], s * (v0[0] * e0[1] - v0[1] * e0[0])]
  const d1 = [q1[0] * q1[0] + q1[1] * q1[1], s * (v1[0] * e1[1] - v1[1] * e1[0])]
  const d2 = [q2[0] * q2[0] + q2[1] * q2[1], s * (v2[0] * e2[1] - v2[1] * e2[0])]
  const dd = Math.min(d0[0], d1[0], d2[0])
  const sg = Math.min(d0[1], d1[1], d2[1])
  return -Math.sqrt(dd) * Math.sign(sg)
}

/** Polynomial smooth minimum: k = how far the fillet reaches, in mm. */
function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - (h * h * k) / 4
}

/**
 * A pile of primitives in one arm, repeated sym times round the axis.
 * add(fn, bbox, k): fn(x,y) is a distance in the arm's own frame.
 */
class Goo {
  constructor(sym, rot0) {
    this.sym = sym
    this.rot0 = rot0
    this.prims = [[], []] // even arms, odd arms
  }
  add(variant, fn, box, k) {
    this.prims[variant].push({ fn, box, k })
  }
  /** Distance in world space: fold the point into each arm's frame. */
  field(x, y) {
    let d = 1e9
    const n = this.sym
    const a = Math.atan2(y, x) - this.rot0
    const r = Math.hypot(x, y)
    // the two nearest arms of each variant are enough: shapes don't reach further
    const step = TAU / n
    const i0 = Math.floor(a / step)
    for (let j = i0 - 1; j <= i0 + 2; j++) {
      const arm = ((j % n) + n) % n
      const variant = this.prims[1].length ? arm % 2 : 0
      const th = a - j * step
      const lx = r * Math.cos(th), ly = r * Math.sin(th)
      for (const q of this.prims[variant]) {
        const b = q.box
        if (b && (lx < b[0] - q.k - 4 || lx > b[2] + q.k + 4 || ly < b[1] - q.k - 4 || ly > b[3] + q.k + 4)) continue
        d = smin(d, q.fn(lx, ly), q.k)
      }
    }
    return d
  }
}

/**
 * Marching squares on f < 0, chained into closed loops: outer loops CCW,
 * holes CW, which is what the relief's Positive fill rule wants.
 */
function isoLoops(f, R, h = 1) {
  const n = Math.ceil((2 * R) / h) + 3
  const x0 = -R - h
  const X = (i) => x0 + i * h
  const v = new Float64Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const edge = i === 0 || j === 0 || i === n - 1 || j === n - 1
    v[j * n + i] = edge ? 1 : f(X(i), X(j)) || 1e-9
  }
  const at = (i, j) => v[j * n + i]
  const pt = new Map()
  const hit = (key, ia, ja, ib, jb) => {
    if (!pt.has(key)) {
      const a = at(ia, ja), b = at(ib, jb), t = a / (a - b)
      pt.set(key, [X(ia) + (X(ib) - X(ia)) * t, X(ja) + (X(jb) - X(ja)) * t])
    }
    return key
  }
  const next = new Map() // key → key, walking with the inside on the left
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const c = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]
    const inside = c.map((q) => q < 0)
    if (inside.every((b) => b) || inside.every((b) => !b)) continue
    // edges in CCW order: bottom, right, top, left
    const E = [
      () => hit(`h${i},${j}`, i, j, i + 1, j),
      () => hit(`v${i + 1},${j}`, i + 1, j, i + 1, j + 1),
      () => hit(`h${i},${j + 1}`, i + 1, j + 1, i, j + 1),
      () => hit(`v${i},${j}`, i, j + 1, i, j),
    ]
    // corners in CCW order; edge e runs from corner e to corner e+1.
    // Walking CCW round the cell, an edge going inside→outside is an exit and
    // outside→inside an entry; inside on the left means: enter, then exit.
    const entries = [], exits = []
    for (let e = 0; e < 4; e++) {
      const a = inside[e], b = inside[(e + 1) % 4]
      if (a && !b) exits.push(e)
      else if (!a && b) entries.push(e)
    }
    if (entries.length === 1) next.set(E[exits[0]](), E[entries[0]]())
    else {
      // saddle: decide by the centre whether the two insides join
      const mid = (c[0] + c[1] + c[2] + c[3]) / 4 < 0
      for (const ex of exits) {
        // the entry that follows this exit going CCW (joined) or precedes it (split)
        const order = [1, 2, 3].map((s) => (ex + (mid ? 4 - s : s)) % 4)
        const en = order.find((e) => entries.includes(e))
        next.set(E[ex](), E[en]())
      }
    }
  }
  const loops = []
  const seen = new Set()
  for (const start of next.keys()) {
    if (seen.has(start)) continue
    const loop = []
    let k = start
    while (k !== undefined && !seen.has(k)) {
      seen.add(k)
      loop.push(pt.get(k))
      k = next.get(k)
    }
    if (loop.length > 2) loops.push(loop)
  }
  // fix any loop wound the wrong way: the point just left of its first edge must be inside
  return loops.map((L) => {
    const [a, b] = [L[0], L[1]]
    const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1
    const px = (a[0] + b[0]) / 2 - (dy / m) * 0.3, py = (a[1] + b[1]) / 2 + (dx / m) * 0.3
    return f(px, py) < 0 ? L : L.slice().reverse()
  })
}

/** A wobbly drip: a run of tapered capsules from (r0, a0) down to a drop. */
function drip(goo, variant, rand, { rFrom, rTo, a, w0, w1, drop, wob, k, neck }) {
  const pts = []
  const N = 8
  for (let s = 0; s <= N; s++) {
    const u = s / N
    const r = rFrom + (rTo - rFrom) * u
    // a drip leans and wobbles as it runs, more the further it runs
    const ang = a + (wob * Math.sin(u * 3.2 + rand() * 0.6) * u) / Math.max(30, r)
    pts.push([r * Math.cos(ang), r * Math.sin(ang)])
  }
  const box = (q, pad) => [Math.min(...q.map((p) => p[0])) - pad, Math.min(...q.map((p) => p[1])) - pad, Math.max(...q.map((p) => p[0])) + pad, Math.max(...q.map((p) => p[1])) + pad]
  const bb = box(pts, Math.max(w0, drop) + 2)
  // the stream thins, then pinches just above the bulb (a hanging drop)
  goo.add(variant, (x, y) => {
    let d = 1e9
    for (let s = 0; s < N; s++) {
      const u0 = s / N, u1 = (s + 1) / N
      const wa = w0 + (w1 - w0) * u0, wb = w0 + (w1 - w0) * u1
      d = Math.min(d, sdTaper(x, y, pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1], wa / 2, wb / 2))
    }
    return d
  }, bb, k)
  const end = pts[N]
  const dirx = end[0] - pts[N - 1][0], diry = end[1] - pts[N - 1][1], dm = Math.hypot(dirx, diry) || 1
  const off = neck ? drop + neck : drop * 0.55
  const c = [end[0] + (dirx / dm) * off, end[1] + (diry / dm) * off]
  goo.add(variant, (x, y) => sdCircle(x, y, c[0], c[1], drop), [c[0] - drop, c[1] - drop, c[0] + drop, c[1] + drop], neck ? 1.5 : k)
  if (neck) goo.add(variant, (x, y) => sdTaper(x, y, end[0], end[1], c[0], c[1], w1 / 2, 1.5), box([end, c], 3), 1.2)
  return c
}

const reliefOf = (loops) => ({ relief: { contours: loops, thicken: 0, gap: 0, slits: false } })

const MELT_OVERRIDES = { strutW: 3, frameH: 4 }

const MELTDOWN_PARAMS = [
  { key: 'sym', label: 'Arms', unit: '', min: 4, max: 12, step: 2, value: 6, hint: 'Even, so the two kinds of arm each make a balanced set.' },
  { key: 'drips', label: 'Drips per arm', unit: '', min: 2, max: 7, step: 1, value: 4 },
  { key: 'reach', label: 'Longest drip', unit: '%', min: 30, max: 95, step: 1, value: 82, hint: 'How far toward the staff the longest drip runs.' },
  { key: 'goo', label: 'Goo', unit: 'mm', min: 3, max: 14, step: 0.5, value: 8, hint: 'How thick the melt is where it leaves the rim, and how soft the fillets are.' },
  { key: 'puddle', label: 'Collar puddle', unit: 'mm', min: 0, max: 30, step: 1, value: 16 },
  { key: 'seed', label: 'Seed', unit: '', min: 1, max: 999, step: 1, value: 66, seed: true },
]

/** Meltdown's melt: the rim sagging, drips running inward, the collar puddle. */
function meltdownGoo(g, p, rot0, seed) {
  const goo = new Goo(p.sym, rot0)
  const span = TAU / p.sym
  const run = g.Ri - g.hubR
  for (const variant of [0, 1]) {
    const rand = rng(seed * 7 + variant * 131)
    // the rim sags: a wavy molten band hanging just inside it
    goo.add(variant, (x, y) => {
      const r = Math.hypot(x, y), a = Math.atan2(y, x)
      const sag = 2 + p.goo * (0.1 + 0.35 * Math.sin(a * 3 + variant * 2.1 + seed) ** 2)
      return Math.max(g.Ri - sag - r, r - g.Ri - 2)
    }, null, p.goo * 0.6)
    for (let i = 0; i < p.drips; i++) {
      const a = -span / 2 + (span * (i + 0.2 + 0.6 * rand())) / p.drips
      const len = run * (p.reach / 100) * (0.28 + 0.72 * rand() ** 0.7)
      const w0 = p.goo * (0.9 + 0.6 * rand())
      const letGo = rand() < 0.45
      drip(goo, variant, rand, {
        rFrom: g.Ri, rTo: g.Ri - len, a, w0, w1: Math.max(3.2, w0 * (0.35 + 0.25 * rand())),
        drop: Math.max(3, w0 * (0.55 + 0.35 * rand())), wob: 14 + 30 * rand(), k: p.goo * 0.9,
        neck: letGo ? 3 + 5 * rand() : 0,
      })
    }
  }
  // the puddle round the collar, lumpy where drips have landed in it
  if (p.puddle > 0) {
    const pr = g.hubR + p.puddle * 0.5
    for (const variant of [0, 1]) {
      const rand = rng(seed * 3 + variant * 17)
      const pa = (rand() - 0.5) * span * 0.5, prr = p.puddle * (0.4 + 0.25 * rand())
      const pc = rot([pr, 0], pa)
      goo.add(variant, (x, y) => sdCircle(x, y, pc[0], pc[1], prr), [pc[0] - prr, pc[1] - prr, pc[0] + prr, pc[1] + prr], 5)
      const lr = p.puddle * (0.18 + 0.12 * rand())
      const lump = rot([pr + p.puddle * 0.2, 0], span * 0.5)
      goo.add(variant, (x, y) => sdCircle(x, y, lump[0], lump[1], lr), null, 4)
    }
    goo.add(0, (x, y) => Math.abs(Math.hypot(x, y) - g.hubR) - 2, null, 5)
  }
  return goo
}

/** Meltdown's low frame: wandering strands from collar to rim. */
function meltdownStrands(c, g, p, rot0) {
  const span = TAU / p.sym
  for (let i = 0; i < p.sym; i++) {
    const a0 = rot0 + (i + 0.5) * span
    const pts = []
    for (let s = 0; s <= 12; s++) {
      const u = s / 12, r = g.Rc + (g.Ri + g.w - g.Rc) * u
      pts.push(rot([r, 0], a0 + 0.22 * Math.sin(u * Math.PI * 1.5) * (i % 2 ? 1 : -1)))
    }
    c.line(pts, g.w)
  }
}

export const MELT_DESIGNS = [
  // ------------------------------------------------------------ Meltdown
  {
    id: 'meltRim',
    group: 'Melt',
    name: 'Meltdown',
    blurb: 'The rim is melting: thick drips run inward off it toward the staff, some stretching thin, some letting go as drops on a last string of goo, and a molten puddle pools round the collar. Even and odd arms melt differently, so it never looks tidy.',
    overrides: MELT_OVERRIDES,
    params: MELTDOWN_PARAMS,
    draw(c, g, p) {
      const goo = meltdownGoo(g, p, g.rot, p.seed)
      const loops = isoLoops((x, y) => goo.field(x, y), g.Ri + 1, 1)
      meltdownStrands(c, g, p, g.rot)
      return reliefOf(loops)
    },
  },

  // ------------------------------------------------------------ Meltdown Double
  {
    id: 'meltDouble',
    group: 'Melt',
    name: 'Meltdown Double',
    blurb: 'Meltdown twice over: a low melt in colour A runs off the rim, and a second, taller melt in colour B runs over it, turned half an arm and melting its own way, so drips cross drips and you see one melt through the gaps in the other.',
    overrides: { strutW: 3, frameH: 3.5 },
    params: [
      ...MELTDOWN_PARAMS.filter((d) => d.key !== 'seed'),
      { key: 'lowGoo', label: 'Low melt goo', unit: 'mm', min: 3, max: 12, step: 0.5, value: 6.5, hint: 'Thickness of the under-layer drips. Thinner than the top so the top reads.' },
      { key: 'turn', label: 'Layer offset', unit: '%', min: 0, max: 100, step: 1, value: 50, hint: 'How far the two melts are turned against each other, as a share of one arm.' },
      { key: 'seed', label: 'Top seed', unit: '', min: 1, max: 999, step: 1, value: 66, seed: true },
      { key: 'seed2', label: 'Low seed', unit: '', min: 1, max: 999, step: 1, value: 451, seed: true },
    ],
    draw(c, g, p) {
      const span = TAU / p.sym
      // low layer: its own melt, thinner goo, turned part of an arm, flat at frame height
      const low = meltdownGoo(g, { ...p, goo: p.lowGoo, reach: Math.min(95, p.reach + 8), puddle: p.puddle * 0.6 }, g.rot + (span * p.turn) / 100, p.seed2)
      for (const L of isoLoops((x, y) => low.field(x, y), g.Ri + 1, 1)) c.contours.push(L)
      // top layer: Meltdown as it is
      const top = meltdownGoo(g, p, g.rot, p.seed)
      const loops = isoLoops((x, y) => top.field(x, y), g.Ri + 1, 1)
      meltdownStrands(c, g, p, g.rot) // ties any drop of either layer that lands nowhere
      return reliefOf(loops)
    },
  },

  // ------------------------------------------------------------ Molten Splash
  {
    id: 'meltSplash',
    group: 'Melt',
    name: 'Molten Splash',
    blurb: 'Molten metal hitting the staff and splashing out: thick tongues fling off the collar, curl with the spin and break into a crown of spiky drops, while the rim drips back in to meet them. Hot and violent, not tidy.',
    overrides: MELT_OVERRIDES,
    params: [
      { key: 'sym', label: 'Tongues', unit: '', min: 4, max: 12, step: 2, value: 8, hint: 'Even: two kinds of tongue alternate.' },
      { key: 'reach', label: 'Splash reach', unit: '%', min: 40, max: 95, step: 1, value: 78 },
      { key: 'curl', label: 'Curl', unit: '°', min: 0, max: 90, step: 1, value: 38, hint: 'How far each tongue is swept round by the spin.' },
      { key: 'goo', label: 'Goo', unit: 'mm', min: 5, max: 18, step: 0.5, value: 11 },
      { key: 'spray', label: 'Spray drops', unit: '', min: 0, max: 8, step: 1, value: 5, hint: 'Flung drops per tongue, each on a string so it stays attached.' },
      { key: 'rimDrips', label: 'Rim drips', unit: '', min: 0, max: 6, step: 1, value: 3 },
      { key: 'seed', label: 'Seed', unit: '', min: 1, max: 999, step: 1, value: 913, seed: true },
    ],
    draw(c, g, p) {
      const goo = new Goo(p.sym, g.rot)
      const span = TAU / p.sym
      const run = g.Ri - g.hubR
      // the pool that hit the collar
      goo.add(0, (x, y) => Math.abs(Math.hypot(x, y) - g.hubR - 3) - 4, null, 6)
      const tips = [[], []]
      for (const variant of [0, 1]) {
        const rand = rng(p.seed * 13 + variant * 7919)
        // a tongue: a fat curling sheet from the collar, thinning outward
        const len = run * (p.reach / 100) * (variant ? 0.72 + 0.2 * rand() : 0.9 + 0.1 * rand())
        const curl = deg(p.curl) * (0.7 + 0.6 * rand())
        const N = 10, pts = []
        for (let s = 0; s <= N; s++) {
          const u = s / N, r = g.hubR + 2 + len * u
          pts.push(rot([r, 0], curl * u * u + 0.08 * Math.sin(u * 7 + rand())))
        }
        const wIn = p.goo * (1.5 + 0.5 * rand()), wOut = p.goo * (0.9 + 0.3 * rand())
        goo.add(variant, (x, y) => {
          let d = 1e9
          for (let s = 0; s < N; s++) {
            const u0 = s / N, u1 = (s + 1) / N
            // fat at the root, swelling again where it breaks into the crown
            const w = (u) => wIn + (wOut - wIn) * u + p.goo * 0.6 * Math.max(0, u - 0.75) * 4
            d = Math.min(d, sdTaper(x, y, pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1], w(u0) / 2, w(u1) / 2))
          }
          return d
        }, null, p.goo * 0.8)
        // the crown: 3-4 sharp points fanning off the end of the tongue
        const end = pts[N], prev = pts[N - 2]
        const ha = Math.atan2(end[1] - prev[1], end[0] - prev[0])
        const nC = 3 + Math.floor(rand() * 2)
        for (let k = 0; k < nC; k++) {
          const fa = ha + (k / (nC - 1) - 0.5) * (0.9 + 0.5 * rand())
          const L = p.goo * (1.4 + 1.6 * rand())
          let tip = [end[0] + L * Math.cos(fa), end[1] + L * Math.sin(fa)]
          if (Math.hypot(...tip) > g.Ri - 3) { const m = (g.Ri - 3) / Math.hypot(...tip); tip = [tip[0] * m, tip[1] * m] }
          goo.add(variant, (x, y) => sdTaper(x, y, end[0], end[1], tip[0], tip[1], wOut * 0.32, 1.3), null, 2)
          // a drop flung off the point, on a string
          const da = fa + (rand() - 0.5) * 0.4, dd = 4 + 6 * rand(), dr = 2.4 + 2.2 * rand()
          const dc = [tip[0] + (dd + dr) * Math.cos(da), tip[1] + (dd + dr) * Math.sin(da)]
          if (Math.hypot(...dc) < g.Ri - dr - 1.5) {
            goo.add(variant, (x, y) => sdCircle(x, y, dc[0], dc[1], dr), null, 1.2)
            goo.add(variant, (x, y) => sdTaper(x, y, tip[0], tip[1], dc[0], dc[1], 1.3, 1.4), null, 1)
          }
          tips[variant].push(tip)
        }
        // spray along the tongue's trailing edge
        for (let k = 0; k < p.spray; k++) {
          const s = 3 + Math.floor(rand() * (N - 4))
          const [qx, qy] = pts[s]
          const nx = -(pts[s + 1][1] - pts[s - 1][1]), ny = pts[s + 1][0] - pts[s - 1][0], nm = Math.hypot(nx, ny) || 1
          const side = rand() < 0.65 ? -1 : 1 // mostly the trailing side
          const off = (wIn + (wOut - wIn) * (s / N)) / 2 + 4 + 8 * rand(), dr = 2.4 + 2.6 * rand()
          const dc = [qx + side * (nx / nm) * (off + dr), qy + side * (ny / nm) * (off + dr)]
          const root = [qx + side * (nx / nm) * (off - 6), qy + side * (ny / nm) * (off - 6)]
          if (Math.hypot(...dc) > g.Ri - dr - 2 || Math.hypot(...dc) < g.hubR + dr + 3) continue
          goo.add(variant, (x, y) => sdCircle(x, y, dc[0], dc[1], dr), null, 1.4)
          goo.add(variant, (x, y) => sdTaper(x, y, root[0], root[1], dc[0], dc[1], 1.6, 1.4), null, 2)
        }
        // the rim dripping back in
        goo.add(variant, (x, y) => { const r = Math.hypot(x, y); return Math.max(g.Ri - 3.5 - r, r - g.Ri - 2) }, null, 4)
        for (let k = 0; k < p.rimDrips; k++) {
          const a = span * (0.15 + 0.7 * ((k + rand() * 0.6) / p.rimDrips)) + curl * 0.6
          const w0 = p.goo * (0.6 + 0.4 * rand())
          drip(goo, variant, rand, {
            rFrom: g.Ri, rTo: g.Ri - run * (0.12 + 0.3 * rand()), a, w0, w1: Math.max(3, w0 * 0.45),
            drop: Math.max(3, w0 * 0.6), wob: 10 + 20 * rand(), k: p.goo * 0.6, neck: rand() < 0.4 ? 3 + 3 * rand() : 0,
          })
        }
      }
      const loops = isoLoops((x, y) => goo.field(x, y), g.Ri + 1, 0.75)
      // low frame: each crown tied to the rim, and the arms tied to each other
      for (let i = 0; i < p.sym; i++) {
        const A = g.rot + i * span
        for (const t of tips[i % 2]) {
          const q = rot(t, A), a = Math.atan2(q[1], q[0])
          c.line([q, rot([g.Ri + g.w, 0], a + 0.05)], g.w)
        }
      }
      drawSpokes(c, g, p.sym, span / 2)
      return reliefOf(loops)
    },
  },

  // ------------------------------------------------------------ Acid Burn
  {
    id: 'meltAcid',
    group: 'Melt',
    name: 'Acid Burn',
    blurb: 'A plate eaten through by acid: ragged holes burnt right through it, each with a raised, molten lip, and the melt running off every burn toward the rim as if the spin is flinging it out.',
    overrides: { strutW: 3, frameH: 3 },
    params: [
      { key: 'sym', label: 'Arms', unit: '', min: 4, max: 12, step: 2, value: 6 },
      { key: 'holes', label: 'Burns per arm', unit: '', min: 1, max: 8, step: 1, value: 4 },
      { key: 'pits', label: 'Splatter pits per arm', unit: '', min: 0, max: 20, step: 1, value: 5, hint: 'Small acid splashes burnt through round the big burns.' },
      { key: 'size', label: 'Burn size', unit: 'mm', min: 6, max: 26, step: 0.5, value: 16 },
      { key: 'lip', label: 'Molten lip', unit: 'mm', min: 2.4, max: 8, step: 0.1, value: 3.2, hint: 'The raised, colour-B edge round each burn.' },
      { key: 'runs', label: 'Runs per burn', unit: '', min: 0, max: 4, step: 1, value: 2, hint: 'Melt running outward off each burn.' },
      { key: 'seed', label: 'Seed', unit: '', min: 1, max: 999, step: 1, value: 220, seed: true },
    ],
    draw(c, g, p) {
      const holes = new Goo(p.sym, g.rot) // inside < 0 = burnt away
      const melt = new Goo(p.sym, g.rot)
      const span = TAU / p.sym
      const lo = g.hubR + 6, hi = g.Ri - 7
      for (const variant of [0, 1]) {
        const rand = rng(p.seed * 17 + variant * 337)
        for (let i = 0; i < p.holes; i++) {
          const u = (i + 0.3 + 0.4 * rand()) / p.holes
          const r0 = lo + (hi - lo) * u
          const a0 = (rand() - 0.5) * span * 0.85
          const S = p.size * (0.5 + 0.8 * rand()) * Math.min(1, (r0 - lo + 6) / p.size, (hi - r0 + 6) / p.size)
          // a burn is a few overlapping bites, so its edge is ragged
          const bites = 2 + Math.floor(rand() * 3)
          for (let b = 0; b < bites; b++) {
            const ba = rand() * TAU, bd = S * 0.45 * rand(), br = S * (0.35 + 0.35 * rand())
            const cx = r0 * Math.cos(a0) + bd * Math.cos(ba), cy = r0 * Math.sin(a0) + bd * Math.sin(ba)
            holes.add(variant, (x, y) => sdCircle(x, y, cx, cy, br), [cx - br, cy - br, cx + br, cy + br], S * 0.3)
          }
          // the melt runs off the burn toward the rim
          for (let k = 0; k < p.runs; k++) {
            const ra = a0 + (rand() - 0.5) * (S / r0) * 1.2
            const rFrom = r0 + S * 0.3
            if (rFrom > g.Ri - 8) continue
            const w0 = p.lip * (1.15 + 0.45 * rand())
            drip(melt, variant, rand, {
              rFrom, rTo: Math.min(g.Ri - 2, rFrom + (g.Ri - rFrom) * (0.3 + 0.65 * rand())), a: ra,
              w0, w1: Math.max(3, w0 * 0.5), drop: Math.max(3.2, w0 * 0.8), wob: 24 + 34 * rand(), k: 4, neck: rand() < 0.35 ? 3 : 0,
            })
          }
        }
      }
      // splatter: small burns scattered across the arm
      for (const variant of [0, 1]) {
        const rand = rng(p.seed * 29 + variant * 53)
        for (let i = 0; i < p.pits; i++) {
          const r0 = lo + (hi - lo) * rand(), a0 = (rand() - 0.5) * span, pr = 1.8 + 2.6 * rand() ** 2
          const cx = r0 * Math.cos(a0), cy = r0 * Math.sin(a0)
          holes.add(variant, (x, y) => sdCircle(x, y, cx, cy, pr), [cx - pr, cy - pr, cx + pr, cy + pr], 1)
        }
      }
      const H = (x, y) => holes.field(x, y)
      // plate: the whole disc between collar and rim, minus the burns
      const plate = (x, y) => { const r = Math.hypot(x, y); return Math.max(Math.max(g.Rc - r, r - g.Ri - 2), -H(x, y)) }
      for (const L of isoLoops(plate, g.Ri + 1, 0.9)) c.contours.push(L)
      // raised: a lip just outside each burn, plus the runs, never over a hole
      const raised = (x, y) => {
        const h = H(x, y)
        const lip = Math.abs(h - p.lip / 2) - p.lip / 2
        return Math.max(smin(lip, melt.field(x, y), 2), -h + 0.01)
      }
      const loops = isoLoops(raised, g.Ri + 1, 0.8)
      return reliefOf(loops)
    },
  },
]
