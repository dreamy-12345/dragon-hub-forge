/**
 * The hub designs. Each one draws in millimetres around the staff axis and
 * returns what to build at each level:
 *
 *   c (Canvas)  frame strokes: the low, thin support web
 *   veins       organic Voronoi webs: [{ region, cells: [{ pts, inset }], border, round }]
 *               region: 'disk' or a list of contours the cells are cut out of
 *   relief      tall solid shapes that stand proud of the frame: { contours, thicken, gap, slits }
 *   pods        glowing capsule lanterns: [{ shapes: [contours], cap: { x, y, angle } }]
 *   strobe      number of animation frames per turn (zoetrope designs)
 *
 * g = { R, Ri, Rc, hubR, w, rimW, rot, cap: { L, D } }; p = all params.
 */

import { tinyDesigns } from './tiny.js'
import { JUNCTIONS, EDGES, RING_RADII } from './dome.js'
import { DOGS_DESIGNS } from './designs-dogs.js'
import { VEINS_DESIGNS } from './designs-veins.js'
import { SIGNATURE_DESIGNS } from './designs-signature.js'
import { LOYALDOG_DESIGNS } from './designs-loyaldog.js'
import { MELT_DESIGNS } from './designs-melt.js'
import { CUSTOM_DESIGNS } from './designs-custom.js'
import { fireDesigns } from './designs-fire.js'
import { ballDesigns } from './balls.js'
import { sleeveDesigns } from './inserts.js'
import { practiceDesigns } from './practice.js'
import { noveltyDesigns } from './novelty.js'
import { dartDesigns } from './darts.js'
import { gripDesigns } from './grip.js'
import { mouldDesigns } from './moulds.js'
import { hoopDesigns, jointDesigns } from './hoops.js'
import { bubblePoiDesigns } from './bubblepoi.js'
import { bubbleHubDesigns } from './bubblehub.js'
import { swordDesigns } from './swords.js'
import { acroDesigns } from './acro.js'
import { pineHubDesigns } from './pinecone.js'
import { dowelDesigns } from './dowel.js'
import { tubeSwordDesigns, tubeAxeDesigns, tubeMaceDesigns, plateAxeDesigns } from './tubeswords.js'
import { fistDesigns } from './fist.js'
import { hiltDesigns } from './hilt.js'
import { cageDesigns } from './cages.js'
import { nzDesigns, canDesigns, shroomDesigns } from './nz.js'
import { TAU, rot, place, ccw, cw, rng, voronoi, pointInPoly, circlePts, HEART, wingPoly, logoDragonfly, Canvas } from './geom.js'

const deg = (d) => (d * Math.PI) / 180

// ---------------------------------------------------------------- frames ---

function drawSpokes(c, g, n, offset = 0, w = g.w) {
  for (let i = 0; i < n; i++) {
    const a = g.rot + offset + (TAU * i) / n
    c.line([[g.Rc * Math.cos(a), g.Rc * Math.sin(a)], [(g.Ri + w) * Math.cos(a), (g.Ri + w) * Math.sin(a)]], w)
  }
}

function drawVortex(c, g, arms, twistDeg, wScale = 1, oneWay = false) {
  const twist = deg(twistDeg)
  const r0 = g.Rc * 0.9, r1 = g.Ri + g.w
  const k = Math.log(r1 / r0) / twist
  for (const dir of oneWay ? [1] : [1, -1])
    for (let i = 0; i < arms; i++) {
      const a0 = g.rot + (TAU * i) / arms
      const pts = []
      for (let s = 0; s <= 40; s++) {
        const th = (twist * s) / 40
        const r = r0 * Math.exp(k * th)
        pts.push([r * Math.cos(a0 + dir * th), r * Math.sin(a0 + dir * th)])
      }
      c.line(pts, g.w * wScale)
    }
}

// The venue's real dome (space-ship-game/shared/dome.js), seen from above.
function drawDome(c, g, opts = {}) {
  const r0 = RING_RADII[0], r4 = RING_RADII[RING_RADII.length - 1]
  const inner = g.Rc + g.w * 1.2
  const map = (r) => (r === 0 ? 0 : inner + ((g.Ri - inner) * (r - r4)) / (r0 - r4))
  const P = JUNCTIONS.map((j) => rot([map(j.radius) * Math.cos(-j.angle), map(j.radius) * Math.sin(-j.angle)], g.rot))
  const w = opts.w ?? g.w
  // opts.rc: a second canvas for the colour-B parts (rings and/or junctions), raised as relief
  const onRing = (e) => JUNCTIONS[e.a].ring === JUNCTIONS[e.b].ring
  for (const e of EDGES) {
    const to = opts.rc && opts.rings && onRing(e) ? opts.rc : c
    to.seg(P[e.a][0], P[e.a][1], P[e.b][0], P[e.b][1], w)
  }
  for (const p of P) c.disc(p[0], p[1], (opts.node || w) / 2)
  if (opts.rc && opts.joints) for (const p of P) { if (Math.hypot(p[0], p[1]) >= (opts.jointMin || 0)) opts.rc.disc(p[0], p[1], (opts.node || w) / 2 + 0.6) }
  else if (opts.rc && opts.rings) P.forEach((p, i) => JUNCTIONS[i].radius > 0 && opts.rc.disc(p[0], p[1], w / 2)) // round the ring corners
}

/** Cubic Bézier sampled to points. */
function bez(p0, p1, p2, p3, n = 32) {
  const out = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t
    out.push([0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]))
  }
  return out
}

/**
 * Vines: tapered S-curves from collar to rim, each with a curling tendril.
 * Curls stay at least 2.6 mm wide so they do not flag as weak.
 */
function drawVines(c, g, angles, sway = 18, curls = true) {
  const pol = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
  angles.forEach((b, i) => {
    const s = deg(sway) * (i % 2 ? -1 : 1)
    const r0 = g.hubR - 1, r3 = g.Ri + 1
    const pts = bez(pol(r0, b), pol(r0 + (r3 - r0) * 0.35, b + s), pol(r0 + (r3 - r0) * 0.65, b - s), pol(r3, b + s * 0.3))
    c.taper(pts, g.w * 1.5, g.w * 0.95)
    if (!curls) return
    // tendril from 55% along, curling away to one side
    const k = Math.round(pts.length * 0.55)
    const [px, py] = pts[k]
    const [qx, qy] = pts[k + 1]
    let dir = Math.atan2(qy - py, qx - px) + (i % 2 ? -1 : 1) * 0.9
    const side = i % 2 ? -1 : 1
    const tendril = [[px, py]]
    let x = px, y = py, r = (g.Ri - g.Rc) * 0.07
    for (let t = 0; t < 44; t++) {
      dir += side * (0.18 + t * 0.006)
      x += Math.cos(dir) * r * 0.35
      y += Math.sin(dir) * r * 0.35
      tendril.push([x, y])
      r *= 0.985
    }
    c.taper(tendril, g.w * 1.1, Math.max(2.6, g.w * 0.75))
  })
}

/** Organic web cells over the whole disc, tapering from thick at the collar to thin at the rim. */
function diskVeins(g, { fold, perFold, seed, wIn, wOut, mirror, exclude = [] }) {
  const rand = rng(seed)
  const span = TAU / fold
  // one sector of sites, copied round: identical sectors keep the hub balanced
  const sector = []
  for (let k = 0; k < perFold; k++) {
    const u = rand(), v = rand()
    const r = g.hubR + (g.Ri - g.hubR) * (0.06 + 0.94 * u ** 0.7)
    const th = (mirror ? v * 0.5 : v) * span
    sector.push([r * Math.cos(th), r * Math.sin(th)])
    if (mirror) sector.push([r * Math.cos(span - th), r * Math.sin(span - th)])
  }
  const sites = []
  for (let f = 0; f < fold; f++) for (const s of sector) sites.push(rot(s, g.rot + f * span))
  const kept = sites.filter((s) => !exclude.some((poly) => pointInPoly(s, poly)))
  const cells = voronoi(kept, g.R + 4)
  const wAt = ([x, y]) => {
    const t = Math.min(1, Math.max(0, (Math.hypot(x, y) - g.hubR) / (g.Ri - g.hubR)))
    return wIn + (wOut - wIn) * t
  }
  return cells.map((pts, i) => ({ pts, inset: wAt(kept[i]) / 2 }))
}

// ------------------------------------------------------------- creatures ---

/**
 * A stylised dragon head, pointing along +x, length `len`, jaw open.
 * Returns the outline, horn and whisker strokes, and the eye (a recess).
 */
function dragonHead(len) {
  const u = (pts) => pts.map(([x, y]) => [x * len, y * len])
  return {
    outline: u([
      [-0.05, 0.13], [0.18, 0.24], [0.42, 0.22], [0.66, 0.15], [0.9, 0.12], [1.0, 0.07], [0.98, 0.0],
      [0.62, 0.0], [0.93, -0.1], [0.88, -0.17], [0.55, -0.2], [0.25, -0.2], [-0.05, -0.13],
    ]),
    horns: [u([[0.3, 0.2], [0.12, 0.34], [-0.1, 0.44], [-0.32, 0.47]]), u([[0.42, 0.2], [0.3, 0.36], [0.14, 0.5], [-0.04, 0.56]])],
    whiskers: [u([[0.95, 0.08], [1.05, 0.22], [0.98, 0.38], [0.8, 0.46], [0.6, 0.44]]), u([[0.9, -0.15], [1.02, -0.3], [0.95, -0.46], [0.76, -0.52]])],
    eye: [0.6 * len, 0.12 * len, 0.045 * len],
    nostril: [0.92 * len, 0.06 * len, 0.025 * len],
  }
}

/**
 * Draw a dragon body along `path` (points from tail to head) into relief
 * canvas `rc`, with spines on the `spineSide` (+1 = left of travel), scale
 * recesses into `holes`, and a head at the end. Width runs w(t), t = 0..1.
 */
function drawDragonBody(rc, holes, path, w, opts) {
  const n = path.length
  const tang = (i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
  }
  // body
  for (let i = 0; i < n - 1; i++) rc.seg(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], w(i / (n - 1)), w((i + 1) / (n - 1)))
  path.forEach((q, i) => rc.disc(q[0], q[1], w(i / (n - 1)) / 2))
  // spines: triangles on one side, every `spineEvery` points
  if (opts.spines)
    for (let i = 2; i < n - 3; i += opts.spineEvery) {
      const t = i / (n - 1), [tx, ty] = tang(i), [nx, ny] = [-ty * opts.spineSide, tx * opts.spineSide]
      const half = w(t) / 2, h = opts.spineH ? opts.spineH(t, path[i]) : half * 0.9
      const [x, y] = path[i]
      rc.solid([
        [x + nx * (half - 1) - tx * half * 0.6, y + ny * (half - 1) - ty * half * 0.6],
        [x + nx * (half - 1) + tx * half * 0.6, y + ny * (half - 1) + ty * half * 0.6],
        [x + nx * (half + h) - tx * half * 0.5, y + ny * (half + h) - ty * half * 0.5],
      ])
    }
  // scales: shallow chevrons pressed into the top of the body
  if (opts.scales)
    for (let i = 3; i < n - 4; i += opts.scaleEvery) {
      const t = i / (n - 1), [tx, ty] = tang(i), half = w(t) / 2
      if (half < 4) continue
      const [x, y] = path[i]
      const nx = -ty, ny = tx
      const tip = [x + tx * half * 0.35, y + ty * half * 0.35]
      const sw = 1.3
      for (const s of [1, -1]) {
        const end = [x + nx * s * half * 0.6, y + ny * s * half * 0.6]
        const ux = end[0] - tip[0], uy = end[1] - tip[1], L = Math.hypot(ux, uy)
        const px = (-uy / L) * sw / 2, py = (ux / L) * sw / 2
        holes.push(ccw([[tip[0] + px, tip[1] + py], [end[0] + px, end[1] + py], [end[0] - px, end[1] - py], [tip[0] - px, tip[1] - py]]))
      }
    }
  // head at the end, facing along the last tangent
  const [hx, hy] = path[n - 1], [tx, ty] = tang(n - 1)
  const ang = Math.atan2(ty, tx)
  const flip = opts.spineSide < 0 ? -1 : 1 // keep horns on the spine side
  const H = dragonHead(opts.headLen)
  const put = (pts) => place(pts.map(([x, y]) => [x - opts.headLen * 0.12, y * flip]), ang, hx, hy)
  rc.solid(put(H.outline))
  for (const horn of H.horns) rc.taper(put(horn), opts.headLen * 0.09, 2.8)
  if (opts.whiskers) for (const wsk of H.whiskers) rc.taper(put(wsk), 3.2, 2.6)
  for (const [ex, ey, er] of [H.eye, H.nostril]) {
    const [cx, cy] = put([[ex, ey]])[0]
    holes.push(ccw(circlePts(cx, cy, Math.max(1.6, er), 20)))
  }
}

/** Phyllotaxis: dot k at angle k·divergence, radius ∝ √k (Vogel), as in visuals/src/phyllotaxis.js. */
function phyllotaxis(g, { dots, angle, start, swirl, sizeIn, sizeOut }) {
  const div = (angle * Math.PI) / 180
  const r0 = g.hubR + 2 + ((g.Ri - g.hubR) * start) / 100
  const r1 = g.Ri - sizeOut / 2 + 1
  const out = []
  for (let k = 0; k < dots; k++) {
    const f = Math.sqrt((k + 0.5) / dots)
    const r = r0 + (r1 - r0) * f
    const th = g.rot + k * div + (swirl * Math.PI) / 180 * f
    out.push({ x: r * Math.cos(th), y: r * Math.sin(th), r, d: sizeIn + (sizeOut - sizeIn) * f })
  }
  return { pts: out, r0, r1 }
}

// ---------------------------------------------------------------- designs ---

// Pole adaptors are not hubs: hub.js builds them with buildAdaptor (adaptor: true).
const adaptorParams = (small, style) => [
  { key: 'small', label: 'Fits pole (OD)', unit: 'mm', min: 6, max: 36, step: 0.1, value: small, presets: [13, 16], hint: 'The thin pole the adaptor slides onto.' },
  { key: 'big', label: 'Hub made for (OD)', unit: 'mm', min: 10, max: 40, step: 0.1, value: 22, presets: [16, 22], hint: 'The outside of the adaptor: the pole size the hub was printed for. The hub grips it like a real pole.' },
  { key: 'length', label: 'Length', unit: 'mm', min: 8, max: 80, step: 0.5, value: 26, hint: 'Match the hub collar length (26 mm as standard) so the adaptor fills the whole bore.' },
  { key: 'lip', label: 'Stop lip', unit: 'mm', min: 0, max: 5, step: 0.1, value: 2, hint: 'A ring on one end so the hub cannot slide off. 0 = plain tube.' },
  { key: 'lipW', label: 'Lip width', unit: 'mm', min: 1, max: 10, step: 0.5, value: 4 },
  { key: 'style', label: 'Style', options: ['solid', 'collet'], value: style, hint: 'Collet: slit along its length, so the hub squeezes it tight onto the pole. Forgives poles that are a bit over or under size.' },
  { key: 'slit', label: 'Slit width', unit: 'mm', min: 0.5, max: 4, step: 0.1, value: 1.5 },
  { key: 'fit', label: 'Bore clearance', unit: 'mm', min: -1, max: 1.5, step: 0.05, value: 0.3, hint: 'Bore = pole + this. If it slides on the pole, lower it 0.1 mm at a time.' },
  { key: 'ribs', label: 'Crush ribs', unit: '', min: 0, max: 12, step: 1, value: 6 },
  { key: 'ribH', label: 'Rib height', unit: 'mm', min: 0.1, max: 1.5, step: 0.05, value: 0.55 },
  { key: 'screw', label: 'Set-screw hole', unit: 'mm', min: 0, max: 5, step: 0.1, value: 0, hint: 'Match the hub: a clear hole so its set screw reaches the pole. 0 = none.' },
]

