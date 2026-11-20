/**
 * Spark cages: perforated steel cages filled with charcoal. Lit, they throw a
 * shower of sparks out of the holes as they spin. CNC only: each one is laser
 * (or waterjet) cut flat from stainless or mild steel sheet, then folded on
 * the BEND lines and riveted, bolted or wire-stitched. Never aluminium:
 * burning charcoal is hotter than aluminium's melting point.
 *
 *   box      staff end: a rectangular box, the pole bolts to its floor
 *   tube     rope dart: a perforated tube with bolt-on end caps and an eye bolt
 *   diamond  rope dart or bolas: an octahedron, wire-stitched, shackle at the top
 *   cube     dragon staff: small cubes that go on the 8 mm spoke tips
 *
 * Units mm. Flat patterns in the xy plane; the 3D view is the folded cage.
 */
import { TAU, ccw } from './geom.js'

export const CAGE_PARAMS = {
  box: [
    { key: 'cw', label: 'Width', unit: 'mm', min: 40, max: 120, step: 1, value: 60 },
    { key: 'cd', label: 'Depth', unit: 'mm', min: 40, max: 120, step: 1, value: 60 },
    { key: 'ch', label: 'Height', unit: 'mm', min: 50, max: 200, step: 1, value: 110 },
  ],
  tube: [
    { key: 'tubeD', label: 'Diameter', unit: 'mm', min: 35, max: 100, step: 1, value: 55 },
    { key: 'tubeL', label: 'Length', unit: 'mm', min: 50, max: 200, step: 1, value: 100 },
  ],
  diamond: [{ key: 'edge', label: 'Edge length', unit: 'mm', min: 50, max: 140, step: 1, value: 85 }],
  cube: [{ key: 'cw', label: 'Cube size', unit: 'mm', min: 30, max: 70, step: 1, value: 45 }],
}
export const PERF_PARAMS = [
  { key: 'perf', label: 'Spark holes', unit: 'mm', min: 2, max: 8, step: 0.5, value: 4, presets: [3, 4, 5], hint: 'Bigger holes throw more and bigger sparks but let small coals fall out. 4 mm suits crushed shisha charcoal.' },
  { key: 'pitch', label: 'Hole spacing', unit: 'mm', min: 4, max: 16, step: 0.5, value: 7, hint: 'Centre to centre. Keep at least 2 mm of steel between holes.' },
]

const RIV = 1.65 // Ø3.3 holes: 3.2 mm stainless pop rivets or M3 bolts

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

// a staggered grid of spark holes inside a polygon, keeping `margin` from its edges
function perfInside(poly, perf, pitch, margin, keepOut = []) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const inside = (x, y) => {
    let c = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
    }
    return c
  }
  const distEdge = (x, y) => {
    let d = 1e9
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j], [bx, by] = poly[i], dx = bx - ax, dy = by - ay
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
      d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy))
    }
    return d
  }
  const out = []
  const rowH = pitch * 0.866
  for (let row = 0, y = y0; y <= y1; row++, y = y0 + row * rowH) {
    for (let x = x0 + (row % 2 ? pitch / 2 : 0); x <= x1; x += pitch) {
      if (!inside(x, y) || distEdge(x, y) < margin + perf / 2) continue
      if (keepOut.some((k) => Math.hypot(x - k.x, y - k.y) < k.r + perf / 2 + 2)) continue
      out.push({ x, y, r: perf / 2, kind: 'spark' })
    }
  }
  return out
}

/**
 * The flat pattern and the folded faces of one cage.
 * faces: [{ poly (local 2D), holes, frame: [origin, u, v] }] for the 3D view.
 */
