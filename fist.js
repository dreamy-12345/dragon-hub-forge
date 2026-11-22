/**
 * Monkey's fist heads: the sailor's knot that makes a solid ball of rope round a
 * core. In Kevlar rope it is a fire head; in soft cord, a practice one. Three sets
 * of the same number of turns, each set wrapped round the last, then worked tight
 * round the core one loop at a time.
 *
 * The forge works out the turns per set for the core and rope, the rope to cut,
 * the finished size and the weight (dry and fuelled), and can print a core: a
 * ball with a sealed steel-shot chamber, and on a staff end a socket for the pole.
 * Units mm; the head is centred on the origin, z along the staff or the rope.
 */
const ROPE_G_PER_M = { 4: 11, 5: 18, 6: 25, 8: 42, 10: 62, 12: 90 } // braided Kevlar rope, about
const SHOT = 4.6

export const FIST_PARAMS = [
  { key: 'ropeD', label: 'Rope', unit: 'mm', min: 4, max: 12, step: 1, value: 6, presets: [5, 6, 8, 10], hint: 'Kevlar rope for fire (6 mm and 10 mm are usual), any soft braided cord to practise with.' },
  { key: 'coreD', label: 'Core', unit: 'mm', min: 15, max: 80, step: 1, value: 38, hint: 'The ball inside. A steel ball for weight, a printed core with steel shot, or a rubber ball to practise.' },
  { key: 'turns', label: 'Turns per set', unit: '', min: 0, max: 10, step: 1, value: 0, hint: '0 = worked out for you from the core and rope. Each of the three sets gets this many turns.' },
  { key: 'core', label: 'Core is', options: ['steel ball (buy one)', 'printed core with steel shot', 'rubber or tennis ball (practice)'], value: 'steel ball (buy one)', rerender: true },
  { key: 'rope', label: 'Rope is', options: ['Kevlar (fire)', 'practice cord'], value: 'Kevlar (fire)' },
]

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

