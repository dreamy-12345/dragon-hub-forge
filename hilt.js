/**
 * The hilt connector on its own: the four-way block at the heart of a tube fire
 * sword (handle below, blade above, a guard arm each side), to 3D print (PETG or
 * nylon, for practice and LED swords) or to have machined in aluminium (fire).
 *
 * Three ways for the tubes to lock in:
 *   through-bolt   the tube goes straight in, an M5 bolt through block and tube
 *   pole inserts   a plug is glued and riveted into each tube end; its spigot goes
 *                  into the socket and an M5 grub screw drops into a groove round
 *                  it, so tubes come out with an allen key and are never drilled
 *                  near the block
 *   twist-lock     the insert's spigot has two pins; push in, twist a quarter turn
 *                  and it locks in an L-slot, no tools (printed swords)
 * Units mm; z along the sword (blade up), guards along x.
 */
export const HILT_PARAMS = [
  { key: 'poleOD', label: 'Handle pole', unit: 'mm', min: 12, max: 32, step: 0.1, value: 22, presets: [19, 22, 25.4] },
  { key: 'poleWall', label: 'Handle pole wall', unit: 'mm', min: 0.8, max: 4, step: 0.05, value: 1.5 },
  { key: 'bladeOD', label: 'Blade tube', unit: 'mm', min: 10, max: 25.4, step: 0.1, value: 16, presets: [12, 16, 19] },
  { key: 'bladeWall', label: 'Blade tube wall', unit: 'mm', min: 0.8, max: 3, step: 0.1, value: 1.5 },
  { key: 'guardOD', label: 'Guard tubes', unit: 'mm', min: 8, max: 22, step: 0.1, value: 16, presets: [12, 16] },
  { key: 'guardWall', label: 'Guard tube wall', unit: 'mm', min: 0.8, max: 3, step: 0.1, value: 1.5 },
  { key: 'guardTilt', label: 'Guard sockets tilt', unit: '°', min: 0, max: 35, step: 1, value: 10, hint: 'Angles the guard sockets up towards the blade, so straight or gently bent arms rise like a swept guard.' },
  { key: 'lock', label: 'Tubes lock in by', options: ['M5 bolt through block and tube', 'pole inserts with a grub screw', 'pole inserts with a twist-lock'], value: 'pole inserts with a grub screw', rerender: true, hint: 'Inserts: a plug glued and riveted into each tube end locks into the block, so the tubes come out without drilling near the hilt. Twist-lock needs no tools.' },
  { key: 'wall', label: 'Block wall', unit: 'mm', min: 3, max: 8, step: 0.5, value: 4.5, hint: 'Material round each socket. Printed: 5 mm or more.' },
]

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

