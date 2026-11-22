/**
 * Locking dowels: a short metal dowel for the end of a dragon staff pole that the
 * hub then locks onto, so a hub cannot fly off.
 *
 *   spigot  goes INSIDE the pole end. Allen key: three slots and a cone wedge on
 *           an M6 cap screw; turn the key and the spigot grips the inside of the
 *           tube (safe for carbon). Or glue it in with epoxy and a rivet across.
 *   lip     a flange that sits on the pole end and a skirt that wraps down the
 *           outside of the pole, so it cannot walk sideways or split the tube end
 *   stub    sticks out past the pole, the same size as the pole, so any forge hub
 *           slides onto it as it would onto the pole
 *   lock    grub screw: a groove all round the stub, and the hub's M5 grub screw
 *             (in a nut trapped in its collar) sits in it at any angle
 *           cross pin: an M5 bolt or clevis pin straight through the hub collar
 *             and the stub
 *           end bolt: the M6 cap screw that tightens the dowel goes on through a
 *             big washer over the hub's face, so one allen key holds everything
 *
 * Turn hub lock on in any hub (Lock onto a metal dowel) with the same lock, and
 * the forge cuts the matching hole and nut trap into the hub's collar.
 * Units mm; z = 0 is the pole end, the pole is below.
 */
import { TAU } from './geom.js'

export const LOCKS = {
  grub: 'grub screw (M5) in a groove',
  pin: 'cross pin (M5 bolt or clevis pin)',
  bolt: 'end bolt and big washer (M6)',
}
export const lockKey = (s) => Object.keys(LOCKS).find((k) => LOCKS[k] === s) || 'grub'

/** Hub side: where the lock goes up the collar (hub z), or null if the collar is too short. */
export function hubLockZ(p, T) {
  if (p.collarH < T + 10) return null
  return Math.min(T + (p.collarH - T) / 2 + Math.min(p.flareW, p.collarH - T) / 2, p.collarH - 5.5)
}

/** The hub's lock parameters (Common, group Lock: off unless ticked). */
export const LOCK_PARAMS = [
  { key: 'lockOn', label: 'Lock onto a metal dowel', check: true, value: false, group: 'Lock', rerender: true, hint: 'Optional, for hubs you never want flying off: a metal Locking Dowel goes in the pole end (Pole fittings), and the hub locks onto it. Off = the usual push-on hub.' },
  { key: 'lockType', label: 'Lock with', options: Object.values(LOCKS), value: LOCKS.grub, group: 'Lock', showIf: (p) => !!p.lockOn, rerender: true, hint: 'Grub screw: an M5 grub screw through the collar into a groove on the dowel; a nut is trapped in the collar. Cross pin: an M5 bolt or clevis pin right through collar and dowel. End bolt: the dowel bolt goes through a big washer on the hub face.' },
]

export const DOWEL_PARAMS = [
  { key: 'poleOD', label: 'Pole outside', unit: 'mm', min: 12, max: 40, step: 0.1, value: 22, presets: [16, 19, 22, 25.4] },
  { key: 'poleWall', label: 'Pole wall', unit: 'mm', min: 0.5, max: 5, step: 0.05, value: 1.5, hint: 'Measure at a cut end: sets the spigot that goes inside.' },
  { key: 'hold', label: 'Held in the pole by', options: ['expanding: tighten with an allen key', 'glue (epoxy) and a rivet across'], value: 'expanding: tighten with an allen key', rerender: true, hint: 'Expanding: a cone wedge spreads the slotted spigot against the inside of the tube; safe for carbon, comes out again. Glue: for narrow poles where an expander does not fit.' },
  { key: 'inL', label: 'Spigot inside the pole', unit: 'mm', min: 20, max: 80, step: 1, value: 40 },
  { key: 'lipL', label: 'Lip down the outside', unit: 'mm', min: 0, max: 25, step: 0.5, value: 8, hint: 'A skirt that wraps the outside of the pole end: stops it walking sideways and protects the tube end. 0 = a flat flange on the end.' },
  { key: 'lipW', label: 'Lip wall', unit: 'mm', min: 1, max: 6, step: 0.1, value: 2.5, hint: 'Also the flange the hub sits on.' },
  { key: 'flangeT', label: 'Flange', unit: 'mm', min: 1.5, max: 8, step: 0.5, value: 3, hint: 'Thickness of the shoulder between the pole end and the hub.' },
  { key: 'stubL', label: 'Stub (hub collar length)', unit: 'mm', min: 8, max: 60, step: 0.5, value: 26, hint: 'Set it to the Collar length of your hub (26 mm as standard), so the hub sits on the whole stub.' },
  { key: 'lockD', label: 'Lock from the flange', unit: 'mm', min: 4, max: 40, step: 0.5, value: 7, hint: 'Where the groove or the cross hole is, measured up from the flange. The hub tells you this number when Lock onto a metal dowel is on.' },
]

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