function pattern(kind, p) {
  const cut = [], holes = [], bends = [], faces = []
  const M = 7 // plain steel round every face edge
  const perf = (poly, keep = []) => perfInside(poly, p.perf, p.pitch, M, keep)
  if (kind === 'box' || kind === 'cube') {
    const W = p.cw, D = kind === 'cube' ? p.cw : p.cd, H = kind === 'cube' ? p.cw : p.ch, T = Math.min(12, W / 4)
    // net: floor in the middle, sides round it, lid off the back, rivet tabs on the left and right sides
    const floor = rect(0, 0, W, D), front = rect(0, -H, W, 0), back = rect(0, D, W, D + H), lid = rect(0, D + H, W, 2 * D + H)
    const left = rect(-H, 0, 0, D), right = rect(W, 0, W + H, D)
    const tabs = [
      [[-H + 3, 0], [-3, 0], [-3 - 2, -T], [-H + 3 + 2, -T]], [[-H + 3, D], [-3, D], [-5, D + T], [-H + 5, D + T]],
      [[W + 3, 0], [W + H - 3, 0], [W + H - 5, -T], [W + 5, -T]], [[W + 3, D], [W + H - 3, D], [W + H - 5, D + T], [W + 5, D + T]],
    ]
    const lidTab = [[W / 2 - 14, 2 * D + H], [W / 2 + 14, 2 * D + H], [W / 2 + 11, 2 * D + H + 14], [W / 2 - 11, 2 * D + H + 14]]
    // the outline is the union of all of these (done with CrossSection in buildCage)
    cut.push(floor, front, back, lid, left, right, ...tabs, lidTab)
    bends.push([[0, 0], [W, 0]], [[0, D], [W, D]], [[0, D + H], [W, D + H]], [[0, 0], [0, D]], [[W, 0], [W, D]],
      [[-H + 3, 0], [-3, 0]], [[-H + 3, D], [-3, D]], [[W + 3, 0], [W + H - 3, 0]], [[W + 3, D], [W + H - 3, D]], [[W / 2 - 14, 2 * D + H], [W / 2 + 14, 2 * D + H]])
    // rivets: tabs on the left/right sides fold onto the front and back
    const rv = []
    for (const f of [1 / 3, 2 / 3]) {
      const h = H * f
      rv.push({ x: -h, y: -T / 2 }, { x: 5, y: -h }, { x: -h, y: D + T / 2 }, { x: 5, y: D + h },
        { x: W + h, y: -T / 2 }, { x: W - 5, y: -h }, { x: W + h, y: D + T / 2 }, { x: W - 5, y: D + h })
    }
    for (const r of rv) holes.push({ ...r, r: RIV, kind: 'rivet' })
    // lid: its tab folds down over the front and takes an M5 bolt (open it to load coal)
    holes.push({ x: W / 2, y: 2 * D + H + 7, r: 2.75, kind: 'lid bolt' }, { x: W / 2, y: -7, r: 2.75, kind: 'lid bolt' })
    // floor: the mount
    const mount = []
    if (kind === 'box') {
      const bore = (p.poleOD + 0.5) / 2
      mount.push({ x: W / 2, y: D / 2, r: bore, kind: 'pole' })
      for (let i = 0; i < 4; i++) { const a = TAU * (i / 4 + 1 / 8); mount.push({ x: W / 2 + 15.5 * Math.cos(a) * Math.SQRT2, y: D / 2 + 15.5 * Math.sin(a) * Math.SQRT2, r: 2.25, kind: 'collar bolt' }) }
    } else mount.push({ x: W / 2, y: D / 2, r: 4.25, kind: 'spoke' })
    holes.push(...mount)
    const keep = [...holes.map((h) => ({ x: h.x, y: h.y, r: h.r + 3 })), ...mount.map((h) => ({ ...h, r: h.r + 8 }))]
    for (const f of [floor, front, back, lid, left, right]) holes.push(...perf(f, keep))
    // folded: floor at z=0
    const fr = (o, u, v) => [o, u, v]
    faces.push(
      { poly: floor, frame: fr([0, 0, 0], [1, 0, 0], [0, 1, 0]) },
      { poly: front, frame: fr([0, 0, 0], [1, 0, 0], [0, 0, -1]) }, // y (−H..0) → z (H..0)
      { poly: back, frame: fr([0, 2 * D, 0], [1, 0, 0], [0, -1, 0]), map: (x, y) => [x, D, y - D] },
      { poly: lid, map: (x, y) => [x, D - (y - D - H), H] },
      { poly: left, map: (x, y) => [0, y, -x] },
      { poly: right, map: (x, y) => [W, y, x - W] },
    )
    faces[1].map = (x, y) => [x, 0, -y]
    return { cut, holes, bends, faces, size: [W, D, H], vol: W * D * H, center: [W / 2, D / 2] }
  }
  if (kind === 'tube') {
    const Dm = p.tubeD, L = p.tubeL, C = Math.PI * Dm, ov = 10
    const wall = rect(0, 0, C + ov, L)
    cut.push(wall)
    bends.push([[C, 0], [C, L]]) // the seam overlap: roll, don't fold; marked for reference
    // seam rivets, and rivets for the end-cap tabs, 8 round each end
    for (const y of [L * 0.2, L * 0.5, L * 0.8]) holes.push({ x: C + ov / 2, y, r: RIV, kind: 'rivet' }, { x: ov / 2 - 0.0001 + 0, y, r: RIV, kind: 'rivet' })
    const nT = 8
    for (let i = 0; i < nT; i++) for (const y of [5, L - 5]) holes.push({ x: (C * (i + 0.5)) / nT, y, r: 2.1, kind: 'cap bolt' })
    holes.push(...perf(rect(ov, 0, C, L), holes.map((h) => ({ x: h.x, y: h.y, r: h.r + 3 }))))
    // two end caps beside the wall: a disc with 8 tabs that fold down inside the tube
    const R = Dm / 2 - 1.2
    const capAt = (cx, cy, top) => {
      const out = []
      for (let i = 0; i < nT; i++) {
        const a = (TAU * (i + 0.5)) / nT, w = 9
        const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux
        out.push([[cx + R * ux + (w / 2) * vx, cy + R * uy + (w / 2) * vy], [cx + (R + 9) * ux + (w / 2 - 1.5) * vx, cy + (R + 9) * uy + (w / 2 - 1.5) * vy],
          [cx + (R + 9) * ux - (w / 2 - 1.5) * vx, cy + (R + 9) * uy - (w / 2 - 1.5) * vy], [cx + R * ux - (w / 2) * vx, cy + R * uy - (w / 2) * vy]])
        bends.push([[cx + R * ux + (w / 2) * vx, cy + R * uy + (w / 2) * vy], [cx + R * ux - (w / 2) * vx, cy + R * uy - (w / 2) * vy]])
        holes.push({ x: cx + (R + 4.5) * ux, y: cy + (R + 4.5) * uy, r: 2.1, kind: 'cap bolt' })
      }
      const disc = []
      for (let i = 0; i < 64; i++) disc.push([cx + R * Math.cos((TAU * i) / 64), cy + R * Math.sin((TAU * i) / 64)])
      cut.push(disc, ...out)
      const centre = { x: cx, y: cy, r: top ? 4.25 : 3.3, kind: top ? 'eye bolt M8' : 'drain' }
      holes.push(centre)
      holes.push(...perf(disc, [{ ...centre, r: centre.r + 6 }]).filter((h) => Math.hypot(h.x - cx, h.y - cy) < R - 6))
      return disc
    }
    const capA = capAt(C + ov + 8 + R + 9, L / 2 + R + 14, true)
    const capB = capAt(C + ov + 8 + R + 9, L / 2 - R - 14, false)
    void capA; void capB
    // folded: a 16-sided tube standing on z, caps at both ends
    const n = 16
    for (let i = 0; i < n; i++) {
      const s0 = (C * i) / n, s1 = (C * (i + 1)) / n
      faces.push({ poly: rect(ov + s0 * ((C - ov) / C), 0, ov + s1 * ((C - ov) / C), L), tubeSeg: { i, n, R: Dm / 2, s0, s1, ov, C } })
    }
    return { cut, holes, bends, faces, size: [Dm, Dm, L], vol: (Math.PI * Dm * Dm * L) / 4, tube: { Dm, L } }
  }
  // diamond: an octahedron net, a strip of 6 triangles with one more above the 2nd and one below the 5th
  const a = p.edge, hgt = (a * Math.sqrt(3)) / 2
  const tri = (i, up) => {
    const x = (i * a) / 2
    return up ? [[x, 0], [x + a, 0], [x + a / 2, hgt]] : [[x + a / 2, 0], [x + a * 1.5, hgt], [x + a / 2 + 0, hgt]].map(([X, Y], j) => (j === 1 ? [x + a, hgt] : j === 2 ? [x, hgt] : [x + a / 2, 0]))
  }
  const tris = []
  for (let i = 0; i < 6; i++) tris.push(tri(i, i % 2 === 0))
  tris.push([[a / 2, hgt], [a * 1.5, hgt], [a, 2 * hgt]]) // above triangle 1 (a down-triangle's top edge)
  tris.push([[2 * a, 0], [3 * a, 0], [2.5 * a, -hgt]]) // below triangle 4
  cut.push(...tris)
  // stitch holes along every edge, 4 mm in, every ~14 mm
  const seen = new Set()
  for (const t of tris) {
    for (let e = 0; e < 3; e++) {
      const A = t[e], B = t[(e + 1) % 3]
      const key = [A, B].map((q) => q.map((v) => v.toFixed(2)).join(',')).sort().join('|')
      const shared = seen.has(key)
      seen.add(key)
      if (shared) { bends.push([A, B]); continue }
    }
  }
  for (const t of tris) {
    const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3
    for (let e = 0; e < 3; e++) {
      const A = t[e], B = t[(e + 1) % 3], L = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(2, Math.floor(L / 14))
      for (let j = 1; j < n; j++) {
        const x = A[0] + ((B[0] - A[0]) * j) / n, y = A[1] + ((B[1] - A[1]) * j) / n
        const dx = cx - x, dy = cy - y, dl = Math.hypot(dx, dy)
        holes.push({ x: x + (dx / dl) * 4, y: y + (dy / dl) * 4, r: 1.1, kind: 'stitch' })
      }
    }
    holes.push(...perf(t, []).filter(() => true))
  }
  // folded view: the 8 faces of an octahedron
  const s = a / Math.SQRT2
  const V = { px: [s, 0, 0], nx: [-s, 0, 0], py: [0, s, 0], ny: [0, -s, 0], pz: [0, 0, s], nz: [0, 0, -s] }
  for (const zs of ['pz', 'nz']) for (const [u, v] of [['px', 'py'], ['py', 'nx'], ['nx', 'ny'], ['ny', 'px']]) faces.push({ tri3: [V[zs], V[u], V[v]] })
  return { cut, holes, bends, faces, size: [2 * s, 2 * s, 2 * s], vol: (Math.SQRT2 / 3) * a ** 3, diamond: { s, a } }
}

