/**
 * Dragon staff hubs from Aotearoa New Zealand's plants and birds: silver fern,
 * unfurling fronds, pōhutukawa and kōwhai blossom, kauri rings, nīkau palm,
 * kiwi, pīwakawaka (fantail), tūī and wētā. Nature only: no carving patterns.
 * Plus three hubs from a brown beer can: ring pulls, a can lid, a crushed can.
 * All drawn on the forge's Canvas (frame web + raised relief), like every hub.
 */
import { TAU, ccw, circlePts } from './geom.js'

const P = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
const rotAt = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
const add = ([x, y], [u, v]) => [x + u, y + v]
// a smooth curve through control points (quadratic B-spline-ish), n samples
function curve(ctrl, n = 32) {
  const out = []
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * (ctrl.length - 1), j = Math.min(ctrl.length - 2, Math.floor(t)), u = t - j
    const a = ctrl[Math.max(0, j - 1)], b = ctrl[j], c = ctrl[j + 1], d = ctrl[Math.min(ctrl.length - 1, j + 2)]
    out.push([0, 1].map((q) => 0.5 * (2 * b[q] + (-a[q] + c[q]) * u + (2 * a[q] - 5 * b[q] + 4 * c[q] - d[q]) * u * u + (-a[q] + 3 * b[q] - 3 * c[q] + d[q]) * u * u * u)))
  }
  return out
}
// a pointed leaf (lens) from p to q, width w
function leaf(p, q, w) {
  const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L
  const pts = []
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([p[0] + dx * t - uy * Math.sin(Math.PI * t) * w / 2, p[1] + dy * t + ux * Math.sin(Math.PI * t) * w / 2]) }
  for (let i = 11; i >= 1; i--) { const t = i / 12; pts.push([p[0] + dx * t + uy * Math.sin(Math.PI * t) * w / 2, p[1] + dy * t - ux * Math.sin(Math.PI * t) * w / 2]) }
  return ccw(pts)
}
const ellipse = (cx, cy, rx, ry, a = 0, n = 32) => ccw(Array.from({ length: n }, (_, i) => { const t = (TAU * i) / n; return add([cx, cy], rotAt([rx * Math.cos(t), ry * Math.sin(t)], a)) }))
const tangentAt = (pts, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; return Math.atan2(b[1] - a[1], b[0] - a[0]) }
const relief = (contours) => ({ relief: { contours, thicken: 0, gap: 0, slits: false } })
const fix = { minW: 2.4, minArea: 6 }

