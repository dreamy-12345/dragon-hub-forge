/**
 * Hoops: how long to cut the tubing for any hoop size, and a printable
 * connector that joins the two ends.
 *
 * A hoop is measured across its OUTSIDE. The tube bends round its own centre
 * line, so the length to cut is the circumference of the centre line:
 *     cut length = π × (outside diameter − tube outside diameter)
 * The connector sits inside the tube and the two ends butt together, so it adds
 * nothing to the length.
 *
 * The connector is a short curved plug the size of the tube's bore, bent to the
 * hoop's own curve, with barbs that bite the tube. It prints lying flat on a
 * small flat underneath. Units mm (the sizes are entered in inches, as hoops are
 * sold, and shown in both).
 */
export const IN = 25.4

// common hoop tubing (outside diameter and wall, mm). Measure yours: makers vary.
export const TUBES = {
  '5/8" polypro (16 mm)': { od: 15.9, wall: 1.6, dens: 0.9, note: 'Light and fast: minis, doubles and tricks.' },
  '11/16" polypro (17.5 mm)': { od: 17.5, wall: 1.6, dens: 0.9, note: 'A touch firmer than 5/8": a favourite for off-body tricks.' },
  '3/4" polypro (19 mm)': { od: 19.05, wall: 1.6, dens: 0.9, note: 'The all-round polypro: snappy, holds its round, light.' },
  '7/8" polypro (22 mm)': { od: 22.2, wall: 1.8, dens: 0.9, note: 'Firmer, a little heavier: big polypro hoops and fire hoops.' },
  '3/4" HDPE 100 psi (≈24 mm)': { od: 24.1, wall: 1.6, dens: 0.95, note: 'Heavier and slower: the classic learner hoop for waist hooping.' },
  '3/4" HDPE 160 psi (≈26 mm)': { od: 26.2, wall: 2.6, dens: 0.95, note: 'The heaviest, slowest and steadiest: big beginner hoops.' },
  'my own tube (type its sizes)': { od: 0, wall: 0, dens: 0.93, note: 'Measure the outside with calipers, and the wall at a cut end.' },
}

export const HOOP_PARAMS = [
  { key: 'hoopIn', label: 'Hoop size (outside)', unit: 'in', min: 12, max: 50, step: 0.5, value: 36, presets: [24, 30, 34, 38, 42], hint: 'Across the outside, the way hoops are sold. Learning on the waist: 38–42". Tricks and off-body: 30–34". Minis and doubles: 22–28".' },
  { key: 'tube', label: 'Tubing', options: Object.keys(TUBES), value: '3/4" polypro (19 mm)', rerender: true },
  { key: 'tubeOD', label: 'Tube outside', unit: 'mm', min: 10, max: 35, step: 0.1, value: 19, showIf: (p) => p.tube.startsWith('my own') },
  { key: 'tubeWall', label: 'Tube wall', unit: 'mm', min: 0.8, max: 4, step: 0.1, value: 1.6, showIf: (p) => p.tube.startsWith('my own') },
  { key: 'connL', label: 'Connector length', unit: 'mm', min: 40, max: 160, step: 1, value: 90, hint: 'Longer is stronger at the joint; 75–100 mm is usual.' },
  { key: 'connFit', label: 'Connector fit', unit: 'mm', min: -0.4, max: 0.6, step: 0.05, value: 0.1, hint: 'How much bigger than the bore the barbs are. The body is 0.2 mm under it. Heat the tube end in hot water to push it on.' },
]

export const tubeOf = (p) => {
  const t = TUBES[p.tube] || TUBES['3/4" polypro (19 mm)']
  return t.od ? t : { ...t, od: p.tubeOD, wall: p.tubeWall }
}
export const cutLength = (hoopOD, tubeOD) => Math.PI * (hoopOD - tubeOD) // mm

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

