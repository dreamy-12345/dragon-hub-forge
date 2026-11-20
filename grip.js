/**
 * Hub-to-pole grips for rigid (metal, PETG, nylon) hubs: they don't stretch
 * like TPU, so they need a clamp, and a clamp must never crush a hollow carbon
 * pole. Both parts print in PETG or nylon with common bolts and nuts, and the
 * STL works for a machinist too. Both share the forge's collar bolt pattern:
 * 4 × M4 on a 44 mm circle, the same as the CNC hub plates' "Collar bolts".
 *
 *   expander  slides INSIDE the pole end: a slotted sleeve and a wedge; one M6
 *             bolt pulls the wedge up and the fingers grip the inside of the
 *             tube. The hub bolts to its flange. Nothing squeezes the carbon.
 *   clamp     a split collar round the OUTSIDE of the pole with one M5 pinch
 *             bolt. Use a Pole Insert inside the pole under it.
 * Units mm; z up, the pole end at z = 0 (pole below).
 */
import { TAU } from './geom.js'

export const GRIP_PARAMS = [
  { key: 'poleOD', label: 'Pole outside', unit: 'mm', min: 10, max: 40, step: 0.1, value: 22, presets: [13, 16, 22] },
  { key: 'poleWall', label: 'Pole wall', unit: 'mm', min: 0.5, max: 5, step: 0.05, value: 1.5, hint: 'Carbon dragon staff tube is often 22 × 19 mm: a 1.5 mm wall. Measure yours.' },
  { key: 'pcd', label: 'Hub bolt circle', unit: 'mm', min: 30, max: 80, step: 0.5, value: 44, hint: '4 × M4 bolts on this circle: the same as the CNC hub plates (Collar bolts).' },
  { key: 'gripL', label: 'Grip length', unit: 'mm', min: 15, max: 60, step: 1, value: 30, hint: 'Longer grips more pole.' },
]

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

/**
 * The expanding spigot on its own (also used under the machined spoke hubs):
 * a sleeve from z = -L to 0 with slots open at the bottom and a bore that
 * narrows upwards, plus the wedge that is pulled up into it.
 */
export function expanderParts(wasm, k, { ri, L }) {
  const { Manifold } = wasm
  const rBot = ri - 1.8, rTop = 3.7, taperL = Math.min(L - 6, 24)
  let sleeve = k(k(Manifold.cylinder(L, ri, ri, 64)).translate([0, 0, -L]))
  sleeve = k(sleeve.subtract(k(k(Manifold.cylinder(L + 20, 3.3, 3.3, 24)).translate([0, 0, -L - 1])))) // M6 clearance
  sleeve = k(sleeve.subtract(k(k(Manifold.cylinder(taperL, rBot, rTop, 48)).translate([0, 0, -L - 0.01]))))
  const slots = []
  for (let i = 0; i < 4; i++) slots.push(k(k(k(Manifold.cube([2 * ri + 2, 1.6, L - 6 + 0.01], false)).translate([0, -0.8, -L - 0.01])).rotate([0, 0, 45 + 90 * i])))
  sleeve = k(sleeve.subtract(k(Manifold.union(slots))))
  // wedge: the same taper, shorter, an M6 nut trap underneath
  const wL = Math.min(18, taperL - 2), wTop = rBot - ((rBot - rTop) * wL) / taperL
  let wedge = k(Manifold.cylinder(wL, rBot - 0.1, wTop - 0.1, 48))
  wedge = k(wedge.subtract(k(k(Manifold.cylinder(wL + 2, 3.3, 3.3, 24)).translate([0, 0, -1]))))
  wedge = k(wedge.subtract(k(k(Manifold.cylinder(5.2, 10.2 / Math.sqrt(3), 10.2 / Math.sqrt(3), 6)).translate([0, 0, -0.01]))))
  return { sleeve, wedge, wL, rBot, rTop, taperL }
}

