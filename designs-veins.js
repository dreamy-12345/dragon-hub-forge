// Wing Veins family: more layers, a leaf skeleton, and stained-glass panes.
// See designs.js for the design format. Every pattern is one sector copied
// round the disc, so the hubs stay balanced.
import { diskVeins, deg } from './designs.js'
import { TAU, rot, ccw, rng, voronoi, pointInPoly, Canvas } from './geom.js'

/** Stroke a closed cell outline onto a canvas, width by distance from the axis. Edges inside rMin are skipped. */
function strokeCell(rc, pts, wAt, rMin = 0) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    if (Math.hypot((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) < rMin) continue
    const wa = wAt(a), wb = wAt(b)
    rc.seg(a[0], a[1], b[0], b[1], wa, wb)
    rc.disc(a[0], a[1], wa / 2)
  }
}

/** Width that runs from w0 at the collar to w1 at the rim. */
const radial = (g, w0, w1) => ([x, y]) => {
  const t = Math.min(1, Math.max(0, (Math.hypot(x, y) - g.hubR) / (g.Ri - g.hubR)))
  return w0 + (w1 - w0) * t
}

/** Only the parts of a cell inside the disc (and clear of the collar) are worth stroking. */
const inDisc = (g, pts) => pts.some(([x, y]) => { const r = Math.hypot(x, y); return r < g.Ri + 2 && r > g.hubR - 2 })