export function nzDesigns() {
  const d = (id, name, blurb, params, draw, extra = {}) => ({ id, name, group: 'Aotearoa', blurb, added: '2026-11-22', overrides: { strutW: 3, frameH: 4, reliefH: 8 }, params, draw, ...extra })
  const nP = (key, label, min, max, value, hint) => ({ key, label, unit: '', min, max, step: 1, value, ...(hint ? { hint } : {}) })
  return [
    d('nzSilverFern', 'Silver Fern', 'Silver fern fronds reaching from the collar to the rim, every frond lined with leaflets that shrink towards the tip. Print the fronds in silver over a black frame.', [nP('fronds', 'Fronds', 3, 8, 5), nP('pinnae', 'Leaflets per side', 6, 20, 12), { key: 'curl', label: 'Frond curve', unit: '°', min: -40, max: 40, step: 1, value: 14 }], (c, g, p) => {
      const rel = []
      for (let i = 0; i < p.fronds; i++) {
        const a0 = g.rot + (TAU * i) / p.fronds, bend = (p.curl * Math.PI) / 180
        const pts = curve([P(g.hubR - 1, a0), P((g.hubR + g.Ri) / 2, a0 + bend * 0.5), P(g.Ri + 1, a0 + bend)], 30)
        c.taper(pts, g.w * 1.6, g.w * 0.9)
        for (let j = 1; j <= p.pinnae; j++) {
          const t = 0.12 + (0.8 * j) / (p.pinnae + 1), idx = Math.round(t * 30), [x, y] = pts[idx], h = tangentAt(pts, idx)
          const len = (g.Ri - g.hubR) * 0.22 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 6
          for (const s of [1, -1]) {
            const tip = add([x, y], P(len, h + s * 0.95))
            c.seg(x, y, tip[0], tip[1], g.w * 0.8, g.w * 0.5)
            rel.push(leaf([x, y], tip, Math.max(3.5, len * 0.3)))
          }
        }
      }
      return { ...relief(rel), frameFix: fix }
    }, { colors: { A: '#1b1b1f', B: '#d8dde3' } }),

    d('nzFrond', 'Unfurling Fronds', 'Young fern fronds just unrolling: each stem sweeps out from the collar and curls into a tight spiral, the way new fern fronds open in the bush.', [nP('fronds', 'Fronds', 3, 8, 6), { key: 'turns', label: 'Curl', unit: 'turns', min: 0.6, max: 2, step: 0.05, value: 1.2 }], (c, g, p) => {
      const rel = []
      for (let i = 0; i < p.fronds; i++) {
        const a0 = g.rot + (TAU * i) / p.fronds
        // the stem: out to the rim, then curling back in on itself
        const stem = curve([P(g.hubR - 1, a0), P(g.hubR + (g.Ri - g.hubR) * 0.5, a0 + 0.12), P(g.Ri - 2, a0 + 0.3)], 24)
        c.taper(stem, g.w * 1.7, g.w * 1.3)
        const [ex, ey] = stem.at(-1)
        const h = tangentAt(stem, stem.length - 1)
        const rho = (g.Ri - g.hubR) * 0.2, spiral = []
        let ang = h + Math.PI / 2, cx = ex - rho * Math.cos(ang), cy = ey - rho * Math.sin(ang)
        const n = Math.ceil(p.turns * 48)
        for (let s = 0; s <= n; s++) { const t = s / n, r = rho * (1 - 0.82 * t), a = ang + TAU * p.turns * t; spiral.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) }
        c.taper(spiral, g.w * 1.3, g.w * 0.8)
        c.disc(spiral.at(-1)[0], spiral.at(-1)[1], g.w)
        rel.push(...spiral.filter((_, s) => s % 6 === 3).map(([x, y]) => ccw(circlePts(x, y, g.w * 0.45, 12))))
        c.seg(ex, ey, ...P(g.Ri + 1, Math.atan2(ey, ex))) // tie the curl to the rim
      }
      return { ...relief(rel), frameFix: fix }
    }),

    d('nzPohutukawa', 'Pōhutukawa', 'The summer Christmas tree in flower: bursts of red stamens tipped with gold, on leafy stems from the collar to the rim. Print the blossoms in red.', [nP('blooms', 'Blossoms', 3, 8, 5), nP('stamens', 'Stamens', 12, 40, 26)], (c, g, p) => {
      const rel = []
      for (let i = 0; i < p.blooms; i++) {
        const a = g.rot + (TAU * i) / p.blooms, rc = g.hubR + (g.Ri - g.hubR) * 0.55, [x, y] = P(rc, a)
        const br = (g.Ri - g.hubR) * 0.38
        c.seg(...P(g.hubR - 1, a), x, y, g.w * 1.4, g.w)
        c.disc(x, y, br * 0.25)
        for (let s = 0; s < p.stamens; s++) {
          const b = (TAU * s) / p.stamens, len = br * (0.75 + 0.25 * ((s * 7) % 3) / 2), tip = add([x, y], P(len, b))
          c.seg(x, y, tip[0], tip[1], g.w * 0.55)
          rel.push(ccw(circlePts(tip[0], tip[1], g.w * 0.65, 10)))
        }
        // two leaves either side of the stem, and a stem on to the rim
        const mid = P(g.hubR + (g.Ri - g.hubR) * 0.22, a)
        for (const s of [1, -1]) { const tip = add(mid, P((g.Ri - g.hubR) * 0.24, a + s * 0.9)); c.solid(leaf(mid, tip, 9)) }
        c.seg(x, y, ...P(g.Ri + 1, a + Math.PI / p.blooms * 0.6))
      }
      return { ...relief(rel), frameFix: fix }
    }, { glow: '#e02a2a' }),

    d('nzKowhai', 'Kōwhai', 'Arching branches hung with clusters of golden kōwhai flowers, the bells the tūī come to drink from. Print the flowers in yellow.', [nP('branches', 'Branches', 3, 7, 5), nP('bells', 'Bells per branch', 3, 9, 6)], (c, g, p) => {
      const rel = []
      for (let i = 0; i < p.branches; i++) {
        const a0 = g.rot + (TAU * i) / p.branches
        const pts = curve([P(g.hubR - 1, a0), P(g.hubR + (g.Ri - g.hubR) * 0.55, a0 + 0.35), P(g.Ri + 1, a0 + 0.55)], 30)
        c.taper(pts, g.w * 1.6, g.w)
        for (let j = 1; j <= p.bells; j++) {
          const idx = Math.round((0.15 + (0.75 * j) / (p.bells + 1)) * 30), [x, y] = pts[idx], h = tangentAt(pts, idx) - Math.PI / 2
          const len = 10 + 5 * (j % 2), tip = add([x, y], P(len, h))
          c.seg(x, y, tip[0], tip[1], g.w * 0.6)
          c.solid(ellipse(tip[0] + Math.cos(h) * 5, tip[1] + Math.sin(h) * 5, 7, 3.5, h))
          rel.push(ellipse(tip[0] + Math.cos(h) * 5, tip[1] + Math.sin(h) * 5, 6, 2.6, h))
        }
      }
      return { ...relief(rel), frameFix: fix }
    }, { glow: '#ffd21a' }),

    d('nzKauri', 'Kauri Rings', 'The rings of an ancient kauri: wavering growth rings round the collar, crossed by the cracks of a fallen giant. Every ring is a year.', [nP('rings', 'Rings', 3, 9, 6), nP('cracks', 'Cracks', 3, 12, 7)], (c, g, p) => {
      const rel = []
      for (let i = 1; i <= p.rings; i++) {
        const r = g.hubR + ((g.Ri - g.hubR) * i) / (p.rings + 1), pts = []
        for (let s = 0; s < 96; s++) { const a = (TAU * s) / 96; pts.push(P(r + 2.2 * Math.sin(a * 5 + i * 1.3) + 1.3 * Math.sin(a * 11 + i), a + g.rot)) }
        c.line(pts, i % 2 ? g.w : g.w * 0.7, true)
        if (i % 2 === 0) rel.push(...pts.filter((_, s) => s % 4 === 0).map(([x, y]) => ccw(circlePts(x, y, g.w * 0.4, 8))))
      }
      for (let k2 = 0; k2 < p.cracks; k2++) {
        const a = g.rot + (TAU * k2) / p.cracks + 0.13 * Math.sin(k2 * 3), pts = []
        for (let s = 0; s <= 10; s++) { const t = s / 10; pts.push(P(g.hubR - 1 + (g.Ri - g.hubR + 2) * t, a + 0.05 * Math.sin(t * 9 + k2))) }
        c.taper(pts, g.w * 1.3, g.w * 0.8)
      }
      return { ...relief(rel), frameFix: fix }
    }),

    d('nzNikau', 'Nīkau Palm', 'The nīkau, the southernmost palm in the world: long arching fronds with fine leaflets, seen from the crown looking down.', [nP('fronds', 'Fronds', 4, 10, 7), nP('leaflets', 'Leaflets per side', 6, 18, 11)], (c, g, p) => {
      const rel = []
      for (let i = 0; i < p.fronds; i++) {
        const a0 = g.rot + (TAU * i) / p.fronds
        const pts = curve([P(g.hubR - 1, a0), P(g.hubR + (g.Ri - g.hubR) * 0.55, a0 - 0.18), P(g.Ri + 1, a0 - 0.12)], 30)
        c.taper(pts, g.w * 1.5, g.w)
        for (let j = 1; j <= p.leaflets; j++) {
          const idx = Math.round((0.18 + (0.74 * j) / (p.leaflets + 1)) * 30), [x, y] = pts[idx], h = tangentAt(pts, idx)
          for (const s of [1, -1]) { const tip = add([x, y], P((g.Ri - g.hubR) * 0.2, h + s * 0.55)); c.seg(x, y, tip[0], tip[1], g.w * 0.75, g.w * 0.45); rel.push(leaf([x, y], tip, 3)) }
        }
      }
      return { ...relief(rel), frameFix: fix }
    }),

    d('nzFantail', 'Pīwakawaka', 'Fantails flitting round the rim, their tails fanned wide: the cheeky little bird that follows you through the bush.', [nP('birds', 'Fantails', 3, 7, 4), nP('feathers', 'Tail feathers', 6, 14, 10)], (c, g, p) => {
      const rel = []
      for (let i = 0; i < p.birds; i++) {
        const a = g.rot + (TAU * i) / p.birds, rb = g.hubR + (g.Ri - g.hubR) * 0.4, [x, y] = P(rb, a)
        const s0 = (g.Ri - g.hubR) * 0.16
        c.solid(ellipse(x, y, s0 * 1.1, s0 * 0.7, a))
        c.disc(...add([x, y], P(-s0 * 1.05, a)), s0 * 0.5) // head towards the collar
        c.seg(...add([x, y], P(-s0 * 1.3, a)), ...P(g.hubR - 1, a), g.w)
        // the tail: a fan of feathers out to the rim
        for (let f = 0; f < p.feathers; f++) {
          const b = a + ((f / (p.feathers - 1)) - 0.5) * (TAU / p.birds) * 0.8, tip = P(g.Ri + 1, b)
          c.seg(x, y, tip[0], tip[1], g.w * 0.9, g.w * 1.4)
          rel.push(leaf(add([x, y], P(s0 * 1.2, b)), P(g.Ri - 4, b), 4))
        }
        rel.push(ellipse(...add([x, y], P(-s0 * 0.6, a)), s0 * 0.45, s0 * 0.25, a)) // the pale eyebrow and chest
      }
      return { ...relief(rel), frameFix: fix }
    }),

    d('nzTui', 'Tūī', 'Tūī perched on flax flower stalks round the hub, each with the white tuft at its throat that marks a tūī. Print the tufts in white.', [nP('birds', 'Tūī', 3, 6, 4)], (c, g, p) => {
      const rel = []
      // flax stalks: arcs from collar to rim between the birds
      for (let i = 0; i < p.birds; i++) {
        const a = g.rot + (TAU * (i + 0.5)) / p.birds
        const stalk = curve([P(g.hubR - 1, a - 0.2), P((g.hubR + g.Ri) / 2, a + 0.1), P(g.Ri + 1, a - 0.05)], 24)
        c.taper(stalk, g.w * 1.5, g.w)
        for (let j = 6; j < 22; j += 5) { const [x, y] = stalk[j]; c.solid(leaf([x, y], add([x, y], P(14, tangentAt(stalk, j) + 0.9)), 5)) }
      }
      for (let i = 0; i < p.birds; i++) {
        const a = g.rot + (TAU * i) / p.birds, rb = g.hubR + (g.Ri - g.hubR) * 0.55, [x, y] = P(rb, a), s0 = (g.Ri - g.hubR) * 0.17
        c.solid(ellipse(x, y, s0 * 1.25, s0 * 0.75, a + 0.4))
        const head = add([x, y], P(s0 * 1.2, a + 1.0)); c.disc(head[0], head[1], s0 * 0.5)
        c.seg(head[0], head[1], ...add(head, P(s0 * 0.9, a + 1.6)), g.w * 0.9, g.w * 0.5) // curved beak
        c.seg(...add([x, y], P(s0 * 1.1, a + Math.PI + 0.4)), ...P(g.Ri + 1, a - 0.15), g.w * 1.2, g.w * 1.8) // the tail to the rim
        c.seg(x, y, ...P(g.hubR - 1, a - 0.1), g.w)
        rel.push(ccw(circlePts(...add(head, P(s0 * 0.55, a + 0.6)), s0 * 0.22, 14))) // the white tuft
        rel.push(ellipse(x, y, s0 * 0.8, s0 * 0.35, a + 0.4))
      }
      return { ...relief(rel), frameFix: fix }
    }, { colors: { A: '#1d2a33', B: '#f2f2f2' } }),

    d('nzWeta', 'Wētā', 'Giant wētā, the ancient insects of the forest floor: armoured backs, spiny legs braced on the rim, antennae curving in to the collar.', [nP('insects', 'Wētā', 3, 6, 4)], (c, g, p) => {
      const rel = []
      for (let i = 0; i < p.insects; i++) {
        const a = g.rot + (TAU * i) / p.insects, rb = g.hubR + (g.Ri - g.hubR) * 0.55, [x, y] = P(rb, a), s0 = (g.Ri - g.hubR) * 0.13
        const body = []
        for (let sgm = 0; sgm < 5; sgm++) { const q = add([x, y], P(s0 * (sgm - 2) * 0.9, a + Math.PI / 2)); body.push(q); c.solid(ellipse(q[0], q[1], s0 * 0.55, s0 * 0.75, a)); rel.push(ellipse(q[0], q[1], s0 * 0.3, s0 * 0.55, a)) }
        // legs: three each side, spiny, to the rim
        for (const s of [-1, 1]) for (let l = 0; l < 3; l++) {
          const hip = add(body[1 + l], P(s0 * 0.5, a)), knee = add(hip, P(s0 * 1.4, a + s * 0.5)), foot = P(g.Ri + 1, a + s * (0.18 + l * 0.12))
          c.taper([hip, knee, foot], g.w * 1.1, g.w * 0.8)
          c.seg(...knee, ...add(knee, P(s0 * 0.5, a + s * 1.4)), g.w * 0.6, g.w * 0.3)
        }
        // antennae: long, curving in to the collar
        const headP = add(body[4], P(s0 * 0.8, a + Math.PI / 2))
        for (const s of [-1, 1]) c.taper(curve([headP, add(headP, P(s0 * 2, a + Math.PI / 2 + s * 0.6)), P(g.hubR - 1, a + s * 0.35)], 16), g.w * 0.8, g.w * 0.6)
        c.seg(...body[0], ...P(g.hubR - 1, a), g.w)
      }
      return { ...relief(rel), frameFix: fix }
    }, { colors: { A: '#3a2414', B: '#b07b3c' } }),
  ]
}