export function buildHilt(wasm, p, opts = {}) {
  const { Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const warns = []
    const dens = opts.density || 1.27
    const lockKind = (p.lock || '').startsWith('M5') ? 'bolt' : (p.lock || '').includes('twist') ? 'twist' : 'grub'
    const inserts = lockKind !== 'bolt'
    const w = p.wall
    // what goes in each socket: the tube itself, or an insert's spigot (a little under the tube's outside)
    const sock = (od) => (inserts ? od - 2 : od) / 2 + 0.12
    const tubes = { handle: { od: p.poleOD, wall: p.poleWall }, blade: { od: p.bladeOD, wall: p.bladeWall }, guard: { od: p.guardOD, wall: p.guardWall } }
    const c = Math.max(p.poleOD, p.bladeOD, p.guardOD) + 2 * w
    const depth = { handle: 36, blade: 30, guard: 26 }
    const tilt = p.guardTilt
    // each socket: [name, direction in degrees from +z towards +x]
    const S = [['handle', 180], ['blade', 0], ['guard', 90 - tilt], ['guard', -(90 - tilt)]]
    const along = (r, len, phi, z0 = 0, n = 48) => k(k(k(Manifold.cylinder(len, r, r, n)).translate([0, 0, z0])).rotate([0, phi, 0]))
    let block = k(k(Manifold.cube([c, c * 0.85, c], true)).intersect(k(Manifold.sphere(c * 0.74, 64))))
    const bosses = [], cuts = [], anim = [], meshesExtra = {}
    for (const [name, phi] of S) {
      const t = tubes[name], rs = sock(t.od), d = depth[name]
      bosses.push(along(rs + w, d + c / 2 - 2, phi, 0, 64))
      cuts.push(along(rs, d + 1, phi, c / 2 - 1, 64))
      // a chamfer at the mouth
      cuts.push(k(k(k(Manifold.cylinder(1.2, rs, rs + 1.2, 48)).translate([0, 0, c / 2 + d - 2 - 0.01 + 0.8])).rotate([0, phi, 0])))
      const mid = c / 2 - 1 + d * 0.55
      if (lockKind === 'bolt' || lockKind === 'grub') {
        // a hole square across the socket (y): bolt clearance, or tapped M5 for the grub screw from one side
        const hole = k(k(k(k(Manifold.cylinder(lockKind === 'bolt' ? c + 20 : c / 2 + 10, lockKind === 'bolt' ? 2.7 : 2.1, lockKind === 'bolt' ? 2.7 : 2.1, 20)).rotate([90, 0, 0])).translate([0, lockKind === 'bolt' ? c / 2 + 10 : 0, mid])).rotate([0, phi, 0]))
        cuts.push(hole)
      } else {
        // twist-lock: two L-slots in the socket wall, in from the mouth then a quarter turn round
        for (const s of [0, 180]) {
          const ax = k(k(k(k(Manifold.cube([3.4, rs + w, d * 0.55 + 1], false)).translate([-1.7, 0, c / 2 + d * 0.45 - 1])).rotate([0, 0, s])).rotate([0, phi, 0]))
          const arc = []
          for (let a = 0; a <= 90; a += 10) arc.push(k(k(k(k(Manifold.cube([3.4, rs + w, 3.6], false)).translate([-1.7, 0, c / 2 + d * 0.45])).rotate([0, 0, s + a])).rotate([0, phi, 0])))
          cuts.push(ax, k(Manifold.union(arc)))
        }
      }
    }
    block = k(k(Manifold.union([block, ...bosses])).subtract(k(Manifold.union(cuts))))
    const g = (block.volume() / 1000) * dens
    // the inserts: a plug into the tube (glued and riveted), a collar on the tube end, a spigot into the block
    const ins = {}
    if (inserts) for (const name of ['handle', 'blade', 'guard']) {
      const t = tubes[name], ri = t.od / 2 - t.wall - 0.1, rs = sock(t.od) - 0.12, d = depth[name]
      if (ri < 3) { warns.push(`The ${name} tube is too small inside for an insert.`); continue }
      let m = k(Manifold.union([k(k(Manifold.cylinder(30, ri, ri, 48)).translate([0, 0, -30])), k(Manifold.cylinder(3, t.od / 2, t.od / 2, 48)), k(k(Manifold.cylinder(d - 1, rs - 0.12, rs - 0.12, 48)).translate([0, 0, 3]))]))
      m = k(m.subtract(k(k(k(Manifold.cylinder(2 * t.od, 1.65, 1.65, 16)).rotate([90, 0, 0])).translate([0, t.od, -15])))) // rivet hole across
      for (let gz = -24; gz <= -6; gz += 9) m = k(m.subtract(k(k(Manifold.cylinder(1.2, ri + 1, ri + 1, 32)).translate([0, 0, gz])).subtract(k(k(Manifold.cylinder(3, ri - 0.6, ri - 0.6, 32)).translate([0, 0, gz - 1]))))) // glue grooves
      const lockZ = 3 + (d * 0.55 - 2) // where the grub screw or the pins land, up the spigot
      if (lockKind === 'grub') m = k(m.subtract(k(k(Manifold.cylinder(3.2, rs + 1, rs + 1, 48)).translate([0, 0, lockZ - 1.6])).subtract(k(k(Manifold.cylinder(5, rs - 1.2, rs - 1.2, 48)).translate([0, 0, lockZ - 2.5])))))
      else for (const s of [1, -1]) m = k(m.add(k(k(k(Manifold.cylinder(2.6, 1.5, 1.5, 16)).rotate([0, 90, 0])).translate([s > 0 ? rs - 0.4 : -rs - 2.2, 0, lockZ]))))
      ins[name] = m
    }
    // ---- the view: block, tubes and inserts sliding in (How it works)
    const meshes = { combined: meshData(block) }
    for (const [name, phi] of S) {
      const t = tubes[name], d = depth[name], z0 = inserts ? c / 2 + d + 1 : c / 2 - 1
      const key = `anim${name}${phi}`.replace(/\W/g, '')
      const len = name === 'handle' ? 120 : name === 'blade' ? 140 : 90
      const tube = k(k(k(Manifold.cylinder(len, t.od / 2, t.od / 2, 32)).subtract(k(k(Manifold.cylinder(len + 2, t.od / 2 - t.wall, t.od / 2 - t.wall, 32)).translate([0, 0, -1])))).translate([0, 0, z0]))
      meshes[key] = meshData(k(tube.rotate([0, phi, 0])))
      const dir = [Math.sin((phi * Math.PI) / 180) * 60, 0, Math.cos((phi * Math.PI) / 180) * 60]
      anim.push({ key, dir, look: 'ghost' })
      if (inserts && ins[name]) {
        const ik = key + 'i'
        meshes[ik] = meshData(k(k(k(ins[name].rotate([180, 0, 0])).translate([0, 0, c / 2 + d + 1])).rotate([0, phi, 0]))) // spigot in the socket, collar on the mouth
        anim.push({ key: ik, dir: dir.map((v) => v * 0.8), look: 'part', lead: 1.2 })
      }
    }
    // the inserts laid flat for printing (or the machinist), spigot up
    for (const [name, m] of Object.entries(ins)) { const b = m.boundingBox(); meshes[`ins_${name}`] = meshData(k(m.translate([0, 0, -b.min[2]]))) }
    const fl = k(block.rotate([90, 0, 0])); const fb = fl.boundingBox()
    meshes.connFlat = meshData(k(fl.translate([0, 0, -fb.min[2]])))
    if (opts.printed && lockKind === 'bolt') warns.push('A printed block with through-bolts: use PETG or nylon at 100% infill, and big washers.')
    if (opts.printed && w < 5) warns.push('Printed: give it 5 mm of wall or more.')
    return {
      hilt: { lockKind, inserts, g, c, depth, sockets: Object.fromEntries(Object.entries(tubes).map(([n, t]) => [n, 2 * sock(t.od)])), insertNames: Object.keys(ins) },
      anim,
      meshes,
      viewR: c * 2.2,
      polygons: { base: [[[-c / 2, -c / 2], [c / 2, -c / 2], [c / 2, c / 2], [-c / 2, c / 2]]], relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null, cnc: !opts.printed,
      stats: { tris: meshes.combined.indices.length / 3, grams: g, gramsTotal: g, warns, height: c },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function hiltDesigns() {
  return [{
    id: 'hiltConnector', name: 'Hilt Connector', group: 'TubeSwords', added: '2026-11-22', hilt: true, cnc: { material: 'al6061' },
    blurb: 'The four-way block that holds a tube fire sword together, on its own: handle pole below, blade above, a guard arm each side. 3D print it in PETG or nylon, or switch to CNC and have it machined in aluminium. Lock the tubes with through-bolts, or with pole inserts that click in with a grub screw or a twist-lock. Press How it works to see it go together.',
    params: HILT_PARAMS.map((x) => ({ ...x })),
    draw: () => {},
  }]
}
