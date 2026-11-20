/**
 * Practice spokes: printed spokes that plug into the fire spoke hubs in place
 * of real fire spokes, so you can learn without fire (or without buying any).
 *
 *   spoke  a rigid printed rod (PETG or nylon): an 8 mm shank for the hub
 *          socket with a flat the clamp screw bites on, a thicker body, and a
 *          peg at the tip. It prints lying on its flat, no supports.
 *   head   a TPU head that pushes onto the peg: shaped like a wick, a ball, or
 *          a glow head holding an LED capsule. Weighted like a fuelled wick.
 * Units mm. In the view the spoke runs along +x from the hub socket.
 */

export const PRACTICE_PARAMS = [
  { key: 'rodD', label: 'Shank (socket size)', unit: 'mm', min: 5, max: 12, step: 0.1, value: 8, presets: [6, 8, 10], hint: 'The hub socket size: 8 mm on the forge spoke hubs and on common fire spokes.' },
  { key: 'depth', label: 'Shank length', unit: 'mm', min: 12, max: 40, step: 0.5, value: 25, hint: 'Same as the hub socket depth.' },
  { key: 'spokeLen', label: 'Spoke length', unit: 'mm', min: 100, max: 300, step: 1, value: 185, hint: 'Whole spoke with its head, the same as the fire spokes you will move on to.' },
  { key: 'bodyD', label: 'Body thickness', unit: 'mm', min: 8, max: 20, step: 0.5, value: 12, hint: 'Thicker is stiffer. 12 mm in PETG or nylon stays straight.' },
  { key: 'headG', label: 'Head weight', unit: 'g', min: 15, max: 120, step: 1, value: 60, hint: 'About a fuelled 2" wick. Lighter is easier to learn with.' },
]

const TPU = 1.21

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