export function canDesigns() {
  const d = (id, name, blurb, params, draw) => ({ id, name, group: 'Cans', blurb, added: '2026-11-22', overrides: { strutW: 3, frameH: 4, reliefH: 7 }, colors: { A: '#4a2c17', B: '#d6a63a' }, params, draw })
  const nP = (key, label, min, max, value) => ({ key, label, unit: '', min, max, step: 1, value })
  // a ring-pull tab (for the can lid): a rounded slab
  const tab = (c, rel, at, ang, L, W) => {
    const outline = []
    for (let i = 0; i <= 16; i++) { const t = Math.PI / 2 - (Math.PI * i) / 16; outline.push(add(at, rotAt([L * 0.62 + (W / 2) * Math.cos(t), (W / 2) * Math.sin(t)], ang))) }
    for (let i = 0; i <= 16; i++) { const t = -Math.PI / 2 - (Math.PI * i) / 16; outline.push(add(at, rotAt([(W * 0.38) * Math.cos(t) * 0.9, (W * 0.38) * Math.sin(t)], ang))) }
    c.solid(ccw(outline))
    return { big: add(at, rotAt([L * 0.52, 0], ang)), small: add(at, rotAt([W * 0.05, 0], ang)), outline }
  }
  return [
    d('canCrushed', 'Crushed Can', 'A can stomped flat at the end of the night: the side crumpled into zigzag pleats round the hub, dents and all.', [nP('pleats', 'Pleats', 8, 24, 14)], (c, g, p) => {
      const rel = [], zig = []
      const rA = g.hubR + (g.Ri - g.hubR) * 0.25, rB = g.Ri - (g.Ri - g.hubR) * 0.12
      for (let i = 0; i <= 2 * p.pleats; i++) { const a = g.rot + (Math.PI * i) / p.pleats; zig.push(P(i % 2 ? rB : rA, a + 0.04 * Math.sin(i * 2.3))) }
      c.line(zig, g.w * 1.3)
      for (let i = 0; i < 2 * p.pleats; i += 2) { c.seg(...P(g.hubR - 1, g.rot + (Math.PI * i) / p.pleats), ...zig[i], g.w); c.seg(...zig[i + 1], ...P(g.Ri + 1, g.rot + (Math.PI * (i + 1)) / p.pleats), g.w) }
      for (let i = 0; i < 2 * p.pleats; i++) { const [x1, y1] = zig[i], [x2, y2] = zig[i + 1]; rel.push(leaf([x1 * 0.97 + x2 * 0.03, y1 * 0.97 + y2 * 0.03], [x2 * 0.97 + x1 * 0.03, y2 * 0.97 + y1 * 0.03], 3.2)) }
      return { ...relief(rel), frameFix: fix }
    }),
  ]
}

