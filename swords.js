/**
 * Fire contact swords: one flat plate cut from metal sheet (laser, waterjet or
 * plasma): blade, crossguard, a full-tang handle and a pommel, all one piece.
 * Fire comes from Kevlar: tape wrapped round tabs at the tip and along the
 * edges and bolted through, or a Kevlar rope laced through slots down the blade.
 *
 * Made for contact: every edge and the tip are round (it rolls on your arms and
 * shoulders, it does not cut), and the forge works out the balance point with
 * wet wicks on and how much weight the pommel needs to bring it back to the
 * guard. Metal only: never printed, never plastic.
 *
 * Units mm. The blade runs along +x from the guard (x = 0), the handle along -x;
 * the plate lies in x, y and is `thick` deep in z.
 */
const KEVLAR = 1.44 * 0.6 // woven Kevlar tape, g/cm³
const WET = 1.3 // fuel soaked in, spun off
const ROPE_G_PER_M = { 6: 25, 8: 42, 10: 62, 12: 90 } // braided Kevlar rope, about

export const SWORD_WICKS = ['tip and edges', 'tip only', 'edges only', 'Kevlar rope down the blade']
export const SWORD_PARAMS = [
  { key: 'bladeL', label: 'Blade length', unit: 'mm', min: 350, max: 900, step: 5, value: 620 },
  { key: 'bladeW', label: 'Blade width', unit: 'mm', min: 25, max: 80, step: 1, value: 44 },
  { key: 'handleL', label: 'Handle', unit: 'mm', min: 120, max: 320, step: 5, value: 210, hint: 'Two hands: 250 mm or more.' },
  { key: 'guardW', label: 'Crossguard', unit: 'mm', min: 50, max: 180, step: 1, value: 120 },
  { key: 'wicks', label: 'Fire', options: SWORD_WICKS, value: 'tip and edges', rerender: true, hint: 'Tabs: wrap 2" Kevlar tape round each tab and bolt through. Rope: lace 10 mm Kevlar rope in and out of the slots down the middle of the blade, both ends wired to the end holes.' },
  { key: 'perEdge', showIf: (p) => p.wicks === 'tip and edges' || p.wicks === 'edges only', label: 'Wicks per edge', unit: '', min: 1, max: 5, step: 1, value: 1, hint: '1 per edge plus the tip makes 3 wicks; 2 per edge makes 5.' },
  { key: 'wickW', showIf: (p) => !p.wicks.startsWith('Kevlar rope'), label: 'Wick tape', unit: 'mm', min: 25, max: 75, step: 1, value: 50, presets: [25, 38, 50], hint: 'Tape width: 50 mm is 2". The tab pad is this long.' },
  { key: 'tabW', showIf: (p) => !p.wicks.startsWith('Kevlar rope'), label: 'Tab width', unit: 'mm', min: 14, max: 40, step: 1, value: 22 },
  { key: 'neck', showIf: (p) => !p.wicks.startsWith('Kevlar rope'), label: 'Tab neck', unit: 'mm', min: 10, max: 60, step: 1, value: 22, hint: 'Keeps the flame off the blade edge and your hands.' },
  { key: 'tapeLen', showIf: (p) => !p.wicks.startsWith('Kevlar rope'), label: 'Tape per wick', unit: 'mm', min: 150, max: 700, step: 10, value: 380 },
  { key: 'ropeD', showIf: (p) => p.wicks.startsWith('Kevlar rope'), label: 'Rope', unit: 'mm', min: 6, max: 12, step: 2, value: 10, hint: 'Braided Kevlar rope for the laced blade.' },
  { key: 'pommel', label: 'Pommel weight', options: ['balance it for me', 'none'], value: 'balance it for me', hint: 'Steel washers or discs bolted through the pommel on an M8 bolt, so the sword balances a hand in front of the guard: it rolls round your body under control.' },
]

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

// the blade's centre line and half-width at t (0 at the guard, 1 at the tip)
function bladeShape(style, L, W, t, p) {
  const taper = (t0) => (t < t0 ? 1 : Math.max(0, (1 - t) / (1 - t0)) ** 0.8)
  if (style === 'scimitar') {
    const c = (p.curve ?? 12) / 100
    return { y: -c * L * t * t, hw: (W / 2) * (0.8 + 0.45 * t) * taper(0.82) }
  }
  if (style === 'leaf') return { y: 0, hw: (W / 2) * (0.7 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7) * taper(0.86) }
  if (style === 'flame') return { y: 0, hw: (W / 2) * (1 + 0.16 * Math.sin(t * 2 * Math.PI * (p.waves ?? 5))) * (0.75 + 0.25 * (1 - t)) * taper(0.86) }
  return { y: 0, hw: (W / 2) * (1 - 0.18 * t) * taper(0.86) }
}