export function buildCage(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const kind = opts.kind
    const t = opts.thick || 1.2
    const density = opts.density || 7.93
    const warns = []
    if (opts.metal === false) warns.push('Spark cages are steel only: burning charcoal melts aluminium and burns plastic. Shown in stainless.')
    if (opts.alu) warns.push('Not aluminium: burning charcoal runs hotter than aluminium melts. Use stainless (best) or mild steel. Shown in stainless.')
    if (p.pitch < p.perf + 2) warns.push('Spark holes are closer than 2 mm apart: the steel between them will burn through. Space them out.')
    const pat = pattern(kind, p)
    let flat = k(CrossSection.union(pat.cut.map((poly) => k(new CrossSection([ccw(poly)], 'Positive'))))) // every piece counts, whichever way it was drawn
    const holeSec = pat.holes.length ? k(CrossSection.union(pat.holes.map((h) => k(k(CrossSection.circle(h.r, h.r > 3 ? 32 : 12)).translate([h.x, h.y]))))) : null
    const flatCut = holeSec ? k(flat.subtract(holeSec)) : flat
    const area = flatCut.area()
    const g = (area * t * density) / 1000

    // the folded cage, for the view: each face is a plate with its own holes
    const parts = []
    const faceHoles = (poly) => pat.holes.filter((h) => {
      let c = false
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j]
        if (yi > h.y !== yj > h.y && h.x < ((xj - xi) * (h.y - yi)) / (yj - yi) + xi) c = !c
      }
      return c
    })
    const plate2d = (poly) => {
      let c = k(new CrossSection([ccw(poly)], 'Positive'))
      const hs = faceHoles(poly)
      if (hs.length) c = k(c.subtract(k(CrossSection.union(hs.map((h) => k(k(CrossSection.circle(h.r, 10)).translate([h.x, h.y])))))))
      return c
    }
    for (const f of pat.faces) {
      if (f.map) {
        // a flat face: extrude, then map its corners' frame (affine) into place
        const c = plate2d(f.poly)
        const m = k(c.extrude(t))
        const [x0, y0] = f.poly[0], [x1] = f.poly[1], y1 = f.poly[2][1]
        const P0 = f.map(x0, y0), Px = f.map(x1, y0), Py = f.map(x0, y1)
        const ux = (Px[0] - P0[0]) / (x1 - x0), uy = (Px[1] - P0[1]) / (x1 - x0), uz = (Px[2] - P0[2]) / (x1 - x0)
        const vx = (Py[0] - P0[0]) / (y1 - y0), vy = (Py[1] - P0[1]) / (y1 - y0), vz = (Py[2] - P0[2]) / (y1 - y0)
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
        const tx = P0[0] - ux * x0 - vx * y0, ty = P0[1] - uy * x0 - vy * y0, tz = P0[2] - uz * x0 - vz * y0
        parts.push(k(m.transform([ux, uy, uz, vx, vy, vz, nx, ny, nz, tx, ty, tz])))
      } else if (f.tubeSeg) {
        const { i, n, R } = f.tubeSeg
        const c = plate2d(f.poly)
        const [x0] = f.poly[0], x1 = f.poly[1][0]
        const a0 = (TAU * i) / n, a1 = (TAU * (i + 1)) / n
        const P0 = [R * Math.cos(a0), R * Math.sin(a0), 0], P1 = [R * Math.cos(a1), R * Math.sin(a1), 0]
        const ux = (P1[0] - P0[0]) / (x1 - x0), uy = (P1[1] - P0[1]) / (x1 - x0)
        const nx = Math.cos((a0 + a1) / 2), ny = Math.sin((a0 + a1) / 2)
        const tx = P0[0] - ux * x0, ty = P0[1] - uy * x0
        parts.push(k(k(c.extrude(t)).transform([ux, uy, 0, 0, 0, 1, nx, ny, 0, tx, ty, 0])))
      } else if (f.tri3) {
        // octahedron face: a thin plate on the triangle, sparks shown as dimples would be too fine; plain plate
        const [A, B, C] = f.tri3
        const pts = [A, B, C].map((q) => k(k(Manifold.sphere(t / 2, 6)).translate(q)))
        parts.push(k(Manifold.hull(pts)))
      }
    }
    if (kind === 'tube') {
      const { Dm, L } = pat.tube
      for (const z of [0, L - t]) parts.push(k(k(Manifold.cylinder(t, Dm / 2 - 1.2, Dm / 2 - 1.2, 48)).translate([0, 0, z])))
      parts.push(k(k(k(k(k(CrossSection.circle(5, 24)).subtract(k(CrossSection.circle(3, 24)))).extrude(3)).rotate([90, 0, 0])).translate([0, 1.5, L + 9]))) // eye bolt
    }
    let cage = k(Manifold.union(parts))
    const bb = cage.boundingBox()
    const ctr = bb.min.map((v, i) => (v + bb.max[i]) / 2)
    cage = k(cage.translate([-ctr[0], -ctr[1], -ctr[2]]))
    // coals inside, to glow when the lights are off
    const coals = []
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const span = pat.size.map((v) => v * 0.32)
    for (let i = 0; i < 26; i++) coals.push(k(k(Manifold.sphere(Math.min(...pat.size) * 0.09 * (0.7 + rnd() * 0.6), 8)).translate([(rnd() - 0.5) * 2 * span[0], (rnd() - 0.5) * 2 * span[1], (rnd() - 0.5) * 2 * span[2]])))
    const meshes = { combined: meshData(cage), kevlar: meshData(k(Manifold.union(coals))) }
    const coalG = (pat.vol / 1000) * 0.45 // crushed shisha charcoal, loosely packed
    const sparks = pat.holes.filter((h) => h.kind === 'spark').length
    const outline = flat.toPolygons()
    return {
      cage: { kind, sparks, coalG, size: pat.size, holes: pat.holes, flatW: flat.bounds().max[0] - flat.bounds().min[0], flatH: flat.bounds().max[1] - flat.bounds().min[1] },
      meshes,
      viewR: Math.min(59, Math.max(...pat.size) * 0.55),
      polygons: { base: outline, relief: [], pods: [], weak: [] },
      layers: {
        cut: outline,
        holes: pat.holes.filter((h) => h.r >= t * 0.9 && h.r * 2 >= 1.5),
        drill: pat.holes.filter((h) => !(h.r >= t * 0.9 && h.r * 2 >= 1.5)),
        pocket: [], pocketDepth: 0, engrave: [],
        bend: pat.bends,
      },
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: g, gramsTotal: g, warns, height: pat.size[2], thick: t },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function cageDesigns() {
  const d = (id, name, kind, blurb) => ({
    id, name, group: 'SparkCages', blurb, cage: true, kind, cncOnly: true, added: '2026-11-20',
    cnc: { material: 'ss304', process: 'laser', thick: kind === 'cube' ? 1 : 1.2 },
    params: [...CAGE_PARAMS[kind].map((x) => ({ ...x })), ...PERF_PARAMS.map((x) => ({ ...x }))],
    draw: () => {},
  })
  return [
    d('cageBox', 'Spark Box (staff)', 'box', 'A perforated steel box for the end of a staff: fill it with crushed charcoal, light it, and every spin throws a shower of sparks out of the holes. Cut flat from stainless, folded and riveted, with a bolt-down lid for loading and a floor that bolts to the staff.'),
    d('cageTube', 'Spark Tube (rope dart)', 'tube', 'A perforated steel tube for a rope dart: rolled from one flat sheet, with bolt-on end caps (open one to load coal) and an M8 eye bolt for the rope.'),
    d('cageDiamond', 'Spark Diamond', 'diamond', 'An eight-sided steel diamond for a rope dart or bolas: one flat cut piece folds into an octahedron, stitched shut with stainless wire (leave one seam as the loading door), a shackle at the top point for the rope.'),
    d('cageCube', 'Spark Cubes (dragon staff)', 'cube', 'Small perforated cubes that bolt onto the 8 mm spoke tips of a fire spoke hub in place of wicks: a dragon staff that throws sparks instead of flames. Cut one per spoke.'),
  ]
}