export function buildHoop(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const t = tubeOf(p), warns = []
    const D = p.hoopIn * IN
    const Rc = (D - t.od) / 2 // centre line
    const L = cutLength(D, t.od)
    const id = t.od - 2 * t.wall
    if (id < 5) warns.push('The bore is too small for a printed connector: check the tube sizes.')
    // the hoop: the tube swept round, opened a little at the joint so you can see the connector
    const gapDeg = Math.min(8, (30 / Rc) * (180 / Math.PI))
    const ring = k(k(CrossSection.circle(t.od / 2, 32)).subtract(k(CrossSection.circle(id / 2, 32))))
    const hoop = k(k(k(ring.translate([Rc, 0])).revolve(360, 360 - gapDeg)).rotate([0, 0, gapDeg / 2]))
    // the connector: a curved plug on the hoop's own curve, barbs pointing out from the middle
    const rc = id / 2 - 0.1, arc = ((p.connL / Rc) * 180) / Math.PI
    let conn = k(k(k(CrossSection.circle(rc, 40)).translate([Rc, 0])).revolve(Math.max(24, Math.ceil(arc)), arc))
    conn = k(conn.rotate([0, 0, -arc / 2]))
    const barbs = [], nb = Math.max(2, Math.floor((p.connL / 2 - 8) / 7))
    const rBig = id / 2 + p.connFit, h = 3
    for (let i = 0; i < nb; i++) for (const side of [-1, 1]) {
      const s = 6 + i * 7 // mm from the middle
      const th = (side * s) / Rc
      let b = k(Manifold.cylinder(h, side > 0 ? rBig : rc, side > 0 ? rc : rBig, 40))
      b = k(k(k(b.rotate([-90, 0, 0])).translate([Rc, side > 0 ? 0 : -h, 0])).rotate([0, 0, (th * 180) / Math.PI]))
      barbs.push(b)
    }
    conn = k(conn.add(k(Manifold.union(barbs))))
    // hollow down the middle, barbs and all: lighter, and the tube still grips the outside
    conn = k(conn.subtract(k(k(k(k(CrossSection.circle(rc * 0.45, 24)).translate([Rc, 0])).revolve(Math.max(24, Math.ceil(arc)), arc + 4)).rotate([0, 0, -arc / 2 - 2]))))
    // the ends butt together over the middle: a small notch on top marks it
    conn = k(conn.subtract(k(k(Manifold.cube([1.2, 3, 2], true)).translate([Rc, 0, rc]))))
    // a flat underneath so it prints lying down, no supports
    const flatZ = -rc * 0.72
    conn = k(conn.trimByPlane([0, 0, 1], flatZ))
    const connFlat = k(conn.translate([-Rc, 0, -flatZ]))
    const dens = opts.density || 1.27
    const tubeG = ((Math.PI * ((t.od / 2) ** 2 - (id / 2) ** 2) * L) / 1000) * t.dens
    const connG = (conn.volume() / 1000) * dens
    const meshes = { combined: meshData(hoop), practice: meshData(conn), connFlat: meshData(connFlat) }
    const circle = []
    for (let i = 0; i < 96; i++) circle.push([(D / 2) * Math.cos((2 * Math.PI * i) / 96), (D / 2) * Math.sin((2 * Math.PI * i) / 96)])
    const hole = circle.map(([x, y]) => [(x * (Rc - t.od / 2)) / (D / 2), (y * (Rc - t.od / 2)) / (D / 2)]).reverse()
    return {
      hoop: { D, L, Rc, tube: t, id, tubeG, connG, total: tubeG + connG, arc },
      meshes,
      viewR: D * 0.55,
      polygons: { base: [circle, hole], relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: connG, gramsTotal: tubeG + connG, warns, height: t.od },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function hoopDesigns() {
  const d = (id, name, blurb, over) => ({
    id, name, group: 'Hoops', blurb, hoop: true, added: '2026-11-21',
    params: HOOP_PARAMS.map((x) => ({ ...x, ...(over[x.key] !== undefined ? { value: over[x.key] } : {}) })),
    draw: () => {},
  })
  return [
    d('hoopDance', 'Dance Hoop', 'A classic hoop for waist and body hooping: pick the size, and the forge tells you exactly how much tubing to cut. Print the curved connector, push the ends on, done.', { hoopIn: 38, tube: '3/4" HDPE 100 psi (≈24 mm)' }),
    d('hoopPoly', 'Polypro Hoop', 'A light, snappy polypro hoop for tricks, breaks and off-body: the cut length for your size, and a curved printed connector made to the tube.', { hoopIn: 34, tube: '3/4" polypro (19 mm)' }),
    d('hoopMini', 'Mini Hoop', 'A small hoop for minis and doubles (make two the same). Cut length, connector and weight for the pair.', { hoopIn: 24, tube: '5/8" polypro (16 mm)', connL: 70 }),
    d('hoopBig', 'Big Beginner Hoop', 'A big, heavy, slow hoop that is the easiest to learn waist hooping on.', { hoopIn: 42, tube: '3/4" HDPE 160 psi (≈26 mm)', connL: 100 }),
  ]
}