export function buildPracticeSpoke(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const head = opts.head || 'wick'
    const warns = []
    const flat = (r) => Math.max(0.6, r * 0.18) // depth of the flat on each round section
    // a D-shaped rod section along +x, lying on its flat at z = 0
    const rod = (r, x0, len) => {
      const d = flat(r)
      const sec = k(k(CrossSection.circle(r, 48)).intersect(k(k(CrossSection.square([2 * r, 2 * r], true)).translate([-d, 0]))))
      return k(k(k(sec.extrude(len)).rotate([0, 90, 0])).translate([x0, 0, r - d]))
    }
    const rs = p.rodD / 2 - 0.1 // slides into the socket
    const rb = p.bodyD / 2
    const pegL = 40, pegR = p.rodD / 2
    // head size from its weight
    let headL = 50, headD = 30, headM
    const pegV = Math.PI * pegR ** 2 * (pegL + 0.5)
    if (head === 'wick') {
      const V = (p.headG / TPU) * 1000 + pegV
      headD = Math.max(p.rodD + 10, 2 * Math.sqrt(V / (Math.PI * headL)))
      let m = k(Manifold.cylinder(headL, headD / 2, headD / 2, 64))
      // grooves round it, like wraps of tape
      const grooves = []
      for (let i = 1; i < 6; i++) grooves.push(k(k(k(CrossSection.circle(1.2, 12)).translate([headD / 2 + 0.4, (headL * i) / 6])).revolve(64)))
      m = k(m.subtract(k(Manifold.union(grooves))))
      headM = m
    } else if (head === 'ball') {
      const V = (p.headG / TPU) * 1000 + pegV
      headD = Math.max(p.rodD + 12, 2 * Math.cbrt((3 * V) / (4 * Math.PI)))
      headL = headD
      // a flat foot so it prints standing up
      headM = k(k(k(Manifold.sphere(headD / 2, 64)).translate([0, 0, headD / 2])).intersect(k(k(Manifold.cube([headD * 2, headD * 2, headD], false)).translate([-headD, -headD, 1.2]))))
      headM = k(headM.translate([0, 0, -1.2]))
      headL = headD - 1.2
    } else {
      // glow: a clear TPU sleeve holding an LED capsule in line with the spoke
      const cd = (p.capD || 21) + 0.6, cl = (p.capL || 88) + 1, wall = 1.8
      headL = cl + wall + pegL
      headD = cd + 2 * wall
      let m = k(Manifold.cylinder(headL, headD / 2, headD / 2, 64))
      m = k(m.subtract(k(k(Manifold.cylinder(cl + 0.01, cd / 2, cd / 2, 64)).translate([0, 0, headL - cl]))))
      // narrow the mouth a little so the capsule snaps in
      m = k(m.add(k(k(k(Manifold.cylinder(1.2, cd / 2 + 0.01, cd / 2 + 0.01, 64)).subtract(k(Manifold.cylinder(1.2, cd / 2 - 0.7, cd / 2 - 0.7, 64)))).translate([0, 0, headL - 1.2]))))
      headM = m
    }
    // peg hole in the head: a little under size, TPU grips it
    headM = k(headM.subtract(k(k(Manifold.cylinder(pegL + 0.5, pegR - 0.15, pegR - 0.15, 32)).translate([0, 0, -0.01]))))
    const gHead = (headM.volume() / 1000) * TPU + (head === 'glow' ? p.capMass || 32 : 0)

    const bodyStart = p.depth + 4
    const tip = p.spokeLen - Math.min(headL, pegL + 6) // where the peg goes into the head
    const bodyLen = tip - bodyStart - 4
    if (bodyLen < 20) warns.push('The spoke is too short for its head: make it longer or the head lighter.')
    const parts = [
      rod(rs, 0, p.depth + 1),
      k(Manifold.hull([rod(rs, p.depth, 1), rod(rb, bodyStart, 1)])), // taper
      rod(rb, bodyStart, Math.max(1, bodyLen)),
      k(Manifold.hull([rod(rb, bodyStart + bodyLen - 1, 1), rod(pegR - 0.1, tip, 1)])),
      rod(pegR - 0.1, tip, pegL),
    ]
    const spoke = k(Manifold.union(parts))
    const density = opts.density || 1.27
    const gSpoke = (spoke.volume() / 1000) * density

    // view: the spoke along +x from where the hub socket starts, the head on its tip
    const headView = k(k(headM.rotate([0, 90, 0])).translate([tip - 0.5, 0, rb - flat(rb)]))
    const meshes = {
      combined: meshData(spoke),
      practice: meshData(headView),
      spokeFlat: meshData(spoke),
      practiceFlat: meshData(headM),
    }
    const box = []
    for (const [x, y] of [[0, -headD / 2], [p.spokeLen, -headD / 2], [p.spokeLen, headD / 2], [0, headD / 2]]) box.push([x - p.spokeLen / 2, y])
    return {
      practiceSpoke: { head, headD, headL, gHead, gSpoke, tip },
      meshes,
      viewR: p.spokeLen * 0.6,
      polygons: { base: [box], relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: gSpoke, gramsTotal: gSpoke + gHead, warns, height: 2 * rb },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function practiceDesigns() {
  const d = (id, name, head, blurb) => ({
    id, name, group: 'PracticeSpokes', blurb, practiceSpoke: true, head, added: '2026-11-20',
    params: PRACTICE_PARAMS.map((x) => ({ ...x })),
    draw: () => {},
  })
  return [
    d('practiceWick', 'Practice Spoke: Wick', 'wick', 'A printed practice spoke that plugs into the fire spoke hubs: rigid rod with a flat for the clamp screw, and a TPU head shaped and weighted like a fuelled 2" wick. Learn the moves with no fire and no cost.'),
    d('practiceBall', 'Practice Spoke: Ball', 'ball', 'A printed practice spoke with a soft TPU ball head, weighted like a wet wick: kind to your body and the floor while you learn.'),
    d('practiceGlow', 'Practice Spoke: Glow', 'glow', 'A printed practice spoke whose head holds an LED capsule: plug it into the spoke hub for a glow staff that moves like the fire one.'),
  ]
}
