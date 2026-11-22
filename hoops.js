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

// hoop tubing: pick the material and the size. Outside diameter and wall in mm; makers vary, so measure yours.
// Polypro is sold by its outside size; HDPE is sold by a nominal pipe size, a little bigger outside.
export const TUBE_MATS = {
  polypro: { dens: 0.9, note: 'Light, snappy, holds its round: tricks, minis, off-body.', sizes: { '5/8"': [15.9, 1.6], '11/16"': [17.5, 1.6], '3/4"': [19.05, 1.6], '7/8"': [22.2, 1.8], '1"': [25.4, 2.0] } },
  'HDPE 100 psi': { dens: 0.95, note: 'Heavier and slower: the classic learner hoop for waist hooping.', sizes: { '5/8"': [20.6, 1.6], '3/4"': [24.1, 1.6], '1"': [30.2, 1.9] } },
  'HDPE 160 psi': { dens: 0.95, note: 'The heaviest, slowest, steadiest: big beginner hoops.', sizes: { '3/4"': [26.2, 2.6], '1"': [33.4, 2.9] } },
  'my own tube (measure it)': { dens: 0.93, note: 'Measure the outside with calipers, and the wall at a cut end.', sizes: {} },
}
export const TUBE_SIZES = ['5/8"', '11/16"', '3/4"', '7/8"', '1"']
const ownTube = (p) => (p.tubeMat || '').startsWith('my own')

export const HOOP_PARAMS = [
  { key: 'measure', label: 'Size is measured', options: ['across the OUTSIDE (how hoops are sold)', 'across the INSIDE'], value: 'across the OUTSIDE (how hoops are sold)', rerender: true, hint: 'Outside diameter: edge to edge across the outside of the tube, the way hoops are sold. Inside diameter: across the hole in the middle. The forge shows both either way.' },
  { key: 'hoopIn', label: 'Hoop size', unit: 'in', min: 12, max: 50, step: 0.5, value: 36, presets: [24, 30, 34, 38, 42], hint: 'Learning on the waist: 38–42". Tricks and off-body: 30–34". Minis and doubles: 22–28".' },
  { key: 'tubeMat', label: 'Tube material', options: Object.keys(TUBE_MATS), value: 'polypro', rerender: true },
  { key: 'tubeSize', label: 'Tube size', options: TUBE_SIZES, value: '3/4"', showIf: (p) => !ownTube(p), hint: 'Polypro is sold by its outside size. HDPE by its pipe size: 3/4" HDPE is about 24 mm outside (100 psi) or 26 mm (160 psi).' },
  { key: 'tubeOD', label: 'Tube outside', unit: 'mm', min: 10, max: 35, step: 0.1, value: 19, showIf: (p) => ownTube(p) },
  { key: 'tubeWall', label: 'Tube wall', unit: 'mm', min: 0.8, max: 4, step: 0.1, value: 1.6, showIf: (p) => ownTube(p) },
  { key: 'connL', label: 'Connector length', unit: 'mm', min: 40, max: 160, step: 1, value: 90, hint: 'Longer is stronger at the joint; 75–100 mm is usual.' },
  { key: 'show', label: 'Show', options: ['the whole hoop', 'the connector close up'], value: 'the whole hoop', hint: 'Close up: just the connector and the tube ends, and How it works ▶ shows them coming apart.' },
  { key: 'connFit', label: 'Connector fit', unit: 'mm', min: -0.4, max: 0.6, step: 0.05, value: 0.1, hint: 'How much bigger than the bore the barbs are. The body is 0.2 mm under it. Heat the tube end in hot water to push it on.' },
]