export function buildSword(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const style = opts.style || 'broad'
    const mat = opts.mat || { name: 'Aluminium 6061-T6', density: 2.7, kind: 'metal' }
    const T = opts.thick || 5
    const warns = []
    const L = p.bladeL, W = p.bladeW
    // blade outline: up one edge, round the tip, back down the other
    const N = 120, up = [], dn = [], cl = []
    for (let i = 0; i <= N; i++) {
      const t = i / N, x = t * L, s = bladeShape(style, L, W, t, p)
      const t2 = Math.min(1, t + 1 / N), s2 = bladeShape(style, L, W, t2, p)
      const dx = (t2 - t) * L || 1, dy = s2.y - s.y || 0, l = Math.hypot(dx, dy) || 1
      const nx = -dy / l, ny = dx / l
      cl.push({ x, y: s.y, nx, ny, hw: s.hw, t })
      up.push([x + nx * s.hw, s.y + ny * s.hw])
      dn.push([x - nx * s.hw, s.y - ny * s.hw])
    }
    const blade = [[-2, -W / 2 + 1], ...dn.slice(0, -1), ...up.slice(0, -1).reverse(), [-2, W / 2 - 1]].reverse()
    const gT = 18, tangW = Math.min(30, W * 0.7)
    const pomR = Math.max(20, tangW * 0.8), pomX = -gT - p.handleL - pomR * 0.55
    const shapes = [
      blade,
      [[-gT, -p.guardW / 2], [0, -p.guardW / 2], [0, p.guardW / 2], [-gT, p.guardW / 2]],
      [[-gT - p.handleL - 2, -tangW / 2], [-gT + 1, -tangW / 2], [-gT + 1, tangW / 2], [-gT - p.handleL - 2, tangW / 2]],
    ]
    const ccwP = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length]; a += x1 * y2 - x2 * y1 } return a < 0 ? [...P].reverse() : P }
    let plate = k(new CrossSection(shapes.map(ccwP), 'NonZero'))
    plate = k(plate.add(k(k(CrossSection.circle(pomR, 64)).translate([pomX, 0]))))

    // wick tabs: a neck out from the edge, a pad the tape wraps round, 2 bolts through the pad
    const fire = p.wicks
    const tabs = [] // {x, y, ux, uy}: base point on the edge, outward direction
    const tapeT = 2.5, bolt = 5.3 / 2
    if (fire === 'tip and edges' || fire === 'tip only') {
      const a = cl[N - 1], b = cl[N], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy)
      tabs.push({ x: b.x, y: b.y, ux: dx / l, uy: dy / l, tip: true })
    }
    if (fire === 'tip and edges' || fire === 'edges only') {
      for (let i = 0; i < p.perEdge; i++) {
        const t = 0.3 + (0.52 * (i + 0.5)) / p.perEdge, c = cl[Math.round(t * N)]
        for (const side of [1, -1]) tabs.push({ x: c.x + side * c.nx * c.hw, y: c.y + side * c.ny * c.hw, ux: side * c.nx, uy: side * c.ny })
      }
    }
    const holes = [], tabPolys = [], wickBoxes = []
    for (const tb of tabs) {
      const vx = -tb.uy, vy = tb.ux
      const at = (u, v) => [tb.x + tb.ux * u + vx * v, tb.y + tb.uy * u + vy * v]
      const nw = Math.max(10, p.tabW * 0.55)
      tabPolys.push([at(-4, -nw / 2), at(p.neck, -nw / 2), at(p.neck, -p.tabW / 2), at(p.neck + p.wickW, -p.tabW / 2), at(p.neck + p.wickW, p.tabW / 2), at(p.neck, p.tabW / 2), at(p.neck, nw / 2), at(-4, nw / 2)])
      for (const f of [0.3, 0.7]) { const [hx, hy] = at(p.neck + p.wickW * f, 0); holes.push({ x: hx, y: hy, r: bolt }) }
      wickBoxes.push({ c: at(p.neck + p.wickW / 2, 0), ang: Math.atan2(tb.uy, tb.ux) })
    }
    if (tabPolys.length) plate = k(plate.add(k(new CrossSection(tabPolys.map(ccwP), 'NonZero'))))
    // round every corner: it is a contact prop, and the tip must be blunt
    plate = k(k(k(plate.offset(-3, 'Round', 2, 16)).offset(6, 'Round', 2, 16)).offset(-3, 'Round', 2, 16))

    // holes: handle scale rivets, pommel weight bolt, lanyard; rope slots down the blade
    for (const f of [0.2, 0.5, 0.8]) holes.push({ x: -gT - p.handleL * f, y: 0, r: 2.6 })
    holes.push({ x: pomX, y: 0, r: 4.3 })
    holes.push({ x: pomX - pomR * 0.55, y: 0, r: 2.5 })
    const slots = []
    let rope = null
    if (fire.startsWith('Kevlar rope')) {
      const sw = p.ropeD + 1, sl = p.ropeD * 1.6, pitch = p.ropeD * 3.2
      const t0 = 0.22, t1 = 0.95
      let n = 0
      for (let x = t0 * L; x <= t1 * L; x += pitch) {
        const c = cl[Math.round((x / L) * N)]
        if (c.hw < sw / 2 + 5) break
        const ang = Math.atan2(c.ny, c.nx) - Math.PI / 2
        const sq = k(k(CrossSection.square([sl, sw], true)).rotate((ang * 180) / Math.PI))
        slots.push(k(sq.translate([c.x, c.y])))
        n++
      }
      const ropeLen = n * pitch * 1.25 + 300 // woven over and under, plus both tie-off ends
      rope = { n, len: ropeLen, g: (ropeLen / 1000) * (ROPE_G_PER_M[p.ropeD] || 62) }
      if (n < 6) warns.push('The blade is too narrow for rope slots: make it wider or use tabs.')
      // tie-off holes at each end of the run
      const a = cl[Math.round(t0 * N) - 3], b = cl[Math.min(N - 4, Math.round(t1 * N) + 2)]
      holes.push({ x: a.x, y: a.y, r: 2 }, { x: b.x, y: b.y, r: 2 })
    }
    let cut = plate
    if (slots.length) cut = k(cut.subtract(k(CrossSection.union(slots))))
    cut = k(cut.subtract(k(CrossSection.union(holes.map((h) => k(k(CrossSection.circle(h.r, 24)).translate([h.x, h.y])))))))

    // weights and balance (x of the centre of mass, from the guard face)
    const solid = k(cut.extrude(T))
    const plateG = (solid.volume() / 1000) * mat.density
    const box = solid.boundingBox()
    const meshP = meshData(solid)
    let cx = 0, V = 0
    { const P = meshP.positions, I = meshP.indices
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t] * 3, b = I[t + 1] * 3, d = I[t + 2] * 3
        const v = (P[a] * (P[b + 1] * P[d + 2] - P[b + 2] * P[d + 1]) - P[a + 1] * (P[b] * P[d + 2] - P[b + 2] * P[d]) + P[a + 2] * (P[b] * P[d + 1] - P[b + 1] * P[d])) / 6
        V += v; cx += (v * (P[a] + P[b] + P[d])) / 4
      } cx /= V }
    const wickDry = (p.tapeLen * p.wickW * tapeT / 1000) * KEVLAR
    const wickWet = wickDry * WET
    let fireG = 0, fireX = 0
    if (rope) { fireG = rope.g * WET; fireX = (0.22 + 0.95) / 2 * L }
    else if (tabs.length) { fireG = wickWet * tabs.length; fireX = wickBoxes.reduce((s, w) => s + w.c[0], 0) / wickBoxes.length }
    const handleG = 2 * (p.handleL * tangW * 6 / 1000) * 0.7 // two wooden scales
    const handleX = -gT - p.handleL / 2
    const target = Math.min(90, L * 0.15) // balance this far in front of the guard
    let pomG = 0
    const mom = plateG * cx + fireG * fireX + handleG * handleX
    const totNoPom = plateG + fireG + handleG
    if (p.pommel !== 'none') pomG = Math.max(0, (mom - target * totNoPom) / (target - pomX))
    const total = totNoPom + pomG
    const balance = (mom + pomG * pomX) / total
    if (pomG > 600) warns.push(`It needs ${pomG.toFixed(0)} g at the pommel to balance: try a shorter or narrower blade, thinner sheet, or fewer wicks.`)
    if (mat.kind !== 'metal') warns.push('Fire swords are metal only.')
    if (T < 3 && mat.density < 4) warns.push('Aluminium under 3 mm bends: use 4–6 mm aluminium, or 2–3 mm steel.')
    if (L + p.handleL + gT + 2 * pomR > 1250) warns.push('Over 1.25 m long: check the cutting shop takes sheet that long.')

    // the view: the plate, Kevlar wicks wrapped on the tabs (or the rope laced through), a steel pommel stack
    const meshes = { combined: meshData(k(solid.translate([0, 0, -T / 2]))) }
    const kev = []
    const wrap = Math.min(14, (p.tapeLen * tapeT) / (2 * (p.tabW + T)) + 2)
    for (const w of wickBoxes) {
      const bx = k(k(k(Manifold.cube([p.wickW, p.tabW + 2 * wrap, T + 2 * wrap], true)).rotate([0, 0, (w.ang * 180) / Math.PI])).translate([w.c[0], w.c[1], 0]))
      kev.push(bx)
    }
    if (rope) {
      for (let i = 0; i < slots.length - 1; i++) {
        const a = cl[Math.round(((0.22 * L + i * p.ropeD * 3.2) / L) * N)], b = cl[Math.round(((0.22 * L + (i + 1) * p.ropeD * 3.2) / L) * N)]
        const z = (i % 2 ? 1 : -1) * (T / 2 + p.ropeD / 2)
        const s1 = k(k(Manifold.sphere(p.ropeD / 2, 12)).translate([a.x, a.y, -z * 0.2])), s2 = k(k(Manifold.sphere(p.ropeD / 2, 12)).translate([(a.x + b.x) / 2, (a.y + b.y) / 2, z]))
        const s3 = k(k(Manifold.sphere(p.ropeD / 2, 12)).translate([b.x, b.y, z * 0.2]))
        kev.push(k(Manifold.hull([s1, s2])), k(Manifold.hull([s2, s3])))
      }
    }
    if (kev.length) meshes.kevlar = meshData(k(Manifold.union(kev)))
    if (pomG > 0) {
      const disc = Math.PI * 15 ** 2 * 7.85 / 1000 // g per mm of a Ø30 steel stack
      const h = Math.min(40, pomG / disc / 2)
      meshes.rods = meshData(k(k(Manifold.cylinder(2 * h + T, 15, 15, 32)).translate([pomX, 0, -h - T / 2])))
    }
    // the DXF: the outline and the rope slots on CUT, the round holes as true circles on HOLES
    const outline = slots.length ? k(plate.subtract(k(CrossSection.union(slots)))) : plate
    const layers = { cut: outline.toPolygons(), holes, drill: [], pocket: [], pocketDepth: 0, engrave: [] }
    return {
      sword: {
        style, mat: mat.name, T, L, total, plateG, fireG, handleG, pomG, balance, target, pomX,
        tabs: tabs.length, wickDry, wickWet, rope, tapeTotal: tabs.length * p.tapeLen,
        length: box.max[0] - box.min[0], width: box.max[1] - box.min[1],
      },
      meshes,
      viewR: (box.max[0] - box.min[0]) * 0.62,
      polygons: { base: cut.toPolygons(), relief: [], pods: [], weak: [] },
      layers,
      cnc: true,
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: total, gramsTotal: total, warns, height: T },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function swordDesigns() {
  const d = (id, name, style, blurb, over = {}, extra = []) => ({
    id, name, group: 'Swords', blurb, sword: true, cncOnly: true, style, added: '2026-11-21',
    cnc: { material: 'al6061', thick: 5 },
    params: [...SWORD_PARAMS.map((x) => ({ ...x, ...(over[x.key] !== undefined ? { value: over[x.key] } : {}) })), ...extra],
    draw: () => {},
  })
  return [
    d('swordBroad', 'Fire Broadsword', 'broad', 'A straight, double-edged fire contact sword cut from one plate: blade, crossguard, full-tang handle and pommel. Kevlar wicks on tabs at the tip and along both edges, every edge round so it rolls on the body.'),
    d('swordScimitar', 'Fire Scimitar', 'scimitar', 'A curved fire contact sword that widens towards the tip, wicked along both edges and at the point. The curve makes it roll and flow off the arms.', { bladeL: 600, bladeW: 46 }, [{ key: 'curve', label: 'Curve', unit: '%', min: 0, max: 25, step: 1, value: 12 }]),
    d('swordFlame', 'Flame Blade', 'flame', 'A wavy flame-edged blade: the waves throw the light as it spins, and the flames from the wicks follow the edge.', { bladeL: 640, bladeW: 46 }, [{ key: 'waves', label: 'Waves', unit: '', min: 2, max: 9, step: 1, value: 5 }]),
    d('swordLeaf', 'Leaf Blade', 'leaf', 'A short, wide leaf-shaped blade, light and quick in the hand: easy to learn contact moves with. Kevlar rope laced down the blade, or tabs.', { bladeL: 480, bladeW: 56, wicks: 'Kevlar rope down the blade', perEdge: 1 }),
  ]
}