export const DESIGNS = [
  ...CUSTOM_DESIGNS.map((d) => Object.assign(d, { added: '2026-11-18' })),
  // ================================================================== ADAPTORS
  {
    id: 'adapt13',
    name: 'Pole adaptor 13 → 22',
    group: 'Adaptors',
    adaptor: true,
    added: '2026-11-17',
    blurb: 'Slides onto a 13 mm pole and makes it 22 mm, so any standard hub fits. Push the adaptor on, then the hub, collar against the lip.',
    params: adaptorParams(13, 'solid'),
  },
  {
    id: 'adapt16',
    name: 'Pole adaptor 16 → 22',
    group: 'Adaptors',
    adaptor: true,
    added: '2026-11-17',
    blurb: 'Slides onto a 16 mm pole and makes it 22 mm, so any standard hub fits. Push the adaptor on, then the hub, collar against the lip.',
    params: adaptorParams(16, 'solid'),
  },
  {
    id: 'adaptCollet',
    name: 'Collet adaptor',
    group: 'Adaptors',
    adaptor: true,
    added: '2026-11-17',
    blurb: 'A split adaptor: the slit lets the hub squeeze it tight onto the pole. Grips poles that are a little over or under size.',
    params: adaptorParams(13, 'collet'),
  },
  // ===================================================================== GLOW
  {
    id: 'hearts',
    group: 'Glow',
    name: 'Heart Lanterns',
    blurb: 'Hollow hearts in clear TPU, each holding a LED capsule, on a low dark frame. Only the hearts light up.',
    glow: '#ff3d7f',
    pods: true,
    overrides: { strutW: 3.2, frameH: 4 },
    params: [
      { key: 'hearts', label: 'Hearts', unit: '', min: 2, max: 5, step: 1, value: 3 },
      { key: 'heartSize', label: 'Heart size', unit: '%', min: 60, max: 105, step: 1, value: 100 },
      { key: 'lean', label: 'Lean', unit: '°', min: -35, max: 35, step: 1, value: 14, hint: 'Tilts each heart off the radius so the ring looks like it is turning even when still.' },
      { key: 'frame', label: 'Frame', options: ['vines', 'veins', 'spokes'], value: 'vines' },
      { key: 'seed', label: 'Vein seed', unit: '', min: 1, max: 999, step: 1, value: 7, seed: true },
    ],
    draw(c, g, p) {
      const n = p.hearts
      const rp = g.hubR + 1 // heart point sits on the collar flare
      const H = (g.Ri + g.rimW * 0.35 - rp) * (p.heartSize / 100)
      const pods = []
      const outlines = []
      for (let i = 0; i < n; i++) {
        const a = g.rot + (TAU * i) / n
        const turn = a - Math.PI / 2 + deg(p.lean)
        const shape = place(HEART.pts.map(([x, y]) => [x * H, y * H]), turn, rp * Math.cos(a), rp * Math.sin(a))
        const [cx, cy] = place([[0, HEART.wide * H]], turn, rp * Math.cos(a), rp * Math.sin(a))[0]
        pods.push({ shapes: [shape], cap: { x: cx, y: cy, angle: turn } })
        outlines.push(shape)
      }
      const between = Array.from({ length: n }, (_, i) => g.rot + (TAU * (i + 0.5)) / n)
      const out = { pods }
      if (p.frame === 'vines') drawVines(c, g, between)
      else if (p.frame === 'spokes') drawSpokes(c, g, n, Math.PI / n)
      else out.veins = [{ region: 'disk', border: g.w, round: 3, cells: diskVeins(g, { fold: n, perFold: 9, seed: p.seed, wIn: g.w * 1.6, wOut: g.w * 0.9, exclude: outlines }) }]
      return out
    },
  },
  {
    id: 'lanterns',
    group: 'Glow',
    name: 'Dragonfly Lanterns',
    blurb: 'Each body holds a capsule. The wings are clear membranes lit from the body, with dark veins standing proud like the real thing.',
    glow: '#3fe0ff',
    pods: true,
    overrides: { strutW: 3, frameH: 4 },
    params: [
      { key: 'flies', label: 'Dragonflies', unit: '', min: 2, max: 4, step: 1, value: 2 },
      { key: 'orbit', label: 'Orbit radius', unit: '%', min: 40, max: 80, step: 1, value: 55 },
      { key: 'heading', label: 'Heading', unit: '°', min: 0, max: 90, step: 1, value: 0, hint: '0 = chasing round the circle, 90 = flying straight out. In between they spiral, which leaves room for big wings.' },
      { key: 'tail', label: 'Tail length', unit: 'mm', min: 0, max: 50, step: 1, value: 16 },
      { key: 'sweep', label: 'Wing sweep', unit: '°', min: 0, max: 50, step: 1, value: 32 },
      { key: 'veinCells', label: 'Wing cells', unit: '', min: 3, max: 40, step: 1, value: 6 },
      { key: 'seed', label: 'Vein seed', unit: '', min: 1, max: 999, step: 1, value: 11, seed: true },
    ],
    draw(c, g, p) {
      const pods = [], veins = []
      const L = g.cap.L, D = g.cap.D
      const rho = g.Ri * (p.orbit / 100)
      const headR = D * 0.62
      const tube = D / 2 + g.cradleWall + g.podWall
      for (let i = 0; i < p.flies; i++) {
        const a = g.rot + (TAU * i) / p.flies
        const head = a + Math.PI / 2 - deg(p.heading) // anticlockwise round the circle, turned outward by `heading`
        const ox = rho * Math.cos(a), oy = rho * Math.sin(a)
        // body along local +x, capsule centred on the origin
        const tailPts = []
        for (let k = 0; k <= 12; k++) {
          const t = k / 12
          tailPts.push([-L / 2 - p.tail * t, (D * 0.34) * (1 - t) + 1.6 * t])
        }
        const tail = p.tail > 0 ? [...tailPts, ...tailPts.slice().reverse().map(([x, y]) => [x, -y])] : null
        const hx = L / 2 + headR * 0.55
        const thoraxPts = []
        for (let k2 = 0; k2 < 40; k2++) {
          const t = (TAU * k2) / 40
          thoraxPts.push([L / 2 - 18 + 17 * Math.cos(t), tube * 1.22 * Math.sin(t)])
        }
        const shapes = [
          circlePts(hx, 0, headR, 40),
          circlePts(hx + headR * 0.35, headR * 0.62, headR * 0.6, 28), // eyes
          circlePts(hx + headR * 0.35, -headR * 0.62, headR * 0.6, 28),
          thoraxPts,
          ...(tail ? [tail] : []),
        ].map((s) => place(s, head, ox, oy))
        pods.push({ shapes, cap: { x: ox, y: oy, angle: head } })

        // four veined wings rooted at the thorax, reaching rim and collar
        const thorax = L / 2 - 16
        const roots = [
          [thorax, 1, 90 - p.sweep * 0.4], [thorax, -1, 90 - p.sweep * 0.4],
          [thorax - 14, 1, 90 + p.sweep], [thorax - 14, -1, 90 + p.sweep],
        ]
        const rand = rng(p.seed + i * 0) // same veins on every dragonfly keeps them balanced
        for (const [rx, side, ang] of roots) {
          const root = place([[rx, (side * D) / 2]], head, ox, oy)[0]
          const dirA = head + side * deg(ang)
          const d = [Math.cos(dirA), Math.sin(dirA)]
          const pd = root[0] * d[0] + root[1] * d[1]
          const pp = root[0] ** 2 + root[1] ** 2
          const outward = pd > 0
          let len
          if (outward) len = -pd + Math.sqrt(pd * pd - (pp - (g.Ri + 4) ** 2))
          else {
            const disc = pd * pd - (pp - (g.hubR - 2) ** 2)
            len = disc >= 0 ? -pd - Math.sqrt(disc) : -pd + 4
          }
          const W = Math.min(60, Math.max(22, len * 0.5))
          const local = wingPoly(len, W)
          // put the curved trailing edge at the back of the dragonfly on both sides
          const shaped = side > 0 ? local.map(([x, y]) => [x, -y]) : local
          const wing = place(shaped, dirA, root[0], root[1])
          // vein sites inside the wing, in wing-local coordinates
          const sites = []
          let guard = 0
          while (sites.length < p.veinCells && guard++ < 5000) {
            const s = [rand() * len, (rand() - 0.5) * W * 1.2]
            if (pointInPoly(s, shaped)) sites.push(s)
          }
          const cells = voronoi(sites, len + W).map((pts) => ({ pts: place(pts, dirA, root[0], root[1]), inset: 1.25 }))
          // membrane: the wing is also a thin clear plate fused to the body, lit by its capsule
          veins.push({ region: [ccw(wing)], border: g.w * 0.95, round: 1.6, cells, membrane: true })
        }
      }
      return { pods, veins }
    },
  },
  {
    id: 'zoetrope',
    group: 'Glow',
    name: 'Zoetrope',
    blurb: 'A ring of small dragonflies, each one wing-beat further on. Under a strobe they flap and fly.',
    glow: '#b9ff5c',
    overrides: { strutW: 3, frameH: 4, reliefH: 11 },
    params: [
      { key: 'zCount', label: 'Dragonflies', unit: '', min: 6, max: 20, step: 1, value: 12, hint: 'Also the number of strobe flashes per turn.' },
      { key: 'zFlaps', label: 'Wing beats per turn', unit: '', min: 1, max: 5, step: 1, value: 2 },
      { key: 'zSize', label: 'Size', unit: '%', min: 10, max: 26, step: 0.5, value: 20 },
      { key: 'zOrbit', label: 'Orbit radius', unit: '%', min: 40, max: 80, step: 1, value: 66 },
    ],
    strobe: (p) => p.zCount,
    draw(c, g, p) {
      const N = p.zCount
      const s = g.Ri * (p.zSize / 100)
      const rho = g.Ri * (p.zOrbit / 100)
      const contours = []
      const rIn = rho - s * 0.95, rOut = rho + s * 0.95
      c.ring(0, 0, rIn)
      c.ring(0, 0, rOut)
      for (let i = 0; i < N; i++) {
        const a = g.rot + (TAU * i) / N
        // heads point clockwise, the way the strobe animation moves them
        contours.push(...logoDragonfly(s, a - Math.PI, rho * Math.cos(a), rho * Math.sin(a), { flap: (TAU * p.zFlaps * i) / N }))
        // perch: a low strut under each body ties it to both rings
        c.line([[rIn * Math.cos(a), rIn * Math.sin(a)], [rOut * Math.cos(a), rOut * Math.sin(a)]], g.w * 0.8)
        const b = a + Math.PI / N
        const pol = (r) => [r * Math.cos(b), r * Math.sin(b)]
        if (i % 2 === 0) c.line([pol(g.Rc), pol(rIn)])
        else c.line([pol(rOut), pol(g.Ri + g.w)])
      }
      return { relief: { contours, thicken: 0.9, gap: 0, slits: false } }
    },
  },

  // ================================================================= ORGANIC
  {
    id: 'veins',
    group: 'Organic',
    name: 'Wing Veins',
    blurb: 'The whole disc as dragonfly-wing venation: soft Voronoi cells, thick at the collar and fine at the rim.',
    overrides: { strutW: 3.2, frameH: 6 },
    params: [
      { key: 'fold', label: 'Symmetry', unit: '-fold', min: 2, max: 9, step: 1, value: 5 },
      { key: 'perFold', label: 'Cells per fold', unit: '', min: 3, max: 30, step: 1, value: 11 },
      { key: 'wIn', label: 'Vein width at collar', unit: 'mm', min: 2.4, max: 12, step: 0.1, value: 6.5 },
      { key: 'wOut', label: 'Vein width at rim', unit: 'mm', min: 2.4, max: 8, step: 0.1, value: 2.8 },
      { key: 'round', label: 'Softness', unit: 'mm', min: 0, max: 12, step: 0.5, value: 5 },
      { key: 'mirror', label: 'Mirror each fold', options: ['off', 'on'], value: 'off' },
      { key: 'seed', label: 'Seed', unit: '', min: 1, max: 999, step: 1, value: 42, seed: true },
    ],
    draw(c, g, p) {
      const cells = diskVeins(g, { fold: p.fold, perFold: p.perFold, seed: p.seed, wIn: p.wIn, wOut: p.wOut, mirror: p.mirror === 'on' })
      return { veins: [{ region: 'disk', border: p.wOut, round: p.round, cells }] }
    },
  },


  {
    id: 'phyllo',
    group: 'Organic',
    name: 'Spiral Dots',
    blurb: 'The phyllotaxis spiral from the dome visuals: dots on the golden angle, linked along their spiral arms.',
    overrides: { strutW: 2.8, frameH: 4, reliefH: 9 },
    params: [
      { key: 'dots', label: 'Dots', unit: '', min: 30, max: 700, step: 1, value: 180 },
      { key: 'angle', label: 'Angle', unit: '°', min: 120, max: 150, step: 0.01, value: 137.51, hint: '137.51° is the golden angle. A hundredth of a degree either way reshuffles the spiral arms.' },
      { key: 'swirl', label: 'Swirl', unit: '°', min: -180, max: 180, step: 1, value: 0, hint: 'Twists the outer dots further round than the inner ones.' },
      { key: 'start', label: 'Start radius', unit: '%', min: 0, max: 60, step: 1, value: 4 },
      { key: 'sizeIn', label: 'Dot size at centre', unit: 'mm', min: 2.5, max: 20, step: 0.1, value: 5 },
      { key: 'sizeOut', label: 'Dot size at rim', unit: 'mm', min: 2.5, max: 24, step: 0.1, value: 11 },
      { key: 'style', label: 'Style', options: ['raised dots', 'holes', 'flat'], value: 'raised dots', hint: 'Holes: a solid plate pierced by the spiral, so light and air pass through the dots.' },
      { key: 'links', label: 'Links per dot', unit: '', min: 1, max: 4, step: 1, value: 2, hint: 'Each dot joins its nearest neighbours. 2 traces the spiral arms, 3 braces them into triangles.' },
    ],
    draw(c, g, p) {
      const { pts, r0, r1 } = phyllotaxis(g, p)
      if (p.style === 'holes') {
        // a plate with the dots cut out
        return { veins: [{ region: 'disk', border: 3, round: 0, cells: pts.map((q) => ({ pts: circlePts(q.x, q.y, q.d / 2, 20), inset: 0 })) }] }
      }
      // links: each dot to its nearest neighbours
      const seen = new Set()
      pts.forEach((a, i) => {
        const near = pts.map((b, j) => [j, (a.x - b.x) ** 2 + (a.y - b.y) ** 2]).filter(([j]) => j !== i).sort((u, v) => u[1] - v[1]).slice(0, p.links)
        for (const [j] of near) {
          const key = i < j ? `${i}:${j}` : `${j}:${i}`
          if (seen.has(key)) continue
          seen.add(key)
          c.seg(a.x, a.y, pts[j].x, pts[j].y)
        }
        // tie the innermost and outermost dots into collar and rim
        const ux = a.x / a.r, uy = a.y / a.r
        if (a.r < r0 + (r1 - r0) * 0.12) c.seg(a.x, a.y, ux * (g.hubR - 1), uy * (g.hubR - 1))
        if (a.r > r1 - a.d * 1.2) c.seg(a.x, a.y, ux * (g.Ri + 1), uy * (g.Ri + 1))
      })
      for (const q of pts) c.disc(q.x, q.y, q.d / 2)
      if (p.style === 'flat') return {}
      return { relief: { contours: pts.map((q) => ccw(circlePts(q.x, q.y, q.d / 2, 24))), thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'ouroboros',
    group: 'Creatures',
    name: 'Ouroboros',
    blurb: 'A dragon swallowing its own tail, coiled round the rim. Its spines brace it to the rim; the inside is your choice.',
    overrides: { strutW: 3, frameH: 4, reliefH: 11 },
    params: [
      { key: 'bodyW', label: 'Body width', unit: 'mm', min: 8, max: 28, step: 0.5, value: 16 },
      { key: 'headSize', label: 'Head size', unit: '×', min: 1.5, max: 4, step: 0.1, value: 2.6 },
      { key: 'spineCount', label: 'Spines', unit: '', min: 0, max: 60, step: 1, value: 30 },
      { key: 'scales', label: 'Scales', options: ['on', 'off'], value: 'on' },
      { key: 'belly', label: 'Belly swell', unit: 'mm', min: 0, max: 20, step: 0.1, value: 14.8, balance: true, hint: 'Fattens part of the body to balance the head. Auto-balance sets this and its position.' },
      { key: 'bellyAt', label: 'Swell position', unit: '°', min: -180, max: 180, step: 1, value: 46, balanceAngle: true },
      { key: 'inside', label: 'Inside', options: ['veins', 'spiral dots', 'dome', 'spokes'], value: 'veins' },
      { key: 'seed', label: 'Vein seed', unit: '', min: 1, max: 999, step: 1, value: 23, seed: true },
    ],
    draw(c, g, p) {
      const rc = new Canvas(p.bodyW)
      const holes = []
      const spineH = p.spineCount > 0 ? 5 : 0
      const rho = g.Ri - p.bodyW / 2 - spineH + 0.5
      const headLen = p.bodyW * p.headSize
      // anticlockwise from the tail tip round to the neck, leaving room for the head
      const gap = (headLen * 0.75) / rho
      const th0 = g.rot + 0.12
      const steps = 180
      const path = []
      for (let i = 0; i <= steps; i++) {
        const th = th0 + ((TAU - gap - 0.12) * i) / steps
        path.push([rho * Math.cos(th), rho * Math.sin(th)])
      }
      // a swell in the body (grown inward, away from the rim) balances the head
      const at = g.rot + deg(p.bellyAt)
      const w = (t) => {
        const th = th0 + (TAU - gap - 0.12) * t
        const off = Math.atan2(Math.sin(th - at), Math.cos(th - at))
        return 3 + (p.bodyW - 3) * Math.min(1, t * 2.2) ** 0.6 + p.belly * Math.exp(-((off / 0.55) ** 2))
      }
      const bodyPath = path.map(([x, y], i) => {
        const t = i / steps, extra = w(t) - (3 + (p.bodyW - 3) * Math.min(1, t * 2.2) ** 0.6)
        const r = Math.hypot(x, y), s2 = (r - extra / 2) / r // swell inward only
        return [x * s2, y * s2]
      })
      path.splice(0, path.length, ...bodyPath)
      drawDragonBody(rc, holes, path, w, {
        spines: p.spineCount > 0, spineEvery: Math.max(2, Math.round(steps / Math.max(1, p.spineCount))), spineSide: -1,
        spineH: (t) => g.Ri - rho - w(t) / 2 + 1.5 + (w(t) - (3 + (p.bodyW - 3) * Math.min(1, t * 2.2) ** 0.6)) / 2, // tips touch the rim
        scales: p.scales === 'on', scaleEvery: 4, headLen, whiskers: false,
      })
      // the inside
      const out = { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
      const inner = { ...g, Ri: rho - p.bodyW / 2 + 1 }
      if (p.inside === 'veins') out.veins = [{ region: [ccw(circlePts(0, 0, inner.Ri + 1, 160))], border: g.w, round: 3, cells: diskVeins(inner, { fold: 6, perFold: 6, seed: p.seed, wIn: 6, wOut: 3, mirror: false }) }]
      else if (p.inside === 'dome') drawDome(c, inner, { w: g.w })
      else if (p.inside === 'spokes') drawSpokes(c, inner, 6)
      else {
        const { pts } = phyllotaxis(inner, { dots: 90, angle: 137.51, start: 4, swirl: 0, sizeIn: 4, sizeOut: 8 })
        const seen = new Set()
        pts.forEach((a, i) => {
          pts.map((b, j) => [j, (a.x - b.x) ** 2 + (a.y - b.y) ** 2]).filter(([j]) => j !== i).sort((u, v) => u[1] - v[1]).slice(0, 2).forEach(([j]) => {
            const key = i < j ? `${i}:${j}` : `${j}:${i}`
            if (!seen.has(key)) (seen.add(key), c.seg(a.x, a.y, pts[j].x, pts[j].y))
          })
          c.disc(a.x, a.y, a.d / 2)
        })
        drawSpokes(c, inner, 6, 0, g.w * 0.8)
      }
      return out
    },
  },
  {
    id: 'dragon',
    group: 'Creatures',
    name: 'Dragon',
    blurb: 'Eastern dragons coiling out from the staff, spines raised, whiskers trailing. Two of them keep it balanced.',
    overrides: { strutW: 3, frameH: 4, reliefH: 11, snap: 'medium' },
    params: [
      { key: 'dragons', label: 'Dragons', unit: '', min: 1, max: 3, step: 1, value: 2, hint: 'One dragon cannot balance on its own. Two or three can.' },
      { key: 'turns', label: 'Coil', unit: ' turns', min: 0.3, max: 1.5, step: 0.05, value: 0.75 },
      { key: 'bodyW', label: 'Body width', unit: 'mm', min: 8, max: 26, step: 0.5, value: 15 },
      { key: 'headSize', label: 'Head size', unit: '×', min: 1.5, max: 4, step: 0.1, value: 2.6 },
      { key: 'spineCount', label: 'Spines', unit: '', min: 0, max: 40, step: 1, value: 16 },
      { key: 'whiskers', label: 'Whiskers', options: ['on', 'off'], value: 'on' },
      { key: 'scales', label: 'Scales', options: ['on', 'off'], value: 'on' },
      { key: 'frame', label: 'Frame', options: ['veins', 'spokes', 'rings'], value: 'veins' },
      { key: 'seed', label: 'Vein seed', unit: '', min: 1, max: 999, step: 1, value: 5, seed: true },
    ],
    draw(c, g, p) {
      const rc = new Canvas(p.bodyW)
      const holes = []
      const headLen = p.bodyW * p.headSize
      const steps = 120
      for (let d = 0; d < p.dragons; d++) {
        const base = g.rot + (TAU * d) / p.dragons
        const rA = g.hubR + 1, rB = g.Ri - headLen * 0.55
        const path = []
        for (let i = 0; i <= steps; i++) {
          const t = i / steps
          const r = rA + (rB - rA) * t
          const th = base + TAU * p.turns * t
          path.push([r * Math.cos(th), r * Math.sin(th)])
        }
        const w = (t) => 3 + (p.bodyW - 3) * Math.sin((Math.PI / 2) * Math.min(1, t * 1.6))
        drawDragonBody(rc, holes, path, w, {
          spines: p.spineCount > 0, spineEvery: Math.max(2, Math.round(steps / Math.max(1, p.spineCount))), spineSide: -1,
          scales: p.scales === 'on', scaleEvery: 4, headLen, whiskers: p.whiskers === 'on',
        })
        // two small three-toed legs on the inner side
        for (const t of [0.42, 0.72]) {
          const i = Math.round(t * steps)
          const [x, y] = path[i], [x2, y2] = path[i + 1]
          const tl = Math.hypot(x2 - x, y2 - y), tx = (x2 - x) / tl, ty = (y2 - y) / tl
          const nx = ty, ny = -tx // right of travel = the inner side
          const half = w(t) / 2
          const knee = [x + nx * (half + 7) - tx * 4, y + ny * (half + 7) - ty * 4]
          rc.taper([[x, y], knee], 6, 4.5)
          for (const s of [-1, 0, 1]) rc.taper([knee, [knee[0] + nx * 6 + tx * (s * 5 + 3), knee[1] + ny * 6 + ty * (s * 5 + 3)]], 3.6, 2.8)
        }
      }
      const out = { relief: { contours: rc.contours, holes, thicken: 0, gap: 1.2, slits: false } }
      if (p.frame === 'veins') out.veins = [{ region: 'disk', border: g.w, round: 3, cells: diskVeins(g, { fold: Math.max(2, p.dragons) * 2, perFold: 6, seed: p.seed, wIn: 5.5, wOut: 3, mirror: false }) }]
      else if (p.frame === 'spokes') drawSpokes(c, g, Math.max(2, p.dragons) * 3)
      else for (const f of [0.35, 0.68]) (c.ring(0, 0, g.hubR + (g.Ri - g.hubR) * f), drawSpokes(c, g, 6))
      return out
    },
  },


  {
    id: 'dahlia',
    group: 'Organic',
    name: 'Dahlia',
    blurb: 'Rows of pointed petals on the golden-angle spiral, small and tight at the centre, opening wide at the rim, like a dahlia head.',
    overrides: { strutW: 3, frameH: 4, reliefH: 9 },
    params: [
      { key: 'petals', label: 'Petals', unit: '', min: 12, max: 120, step: 1, value: 55 },
      { key: 'angle', label: 'Spiral angle', unit: '°', min: 120, max: 150, step: 0.01, value: 137.51, hint: 'The golden angle packs petals like a real dahlia. Small changes make spiral arms appear.' },
      { key: 'petalIn', label: 'Petal length at centre', unit: 'mm', min: 6, max: 50, step: 0.5, value: 18 },
      { key: 'petalOut', label: 'Petal length at rim', unit: 'mm', min: 10, max: 80, step: 0.5, value: 40 },
      { key: 'petalW', label: 'Petal width', unit: '%', min: 20, max: 90, step: 1, value: 46 },
      { key: 'tip', label: 'Petal tips', options: ['pointed', 'round', 'notched'], value: 'pointed' },
      { key: 'twirl', label: 'Twirl', unit: '°', min: -45, max: 45, step: 1, value: 10, hint: 'Turns every petal off the radius, so the flower seems to spin.' },
      { key: 'style', label: 'Petals', options: ['outlines', 'solid'], value: 'outlines', hint: 'Outlines make a lace flower. Solid is much heavier.' },
      { key: 'florets', label: 'Centre florets', options: ['on', 'off'], value: 'on' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const div = (p.angle * Math.PI) / 180
      const r0 = g.hubR + 1
      const contours = []
      for (let k = 0; k < p.petals; k++) {
        const f = Math.sqrt((k + 0.5) / p.petals)
        const L = p.petalIn + (p.petalOut - p.petalIn) * f
        // base radius: chosen so the outermost petal tips just reach into the rim
        const rb = r0 + (g.Ri + 2 - p.petalOut * Math.cos(deg(p.twirl)) - r0) * f
        const th = g.rot + k * div
        const W = (L * p.petalW) / 100
        const pts = []
        const n = 22
        for (let i = 0; i <= n; i++) {
          const t = i / n
          let y
          if (p.tip === 'round') y = (W / 2) * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2))
          else y = (W / 2) * Math.sin(Math.PI * t ** 0.75) ** 0.9
          pts.push([L * t, y])
        }
        let outline = [...pts, ...pts.slice(1, -1).reverse().map(([x, y]) => [x, -y])]
        if (p.tip === 'notched') outline = outline.map(([x, y]) => [x - (x > L * 0.85 && Math.abs(y) < W * 0.12 ? L * 0.08 : 0), y])
        const placed = place(outline, th + deg(p.twirl), rb * Math.cos(th), rb * Math.sin(th))
        if (p.style === 'solid') contours.push(ccw(placed))
        else rc.line(placed, g.w * 0.95, true)
      }
      if (p.florets === 'on') {
        // disc florets: a tight ring of dots round the collar
        const fr = g.hubR + 3.5, nF = Math.round((TAU * fr) / 7)
        for (let i = 0; i < nF; i++) rc.disc(fr * Math.cos((TAU * i) / nF), fr * Math.sin((TAU * i) / nF), 2.6)
      }
      // a thin hidden ring under the petals keeps every petal tied in
      c.ring(0, 0, (g.hubR + g.Ri) / 2, g.w * 0.8)
      drawSpokes(c, g, 6, 0, g.w)
      return { relief: { contours: [...rc.contours, ...contours], thicken: 0, gap: 0, slits: false } }
    },
  },


  {
    id: 'koru',
    group: 'Organic',
    name: 'Fern Fronds',
    blurb: 'Unfurling fern fronds rising from the staff, each curling into a tight spiral with a bud at its heart. The outer coil of every frond runs into the rim.',
    overrides: { strutW: 3, frameH: 4, reliefH: 9 },
    params: [
      { key: 'fronds', label: 'Fronds', unit: '', min: 2, max: 8, step: 1, value: 4 },
      { key: 'curl', label: 'Curl size', unit: '%', min: 15, max: 50, step: 1, value: 38, hint: 'Size of each spiral, as a share of the space between collar and rim.' },
      { key: 'turns', label: 'Turns in the curl', unit: ' turns', min: 0.75, max: 2.5, step: 0.05, value: 1.5 },
      { key: 'sweep', label: 'Lean', unit: '°', min: 0, max: 80, step: 1, value: 40, hint: 'How far each stem leans round before it curls. More lean makes it look like it is spinning.' },
      { key: 'stemW', label: 'Stem width', unit: 'mm', min: 4, max: 18, step: 0.5, value: 10 },
      { key: 'bud', label: 'Bud size', unit: 'mm', min: 0, max: 16, step: 0.5, value: 8 },
      { key: 'babies', label: 'Baby fronds', options: ['on', 'off'], value: 'on', hint: 'A small frond budding off each stem, curling the other way.' },
      { key: 'frame', label: 'Frame', options: ['spokes', 'ring', 'fronds only'], value: 'spokes', hint: 'Low supports between the fronds. Fronds only is lightest, but every frond then hangs on its own stem and curl.' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const wEnd = Math.max(2.6, g.w * 0.85)
      const draw = (pts, w0, w1) => (rc.taper(pts, w0, w1), c.taper(pts, w0, w1))
      // spiral round centre C: radius rho0·e^(-b t), angle a0 + s·t, t from 0 to T
      const spiral = (C, rho0, a0, s, T, b, n = 90) => {
        const pts = []
        for (let i = 0; i <= n; i++) {
          const t = (T * i) / n, r = rho0 * Math.exp(-b * t)
          pts.push([C[0] + r * Math.cos(a0 + s * t), C[1] + r * Math.sin(a0 + s * t)])
        }
        return pts
      }
      const tangent = (pts, i, j) => { const dx = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L] }
      const span = g.Ri - g.hubR
      const rho0 = (span * p.curl) / 100
      const T = TAU * p.turns
      const budR = p.bud / 2
      const rhoEnd = Math.max(budR + wEnd * 0.6, 3.5, rho0 * 0.12)
      const b = Math.log(rho0 / rhoEnd) / T
      const wCurl = Math.max(wEnd, p.stemW * 0.6) // width where the stem enters the curl
      for (let f = 0; f < p.fronds; f++) {
        const base = g.rot + (TAU * f) / p.fronds
        const phi = base + deg(p.sweep)
        // The stem keeps turning the same way it leans and rolls over into the curl
        // (s = +1, anticlockwise like the lean): it enters on the curl's trailing
        // side heading a little past radial, and the crown of the coil meets the rim.
        const enter = 0.35, tTop = Math.PI / 2 - enter
        const wTop = wCurl + (wEnd - wCurl) * Math.min(1, tTop / T)
        const rC = g.Ri + 1 - rho0 * Math.exp(-b * tTop) - wTop / 2
        const C = [rC * Math.cos(phi), rC * Math.sin(phi)]
        const curl = spiral(C, rho0, phi - Math.PI / 2 + enter, 1, T, b)
        const S = curl[0], [tx, ty] = tangent(curl, 0, 1)
        const r0 = g.hubR - 1, P0 = [r0 * Math.cos(base), r0 * Math.sin(base)]
        const L = Math.hypot(S[0] - P0[0], S[1] - P0[1]) * 0.45
        const stem = bez(P0, [P0[0] + Math.cos(base) * L, P0[1] + Math.sin(base) * L], [S[0] - tx * L, S[1] - ty * L], S, 40)
        draw(stem, p.stemW, wCurl)
        draw(curl, wCurl, wEnd)
        if (budR > 0) { const E = curl.at(-1); rc.disc(E[0], E[1], budR); c.disc(E[0], E[1], budR) }
        if (p.babies === 'on') {
          // a small curl off the outside of the bend, curling the other way (clockwise)
          const i = Math.round(stem.length * 0.45)
          const Q = stem[i], [ux, uy] = tangent(stem, i - 1, i + 1)
          const h = [ux * Math.cos(-0.8) - uy * Math.sin(-0.8), ux * Math.sin(-0.8) + uy * Math.cos(-0.8)] // 45° to the right
          const br = rho0 * 0.4, bT = TAU * 1.15, bEnd = Math.max(wEnd * 0.9, 2.5), bb = Math.log(br / bEnd) / bT
          const reach = p.stemW / 2 + br * 0.5
          const Q2 = [Q[0] + h[0] * reach, Q[1] + h[1] * reach]
          const Cb = [Q2[0] + h[1] * br, Q2[1] - h[0] * br] // centre to the right of the heading
          const bc = spiral(Cb, br, Math.atan2(Q2[1] - Cb[1], Q2[0] - Cb[0]), -1, bT, bb, 60)
          draw([Q, ...bc], Math.max(wEnd, p.stemW * 0.45), wEnd)
          if (budR > 0) { const E = bc.at(-1); rc.disc(E[0], E[1], budR * 0.5 + 0.6) }
        }
      }
      if (p.frame === 'spokes') drawSpokes(c, g, p.fronds, Math.PI / p.fronds + deg(p.sweep) / 2)
      else if (p.frame === 'ring') (c.ring(0, 0, g.hubR + span * 0.3, g.w * 0.8), drawSpokes(c, g, p.fronds, Math.PI / p.fronds))
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },


  // ========================================================= MADE FOR SPINNING
  {
    id: 'hypno',
    group: 'Spin',
    name: 'Hypno Spiral',
    blurb: 'Archimedean spiral arms. Spinning one way they seem to pour outward, the other way inward: the barber-pole illusion.',
    overrides: { strutW: 3, frameH: 4, reliefH: 9 },
    params: [
      { key: 'arms', label: 'Arms', unit: '', min: 1, max: 6, step: 1, value: 2, hint: 'Two or more keeps it balanced.' },
      { key: 'turns', label: 'Turns', unit: '', min: 0.5, max: 4, step: 0.05, value: 1.75 },
      { key: 'armIn', label: 'Arm width at centre', unit: 'mm', min: 3, max: 30, step: 0.5, value: 6 },
      { key: 'armOut', label: 'Arm width at rim', unit: 'mm', min: 3, max: 40, step: 0.5, value: 16 },
      { key: 'ringsUnder', label: 'Support rings', unit: '', min: 0, max: 4, step: 1, value: 2 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      for (let a = 0; a < p.arms; a++) {
        const pts = []
        const n = Math.ceil(80 * p.turns)
        for (let i = 0; i <= n; i++) {
          const t = i / n
          const r = g.hubR - 1 + (g.Ri + 1 - (g.hubR - 1)) * t
          const th = g.rot + (TAU * a) / p.arms + TAU * p.turns * t
          pts.push([r * Math.cos(th), r * Math.sin(th)])
        }
        rc.taper(pts, p.armIn, p.armOut)
      }
      for (let k = 1; k <= p.ringsUnder; k++) c.ring(0, 0, g.hubR + ((g.Ri - g.hubR) * k) / (p.ringsUnder + 1))
      drawSpokes(c, g, Math.max(3, p.arms * 3), 0, g.w)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'benham',
    group: 'Spin',
    name: "Benham's Top",
    colors: { A: '#e8e4d8', B: '#232227' }, // the effect needs black marks on white
    blurb: 'Black and white only, yet spinning it at 5 to 10 turns a second makes faint reds, greens and blues appear in the arcs. Print colour A white, colour B black.',
    overrides: { strutW: 3, frameH: 3, reliefH: 6 },
    params: [
      { key: 'folds', label: 'Repeats', unit: '', min: 1, max: 3, step: 1, value: 2, hint: 'The classic top has one; two keeps the disc balanced and halves the spin speed you need.' },
      { key: 'arcW', label: 'Arc width', unit: 'mm', min: 1.5, max: 6, step: 0.1, value: 2.8 },
      { key: 'plate', label: 'Background', options: ['solid', 'open'], value: 'solid', hint: 'The effect needs a white ground. Open is lighter but weaker.' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(p.arcW)
      const span = TAU / p.folds
      const r0 = g.hubR + 1, r1 = g.Ri + 1
      if (p.plate === 'solid') c.disc(0, 0, g.Ri + 1)
      else (drawSpokes(c, g, 12), [0.33, 0.66].forEach((f) => c.ring(0, 0, r0 + (r1 - r0) * f)))
      const arcPts = (r, a0, a1) => {
        const n = Math.max(6, Math.ceil(((a1 - a0) * r) / 3)), pts = []
        for (let i = 0; i <= n; i++) pts.push([r * Math.cos(a0 + ((a1 - a0) * i) / n), r * Math.sin(a0 + ((a1 - a0) * i) / n)])
        return pts
      }
      for (let f = 0; f < p.folds; f++) {
        const a0 = g.rot + f * span
        // the black half of the sector
        const outer = arcPts(r1, a0, a0 + span / 2), inner = arcPts(r0, a0, a0 + span / 2).reverse()
        rc.solid([...outer, ...inner])
        // the other half: four groups of three arcs, each group further out
        for (let j = 0; j < 4; j++) {
          const b0 = a0 + span / 2 + (span / 8) * j, b1 = b0 + span / 8
          for (let k = 0; k < 3; k++) {
            const r = r0 + ((r1 - r0) * (j * 3 + k + 0.5)) / 12
            rc.line(arcPts(r, b0, b1), p.arcW)
          }
        }
      }
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'strobe',
    group: 'Spin',
    name: 'Strobe Rings',
    blurb: 'Rings with different numbers of marks, like a turntable strobe disc. Under a strobe one ring freezes while the others creep forwards or back.',
    overrides: { strutW: 3, frameH: 4, reliefH: 9 },
    params: [
      { key: 'rings', label: 'Rings', unit: '', min: 2, max: 7, step: 1, value: 5 },
      { key: 'first', label: 'Marks on inner ring', unit: '', min: 4, max: 30, step: 1, value: 10 },
      { key: 'stepMarks', label: 'Extra marks per ring', unit: '', min: 1, max: 12, step: 1, value: 4 },
      { key: 'shape', label: 'Mark shape', options: ['bars', 'hearts', 'dragonflies', 'stars'], value: 'bars', hint: 'Hearts point at the staff, dragonflies fly round the ring, stars point out. Mark width only applies to bars.' },
      { key: 'markLen', label: 'Mark length', unit: '%', min: 30, max: 100, step: 1, value: 70, hint: 'For shapes this is their size across the ring.' },
      { key: 'markW', label: 'Mark width', unit: 'mm', min: 2.4, max: 12, step: 0.1, value: 5 },
      { key: 'freeze', label: 'Ring frozen in preview', unit: '', min: 1, max: 7, step: 1, value: 3, hint: 'Which ring stands still in the Zoetrope strobe preview.' },
    ],
    strobe: (p) => p.first + p.stepMarks * (Math.min(p.freeze, p.rings) - 1),
    draw(c, g, p) {
      const rc = new Canvas(p.markW)
      const band = (g.Ri - g.hubR) / p.rings
      for (let i = 0; i < p.rings; i++) {
        const r = g.hubR + band * (i + 0.5)
        const n = p.first + p.stepMarks * i
        c.ring(0, 0, r)
        const half = (band * p.markLen) / 200
        // shapes may not overlap their neighbours round the ring
        const gap = ((TAU * r) / n) * 0.85
        for (let k = 0; k < n; k++) {
          const a = g.rot + (TAU * k) / n
          const x = r * Math.cos(a), y = r * Math.sin(a)
          if (p.shape === 'hearts') {
            const H = Math.min(half * 2, gap / HEART.aspect)
            rc.contours.push(ccw(place(HEART.pts.map(([hx, hy]) => [hx * H, (hy - 0.5) * H]), a - Math.PI / 2, x, y)))
          } else if (p.shape === 'stars') {
            // five tapered arms with round tips, wide enough to print
            const R = Math.min(half, gap / 2) - 1.3
            for (let m = 0; m < 5; m++) { const t = a + (m * TAU) / 5; rc.taper([[x, y], [x + R * Math.cos(t), y + R * Math.sin(t)]], R * 0.75, 2.6) }
          } else if (p.shape === 'dragonflies') {
            // wings span the ring, body (1.16 × half-span long) lies along it, heading clockwise
            const s = Math.min(half, gap / 1.16), h = a - Math.PI
            const [ox, oy] = place([[0, 0.35 * s]], h, x, y)[0]
            rc.contours.push(...logoDragonfly(s, h, ox, oy))
          } else rc.line([[(r - half) * Math.cos(a), (r - half) * Math.sin(a)], [(r + half) * Math.cos(a), (r + half) * Math.sin(a)]], p.markW)
        }
      }
      drawSpokes(c, g, 6, Math.PI / 6)
      // fatten shapes a touch so star tips, heart points and tiny wings print
      return { relief: { contours: rc.contours, thicken: p.shape === 'bars' ? 0 : 0.6, gap: 0, slits: false } }
    },
  },
  {
    id: 'galaxy',
    group: 'Spin',
    name: 'Galaxy',
    blurb: 'Logarithmic spiral arms strewn with raised stars. It turns like a galaxy turns.',
    overrides: { strutW: 3, frameH: 4, reliefH: 9 },
    params: [
      { key: 'arms', label: 'Arms', unit: '', min: 2, max: 6, step: 1, value: 3 },
      { key: 'wind', label: 'Winding', unit: ' turns', min: 0.3, max: 1.5, step: 0.05, value: 0.7 },
      { key: 'stars', label: 'Stars per arm', unit: '', min: 5, max: 90, step: 1, value: 42 },
      { key: 'starMax', label: 'Biggest star', unit: 'mm', min: 4, max: 20, step: 0.5, value: 13 },
      { key: 'armW', label: 'Arm width', unit: 'mm', min: 3, max: 20, step: 0.5, value: 9 },
      { key: 'seed', label: 'Seed', unit: '', min: 1, max: 999, step: 1, value: 17, seed: true },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const r0 = g.hubR - 1, r1 = g.Ri + 1
      const k = Math.log(r1 / r0) / (TAU * p.wind)
      const armAt = (t, a) => { const r = r0 * Math.exp(k * TAU * p.wind * t); const th = a + TAU * p.wind * t; return [r, th] }
      // one arm's stars, copied to every arm so the disc stays balanced
      const rand = rng(p.seed)
      const stars = []
      for (let i = 0; i < p.stars; i++) {
        const t = 0.04 + 0.96 * rand() ** 0.8
        const size = 3.5 + (p.starMax - 3.5) * rand() ** 1.8
        const off = (rand() - 0.5) * 2 * (p.armW * 0.45 + size * 0.3)
        stars.push({ t, size, off })
      }
      for (let a = 0; a < p.arms; a++) {
        const base = g.rot + (TAU * a) / p.arms
        const pts = []
        for (let i = 0; i <= 60; i++) { const [r, th] = armAt(i / 60, base); pts.push([r * Math.cos(th), r * Math.sin(th)]) }
        rc.taper(pts, p.armW, Math.max(2.6, p.armW * 0.3)) // arms stand tall too, tapering out to the rim
        c.taper(pts, p.armW, g.w)
        for (const s of stars) {
          const [r, th] = armAt(s.t, base)
          const x = r * Math.cos(th) - Math.sin(th) * s.off, y = r * Math.sin(th) + Math.cos(th) * s.off
          // four-point sparkle for the big ones, round dots for the rest
          if (s.size > p.starMax * 0.7) {
            const q = [], L = s.size / 2, W = s.size * 0.17
            for (let m = 0; m < 8; m++) { const ang = (m * Math.PI) / 4, rr = m % 2 ? W : L; q.push([x + rr * Math.cos(ang), y + rr * Math.sin(ang)]) }
            rc.solid(q)
            rc.disc(x, y, s.size * 0.22)
          } else rc.disc(x, y, s.size / 2)
        }
      }
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'turbine',
    group: 'Spin',
    name: 'Turbine',
    blurb: 'Swept blades like a jet fan. Even standing still it looks like it is winding up.',
    overrides: { strutW: 3, frameH: 4, reliefH: 10 },
    params: [
      { key: 'blades', label: 'Blades', unit: '', min: 3, max: 24, step: 1, value: 11 },
      { key: 'sweepT', label: 'Sweep', unit: '°', min: 0, max: 140, step: 1, value: 70 },
      { key: 'rootW', label: 'Blade width at root', unit: 'mm', min: 2.4, max: 20, step: 0.5, value: 4.5 },
      { key: 'tipW', label: 'Blade width at tip', unit: 'mm', min: 2.4, max: 40, step: 0.5, value: 14 },
      { key: 'shroud', label: 'Inner shroud', options: ['on', 'off'], value: 'on' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      for (let b = 0; b < p.blades; b++) {
        const a = g.rot + (TAU * b) / p.blades
        const pts = []
        for (let i = 0; i <= 40; i++) {
          const t = i / 40
          const r = g.hubR - 1 + (g.Ri + 1 - g.hubR + 1) * t
          const th = a + deg(p.sweepT) * t ** 1.5
          pts.push([r * Math.cos(th), r * Math.sin(th)])
        }
        rc.taper(pts, p.rootW, p.tipW)
      }
      if (p.shroud === 'on') rc.ring(0, 0, g.hubR + (g.Ri - g.hubR) * 0.38, g.w * 1.4)
      c.ring(0, 0, g.hubR + (g.Ri - g.hubR) * 0.7)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'knot',
    group: 'Spin',
    name: 'Knotwork',
    blurb: 'A torus knot that really weaves: at every crossing one strand stands tall and the other dips under it.',
    overrides: { strutW: 3, frameH: 4, reliefH: 10 },
    params: [
      { key: 'kp', label: 'Lobes', unit: '', min: 2, max: 9, step: 1, value: 5, hint: 'Times the strand goes round the staff.' },
      { key: 'kq', label: 'Weaves', unit: '', min: 2, max: 9, step: 1, value: 3, hint: 'Times it dips in and out. Must share no factor with Lobes or it splits into separate loops.' },
      { key: 'strand', label: 'Strand width', unit: 'mm', min: 3, max: 14, step: 0.5, value: 7 },
      { key: 'under', label: 'Under-gap', unit: 'mm', min: 2, max: 40, step: 0.5, value: 20, hint: 'How much of the lower strand drops down at each crossing.' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(p.strand)
      const P = p.kp, Q = p.kq
      const rIn = g.hubR + p.strand / 2 - 1, rOut = g.Ri - p.strand / 2 + 1
      // torus knot seen from above: radius swings in and out Q times while going round P times
      const n = 90 * P
      const pts = []
      for (let i = 0; i < n; i++) {
        const t = (TAU * i) / n
        const r = (rIn + rOut) / 2 + ((rOut - rIn) / 2) * Math.cos(Q * t)
        pts.push([r * Math.cos(P * t + g.rot), r * Math.sin(P * t + g.rot)])
      }
      // find crossings: segment i against segment j
      const cross = []
      const seg = (i) => [pts[i], pts[(i + 1) % n]]
      for (let i = 0; i < n; i++)
        for (let j = i + 2; j < n; j++) {
          if (i === 0 && j === n - 1) continue
          const [a, b] = seg(i), [c2, d] = seg(j)
          const den = (b[0] - a[0]) * (d[1] - c2[1]) - (b[1] - a[1]) * (d[0] - c2[0])
          if (Math.abs(den) < 1e-9) continue
          const u = ((c2[0] - a[0]) * (d[1] - c2[1]) - (c2[1] - a[1]) * (d[0] - c2[0])) / den
          const v = ((c2[0] - a[0]) * (b[1] - a[1]) - (c2[1] - a[1]) * (b[0] - a[0])) / den
          if (u >= 0 && u < 1 && v >= 0 && v < 1) cross.push({ i: i + u, j: j + v, x: a[0] + u * (b[0] - a[0]), y: a[1] + u * (b[1] - a[1]) })
        }
      // walk the strand: crossings alternate over, under, over... (torus knots are alternating)
      const events = []
      cross.forEach((cr, k) => { events.push({ at: cr.i, k }); events.push({ at: cr.j, k }) })
      events.sort((a, b) => a.at - b.at)
      const lowAt = new Set()
      events.forEach((e, idx) => { if (idx % 2 === 1) lowAt.add(e.at) })
      const isLow = (i) => {
        for (const at of lowAt) {
          let d = Math.abs(i - at); d = Math.min(d, n - d)
          // distance along the curve, in samples
          const step = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])
          if (d * step < p.under / 2 + p.strand / 2) return true
        }
        return false
      }
      // the whole strand at frame level; the high runs again as relief
      c.line(pts, p.strand, true)
      let run = []
      // the raised strand is a hair narrower than the base strand, so their walls never coincide
      const flush = () => { if (run.length > 1) rc.line(run, p.strand - 0.6); run = [] }
      for (let i = 0; i <= n; i++) {
        const k = i % n
        if (isLow(k)) flush()
        else run.push(pts[k])
      }
      flush()
      drawSpokes(c, g, P, Math.PI / P, g.w)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },

  // ================================================================= CLASSICS
  {
    id: 'dragonfly',
    group: 'Classics',
    name: 'Dreamscape',
    blurb: 'The dream.sc dragonfly standing tall over a low dome web, like the logo.',
    overrides: { strutW: 3.4, frameH: 4.5, reliefH: 10 },
    params: [
      { key: 'dfScale', label: 'Dragonfly size', unit: '%', min: 60, max: 115, step: 1, value: 100 },
      { key: 'dfY', label: 'Dragonfly offset', unit: 'mm', min: -40, max: 40, step: 0.1, value: 9.4, balance: true },
      { key: 'dfThicken', label: 'Thicken outline', unit: 'mm', min: 0, max: 3, step: 0.1, value: 0.6 },
      { key: 'dfGap', label: 'Gap round dragonfly', unit: 'mm', min: 0, max: 6, step: 0.1, value: 2.2, hint: 'Cuts the web back from the dragonfly so it reads as a silhouette.' },
      { key: 'bg', label: 'Background', options: ['dome', 'spokes', 'vortex'], value: 'dome' },
      { key: 'trails', label: 'Motion trails', options: ['off', 'on'], value: 'off', hint: "The logo's speed lines. They taper to points, so their tips show up as thin spots." },
    ],
    draw(c, g, p) {
      if (p.bg === 'dome') drawDome(c, g, { w: g.w * 0.9 })
      else if (p.bg === 'spokes') drawSpokes(c, g, 8)
      else drawVortex(c, g, 8, 130, 0.9)
      const s = (g.Ri + g.rimW * 0.45) * (p.dfScale / 100)
      return { relief: { contours: logoDragonfly(s, g.rot, 0, p.dfY, { trails: p.trails === 'on' }), thicken: p.dfThicken, gap: p.dfGap, slits: true } }
    },
  },
  {
    id: 'dome',
    group: 'Classics',
    name: 'Dome',
    blurb: 'The venue dome from above: 91 junctions, 180 struts. Fully triangulated, so it is the stiffest web here.',
    overrides: { frameH: 6, strutW: 4, reliefH: 9 },
    params: [
      { key: 'node', label: 'Junction size', unit: 'mm', min: 0, max: 14, step: 0.5, value: 7 },
      { key: 'domeW', label: 'Strut scale', unit: '%', min: 50, max: 150, step: 1, value: 100 },
      { key: 'second', label: 'Colour B', options: ['rings', 'junctions', 'rings + junctions', 'none'], value: 'rings', hint: 'These parts stand taller and print in the second filament. Rings read as glowing circles when it spins.' },
    ],
    draw(c, g, p) {
      const rc = p.second === 'none' ? null : new Canvas(g.w)
      drawDome(c, g, { w: g.w * (p.domeW / 100), node: p.node, rc, rings: /rings/.test(p.second), joints: /junctions/.test(p.second) })
      if (rc) return { relief: { contours: rc.contours, thicken: 0, gap: 0 } }
    },
  },
  {
    id: 'swarm',
    group: 'Classics',
    name: 'Swarm',
    blurb: 'Logo dragonflies chasing round the hub, standing tall above thin spokes.',
    overrides: { strutW: 3, frameH: 4, reliefH: 10 },
    params: [
      { key: 'count', label: 'Dragonflies', unit: '', min: 2, max: 6, step: 1, value: 3 },
      { key: 'swScale', label: 'Size', unit: '%', min: 30, max: 90, step: 1, value: 62 },
      { key: 'swR', label: 'Orbit radius', unit: '%', min: 20, max: 80, step: 1, value: 56 },
      { key: 'swTilt', label: 'Heading', unit: '°', min: -90, max: 90, step: 1, value: 0 },
      { key: 'swRings', label: 'Support rings', unit: '', min: 0, max: 3, step: 1, value: 1 },
    ],
    draw(c, g, p) {
      drawSpokes(c, g, p.count * 2)
      for (let k = 1; k <= p.swRings; k++) c.ring(0, 0, g.Rc + ((g.Ri - g.Rc) * k) / (p.swRings + 1))
      const contours = []
      const s = g.Ri * (p.swScale / 100)
      const d = g.Ri * (p.swR / 100)
      for (let i = 0; i < p.count; i++) {
        const a = g.rot + (TAU * i) / p.count
        const [x, y] = rot([d, 0], a)
        contours.push(...logoDragonfly(s, a + Math.PI + deg(p.swTilt), x, y))
      }
      return { relief: { contours, thicken: 1.1, gap: 1.6, slits: true } }
    },
  },
  {
    id: 'vortex',
    group: 'Classics',
    name: 'Golden Vortex',
    blurb: 'Golden-angle spirals winding both ways, like a sunflower head. Every cell is a braced diamond.',
    overrides: { frameH: 6, strutW: 4 },
    params: [
      { key: 'arms', label: 'Arms each way', unit: '', min: 3, max: 21, step: 1, value: 8 },
      { key: 'twist', label: 'Twist', unit: '°', min: 30, max: 300, step: 1, value: 137.5 },
      { key: 'oneway', label: 'Direction', options: ['both', 'one way'], value: 'both' },
    ],
    draw(c, g, p) {
      drawVortex(c, g, p.arms, p.twist, 1, p.oneway === 'one way')
    },
  },
  {
    id: 'torus',
    group: 'Classics',
    name: 'Torus',
    blurb: 'Circles that all pass through the axis and kiss the rim. Every strand runs from collar to rim.',
    overrides: { frameH: 6, strutW: 4 },
    params: [
      { key: 'circles', label: 'Circles', unit: '', min: 3, max: 24, step: 1, value: 12 },
      { key: 'innerRing', label: 'Inner ring', unit: '%', min: 0, max: 90, step: 1, value: 0 },
    ],
    draw(c, g, p) {
      const r = (g.Ri + g.w / 2) / 2
      for (let i = 0; i < p.circles; i++) {
        const [x, y] = rot([r, 0], g.rot + (TAU * i) / p.circles)
        c.ring(x, y, r)
      }
      if (p.innerRing > 0) c.ring(0, 0, g.Rc + ((g.Ri - g.Rc) * p.innerRing) / 100)
    },
  },
  {
    id: 'flower',
    group: 'Classics',
    name: 'Flower of Life',
    blurb: 'Overlapping circles on a hex grid, trimmed by the rim.',
    overrides: { frameH: 6, strutW: 4 },
    params: [
      { key: 'layers', label: 'Layers', unit: '', min: 1, max: 4, step: 1, value: 2 },
      { key: 'petal', label: 'Circle size', unit: '%', min: 15, max: 60, step: 1, value: 33 },
    ],
    draw(c, g, p) {
      const r = g.Ri * (p.petal / 100)
      const seen = new Set()
      for (let q = -p.layers; q <= p.layers; q++)
        for (let s = -p.layers; s <= p.layers; s++) {
          if (Math.abs(q + s) > p.layers) continue
          const [x, y] = rot([r * (q + s / 2), r * s * (Math.sqrt(3) / 2)], g.rot)
          const key = `${x.toFixed(2)},${y.toFixed(2)}`
          if (seen.has(key) || Math.hypot(x, y) - r > g.Ri) continue
          seen.add(key)
          c.ring(x, y, r)
        }
      c.ring(0, 0, r * (p.layers + 1))
    },
  },
  {
    id: 'star',
    group: 'Classics',
    name: 'Star Nest',
    blurb: 'Nested star polygons in rings, each turned a little more than the last.',
    overrides: { frameH: 6, strutW: 4 },
    params: [
      { key: 'points', label: 'Points', unit: '', min: 5, max: 12, step: 1, value: 6 },
      { key: 'skip', label: 'Star skip', unit: '', min: 2, max: 5, step: 1, value: 2 },
      { key: 'levels', label: 'Levels', unit: '', min: 2, max: 6, step: 1, value: 3 },
      { key: 'turn', label: 'Turn per level', unit: '°', min: 0, max: 30, step: 0.5, value: 15 },
    ],
    draw(c, g, p) {
      const skip = Math.min(p.skip, Math.floor((p.points - 1) / 2))
      for (let L = 0; L < p.levels; L++) {
        const start = g.Rc + (g.Ri - g.Rc) * 0.4, end = g.Ri + g.w / 2
        const R = start + ((end - start) * L) / (p.levels - 1)
        const a0 = g.rot + deg(L * p.turn)
        const V = Array.from({ length: p.points }, (_, i) => rot([R, 0], a0 + (TAU * i) / p.points))
        for (let i = 0; i < p.points; i++) c.line([V[i], V[(i + skip) % p.points]])
        c.ring(0, 0, R)
      }
    },
  },
  {
    id: 'lotus',
    group: 'Classics',
    name: 'Lotus',
    blurb: 'Two layers of pointed petals opening from the collar.',
    overrides: { frameH: 6, strutW: 4 },
    params: [
      { key: 'petals', label: 'Petals', unit: '', min: 4, max: 16, step: 1, value: 8 },
      { key: 'fat', label: 'Petal width', unit: '%', min: 20, max: 100, step: 1, value: 60 },
      { key: 'layers2', label: 'Layers', unit: '', min: 1, max: 3, step: 1, value: 2 },
    ],
    draw(c, g, p) {
      for (let L = 0; L < p.layers2; L++) {
        const tip = g.Ri + g.w / 2 - L * (g.Ri - g.Rc) * 0.28
        const base = g.Rc
        const off = (L * Math.PI) / p.petals
        for (let i = 0; i < p.petals; i++) {
          const a = g.rot + off + (TAU * i) / p.petals
          const len = tip - base, half = ((TAU / p.petals) * base * 0.5 + len * 0.18) * (p.fat / 100) * 1.4
          const rArc = (half * half + (len / 2) ** 2) / (2 * half)
          const mid = (base + tip) / 2
          for (const sgn of [1, -1]) {
            const pts = []
            for (let k = 0; k <= 24; k++) {
              const t = -1 + (2 * k) / 24
              const x = mid + (t * len) / 2
              const y = sgn * (Math.sqrt(Math.max(0, rArc * rArc - ((t * len) / 2) ** 2)) - (rArc - half))
              pts.push(rot([x, y], a))
            }
            c.line(pts)
          }
        }
      }
      c.ring(0, 0, g.Ri - (g.Ri - g.Rc) * 0.28 * (p.layers2 - 1) + g.w)
    },
  },
  // ========================================================= CLAUDE'S OWN
  // Three designs from Claude's own taste rather than a brief.
  {
    id: 'attention',
    group: 'Claude',
    name: 'Attention',
    blurb: 'String art: every point round the rim is joined to the one k times further on, the way a language model links every word to every other. A bright curve with k−1 cusps appears where the threads cross.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 8 },
    params: [
      { key: 'tokens', label: 'Points', unit: '', min: 24, max: 120, step: 1, value: 60, hint: 'Rounded to a multiple of k − 1 so the pattern stays balanced.' },
      { key: 'mult', label: 'Multiplier k', unit: '', min: 3, max: 12, step: 1, value: 4, hint: '3 = nephroid (2 cusps), 4 = 3 cusps, 5 = 4 cusps… The curve is the envelope of the threads.' },
      { key: 'thread', label: 'Thread width', unit: 'mm', min: 2, max: 4, step: 0.1, value: 2.6 },
      { key: 'dot', label: 'Point size', unit: 'mm', min: 0, max: 10, step: 0.5, value: 5 },
      { key: 'curveW', label: 'Curve width', unit: 'mm', min: 0, max: 10, step: 0.5, value: 4, hint: 'The raised curve in colour B. 0 leaves just the threads.' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const k = p.mult, sym = k - 1
      const N = Math.max(sym * 2, Math.round(p.tokens / sym) * sym)
      const Rt = g.Ri - Math.max(p.dot / 2, p.thread) // the circle the points sit on
      const at = (i) => { const a = g.rot + (TAU * i) / N; return [Rt * Math.cos(a), Rt * Math.sin(a)] }
      for (let i = 0; i < N; i++) {
        const j = (k * i) % N
        if (j === i) continue
        const [x1, y1] = at(i), [x2, y2] = at(j)
        c.seg(x1, y1, x2, y2, p.thread)
      }
      for (let i = 0; i < N; i++) { const [x, y] = at(i); if (p.dot > 0) (rc.disc(x, y, p.dot / 2), c.disc(x, y, p.dot / 2)) }
      if (p.curveW > 0) {
        // envelope of the chords: epicycloid z = Rt/(k+1)·(k·e^{it} + e^{ikt})
        const pts = []
        for (let s = 0; s <= 720; s++) {
          const t = (TAU * s) / 720
          pts.push(rot([(Rt / (k + 1)) * (k * Math.cos(t) + Math.cos(k * t)), (Rt / (k + 1)) * (k * Math.sin(t) + Math.sin(k * t))], g.rot))
        }
        rc.line(pts, p.curveW, true)
        c.line(pts, p.curveW, true)
      }
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'epicycles',
    group: 'Claude',
    name: 'Epicycles',
    blurb: 'One closed line drawn by circles turning on circles, like a Fourier drawing, on a hub that is itself a circle turning. Mirrored, the two lines weave a lace.',
    overrides: { strutW: 3, frameH: 4, reliefH: 9 },
    params: [
      { key: 'sym', label: 'Symmetry', unit: '-fold', min: 2, max: 12, step: 1, value: 6 },
      { key: 'circles', label: 'Circles', unit: '', min: 2, max: 5, step: 1, value: 4, hint: 'How many turning circles add up to the line.' },
      { key: 'seed', label: 'Seed', unit: '', min: 1, max: 999, step: 1, value: 123, seed: true },
      { key: 'lineW', label: 'Line width', unit: 'mm', min: 2.4, max: 10, step: 0.1, value: 3.6 },
      { key: 'mirror', label: 'Mirror line', options: ['on', 'off'], value: 'on', hint: 'Adds the same line turning the other way: they cross everywhere, which makes the web far stiffer.' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const rand = rng(p.seed)
      // frequencies 1 + m·j all give m-fold symmetry (so it balances)
      const terms = [{ n: 1, a: 1, ph: 0 }]
      const pool = [1 - p.sym, 1 + p.sym, 1 - 2 * p.sym, 1 + 2 * p.sym, 1 - 3 * p.sym]
      for (let j = 1; j < p.circles; j++) terms.push({ n: pool[j - 1], a: (0.25 + 0.6 * rand()) / j, ph: TAU * rand() })
      const curve = (sgn) => {
        const pts = []
        for (let s = 0; s < 1440; s++) {
          const t = (TAU * s) / 1440
          let x = 0, y = 0
          for (const q of terms) (x += q.a * Math.cos(q.n * t + q.ph)), (y += q.a * Math.sin(q.n * t + q.ph))
          pts.push([x, sgn * y])
        }
        return pts
      }
      const A = curve(1)
      // scale so the line just reaches into the rim
      const rMax = Math.max(...A.map(([x, y]) => Math.hypot(x, y)))
      const sc = (g.Ri + p.lineW * 0.3) / rMax
      for (const sgn of p.mirror === 'on' ? [1, -1] : [1]) {
        const pts = (sgn === 1 ? A : curve(-1)).map(([x, y]) => rot([x * sc, y * sc], g.rot))
        rc.line(pts, p.lineW, true)
        c.line(pts, p.lineW, true)
      }
      drawSpokes(c, g, p.sym, Math.PI / p.sym) // low ties to the collar
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'chladni',
    group: 'Claude',
    name: 'Chladni',
    blurb: 'The lines sand gathers on when a round plate rings with sound: two vibration modes played together. The shape of a chord, for a music venue.',
    overrides: { strutW: 3, frameH: 4, reliefH: 8 },
    params: [
      { key: 'sym', label: 'Symmetry', unit: '-fold', min: 2, max: 8, step: 1, value: 4, hint: 'Angular order of the first mode. The second plays at twice it.' },
      { key: 'ringsA', label: 'First note: rings', unit: '', min: 1, max: 5, step: 1, value: 2 },
      { key: 'ringsB', label: 'Second note: rings', unit: '', min: 1, max: 5, step: 1, value: 2 },
      { key: 'mix', label: 'Second note', unit: '%', min: 0, max: 200, step: 1, value: 70, hint: 'How loud the second mode is. The lines reshape completely as you slide it.' },
      { key: 'twist', label: 'Phase', unit: '°', min: 0, max: 90, step: 1, value: 20 },
      { key: 'lineW', label: 'Line width', unit: 'mm', min: 2.4, max: 8, step: 0.1, value: 3.6 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      // Bessel J_n(x) = 1/π ∫₀^π cos(nτ − x sin τ) dτ
      const J = (n, x) => { let s = 0; const M = 48; for (let i = 0; i < M; i++) { const t = (Math.PI * (i + 0.5)) / M; s += Math.cos(n * t - x * Math.sin(t)) } return s / M }
      const zero = (n, q) => { let prev = J(n, 0.5), x = 0.5, found = 0; for (; x < 80; x += 0.05) { const v = J(n, x + 0.05); if (prev * v < 0 && ++found === q) return x + 0.025; prev = v } return 20 }
      const nA = p.sym, nB = 2 * p.sym
      const kA = zero(nA, p.ringsA), kB = zero(nB, p.ringsB)
      const R = g.Ri, mix = p.mix / 100, ph = deg(p.twist) * p.sym
      // radial tables, then the field on a grid
      const T = 600, JA = [], JB = []
      for (let i = 0; i <= T; i++) { const r = (i / T) * 1.05; JA.push(J(nA, kA * r)); JB.push(J(nB, kB * r)) }
      const look = (tab, r) => { const f = Math.min(T, (r / 1.05) * T), i = Math.floor(f), u = f - i; return i >= T ? tab[T] : tab[i] * (1 - u) + tab[i + 1] * u }
      const f = (x, y) => { const r = Math.hypot(x, y) / R, a = Math.atan2(y, x) - g.rot; return look(JA, r) * Math.cos(nA * a) + mix * look(JB, r) * Math.cos(nB * a + ph) }
      const h = 1.25, n = Math.ceil((2 * R) / h) + 1, x0 = -R
      const v = []
      for (let j = 0; j < n; j++) { const row = []; for (let i = 0; i < n; i++) row.push(f(x0 + i * h, x0 + j * h)); v.push(row) }
      // marching squares on the zero level, inside the disc, outside the collar
      const segs = []
      const cut = (a, b, pa, pb) => { const t = a / (a - b); return [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t] }
      for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
        const P = [[x0 + i * h, x0 + j * h], [x0 + (i + 1) * h, x0 + j * h], [x0 + (i + 1) * h, x0 + (j + 1) * h], [x0 + i * h, x0 + (j + 1) * h]]
        const rr = Math.hypot(P[0][0] + h / 2, P[0][1] + h / 2)
        if (rr > R + 1 || rr < g.hubR - 1) continue
        const V = [v[j][i], v[j][i + 1], v[j + 1][i + 1], v[j + 1][i]]
        const hits = []
        for (let e = 0; e < 4; e++) { const a = V[e], b = V[(e + 1) % 4]; if ((a < 0) !== (b < 0)) hits.push(cut(a, b, P[e], P[(e + 1) % 4])) }
        if (hits.length === 2) segs.push(hits)
        else if (hits.length === 4) segs.push([hits[0], hits[1]], [hits[2], hits[3]])
      }
      for (const [[ax, ay], [bx, by]] of segs) for (const cv of [rc, c]) (cv.seg(ax, ay, bx, by, p.lineW), cv.disc(ax, ay, p.lineW / 2))
      // the rim of a ringing plate is free; low spokes on the nodal diameters tie the loops in
      drawSpokes(c, g, 2 * p.sym, Math.PI / (2 * p.sym))
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'gasket',
    group: 'Claude',
    name: 'Infinite Descent',
    blurb: 'Claude, a thousand years on, designing from fractals alone: an Apollonian gasket. A ring of circles fits between collar and rim, and every gap is filled by the one circle that touches all three of its neighbours, again and again, smaller and smaller, down to the limit of the printer.',
    overrides: { strutW: 2.6, frameH: 4, reliefH: 9 },
    params: [
      { key: 'chain', label: 'Circles in the ring', unit: '', min: 3, max: 12, step: 1, value: 6, hint: 'The first ring of circles between the inner circle and the rim. Fewer = bigger circles and a bigger centre.' },
      { key: 'minR', label: 'Smallest circle', unit: 'mm', min: 1.2, max: 12, step: 0.1, value: 1.6, hint: 'Where the descent stops. Smaller = deeper fractal, heavier and slower to build.' },
      { key: 'ringW', label: 'Line width', unit: 'mm', min: 2.4, max: 6, step: 0.1, value: 3.6, hint: 'For the first circles. Each generation down is thinner, to 2.4 mm; below that circles become solid dots.' },
      { key: 'raise', label: 'Raised (colour B)', options: ['first circles', 'smallest circles', 'by depth'], value: 'first circles', hint: 'First circles: the big ring stands tall over a low lace of the rest. Smallest: the fine foam glitters on top. By depth: alternate generations.' },
      { key: 'core', label: 'Centre', options: ['second ring', 'plain'], value: 'second ring', hint: 'Second ring: the descent repeats inward, a ring of twice as many circles round the collar.' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const w = p.ringW
      // complex helpers
      const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
      const add = (...v) => v.reduce((s, q) => [s[0] + q[0], s[1] + q[1]], [0, 0])
      const sc = (a, k) => [a[0] * k, a[1] * k]
      const csqrt = ([x, y]) => { const m = Math.hypot(x, y), r = Math.sqrt((m + x) / 2), i = Math.sqrt(Math.max(0, (m - x) / 2)); return [r, y < 0 ? -i : i] }
      // a circle: curvature k (negative = encloses the others) and centre z
      const C = (x, y, r, outer = false) => ({ k: (outer ? -1 : 1) / r, z: [x, y] })
      const out = []
      const emit = (q, depth) => out.push({ x: q.z[0], y: q.z[1], r: Math.abs(1 / q.k), depth })
      const touching = (a, b) => { const d = Math.hypot(a.z[0] - b.z[0], a.z[1] - b.z[1]), ra = 1 / a.k, rb = 1 / b.k; return Math.abs(d - Math.abs(ra + rb)) < 1e-3 * (Math.abs(ra) + Math.abs(rb)) }
      // the small circle in the gap between three mutually touching circles (Descartes' theorem)
      const fourth = (a, b, d) => {
        const k = a.k + b.k + d.k + 2 * Math.sqrt(Math.max(0, a.k * b.k + b.k * d.k + d.k * a.k))
        const kz = add(sc(a.z, a.k), sc(b.z, b.k), sc(d.z, d.k))
        const root = sc(csqrt(add(sc(mul(a.z, b.z), a.k * b.k), sc(mul(b.z, d.z), b.k * d.k), sc(mul(a.z, d.z), a.k * d.k))), 2)
        for (const s of [1, -1]) {
          const q = { k, z: sc(add(kz, sc(root, s)), 1 / k) }
          if (touching(q, a) && touching(q, b) && touching(q, d)) return q
        }
        return null
      }
      // recurse: the new circle splits the gap into three; each has the opposite circle as its 'other'
      const fill = (a, b, d, depth) => {
        const q = fourth(a, b, d)
        if (!q || 1 / q.k < p.minR) return
        emit(q, depth)
        fill(a, b, q, depth + 1)
        fill(b, d, q, depth + 1)
        fill(a, d, q, depth + 1)
      }
      // a Steiner chain of n circles between two concentric circles, then fill every gap
      const chainBetween = (outerR, n, rotA, depth0, outerIsRim) => {
        const s = Math.sin(Math.PI / n), d = outerR / (1 + s), rho = d * s, innerR = d - rho
        const O = C(0, 0, outerR, true), I = C(0, 0, innerR)
        const ring = []
        for (let i = 0; i < n; i++) { const a = rotA + (TAU * i) / n; ring.push(C(d * Math.cos(a), d * Math.sin(a), rho)) }
        ring.forEach((q) => emit(q, depth0))
        if (!outerIsRim) emit({ k: 1 / outerR, z: [0, 0] }, depth0 - 1)
        for (let i = 0; i < n; i++) {
          const A = ring[i], B = ring[(i + 1) % n]
          fill(O, A, B, depth0 + 1)
          fill(I, A, B, depth0 + 1)
        }
        return innerR
      }
      const outerR = g.Ri + w / 2 // the rim's inner edge is the outermost circle
      const innerR = chainBetween(outerR, p.chain, g.rot, 0, true)
      if (p.core === 'second ring' && innerR > g.hubR + 6) chainBetween(innerR, p.chain * 2, g.rot + Math.PI / (p.chain * 2), 2, false)
      else emit({ k: 1 / innerR, z: [0, 0] }, 0)
      if (p.core !== 'second ring') drawSpokes(c, g, p.chain, Math.PI / p.chain)
      // draw: lines thin with each generation; circles too small for a hole become exact dots
      const maxDepth = Math.max(...out.map((q) => q.depth))
      for (const q of out) {
        const lw = Math.max(2.4, w * 0.8 ** Math.max(0, q.depth))
        if (Math.hypot(q.x, q.y) + q.r + lw / 2 < g.hubR - 1) continue // hidden inside the collar
        const big = q.r > lw * 1.4
        const tall = p.raise === 'first circles' ? q.depth <= 1 : p.raise === 'smallest circles' ? !big : q.depth % 2 === 0
        for (const cv of tall ? [rc, c] : [c]) big ? cv.ring(q.x, q.y, q.r, lw) : cv.disc(q.x, q.y, q.r)
      }
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'diatom',
    group: 'Claude',
    name: 'Diatom',
    blurb: 'Claude, a thousand years on, designing from living things alone: a diatom, the single-celled alga that grows itself a glass shell. Ribs fork as they grow outward, rings grow wider apart, and every cell holds a raised pore.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 8 },
    params: [
      { key: 'ribs', label: 'Ribs at the centre', unit: '', min: 5, max: 24, step: 1, value: 12 },
      { key: 'rows', label: 'Rings of cells', unit: '', min: 2, max: 10, step: 1, value: 4 },
      { key: 'growth', label: 'Growth', unit: '%', min: 0, max: 60, step: 1, value: 30, hint: 'How much wider each ring of cells is than the one inside it, the way a shell grows.' },
      { key: 'fork', label: 'Ribs fork when cells are wider than', unit: 'mm', min: 8, max: 50, step: 0.5, value: 30 },
      { key: 'twist', label: 'Spiral', unit: '°', min: -40, max: 40, step: 1, value: 10, hint: 'Ribs lean a little round as they grow, like Actinoptychus. 0 = straight.' },
      { key: 'pore', label: 'Pores', options: ['rings', 'domes', 'none'], value: 'rings', hint: 'Rings: a raised rim inside every cell. Domes: a raised dot. None: just the ribbed shell.' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const r0 = g.hubR + 4, r1 = g.Ri + g.w / 2
      // ring radii: each band (1 + growth) wider than the last
      const q = 1 + p.growth / 100
      let unit = (r1 - r0) * (q === 1 ? 1 / p.rows : (q - 1) / (q ** p.rows - 1))
      const R = [r0]
      for (let j = 0; j < p.rows; j++) R.push(R[j] + unit * q ** j)
      const lean = (r) => deg(p.twist) * ((r - r0) / (r1 - r0)) // ribs curve round as they go out
      const P = (r, a) => [r * Math.cos(a + lean(r)), r * Math.sin(a + lean(r))]
      // rib angles per band: double the count wherever cells get too wide
      let n = p.ribs
      const bands = []
      for (let j = 0; j < p.rows; j++) {
        const mid = (R[j] + R[j + 1]) / 2
        if ((TAU * mid) / n > p.fork * 1.4 && n < 400) n *= 2
        bands.push(n)
      }
      c.ring(0, 0, r0, g.w * 1.2) // the central hyaline ring
      for (let j = 1; j < R.length - 1; j++) c.ring(0, 0, R[j], Math.max(2.6, g.w * 0.85))
      for (let j = 0; j < p.rows; j++) {
        const m = bands[j], ra = R[j], rb = R[j + 1]
        for (let i = 0; i < m; i++) {
          const a = g.rot + (TAU * i) / m
          const pts = []
          for (let s = 0; s <= 8; s++) pts.push(P(ra + ((rb - ra) * s) / 8, a))
          c.line(pts, Math.max(2.6, g.w * (m === p.ribs ? 1.1 : 0.9)))
          if (p.pore === 'none') continue
          // the pore: inscribed in the cell between this rib and the next
          const am = a + Math.PI / m, rm = (ra + rb) / 2
          const [x, y] = P(rm, am)
          const inR = Math.min((rb - ra) / 2, rm * Math.sin(Math.PI / m)) - g.w * 0.45
          if (inR < 2) continue
          if (p.pore === 'rings') {
            const pw = Math.max(2.6, inR * 0.28)
            rc.ring(x, y, inR - pw / 2 + 0.4, pw)
            c.ring(x, y, inR - pw / 2 + 0.4, pw) // touches all four walls, so it is tied in
          } else {
            rc.disc(x, y, inR * 0.5)
            for (let s = 0; s < 4; s++) { const b = am + (s * Math.PI) / 2; c.seg(x, y, x + inR * 1.1 * Math.cos(b), y + inR * 1.1 * Math.sin(b), 2.8) } // tiny struts hold the dome
            c.disc(x, y, inR * 0.5)
          }
        }
      }
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  // ========================================================= EARTH FRACTALS
  // Self-similar forms from the living and weathered Earth. Each is drawn once
  // per sector and copied round, so they balance.
  {
    id: 'snowflake',
    group: 'Earth',
    name: 'Snowflake',
    blurb: 'A dendritic ice crystal: six arms grow from a hexagonal plate, every arm sprouts side arms at 60°, and they sprout their own. The same rule at every scale, as water vapour freezes.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 8 },
    params: [
      { key: 'arms', label: 'Arms', unit: '', min: 3, max: 12, step: 1, value: 6 },
      { key: 'depth', label: 'Branching depth', unit: '', min: 1, max: 3, step: 1, value: 2 },
      { key: 'side', label: 'Side arms per arm', unit: '', min: 2, max: 6, step: 1, value: 3 },
      { key: 'reach', label: 'Side arm length', unit: '%', min: 20, max: 70, step: 1, value: 38 },
      { key: 'armW', label: 'Arm width', unit: 'mm', min: 3, max: 10, step: 0.5, value: 6 },
      { key: 'plate', label: 'Centre plate', options: ['hexagon', 'none'], value: 'hexagon' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const both = (pts, w0, w1) => (rc.taper(pts, w0, w1), c.taper(pts, w0, w1))
      const minW = 2.6, side = deg(60)
      const grow = (x, y, a, L, w, d) => {
        const ex = x + L * Math.cos(a), ey = y + L * Math.sin(a)
        both([[x, y], [ex, ey]], w, Math.max(minW, w * 0.55))
        if (d <= 0) return
        for (let s = 1; s <= p.side; s++) {
          const f = s / (p.side + 1)
          const bx = x + L * f * Math.cos(a), by = y + L * f * Math.sin(a)
          const bl = L * (p.reach / 100) * (1 - f * 0.7)
          const bw = Math.max(minW, w * 0.62 * (1 - f * 0.4))
          if (bl < 3) continue
          for (const sg of [1, -1]) grow(bx, by, a + sg * side, bl, bw, d - 1)
        }
      }
      const r0 = g.hubR - 1, L = g.Ri + 1 - r0
      for (let i = 0; i < p.arms; i++) {
        const a = g.rot + (TAU * i) / p.arms
        grow(r0 * Math.cos(a), r0 * Math.sin(a), a, L, p.armW, p.depth)
      }
      if (p.plate === 'hexagon') {
        const hr = g.hubR + (g.Ri - g.hubR) * 0.2, hex = []
        for (let i = 0; i < p.arms; i++) { const a = g.rot + (TAU * (i + 0.5)) / p.arms; hex.push([hr * Math.cos(a), hr * Math.sin(a)]) }
        rc.line(hex, p.armW * 0.6, true); c.line(hex, p.armW * 0.6, true)
      }
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'roots',
    group: 'Earth',
    name: 'Roots',
    blurb: 'Roots, river deltas, lightning, lungs: one stem forking into two, again and again, thinner each time. Each root is grown from a seed and copied round so the hub balances.',
    overrides: { strutW: 3, frameH: 3.5, reliefH: 8 },
    params: [
      { key: 'roots', label: 'Roots', unit: '', min: 3, max: 9, step: 1, value: 5 },
      { key: 'forks', label: 'Forks', unit: '', min: 2, max: 7, step: 1, value: 5 },
      { key: 'spread', label: 'Fork angle', unit: '°', min: 8, max: 50, step: 1, value: 24 },
      { key: 'wild', label: 'Wildness', unit: '%', min: 0, max: 100, step: 1, value: 40, hint: 'How much each fork wanders from a perfect binary tree.' },
      { key: 'stemW', label: 'Stem width', unit: 'mm', min: 4, max: 16, step: 0.5, value: 9 },
      { key: 'seed', label: 'Seed', unit: '', min: 1, max: 999, step: 1, value: 11, seed: true },
      { key: 'frame', label: 'Frame', options: ['ring', 'none'], value: 'ring', hint: 'A low ring halfway out catches the tips of the middle branches.' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const both = (pts, w0, w1) => (rc.taper(pts, w0, w1), c.taper(pts, w0, w1))
      const Rmax = g.Ri + 1, k = 0.76
      const span = Rmax - g.hubR
      const L0 = (span * 1.25 * (1 - k)) / (1 - k ** (p.forks + 1))
      let rand
      const grow = (x, y, a, L, w, d) => {
        // a slightly bent segment, cut short where it meets the rim
        const bend = (rand() - 0.5) * deg(p.spread) * (p.wild / 100)
        const pts = []
        let hit = false
        for (let s = 0; s <= 6; s++) {
          const t = s / 6, aa = a + bend * t
          const q = [x + L * t * Math.cos(aa), y + L * t * Math.sin(aa)]
          if (Math.hypot(q[0], q[1]) > Rmax) { hit = true; break }
          pts.push(q)
        }
        if (pts.length > 1) both(pts, w, Math.max(2.6, w * k))
        if (hit || d <= 0 || pts.length < 7) return
        const [ex, ey] = pts.at(-1), ea = a + bend
        const lean = (rand() - 0.5) * (p.wild / 100)
        for (const sg of [1, -1]) {
          const da = deg(p.spread) * (1 + sg * lean * 0.6)
          grow(ex, ey, ea + sg * da, L * k * (0.85 + 0.3 * rand()), Math.max(2.6, w * k), d - 1)
        }
      }
      for (let i = 0; i < p.roots; i++) {
        rand = rng(p.seed) // same tree in every sector
        const a = g.rot + (TAU * i) / p.roots, r0 = g.hubR - 1
        grow(r0 * Math.cos(a), r0 * Math.sin(a), a, L0, p.stemW, p.forks)
      }
      if (p.frame === 'ring') c.ring(0, 0, g.hubR + span * 0.55, g.w * 0.9)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'romanesco',
    group: 'Earth',
    name: 'Romanesco',
    blurb: 'Romanesco broccoli: a spiral of florets, every floret itself a spiral, growing bigger toward the rim. The arms are parastichies, the spirals sunflowers and pine cones grow in.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 8 },
    params: [
      { key: 'armsR', label: 'Florets per row', unit: '', min: 6, max: 21, step: 1, value: 13, hint: 'Florets lie on this many spiral arms. Real romanesco shows 8 one way and 13 the other.' },
      { key: 'twistR', label: 'Extra spiral', unit: '°', min: -20, max: 20, step: 1, value: 6, hint: 'Rows are already offset by half a floret, which makes the two families of spirals. This leans them further.' },
      { key: 'turnsF', label: 'Turns in each floret', unit: '', min: 0.5, max: 2.5, step: 0.05, value: 1.3 },
      { key: 'lineW', label: 'Line width', unit: 'mm', min: 2.4, max: 5, step: 0.1, value: 2.8 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const n = p.armsR, s = Math.sin(Math.PI / n)
      // rows of n florets, each row offset half a floret (hex packing), so radius
      // grows geometrically and the florets lie on two families of spirals
      const rows = []
      let rm = (g.hubR + 1) / (1 - s * 0.9)
      for (let j = 0; rm < g.Ri + 2 && j < 40; j++) {
        rows.push({ rm, j })
        rm *= (1 + s * 0.95) / (1 - s * 0.95) * 0.82 // a step a bit under one floret: neighbours overlap
      }
      for (const { rm, j } of rows) for (let a = 0; a < n; a++) {
        const th = g.rot + (TAU * a) / n + (j * Math.PI) / n + deg(p.twistR) * j
        const fr = Math.min(rm * s * 1.0, g.Ri + 2 - rm + rm * s) // the outer row runs into the rim
        const cx = rm * Math.cos(th), cy = rm * Math.sin(th)
        c.ring(cx, cy, fr, p.lineW)
        // the floret's own spiral, from its rim into its centre
        const pts = [], T = TAU * p.turnsF, b = Math.log(fr / Math.max(1.5, fr * 0.12)) / T
        for (let s = 0; s <= 60; s++) { const t = (T * s) / 60, r = fr * Math.exp(-b * t); pts.push([cx + r * Math.cos(th + t), cy + r * Math.sin(th + t)]) }
        rc.taper(pts, p.lineW * 1.3, 2.4)
        c.taper(pts, p.lineW * 1.3, 2.4)
        rc.disc(cx, cy, Math.max(1.4, fr * 0.14))
      }
      drawSpokes(c, g, n, Math.PI / n) // low ties, so the rim is always held
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'fern',
    group: 'Earth',
    name: 'Fern',
    blurb: 'A fern frond is a frond of fronds: every leaflet repeats the whole leaf, smaller. Barnsley found four simple rules make one. Here the fronds arc out from the staff to the rim.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 8 },
    params: [
      { key: 'fronds', label: 'Fronds', unit: '', min: 3, max: 8, step: 1, value: 5 },
      { key: 'pinnae', label: 'Leaflets per side', unit: '', min: 3, max: 16, step: 1, value: 6 },
      { key: 'sub', label: 'Leaflets on leaflets', options: ['on', 'off'], value: 'on' },
      { key: 'arc', label: 'Arc', unit: '°', min: 0, max: 70, step: 1, value: 35, hint: 'How far each frond curves round as it grows.' },
      { key: 'leaf', label: 'Leaflet length', unit: '%', min: 15, max: 50, step: 1, value: 28 },
      { key: 'stemW', label: 'Stem width', unit: 'mm', min: 3, max: 10, step: 0.5, value: 6 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const both = (pts, w0, w1) => (rc.taper(pts, w0, w1), c.taper(pts, w0, w1))
      const r0 = g.hubR - 1, r1 = g.Ri + 1
      // a curved stem with leaflets alternating sides, each leaflet a smaller stem
      const frond = (pts, w, depth, nP) => {
        both(pts, w, Math.max(2.6, w * 0.45))
        if (depth <= 0) return
        const n = pts.length - 1
        for (let i = 1; i <= nP; i++) {
          const f = i / (nP + 1), k = Math.round(f * n)
          const [x, y] = pts[k], [x2, y2] = pts[Math.min(n, k + 1)]
          const a = Math.atan2(y2 - y, x2 - x)
          const sg = i % 2 ? 1 : -1
          const L = Math.hypot(pts[n][0] - pts[0][0], pts[n][1] - pts[0][1]) * (p.leaf / 100) * (1 - f * 0.75)
          if (L < 4) continue
          const sub = []
          for (let s = 0; s <= 12; s++) { const t = s / 12, aa = a + sg * (deg(55) - deg(25) * t); sub.push([x + L * t * Math.cos(aa), y + L * t * Math.sin(aa)]) }
          frond(sub, Math.max(2.6, w * 0.55), depth - 1, Math.max(3, Math.round(nP * 0.6)))
        }
      }
      for (let i = 0; i < p.fronds; i++) {
        const base = g.rot + (TAU * i) / p.fronds, pts = []
        for (let s = 0; s <= 40; s++) { const t = s / 40, r = r0 + (r1 - r0) * t, a = base + deg(p.arc) * t * t; pts.push([r * Math.cos(a), r * Math.sin(a)]) }
        frond(pts, p.stemW, p.sub === 'on' ? 2 : 1, p.pinnae * 2)
      }
      c.ring(0, 0, (g.hubR + g.Ri) / 2, Math.max(2.6, g.w * 0.85))
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  // ========================================================= FRACTAL CREATURES
  {
    id: 'dragoncurve',
    group: 'Fractal creatures',
    name: 'Dragon Curve',
    blurb: 'The Heighway dragon: fold a strip of paper in half again and again, open every fold to a right angle, and a dragon appears. Four of them, coiled round the staff, tile the space between them exactly.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 8 },
    params: [
      { key: 'folds', label: 'Folds', unit: '', min: 5, max: 12, step: 1, value: 8, hint: 'Each fold doubles the dragon. More folds = finer scales, thinner lines.' },
      { key: 'dragons', label: 'Dragons', options: ['2', '4'], value: '2', hint: 'Two dragons, back to back, show the classic shape. Four fill the disc between them like a tiling.' },
      { key: 'corners', label: 'Corners', options: ['round', 'sharp'], value: 'round', hint: 'Round cuts every corner, so the curve flows like a body. Sharp is the true fractal; it touches itself at every corner.' },
      { key: 'lineW', label: 'Line width', unit: '% of step', min: 30, max: 80, step: 1, value: 50 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      let pts = [[0, 0], [1, 0]]
      for (let i = 0; i < p.folds; i++) {
        const [px, py] = pts.at(-1)
        const add = pts.slice(0, -1).reverse().map(([x, y]) => [px - (y - py), py + (x - px)]) // turn 90° about the end
        pts = pts.concat(add)
      }
      if (p.corners === 'round') pts = [pts[0], ...pts.slice(0, -1).map((q, i) => [(q[0] + pts[i + 1][0]) / 2, (q[1] + pts[i + 1][1]) / 2]), pts.at(-1)]
      const rMax = Math.max(...pts.map(([x, y]) => Math.hypot(x, y)))
      const step = (g.Ri + 1) / rMax
      const lw = Math.max(2.6, Math.min(9, (step * p.lineW) / 100))
      const n = Number(p.dragons)
      for (let k = 0; k < n; k++) {
        const a = g.rot + (TAU * k) / n
        const q = pts.map(([x, y]) => rot([x * step, y * step], a))
        rc.line(q, lw); c.line(q, lw)
      }
      drawSpokes(c, g, n * 2, Math.PI / (n * 2)) // low ties where the dragons leave gaps
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'basketstar',
    group: 'Fractal creatures',
    name: 'Basket Star',
    blurb: 'Gorgonocephalus, the basket star: a starfish relative whose five arms fork, and fork, and fork again into thousands of curling tendrils that it opens like a net at night.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 8 },
    params: [
      { key: 'arms', label: 'Arms', unit: '', min: 3, max: 8, step: 1, value: 5 },
      { key: 'forks', label: 'Forks', unit: '', min: 2, max: 6, step: 1, value: 4 },
      { key: 'spread', label: 'Fork angle', unit: '°', min: 10, max: 45, step: 1, value: 26 },
      { key: 'curl', label: 'Curl', unit: '°', min: 0, max: 60, step: 1, value: 28, hint: 'Every branch bends a little the same way, so the tips coil, as the real animal’s do.' },
      { key: 'armW', label: 'Arm width', unit: 'mm', min: 4, max: 14, step: 0.5, value: 8 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const both = (pts, w0, w1) => (rc.taper(pts, w0, w1), c.taper(pts, w0, w1))
      const Rmax = g.Ri + 1, k = 0.72
      const disc = g.hubR + 8
      const L0 = ((Rmax - disc) * 1.35 * (1 - k)) / (1 - k ** (p.forks + 1))
      const grow = (x, y, a, L, w, d, sg) => {
        const pts = [[x, y]]
        let aa = a, hit = false
        const bendPer = (deg(p.curl) * sg) / 8
        for (let s = 1; s <= 8; s++) {
          aa += bendPer
          const q = [pts[s - 1][0] + (L / 8) * Math.cos(aa), pts[s - 1][1] + (L / 8) * Math.sin(aa)]
          if (Math.hypot(q[0], q[1]) > Rmax) { hit = true; break }
          pts.push(q)
        }
        if (pts.length > 1) both(pts, w, Math.max(2.6, w * k))
        if (hit) return
        const [ex, ey] = pts.at(-1)
        if (d <= 0) {
          // a tight curl at the tip
          const tip = [[ex, ey]]
          let r = L * 0.35, b = aa
          for (let s = 0; s < 16; s++) { b += sg * 0.42; r *= 0.9; const q = [tip[s][0] + r * 0.4 * Math.cos(b), tip[s][1] + r * 0.4 * Math.sin(b)]; if (Math.hypot(q[0], q[1]) > Rmax) break; tip.push(q) }
          if (tip.length > 2) both(tip, 2.6, 2.6)
          return
        }
        for (const s2 of [1, -1]) grow(ex, ey, aa + s2 * deg(p.spread), L * k, Math.max(2.6, w * k), d - 1, s2)
      }
      for (let i = 0; i < p.arms; i++) {
        const a = g.rot + (TAU * i) / p.arms
        const x = disc * Math.cos(a), y = disc * Math.sin(a)
        both([[g.hubR * Math.cos(a), g.hubR * Math.sin(a)], [x, y]], p.armW * 1.3, p.armW)
        grow(x, y, a, L0, p.armW, p.forks, 1)
      }
      // the central disc, a five-lobed star
      const body = []
      for (let s = 0; s < 120; s++) { const t = (TAU * s) / 120, r = disc * (0.86 + 0.14 * Math.cos(p.arms * t)); body.push([r * Math.cos(t + g.rot), r * Math.sin(t + g.rot)]) }
      rc.line(body, 3.2, true); c.line(body, 3.2, true)
      c.ring(0, 0, g.hubR + (g.Ri - g.hubR) * 0.62, Math.max(2.6, g.w * 0.85))
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'nautilus',
    group: 'Fractal creatures',
    name: 'Nautilus',
    blurb: 'Nautilus shells, each a logarithmic spiral of chambers: every new chamber the same shape as the last, only larger. The shells’ outer whorls lean on the rim and the collar.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 9 },
    params: [
      { key: 'shells', label: 'Shells', unit: '', min: 2, max: 4, step: 1, value: 3 },
      { key: 'growth', label: 'Growth per turn', unit: '×', min: 2, max: 4, step: 0.05, value: 3, hint: 'A real nautilus grows about 3× per turn.' },
      { key: 'chambers', label: 'Chambers per turn', unit: '', min: 6, max: 20, step: 1, value: 12 },
      { key: 'wallW', label: 'Shell wall', unit: 'mm', min: 3, max: 9, step: 0.5, value: 5 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const both = (pts, w0, w1) => (rc.taper(pts, w0, w1), c.taper(pts, w0, w1))
      const b = Math.log(p.growth) / TAU, back = Math.exp(-b * Math.PI)
      // size and place each shell so its mouth meets the rim and its far whorl the collar
      const Rs = (g.Ri - g.hubR + 2) / (1 + back), dC = g.Ri + 1 - Rs
      for (let k = 0; k < p.shells; k++) {
        const phi = g.rot + (TAU * k) / p.shells
        const C = [dC * Math.cos(phi), dC * Math.sin(phi)]
        const at = (t) => { const r = Rs * Math.exp(b * t); return [C[0] + r * Math.cos(t + phi), C[1] + r * Math.sin(t + phi)] } // t ≤ 0
        const tMin = Math.log(3 / Rs) / b
        const spiral = []
        for (let s = 0; s <= 240; s++) spiral.push(at(tMin * (1 - s / 240)))
        both(spiral, 2.6, p.wallW)
        both([at(0), at(-TAU)], p.wallW * 0.8, p.wallW * 0.8) // the mouth
        // septa: each joins the whorl to the one inside it, bowed back
        for (let j = 1; ; j++) {
          const t = -(TAU * j) / p.chambers
          if (Rs * Math.exp(b * (t - TAU)) < 2.5) break
          const A = at(t), B = at(t - TAU), M = at(t - TAU * 0.5 - 0.35)
          const mid = [(A[0] + B[0]) / 2 * 0.8 + M[0] * 0.2, (A[1] + B[1]) / 2 * 0.8 + M[1] * 0.2]
          const sept = bez(A, mid, mid, B, 10)
          both(sept, Math.max(2.6, p.wallW * 0.5 * Math.exp(b * t * 0.5)), 2.6)
        }
      }
      drawSpokes(c, g, p.shells, Math.PI / p.shells + 0.35)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'circlelimit',
    group: 'Fractal creatures',
    name: 'Circle Limit',
    blurb: 'After Escher’s Circle Limit: the logo dragonflies fly in rings that get smaller and more crowded toward the rim, as if the edge were infinitely far away. Each ring flies the other way.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 8 },
    params: [
      { key: 'first', label: 'Biggest dragonfly', unit: 'mm', min: 14, max: 40, step: 0.5, value: 20, hint: 'Half the wingspan of the dragonflies nearest the staff.' },
      { key: 'smallest', label: 'Smallest dragonfly', unit: 'mm', min: 5, max: 16, step: 0.5, value: 8 },
      { key: 'gapF', label: 'Spacing', unit: '%', min: 100, max: 200, step: 1, value: 150, hint: 'Space round each ring for each dragonfly, as a share of its body length.' },
      { key: 'alt', label: 'Rings fly', options: ['opposite ways', 'the same way'], value: 'opposite ways' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const RL = g.Ri + 6 // the 'infinitely far' edge, just past the rim
      let e = g.hubR + 2, k = 0
      const sizeAt = (r) => p.first * (1 - (r / RL) ** 2) / (1 - ((g.hubR + p.first) / RL) ** 2)
      c.ring(0, 0, e, Math.max(2.6, g.w))
      while (k < 12) {
        // band height 2s with s set by the hyperbolic shrink at the band's middle
        let s = p.first
        for (let it = 0; it < 6; it++) s = Math.max(1, sizeAt(e + s))
        if (s < p.smallest || e + 2 * s > g.Ri + 1) break
        const r = e + s
        const n = Math.max(3, Math.floor((TAU * r) / (s * 1.25 * (p.gapF / 100))))
        const dir = p.alt === 'opposite ways' && k % 2 ? Math.PI : 0
        for (let i = 0; i < n; i++) {
          const a = g.rot + (TAU * (i + (k % 2) * 0.5)) / n
          rc.contours.push(...logoDragonfly(s * 0.98, a + dir, r * Math.cos(a), r * Math.sin(a)))
        }
        e += 2 * s
        c.ring(0, 0, e, Math.max(2.6, g.w * (0.6 + 0.4 * s / p.first)))
        k++
      }
      drawSpokes(c, g, 6, Math.PI / 6)
      return { relief: { contours: rc.contours, thicken: 1.0, gap: 0, slits: false } }
    },
  },
  // ========================================================= THAI MYTHOLOGY
  {
    id: 'naga',
    group: 'Thai',
    name: 'Phaya Naga',
    blurb: 'The Naga, serpent king of the rivers, guardian of temple stairs: crested bodies rippling out from the staff, each rearing a five-headed hood with flame crests at the rim.',
    overrides: { strutW: 3, frameH: 4, reliefH: 10 },
    params: [
      { key: 'nagas', label: 'Nagas', unit: '', min: 2, max: 4, step: 1, value: 3 },
      { key: 'heads', label: 'Heads', options: ['1', '3', '5', '7'], value: '5', hint: 'Nagas are shown with one to nine heads; odd numbers, the middle one tallest.' },
      { key: 'bodyW', label: 'Body width', unit: 'mm', min: 7, max: 20, step: 0.5, value: 14 },
      { key: 'waves', label: 'Ripples', unit: '', min: 0, max: 4, step: 0.5, value: 2 },
      { key: 'sweep', label: 'Sweep', unit: '°', min: 20, max: 120, step: 1, value: 70 },
      { key: 'crest', label: 'Back crest', options: ['on', 'off'], value: 'on' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(p.bodyW), holes = []
      const W = p.bodyW, k = Number(p.heads)
      const Lh = W * 1.35, Ln = W * 2.1 // head and neck length: long necks keep the heads apart
      for (let d = 0; d < p.nagas; d++) {
        const base = g.rot + (TAU * d) / p.nagas
        const rA = g.hubR + 1, rB = g.Ri - (Ln + Lh) * 0.75
        const path = []
        for (let i = 0; i <= 120; i++) {
          const t = i / 120, r = rA + (rB - rA) * t
          const th = base + deg(p.sweep) * t + (p.waves ? 0.09 * Math.sin(Math.PI * p.waves * t * 2) * (0.3 + t) : 0)
          path.push([r * Math.cos(th), r * Math.sin(th)])
        }
        const w = (t) => 3 + (W - 3) * Math.min(1, t * 1.4)
        drawDragonBody(rc, holes, path, w, { spines: p.crest === 'on', spineEvery: 6, spineSide: -1, spineH: (t) => w(t) * 0.55, scales: true, scaleEvery: 4, headLen: 0.01, whiskers: false })
        // the hood: heads fanned out from the end of the body
        const E = path.at(-1), [px, py] = path.at(-3)
        const ang = Math.atan2(E[1] - py, E[0] - px)
        const fan = k > 1 ? deg(30 + 14 * k) : 0
        for (let j = 0; j < k; j++) {
          const off = k > 1 ? -fan / 2 + (fan * j) / (k - 1) : 0
          const a = ang + off - deg(10) // lean the fan outward a touch
          const mid = 1 - Math.abs(off) / (fan / 2 || 1) * 0.25
          const N = [E[0] + Ln * mid * Math.cos(a), E[1] + Ln * mid * Math.sin(a)]
          rc.taper(bez(E, [E[0] + Ln * 0.5 * Math.cos(ang), E[1] + Ln * 0.5 * Math.sin(ang)], [N[0] - Ln * 0.3 * Math.cos(a), N[1] - Ln * 0.3 * Math.sin(a)], N, 12), W * 0.62, W * 0.42)
          const L = Lh * mid
          const head = [[0, 0.3], [0.45, 0.34], [0.8, 0.22], [1, 0.04], [0.94, -0.1], [0.55, -0.24], [0.08, -0.28], [-0.12, 0]].map(([x, y]) => [x * L, y * L])
          rc.solid(place(head, a, N[0], N[1]))
          // flame crest flicking back off the head: a kranok tip
          rc.taper(place([[0.3 * L, 0.28 * L], [0.12 * L, 0.55 * L], [-0.18 * L, 0.7 * L], [-0.42 * L, 0.6 * L]], a, N[0], N[1]), 3.6, 2.6)
          const [ex, ey] = place([[0.62 * L, 0.1 * L]], a, N[0], N[1])[0]
          holes.push(ccw(circlePts(ex, ey, Math.max(1.6, L * 0.05), 20)))
        }
        // the hood: a webbed fan joining the necks low down
        if (k > 1) {
          const sect = [E]
          for (let s = 0; s <= 12; s++) { const a = ang - fan / 2 - deg(10) + (fan * s) / 12; sect.push([E[0] + Ln * 0.38 * Math.cos(a), E[1] + Ln * 0.38 * Math.sin(a)]) }
          rc.solid(sect)
        }
      }
      for (const f of [0.38, 0.72]) c.ring(0, 0, g.hubR + (g.Ri - g.hubR) * f, Math.max(2.6, g.w * 0.85))
      drawSpokes(c, g, p.nagas * 2, Math.PI / (p.nagas * 2))
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 1.2, slits: false } }
    },
  },
  {
    id: 'kranok',
    group: 'Thai',
    name: 'Lai Kranok',
    blurb: 'Kranok, the flame at the heart of Thai ornament, on temple gables, boats and robes: rings of flame-tongues, each with a curl at its root, all flicking the same way so they seem to burn round as it spins.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 8 },
    params: [
      { key: 'rings', label: 'Rings of flames', unit: '', min: 2, max: 5, step: 1, value: 3 },
      { key: 'first', label: 'Flames in the first ring', unit: '', min: 6, max: 20, step: 1, value: 10 },
      { key: 'flick', label: 'Flick', unit: '%', min: -100, max: 100, step: 1, value: 60, hint: 'How far each flame tip bends sideways. Negative flicks the other way.' },
      { key: 'fill', label: 'Flames', options: ['outlines', 'solid'], value: 'outlines' },
      { key: 'curlK', label: 'Root curls', options: ['on', 'off'], value: 'on' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const r0 = g.hubR + 2, span = g.Ri + 1 - r0
      // bands grow outward a little, like the tiers of a gable
      const q = 1.25, unit = (span * (q - 1)) / (q ** p.rings - 1)
      let rIn = r0
      for (let k = 0; k < p.rings; k++) {
        const h = unit * q ** k, n = Math.round(p.first * (rIn + h / 2) / (r0 + unit / 2))
        const arc = (TAU * (rIn + h * 0.35)) / n
        const L = h * 1.06, Wd = arc * 0.92
        for (let i = 0; i < n; i++) {
          const a = g.rot + (TAU * (i + (k % 2) * 0.5)) / n
          // the flame in local coords: x outward along its length, y sideways
          const side = [], other = []
          for (let s = 0; s <= 24; s++) {
            const t = s / 24
            const cy = (p.flick / 100) * L * 0.38 * t ** 2.2
            const hw = (Wd / 2) * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.02)) ** 0.75 * (1 - t) ** 0.15
            side.push([t * L, cy + hw]); other.push([t * L, cy - hw])
          }
          const flame = place([...side, ...other.reverse()], a, rIn * Math.cos(a), rIn * Math.sin(a))
          if (p.fill === 'solid') (rc.solid(ccw(flame)), c.solid(ccw(flame)))
          else (rc.line(flame, 2.6, true), c.line(flame, 2.6, true))
          if (p.curlK === 'on') {
            // a little curl curl in the flame's root
            const cr = Math.min(Wd * 0.24, L * 0.16), curl = []
            for (let s = 0; s <= 30; s++) { const t = (s / 30) * TAU * 1.1, r = cr * Math.exp(-0.28 * t); curl.push([L * 0.2 + r * Math.cos(t + Math.PI), r * Math.sin(t + Math.PI) * Math.sign(p.flick || 1)]) }
            const pc = place([[0, 0], ...curl], a, rIn * Math.cos(a), rIn * Math.sin(a))
            rc.taper(pc, 2.6, 2.6); c.taper(pc, 2.6, 2.6)
          }
        }
        c.ring(0, 0, rIn, Math.max(2.6, g.w * 0.9))
        rIn += h
      }
      drawSpokes(c, g, p.first, Math.PI / p.first)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'hongsa',
    group: 'Thai',
    name: 'Hongsa',
    blurb: 'The Hongsa, the celestial swan that carries Brahma and crowns the poles outside Mon and Thai temples: a ring of swans in flight, wings and tails drawn as kranok flames.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 9 },
    params: [
      { key: 'birds', label: 'Swans', unit: '', min: 3, max: 9, step: 1, value: 5 },
      { key: 'size', label: 'Size', unit: '%', min: 60, max: 110, step: 1, value: 92 },
      { key: 'neckS', label: 'Neck curve', unit: '%', min: 0, max: 100, step: 1, value: 70 },
      { key: 'tailCurl', label: 'Tail curl', unit: '', min: 0.5, max: 2, step: 0.05, value: 1.2, hint: 'Turns in the curl at the end of the tail flame.' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const both = (pts, w0, w1) => (rc.taper(pts, w0, w1), c.taper(pts, w0, w1))
      const rb = g.hubR + (g.Ri - g.hubR) * 0.4
      const s = Math.min((TAU * rb) / p.birds * 0.95, (g.Ri - rb) / 0.7) * (p.size / 100)
      // a flame (kranok) as a closed outline in local coords
      const flame = (x0, y0, dir, L, Wd, flick) => {
        const A = [], B = []
        for (let i = 0; i <= 18; i++) {
          const t = i / 18, cy = flick * L * 0.35 * t ** 2, hw = (Wd / 2) * Math.sin(Math.PI * Math.min(1, t + 0.04)) ** 0.7 * (1 - t) ** 0.2
          A.push([t * L, cy + hw]); B.push([t * L, cy - hw])
        }
        return place([...A, ...B.reverse()], dir, x0, y0)
      }
      for (let i = 0; i < p.birds; i++) {
        const a = g.rot + (TAU * i) / p.birds
        const T = [-Math.sin(a), Math.cos(a)], Rd = [Math.cos(a), Math.sin(a)] // flying round, 'up' = outward
        const C = [rb * Rd[0], rb * Rd[1]]
        const P = ([x, y]) => [C[0] + (x * T[0] + y * Rd[0]) * s, C[1] + (x * T[1] + y * Rd[1]) * s]
        const dirOf = (local) => Math.atan2(Math.sin(local) * Rd[1] + Math.cos(local) * T[1], Math.sin(local) * Rd[0] + Math.cos(local) * T[0])
        // body
        const body = []
        for (let k = 0; k < 40; k++) { const t = (TAU * k) / 40; body.push(P([0.3 * Math.cos(t), 0.12 * Math.sin(t) - 0.02 * Math.cos(t) ** 2])) }
        rc.solid(ccw(body)); c.solid(ccw(body))
        // neck and head
        const neck = bez([0.22, 0.04], [0.45, 0.05], [0.25 + 0.15 * (1 - p.neckS / 100), 0.36], [0.5, 0.44], 20).map(P)
        both(neck, 0.1 * s, 0.065 * s)
        const H = P([0.52, 0.45]); rc.disc(H[0], H[1], 0.065 * s); c.disc(H[0], H[1], 0.065 * s)
        const beak = [P([0.55, 0.49]), P([0.72, 0.42]), P([0.56, 0.40])]; rc.solid(ccw(beak)); c.solid(ccw(beak))
        // crest flame off the head
        both(bez([0.48, 0.5], [0.42, 0.62], [0.3, 0.64], [0.22, 0.58], 10).map(P), 3.2, 2.6)
        // wing: a tall kranok rising off the back, flicking backward
        const B0 = P([0.02, 0.08])
        const wing = flame(B0[0], B0[1], dirOf(deg(100)), 0.62 * s, 0.24 * s, 0.9)
        rc.line(wing, 2.8, true); c.line(wing, 2.8, true)
        // tail: a kranok sweeping back, ending in a curl
        const t0 = P([-0.28, 0.0]), tdir = dirOf(deg(172))
        const tail = flame(t0[0], t0[1], tdir, 0.36 * s, 0.14 * s, 1.2)
        rc.line(tail, 2.8, true); c.line(tail, 2.8, true)
        const tipL = place([[0.36 * s, 0.36 * 0.35 * 1.2 * s]], tdir, t0[0], t0[1])[0]
        const curl = [tipL]
        let r = 0.07 * s, ang = tdir + Math.PI / 2
        for (let k = 0; k < 28; k++) { ang += (TAU * p.tailCurl) / 28; r *= 0.94; const q = curl[k]; curl.push([q[0] + r * 0.35 * Math.cos(ang), q[1] + r * 0.35 * Math.sin(ang)]) }
        both(curl, 2.8, 2.6)
      }
      c.ring(0, 0, rb - 0.13 * s, Math.max(2.6, g.w)) // they fly on a low ring
      c.ring(0, 0, Math.min(g.Ri - 3, rb + 0.66 * s), Math.max(2.6, g.w * 0.85))
      drawSpokes(c, g, p.birds, Math.PI / p.birds - 0.25)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'rahu',
    group: 'Thai',
    name: 'Rahu Eclipse',
    blurb: 'Rahu, the demon who swallows the moon (Rahu Om Chan): the moon waxes and wanes twice round the ring, and at each new moon Rahu’s flames close round it. Spin it and the eclipse runs.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 8 },
    params: [
      { key: 'moons', label: 'Moons', unit: '', min: 8, max: 20, step: 2, value: 12, hint: 'The phases run round twice, so the hub stays balanced.' },
      { key: 'moonR', label: 'Moon size', unit: '%', min: 50, max: 95, step: 1, value: 80 },
      { key: 'flames', label: 'Rahu flames', unit: '', min: 0, max: 12, step: 1, value: 8 },
      { key: 'inner', label: 'Inner ring of stars', options: ['on', 'off'], value: 'on' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const n = p.moons
      const rm = g.hubR + (g.Ri - g.hubR) * 0.6
      const m = Math.min((TAU * rm) / n / 2, (g.Ri - rm) * 0.9) * (p.moonR / 100)
      c.ring(0, 0, rm, Math.max(2.6, g.w))
      for (let i = 0; i < n; i++) {
        const a = g.rot + (TAU * i) / n
        const ph = ((2 * TAU * i) / n) % TAU // two lunar cycles per turn
        const T = [-Math.sin(a), Math.cos(a)], Rd = [Math.cos(a), Math.sin(a)], C = [rm * Rd[0], rm * Rd[1]]
        const P = ([x, y]) => [C[0] + x * T[0] + y * Rd[0], C[1] + x * T[1] + y * Rd[1]]
        c.ring(C[0], C[1], m, 2.6) // the dark moon's outline
        // the lit part: limb on one side, terminator ellipse on the other
        const waning = ph > Math.PI, f = waning ? TAU - ph : ph, side = waning ? -1 : 1
        const lit = 0.5 * (1 + Math.cos(f))
        if (lit > 0.07) {
          const poly = []
          for (let k = 0; k <= 24; k++) { const t = -Math.PI / 2 + (Math.PI * k) / 24; poly.push(P([side * m * Math.cos(t), m * Math.sin(t)])) }
          for (let k = 24; k >= 0; k--) { const t = -Math.PI / 2 + (Math.PI * k) / 24; poly.push(P([-side * Math.cos(f) * m * Math.cos(t), m * Math.sin(t)])) }
          rc.solid(ccw(poly)); c.solid(ccw(poly))
        }
        // Rahu at the new moons: a mouth of flames closing round the dark disc
        if (lit < 0.07 && p.flames > 0) {
          for (let k = 0; k < p.flames; k++) {
            const b = (TAU * k) / p.flames
            const A = [], B = [], L = m * 0.75, Wd = m * 0.5
            for (let s = 0; s <= 14; s++) { const t = s / 14, cy = L * 0.3 * t ** 2, hw = (Wd / 2) * Math.sin(Math.PI * Math.min(1, t + 0.05)) ** 0.7 * (1 - t) ** 0.2; A.push([t * L, cy + hw]); B.push([t * L, cy - hw]) }
            const [bx, by] = P([m * Math.cos(b), m * Math.sin(b)])
            const dir = Math.atan2(by - C[1], bx - C[0])
            const fl = place([...A, ...B.reverse()], dir, bx, by)
            rc.line(fl, 2.6, true); c.line(fl, 2.6, true)
          }
        }
      }
      if (p.inner === 'on') {
        const rs = g.hubR + (rm - m - g.hubR) * 0.55, ns = n * 2
        for (let i = 0; i < ns; i++) {
          const a = g.rot + (TAU * (i + 0.5)) / ns, x = rs * Math.cos(a), y = rs * Math.sin(a), st = []
          for (let k = 0; k < 8; k++) { const r = k % 2 ? 2.2 : 5, b = a + (k * Math.PI) / 4; st.push([x + r * Math.cos(b), y + r * Math.sin(b)]) }
          rc.solid(ccw(st)); c.solid(ccw(st))
        }
        c.ring(0, 0, rs, Math.max(2.6, g.w * 0.8))
      }
      drawSpokes(c, g, n, Math.PI / n)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'octopus',
    group: 'Creatures',
    name: 'Octopus',
    blurb: 'Seen from above with the staff through its mantle: eight tapering arms swirl out, touch the rim and curl back in. Suckers are recessed, so colour A shows through them, and low webbing joins the arms. The eyes sit on opposite sides, so the hub stays balanced.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 9 },
    params: [
      { key: 'arms', label: 'Arms', unit: '', min: 6, max: 10, step: 2, value: 8 },
      { key: 'armW', label: 'Arm width', unit: 'mm', min: 9, max: 22, step: 0.5, value: 15 },
      { key: 'sweep', label: 'Swirl', unit: '°', min: 20, max: 110, step: 1, value: 65 },
      { key: 'ripple', label: 'Ripple', unit: '°', min: 0, max: 15, step: 0.5, value: 6 },
      { key: 'curlR', label: 'Tip curl size', unit: 'mm', min: 6, max: 20, step: 0.5, value: 13 },
      { key: 'curl', label: 'Tip curl turns', unit: '', min: 0.5, max: 2, step: 0.05, value: 1.2 },
      { key: 'mantle', label: 'Mantle', unit: 'mm', min: 8, max: 26, step: 0.5, value: 14 },
      { key: 'suckers', label: 'Suckers', options: ['two rows', 'one row', 'off'], value: 'two rows' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = [], n = p.arms
      const M = g.hubR + p.mantle, r0 = M * 0.85, r1 = g.Ri - 1
      const tipW = Math.max(5, p.armW * 0.42)
      const armAt = (base, t) => {
        const th = base + deg(p.sweep) * t + deg(p.ripple) * Math.sin(3 * Math.PI * t) * Math.sin(Math.PI * t)
        return polar(r0 + (r1 - r0) * t, th)
      }
      const outer = []
      for (let s = 0; s < 240; s++) { const t = (TAU * s) / 240; outer.push(polar(M * (1 + 0.07 * Math.cos(n * t)), t + g.rot)) }
      rc.contours.push(ccw(outer), cw(circlePts(0, 0, g.hubR - 1, 96)))
      for (let i = 0; i < n; i++) {
        const base = g.rot + (TAU * i) / n
        const path = []
        for (let s = 0; s <= 70; s++) path.push(armAt(base, s / 70))
        rc.taper(path, p.armW, tipW)
        const E = path.at(-1), Q = path.at(-2)
        rc.taper(curlPts(E[0], E[1], Math.atan2(E[1] - Q[1], E[0] - Q[0]), p.curlR, p.curl, 1, 0.22), tipW, 2.6)
        if (p.suckers !== 'off') {
          const two = p.suckers === 'two rows'
          let next = 0, walked = 0, side = 1
          for (let s = 1; s < path.length; s++) {
            const A = path[s - 1], B = path[s], L = Math.hypot(B[0] - A[0], B[1] - A[1])
            walked += L
            if (walked < next) continue
            const w = p.armW + ((tipW - p.armW) * s) / 70
            next = walked + Math.max(4.6, w * (two ? 0.42 : 0.66))
            const nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L
            const off = two ? w * 0.21 * side : 0, r = w * (two ? 0.15 : 0.25)
            side = -side
            if (r < 1.1 || Math.hypot(B[0], B[1]) < M * 1.06 + r) continue
            holes.push(ccw(circlePts(B[0] + nx * off, B[1] + ny * off, r, 18)))
          }
        }
        // low webbing between this arm and the next
        const nextBase = base + TAU / n
        for (const t of [0.3, 0.68]) {
          const A = armAt(base, t), B = armAt(nextBase, t)
          const sag = (P) => [P[0] * 0.9, P[1] * 0.9]
          c.line(bez(A, sag([A[0] * 0.65 + B[0] * 0.35, A[1] * 0.65 + B[1] * 0.35]), sag([A[0] * 0.35 + B[0] * 0.65, A[1] * 0.35 + B[1] * 0.65]), B, 16), Math.max(2.6, g.w))
        }
      }
      // the eyes, on opposite sides: a recessed ring round a raised pupil
      const eR = Math.min(5.5, p.mantle * 0.34), eC = (g.hubR + M) / 2
      for (const a of [g.rot, g.rot + Math.PI]) {
        const [x, y] = polar(eC, a)
        holes.push(ccw(circlePts(x, y, eR, 24)), cw(circlePts(x, y, eR * 0.45, 16)))
      }
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'takarangi',
    group: 'Thai',
    name: 'Twin Spiral',
    blurb: 'Two spirals wound together and joined by small bridges, so the pattern seems to keep moving inward. Each medallion spans from collar to rim.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 9 },
    params: [
      { key: 'count', label: 'Spirals', unit: '', min: 2, max: 5, step: 1, value: 4 },
      { key: 'armW', label: 'Spiral width', unit: 'mm', min: 3, max: 8, step: 0.5, value: 4.5 },
      { key: 'gapW', label: 'Gap', unit: 'mm', min: 3, max: 12, step: 0.5, value: 6 },
      { key: 'bridges', label: 'Bridges per turn', unit: '', min: 0, max: 10, step: 1, value: 5 },
      { key: 'hand', label: 'Direction', options: ['mirrored pairs', 'all the same'], value: 'mirrored pairs', hint: 'Mirrored pairs need an even number of spirals; an odd number all turn the same way, to stay balanced.' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), N = p.count
      const rm = (g.hubR + g.Ri) / 2
      const Rm = Math.min((g.Ri - g.hubR + 2) / 2, rm * Math.sin(Math.PI / N) * 0.98)
      const Rs = Rm - p.armW * 0.35, thMax = (TAU * Rs) / (2 * (p.armW + p.gapW))
      for (let k = 0; k < N; k++) {
        const phi = g.rot + (TAU * k) / N
        const C = polar(rm, phi)
        const dir = p.hand === 'mirrored pairs' && N % 2 === 0 && k % 2 ? -1 : 1
        const at = (th, off) => { const r = (Rs * th) / thMax; const a = phi + dir * (th + off); return [C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)] }
        for (const off of [0, Math.PI]) {
          const arm = []
          const steps = Math.ceil(thMax * 14)
          for (let s = 0; s <= steps; s++) arm.push(at((thMax * s) / steps, off))
          rc.line(arm, p.armW)
        }
        if (p.bridges > 0)
          for (let th = Math.PI; th + Math.PI <= thMax; th += TAU / p.bridges)
            rc.line([at(th, 0), at(th + Math.PI, -Math.PI)], 2.6)
        rc.ring(C[0], C[1], Rm - p.armW * 0.35, p.armW * 0.7)
      }
      c.ring(0, 0, rm, Math.max(2.6, g.w * 0.85))
      drawSpokes(c, g, N, Math.PI / N)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'mangopare',
    group: 'Thai',
    name: 'Hammerhead Hooks',
    blurb: 'Stems ending in paired curling hooks, like a hammerhead shark, in two tiers, the outer one twice as many.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 9 },
    params: [
      { key: 'count', label: 'Inner hammerheads', unit: '', min: 3, max: 9, step: 1, value: 6 },
      { key: 'barW', label: 'Line width', unit: 'mm', min: 3.5, max: 10, step: 0.5, value: 6 },
      { key: 'turns', label: 'Hook turns', unit: '', min: 0.7, max: 2, step: 0.05, value: 1.3 },
      { key: 'split', label: 'Tier split', unit: '%', min: 35, max: 60, step: 1, value: 46 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), n = p.count
      const rMid = g.hubR + (g.Ri - g.hubR) * (p.split / 100)
      const hammer = (a, rIn, rTop, span, W) => {
        rc.taper([polar(rIn, a), polar(rTop, a)], W * 1.25, W)
        const T = polar(rTop, a)
        for (const s of [1, -1]) {
          const tx = -Math.sin(a) * s, ty = Math.cos(a) * s
          const bar = [T, [T[0] + tx * span * 0.62, T[1] + ty * span * 0.62]]
          rc.line(bar, W)
          const hook = curlPts(bar[1][0], bar[1][1], a + (s * Math.PI) / 2, span * 0.3, p.turns, s, 0.3)
          rc.taper(hook, W, 3)
          const E = hook.at(-1)
          rc.disc(E[0], E[1], W * 0.62)
        }
      }
      for (let i = 0; i < n; i++) hammer(g.rot + (TAU * i) / n, g.hubR - 1, rMid, ((rMid * Math.PI) / n) * 0.88, p.barW)
      for (let i = 0; i < 2 * n; i++) hammer(g.rot + (TAU * (i + 0.5)) / (2 * n), rMid, g.Ri + 0.5, ((g.Ri * Math.PI) / (2 * n)) * 0.9, p.barW * 0.85)
      rc.ring(0, 0, rMid, 4)
      c.ring(0, 0, rMid, Math.max(2.6, g.w))
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'rauponga',
    group: 'Thai',
    name: 'Ridge and Tooth',
    blurb: 'Parallel ridges and notched dog-tooth rows, carved-style. The bands undulate against each other, and the teeth shimmer as the hub spins.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 8 },
    params: [
      { key: 'bands', label: 'Bands', unit: '', min: 2, max: 6, step: 1, value: 4 },
      { key: 'ridges', label: 'Ridges per band', unit: '', min: 1, max: 3, step: 1, value: 2 },
      { key: 'lobes', label: 'Waves', unit: '', min: 2, max: 12, step: 1, value: 6 },
      { key: 'wave', label: 'Wave height', unit: 'mm', min: 0, max: 8, step: 0.5, value: 3.5 },
      { key: 'pitch', label: 'Tooth spacing', unit: 'mm', min: 6, max: 18, step: 0.5, value: 10 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), RIDGE = 2.6, PITCH = 5
      const R0 = g.hubR + 8, band = p.ridges * PITCH
      const step = (g.Ri - 6 - R0) / p.bands
      const amp = Math.min(p.wave, Math.max(0, (step - band) / 2 - 1), R0 - g.hubR - 3)
      const rb = (b, th) => R0 + b * step + amp * Math.cos(p.lobes * (th - g.rot) + b * Math.PI)
      const STEPS = 360
      for (let b = 0; b < p.bands; b++)
        for (let k = 0; k < p.ridges; k++) {
          const out = [], inn = []
          for (let s = 0; s < STEPS; s++) {
            const th = (TAU * s) / STEPS, r = rb(b, th) + k * PITCH
            out.push(polar(r + RIDGE / 2, th)); inn.push(polar(r - RIDGE / 2, th))
          }
          rc.contours.push(ccw(out), cw(inn))
        }
      const edgeIn = (b, th) => (b < 0 ? g.hubR - 1 : rb(b, th) + (p.ridges - 1) * PITCH + RIDGE / 2 - 0.3)
      const edgeOut = (b, th) => (b + 1 >= p.bands ? g.Ri + 0.5 : rb(b + 1, th) - RIDGE / 2 + 0.3)
      for (let b = -1; b < p.bands; b++) {
        const rMean = b < 0 ? R0 : R0 + b * step + band
        const m = Math.max(1, Math.round((TAU * rMean) / p.pitch / p.lobes)) * p.lobes
        const half = Math.PI / m, off = g.rot + (b % 2 ? half : 0)
        for (let i = 0; i < m; i++) {
          const th = off + (TAU * i) / m
          const rA = edgeIn(b, th - half * 0.92), rB = edgeIn(b, th + half * 0.92), rT = edgeOut(b, th)
          if (rT - Math.max(rA, rB) < 1.5) continue
          const tip = 1.3 / rT // half of a 2.6 mm tip, in radians
          rc.solid([polar(rA, th - half * 0.92), polar(rB, th + half * 0.92), polar(rT, th + tip), polar(rT, th - tip)])
        }
      }
      drawSpokes(c, g, p.lobes, Math.PI / p.lobes)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'unaunahi',
    group: 'Thai',
    name: 'Fish Scales',
    blurb: 'Overlapping fish scales in rows that grow toward the rim, so the whole hub reads as one shoal turning.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 8 },
    params: [
      { key: 'count', label: 'Scales per row', unit: '', min: 8, max: 26, step: 1, value: 14 },
      { key: 'lineW', label: 'Scale line', unit: 'mm', min: 2.6, max: 6, step: 0.1, value: 3.2 },
      { key: 'twist', label: 'Twist per row', unit: '°', min: 0, max: 10, step: 0.5, value: 2.5 },
      { key: 'inner', label: 'Inner scale lines', options: ['on', 'off'], value: 'on' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), m = p.count, da = TAU / m
      const rFirst = g.hubR - 1, rLast = g.Ri + 1
      const rows = Math.max(2, Math.round(Math.log(rLast / rFirst) / Math.log(1 + da * 0.62)))
      const grow = (rLast / rFirst) ** (1 / rows)
      let tips = []
      for (let i = 0; i < m; i++) tips.push(polar(rFirst, g.rot + da * i))
      let phase = g.rot, r = rFirst
      for (let row = 1; row <= rows; row++) {
        r *= grow
        phase += da / 2 + deg(p.twist)
        const next = []
        for (let i = 0; i < m; i++) {
          const E1 = tips[i], E2 = tips[(i + 1) % m], T = polar(r, phase + da * i)
          next.push(T)
          const M = [(E1[0] + E2[0]) / 2, (E1[1] + E2[1]) / 2]
          const u = [T[0] - M[0], T[1] - M[1]], v = [E2[0] - M[0], E2[1] - M[1]]
          const size = Math.hypot(v[0], v[1])
          const arc = (k) => { const out = []; for (let s = 0; s <= 18; s++) { const f = -Math.PI / 2 + (Math.PI * s) / 18; out.push([M[0] + k * (u[0] * Math.cos(f) + v[0] * Math.sin(f)), M[1] + k * (u[1] * Math.cos(f) + v[1] * Math.sin(f))]) } return out }
          rc.line(arc(1), Math.max(2.6, Math.min(p.lineW, size * 0.3)))
          if (p.inner === 'on' && size > 11) {
            rc.line(arc(0.6), 2.6)
            rc.line([T, [M[0] + u[0] * 0.6, M[1] + u[1] * 0.6]], 2.6)
          }
        }
        tips = next
      }
      c.ring(0, 0, g.hubR + (g.Ri - g.hubR) * 0.5, Math.max(2.6, g.w * 0.85))
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'manaia',
    group: 'Thai',
    name: 'Guardian',
    blurb: 'Beaked guardian figures seen in profile: sinuous notched bodies rising from the collar, hands reaching to the rim, each with a curl at the shoulder.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 9 },
    params: [
      { key: 'count', label: 'Figures', unit: '', min: 2, max: 5, step: 1, value: 3 },
      { key: 'bodyW', label: 'Body width', unit: 'mm', min: 10, max: 28, step: 0.5, value: 20 },
      { key: 'sweep', label: 'Sweep', unit: '°', min: 30, max: 130, step: 1, value: 95 },
      { key: 'notches', label: 'Body notches', options: ['on', 'off'], value: 'on' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = [], W = p.bodyW
      const L = W * 1.7
      const rA = g.hubR - 1, rB = g.Ri - L * 0.6
      for (let k = 0; k < p.count; k++) {
        const base = g.rot + (TAU * k) / p.count
        const path = []
        for (let s = 0; s <= 80; s++) {
          const t = s / 80
          path.push(polar(rA + (rB - rA) * t, base + deg(p.sweep) * t + 0.14 * Math.sin(TAU * t) * t))
        }
        const wAt = (t) => 5 + (W - 5) * Math.min(1, t * 1.5)
        for (let s = 0; s < 80; s++) rc.seg(path[s][0], path[s][1], path[s + 1][0], path[s + 1][1], wAt(s / 80), wAt((s + 1) / 80))
        path.forEach((q, s) => rc.disc(q[0], q[1], wAt(s / 80) / 2))
        const headingAt = (s) => Math.atan2(path[s + 1][1] - path[s - 1][1], path[s + 1][0] - path[s - 1][0])
        const E = path[80], h = headingAt(79)
        const P = (x, y) => place([[x, y]], h, E[0], E[1])[0]
        // head and open beak
        rc.disc(E[0], E[1], W * 0.62)
        rc.taper(bez(P(0, W * 0.3), P(L * 0.55, W * 0.62), P(L * 1.05, W * 0.45), P(L * 1.1, -W * 0.38), 18), W * 0.62, 3)
        rc.taper(bez(P(0, -W * 0.34), P(L * 0.3, -W * 0.62), P(L * 0.6, -W * 0.62), P(L * 0.78, -W * 0.14), 14), W * 0.46, 3)
        const eye = P(W * 0.12, W * 0.04), eR = Math.max(1.8, W * 0.2)
        holes.push(ccw(circlePts(eye[0], eye[1], eR, 20)), cw(circlePts(eye[0], eye[1], eR * 0.42, 12)))
        // the hand reaches out to the rim and fans into three fingers
        const sH = 46, Q = path[sH]
        const rimA = Math.atan2(Q[1], Q[0]) + 0.1
        const palm = polar(g.Ri - 24, rimA)
        const nOut = headingAt(sH) - deg(55)
        rc.taper(bez(Q, [Q[0] + 12 * Math.cos(nOut), Q[1] + 12 * Math.sin(nOut)], [palm[0] * 0.94, palm[1] * 0.94], palm, 14), W * 0.5, 7)
        rc.disc(palm[0], palm[1], 6)
        for (const d of [-0.14, 0, 0.14]) rc.taper(bez(palm, polar(g.Ri - 15, rimA + d * 0.7), polar(g.Ri - 7, rimA + d), polar(g.Ri + 0.5, rimA + d * 1.1), 10), 6, 3.4)
        // curl at the shoulder, curling toward the collar side
        const sK = 34, K = path[sK]
        const koru = curlPts(K[0], K[1], headingAt(sK) + deg(72), W * 1.05, 1.45, 1, 0.24)
        rc.taper(koru, W * 0.42, 3)
        const Kt = koru.at(-1)
        rc.disc(Kt[0], Kt[1], Math.max(3, W * 0.28))
        // notches down the spine
        if (p.notches === 'on')
          for (let s = 14; s < 74; s += 5) {
            const t = s / 80, a = headingAt(s), w = wAt(t), Z = path[s]
            if (w < 8) continue
            holes.push(ccw(place([[w * 0.26, 0], [-w * 0.1, w * 0.17], [-w * 0.1, -w * 0.17]], a, Z[0], Z[1])))
          }
      }
      c.ring(0, 0, g.hubR + (g.Ri - g.hubR) * 0.55, Math.max(2.6, g.w * 0.85))
      drawVortex(c, g, p.count * 2, 70, 1, true)
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'puhoro',
    group: 'Thai',
    name: 'Swift Wake',
    blurb: 'Swift swirling forms made for speed: tapering blades sweep from collar to rim, each with a thin line and a curl riding its wake. Made to spin.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 9 },
    params: [
      { key: 'count', label: 'Blades', unit: '', min: 3, max: 8, step: 1, value: 5 },
      { key: 'bladeW', label: 'Blade width', unit: 'mm', min: 7, max: 24, step: 0.5, value: 15 },
      { key: 'sweep', label: 'Sweep', unit: '°', min: 30, max: 140, step: 1, value: 85 },
      { key: 'wake', label: 'Wake line + curl', options: ['on', 'off'], value: 'on' },
      { key: 'notches', label: 'Blade notches', options: ['on', 'off'], value: 'on' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = []
      const r0 = g.hubR - 1, r1 = g.Ri + 1
      const curve = (base, t) => polar(r0 + (r1 - r0) * t, base + deg(p.sweep) * t ** 1.35)
      const wAt = (t) => 2.8 + (p.bladeW - 2.8) * Math.sin(Math.PI * t ** 0.8)
      for (let k = 0; k < p.count; k++) {
        const base = g.rot + (TAU * k) / p.count
        const path = []
        for (let s = 0; s <= 80; s++) path.push(curve(base, s / 80))
        // the blade: a true crescent, so it can taper at both ends
        const left = [], right = []
        path.forEach((q, s) => {
          const A = path[Math.max(0, s - 1)], B = path[Math.min(80, s + 1)]
          const L = Math.hypot(B[0] - A[0], B[1] - A[1]), w = wAt(s / 80) / 2
          const nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L
          left.push([q[0] + nx * w, q[1] + ny * w]); right.push([q[0] - nx * w, q[1] - ny * w])
        })
        rc.solid([...left, ...right.reverse()])
        if (p.notches === 'on')
          for (let s = 16; s < 72; s += 6) {
            const w = wAt(s / 80)
            if (w < 8) continue
            const a = Math.atan2(path[s + 1][1] - path[s - 1][1], path[s + 1][0] - path[s - 1][0])
            holes.push(ccw(place([[w * 0.42, 0], [-w * 0.1, w * 0.2], [-w * 0.1, -w * 0.2]], a, path[s][0], path[s][1])))
          }
        if (p.wake === 'on') {
          const wb = base + (TAU / p.count) * 0.45
          const wake = []
          for (let s = 18; s <= 80; s++) wake.push(curve(wb, s / 80))
          rc.line(wake, 3.4)
          const A = wake[0], B = wake[1]
          const koru = curlPts(A[0], A[1], Math.atan2(A[1] - B[1], A[0] - B[0]), 12, 1.3, -1, 0.22)
          rc.taper(koru, 3.4, 2.8)
          const Kt = koru.at(-1)
          rc.disc(Kt[0], Kt[1], 3.6)
        }
      }
      for (const f of [0.45, 0.75]) c.ring(0, 0, g.hubR + (g.Ri - g.hubR) * f, Math.max(2.6, g.w * 0.85))
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'fireceiling',
    group: 'Dreamscape',
    name: 'Fire Ceiling',
    blurb: 'The fire umbrella, seen from the floor looking up. The real dome (every junction and path) stays low in colour A with a bulb on each junction, while flames from the bowl at the collar lick up through it in colour B and reach the rim. Spun, it makes one sheet of fire.',
    overrides: { strutW: 2.4, frameH: 3.5, reliefH: 10 },
    params: [
      { key: 'flames', label: 'Tall flames', unit: '', min: 4, max: 12, step: 1, value: 7 },
      { key: 'flameW', label: 'Flame width', unit: 'mm', min: 8, max: 30, step: 0.5, value: 20 },
      { key: 'lean', label: 'Lean', unit: '°', min: 0, max: 90, step: 1, value: 42 },
      { key: 'lick', label: 'Lick', unit: '°', min: 0, max: 20, step: 0.5, value: 9 },
      { key: 'shortF', label: 'Short flame height', unit: '%', min: 25, max: 80, step: 1, value: 52 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = []
      drawDome(c, g, { rc, joints: true, node: 5, jointMin: g.hubR + 10 })
      const B = g.hubR + 7
      const flame = (a, rTop, W, phase) => {
        const pts = []
        for (let s = 0; s <= 60; s++) {
          const t = s / 60
          pts.push(polar(B - 3 + (rTop - B + 3) * t, a + deg(p.lean) * t ** 1.5 + deg(p.lick) * Math.sin(TAU * 1.4 * t + phase) * t))
        }
        ribbon(rc, pts, (t) => 2.8 + (W - 2.8) * Math.sin(Math.PI * Math.min(1, t ** 0.62 + 0.04)) ** 0.8 * (1 - t) ** 0.35)
        return pts
      }
      for (let i = 0; i < p.flames; i++) {
        const a = g.rot + (TAU * i) / p.flames, gap = TAU / p.flames
        const tall = flame(a, g.Ri + 1, p.flameW, 0)
        flame(a + gap / 2, B + (g.Ri - B) * (p.shortF / 100), p.flameW * 0.62, 2)
        // a dark tongue inside each tall flame
        const inner = tall.slice(6, 34), left = [], right = []
        inner.forEach((q, s) => {
          const A = inner[Math.max(0, s - 1)], C = inner[Math.min(inner.length - 1, s + 1)]
          const L = Math.hypot(C[0] - A[0], C[1] - A[1]), w = (p.flameW * 0.17) * Math.sin((Math.PI * s) / (inner.length - 1))
          const nx = -(C[1] - A[1]) / L, ny = (C[0] - A[0]) / L
          left.push([q[0] + nx * w, q[1] + ny * w]); right.push([q[0] - nx * w, q[1] - ny * w])
        })
        holes.push(ccw([...left, ...right.reverse()]))
      }
      // the bowl the fire burns in
      const lip = [], m = p.flames * 2
      for (let s = 0; s < 240; s++) { const t = (TAU * s) / 240; lip.push(polar(B + 2.5 * Math.cos(m * (t - g.rot)), t)) }
      rc.contours.push(ccw(lip), cw(circlePts(0, 0, g.hubR - 1, 96)))
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'noteclouds',
    group: 'Dreamscape',
    name: 'Note Clouds',
    blurb: 'A guitar set under the dome. Six strings run round the hub, heaviest at the collar and lightest at the rim, each one vibrating at its own harmonic. Clouds drift across them, with optional notes, in the airy mood the dome’s visuals aim for. The strings blur into shimmering bands when spun.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 8 },
    params: [
      { key: 'clouds', label: 'Clouds', unit: '', min: 2, max: 5, step: 1, value: 3 },
      { key: 'puff', label: 'Cloud size', unit: 'mm', min: 8, max: 24, step: 0.5, value: 17 },
      { key: 'amp', label: 'String vibration', unit: 'mm', min: 0, max: 6, step: 0.25, value: 2.5 },
      { key: 'notes', label: 'Notes per gap', unit: '', min: 0, max: 2, step: 1, value: 0 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = []
      const HARM = [2, 3, 4, 5, 6, 8] // the harmonic series, sounding from low E up
      const r0 = g.hubR + 6, step = (g.Ri - 7 - r0) / 5
      const amp = Math.min(p.amp, step / 2 - 2.5)
      const rS = (i, th) => r0 + i * step + amp * Math.sin(HARM[i] * (th - g.rot)) * (i === 0 ? 0.5 : 1)
      for (let i = 0; i < 6; i++) {
        const w = 4.4 - i * 0.36
        const out = [], inn = []
        for (let s = 0; s < 360; s++) { const th = (TAU * s) / 360, r = rS(i, th); out.push(polar(r + w / 2, th)); inn.push(polar(r - w / 2, th)) }
        rc.contours.push(ccw(out), cw(inn))
      }
      // clouds follow the curve of the strings, sitting across the middle ones
      const lobes = [[-1.75, 0.55], [-0.95, 0.85], [0, 1.15], [0.95, 0.88], [1.75, 0.55]]
      const rC = r0 + 2.5 * step, P = (x, y, a) => polar(rC + y, a + x / rC)
      for (let k = 0; k < p.clouds; k++) {
        const a = g.rot + (TAU * k) / p.clouds
        for (const [x, s] of lobes) { const [px, py] = P(x * p.puff, s * p.puff * 0.3, a); rc.disc(px, py, s * p.puff * 0.72) }
        // a flat underside, so it reads as a cloud and not a blob
        const under = []
        for (let s = 0; s <= 20; s++) under.push(P((-1.8 + (3.6 * s) / 20) * p.puff, 0.15 * p.puff, a))
        for (let s = 20; s >= 0; s--) under.push(P((-1.8 + (3.6 * s) / 20) * p.puff, -0.1 * p.puff, a))
        rc.solid(under)
        // notes between the clouds, their stems standing across the upper strings
        for (let j = 0; j < p.notes; j++) {
          const na = a + Math.PI / p.clouds + (j - (p.notes - 1) / 2) * 0.46
          const N = polar(r0 + 2 * step + 1, na)
          const nrad = [Math.cos(na), Math.sin(na)], ntan = [-nrad[1], nrad[0]]
          const q = (x, y) => [N[0] + x * ntan[0] + y * nrad[0], N[1] + x * ntan[1] + y * nrad[1]]
          const head = []
          for (let s = 0; s < 24; s++) { const t = (TAU * s) / 24, ex = 6.4 * Math.cos(t), ey = 4.4 * Math.sin(t); head.push(q(ex * 0.92 - ey * 0.39, ex * 0.39 + ey * 0.92)) }
          rc.solid(head)
          rc.line([q(5.4, 2), q(5.4, step * 2 + 1)], 3)
          rc.taper(bez(q(5.4, step * 2 + 1), q(12, step * 2 - 2), q(15, step * 2 - 8), q(13, step * 2 - 15), 10), 4.4, 2.8)
        }
      }
      drawSpokes(c, g, 6, 0.1)
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'mirrorlaser',
    group: 'Dreamscape',
    name: 'Mirror Ball & Lasers',
    blurb: 'The staff goes through a mirror ball whose recessed tiles shrink toward its edge, as on a real sphere. Tall laser beams fan out one way in colour B, and low beams cross them the other way in colour A. The two levels slide past each other in a moiré as it spins.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 9 },
    params: [
      { key: 'beams', label: 'Beams each way', unit: '', min: 8, max: 30, step: 1, value: 18 },
      { key: 'throw', label: 'Beam angle', unit: '°', min: 20, max: 110, step: 1, value: 72 },
      { key: 'ball', label: 'Ball size', unit: 'mm', min: 14, max: 45, step: 0.5, value: 28 },
      { key: 'tile', label: 'Tile size', unit: 'mm', min: 3.5, max: 8, step: 0.25, value: 4.75 },
      { key: 'spots', label: 'Spots on the rim', options: ['on', 'off'], value: 'on' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = []
      const B = g.hubR + p.ball
      rc.contours.push(ccw(circlePts(0, 0, B, 180)), cw(circlePts(0, 0, g.hubR - 1, 96)))
      // tiles: rows evenly spaced on the sphere, so they foreshorten toward the limb
      const SPHERE = B + 0.5
      let phi = Math.asin(Math.min(0.999, (g.hubR + 1) / SPHERE))
      const dPhi = p.tile / SPHERE
      while (true) {
        const r1 = SPHERE * Math.sin(phi), r2 = SPHERE * Math.sin(Math.min(Math.PI / 2, phi + dPhi))
        if (r2 > B - 0.8 || r2 - r1 < 1.5) break
        const inner = r1 + 0.5, outer = r2 - 0.5
        const m = Math.max(6, Math.round((TAU * (r1 + r2)) / 2 / p.tile))
        const dA = TAU / m, marg = 0.5 / ((r1 + r2) / 2)
        for (let i = 0; i < m; i++) {
          const a = g.rot + dA * i, a2 = a + dA
          holes.push(ccw([polar(inner, a + marg), polar(outer, a + marg), polar(outer, a2 - marg), polar(inner, a2 - marg)]))
        }
        phi += dPhi
      }
      // beams: leave the ball and strike the rim well round from where they started
      const d = deg(p.throw)
      for (let i = 0; i < p.beams; i++) {
        const a = g.rot + (TAU * i) / p.beams
        const S = polar(B - 2, a), E = polar(g.Ri + 0.5, a + d)
        rc.taper([S, E], 5, 2.6)
        const S2 = polar(B - 2, a + TAU / p.beams / 2), E2 = polar(g.Ri + 0.5, a + TAU / p.beams / 2 - d)
        c.line([S2, E2], Math.max(2.6, g.w))
        if (p.spots === 'on') { const q = polar(g.Ri - 3.4, a + d); rc.disc(q[0], q[1], 4.2) }
      }
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'dreameyes',
    group: 'Dreamscape',
    name: 'Rapid Eye Movement',
    blurb: 'A ring of sleeping eyes, each a little more open than the last, twice round. Under a strobe capsule or at the right speed they blink. Lashes reach the rim and the fibres of one huge iris grow from the collar, so the whole hub is also a single eye looking down the staff.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 9 },
    params: [
      { key: 'eyes', label: 'Eyes', unit: '', min: 6, max: 18, step: 2, value: 12, hint: 'Even numbers: the blink runs round twice, so opposite eyes match and the hub stays balanced.' },
      { key: 'open', label: 'Widest open', unit: '%', min: 20, max: 100, step: 1, value: 72 },
      { key: 'ringAt', label: 'Ring of eyes', unit: '%', min: 50, max: 80, step: 1, value: 66 },
      { key: 'fibres', label: 'Iris fibres', unit: '', min: 12, max: 72, step: 1, value: 36 },
      { key: 'lashes', label: 'Lashes per eye', unit: '', min: 0, max: 7, step: 1, value: 5 },
    ],
    strobe: (p) => p.eyes,
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = [], n = p.eyes
      const rm = g.hubR + (g.Ri - g.hubR) * (p.ringAt / 100)
      const L = ((TAU * rm) / n) / 2 * 0.92, hMax = L * 0.62 * (p.open / 100)
      const lid = (x, h) => h * (1 - (x / L) ** 2)
      rc.ring(0, 0, g.hubR + (rm - hMax - g.hubR) * 0.68, 3.2) // the iris's collarette
      for (let i = 0; i < n; i++) {
        const a = g.rot + (TAU * i) / n
        const h = Math.max(1.6, hMax * Math.abs(Math.cos(((2 * TAU * i) / n) % TAU)))
        const C = polar(rm, a), rad = [Math.cos(a), Math.sin(a)], tan = [-rad[1], rad[0]]
        const pt = (x, y) => [C[0] + x * tan[0] + y * rad[0], C[1] + x * tan[1] + y * rad[1]]
        const up = [], lo = []
        for (let s = 0; s <= 24; s++) { const x = -L + (2 * L * s) / 24; up.push(pt(x, lid(x, h))); lo.push(pt(x, -lid(x, h))) }
        rc.line(up, 3.4); rc.line(lo, 3.4)
        // the iris, cut off by the lids, with a recessed pupil
        const Ir = Math.min(L * 0.5, hMax * 1.05)
        if (h > 3.4) {
          const iris = []
          for (let s = 0; s < 36; s++) {
            const t = (TAU * s) / 36, x = Ir * Math.cos(t), y = Ir * Math.sin(t), cap = Math.max(0.4, lid(x, h))
            iris.push(pt(x, Math.max(-cap, Math.min(cap, y))))
          }
          rc.solid(iris)
          const pr = Math.min(Ir * 0.42, h * 0.45)
          if (pr > 1.1) holes.push(ccw(circlePts(C[0], C[1], pr, 18)))
        }
        for (let j = 0; j < p.lashes; j++) {
          const f = p.lashes > 1 ? j / (p.lashes - 1) : 0.5, x = (-0.72 + 1.44 * f) * L
          const A = pt(x, lid(x, h)), E = polar(g.Ri + 0.5, a + ((x * 1.25) / g.Ri))
          rc.taper(bez(A, pt(x * 1.04, lid(x, h) + 4), [E[0] * 0.95, E[1] * 0.95], E, 10), 3.4, 2.6)
        }
        if (p.lashes === 0) c.line([pt(0, lid(0, h)), polar(g.Ri + 0.5, a)], g.w)
      }
      // iris fibres: wavy threads from the collar to the eyes' ring
      const rf = rm - hMax - 1
      const ring = g.hubR + (rm - hMax - g.hubR) * 0.68
      for (let i = 0; i < p.fibres; i++) {
        const a = g.rot + (TAU * i) / p.fibres
        const pts = []
        for (let s = 0; s <= 24; s++) { const t = s / 24; pts.push(polar(g.hubR - 1 + (ring - g.hubR + 1) * t, a + 0.09 * Math.sin(Math.PI * 2 * t))) }
        rc.taper(pts, 3.4, 2.6)
      }
      c.ring(0, 0, rm, Math.max(2.6, g.w))
      drawSpokes(c, g, n, Math.PI / n)
      c.ring(0, 0, rf, Math.max(2.6, g.w * 0.85))
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'domedissolve',
    group: 'Dreamscape',
    name: 'Dome Dissolving',
    blurb: 'The real dome (all 91 junctions and 180 paths) with its centre wound up like a whirlpool, as it looks late in a good night. The lattice stays low, each bulb stands up from it, and the dream.sc dragonflies ride the current on top. A static twist would look wrong on the dome; this one is meant to be spun.',
    overrides: { strutW: 2.8, frameH: 3.5, reliefH: 9 },
    params: [
      { key: 'twist', label: 'Whirlpool', unit: '°', min: 0, max: 200, step: 1, value: 110 },
      { key: 'flies', label: 'Dragonflies', unit: '', min: 0, max: 6, step: 1, value: 3 },
      { key: 'flySize', label: 'Dragonfly size', unit: 'mm', min: 30, max: 90, step: 1, value: 46 },
      { key: 'flyAt', label: 'Dragonfly ring', unit: '%', min: 40, max: 85, step: 1, value: 60 },
      { key: 'bulb', label: 'Bulb size', unit: 'mm', min: 3, max: 9, step: 0.25, value: 5.5 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const r0 = RING_RADII[0], r4 = RING_RADII[RING_RADII.length - 1]
      const inner = g.Rc + g.w * 1.2
      const mapR = (r) => (r === 0 ? 0 : inner + ((g.Ri - inner) * (r - r4)) / (r0 - r4))
      const swirl = ([x, y]) => {
        const r = Math.hypot(x, y)
        if (r < 1e-6) return [0, 0]
        const u = Math.max(0, Math.min(1, (r - inner) / (g.Ri - inner)))
        return polar(r, Math.atan2(y, x) + deg(p.twist) * (1 - u) ** 1.6)
      }
      const P = JUNCTIONS.map((j) => rot([mapR(j.radius) * Math.cos(-j.angle), mapR(j.radius) * Math.sin(-j.angle)], g.rot))
      for (const e of EDGES) {
        const A = P[e.a], B = P[e.b], pts = []
        for (let s = 0; s <= 14; s++) { const t = s / 14; pts.push(swirl([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t])) }
        c.line(pts, g.w)
      }
      P.forEach((q, i) => {
        if (JUNCTIONS[i].radius <= 0) return
        const Z = swirl(q)
        if (Math.hypot(Z[0], Z[1]) > g.hubR + p.bulb / 2) rc.disc(Z[0], Z[1], p.bulb / 2)
      })
      const rFly = g.hubR + (g.Ri - g.hubR) * (p.flyAt / 100)
      for (let k = 0; k < p.flies; k++) {
        const a = g.rot + (TAU * k) / p.flies
        rc.contours.push(...logoDragonfly(p.flySize, a - 0.5, rFly * Math.cos(a), rFly * Math.sin(a)))
      }
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'octochase',
    group: 'Creatures',
    name: 'Octopus Chase',
    blurb: 'The other octopus: seen from the side and jetting, big-headed and chasing each other round the rim, arms streaming back in a spiral. Two arms from each anchor at the collar and the rest trail off into curls. Spun, each one leaves a comet tail.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 9 },
    params: [
      { key: 'count', label: 'Octopuses', unit: '', min: 2, max: 4, step: 1, value: 3 },
      { key: 'headW', label: 'Head size', unit: 'mm', min: 12, max: 26, step: 0.5, value: 19 },
      { key: 'strands', label: 'Arms showing', unit: '', min: 4, max: 8, step: 1, value: 6 },
      { key: 'trail', label: 'Arm trail', unit: '°', min: 40, max: 130, step: 1, value: 92 },
      { key: 'wiggle', label: 'Wiggle', unit: '°', min: 0, max: 12, step: 0.5, value: 5 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = []
      const W = p.headW, L = W * 1.6, rH = g.Ri - W + 1
      for (let k = 0; k < p.count; k++) {
        const a = g.rot + (TAU * k) / p.count
        const C = polar(rH, a), h = a + Math.PI / 2 + deg(10)
        const P = (x, y) => place([[x, y]], h, C[0], C[1])[0]
        // the head: a bulb, heavy at the front
        const egg = []
        for (let s = 0; s < 60; s++) {
          const t = (TAU * s) / 60, x = L * Math.cos(t)
          egg.push(P(x, W * Math.sin(t) * (1 + 0.16 * Math.cos(t))))
        }
        rc.solid(egg)
        // the eye, with an octopus's letterbox pupil
        const E = P(-L * 0.28, W * 0.1), eR = W * 0.3
        holes.push(ccw(circlePts(E[0], E[1], eR, 24)))
        const bar = [[-eR * 0.7, eR * 0.22], [eR * 0.7, eR * 0.22], [eR * 0.7, -eR * 0.22], [-eR * 0.7, -eR * 0.22]]
        holes.push(cw(place(bar, h, E[0], E[1])))
        // the arms stream backwards from under the head
        for (let j = 0; j < p.strands; j++) {
          const f = j / (p.strands - 1)
          const B = P(-L * 0.72, W * (0.62 - 1.24 * f))
          const rS = Math.hypot(B[0], B[1]), thS = Math.atan2(B[1], B[0])
          const toCollar = j < 2
          const rE = toCollar ? g.hubR - 1 : rS - (rS - g.hubR) * (0.75 - 0.62 * f)
          const dTh = deg(p.trail) * (toCollar ? 1 + j * 0.16 : 0.9 + 0.25 * Math.sin(j * 2.1))
          const path = []
          for (let s = 0; s <= 50; s++) {
            const t = s / 50
            path.push(polar(rS + (rE - rS) * t ** 1.15, thS - dTh * t + deg(p.wiggle) * Math.sin(TAU * 1.3 * t + j * 1.7) * t))
          }
          const w0 = toCollar ? 9 : 7.5, w1 = toCollar ? 5 : 3.4
          rc.taper(path, w0, w1)
          if (!toCollar) {
            const Z = path.at(-1), Y = path.at(-2)
            rc.taper(curlPts(Z[0], Z[1], Math.atan2(Z[1] - Y[1], Z[0] - Y[0]), 7.5, 1.1, j % 2 ? 1 : -1, 0.3), w1, 2.6)
          }
          // a line of suckers down the thick part
          if (w0 > 7) for (let s = 3; s < 30; s += 4) {
            const w = w0 + ((w1 - w0) * s) / 50, r = w * 0.17
            if (r >= 1.05) holes.push(ccw(circlePts(path[s][0], path[s][1], r, 14)))
          }
        }
      }
      c.ring(0, 0, g.hubR + (g.Ri - g.hubR) * 0.45, Math.max(2.6, g.w))
      drawVortex(c, g, p.count * 2, 60, 1, true)
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'starfish',
    group: 'Creatures',
    name: 'Starfish',
    blurb: 'One big sea star with the staff through its centre. Fat arms with a slight living bend reach the rim; rows of recessed dots run down each one, and the outline is beaded like the plates along a real arm. Set Arms to 9 or more for a sunflower star.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 8 },
    params: [
      { key: 'arms', label: 'Arms', unit: '', min: 4, max: 12, step: 1, value: 5 },
      { key: 'armW', label: 'Arm width', unit: 'mm', min: 16, max: 60, step: 1, value: 42 },
      { key: 'bend', label: 'Bend', unit: '°', min: 0, max: 50, step: 1, value: 20 },
      { key: 'bead', label: 'Beaded edge', unit: '%', min: 0, max: 16, step: 1, value: 7 },
      { key: 'dots', label: 'Dot rows', options: ['5', '3', '1', 'none'], value: '5' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = [], n = p.arms
      const r0 = g.hubR - 1, r1 = g.Ri + 1
      const W = Math.min(p.armW, ((TAU * (g.hubR + 14)) / n) * 1.05)
      const wAt = (t) => Math.max(5, W * (1 - t) ** 0.85 + 5 * t)
      for (let i = 0; i < n; i++) {
        const base = g.rot + (TAU * i) / n
        const path = []
        for (let s = 0; s <= 90; s++) { const t = s / 90; path.push(polar(r0 + (r1 - r0) * t, base + deg(p.bend) * Math.sin(Math.PI * t * 0.9) * t)) }
        const beadCount = 20
        ribbon(rc, path, (t) => wAt(t) * (1 + (p.bead / 100) * Math.abs(Math.sin(Math.PI * beadCount * t))))
        const E = path.at(-1)
        rc.disc(E[0], E[1], 3.2)
        const rows = p.dots === 'none' ? 0 : Number(p.dots)
        if (rows) {
          let next = 0, walked = 0
          for (let s = 1; s < 88; s++) {
            walked += Math.hypot(path[s][0] - path[s - 1][0], path[s][1] - path[s - 1][1])
            if (walked < next) continue
            const t = s / 90, w = wAt(t)
            next = walked + Math.max(5.5, w * 0.2)
            if (Math.hypot(path[s][0], path[s][1]) < g.hubR + 22) continue
            const dx = path[s + 1][0] - path[s - 1][0], dy = path[s + 1][1] - path[s - 1][1], L = Math.hypot(dx, dy)
            for (let k = 0; k < rows; k++) {
              const u = rows > 1 ? -0.34 + (0.68 * k) / (rows - 1) : 0
              const dr = (k === (rows - 1) / 2 ? 0.075 : 0.05) * w
              if (dr < 1.1 || (rows === 5 && w < 16 && Math.abs(u) > 0.2)) continue
              holes.push(ccw(circlePts(path[s][0] - (dy / L) * u * w, path[s][1] + (dx / L) * u * w, dr, 14)))
            }
          }
        }
      }
      const disc = []
      for (let s = 0; s < 240; s++) { const t = (TAU * s) / 240; disc.push(polar((g.hubR + 16) * (1 + 0.06 * Math.cos(n * t)), t + g.rot)) }
      rc.contours.push(ccw(disc), cw(circlePts(0, 0, g.hubR - 1, 96)))
      // the sieve plate, a small mark the real animal has on top; two, opposite, to stay balanced
      for (const a of [g.rot + Math.PI / n, g.rot + Math.PI / n + Math.PI]) {
        const [x, y] = polar(g.hubR + 8, a)
        holes.push(ccw(circlePts(x, y, 4, 18)), cw(circlePts(x, y, 1.8, 12)))
      }
      c.ring(0, 0, g.hubR + (g.Ri - g.hubR) * 0.62, Math.max(2.6, g.w))
      drawSpokes(c, g, n, Math.PI / n)
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'kina',
    group: 'Creatures',
    name: 'Kina',
    blurb: 'Inspired by kina, the New Zealand sea urchin: a domed shell with five double rows of pores running out from the centre, as on the real shell, wrapped in a halo of long and short spines with a slight swirl. Under blacklight the spines become a burst.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 9 },
    params: [
      { key: 'spines', label: 'Spines', unit: '', min: 20, max: 110, step: 5, value: 70 },
      { key: 'shell', label: 'Shell size', unit: 'mm', min: 15, max: 55, step: 1, value: 33 },
      { key: 'spineW', label: 'Spine base', unit: 'mm', min: 3, max: 8, step: 0.25, value: 4.75 },
      { key: 'swirl', label: 'Swirl', unit: '°', min: 0, max: 45, step: 1, value: 14 },
      { key: 'shortS', label: 'Short spines', unit: '%', min: 25, max: 90, step: 1, value: 55 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = []
      const B = g.hubR + p.shell
      rc.contours.push(ccw(circlePts(0, 0, B, 180)), cw(circlePts(0, 0, g.hubR - 1, 96)))
      // five paired pore rows, and rows of knobs in the five bands between them
      for (let i = 0; i < 5; i++) {
        const a = g.rot + (TAU * i) / 5
        const rows = Math.floor((B - g.hubR - 3) / 4.2)
        for (let k = 0; k < rows; k++) {
          const r = g.hubR + 3 + k * 4.2
          const gapA = (2.2 + (k * 0.55)) / r
          for (const s of [-1, 1]) { const q = polar(r, a + s * gapA); holes.push(ccw(circlePts(q[0], q[1], 1.15, 12))) }
          const mid = a + Math.PI / 5
          for (const u of k % 2 ? [-0.26, 0.26] : [0, -0.5, 0.5]) {
            const q = polar(r, mid + u * (Math.PI / 5) * Math.min(1, (r / B) * 1.15))
            holes.push(ccw(circlePts(q[0], q[1], k % 2 ? 1.5 : 1.25, 12)))
          }
        }
      }
      // spines: long ones reach the rim, short ones stand free between them
      for (let i = 0; i < p.spines; i++) {
        const a = g.rot + (TAU * i) / p.spines
        const long = i % 2 === 0
        const rEnd = long ? g.Ri + 0.5 : B + (g.Ri - B) * (p.shortS / 100)
        const f = (rEnd - B) / (g.Ri - B)
        const pts = []
        for (let s = 0; s <= 12; s++) { const t = s / 12; pts.push(polar(B - 2 + (rEnd - B + 2) * t, a + deg(p.swirl) * f * t ** 1.3)) }
        rc.taper(pts, long ? p.spineW : p.spineW * 0.85, 2.6)
      }
      c.ring(0, 0, B + (g.Ri - B) * Math.min(0.92, p.shortS / 100 * 0.8), Math.max(2.6, g.w))
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'worm',
    group: 'Creatures',
    name: 'Worms',
    blurb: 'Compost worms wriggling up out of the collar: ringed bodies, tapered tails anchored at the staff, round heads at the rim, and the smooth saddle a real earthworm has just behind the head. Spun, the wriggles blur into rippling bands.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 9 },
    params: [
      { key: 'count', label: 'Worms', unit: '', min: 2, max: 8, step: 1, value: 5 },
      { key: 'wriggles', label: 'Wriggles per worm', unit: '', min: 1, max: 5, step: 0.5, value: 2.5 },
      { key: 'bodyW', label: 'Body width', unit: 'mm', min: 7, max: 20, step: 0.5, value: 13 },
      { key: 'sweep', label: 'Sweep', unit: '°', min: 0, max: 120, step: 1, value: 40 },
      { key: 'amp', label: 'Wriggle width', unit: 'mm', min: 2, max: 24, step: 0.5, value: 13 },
      { key: 'ringGap', label: 'Ring spacing', unit: 'mm', min: 3, max: 9, step: 0.5, value: 4.5 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = []
      const W = p.bodyW
      const rLo = g.hubR - 1, rHi = g.Ri - W * 0.35
      const N = 240, SADDLE = 0.74
      const wAt = (t) => {
        const tail = 0.34 + 0.66 * Math.min(1, t / 0.4) ** 0.8
        const head = 0.72 + 0.28 * Math.min(1, (1 - t) / 0.06) ** 0.5
        const saddle = 1 + 0.14 * Math.exp(-(((t - SADDLE) / 0.05) ** 2))
        return Math.max(4, W * tail * head * saddle)
      }
      for (let k = 0; k < p.count; k++) {
        const a0 = g.rot + (TAU * k) / p.count
        const path = []
        for (let s = 0; s <= N; s++) {
          const t = s / N, r = rLo + (rHi - rLo) * t
          // the wriggle is a sideways distance, and it dies away at the anchored tail
          path.push(polar(r, a0 + deg(p.sweep) * t + (p.amp * Math.min(1, t * 3) * Math.sin(TAU * p.wriggles * t)) / r))
        }
        for (let s = 0; s < N; s++) rc.seg(path[s][0], path[s][1], path[s + 1][0], path[s + 1][1], wAt(s / N), wAt((s + 1) / N))
        path.forEach((q, s) => { if (s % 2 === 0) rc.disc(q[0], q[1], wAt(s / N) / 2) })
        // the rings: recessed lines across the body, left out across the saddle
        let walked = 0, next = W * 0.45
        for (let s = 1; s < N; s++) {
          walked += Math.hypot(path[s][0] - path[s - 1][0], path[s][1] - path[s - 1][1])
          if (walked < next) continue
          next = walked + p.ringGap
          const t = s / N, w = wAt(t)
          if (Math.abs(t - SADDLE) < 0.05 || t > 0.97 || w < 6.5) continue
          const dx = path[s + 1][0] - path[s - 1][0], dy = path[s + 1][1] - path[s - 1][1]
          holes.push(ccw(place([[-0.7, w * 0.38], [0.7, w * 0.38], [0.7, -w * 0.38], [-0.7, -w * 0.38]], Math.atan2(dy, dx), path[s][0], path[s][1])))
        }
      }
      c.ring(0, 0, g.hubR + (g.Ri - g.hubR) * 0.62, Math.max(2.6, g.w))
      drawSpokes(c, g, p.count, Math.PI / p.count + 0.3)
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'frog',
    group: 'Creatures',
    name: 'Tree Frogs',
    blurb: 'Fat-legged tree frogs seen from above, each sitting on a low lily pad and chasing the next round the hub, with bulging eyes, folded back legs and round sticky toe pads. The pads stay in colour A and tie collar to rim, and the frogs stand tall in colour B. Try a UV green.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 10 },
    params: [
      { key: 'count', label: 'Frogs', unit: '', min: 2, max: 4, step: 1, value: 3 },
      { key: 'size', label: 'Frog size', unit: 'mm', min: 30, max: 62, step: 1, value: 50 },
      { key: 'tilt', label: 'Turn', unit: '°', min: -40, max: 40, step: 1, value: 12 },
      { key: 'back', label: 'Back markings', options: ['spots', 'stripe', 'plain'], value: 'spots' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = [], s = p.size
      const rf = (g.hubR + g.Ri) / 2, padR = (g.Ri - g.hubR) / 2 + 2
      for (let k = 0; k < p.count; k++) {
        const a = g.rot + (TAU * k) / p.count
        const C = polar(rf, a), h = a + Math.PI / 2 + deg(p.tilt)
        const P = (x, y) => place([[x * s, y * s]], h, C[0], C[1])[0]
        // lily pad: an outline and veins, low in colour A
        c.ring(C[0], C[1], padR, Math.max(2.6, g.w))
        for (let v = 0; v < 8; v++) {
          const b = a + (TAU * v) / 8 + 0.2
          c.line([C, [C[0] + padR * Math.cos(b), C[1] + padR * Math.sin(b)]], Math.max(2.6, g.w * 0.9))
        }
        // body: broad head tapering to the rump
        const body = []
        for (let q = 0; q < 60; q++) {
          const t = (TAU * q) / 60, x = Math.cos(t), y = Math.sin(t)
          body.push(P(0.08 + 0.6 * x, y * 0.42 * (1 + 0.12 * x)))
        }
        rc.solid(body)
        for (const m of [1, -1]) {
          // eyes bulge past the outline
          const E = P(0.42, m * 0.31)
          rc.disc(E[0], E[1], 0.14 * s)
          holes.push(ccw(circlePts(E[0], E[1], 0.08 * s, 18)), cw(circlePts(E[0], E[1], 0.035 * s, 10)))
          const limb = (pts, w0, w1) => rc.taper(pts.map(([x, y]) => P(x, m * y)), Math.max(3, w0 * s), Math.max(2.8, w1 * s))
          const toes = (x, y, dir, len, spread) => {
            for (const d of [-spread, 0, spread]) {
              const tx = x + len * Math.cos(dir + d), ty = y + len * Math.sin(dir + d)
              limb([[x, y], [tx, ty]], 0.055, 0.05)
              const [px, py] = P(tx, m * ty)
              rc.disc(px, py, Math.max(2.2, 0.058 * s))
            }
          }
          // back leg: thigh out to the knee, shin back, long foot
          limb(bez([-0.32, 0.26], [-0.2, 0.55], [-0.08, 0.72], [0.02, 0.8], 10), 0.25, 0.15)
          limb(bez([0.02, 0.8], [-0.2, 0.92], [-0.42, 0.9], [-0.62, 0.72], 10), 0.15, 0.1)
          limb([[-0.62, 0.72], [-0.82, 0.62]], 0.1, 0.075)
          toes(-0.82, 0.62, Math.PI + 0.2, 0.2, 0.42)
          // front leg
          limb(bez([0.28, 0.3], [0.32, 0.52], [0.38, 0.62], [0.5, 0.68], 8), 0.13, 0.09)
          toes(0.5, 0.68, 0.45, 0.17, 0.5)
        }
        if (p.back === 'spots') for (const [x, y, r] of [[-0.25, 0.1, 0.05], [-0.05, -0.14, 0.06], [0.14, 0.1, 0.045], [-0.3, -0.16, 0.04]]) {
          const q = P(x, y)
          holes.push(ccw(circlePts(q[0], q[1], Math.max(1.3, r * s), 14)))
        }
        if (p.back === 'stripe') holes.push(ccw([P(-0.42, 0.035), P(0.36, 0.025), P(0.36, -0.025), P(-0.42, -0.035)]))
      }
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'hiddenrings',
    group: 'Spin',
    name: 'Hidden Rings',
    blurb: 'Still, it looks like random scattered dashes. Spun, the chaos resolves into clean rings of light and dark, because each ring’s tone is set by how many dashes share its radius. Change the scatter and you get a new mess with the same hidden picture. Dashes are placed in opposite pairs, so it stays balanced.',
    overrides: { strutW: 2.6, frameH: 3, reliefH: 8 },
    params: [
      { key: 'tracks', label: 'Rings', unit: '', min: 4, max: 11, step: 1, value: 8 },
      { key: 'dashW', label: 'Dash width', unit: 'mm', min: 3.5, max: 9, step: 0.5, value: 6 },
      { key: 'tone', label: 'Tone pattern', options: ['pulse', 'fade out', 'fade in', 'alternating'], value: 'pulse' },
      { key: 'scatter', label: 'Scatter', unit: '', min: 1, max: 99, step: 1, value: 7 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), random = rng(p.scatter)
      const r0 = g.hubR + 7, step = (g.Ri - 5 - r0) / (p.tracks - 1)
      for (let b = 0; b < p.tracks; b++) {
        const f = b / (p.tracks - 1), r = r0 + b * step
        const tone = p.tone === 'fade out' ? 0.75 - 0.6 * f : p.tone === 'fade in' ? 0.15 + 0.6 * f : p.tone === 'alternating' ? (b % 2 ? 0.12 : 0.72) : 0.42 + 0.33 * Math.cos(f * TAU * 1.5)
        c.ring(0, 0, r, 2.6)
        // cover "tone" of half the track with dashes; the opposite half gets the same dashes turned 180°
        let covered = 0, guard = 0
        const taken = []
        while (covered < tone * Math.PI && guard++ < 400) {
          const len = (8 + random() * 26) / r, a = random() * Math.PI + g.rot
          if (taken.some(([x, l]) => Math.abs(((a - x + Math.PI * 1.5) % Math.PI) - Math.PI / 2) < (l + len) / 2 + 0.7 * (p.dashW / r))) continue
          taken.push([a, len])
          covered += len
          for (const off of [0, Math.PI]) {
            const pts = []
            for (let s = 0; s <= 10; s++) pts.push(polar(r, a + off - len / 2 + (len * s) / 10))
            rc.line(pts, p.dashW)
          }
        }
      }
      drawSpokes(c, g, 6, 0.1)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'spingradient',
    group: 'Spin',
    name: 'Spin Gradient',
    blurb: 'Painting with duty cycle: the petals swell and narrow with radius, so spinning mixes colour B with whatever is behind it in exact proportion. Stopped it is a wavy flower; spun it is soft glowing bands with no hard edges. Use Solid backing to blend colour A and B into a real third colour.',
    overrides: { strutW: 2.6, frameH: 3, reliefH: 5 },
    params: [
      { key: 'petals', label: 'Petals', unit: '', min: 3, max: 16, step: 1, value: 8 },
      { key: 'waves', label: 'Soft bands', unit: '', min: 0, max: 6, step: 0.5, value: 3, hint: '0 gives one smooth fade from collar to rim.' },
      { key: 'hi', label: 'Brightest', unit: '%', min: 40, max: 95, step: 1, value: 85 },
      { key: 'lo', label: 'Darkest', unit: '%', min: 3, max: 40, step: 1, value: 10 },
      { key: 'twist', label: 'Twist', unit: '°', min: 0, max: 90, step: 1, value: 20, hint: 'Has no effect on the spun bands, only on how it looks as it winds up.' },
      { key: 'plate', label: 'Backing', options: ['open', 'solid'], value: 'open', hint: 'Solid is heavier, but gives a true A-to-B colour blend.' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), n = p.petals
      const r0 = g.hubR - 1, r1 = g.Ri + 1, N = 120
      const duty = (t) => p.waves > 0 ? p.lo / 100 + ((p.hi - p.lo) / 100) * (0.5 + 0.5 * Math.cos(TAU * p.waves * t)) : p.hi / 100 + ((p.lo - p.hi) / 100) * t
      for (let i = 0; i < n; i++) {
        const base = g.rot + (TAU * i) / n, A = [], B = []
        for (let s = 0; s <= N; s++) {
          const t = s / N, r = r0 + (r1 - r0) * t
          const half = Math.max(2.1 / r, (Math.PI / n) * duty(t))
          const a = base + deg(p.twist) * t
          A.push(polar(r, a + half)); B.push(polar(r, a - half))
        }
        // the ends follow the rim and collar; a straight chord would leave thin slivers
        const arc = (r, a0, a1) => { const out = []; for (let s = 1; s < 12; s++) out.push(polar(r, a0 + ((a1 - a0) * s) / 12)); return out }
        const ang = (q) => Math.atan2(q[1], q[0]), near = (x, ref) => ref + Math.atan2(Math.sin(x - ref), Math.cos(x - ref))
        const aEnd = ang(A[N]), bEnd = near(ang(B[N]), aEnd), aStart = ang(A[0]), bStart = near(ang(B[0]), aStart)
        rc.solid([...A, ...arc(r1, aEnd, bEnd), ...B.slice().reverse(), ...arc(r0, bStart, aStart)])
      }
      if (p.plate === 'solid') c.disc(0, 0, g.Ri + 1)
      else for (const f of [0.34, 0.67]) c.ring(0, 0, r0 + (r1 - r0) * f, 2.6)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'pulsetunnel',
    group: 'Spin',
    name: 'Pulse Tunnel',
    blurb: 'Wavy rings, each wave shifted a little from the ring inside it. As the hub turns, the waves appear to travel: at a slow spin it pulses like a tunnel, outward one way and inward the other. Faster, the rings melt into soft bands.',
    overrides: { strutW: 2.6, frameH: 3, reliefH: 8 },
    params: [
      { key: 'tracks', label: 'Rings', unit: '', min: 3, max: 11, step: 1, value: 7 },
      { key: 'lobes', label: 'Waves round', unit: '', min: 2, max: 12, step: 1, value: 6 },
      { key: 'phase', label: 'Shift per ring', unit: '°', min: 0, max: 180, step: 5, value: 60 },
      { key: 'lineW', label: 'Line width', unit: 'mm', min: 2.6, max: 7, step: 0.1, value: 3.6 },
      { key: 'amp', label: 'Wave height', unit: 'mm', min: 1, max: 12, step: 0.5, value: 5 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const r0 = g.hubR + 8, step = (g.Ri - 2 - r0) / p.tracks
      const room = (step - p.lineW - 1) / Math.max(0.3, 2 * Math.sin(deg(p.phase) / 2))
      const amp = Math.min(p.amp, room, 7)
      for (let b = 0; b < p.tracks; b++) {
        const out = [], inn = []
        for (let s = 0; s < 360; s++) {
          const th = (TAU * s) / 360
          const r = r0 + (b + 0.5) * step + amp * Math.cos(p.lobes * (th - g.rot) - deg(p.phase) * b)
          out.push(polar(r + p.lineW / 2, th)); inn.push(polar(r - p.lineW / 2, th))
        }
        rc.contours.push(ccw(out), cw(inn))
      }
      drawSpokes(c, g, Math.max(3, p.lobes), 0)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'caustic',
    group: 'Spin',
    name: 'Light Shells',
    blurb: 'Only straight lines, and yet a spinning straight line draws a glowing ring: it is brightest where it runs tangent, with a soft haze outside. Each set of chords makes its own shell, so spun it looks like nested spheres of light. Superb under blacklight.',
    overrides: { strutW: 2.6, frameH: 3, reliefH: 7 },
    params: [
      { key: 'shells', label: 'Shells', unit: '', min: 1, max: 4, step: 1, value: 3 },
      { key: 'chords', label: 'Chords per shell', unit: '', min: 3, max: 14, step: 1, value: 9 },
      { key: 'lineW', label: 'Line width', unit: 'mm', min: 2.6, max: 5, step: 0.1, value: 2.8 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      for (let b = 0; b < p.shells; b++) {
        const d = g.hubR + 1 + ((g.Ri - 10 - g.hubR) * b) / Math.max(1, p.shells - 1 || 1) * (p.shells > 1 ? 1 : 0)
        const half = Math.acos(d / (g.Ri + 0.5))
        for (let i = 0; i < p.chords; i++) {
          const a = g.rot + (TAU * (i + b * 0.37)) / p.chords
          rc.line([polar(g.Ri + 0.5, a - half), polar(g.Ri + 0.5, a + half)], p.lineW)
        }
      }
      drawSpokes(c, g, p.chords, Math.PI / p.chords)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'moirebloom',
    group: 'Spin',
    name: 'Moiré Bloom',
    blurb: 'Two fans of fine spirals on two levels, one in each colour, with slightly different counts. Where they fall in and out of step, big soft petals appear that aren’t drawn anywhere. Tilt or wobble the staff and the petals slide, because the tall layer shifts against the low one.',
    overrides: { strutW: 2.6, frameH: 3, reliefH: 6 },
    params: [
      { key: 'lines', label: 'Lines', unit: '', min: 16, max: 48, step: 1, value: 30 },
      { key: 'beats', label: 'Petals', unit: '', min: 2, max: 10, step: 1, value: 5, hint: 'The tall layer has this many more lines than the low one.' },
      { key: 'twist', label: 'Twist', unit: '°', min: 40, max: 220, step: 5, value: 120 },
      { key: 'hand', label: 'Layers turn', options: ['same way', 'opposite ways'], value: 'same way', hint: 'Opposite ways gives a diamond weave instead of petals.' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const fan = (canvas, n, sign) => {
        const r0 = g.hubR - 1, r1 = g.Ri + 0.5, k = Math.log(r1 / r0) / deg(p.twist)
        const pitch = k / Math.hypot(1, k) // spacing between neighbours, across the line, per unit of circumference
        const wAt = (q) => Math.max(2.6, (0.46 * pitch * TAU * Math.hypot(q[0], q[1])) / n)
        for (let i = 0; i < n; i++) {
          const a0 = g.rot + (TAU * i) / n, pts = []
          for (let s = 0; s <= 40; s++) { const th = (deg(p.twist) * s) / 40; pts.push(polar(r0 * Math.exp(k * th), a0 + sign * th)) }
          for (let s = 0; s < 40; s++) canvas.seg(pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1], wAt(pts[s]), wAt(pts[s + 1]))
          for (const q of pts) canvas.disc(q[0], q[1], wAt(q) / 2)
        }
      }
      fan(c, p.lines, 1)
      fan(rc, p.lines + p.beats, p.hand === 'same way' ? 1 : -1)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'bloomzoetrope',
    group: 'Spin',
    name: 'Zoetrope Bloom',
    blurb: 'A zoetrope garden: two rings of flowers, each a frame further open than the last. Press Zoetrope strobe, or use a strobing capsule at the matching rate, and the flowers open and close in place. The inner ring blooms out of step with the outer one.',
    overrides: { strutW: 2.6, frameH: 3, reliefH: 8 },
    params: [
      { key: 'frames', label: 'Frames', unit: '', min: 8, max: 20, step: 2, value: 14, hint: 'The bloom runs twice per turn, so opposite flowers match and the hub stays balanced.' },
      { key: 'petals', label: 'Petals', unit: '', min: 4, max: 9, step: 1, value: 6 },
      { key: 'smallest', label: 'Closed size', unit: '%', min: 10, max: 60, step: 1, value: 28 },
    ],
    strobe: (p) => p.frames,
    draw(c, g, p) {
      const rc = new Canvas(g.w), n = p.frames
      const rings = [g.hubR + (g.Ri - g.hubR) * 0.76, g.hubR + (g.Ri - g.hubR) * 0.33]
      rings.forEach((rm, q) => {
        c.ring(0, 0, rm, Math.max(2.6, g.w))
        const size = Math.min(((TAU * rm) / n) * 0.52, (g.Ri - g.hubR) * 0.2)
        for (let i = 0; i < n; i++) {
          const a = g.rot + (TAU * i) / n + (q ? Math.PI / n : 0)
          const open = p.smallest / 100 + (1 - p.smallest / 100) * (0.5 + 0.5 * Math.cos((2 * TAU * i) / n + q * Math.PI))
          const L = size * open, C = polar(rm, a)
          for (let k = 0; k < p.petals; k++) {
            const b = a + (TAU * k) / p.petals + open * 0.6
            const E = [C[0] + L * Math.cos(b), C[1] + L * Math.sin(b)]
            const M = [C[0] + L * 0.5 * Math.cos(b + 0.25), C[1] + L * 0.5 * Math.sin(b + 0.25)]
            rc.taper(bez(C, M, M, E, 6), Math.max(2.6, L * 0.5), Math.max(2.6, L * 0.34))
          }
          rc.disc(C[0], C[1], Math.max(2.6, size * 0.22))
        }
      })
      drawSpokes(c, g, n, Math.PI / n)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'frogleap',
    group: 'Creatures',
    name: 'Leaping Frogs',
    blurb: 'A pond zoetrope. Two rings of low lily pads, with a frog in every slot at a different moment of its jump: crouched on the inner pad, stretched out in the air, crouched on the outer pad, then flying back. Press Zoetrope strobe, or match a strobing capsule, and they hop between the pads. Without strobe, spinning blurs them into a rippling band of frogs.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 9 },
    params: [
      { key: 'frames', label: 'Frames', options: ['8', '12', '16', '24'], value: '12', hint: '8 and 12 hop in four steps per jump there and back; 16 and 24 use eight steps, smoother but with smaller frogs. The hop repeats at least twice per turn, so the hub stays balanced.' },
      { key: 'size', label: 'Frog size', unit: 'mm', min: 14, max: 34, step: 1, value: 24 },
      { key: 'padIn', label: 'Inner pad size', unit: 'mm', min: 8, max: 20, step: 0.5, value: 14 },
      { key: 'padOut', label: 'Outer pad size', unit: 'mm', min: 10, max: 26, step: 0.5, value: 19 },
      { key: 'airScale', label: 'Bigger in the air', unit: '%', min: 100, max: 135, step: 1, value: 112, hint: 'Seen from above, a frog in mid-leap is closer to you.' },
    ],
    strobe: (p) => Number(p.frames),
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = [], N = Number(p.frames)
      const STEPS = N >= 16 ? 8 : 4 // moments in one jump there and back
      const rIn = g.hubR + p.size * 0.95 + 1, rOut = g.Ri - p.size * 0.95
      const lw = Math.max(2.6, g.w)
      for (let i = 0; i < N; i++) {
        const a = g.rot + (TAU * i) / N
        // lily pads: open circles with the notch every lily pad has, facing the stem
        for (const [r, R] of [[rIn, p.padIn], [rOut, p.padOut]]) {
          const C = polar(r, a), pts = []
          for (let s = 0; s <= 40; s++) { const b = a + Math.PI + 0.3 + ((TAU - 0.6) * s) / 40; pts.push([C[0] + R * Math.cos(b), C[1] + R * Math.sin(b)]) }
          c.line(pts, lw)
          c.line([C, pts[0]], lw); c.line([C, pts.at(-1)], lw)
          c.line([[C[0] - R * Math.cos(a), C[1] - R * Math.sin(a)], [C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)]], lw)
        }
        // the stem joins the two pads and carries the frog in mid-air
        c.line([polar(g.hubR - 1, a), polar(g.Ri + 0.5, a)], lw)
        const phase = (i % STEPS) / STEPS, out = phase <= 0.5 // leaving the inner pad, or coming back
        const f = out ? phase * 2 : (1 - phase) * 2 // 0 at the inner pad, 1 at the outer
        const ease = f * f * (3 - 2 * f), r = rIn + (rOut - rIn) * ease
        const air = Math.sin(Math.PI * f) // 0 crouched, 1 at the top of the leap
        const s = p.size * (1 + ((p.airScale - 100) / 100) * air)
        drawFrog(rc, holes, polar(r, a), out ? a : a + Math.PI, s, air)
      }
      c.ring(0, 0, (rIn + rOut) / 2, lw) // a ripple, tying the stems together
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'frogcycle',
    group: 'Creatures',
    name: 'Unicycle Frogs',
    blurb: 'A troupe of frogs riding unicycles round a circular road at the collar, heads toward the rim, arms out for balance, with big grins. Each rider’s pedals are a step further round than the last, so under Zoetrope strobe or a matching strobing capsule they pedal and their wheels turn.',
    overrides: { strutW: 2.6, frameH: 3.5, reliefH: 9 },
    params: [
      { key: 'frames', label: 'Riders', options: ['6', '8', '10'], value: '8', hint: 'The pedalling cycle runs twice per turn, so opposite riders match and the hub stays balanced.' },
      { key: 'size', label: 'Rider size', unit: '%', min: 60, max: 100, step: 1, value: 100, hint: '100% fills the space from the road to the rim.' },
      { key: 'lean', label: 'Lean', unit: '°', min: -15, max: 15, step: 1, value: 5 },
    ],
    strobe: (p) => Number(p.frames),
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = [], N = Number(p.frames)
      const road = g.hubR + 6
      const s = ((g.Ri - 1 - road) / 92) * (p.size / 100)
      const R = 15 * s, rW = road + R + 1.2
      for (let i = 0; i < N; i++) {
        const a = g.rot + (TAU * i) / N, O = polar(rW, a)
        const phi = deg(20) - (i % (N / 2)) * (TAU / (N / 2))
        const tilt = a - Math.PI / 2 - deg(p.lean)
        // x = direction of travel round the ring, y = out toward the rim; drawn in millimetres at s = 1
        const P = ([x, y]) => place([[x * s, y * s]], tilt, O[0], O[1])[0]
        const line = (pts, w0, w1 = w0) => rc.taper(pts.map(P), Math.max(2.8, w0 * s), Math.max(2.8, w1 * s))
        const blob = ([cx, cy], rx, ry, b = 0) => {
          const out = []
          for (let q = 0; q < 40; q++) { const t = (TAU * q) / 40, x = rx * Math.cos(t), y = ry * Math.sin(t); out.push(P([cx + x * Math.cos(b) - y * Math.sin(b), cy + x * Math.sin(b) + y * Math.cos(b)])) }
          rc.solid(out)
        }
        const pad = ([x, y]) => { const q = P([x, y]); rc.disc(q[0], q[1], Math.max(2.3, 2.8 * s)) }
        // wheel: tyre, five spokes, hub
        rc.ring(O[0], O[1], R, Math.max(3.2, 3.8 * s))
        for (let k = 0; k < 4; k++) { const b = phi + Math.PI / 4 + (TAU * k) / 4; line([[0, 0], [15 * Math.cos(b), 15 * Math.sin(b)]], 2.8) }
        rc.disc(O[0], O[1], Math.max(3, 3.6 * s))
        // frame: post, saddle, cranks, pedals
        const hip = [-2, 36], seat = [-1, 31]
        line([[0, 0], seat], 4.6)
        line([[-8, 32], [7, 31]], 5.5)
        const crank = (sign) => [8.5 * sign * Math.cos(phi), 8.5 * sign * Math.sin(phi)]
        for (const sign of [1, -1]) {
          const Q = crank(sign)
          line([[0, 0], Q], 3.4)
          line([[Q[0] - 3.5, Q[1]], [Q[0] + 3.5, Q[1]]], 3.2)
          if (sign < 0) continue // only the near leg: two would hide the wheel
          // the leg: hip to pedal with the knee pushed forward
          const dx = Q[0] - hip[0], dy = Q[1] - hip[1], d = Math.hypot(dx, dy), L = 19
          const h = Math.sqrt(Math.max(0, L * L - (d / 2) ** 2))
          const knee = [hip[0] + dx / 2 - (dy / d) * h, hip[1] + dy / 2 + (dx / d) * h]
          const K = knee[0] > hip[0] ? knee : [hip[0] + dx / 2 + (dy / d) * h, hip[1] + dy / 2 - (dx / d) * h]
          line([hip, K], 8, 5.5)
          line([K, Q], 5.5, 3.6)
          line([Q, [Q[0] + 7, Q[1] - 1.5]], 3.2)
          pad([Q[0] + 7, Q[1] - 1.5])
        }
        // the frog, upright: round belly, wide flat head
        blob([2, 46], 12.5, 15, -0.18)
        blob([8, 64], 15, 9.5, 0.08)
        const eye = P([9, 72])
        rc.disc(eye[0], eye[1], Math.max(3.4, 5.6 * s))
        holes.push(ccw(circlePts(eye[0], eye[1], Math.max(1.8, 3 * s), 16)))
        // the grin, a recessed curve
        const grin = []
        for (let q = 0; q <= 12; q++) { const t = q / 12, x = -3 + 22 * t, y = 66 - 5 * Math.sin(Math.PI * t) ** 0.8; grin.push(P([x, y + 0.8])) }
        for (let q = 12; q >= 0; q--) { const t = q / 12, x = -3 + 22 * t, y = 66 - 5 * Math.sin(Math.PI * t) ** 0.8; grin.push(P([x, y - 0.8])) }
        holes.push(ccw(grin))
        // arms out for balance, with sticky fingers
        line(bez([9, 50], [16, 50], [20, 52], [23, 58], 8), 5.5, 3.6)
        line(bez([-7, 50], [-13, 53], [-17, 54], [-21, 49], 8), 5.5, 3.6)
        for (const [hand, dirs] of [[[23, 58], [1.0, 1.5, 0.45]], [[-21, 49], [3.5, 2.9, 4.1]]])
          for (const b of dirs) {
            const tip = [hand[0] + 6 * Math.cos(b), hand[1] + 6 * Math.sin(b)]
            line([hand, tip], 2.8)
            pad(tip)
          }
      }
      c.ring(0, 0, road, Math.max(3, g.w)) // the road
      c.ring(0, 0, rW + 32 * s, Math.max(2.6, g.w)) // a low ring, running behind the riders' bodies
      drawSpokes(c, g, N, Math.PI / N)
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  // `added` feeds the New filter in the design list
  ...VEINS_DESIGNS.map((d) => Object.assign(d, { added: '2026-11-17' })),
  ...DOGS_DESIGNS.map((d) => Object.assign(d, { added: '2026-11-17' })),
  ...LOYALDOG_DESIGNS.map((d) => Object.assign(d, { added: '2026-11-17' })),
  ...SIGNATURE_DESIGNS.map((d) => Object.assign(d, { added: '2026-11-17' })),
  ...MELT_DESIGNS.map((d) => Object.assign(d, { added: '2026-11-18' })),
]
// CNC and fire: new ones, favourites re-cut, and hubs for 8 mm fire spokes
DESIGNS.push(...fireDesigns(DESIGNS, { drawSpokes, drawVortex }))
// contact staff ball ends: printed, push onto the pole
DESIGNS.push(...ballDesigns(), ...noveltyDesigns())
// printed practice spokes for the spoke hubs, and pole inserts that stop clamps crushing a hollow pole
DESIGNS.push(...practiceDesigns(), ...sleeveDesigns(), ...gripDesigns())
// rope dart heads (print or lathe)
DESIGNS.push(...dartDesigns())
// silicone and rubber moulds for balls, rope darts and poi
DESIGNS.push(...mouldDesigns())
// hoops: cut lengths for every size and a printed connector
DESIGNS.push(...hoopDesigns())
// collapsible (travel) hoops: push-button and pin joints
DESIGNS.push(...jointDesigns())
// bubble poi heads, with printed loops or loops to wrap in cotton yarn
DESIGNS.push(...bubblePoiDesigns(), ...bubbleHubDesigns())
// fire contact swords: cut from metal, Kevlar wicks
DESIGNS.push(...swordDesigns())
// acro staff ends: printed (coin + steel shot) and turned metal
DESIGNS.push(...acroDesigns())
// pine cones: three flat hubs (the cone ends, darts and poi live with their own kinds)
DESIGNS.push(...pineHubDesigns())
// locking dowels for the pole end (turned metal); hubs opt in with Lock onto a metal dowel
DESIGNS.push(...dowelDesigns())
// tube fire swords and axes: a machined connector on the staff pole, Kevlar-wound tubes, a Kevlar ball pommel
DESIGNS.push(...tubeSwordDesigns(), ...tubeAxeDesigns(), ...tubeMaceDesigns(), ...plateAxeDesigns())
// monkey's fist heads: staff end, rope dart, meteor, poi
DESIGNS.push(...fistDesigns(), ...hiltDesigns(), ...cageDesigns())
// Aotearoa New Zealand plants and birds, and a brown beer can
DESIGNS.push(...nzDesigns(), ...canDesigns(), ...shroomDesigns())
// tiny props (tiny copies of the designs above, at a small scale) and tiny juggling clubs: keep this last
DESIGNS.push(...tinyDesigns(DESIGNS))

const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)]

/** A curl: walks from (x, y) on heading h, turning steadily while the radius shrinks from rho to rho * k. */
function curlPts(x, y, h, rho, turns, sg = 1, k = 0.25) {
  const n = Math.max(8, Math.ceil(turns * 32)), dt = (TAU * turns) / n, pts = [[x, y]]
  for (let s = 1; s <= n; s++) {
    const r = rho * k ** (s / n)
    h += sg * dt
    x += r * dt * Math.cos(h); y += r * dt * Math.sin(h)
    pts.push([x, y])
  }
  return pts
}

/** Solid strip along pts, with width wFn(t) for t in 0..1: flames, crescents. */
function ribbon(canvas, pts, wFn) {
  const n = pts.length - 1, left = [], right = []
  pts.forEach((q, s) => {
    const A = pts[Math.max(0, s - 1)], B = pts[Math.min(n, s + 1)]
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]), w = wFn(s / n) / 2
    const nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L
    left.push([q[0] + nx * w, q[1] + ny * w]); right.push([q[0] - nx * w, q[1] - ny * w])
  })
  canvas.solid([...left, ...right.reverse()])
}

/** A frog from above, heading h at C. e runs from 0 (crouched, legs folded) to 1 (mid-leap, legs flung out behind). */
function drawFrog(rc, holes, C, h, s, e) {
  const mix = (A, B) => [A[0] + (B[0] - A[0]) * e, A[1] + (B[1] - A[1]) * e]
  const P = (x, y) => place([[x * s, y * s]], h, C[0], C[1])[0]
  const body = []
  for (let q = 0; q < 48; q++) {
    const t = (TAU * q) / 48, x = Math.cos(t), y = Math.sin(t)
    body.push(P(0.08 + 0.6 * (1 + 0.25 * e) * x, y * 0.42 * (1 - 0.14 * e) * (1 + 0.12 * x)))
  }
  rc.solid(body)
  const knee = mix([0.02, 0.8], [-0.62, 0.34]), ankle = mix([-0.62, 0.72], [-1.02, 0.25]), foot = mix([-0.82, 0.62], [-1.32, 0.17])
  const wrist = mix([0.5, 0.68], [1.02, 0.32])
  for (const m of [1, -1]) {
    const eye = P(0.42 + 0.14 * e, m * 0.31 * (1 - 0.1 * e))
    rc.disc(eye[0], eye[1], Math.max(3, 0.14 * s))
    holes.push(ccw(circlePts(eye[0], eye[1], Math.max(1.6, 0.08 * s), 16)))
    const limb = (pts, w0, w1) => rc.taper(pts.map(([x, y]) => P(x, m * y)), Math.max(3, w0 * s), Math.max(2.8, w1 * s))
    const toes = ([x, y], dir, len, spread) => {
      for (const d of [-spread, 0, spread]) {
        const tx = x + len * Math.cos(dir + d), ty = y + len * Math.sin(dir + d)
        limb([[x, y], [tx, ty]], 0.06, 0.05)
        const [px, py] = P(tx, m * ty)
        rc.disc(px, py, Math.max(2.1, 0.06 * s))
      }
    }
    limb(bez([-0.32, 0.26], mix([-0.2, 0.55], [-0.42, 0.34]), mix([-0.08, 0.72], [-0.52, 0.35]), knee, 8), 0.25, 0.15)
    limb(bez(knee, mix([-0.2, 0.92], [-0.75, 0.32]), mix([-0.42, 0.9], [-0.9, 0.28]), ankle, 8), 0.15, 0.1)
    limb([ankle, foot], 0.1, 0.075)
    toes(foot, Math.PI + 0.2 * (1 - e), 0.2, 0.42)
    limb(bez([0.28, 0.3], mix([0.32, 0.52], [0.5, 0.34]), mix([0.38, 0.62], [0.75, 0.34]), wrist, 8), 0.13, 0.09)
    toes(wrist, 0.45 * (1 - e) + 0.1 * e, 0.17, 0.5)
  }
}

// shared drawing helpers for the designs-*.js files (function declarations, so the import cycle is safe)
export { drawSpokes, drawVortex, drawDome, bez, drawVines, diskVeins, phyllotaxis, curlPts, ribbon, deg }