export const VEINS_DESIGNS = [
  {
    id: 'veinsLayered',
    group: 'Organic',
    name: 'Layered Veins',
    blurb: 'Two vein webs, one over the other: a bold low web and a finer one standing tall, turned half a fold. Spinning, the two layers slide over each other and shimmer.',
    overrides: { strutW: 3.2, frameH: 4.5 },
    params: [
      { key: 'fold', label: 'Symmetry', unit: '-fold', min: 2, max: 9, step: 1, value: 5 },
      { key: 'perFold', label: 'Low cells per fold', unit: '', min: 3, max: 24, step: 1, value: 8 },
      { key: 'finer', label: 'Tall cells per fold', unit: '', min: 3, max: 40, step: 1, value: 17, hint: 'The tall web. More cells than the low one makes the two layers read apart.' },
      { key: 'wIn', label: 'Low vein at collar', unit: 'mm', min: 2.4, max: 12, step: 0.1, value: 7 },
      { key: 'wOut', label: 'Low vein at rim', unit: 'mm', min: 2.4, max: 8, step: 0.1, value: 3.2 },
      { key: 'tIn', label: 'Tall vein at collar', unit: 'mm', min: 2.4, max: 6, step: 0.1, value: 3.4 },
      { key: 'tOut', label: 'Tall vein at rim', unit: 'mm', min: 2.4, max: 5, step: 0.1, value: 2.6 },
      { key: 'twist', label: 'Tall web turned', unit: '%', min: 0, max: 100, step: 1, value: 50, hint: 'How far round the tall web is turned against the low one, as a share of one fold.' },
      { key: 'round', label: 'Softness', unit: 'mm', min: 0, max: 12, step: 0.5, value: 4 },
      { key: 'seed', label: 'Seed', unit: '', min: 1, max: 999, step: 1, value: 42, seed: true },
    ],
    draw(c, g, p) {
      const low = diskVeins(g, { fold: p.fold, perFold: p.perFold, seed: p.seed, wIn: p.wIn, wOut: p.wOut, mirror: false })
      // the tall web: its own seed, turned against the low one
      const gt = { ...g, rot: g.rot + ((TAU / p.fold) * p.twist) / 100 }
      const tall = diskVeins(gt, { fold: p.fold, perFold: p.finer, seed: p.seed * 7 + 3, wIn: 0, wOut: 0, mirror: false })
      const rc = new Canvas(p.strutW)
      const wAt = radial(g, p.tIn, p.tOut)
      for (const cell of tall) if (inDisc(g, cell.pts)) strokeCell(rc, cell.pts, wAt, g.hubR * 0.7) // edges that run into the collar end there; none cross the bore
      return {
        veins: [{ region: 'disk', border: p.wOut, round: p.round, cells: low }],
        relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false },
      }
    },
  },

  {
    id: 'leafSkeleton',
    group: 'Organic',
    name: 'Leaf Skeleton',
    blurb: 'A ring of skeleton leaves, the kind left after a leaf rots away: tall midribs and side veins over a fine low lace of areoles.',
    overrides: { strutW: 3, frameH: 4 },
    params: [
      { key: 'leaves', label: 'Leaves', unit: '', min: 3, max: 9, step: 1, value: 5 },
      { key: 'width', label: 'Leaf width', unit: '%', min: 30, max: 95, step: 1, value: 78, hint: 'Widest point of each leaf, as a share of its slice of the disc.' },
      { key: 'bend', label: 'Lean', unit: '°', min: -40, max: 40, step: 1, value: 18, hint: 'How far each leaf curls round as it reaches the rim. Leaning leaves look like they are already spinning.' },
      { key: 'side', label: 'Side veins', unit: 'per side', min: 3, max: 12, step: 1, value: 7 },
      { key: 'sideAngle', label: 'Side vein angle', unit: '°', min: 25, max: 75, step: 1, value: 48 },
      { key: 'lace', label: 'Areoles per leaf', unit: '', min: 10, max: 90, step: 1, value: 42, hint: 'The little cells between the veins.' },
      { key: 'ribW', label: 'Midrib width', unit: 'mm', min: 3, max: 10, step: 0.1, value: 6 },
      { key: 'seed', label: 'Seed', unit: '', min: 1, max: 999, step: 1, value: 42, seed: true },
    ],
    draw(c, g, p) {
      const span = TAU / p.leaves
      const r0 = g.hubR - 2, r1 = g.Ri + 1.5
      const lean = deg(p.bend)
      const N = 48
      // one leaf along +x: midrib centre, heading, half-width at each step
      const mid = [], head = [], half = []
      for (let i = 0; i <= N; i++) {
        const t = i / N
        const r = r0 + (r1 - r0) * t
        const a = lean * t * t
        mid.push([r * Math.cos(a), r * Math.sin(a)])
        const shape = Math.sin(Math.PI * Math.min(1, t * 1.04)) ** 0.75 * (0.35 + 0.65 * Math.min(1, t * 1.6))
        // arc available at this radius, so neighbouring leaves never touch
        half.push(Math.max(0, (r * span * (p.width / 100) * 0.5) * shape))
      }
      for (let i = 0; i <= N; i++) {
        const a = mid[Math.min(N, i + 1)], b = mid[Math.max(0, i - 1)]
        head.push(Math.atan2(a[1] - b[1], a[0] - b[0]))
      }
      const at = (i, s) => { const n = head[i] + Math.PI / 2; return [mid[i][0] + s * half[i] * Math.cos(n), mid[i][1] + s * half[i] * Math.sin(n)] }
      const outline = []
      for (let i = 0; i <= N; i++) outline.push(at(i, 1))
      for (let i = N; i >= 0; i--) outline.push(at(i, -1))

      // veins of one leaf, drawn on a scratch canvas then copied round
      const one = new Canvas(p.strutW)
      one.taper(mid, p.ribW, 2.8)
      const sideA = deg(p.sideAngle)
      for (let k = 1; k <= p.side; k++) {
        const t0 = 0.08 + (0.8 * k) / (p.side + 1)
        const i0 = Math.round(t0 * N)
        for (const s of [1, -1]) {
          // a gentle curve: leaves the midrib at the side-vein angle, meets the margin further up
          const i1 = Math.min(N - 2, i0 + Math.round((0.1 + 0.08 * (1 - t0)) * N))
          const P0 = mid[i0], P2 = at(i1, s * 0.86)
          const turn = head[i0] + s * sideA
          const L = Math.hypot(P2[0] - P0[0], P2[1] - P0[1]) * 0.5
          const P1 = [P0[0] + Math.cos(turn) * L, P0[1] + Math.sin(turn) * L]
          const pts = []
          for (let q = 0; q <= 12; q++) {
            const u = q / 12, v = 1 - u
            pts.push([v * v * P0[0] + 2 * u * v * P1[0] + u * u * P2[0], v * v * P0[1] + 2 * u * v * P1[1] + u * u * P2[1]])
          }
          one.taper(pts, 3.4, 2.6)
        }
      }
      const rc = new Canvas(p.strutW)
      const outlines = []
      for (let f = 0; f < p.leaves; f++) {
        const a = g.rot + f * span
        for (const poly of one.contours) rc.contours.push(poly.map((q) => rot(q, a)))
        outlines.push(ccw(outline.map((q) => rot(q, a))))
      }

      // areoles: random sites inside one leaf, copied round, as a low lace
      const rand = rng(p.seed)
      const sector = []
      let tries = 0
      while (sector.length < p.lace && tries++ < p.lace * 60) {
        const t = 0.06 + 0.92 * rand(), s = (rand() * 2 - 1) * 0.92
        const i = Math.round(t * N)
        const q = at(i, s)
        if (pointInPoly(q, outline)) sector.push(q)
      }
      const sites = []
      for (let f = 0; f < p.leaves; f++) for (const s of sector) sites.push(rot(s, g.rot + f * span))
      const cells = voronoi(sites, g.R + 4).map((pts) => ({ pts, inset: 1.35 }))
      // a ring just inside the rim ties the leaf tips together where they lean
      c.ring(0, 0, g.Ri - 1, 3)
      return {
        veins: [{ region: outlines, border: 3, round: 2.5, cells }],
        relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false },
      }
    },
  },

  {
    id: 'glassWing',
    group: 'Organic',
    name: 'Stained-Glass Wing',
    blurb: 'Wing venation with some cells glazed: thin clear panes at the bottom of tall dark leading, like a church window made of dragonfly wing. Print the panes in clear TPU and they catch every light and blacklight in the room.',
    overrides: { strutW: 3.2, frameH: 4.5, membraneH: 1.6 },
    glow: '#7fd8ff',
    params: [
      { key: 'fold', label: 'Symmetry', unit: '-fold', min: 2, max: 9, step: 1, value: 6 },
      { key: 'perFold', label: 'Cells per fold', unit: '', min: 4, max: 24, step: 1, value: 12 },
      { key: 'glass', label: 'Glazed cells', unit: '%', min: 10, max: 100, step: 1, value: 55, hint: 'Share of the cells that get a clear pane. The same cells in every fold, so it stays balanced.' },
      { key: 'wIn', label: 'Vein at collar', unit: 'mm', min: 2.4, max: 12, step: 0.1, value: 6 },
      { key: 'wOut', label: 'Vein at rim', unit: 'mm', min: 2.4, max: 8, step: 0.1, value: 3 },
      { key: 'lead', label: 'Leading', unit: 'mm', min: 2.4, max: 5, step: 0.1, value: 2.8, hint: 'The tall walls round each pane.' },
      { key: 'round', label: 'Softness', unit: 'mm', min: 0, max: 10, step: 0.5, value: 3 },
      { key: 'mirror', label: 'Mirror each fold', options: ['off', 'on'], value: 'on' },
      { key: 'seed', label: 'Seed', unit: '', min: 1, max: 999, step: 1, value: 42, seed: true },
    ],
    draw(c, g, p) {
      const mirror = p.mirror === 'on'
      const cells = diskVeins(g, { fold: p.fold, perFold: p.perFold, seed: p.seed, wIn: p.wIn, wOut: p.wOut, mirror })
      const per = cells.length / p.fold // diskVeins lists the cells fold by fold, same order each fold
      const rand = rng(p.seed * 13 + 5)
      const pick = Array.from({ length: per }, () => rand() * 100 < p.glass)
      const veins = [{ region: 'disk', border: p.wOut, round: p.round, cells }]
      const rc = new Canvas(p.strutW)
      const wAt = () => p.lead
      cells.forEach((cell, i) => {
        if (!pick[i % per] || !inDisc(g, cell.pts)) return
        // only cells wholly inside the disc: a pane cut by the rim looks like a mistake
        if (cell.pts.some(([x, y]) => Math.hypot(x, y) > g.Ri - 1 || Math.hypot(x, y) < g.hubR + 1)) return
        veins.push({ region: [ccw(cell.pts)], border: cell.inset + 0.5, round: p.round, cells: [{ pts: cell.pts, inset: cell.inset + 0.5 }], membrane: true })
        strokeCell(rc, cell.pts, wAt)
      })
      return { veins, relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
]