export function buildGrip(wasm, p, opts = {}) {
  const { Manifold, CrossSection } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const kind = opts.kind
    const warns = []
    const rIn = (p.poleOD - 2 * p.poleWall) / 2
    const fR = Math.max(p.poleOD / 2 + 3, p.pcd / 2 + 6)
    const boltHoles = (h, z0) => {
      const hs = []
      for (let i = 0; i < 4; i++) { const a = TAU * (i / 4 + 1 / 8); hs.push(k(k(Manifold.cylinder(h + 2, 2.25, 2.25, 20)).translate([(p.pcd / 2) * Math.cos(a), (p.pcd / 2) * Math.sin(a), z0 - 1]))) }
      return k(Manifold.union(hs))
    }
    let main, wedge = null, info
    if (kind === 'expander') {
      const ri = rIn - 0.15
      if (ri < 6) warns.push('The pole is too narrow inside for an expander (needs about 12 mm inside): use the Clamp Collar.')
      const ex = expanderParts(wasm, k, { ri, L: p.gripL })
      // cap: sits on the pole end; the hub bolts to it; the M6 head sinks into it
      const capT = 8
      let cap = k(Manifold.cylinder(capT, fR, fR, 96))
      cap = k(cap.subtract(boltHoles(capT, 0)))
      cap = k(cap.subtract(k(k(Manifold.cylinder(capT + 2, 3.3, 3.3, 24)).translate([0, 0, -1]))))
      cap = k(cap.subtract(k(k(Manifold.cylinder(6.2, 5.6, 5.6, 32)).translate([0, 0, capT - 6]))))
      main = k(cap.add(ex.sleeve))
      wedge = ex.wedge
      info = { kind, bolt: `M6 × ${Math.round((p.gripL + 8 - 6 + 4) / 5) * 5 + 5}`, ri, fR, capT }
      // view: wedge in place, near the bottom of the sleeve
      const shown = k(main.add(k(wedge.translate([0, 0, -p.gripL + 1]))))
      const flatMain = k(k(main.rotate([180, 0, 0])).translate([0, 0, capT])) // cap down on the bed
      return done(shown, { mainFlat: meshData(flatMain), wedgeFlat: meshData(wedge) }, info)
    }
    if (kind === 'thread' || kind === 'bayonet' || kind === 'snap') {
      // two halves, each glued (or cross-screwed) into a pole end; they join flush at the pole's outside size
      const ri = rIn - 0.12, Ro = p.poleOD / 2, sl = p.gripL, colL = 22, stubR = Math.min(ri - 0.6, Ro - 2.6)
      const sleeve = (z0, dir) => k(k(Manifold.cylinder(sl, ri, ri, 64)).translate([0, 0, dir > 0 ? z0 : z0 - sl]))
      const cross = (z) => k(k(k(Manifold.cylinder(2 * Ro + 4, 1.65, 1.65, 16)).rotate([90, 0, 0])).translate([0, Ro + 2, z]))
      // half A: sleeve into pole A (z < 0), a collar, and the stub that goes into half B
      let A = k(Manifold.union([sleeve(-4, -1), k(k(Manifold.cylinder(4, Ro, Ro, 64)).translate([0, 0, -4]))]))
      // half B: collar (z from 0 to colL) the stub goes into, then the sleeve into pole B
      let B = k(Manifold.union([k(Manifold.cylinder(colL, Ro, Ro, 64)), sleeve(colL, 1)]))
      const stubL = colL - 2
      let stub, hole
      if (kind === 'thread') {
        // a coarse printable thread: an off-centre circle, twisted as it is extruded, makes a helix
        const pitch = 4, e = 0.9, rS = stubR - e - 0.2
        const prof = k(k(CrossSection.circle(rS, 48)).translate([e, 0]))
        stub = k(prof.extrude(stubL, Math.ceil(stubL * 4), (360 * stubL) / pitch))
        const profF = k(k(CrossSection.circle(rS + 0.35, 48)).translate([e, 0]))
        hole = k(k(profF.extrude(stubL + 1, Math.ceil(stubL * 4), (360 * (stubL + 1)) / pitch)).translate([0, 0, -0.01]))
        info = { kind, bolt: 'none: the halves screw together (glue or cross-screw each half into its pole)', ri, fR: Ro }
      } else if (kind === 'bayonet') {
        stub = k(Manifold.cylinder(stubL, stubR - 0.3, stubR - 0.3, 64))
        // two pins near the top of the stub
        for (const a of [0, 180]) stub = k(stub.add(k(k(k(k(Manifold.cylinder(3, 1.9, 1.9, 16)).rotate([0, 90, 0])).translate([stubR - 0.5, 0, stubL - 5])).rotate([0, 0, a]))))
        hole = k(k(Manifold.cylinder(stubL + 1, stubR, stubR, 64)).translate([0, 0, -0.01]))
        // L-slots: straight in, then a quarter turn with a little dip to lock
        const slots = []
        for (const a of [0, 180]) {
          const ax = k(k(Manifold.cube([4, 4.4, stubL - 2], false)).translate([stubR - 1.2, -2.2, -0.01]))
          const turn = []
          for (let t = 0; t <= 80; t += 8) turn.push(k(k(k(Manifold.cube([4, 4.4, 4.4], false)).translate([stubR - 1.2, -2.2, stubL - 7.2])).rotate([0, 0, t])))
          const dip = k(k(k(Manifold.cube([4, 4.4, 5.6], false)).translate([stubR - 1.2, -2.2, stubL - 7.2 - 1.2])).rotate([0, 0, 88]))
          slots.push(k(k(Manifold.union([ax, ...turn, dip])).rotate([0, 0, a])))
        }
        hole = k(hole.add(k(Manifold.union(slots))))
        info = { kind, bolt: 'none: push in and twist a quarter turn (glue or cross-screw each half into its pole)', ri, fR: Ro }
      } else {
        // snap button: a hollow stub holds a bought V-spring button clip; the button pops through a hole in the collar
        stub = k(k(Manifold.cylinder(stubL, stubR - 0.3, stubR - 0.3, 64)).subtract(k(k(Manifold.cylinder(stubL + 2, stubR - 2.2, stubR - 2.2, 48)).translate([0, 0, 2]))))
        stub = k(stub.subtract(k(k(k(Manifold.cylinder(8, 3.2, 3.2, 24)).rotate([0, 90, 0])).translate([0, 0, stubL - 7]))))
        hole = k(k(Manifold.cylinder(stubL + 1, stubR, stubR, 64)).translate([0, 0, -0.01]))
        hole = k(hole.add(k(k(k(Manifold.cylinder(Ro + 2, 3.3, 3.3, 24)).rotate([0, 90, 0])).translate([0, 0, stubL - 7]))))
        info = { kind, bolt: 'a 6 mm V-spring snap button clip (as sold for tent poles and paddles)', ri, fR: Ro }
      }
      A = k(A.add(stub))
      B = k(B.subtract(hole))
      // two cross holes per half so it can be screwed into its pole as well as glued
      A = k(A.subtract(k(Manifold.union([cross(-4 - sl * 0.3), cross(-4 - sl * 0.75)]))))
      B = k(B.subtract(k(Manifold.union([cross(colL + sl * 0.3), cross(colL + sl * 0.75)]))))
      const shown = k(Manifold.union([k(A.translate([0, 0, -12])), B]))
      const flatA = k(k(A.rotate([180, 0, 0])).translate([0, 0, 0]))
      const aBox = flatA.boundingBox()
      return done(shown, { mainFlat: meshData(k(flatA.translate([0, 0, -aBox.min[2]]))), wedgeFlat: meshData(B) }, { ...info, halves: true })
    }
    if (kind === 'joiner') {
      // joins two pole sections: a sleeve inside both, a stop ring between them, cross screws through each tube
      const ri = rIn - 0.12, half = p.gripL + 5, stopW = 4
      let j = k(k(Manifold.cylinder(2 * half + stopW, ri, ri, 64)).translate([0, 0, -half - stopW / 2]))
      j = k(j.add(k(k(Manifold.cylinder(stopW, p.poleOD / 2, p.poleOD / 2, 64)).translate([0, 0, -stopW / 2]))))
      j = k(j.subtract(k(k(Manifold.cylinder(2 * half + 10, Math.max(2, ri - 4), Math.max(2, ri - 4), 32)).translate([0, 0, -half - 5])))) // light: hollow core
      const screws = []
      for (const zs of [-1, 1]) for (const zz of [0.35, 0.75]) screws.push(k(k(k(Manifold.cylinder(2 * ri + 4, 1.65, 1.65, 16)).rotate([90, 0, zz > 0.5 ? 90 : 0])).translate([0, 0, zs * (stopW / 2 + half * zz)])))
      // M4 screws self-tap into 3.3 mm holes (rotate the two on each side 90° apart)
      for (let i = 0; i < screws.length; i++) screws[i] = k(screws[i].translate([0, 0, 0]))
      j = k(j.subtract(k(Manifold.union(screws.map((m, i) => k(m.translate([0, i % 2 ? 0 : 0, 0])))))))
      info = { kind, bolt: '4 × M4 × 25 (through the tube walls)', ri, fR: p.poleOD / 2 }
      const flatJ = k(j.translate([0, 0, half + stopW / 2]))
      return done(j, { mainFlat: meshData(flatJ) }, info)
    }
    // clamp collar
    const rp = (p.poleOD + 0.2) / 2, rO = rp + 5.5, H = p.gripL, fT = 5
    let c = k(Manifold.cylinder(H, rO, rO, 96))
    c = k(c.add(k(Manifold.cylinder(fT, fR, fR, 96))))
    const lugX0 = rp + 1, lugX1 = rO + 11
    c = k(c.add(k(k(Manifold.cube([lugX1 - lugX0, 18, H - fT], false)).translate([lugX0, -9, fT]))))
    c = k(c.subtract(k(k(Manifold.cylinder(H + 2, rp, rp, 96)).translate([0, 0, -1]))))
    c = k(c.subtract(boltHoles(fT, 0)))
    // the split, and the pinch bolt across it
    c = k(c.subtract(k(k(Manifold.cube([fR + 20, 1.6, H + 2], false)).translate([rp - 1, -0.8, -1]))))
    const bx = (rO + lugX1) / 2 + 1, bz = fT + (H - fT) / 2
    c = k(c.subtract(k(k(k(Manifold.cylinder(30, 2.75, 2.75, 24)).rotate([90, 0, 0])).translate([bx, 15, bz]))))
    c = k(c.subtract(k(k(k(Manifold.cylinder(4.5, 8.2 / Math.sqrt(3), 8.2 / Math.sqrt(3), 6)).rotate([90, 0, 0])).translate([bx, -9 + 4.49, bz])))) // M5 nut trap
    info = { kind, bolt: 'M5 × 25', rp, fR }
    return done(c, { mainFlat: meshData(c) }, info)

    function done(shown, flats, info2) {
      const g = (shown.volume() / 1000) * (opts.density || 1.27)
      const meshes = { combined: meshData(shown), ...flats }
      const circle = []
      for (let i = 0; i < 64; i++) circle.push([fR * Math.cos((TAU * i) / 64), fR * Math.sin((TAU * i) / 64)])
      return {
        grip: { ...info2, rIn },
        meshes,
        viewR: 50,
        polygons: { base: [circle], relief: [], pods: [], weak: [] },
        podH: 0, ring: null, snap: null,
        stats: { tris: meshes.combined.indices.length / 3, grams: g, gramsTotal: g, warns, height: p.gripL },
      }
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function gripDesigns() {
  const d = (id, name, kind, blurb) => ({
    id, name, group: ['thread', 'bayonet', 'snap', 'joiner'].includes(kind) ? 'Collapsible' : 'Grips', blurb, grip: true, kind, added: '2026-11-20',
    params: GRIP_PARAMS.map((x) => ({ ...x })),
    draw: () => {},
  })
  return [
    d('gripExpander', 'End Expander', 'expander', 'Slides inside the end of a carbon pole: tighten one M6 bolt and a wedge spreads its fingers against the inside of the tube. Bolt any metal or rigid hub to its flange. Nothing squeezes the carbon from outside, so it cannot crush it.'),
    d('jointThread', 'Screw Joint', 'thread', 'A collapsible staff joint: two halves, one in each pole section, that screw together on a coarse printed thread. Flush with the pole, no tools. Take your staff apart for travel.'),
    d('jointBayonet', 'Twist-Lock Joint', 'bayonet', 'A collapsible staff joint that pushes together and locks with a quarter turn (a bayonet): two pins drop into L-shaped slots and click into a little dip. Fastest to put together.'),
    d('jointSnap', 'Snap-Button Joint', 'snap', 'A collapsible staff joint with a spring button, like tent poles and kayak paddles: push it together and the button pops out through the hole. Uses a common 6 mm V-spring snap button clip.'),
    d('gripJoiner', 'Pole Joiner', 'joiner', 'Joins two pole sections into one staff (a 2- or 3-piece travel staff): a sleeve slides into both tubes up to a stop ring, and M4 screws go through holes drilled in each tube wall into it. Take the screws out and the staff comes apart for travel.'),
    d('gripClamp', 'Clamp Collar', 'clamp', 'A split collar that clamps round the pole with one M5 pinch bolt, with a flange the hub plate bolts to. For hubs that sit along the pole. Always fit a Pole Insert inside the pole under it.'),
  ]
}
