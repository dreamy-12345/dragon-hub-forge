/**
 * Pole inserts: a sleeve that slides INSIDE a hollow carbon (or aluminium) pole
 * where a hub clamps on, so grub screws and clamps press on something solid
 * instead of crushing the tube wall. Prints standing up, no supports.
 * Units mm, the pole runs along z.
 */
export const SLEEVE_PARAMS = [
  { key: 'poleOD', label: 'Pole outside', unit: 'mm', min: 10, max: 40, step: 0.1, value: 22, presets: [13, 16, 22], hint: 'The same pole size the hub is made for.' },
  { key: 'poleWall', label: 'Pole wall', unit: 'mm', min: 0.5, max: 5, step: 0.05, value: 1.5, hint: 'Measure the tube wall, or work it out: (outside − inside) ÷ 2. Carbon dragon staff tube is often 1–2 mm.' },
  { key: 'sClear', label: 'Slide fit', unit: 'mm', min: -0.3, max: 0.6, step: 0.05, value: 0.15, hint: 'Gap between the sleeve and the inside of the pole. The ribs take up the slack; lower it if it rattles.' },
  { key: 'length', label: 'Length', unit: 'mm', min: 20, max: 200, step: 1, value: 60, hint: 'Longer than the hub collar or spoke hub, so every screw lands on it, with 10 mm spare each side.' },
  { key: 'sRibs', label: 'Grip ribs', unit: '', min: 0, max: 12, step: 1, value: 6 },
  { key: 'pull', label: 'Pull-string hole', options: ['on', 'off'], value: 'on', hint: 'A cross hole at one end: tie a string through it to pull the sleeve along the pole to where the hub sits, and to get it out again.' },
]

export function buildSleeve(wasm, p, opts = {}) {
  const { Manifold, CrossSection } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const id = p.poleOD - 2 * p.poleWall
    const R = (id - p.sClear) / 2
    const L = p.length
    const style = opts.style || 'solid'
    const warns = []
    if (R < 3) warns.push('The pole wall is too thick for an insert: measure the inside of the pole.')
    // a rod with lead-in chamfers at both ends, so it slides in without catching
    const ch = Math.min(1, R * 0.2)
    let m = k(k(new CrossSection([[[0, 0], [R - ch, 0], [R, ch], [R, L - ch], [R - ch, L], [0, L]]], 'Positive')).revolve(96))
    if (style === 'light') {
      // a tube with a cross of webs: stiff against crushing, a third of the weight
      const wall = Math.max(1.6, R * 0.22)
      let core = k(k(Manifold.cylinder(L + 2, R - wall, R - wall, 64)).translate([0, 0, -1]))
      const web = Math.max(1.4, R * 0.16)
      for (const a of [0, 90]) core = k(core.subtract(k(k(Manifold.cube([2 * R, web, L + 4], true)).translate([0, 0, L / 2])).rotate([0, 0, a])))
      m = k(m.subtract(core))
    } else if (style === 'cored') {
      const hole = Math.max(0, R - Math.max(2.4, R * 0.35))
      if (hole > 1.5) m = k(m.subtract(k(k(Manifold.cylinder(L + 2, hole, hole, 48)).translate([0, 0, -1]))))
    }
    // grip ribs: thin and crushable, they take up the slide fit
    if (p.sRibs > 0) {
      const ribs = []
      for (let i = 0; i < p.sRibs; i++) ribs.push(k(k(k(Manifold.cube([0.9, 1.6, L - 6], true)).translate([R + p.sClear / 2 + 0.05, 0, L / 2])).rotate([0, 0, (360 * i) / p.sRibs])))
      m = k(m.add(k(Manifold.union(ribs))))
    }
    if (p.pull === 'on') m = k(m.subtract(k(k(k(Manifold.cylinder(4 * R, 1.3, 1.3, 16)).rotate([90, 0, 0])).translate([0, 2 * R, 6]))))
    const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
    const positions = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
    const data = { positions, indices: Uint32Array.from(mesh.triVerts) }
    const g = (m.volume() / 1000) * (opts.density || 1.27)
    const circle = []
    for (let i = 0; i < 64; i++) circle.push([R * Math.cos((i / 64) * Math.PI * 2), R * Math.sin((i / 64) * Math.PI * 2)])
    return {
      sleeve: { id, od: 2 * R, L, style },
      meshes: { combined: data },
      viewR: Math.max(L * 0.6, R * 2),
      polygons: { base: [circle], relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null,
      stats: { tris: data.indices.length / 3, grams: g, gramsTotal: g, warns, height: L },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function sleeveDesigns() {
  const s = (id, name, style, blurb, len) => ({
    id, name, group: 'Sleeves', blurb, sleeve: true, style, added: '2026-11-20',
    params: SLEEVE_PARAMS.map((d) => ({ ...d, ...(d.key === 'length' && len ? { value: len } : {}) })),
    draw: () => {},
  })
  return [
    s('sleeveSolid', 'Pole Insert', 'solid', 'Slides inside a hollow carbon pole where the hub clamps on, so grub screws, set screws and clamps press on something solid instead of crushing the tube. Solid: the strongest, for fire spoke hubs and metal hubs with screws.', 60),
    s('sleeveLight', 'Light Pole Insert', 'light', 'The pole insert as a tube with a cross of webs inside: still stops a clamp crushing the pole, at about a third of the weight. For printed hubs and snug collars.', 50),
    s('sleeveLong', 'Long Pole Insert', 'cored', 'A long insert with a small core hole, for long collars or two hubs close together: protects the whole stretch of pole under them.', 120),
  ]
}