export function buildFist(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const use = opts.use || 'poi'
    const warns = []
    const d = p.ropeD, cR = p.coreD / 2
    const n = p.turns > 0 ? p.turns : Math.max(2, Math.round(p.coreD / d))
    const fin = p.coreD + 4 * d // two rope layers each side once it is tight
    const loopC = Math.PI * (p.coreD + 2 * d) // one turn
    const tails = use === 'staff' ? 2 * 350 : use === 'dart' || use === 'meteor' ? 2 * 450 : 2 * 300
    const ropeL = 3 * n * loopC * 1.05 + tails
    const cover = (n * d) / p.coreD
    if (cover < 0.75) warns.push(`${n} turns of ${d} mm rope leave the core showing: use ${Math.round(p.coreD / d)} turns, thicker rope, or a smaller core.`)
    if (cover > 1.35) warns.push(`${n} turns is a lot for this core: the knot will not close round it. Try ${Math.round(p.coreD / d)}.`)
    // ---- the knot, drawn as three bundles of rings round three axes, laid on the ball
    const ring = (R, r) => k(k(k(CrossSection.circle(r, 12)).translate([R, 0])).revolve(64))
    const rings = []
    const r = d / 2
    for (let set = 0; set < 3; set++) {
      const Rl = cR + r + set * 0.35 * r // each set sits a little over the last
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * d * 0.98
        const R = Math.sqrt(Math.max(1, Rl * Rl - off * off))
        let m = k(ring(R, r).translate([0, 0, off]))
        if (set === 0) m = k(m.rotate([0, 90, 0])) // round the x axis
        else if (set === 1) m = k(m.rotate([90, 0, 0])) // round the y axis
        rings.push(m)
      }
    }
    let knot = k(Manifold.union(rings))
    // ---- the core
    const rope = (p.rope || '').startsWith('Kevlar')
    const coreKind = (p.core || '').startsWith('printed') ? 'printed' : (p.core || '').startsWith('steel') ? 'steel' : 'rubber'
    let core = k(Manifold.sphere(cR - 0.2, 64))
    let coreG = 0, shotG = 0, pauseAt = null, socket = null
    const poleR = (p.poleOD || 22) / 2
    if (coreKind === 'steel') coreG = ((4 / 3) * Math.PI * cR ** 3 / 1000) * 7.85
    else if (coreKind === 'rubber') coreG = ((4 / 3) * Math.PI * cR ** 3 / 1000) * 0.35 // a hollow ball, about
    else {
      // printed: a ball standing on a flat foot, a sealed shot chamber, a pole socket on the staff end
      const wall = 2.4
      let pc = k(k(Manifold.sphere(cR, 64)).trimByPlane([0, 0, 1], -cR * 0.82))
      let chamberR = cR - wall
      if (use === 'staff') {
        socket = { r: poleR + 0.15, depth: Math.min(cR * 1.05, 35) }
        pc = k(pc.subtract(k(k(Manifold.cylinder(socket.depth + 1, socket.r, socket.r, 48)).translate([0, 0, -cR - 1]))))
        if (socket.r + wall > cR * 0.75) warns.push(`A ${p.poleOD} mm pole needs a core of at least ${Math.ceil((socket.r + wall) / 0.75) * 2} mm.`)
      }
      // chamber: the upper part of the ball, a 45° cone roof so it prints closed
      const zc0 = use === 'staff' ? -cR + socket.depth + 2.5 : -cR * 0.6
      const ch = k(k(Manifold.sphere(chamberR, 48)).trimByPlane([0, 0, 1], zc0))
      const roofZ = chamberR * 0.55
      const roof = k(k(Manifold.cylinder(chamberR + 1, chamberR + 1, 0.5, 48)).translate([0, 0, roofZ - 1]))
      const band = k(ch.trimByPlane([0, 0, -1], -roofZ))
      const chamber = k(band.add(k(roof.intersect(ch))))
      pc = k(pc.subtract(chamber))
      shotG = (band.volume() / 1000) * SHOT // filled to the start of the roof
      pauseAt = roofZ + cR * 0.82 - 0.3
      coreG = (pc.volume() / 1000) * (opts.density || 1.21)
      core = pc
    }
    const ropeG = (ropeL / 1000) * (ROPE_G_PER_M[d] || 25) * (rope ? 1 : 0.7)
    const wetG = rope ? (ropeL - tails) / 1000 * (ROPE_G_PER_M[d] || 25) * 0.3 : 0
    const total = ropeG + wetG + coreG + shotG
    // ---- the view
    const meshes = { combined: meshData(core), kevlar: meshData(knot) }
    const hw = []
    if (use === 'staff') hw.push(k(k(Manifold.cylinder(220, poleR, poleR, 32)).translate([0, 0, -cR - 220 + (socket ? socket.depth : 4)])))
    if (use !== 'staff') hw.push(k(k(k(k(k(CrossSection.circle(1.6, 10)).translate([7, 0])).revolve(32)).rotate([90, 0, 0])).translate([0, 0, fin / 2 + 8]))) // the swivel ring the tails tie to
    if (hw.length) meshes.rods = meshData(k(Manifold.union(hw)))
    if (coreKind === 'printed') { const b = core.boundingBox(); meshes.coreFlat = meshData(k(core.translate([0, 0, -b.min[2]]))) }
    const circle = []
    for (let i = 0; i < 48; i++) circle.push([(fin / 2) * Math.cos((2 * Math.PI * i) / 48), (fin / 2) * Math.sin((2 * Math.PI * i) / 48)])
    return {
      fist: { use, n, d, coreD: p.coreD, fin, ropeL, tails, ropeG, wetG, coreG, shotG, total, coreKind, pauseAt, socket, rope },
      meshes,
      viewR: Math.max(fin * 0.9, 60),
      polygons: { base: [circle], relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: coreG, gramsTotal: total, warns, height: fin },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function fistDesigns() {
  const d = (id, name, use, group, blurb, over = {}, extra = []) => ({
    id, name, group, blurb, fist: true, use, added: '2026-11-22',
    params: [...FIST_PARAMS.map((x) => ({ ...x, ...(over[x.key] !== undefined ? { value: over[x.key] } : {}) })), ...extra],
    draw: () => {},
  })
  return [
    d('fistStaff', "Monkey's Fist Staff End", 'staff', 'FistContact', "A monkey's fist of Kevlar rope on the end of a contact or fire staff: a solid, round, burning ball. Tie it round a printed core that holds steel shot and takes the pole, or a drilled steel ball on an end plug. The forge gives the turns, the rope to cut and the weight.", { ropeD: 10, coreD: 45, core: 'printed core with steel shot' }, [{ key: 'poleOD', label: 'Pole', unit: 'mm', min: 12, max: 32, step: 0.1, value: 22, presets: [19, 22, 25.4] }]),
    d('fistDart', "Monkey's Fist Rope Dart", 'dart', 'FistRope', "A rope dart head tied as a monkey's fist round a steel ball: the rope's own tails come out of the knot and tie to the swivel, so there is no metal to hit you. Kevlar for fire, soft cord to learn.", { ropeD: 6, coreD: 32 }),
    d('fistMeteor', "Monkey's Fist Meteor", 'meteor', 'FistRope', "The meteor hammer head: a heavy monkey's fist on each end of the rope. Make two the same; the forge gives the rope for each head.", { ropeD: 10, coreD: 50 }),
    d('fistPoi', "Monkey's Fist Poi", 'poi', 'FistPoi', "A monkey's fist poi head: round and kind for contact, burns evenly as a fire poi. Tie two the same round steel balls; the tails tie to the leash swivel.", { ropeD: 6, coreD: 38 }),
  ]
}