/** The tube from the material and size (or your own measurements), with a label. */
export const tubeOf = (p) => {
  // older saves had one 'tube' setting: read it
  let mat = p.tubeMat, size = p.tubeSize
  if (!mat && p.tube) { mat = /HDPE 160/.test(p.tube) ? 'HDPE 160 psi' : /HDPE/.test(p.tube) ? 'HDPE 100 psi' : /my own/.test(p.tube) ? 'my own tube (measure it)' : 'polypro'; size = (p.tube.match(/^[\d/]+"/) || ['3/4"'])[0] }
  const M = TUBE_MATS[mat] || TUBE_MATS.polypro
  if ((mat || '').startsWith('my own')) return { od: p.tubeOD, wall: p.tubeWall, dens: M.dens, note: M.note, label: `Ø${p.tubeOD} mm tube` }
  let dims = M.sizes[size], fell = false
  if (!dims) { size = Object.keys(M.sizes).includes('3/4"') ? '3/4"' : Object.keys(M.sizes)[0]; dims = M.sizes[size]; fell = true }
  return { od: dims[0], wall: dims[1], dens: M.dens, note: M.note, label: `${size} ${mat}`, fell }
}
export const cutLength = (hoopOD, tubeOD) => Math.PI * (hoopOD - tubeOD) // mm

/** Close-up of a joint: the connector where it is, two tube ends that slide off it (for the animation). */
function closeUp(wasm, k, meshes, conn, { Rc, od, id, len = 70 }) {
  const { CrossSection } = wasm
  const ring = k(k(CrossSection.circle(od / 2, 32)).subtract(k(CrossSection.circle(id / 2, 32))))
  const deg = (len / Rc) * (180 / Math.PI)
  const stub = (from) => k(k(k(ring.translate([Rc, 0])).revolve(Math.max(12, Math.ceil(deg)), deg)).rotate([0, 0, from]))
  meshes.animTubeA = meshData(stub(0.15))
  meshes.animTubeB = meshData(stub(-deg - 0.15))
  meshes.combined = meshData(conn)
  return [{ key: 'animTubeA', dir: [0, 70, 0], look: 'ghost' }, { key: 'animTubeB', dir: [0, -70, 0], look: 'ghost', lead: 1.15 }]
}

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
    if (t.fell) warns.push(`${p.tubeMat} is not sold in ${p.tubeSize}: showing ${t.label}.`)
    const D = (p.measure || '').includes('INSIDE') ? p.hoopIn * IN + 2 * t.od : p.hoopIn * IN // always the outside diameter from here on
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
    const close = (p.show || '').includes('close')
    const anim = close ? closeUp(wasm, k, meshes, conn, { Rc, od: t.od, id }) : []
    if (close) delete meshes.practice
    const circle = []
    for (let i = 0; i < 96; i++) circle.push([(D / 2) * Math.cos((2 * Math.PI * i) / 96), (D / 2) * Math.sin((2 * Math.PI * i) / 96)])
    const hole = circle.map(([x, y]) => [(x * (Rc - t.od / 2)) / (D / 2), (y * (Rc - t.od / 2)) / (D / 2)]).reverse()
    return {
      anim,
      hoop: { D, L, Rc, tube: t, id, tubeG, connG, total: tubeG + connG, arc, close },
      meshes,
      viewR: close ? 70 : D * 0.55,
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
    d('hoopDance', 'Hoop', 'Any hoop: pick the size (inside or outside) and the tubing, and the forge gives the exact length to cut, the full cut table beside the view, and a curved connector to print. Collapsible joints are their own designs below.', { hoopIn: 38, tubeMat: 'HDPE 100 psi', tubeSize: '3/4"' }),
  ]
}

// ------------------------------------------------------ collapsible hoops --
/**
 * Collapsible (travel) hoops: the hoop is cut into sections that come apart,
 * joined by connectors that lock with a button. The connector sits half in each
 * tube end; one half is riveted in for good, the other slides in and out and is
 * held by a button that pops out through a hole in the tube.
 *
 *   button   a bought metal V-spring push button (5 mm for 5/8", 6 mm for 3/4")
 *            sits in the connector's hollow core
 *   flex     no metal at all: a springy tongue cut in the connector wall with a
 *            printed button on its end (PETG or nylon)
 *   double   a V-spring button on both halves: both ends come off, nothing riveted
 *   clip     a small clevis pin (or a bent hairpin clip) straight through tube and
 *            connector: the cheapest, nothing to wear out
 * The buttons sit on the inside of the hoop, away from the body. A printed drill
 * guide slips over the tube end and puts every hole in the right place.
 */
export const JOINT_PARAMS = [
  ...HOOP_PARAMS.filter((q) => q.key !== 'connFit'),
  { key: 'sections', label: 'Sections', unit: '', min: 2, max: 10, step: 1, value: 5, hint: 'How many pieces it comes apart into. More = packs smaller (a 38" hoop in 5 pieces packs to about 60 cm), but more joints to click together.' },
  { key: 'btnD', label: 'Button hole', unit: 'mm', min: 3, max: 8, step: 0.1, value: 5, presets: [5, 6], hint: 'Drill size for the button: 5 mm for the small push buttons made for 5/8" tubing, 6 mm for 3/4". Measure your buttons.' },
  { key: 'btnFrom', label: 'Hole from the joint', unit: 'mm', min: 12, max: 60, step: 0.5, value: 22, hint: 'How far the button hole is from the tube end.' },
]
const JOINTS = {
  button: 'one V-spring push button',
  flex: 'printed flex button (no metal)',
  double: 'a push button on both halves',
  clip: 'clip pin through the joint',
}

export function buildHoopJoint(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const style = opts.style || 'button'
    const t = tubeOf(p), warns = []
    if (t.fell) warns.push(`${p.tubeMat} is not sold in ${p.tubeSize}: showing ${t.label}.`)
    const D = (p.measure || '').includes('INSIDE') ? p.hoopIn * IN + 2 * t.od : p.hoopIn * IN, Rc = (D - t.od) / 2, L = cutLength(D, t.od)
    const id = t.od - 2 * t.wall
    const N = Math.max(2, Math.round(p.sections))
    const rc = id / 2 - 0.15 // slides in
    const rB = rc - 1.4 // the hollow core for the V-spring
    if (rB < 3.2 && style !== 'clip') warns.push('The tube is small inside for a button connector: use the clip pin, or bigger tubing.')
    const arcOf = (s) => (s / Rc) * (180 / Math.PI)
    const arc = arcOf(p.connL)
    const sweep = (r, a, x = Rc) => k(k(k(k(CrossSection.circle(r, 40)).translate([x, 0])).revolve(Math.max(24, Math.ceil(a)), a)).rotate([0, 0, -a / 2]))
    let conn = sweep(rc, arc)
    // the riveted half (y < 0) has barbs; the sliding half is smooth
    const fixedSide = style === 'button' || style === 'flex' || style === 'clip'
    if (fixedSide) {
      const rBig = id / 2 + 0.15, h = 3, barbs = []
      for (let i = 0; i < Math.max(2, Math.floor((p.connL / 2 - 14) / 7)); i++) {
        const s = 8 + i * 7
        let b = k(Manifold.cylinder(h, rBig, rc, 40))
        b = k(k(k(b.rotate([-90, 0, 0])).translate([Rc, -h, 0])).rotate([0, 0, -arcOf(s)]))
        barbs.push(b)
      }
      conn = k(conn.add(k(Manifold.union(barbs))))
    }
    // the hollow core (open at the sliding end so a V-spring button goes in)
    if (style !== 'clip') conn = k(conn.subtract(sweep(rB, arc + 4)))
    // a ring round the middle that the two tube ends butt against
    const stop = k(k(k(k(k(CrossSection.circle(t.od / 2 - 0.3, 48)).subtract(k(CrossSection.circle(rc - 0.5, 48)))).extrude(1.6)).rotate([-90, 0, 0])).translate([Rc, -0.8, 0]))
    conn = k(conn.add(stop))
    // holes, at a distance s along the arc, through the wall on the inside of the hoop
    const placeAt = (m, s) => k(m.rotate([0, 0, arcOf(s)]))
    const radialIn = (r, s) => placeAt(k(k(k(Manifold.cylinder(rc + 2, r, r, 24)).rotate([0, -90, 0])).translate([Rc, 0, 0])), s)
    const across = (r, s) => placeAt(k(k(Manifold.cylinder(2 * rc + 4, r, r, 20)).translate([Rc, 0, -rc - 2])), s)
    const holes = [], hw = []
    const btnHole = (s) => { holes.push(radialIn(p.btnD / 2 + 0.15, s)); hw.push(placeAt(k(k(k(Manifold.cylinder(t.wall + 1.2, p.btnD / 2 - 0.2, p.btnD / 2 - 0.4, 24)).rotate([0, -90, 0])).translate([Rc - rc + 0.6, 0, 0])), s)) }
    const sB = p.btnFrom, sR = -Math.min(20, p.connL / 2 - 6)
    if (style === 'button') { btnHole(sB); holes.push(across(1.7, sR)) }
    if (style === 'double') { btnHole(sB); btnHole(-sB) }
    if (style === 'clip') { holes.push(across(1.6, sB)); holes.push(across(1.7, sR)); hw.push(placeAt(k(k(Manifold.cylinder(2 * rc + 6, 1.5, 1.5, 16)).translate([Rc, 0, -rc - 3])), sB)) }
    if (style === 'flex') {
      // a tongue in the inside wall: a U-shaped slot round it, a ramped button on its free end
      const tl = 14, tw = Math.min(6, rc * 1.1), gap = 1.0
      const u = []
      const box = (a, b, c, x, y, z) => k(k(Manifold.cube([a, b, c], true)).translate([x, y, z]))
      // local: x radial (inward is -x), y along the tube, z up; the tongue spans y from sB - tl to sB + 2
      u.push(box(rc, gap, tw + 2 * gap, Rc - rc / 2, sB + 2.5, 0))
      u.push(box(rc, tl + 2.5, gap, Rc - rc / 2, sB + 2.5 - (tl + 2.5) / 2, tw / 2 + gap / 2))
      u.push(box(rc, tl + 2.5, gap, Rc - rc / 2, sB + 2.5 - (tl + 2.5) / 2, -tw / 2 - gap / 2))
      // the slot is cut in straight local coords at the button: bend it onto the arc approximately by placing at sB
      const slot = k(k(Manifold.union(u)).translate([0, -sB, 0]))
      conn = k(conn.subtract(placeAt(slot, sB)))
      const nub = k(k(k(Manifold.cylinder(t.wall + 0.8, p.btnD / 2 - 0.25, p.btnD / 2 - 0.9, 24)).rotate([0, -90, 0])).translate([Rc - rc + 0.4, 0, 0]))
      conn = k(conn.add(placeAt(nub, sB - 1)))
      holes.push(across(1.7, sR))
      if (!/PETG|nylon/i.test(opts.materialName || 'PETG')) warns.push('Print the flex button connector in PETG or nylon: PLA snaps, TPU will not spring back.')
    }
    if (holes.length) conn = k(conn.subtract(k(Manifold.union(holes))))
    // a flat underneath so it prints lying down
    const flatZ = -Math.min(rc * 0.72, style === 'clip' ? rc * 0.72 : rB + 0.9)
    conn = k(conn.trimByPlane([0, 0, 1], flatZ))
    const connFlat = k(conn.translate([-Rc, 0, -flatZ]))
    // the drill guide: a sleeve over the tube end, a stop lip inside, guide holes for the button (or pin) and the rivet
    const gL = Math.max(sB, -sR) + 14, gi = t.od / 2 + 0.25, go = gi + 2.6
    let guide = k(k(Manifold.cylinder(gL, go, go, 64)).subtract(k(k(Manifold.cylinder(gL + 2, gi, gi, 64)).translate([0, 0, 2]))))
    guide = k(guide.subtract(k(k(Manifold.cylinder(4, id / 2 - 0.4, id / 2 - 0.4, 48)).translate([0, 0, -1]))))
    const gh = (d, z, ang) => k(k(k(k(Manifold.cylinder(go + 2, d / 2, d / 2, 20)).rotate([0, 90, 0])).translate([0, 0, z])).rotate([0, 0, ang]))
    const ghs = [gh(style === 'clip' ? 3.2 : p.btnD + 0.1, 2 + sB, 0), gh(3.3, 2 - sR, 180)]
    guide = k(guide.subtract(k(Manifold.union(ghs))))
    // the hoop, cut into its sections (small gaps so the joints show)
    const gapDeg = Math.min(3, arcOf(6))
    const ring = k(k(CrossSection.circle(t.od / 2, 32)).subtract(k(CrossSection.circle(id / 2, 32))))
    const segs = []
    for (let i = 0; i < N; i++) segs.push(k(k(k(ring.translate([Rc, 0])).revolve(Math.ceil(360 / N), 360 / N - gapDeg)).rotate([0, 0, (360 * i) / N + gapDeg / 2])))
    const hoop = k(Manifold.union(segs))
    const dens = opts.density || 1.27
    const tubeG = ((Math.PI * ((t.od / 2) ** 2 - (id / 2) ** 2) * L) / 1000) * t.dens
    const connG = (conn.volume() / 1000) * dens
    const meshes = { combined: meshData(hoop), practice: meshData(conn), connFlat: meshData(connFlat), guideFlat: meshData(guide) }
    const close = (p.show || '').includes('close')
    const anim = close ? closeUp(wasm, k, meshes, conn, { Rc, od: t.od, id }) : []
    if (close) {
      delete meshes.practice
      if (hw.length) { meshes.animHw = meshData(k(Manifold.union(hw))); anim.push({ key: 'animHw', dir: [-18, 0, 0], lead: 1.4 }) }
    } else if (hw.length) meshes.rods = meshData(k(Manifold.union(hw)))
    const circle = []
    for (let i = 0; i < 96; i++) circle.push([(D / 2) * Math.cos((2 * Math.PI * i) / 96), (D / 2) * Math.sin((2 * Math.PI * i) / 96)])
    const hole = circle.map(([x, y]) => [(x * (Rc - t.od / 2)) / (D / 2), (y * (Rc - t.od / 2)) / (D / 2)]).reverse()
    if (L / N > 900) warns.push(`Each section is ${(L / N / 10).toFixed(0)} cm: more sections pack smaller.`)
    return {
      anim,
      hoop: { D, L, Rc, tube: t, id, close, tubeG, connG: connG * N, total: tubeG + connG * N, arc, joint: { style, name: JOINTS[style], N, seg: L / N, sB, sR: -sR, core: 2 * rB } },
      meshes,
      viewR: close ? 70 : D * 0.55,
      polygons: { base: [circle, hole], relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: connG, gramsTotal: tubeG + connG * N, warns, height: t.od },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function jointDesigns() {
  const d = (id, name, style, blurb, over = {}) => ({
    id, name, group: 'HoopJoints', blurb, hoop: true, joint: style, added: '2026-11-22',
    params: JOINT_PARAMS.map((x) => ({ ...x, ...(over[x.key] !== undefined ? { value: over[x.key] } : {}) })),
    draw: () => {},
  })
  return [
    d('jointButton', 'Push-Button Joint', 'button', 'The travel-hoop classic: a curved connector riveted into one tube end, sliding into the next, locked by a small metal V-spring push button that clicks out through a 5 mm hole. Press the button to take the hoop apart. Comes with a drill guide for the holes.', { hoopIn: 36, tubeMat: 'polypro', tubeSize: '5/8"', connL: 80 }),
    d('jointFlex', 'Flex-Button Joint', 'flex', 'No metal at all: the button is printed on a springy tongue in the connector wall. Print it in PETG or nylon; it clicks into the hole just like a metal button.', { hoopIn: 36, tubeMat: 'polypro', tubeSize: '5/8"', connL: 80 }),
    d('jointDouble', 'Double-Button Joint', 'double', 'A push button on both halves, nothing riveted: every piece comes off, so you can swap sections, mix lengths or replace a broken one.', { hoopIn: 38, tubeMat: 'polypro', tubeSize: '3/4"', connL: 90, btnD: 6 }),
    d('jointClip', 'Clip-Pin Joint', 'clip', 'The simplest collapsible joint: a small stainless clevis pin with a clip (or a bent hairpin clip) straight through tube and connector. Nothing to wear out, costs almost nothing.', { hoopIn: 38, tubeMat: 'HDPE 100 psi', tubeSize: '3/4"', connL: 90 }),
  ]
}