export function buildDowel(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const warns = []
    const lock = opts.lock || 'grub'
    const expand = (p.hold || '').startsWith('expanding')
    const density = opts.density || 2.7
    const ri = (p.poleOD - 2 * p.poleWall) / 2
    const rs = ri - 0.1 // spigot: slides in
    const rb = p.poleOD / 2 + 0.15 // inside the lip skirt
    const ro = p.poleOD / 2 + p.lipW
    const rst = p.poleOD / 2 - 0.05 // the stub: same as the pole
    const fT = p.flangeT
    const stubL = lock === 'bolt' ? p.stubL - 1 : p.stubL // the washer must bear on the hub, not the stub
    const z1 = fT + stubL
    const zL = fT + Math.min(p.lockD, stubL - 4)
    if (p.lockD > stubL - 4) warns.push('The lock is too near the top of the stub: lower Lock from the flange, or make the stub longer.')
    if (expand && rs < 5.6) warns.push(`The pole is only Ø${(2 * ri).toFixed(1)} inside: too narrow for an expanding spigot (about 11.5 mm needed). Pick glue and a rivet.`)
    // the half profile, from the bottom of the spigot round to the top of the stub
    const c = 0.6
    const pts = [[0, -p.inL], [rs - 0.8, -p.inL], [rs, -p.inL + 0.8], [rs, 0]]
    if (p.lipL > 0) pts.push([rb, 0], [rb, -p.lipL], [ro - c, -p.lipL], [ro, -p.lipL + c])
    else pts.push([ro - c, 0], [ro, c])
    pts.push([ro, fT - c], [ro - c, fT], [rst, fT], [rst, z1 - 0.8], [rst - 0.8, z1], [0, z1])
    let m = k(k(new CrossSection([pts], 'Positive')).revolve(96))
    const cyl = (r, za, zb, n = 48) => k(k(Manifold.cylinder(zb - za, r, r, n)).translate([0, 0, za]))
    let wedge = null, info = { lock, expand, zL, z1, ri, rs, ro, stubL }
    if (expand) {
      m = k(m.subtract(cyl(3.3, -p.inL - 1, z1 + 1, 24))) // M6 clearance up the middle
      const taperL = Math.min(p.inL - 8, 24), rBot = rs - 1.6, rTop = 3.6
      m = k(m.subtract(k(k(Manifold.cylinder(taperL, rBot, rTop, 48)).translate([0, 0, -p.inL - 0.01]))))
      const slots = []
      for (let i = 0; i < 3; i++) slots.push(k(k(k(Manifold.cube([2 * rs + 2, 1.2, p.inL - 6 + 0.01], false)).translate([0, -0.6, -p.inL - 0.01])).rotate([0, 0, 120 * i + 30])))
      m = k(m.subtract(k(Manifold.union(slots))))
      const wL = Math.min(16, taperL - 2), wTop = rBot - ((rBot - rTop) * wL) / taperL
      wedge = k(Manifold.cylinder(wL, rBot - 0.1, wTop - 0.1, 48))
      wedge = k(wedge.subtract(cyl(2.5, -1, wL + 1, 20)))
      wedge = k(wedge.translate([0, 0, -p.inL - 2]))
      // the bolt head: under a counterbore below the lock for grub and pin, on top of the washer for the end bolt
      let headZ, boltL
      if (lock === 'bolt') {
        headZ = z1 + 1 + 2.5 // the hub face is 1 mm over the stub, then a 2.5 mm washer
        boltL = Math.ceil((headZ - (-p.inL - 2)) / 5) * 5
        info.washer = { od: Math.max(30, 2 * ro + 10), id: 6.4, t: 2.5 }
      } else {
        headZ = Math.max(fT - 2, zL - 3.2 - 6.2)
        m = k(m.subtract(cyl(5.7, headZ, z1 + 1, 32)))
        boltL = Math.ceil((headZ - (-p.inL - 2)) / 5) * 5
        if (rst - 5.7 < 2.4) warns.push('The stub wall round the bolt head is thin: this pole is small for a grub-screw or pin dowel; use the end bolt lock.')
      }
      info.bolt = `M6 × ${boltL} socket cap screw`
      info.boltL = boltL
      info.headZ = headZ
      info.wedge = { L: wL, d0: 2 * (rBot - 0.1), d1: 2 * (wTop - 0.1) }
    } else {
      // glued: glue grooves round the spigot and a rivet hole straight across
      for (let i = 0; i < 3; i++) {
        const z = -p.inL + 6 + i * ((p.inL - 12) / 2)
        m = k(m.subtract(k(cyl(rs + 1, z, z + 1.5).subtract(cyl(rs - 0.5, z - 1, z + 3)))))
      }
      m = k(m.subtract(k(k(k(Manifold.cylinder(2 * ro + 2, 1.65, 1.65, 16)).rotate([0, 90, 0])).translate([-ro - 1, 0, -p.inL / 2]))))
      info.rivet = { z: -p.inL / 2, d: 3.3 }
      if (lock === 'bolt') { m = k(m.subtract(cyl(2.5, fT + 2, z1 + 0.1, 20))); info.tap = 'M6 tapped hole in the stub top (5 mm drill, 20 mm deep)' }
    }
    if (lock === 'grub') {
      // a round groove all round: the grub screw's point sits in it at any angle, and it cannot pull off
      const g = k(k(k(CrossSection.circle(2.8, 24)).translate([rst + 1.4, 0])).revolve(96))
      m = k(m.subtract(k(g.translate([0, 0, zL]))))
      info.groove = { z: zL, d: 2 * (rst - 1.4), w: 5.6 }
    } else if (lock === 'pin') {
      m = k(m.subtract(k(k(k(Manifold.cylinder(2 * ro + 2, 2.7, 2.7, 24)).rotate([0, 90, 0])).translate([-ro - 1, 0, zL]))))
      info.pin = { z: zL, d: 5.4 }
    }
    const g = (m.volume() / 1000) * density
    const meshes = { combined: meshData(m) }
    const hw = []
    if (wedge) hw.push(wedge, cyl(2.95, -p.inL - 2, info.headZ), cyl(5, info.headZ, info.headZ + 6))
    if (info.washer) hw.push(cyl(info.washer.od / 2, z1 + 1, z1 + 3.5, 48))
    if (hw.length) meshes.rods = meshData(k(Manifold.union(hw)))
    if (wedge) meshes.wedgeFlat = meshData(k(wedge.translate([0, 0, p.inL + 2])))
    // the lathe profile (both halves) for the drawing and the DXF
    const side = [[...pts.slice(1, -1), ...pts.slice(1, -1).reverse().map(([r, z]) => [-r, z])]]
    const circle = []
    for (let i = 0; i < 64; i++) circle.push([ro * Math.cos((TAU * i) / 64), ro * Math.sin((TAU * i) / 64)])
    return {
      dowel: { ...info, g, density, D: 2 * ro, len: z1 + p.inL },
      meshes,
      viewR: (z1 + p.inL) * 0.65,
      polygons: { base: [circle], relief: [], pods: [], weak: [] },
      layers: { cut: side, holes: [], drill: [], pocket: [], pocketDepth: 0, engrave: [] },
      podH: 0, ring: null, snap: null, cnc: true,
      stats: { tris: meshes.combined.indices.length / 3, grams: g, gramsTotal: g, warns, height: z1 + p.inL },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

/** A lathe drawing for the machine shop: the profile 1:1 and every feature listed. */
export function dowelDrawingSVG(hub, p, matName, name) {
  const v = hub.dowel, side = hub.layers.cut[0]
  const top = v.z1, bot = -p.inL - (p.lipL > 0 ? 0 : 0)
  const H = top - bot, W = Math.max(110, v.D + 90), pad = 20
  const X = (x) => (x + W / 2).toFixed(2), Y = (z) => (top - z + pad).toFixed(2)
  const path = 'M' + side.map(([x, z]) => `${X(x)},${Y(z)}`).join('L') + 'Z'
  const notes = [
    `Stub Ø${(p.poleOD - 0.1).toFixed(2)} (h7 slide fit in the hub bore) × ${v.stubL.toFixed(1)} long. Flange Ø${v.D.toFixed(2)} × ${p.flangeT} thick.`,
    p.lipL > 0 ? `Lip: bore Ø${(p.poleOD + 0.3).toFixed(2)} × ${p.lipL} deep from the flange, over the outside of the pole.` : 'No lip: flat flange on the pole end.',
    `Spigot Ø${(2 * v.rs).toFixed(2)} × ${p.inL} into the pole (pole inside Ø${(2 * v.ri).toFixed(2)}).`,
  ]
  if (v.expand) {
    notes.push(`Ø6.6 through. Taper bore in the spigot, Ø${(v.wedge.d0 + 0.2).toFixed(2)} at the bottom closing to Ø7.2. Three slots 1.2 wide, ${p.inL - 6} long from the bottom, at 120°.`)
    notes.push(`Wedge (steel or brass): cone Ø${v.wedge.d0.toFixed(2)} → Ø${v.wedge.d1.toFixed(2)} over ${v.wedge.L} mm, drilled 5.0 and tapped M6. Bolt: ${v.bolt}.`)
    if (v.lock !== 'bolt') notes.push(`Counterbore Ø11.4 from the stub top down to ${(v.headZ).toFixed(1)} mm above the pole end, for the bolt head.`)
  } else {
    notes.push(`Glue grooves: three, 0.6 deep × 1.5 wide round the spigot. Rivet hole Ø3.3 straight across at ${(-v.rivet.z).toFixed(0)} mm into the pole (drill the pole to match after gluing).`)
    if (v.tap) notes.push(v.tap + '.')
  }
  if (v.groove) notes.push(`Lock groove: R2.8 round groove, ${(v.groove.z - p.flangeT).toFixed(1)} mm above the flange, Ø${v.groove.d.toFixed(2)} at the bottom.`)
  if (v.pin) notes.push(`Cross hole Ø5.4 straight through the stub, ${(v.pin.z - p.flangeT).toFixed(1)} mm above the flange.`)
  if (v.washer) notes.push(`End bolt: a Ø${v.washer.od} × ${v.washer.t} mm stainless washer (Ø6.4 hole) over the hub face; the stub stops 1 mm short of the hub face so the washer clamps the hub.`)
  notes.push('Break all edges 0.3 mm. Aluminium 6061-T6, or stainless 303/304 for the heaviest use.')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W + 20}mm" height="${H + 2 * pad + 14 + notes.length * 5.5}mm" viewBox="0 0 ${W + 20} ${H + 2 * pad + 14 + notes.length * 5.5}">
<rect width="100%" height="100%" fill="#fff"/>
<g font-family="Helvetica,Arial,sans-serif">
<text x="6" y="10" font-size="6" font-weight="700">${name}: locking dowel, lathe profile, 1:1 (mm)</text>
<text x="6" y="16" font-size="4">${matName}. ${(v.len).toFixed(1)} mm overall, Ø${v.D.toFixed(2)} at the flange. Pole end at 0; the stub (top) takes the hub. Turn from Ø${Math.ceil(v.D + 2)} bar.</text>
<path d="${path}" fill="#eef1f5" stroke="#000" stroke-width="0.35"/>
<line x1="${X(-v.D / 2 - 6)}" y1="${Y(0)}" x2="${X(v.D / 2 + 6)}" y2="${Y(0)}" stroke="#c00" stroke-width="0.25" stroke-dasharray="2 1.5"/>
<text x="${X(v.D / 2 + 7)}" y="${(+Y(0) + 1.4).toFixed(2)}" font-size="3.5" fill="#c00">pole end</text>
<line x1="${W / 2}" y1="${pad - 5}" x2="${W / 2}" y2="${H + pad + 5}" stroke="#06c" stroke-width="0.2" stroke-dasharray="3 2"/>
${notes.map((t, i) => `<text x="6" y="${H + 2 * pad + 6 + i * 5.5}" font-size="3.8">${t}</text>`).join('\n')}
</g></svg>\n`
}

export function dowelDesigns() {
  const d = (id, name, lock, blurb) => ({
    id, name, group: 'Dowels', blurb, dowel: true, lock, cncOnly: true, cnc: { material: 'al6061' }, added: '2026-11-22',
    params: DOWEL_PARAMS.map((x) => (lock === 'bolt' && x.key === 'lockD' ? null : { ...x })).filter(Boolean),
    draw: () => {},
  })
  return [
    d('dowelGrub', 'Locking Dowel: Grub Screw', 'grub', 'A metal dowel for the pole end: it expands inside the pole when you turn an allen key, a lip wraps the outside of the pole end, and the stub that sticks out has a groove all round. The hub slides on and an M5 grub screw in its collar drops into the groove, so it can never fly off. Turn on Lock onto a metal dowel in the hub.'),
    d('dowelPin', 'Locking Dowel: Cross Pin', 'pin', 'The same dowel with a hole straight through the stub: an M5 bolt (with an all-metal lock nut) or a clevis pin with an R-clip goes right through the hub collar and the dowel. The most positive lock there is.'),
    d('dowelBolt', 'Locking Dowel: End Bolt', 'bolt', 'The dowel bolt does everything: it goes down through a big washer over the hub face, through the stub, into the wedge. One turn of the allen key expands the dowel in the pole and clamps the hub onto it.'),
  ]
}