export function shroomDesigns() {
  const d = (id, name, blurb, params, draw, extra = {}) => ({ id, name, group: 'Mushrooms', blurb, added: '2026-11-22', overrides: { strutW: 3, frameH: 4, reliefH: 8 }, params, draw, ...extra })
  const nP = (key, label, min, max, value, hint) => ({ key, label, unit: '', min, max, step: 1, value, ...(hint ? { hint } : {}) })
  return [
    d('shroomRing', 'Fairy Ring', 'A fairy ring: toadstools growing out from the collar, their spotted caps pressed up against the rim. Print the caps red and the spots white.', [nP('shrooms', 'Toadstools', 4, 10, 7), nP('spots', 'Spots per cap', 3, 9, 5)], (c, g, p) => {
      const rel = []
      for (let i = 0; i < p.shrooms; i++) {
        const a = g.rot + (TAU * i) / p.shrooms, span = g.Ri - g.hubR
        const capW = Math.min(span * 0.55, (TAU * (g.Ri - span * 0.2)) / p.shrooms * 0.8), capH = capW * 0.55
        const base = P(g.hubR - 1, a), capBase = P(g.Ri - capH - 2, a)
        c.seg(base[0], base[1], capBase[0], capBase[1], g.w * 2.2, g.w * 1.5) // the stem
        // the cap: a dome, its top against the rim
        const dome = []
        for (let s = 0; s <= 24; s++) { const t = Math.PI * (s / 24); dome.push(add(capBase, rotAt([capH * Math.sin(t), (capW / 2) * Math.cos(t)], a))) }
        c.solid(ccw(dome))
        c.seg(...add(capBase, rotAt([capH - 1, 0], a)), ...P(g.Ri + 1, a), g.w * 1.5)
        // a skirt ring on the stem, spots on the cap
        const sk = add(base, rotAt([(Math.hypot(...capBase) - g.hubR) * 0.62, 0], a))
        c.solid(ellipse(sk[0], sk[1], 2.5, g.w * 1.6, a))
        for (let s = 0; s < p.spots; s++) { const t = 0.2 + (0.6 * s) / Math.max(1, p.spots - 1), r0 = capH * (0.35 + 0.3 * ((s * 37) % 10) / 10); rel.push(ccw(circlePts(...add(capBase, rotAt([r0 * Math.sin(Math.PI * t) + 2, (capW / 2 - 4) * Math.cos(Math.PI * t)], a)), Math.max(1.8, capW * 0.06), 14))) }
      }
      return { ...relief(rel), frameFix: fix }
    }, { colors: { A: '#e8e0d0', B: '#d0281e' } }),
    d('shroomGills', 'Under the Cap', 'The underside of a mushroom: fine gills fanning out from the stem to the edge of the cap, long and short between each other, with the skirt ring round the stem.', [nP('gills', 'Long gills', 12, 60, 32), { key: 'between', label: 'Short gills between', options: ['1', '2', '3'], value: '2' }], (c, g, p) => {
      const rel = []
      const n = p.gills, nb = Number(p.between)
      for (let i = 0; i < n; i++) {
        const a = g.rot + (TAU * i) / n
        c.seg(...P(g.hubR - 1, a), ...P(g.Ri + 1, a), g.w * 0.9, g.w * 1.1)
        for (let b = 1; b <= nb; b++) {
          const ab = a + (TAU / n) * (b / (nb + 1)), start = g.hubR + (g.Ri - g.hubR) * (b === Math.ceil(nb / 2) ? 0.35 : 0.62)
          c.seg(...P(start, ab), ...P(g.Ri + 1, ab), g.w * 0.65, g.w * 0.9)
        }
      }
      // the skirt (annulus) round the stem, and a raised edge ring
      c.ring(0, 0, g.hubR + (g.Ri - g.hubR) * 0.12, g.w * 2.2)
      for (let s = 0; s < 48; s++) { const a = g.rot + (TAU * s) / 48; rel.push(ccw(circlePts(...P(g.hubR + (g.Ri - g.hubR) * 0.12, a), g.w * 0.7, 10))) }
      return { ...relief(rel), frameFix: fix }
    }, { colors: { A: '#d9c7a6', B: '#7a5a3a' } }),
  ]
}
