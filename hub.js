/**
 * Dragon staff hub geometry. Give it the manifold-3d wasm module, a design
 * (designs.js) and parameters; get back printable meshes plus strength,
 * balance and capsule-fit stats. Runs in the browser worker and in node.
 *
 * Units mm, +y up, the staff runs along z. Prints flat: everything grows up
 * from the bed at z=0. A hub is built in levels:
 *
 *   frame   low thin web (struts, vines, veins) + rim + collar        frameH
 *   relief  shapes that stand proud so they read while spinning       reliefH
 *   pods    hollow glowing cups, each with a snap-in capsule cradle,   podH
 *           a dark bezel round them and an optional diffuser lid
 *
 * The frame is filleted (grow then shrink) so every inside corner is round:
 * sharp corners are where a dropped hub cracks first.
 */

import { DESIGNS } from './designs.js'
import { TAU, rot, ccw, capsuleRect, Canvas } from './geom.js'
import { buildSpokeHub } from './cnc.js'
import { buildBallEnd } from './balls.js'
import { buildSleeve } from './inserts.js'
import { buildPracticeSpoke } from './practice.js'
import { buildNovelty } from './novelty.js'
import { buildDart } from './darts.js'
import { buildGrip } from './grip.js'
import { buildMould } from './moulds.js'
import { buildHoop, buildHoopJoint } from './hoops.js'
import { buildBubblePoi } from './bubblepoi.js'
import { buildSword } from './swords.js'
import { buildAcro, buildAcroMetal } from './acro.js'
import { buildTubeSword, buildTubeAxe, buildTubeMace, buildPlateAxe } from './tubeswords.js'
import { buildFist } from './fist.js'
import { buildBubbleHub } from './bubblehub.js'
import { buildHilt } from './hilt.js'
import { buildCage } from './cages.js'
import { buildDowel, LOCK_PARAMS, LOCKS, lockKey, hubLockZ } from './dowel.js'

export { DESIGNS }

// density g/cm3
export const MATERIALS = {
  tpu95: { name: 'TPU 95A', density: 1.21, verdict: 'best', note: 'Flexes on impact and springs back. What commercial flow hubs use. Clear/natural 95A makes the best glowing pods.' },
  tpuuv: { name: 'TPU 95A, UV / neon', density: 1.21, verdict: 'best', note: 'Neon TPU 95A exists (e.g. Genmitsu neon yellow, green, cyan) but UV-reactive TPU is rarer than UV PLA: check the listing says fluorescent or UV-reactive, or test a sample with a UV torch.' },
  tpu98: { name: 'TPU 98A / 64D', density: 1.23, verdict: 'best', note: 'Stiffer TPU. Pick this if 95A feels floppy at 250 mm or the low frame sags.' },
  pa: { name: 'Nylon (PA / PA-CF)', density: 1.14, verdict: 'good', note: 'Very tough, but rigid. Must be dried; warps on big flat parts. Not for the glowing pods.' },
  petg: { name: 'PETG', density: 1.27, verdict: 'ok', note: 'Fine for testing. Clear PETG glows beautifully but cracks at struts after hard drops.' },
  pla: { name: 'PLA', density: 1.24, verdict: 'avoid', note: 'Shatters. Only for checking fit and looks.' },
}

export const COMMON_PARAMS = [
  { key: 'diameter', label: 'Diameter', unit: 'mm', min: 120, max: 300, step: 1, value: 280, group: 'Size', hint: 'Standard is 280 mm.' },
  { key: 'rimW', label: 'Rim width', unit: 'mm', min: 4, max: 30, step: 0.5, value: 9, group: 'Size' },
  { key: 'rimH', label: 'Rim height', unit: 'mm', min: 2, max: 28, step: 0.5, value: 15, group: 'Size', hint: 'The outer weight ring. Standard is 15 mm: more mass at the edge = longer, smoother spins.' },
  { key: 'rotate', label: 'Pattern rotation', unit: '°', min: 0, max: 120, step: 0.5, value: 0, group: 'Size' },

  { key: 'frameH', label: 'Frame height', unit: 'mm', min: 2, max: 15, step: 0.5, value: 4, group: 'Levels', hint: 'Keep the support web low so the shapes above it stand out.' },
  { key: 'strutW', label: 'Frame strut width', unit: 'mm', min: 1.5, max: 10, step: 0.1, value: 3.2, group: 'Levels' },
  { key: 'reliefH', label: 'Shape height', unit: 'mm', min: 3, max: 25, step: 0.5, value: 10, group: 'Levels', hint: 'How tall the dragonflies stand above the bed. Standard is 10 mm, level with the rim.' },
  { key: 'fillet', label: 'Corner fillet', unit: 'mm', min: 0, max: 5, step: 0.1, value: 1.6, group: 'Levels', hint: 'Rounds every inside corner of the frame.' },

  { key: 'capD', label: 'Capsule diameter', unit: 'mm', min: 10, max: 30, step: 0.1, value: 21, group: 'Glow', hint: 'A common LED capsule is Ø21 mm. Measure yours.' },
  { key: 'capL', label: 'Capsule length', unit: 'mm', min: 40, max: 120, step: 0.5, value: 88, group: 'Glow', hint: 'Capsule 2.C is 88 mm, the older Capsule 2.0 is 95 mm. Measure yours.' },
  { key: 'capMass', label: 'Capsule weight', unit: 'g', min: 0, max: 80, step: 1, value: 32, group: 'Glow' },
  { key: 'capClr', label: 'Capsule clearance', unit: 'mm', min: 0, max: 2, step: 0.05, value: 0.5, group: 'Glow' },
  { key: 'slotPct', label: 'Snap opening', unit: '%', min: 60, max: 100, step: 1, value: 82, group: 'Glow', hint: 'Width of the slot the capsule pushes through, as % of its diameter. Smaller holds tighter.' },
  { key: 'podWall', label: 'Lantern wall', unit: 'mm', min: 0.8, max: 4, step: 0.1, value: 1.6, group: 'Glow' },
  { key: 'podFloor', label: 'Lantern floor', unit: 'mm', min: 0.8, max: 4, step: 0.1, value: 1.4, group: 'Glow' },
  { key: 'cradleWall', label: 'Cradle wall', unit: 'mm', min: 0.8, max: 4, step: 0.1, value: 1.6, group: 'Glow' },
  { key: 'bezelW', label: 'Dark bezel', unit: 'mm', min: 0, max: 6, step: 0.1, value: 2.4, group: 'Glow', hint: 'Frame-coloured outline round each lantern, like the lead in stained glass.' },
  { key: 'membraneH', label: 'Wing membrane', unit: 'mm', min: 0.8, max: 4, step: 0.1, value: 2, group: 'Glow', hint: 'Clear plate under the veins that carries light out of the body. Thinner glows brighter but flexes more.' },
  { key: 'lid', label: 'Diffuser lid', options: ['on', 'off'], value: 'on', group: 'Glow', hint: 'A thin clear lid that presses into a ledge. Without it the lantern is an open cup.' },
  { key: 'lidT', label: 'Lid thickness', unit: 'mm', min: 0.6, max: 3, step: 0.1, value: 1.2, group: 'Glow' },

  { key: 'ring', label: 'Bubble weight ring', options: ['off', 'on'], value: 'off', group: 'Weight ring', hint: 'A tyre that wraps the outside edge of the rim, with bubble loops round it: more spin from weight at the very edge, and bubbles when it is dipped and spun.' },
  { key: 'bandT', label: 'Tyre wall', unit: 'mm', min: 1.6, max: 8, step: 0.1, value: 3, group: 'Weight ring', hint: 'Thicker = heavier = longer spins.' },
  { key: 'bandFit', label: 'Tyre fit', unit: 'mm', min: -2, max: 1, step: 0.1, value: -0.6, group: 'Weight ring', hint: 'Below zero the tyre is smaller than the rim and stretches on, like a bike tyre.' },
  { key: 'flangeW', label: 'Flange under rim', unit: 'mm', min: 0, max: 20, step: 0.5, value: 9, group: 'Weight ring', hint: 'Sits under the rim on the side away from the collar; the bolts go through it.' },
  { key: 'flangeT', label: 'Flange thickness', unit: 'mm', min: 1, max: 5, step: 0.1, value: 2, group: 'Weight ring' },
  { key: 'ringPlace', label: 'Loop placement', options: ['snap ring', 'edge', 'flat face', 'internal'], value: 'snap ring', group: 'Weight ring', hint: 'Snap ring (no tools): the loops are part of a one-piece TPU weight hoop that stretches over the rim like a bike tyre, the same as the snap-on weight. Push the hub into it to fit, peel it off to take it away; no bolts. The loops stand on a shelf under the rim, on the side away from the collar, inside the outline. Internal: the loops print as part of the hub, standing up on the collar side just inside the rim, each fused into the rim and standing on a pad tied to it. Nothing sticks out past the rim and there are no bolts, so an edge-first drop lands on the rim, not the loops. Edge: a tyre round the rim with loops sticking out past it (biggest reach, but drops land on the loops). Flat face: a flat plate bolted under the hub on the side away from the collar, loops standing off it inside the outline, so drops land on the smooth rim. Flange width and thickness set the plate.' },
  { key: 'loops', label: 'Bubble loops', unit: '', min: 0, max: 40, step: 1, value: 14, group: 'Weight ring' },
  { key: 'loopD', label: 'Loop size', unit: 'mm', min: 8, max: 50, step: 0.5, value: 24, group: 'Weight ring', hint: 'Inside diameter. Bigger loops make bigger bubbles but use more mix per dip.' },
  { key: 'loopT', label: 'Loop wire', unit: 'mm', min: 1.6, max: 6, step: 0.1, value: 3, group: 'Weight ring' },
  { key: 'loopDir', label: 'Loops face', options: ['edge-on', 'flat'], value: 'edge-on', group: 'Weight ring', hint: 'Edge-on loops face the way the rim moves, so air goes through them while it spins or rolls; they print standing up. Flat loops print easiest but only blow when the hub moves face-first. Flat-face placement always uses edge-on.' },
  { key: 'scallop', label: 'Film grooves', options: ['on', 'off'], value: 'on', group: 'Weight ring', hint: 'Notches round the inside of each loop hold more mix, so a dip lasts longer.' },
  { key: 'bolts', label: 'Bolts', unit: '', min: 3, max: 16, step: 1, value: 8, group: 'Weight ring', hint: 'M3 bolts and nylock nuts through flange and rim. Every segment gets at least two.' },
  { key: 'boltD', label: 'Bolt hole', unit: 'mm', min: 2, max: 6, step: 0.1, value: 3.4, group: 'Weight ring' },

  { key: 'snap', label: 'Snap-on weight', options: ['off', 'light', 'medium', 'heavy'], value: 'off', group: 'Snap weight', hint: 'A TPU hoop that stretches over the rim like a bike tyre: no bolts, peel it off to change weight. Print all three and swap them for the spin you want. Not with the bubble ring.' },
  { key: 'snapLight', label: 'Light: block under rim', unit: 'mm', min: 0, max: 20, step: 0.5, value: 2, group: 'Snap weight' },
  { key: 'snapMedium', label: 'Medium: block under rim', unit: 'mm', min: 0, max: 25, step: 0.5, value: 6, group: 'Snap weight' },
  { key: 'snapHeavy', label: 'Heavy: block under rim', unit: 'mm', min: 0, max: 30, step: 0.5, value: 12, group: 'Snap weight', hint: 'The block sits under the rim on the side away from the collar. Deeper = heavier.' },
  { key: 'snapFit', label: 'Snap stretch', unit: 'mm', min: -3, max: 0.5, step: 0.1, value: -1, group: 'Snap weight', hint: 'How much smaller the hoop is than the rim. -1 mm grips well in TPU 95A; go to -1.5 if it creeps when spun hard.' },
  { key: 'snapWall', label: 'Outer wall', unit: 'mm', min: 1.2, max: 6, step: 0.1, value: 2.4, group: 'Snap weight' },
  { key: 'snapLip', label: 'Lip over rim', unit: 'mm', min: 1, max: 8, step: 0.5, value: 3, group: 'Snap weight', hint: 'How far the top lip reaches over the rim face. Its top is chamfered so the rim cams it open as you press the hub in.' },

  { key: 'snapLed', label: 'LED strip inside', options: ['off', 'on'], value: 'off', group: 'Snap weight', hint: 'Turns the worn weight into a lit ring: a 5 mm LED strip in a slot behind a thin window, wire groove, and two battery/controller pods under the hub. Needs a block at least 10 mm deep (it deepens it if not). Full plan: led-ring-plan.html.' },
  { key: 'ledSlotH', label: 'LED slot height', unit: 'mm', min: 4, max: 12, step: 0.1, value: 6, group: 'Snap weight', hint: '5 mm strip + heat-shrink + clearance.' },
  { key: 'ledSlotD', label: 'LED slot depth', unit: 'mm', min: 1.5, max: 4, step: 0.1, value: 2.4, group: 'Snap weight' },
  { key: 'ledWindow', label: 'Window in front of LEDs', unit: 'mm', min: 0.8, max: 2.5, step: 0.1, value: 1.2, group: 'Snap weight', hint: 'Natural TPU at 1.0–1.6 mm diffuses the LEDs into a line. Thicker = softer and tougher, dimmer.' },
  { key: 'ledRoof', label: 'Roof over slot', unit: 'mm', min: 1, max: 3, step: 0.1, value: 1.5, group: 'Snap weight', hint: 'Printed after the pause, bridging the slot.' },
  { key: 'podLen', label: 'Pod length', unit: 'mm', min: 40, max: 90, step: 1, value: 66, group: 'Snap weight', hint: '66 fits a 602030 LiPo + charger. 75 for a 403072.' },
  { key: 'podDepth', label: 'Pod reach inward', unit: 'mm', min: 16, max: 35, step: 0.5, value: 24, group: 'Snap weight' },
  { key: 'podAngle', label: 'Pod position', unit: '°', min: -180, max: 180, step: 1, value: 0, group: 'Snap weight', hint: 'Turn the pods so they land between spokes, clear of shapes on the underside.' },
  { key: 'podA', label: 'Pod A contents', unit: 'g', min: 0, max: 40, step: 0.5, value: 9.5, group: 'Snap weight', hint: 'Battery + charger + switch. Weigh yours.' },
  { key: 'podB', label: 'Pod B contents', unit: 'g', min: 0, max: 40, step: 0.5, value: 9.5, group: 'Snap weight', hint: 'Controller + button + trim weight. Match pod A within 1 g.' },
  { key: 'stripG', label: 'Strip and wire', unit: 'g', min: 0, max: 30, step: 0.5, value: 10, group: 'Snap weight' },

  { key: 'poleOD', label: 'Hub fits pole (OD)', unit: 'mm', min: 10, max: 40, step: 0.1, value: 22, presets: [13, 16, 22], group: 'Fit', hint: 'The pole the hub bore is made for. Standard dragon staffs are 22 mm; pick 16 or 13 to print a hub straight for a thinner pole. The rest of the hub stays the same. To use a 22 mm hub on a thinner pole, print a pole adaptor (in the design list).' },
  { key: 'fit', label: 'Bore clearance', unit: 'mm', min: -1, max: 1.5, step: 0.05, value: 0.3, group: 'Fit', hint: 'Bore = pole + this. The ribs do the gripping.' },
  { key: 'ribs', label: 'Crush ribs', unit: '', min: 0, max: 12, step: 1, value: 6, group: 'Fit' },
  { key: 'ribH', label: 'Rib height', unit: 'mm', min: 0.1, max: 1.5, step: 0.05, value: 0.55, group: 'Fit' },
  { key: 'collarOD', label: 'Collar OD', unit: 'mm', min: 26, max: 70, step: 0.5, value: 38, group: 'Fit' },
  { key: 'collarH', label: 'Collar length', unit: 'mm', min: 4, max: 60, step: 0.5, value: 26, group: 'Fit', hint: 'Longer collar keeps the disc square to the staff.' },
  { key: 'flareW', label: 'Collar flare', unit: 'mm', min: 0, max: 20, step: 0.5, value: 8, group: 'Fit', hint: 'Cone where the collar meets the web, so a hit on the rim does not snap the collar off.' },
  ...LOCK_PARAMS,
  { key: 'screw', label: 'Set-screw pilot', unit: 'mm', min: 0, max: 5, step: 0.1, value: 0, group: 'Fit', hint: '0 = none. 3.3 for an M4 screw tapped straight into TPU.' },
]

/** A bore of radius r with crush ribs bulging into it. */
function ribbedBore(CrossSection, k, r, ribs, ribH) {
  let bore = k(CrossSection.circle(r, 96))
  const ribR = 1.2
  for (let i = 0; i < ribs; i++) {
    const [x, y] = rot([r + ribR - ribH, 0], (TAU * i) / ribs + Math.PI / ribs)
    bore = k(bore.subtract(k(k(CrossSection.circle(ribR, 24)).translate([x, y]))))
  }
  return bore
}

/** Height of the set-screw hole, or null when there is none. T = frame thickness. */
function screwZ(p, T) {
  if (!(p.screw > 0 && p.collarH > T + p.screw + 2)) return null
  return Math.min(T + (p.collarH - T) / 2 + Math.min(p.flareW, p.collarH - T) / 2, p.collarH - p.screw)
}

/**
 * Pole adaptor: a tube that makes a thin pole as fat as a hub's bore. Its OD is
 * exactly the hub's pole size, so the hub's own ribs grip it like a real pole;
 * its bore has ribs for the thin pole. Built lip-down, the way it prints.
 */
function buildAdaptor(wasm, p, opts) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const rOut = p.big / 2
    const rIn = (p.small + p.fit) / 2
    const ribTip = p.ribs > 0 ? rIn - p.ribH : rIn
    const wall = rOut - rIn - (p.ribs > 0 ? p.ribH : 0)
    const lipR = rOut + (p.lip > 0 ? p.lipW : 0)
    let bore = ribbedBore(CrossSection, k, rIn, p.ribs, p.ribH)
    if (p.style === 'collet') bore = k(bore.add(k(k(CrossSection.square([lipR + 2, p.slit], true)).translate([(lipR + 2) / 2, 0]))))
    const tubeSec = k(k(CrossSection.circle(rOut, 128)).subtract(bore))
    const lipSec = k(k(CrossSection.circle(lipR, 128)).subtract(bore))
    let solid = k(tubeSec.extrude(p.length + p.lip))
    if (p.lip > 0) solid = k(solid.add(k(lipSec.extrude(p.lip))))
    if (p.screw > 0) {
      // clearance hole halfway up the part the hub sits on, for the hub's set screw
      const z = p.lip + p.length / 2
      solid = k(solid.subtract(k(k(k(Manifold.cylinder(lipR * 3, (p.screw + 0.8) / 2, (p.screw + 0.8) / 2, 24)).rotate([0, 90, 0])).translate([-lipR * 1.5, 0, z]))))
    }
    const mat = opts.material || MATERIALS.tpu95
    const mesh = meshData(solid)
    const grams = (solid.volume() / 1000) * mat.density
    const box = solid.boundingBox()
    return {
      meshes: { combined: mesh },
      polygons: { base: lipSec.toPolygons(), relief: tubeSec.toPolygons(), pods: [], weak: [] },
      viewR: lipR + 3,
      podH: 0,
      ring: null,
      snap: null,
      colourChangeAt: null,
      adaptor: { small: p.small, big: p.big, wall, ok: wall >= 1.2 && p.small < p.big, squeeze: p.small - 2 * ribTip, length: p.length + p.lip, lipD: 2 * lipR, collet: p.style === 'collet' },
      stats: {
        grams, gramsRing: 0, gramsSnap: 0, gramsTotal: grams, gramsLids: 0, split: null, capsules: 0, capWarn: [],
        centroidOffset: 0, cx: 0, cy: 0, imbalance: 0, dropped: 0, parts: solid.decompose().map(k).length,
        weakArea: 0, minW: 0, boreD: 2 * rIn, ribTipD: 2 * ribTip, height: box.max[2] - box.min[2], tris: mesh.indices.length / 3,
      },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function defaults(design) {
  const p = {}
  for (const d of COMMON_PARAMS) p[d.key] = d.value
  const { reliefH, ...over } = design.overrides || {} // every hub is 10 mm thick: rim and shapes alike
  Object.assign(p, over)
  for (const d of design.params) p[d.key] = d.value
  return p
}

const LEDGE = 1.2 // lid ledge width
const CRADLE_TOP = 1.2 // material over the capsule before the snap slot cuts it

export function podHeight(p) {
  return p.podFloor + p.capD + p.capClr + CRADLE_TOP + (p.lid === 'on' ? p.lidT + 0.4 : 0)
}

function meshData(m) {
  const mesh = m.getMesh()
  const np = mesh.numProp
  const n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

/** Volume and centre of mass of a closed mesh (signed tetrahedra). */
function massProps({ positions: P, indices: I }) {
  let V = 0, cx = 0, cy = 0, cz = 0
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, d = I[t + 2] * 3
    const v = (P[a] * (P[b + 1] * P[d + 2] - P[b + 2] * P[d + 1]) - P[a + 1] * (P[b] * P[d + 2] - P[b + 2] * P[d]) + P[a + 2] * (P[b] * P[d + 1] - P[b + 1] * P[d])) / 6
    V += v
    cx += (v * (P[a] + P[b] + P[d])) / 4
    cy += (v * (P[a + 1] + P[b + 1] + P[d + 1])) / 4
    cz += (v * (P[a + 2] + P[b + 2] + P[d + 2])) / 4
  }
  return V ? { V, cx: cx / V, cy: cy / V, cz: cz / V } : { V: 0, cx: 0, cy: 0, cz: 0 }
}

/**
 * Build one hub. Returns plain data; every wasm object made here is freed.
 * meshes: combined (one-colour print), frame + glow (two-colour), lids, lidsFlat.
 */
export function buildHub(wasm, design, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  const circle = (r, n = 256) => k(CrossSection.circle(r, n))
  const union = (list) => {
    const xs = list.filter((x) => x && !x.isEmpty())
    return xs.length ? k(CrossSection.union(xs)) : null // manifold has no empty CrossSection
  }
  if (design.adaptor) return buildAdaptor(wasm, p, opts)
  if (design.grip) return buildGrip(wasm, p, { kind: design.kind, density: opts.material?.density })
  if (design.dart) return buildDart(wasm, p, { style: design.style, density: opts.material?.density })
  if (design.cageBall) return buildCage(wasm, p, {})
  if (design.hilt) return buildHilt(wasm, p, { printed: true, density: opts.material?.density })
  if (design.fist) return buildFist(wasm, p, { use: design.use, density: opts.material?.density })
  if (design.tsword) return buildTubeSword(wasm, p, {})
  if (design.paxe) return buildPlateAxe(wasm, p, { style: design.style })
  if (design.tmace) return buildTubeMace(wasm, p, { style: design.style })
  if (design.taxe) return buildTubeAxe(wasm, p, { style: design.style })
  if (design.dowel) return buildDowel(wasm, p, { lock: design.lock }) // print-mode preview: aluminium
  if (design.acroMetal) return buildAcroMetal(wasm, p, { plugIn: design.plugIn }) // print-mode preview: aluminium
  if (design.acro) return buildAcro(wasm, p, { density: opts.material?.density, cone: design.cone })
  if (design.sword) return buildSword(wasm, p, { style: design.style }) // the preview in print mode: 5 mm aluminium
  if (design.bubblePoi) return buildBubblePoi(wasm, p, { density: opts.material?.density })
  if (design.bubbleHub) return buildBubbleHub(wasm, p, { density: opts.material?.density, bed: opts.bed })
  if (design.joint) return buildHoopJoint(wasm, p, { style: design.joint, density: opts.material?.density, materialName: opts.material?.name })
  if (design.hoop) return buildHoop(wasm, p, { density: opts.material?.density })
  if (design.mould) return buildMould(wasm, p, { kind: design.kind, style: design.style })
  if (design.novelty) return buildNovelty(wasm, p, { kind: design.kind, density: opts.material?.density, axe: design.axe })
  if (design.sleeve) return buildSleeve(wasm, p, { style: design.style, density: opts.material?.density })
  if (design.practiceSpoke) return buildPracticeSpoke(wasm, p, { head: design.head, density: opts.material?.density })
  if (design.ballEnd) return buildBallEnd(wasm, p, { style: design.style, density: opts.material?.density })
  if (design.spokeHub) return buildSpokeHub(wasm, p, { mode: 'print', shape: design.shape, density: opts.material?.density || 1.2 })
  try {
    const R = p.diameter / 2
    const Ri = R - p.rimW
    const boreR = (p.poleOD + p.fit) / 2
    const Rc = Math.max(p.collarOD / 2, boreR + 2)
    const hubR = Rc + p.flareW
    const cap = { L: p.capL + p.capClr, D: p.capD + p.capClr }
    const g = { R, Ri, Rc, hubR, w: p.strutW, rimW: p.rimW, rot: (p.rotate * Math.PI) / 180, cap, cradleWall: p.cradleWall, podWall: p.podWall }

    const c = new Canvas(p.strutW)
    const out = design.draw(c, g, p) || {}
    const clip = circle(Ri + p.rimW / 2)

    // ---------------------------------------------------------- frame web
    let frame = c.contours.length ? k(k(new CrossSection(c.contours, 'Positive')).intersect(clip)) : null
    // auto-fix for shapes people upload (Create): thicken thin bits, drop specks
    const fixes = [...(out.fixes || [])]
    const fixUp = (sec, minW, minArea) => {
      if (!sec || sec.isEmpty()) return sec
      let thinN = 0, speckN = 0
      if (minArea > 0) {
        const parts = sec.decompose().map(k)
        const keep = parts.filter((q) => q.area() >= minArea)
        speckN = parts.length - keep.length
        if (speckN) sec = keep.length ? k(CrossSection.union(keep)) : sec
      }
      if (minW > 0) {
        const opened = k(k(sec.offset(-minW / 2, 'Round', 2, 16)).offset(minW / 2, 'Round', 2, 16))
        const thin = k(k(sec.subtract(opened)).offset(-0.05))
        const bits = thin.isEmpty() ? [] : thin.decompose().map(k).filter((q) => q.area() > 1)
        if (bits.length) {
          thinN = bits.filter((q) => q.area() > 4).length // sharp tips get rounded too, but only real thin parts are worth a mention
          sec = k(sec.add(k(k(CrossSection.union(bits)).offset(minW * 0.45, 'Round', 2, 16))))
        }
      }
      // a shape repeated N times: say it per copy
      const per = Math.max(1, out.copies || 1), t = Math.ceil(thinN / per), sp = Math.ceil(speckN / per), each = per > 1 ? ' in each copy' : ''
      if (t) fixes.push(`thickened ${t} thin bit${t > 1 ? 's' : ''}${each}`)
      if (sp) fixes.push(`removed ${sp} tiny speck${sp > 1 ? 's' : ''}${each}`)
      return sec
    }
    if (out.frameFix) frame = fixUp(frame, out.frameFix.minW, out.frameFix.minArea)
    const membranes = []
    for (const v of out.veins || []) {
      if (v.membrane) membranes.push(k(k(new CrossSection(v.region, 'Positive')).intersect(clip)))
      const region = v.region === 'disk' ? clip : k(new CrossSection(v.region, 'Positive'))
      const inner = k(k(region.offset(-v.border, 'Round', 2, 24)).subtract(circle(hubR + v.border, 96)))
      const holes = []
      for (const cell of v.cells) {
        if (cell.pts.length < 3) continue
        let h = k(k(new CrossSection([ccw(cell.pts)])).offset(-cell.inset, 'Round', 2, 16))
        if (v.round > 0 && !h.isEmpty()) h = k(k(h.offset(-v.round, 'Round', 2, 16)).offset(v.round, 'Round', 2, 16))
        if (!h.isEmpty()) holes.push(h)
      }
      const cut = holes.length ? k(union(holes).intersect(inner)) : null
      frame = union([frame, k((cut ? k(region.subtract(cut)) : region).intersect(clip))])
    }

    // ------------------------------------------------------------- relief
    let relief = null, reliefFoot = null, slits = null
    if (out.relief && out.relief.contours.length) {
      const r = out.relief
      relief = k(new CrossSection(r.contours, 'Positive'))
      if (r.thicken > 0) relief = k(relief.offset(r.thicken, 'Round', 2, 24))
      relief = k(k(relief.intersect(clip)).simplify(0.02)) // stroke unions leave hairline edges
      if (r.fix) relief = fixUp(relief, r.fix.minW, r.fix.minArea)
      reliefFoot = relief
      if (r.holes?.length) relief = k(relief.subtract(k(new CrossSection(r.holes, 'Positive')))) // recesses: eyes, scales
      if (r.slits) {
        const closed = k(k(relief.offset(3, 'Round', 2, 24)).offset(-3, 'Round', 2, 24))
        slits = k(k(closed.subtract(relief)).offset(-0.05))
        if (frame && !slits.isEmpty()) frame = k(frame.subtract(k(slits.offset(p.strutW * 0.15))))
      }
      if (frame && r.gap > 0) frame = k(frame.subtract(k(relief.offset(r.gap, 'Round', 2, 24))))
    }

    // --------------------------------------------------------------- pods
    const pods = []
    for (const pod of out.pods || []) {
      const rect = capsuleRect(pod.cap.x, pod.cap.y, pod.cap.angle, cap.L, cap.D)
      const foot = k(new CrossSection([ccw(rect)]))
      let sec = k(foot.offset(p.cradleWall + p.podWall, 'Round', 2, 32))
      if (pod.shapes.length) sec = k(sec.add(k(new CrossSection(pod.shapes.map(ccw), 'Positive'))))
      sec = k(sec.intersect(clip))
      pods.push({ sec, foot, cap: pod.cap })
    }
    const podsAll = union(pods.map((q) => q.sec))
    const bezel = pods.length && p.bezelW > 0 ? k(k(podsAll.offset(p.bezelW, 'Round', 2, 32)).subtract(podsAll)) : null

    // --------------------------------------------------------------- base
    const rim = k(circle(R).subtract(circle(Ri)))
    let base = union([frame, rim, circle(hubR, 128), reliefFoot, podsAll, bezel])
    if (p.fillet > 0) base = k(k(base.offset(p.fillet, 'Round', 2, 32)).offset(-p.fillet, 'Round', 2, 32))
    if (slits) base = k(base.subtract(slits))
    base = k(k(base.intersect(circle(R))).simplify(0.02))

    // Anything not joined to the main body would print as a loose bit: drop it.
    const pieces = base.decompose()
    pieces.forEach(k)
    let dropped = 0
    if (pieces.length > 1 && !opts.keepIslands) {
      pieces.sort((a, b) => b.area() - a.area())
      dropped = pieces.length - 1
      base = pieces[0]
      if (relief) relief = k(relief.intersect(base))
      for (const q of pods) q.sec = k(q.sec.intersect(base))
    }

    // bore with crush ribs
    const bore = ribbedBore(CrossSection, k, boreR, p.ribs, p.ribH)
    base = k(base.subtract(bore))

    // strength: material narrower than minW disappears under an opening
    const minW = Math.max(2.4, p.strutW * 0.6)
    const opened = k(k(base.offset(-minW / 2, 'Round', 2, 16)).offset(minW / 2, 'Round', 2, 16))
    const weak = k(k(base.subtract(opened)).offset(-0.05))

    // ----------------------------------------------------------------- 3D
    const T = p.frameH
    const podH = podHeight(p)
    const solids = [k(base.extrude(T))]
    if (p.rimH > T) solids.push(k(rim.extrude(p.rimH)))
    solids.push(k(k(circle(Rc, 128).subtract(bore)).extrude(Math.max(T, p.collarH))))
    if (p.flareW > 0) {
      const fh = Math.min(p.flareW, Math.max(0, p.collarH - T))
      if (fh > 0) solids.push(k(k(Manifold.cylinder(fh, Rc + p.flareW, Rc, 128)).translate([0, 0, T])))
    }
    // colour B: everything that stands up from the frame (relief, lanterns, wing membranes)
    const zoneB = []
    if (relief && !relief.isEmpty()) {
      const r3 = k(relief.extrude(Math.max(T, p.reliefH)))
      solids.push(r3)
      // grown a little so the fillet cannot leave paper-thin colour A slivers on the walls
      zoneB.push(k(k(k(reliefFoot.offset(0.4, 'Round', 2, 16)).intersect(base)).extrude(Math.max(T, p.reliefH) + 1)))
    }
    if (bezel) solids.push(k(k(bezel.intersect(base)).extrude(Math.max(T, podH - 1.5))))
    const podOuters = pods.filter((q) => !q.sec.isEmpty()).map((q) => k(q.sec.extrude(podH)))
    const membAll = union(membranes)
    if (membAll) podOuters.push(k(membAll.extrude(Math.min(p.membraneH, T)))) // glows with the pods
    let solid = k(Manifold.union([...solids, ...podOuters]))

    const lid = p.lid === 'on'
    const voids = [], cradles = [], cuts = [], lidSecs = []
    for (const q of pods) {
      if (q.sec.isEmpty()) continue
      const lower = k(q.sec.offset(-p.podWall - (lid ? LEDGE : 0), 'Round', 2, 32))
      const lowTop = lid ? podH - p.lidT : podH + 1
      if (!lower.isEmpty()) voids.push(k(k(lower.extrude(lowTop - p.podFloor)).translate([0, 0, p.podFloor])))
      if (lid) {
        const upper = k(q.sec.offset(-p.podWall, 'Round', 2, 32))
        voids.push(k(k(upper.extrude(p.lidT + 1)).translate([0, 0, podH - p.lidT])))
        lidSecs.push(k(upper.offset(-0.15, 'Round', 2, 32))) // press fit in TPU
      }
      const zc = p.podFloor + cap.D / 2
      cradles.push(k(k(k(q.foot.offset(p.cradleWall, 'Round', 2, 32)).intersect(clip)).extrude(zc + cap.D / 2 + CRADLE_TOP)))
      const place3 = (m) => k(k(m.rotate([0, 0, (q.cap.angle * 180) / Math.PI])).translate([q.cap.x, q.cap.y, zc]))
      cuts.push(place3(k(k(Manifold.cylinder(cap.L, cap.D / 2, cap.D / 2, 48, true)).rotate([0, 90, 0]))))
      const slotW = (cap.D * p.slotPct) / 100
      cuts.push(place3(k(k(Manifold.cube([cap.L, slotW, podH], true)).translate([0, 0, podH / 2]))))
    }
    if (voids.length) solid = k(solid.subtract(k(Manifold.union(voids))))
    if (cradles.length) solid = k(solid.add(k(Manifold.union(cradles))))
    if (cuts.length) solid = k(solid.subtract(k(Manifold.union(cuts))))
    solid = k(solid.subtract(k(k(bore.extrude(400)).translate([0, 0, -200]))))

    // ---------------------------------------------------- bubble weight ring
    // A tyre round the outside of the rim, a flange under it (the side away
    // from the collar), and full circular bubble loops round its outer edge.
    // Too big for most beds in one piece, so it comes in bolted arc segments.
    let ring = null, ringInfo = null, ringWorn = null
    if (p.ring === 'on' && p.ringPlace === 'internal') {
      // loops built into the hub, inside the rim: outer edge fused 1 mm into the rim's inner wall
      const ro = p.loopD / 2 + p.loopT, ri = p.loopD / 2
      const loopC = Ri + 1 - ro
      const nLoops = Math.max(0, p.loops)
      if (nLoops > 0) {
        let loop2d = k(k(CrossSection.circle(ro, 64)).subtract(k(CrossSection.circle(ri, 64))))
        if (p.scallop === 'on') {
          const n = Math.max(8, Math.round((TAU * ri) / 3.2))
          const notches = []
          for (let j = 0; j < n; j++) notches.push(k(k(CrossSection.circle(0.9, 12)).translate([ri * Math.cos((TAU * j) / n), ri * Math.sin((TAU * j) / n)])))
          loop2d = k(loop2d.subtract(k(CrossSection.union(notches))))
        }
        // standing edge-on (facing the way the rim moves), bottom on the bed, on the collar side
        const loop = k(k(k(k(loop2d.extrude(p.loopT)).translate([0, 0, -p.loopT / 2])).rotate([90, 0, 0])).translate([loopC, 0, ro]))
        // a pad under each loop, from its inner foot out into the rim, at frame height
        const padIn = loopC - ro - 1, padW = p.loopT + 6
        const pad = k(k(Manifold.cube([Ri + 0.5 - padIn, padW, T], false)).translate([padIn, -padW / 2, 0]))
        const unit = k(loop.add(pad))
        const parts = []
        for (let i = 0; i < nLoops; i++) parts.push(k(unit.rotate([0, 0, (360 * i) / nLoops + p.rotate + 180 / nLoops])))
        solid = k(solid.add(k(Manifold.union(parts))))
      }
      ringInfo = {
        internal: true, face: false, segs: 0, bolts: 0, diameter: 2 * R, height: 2 * ro,
        loops: nLoops, loopC, loopR: p.loopD / 2, dir: 'edge-on', grooves: p.scallop === 'on',
        phase: p.rotate + 180 / Math.max(1, nLoops),
        zc: ro, // loop centres, above the hub's underside on the collar side
        tyreArea: TAU * R * Math.max(T, p.rimH), // the rim gets wet too
      }
    } else if (p.ring === 'on' && p.ringPlace === 'snap ring') {
      // the snap-on weight's C-section hoop (lip over the rim, outer wall, block under it)
      // with its block widened into a shelf that the loops stand on, inside the outline.
      // One piece, held by hoop tension: nothing to bolt.
      const Hr = Math.max(T, p.rimH)
      const Rin = R + p.snapFit / 2, Rout = Rin + p.snapWall
      const lipT = 1.6, lip = Math.min(p.snapLip, p.rimW - 0.5), c = Math.min(lip, lipT) * 0.9
      const ro = p.loopD / 2 + p.loopT, ri = p.loopD / 2
      const shelfT = Math.max(p.flangeT, 2.4)
      const loopC = Rout - ro - 1
      const flIn = Math.min(Rin - Math.min(p.rimW - 0.5, 9), loopC - p.loopT - 3)
      const zb = -shelfT
      const prof = [[Rout, zb], [Rout, Hr + lipT], [Rin - lip + c, Hr + lipT], [Rin - lip, Hr + lipT - c], [Rin - lip, Hr], [Rin, Hr], [Rin, 0], [flIn, 0], [flIn, zb]]
      const parts = [k(k(new CrossSection([prof], 'Positive')).revolve(256))]
      const nLoops = Math.max(0, p.loops)
      if (nLoops > 0) {
        let loop2d = k(k(CrossSection.circle(ro, 64)).subtract(k(CrossSection.circle(ri, 64))))
        if (p.scallop === 'on') {
          const n = Math.max(8, Math.round((TAU * ri) / 3.2))
          const notches = []
          for (let j = 0; j < n; j++) notches.push(k(k(CrossSection.circle(0.9, 12)).translate([ri * Math.cos((TAU * j) / n), ri * Math.sin((TAU * j) / n)])))
          loop2d = k(loop2d.subtract(k(CrossSection.union(notches))))
        }
        // edge-on, facing the way the rim moves, hanging under the shelf (sunk 0.6 mm into it)
        const loop = k(k(k(k(loop2d.extrude(p.loopT)).translate([0, 0, -p.loopT / 2])).rotate([90, 0, 0])).translate([loopC, 0, zb + 0.6 - ro]))
        for (let i = 0; i < nLoops; i++) parts.push(k(loop.rotate([0, 0, (360 * i) / nLoops + p.rotate + 180 / nLoops])))
      }
      const worn = (ringWorn = k(Manifold.union(parts)))
      ring = k(k(worn.mirror([0, 0, 1])).translate([0, 0, Hr + lipT])) // prints lip-down, loops up
      const top = Hr + lipT
      ringInfo = {
        snap: true, face: true, segs: 1, bolts: 0, diameter: 2 * Rout, height: top - (zb + 0.6 - 2 * ro),
        loops: nLoops, loopC, loopR: p.loopD / 2, dir: 'edge-on', grooves: p.scallop === 'on',
        phase: p.rotate + 180 / Math.max(1, nLoops),
        zc: zb + 0.6 - ro,
        tyreArea: Math.PI * (Rout * Rout - flIn * flIn),
        fitsBed: 2 * Rout <= (opts.bed || 256) - 2,
      }
    } else if (p.ring === 'on') {
      // face: no tyre, a plate flush with the rim, loops standing on it inside the outline
      const face = p.ringPlace === 'flat face'
      const loopDir = face ? 'edge-on' : p.loopDir // flat loops on a plate would have no hole
      const Rin = R + p.bandFit / 2, Rout = face ? R : Rin + p.bandT
      const H = face ? p.flangeT : p.flangeT + Math.max(T, p.rimH)
      const loopOuterR = p.loopD / 2 + p.loopT
      const loopC = face ? R - loopOuterR - 1 : Rout + loopOuterR - 1 // edge: 1 mm overlap into the tyre
      // the plate must reach in under the loops' feet
      const flIn = face ? Math.min(R - Math.max(p.flangeW, 0.01), loopC - p.loopT - 2) : R - Math.max(p.flangeW, 0.01)
      const ringR = face ? R : loopC + loopOuterR
      // segments: fewest arcs whose bounding box fits the bed
      const bed = (opts.bed || 256) - 4
      let segs = 1
      for (; segs < 8; segs++) {
        const half = Math.PI / segs
        const w = segs === 1 ? 2 * ringR : 2 * ringR * Math.sin(Math.min(half, Math.PI / 2))
        const h = segs === 1 ? 2 * ringR : ringR - flIn * Math.cos(half)
        if (Math.max(w, h) <= bed) break
      }
      const bolts = Math.ceil(Math.max(p.bolts, 2 * segs) / segs) * segs
      // loops come in whole sets per segment so no cut ever passes through one
      const nLoops = p.loops > 0 ? Math.max(segs, Math.round(p.loops / segs) * segs) : 0
      const boltR = R - Math.min(p.flangeW, p.rimW) / 2
      // face loops arch over the bolt circle: keep bolts out from under a loop's wire
      // (a quarter step still never lands on a segment cut)
      let boltPhase = 0.5
      if (face && nLoops > 0) {
        const clear = (ph) => {
          let worst = Infinity
          for (let i = 0; i < bolts; i++)
            for (let j = 0; j < nLoops; j++) {
              let d = Math.abs((i + ph) / bolts - (j + 0.5) / nLoops) % 1
              worst = Math.min(worst, Math.min(d, 1 - d) * TAU * boltR)
            }
          return worst
        }
        boltPhase = [0.5, 0.25, 0.75].reduce((b, ph) => (clear(ph) > clear(b) + 0.01 ? ph : b))
      }
      const holes = []
      for (let i = 0; i < bolts; i++) {
        const a = (TAU * (i + boltPhase)) / bolts + (p.rotate * Math.PI) / 180
        holes.push(k(k(Manifold.cylinder(400, 1.7, 1.7, 20)).translate([boltR * Math.cos(a), boltR * Math.sin(a), -200])))
      }
      const holeSet = k(Manifold.union(holes))
      solid = k(solid.subtract(holeSet))

      const parts = face ? [] : [k(k(circle(Rout).subtract(circle(Rin))).extrude(H))] // tyre wall
      if (face || p.flangeW > 0) parts.push(k(k(circle(Rout).subtract(circle(flIn))).extrude(p.flangeT)))
      if (nLoops > 0) {
        // one loop: an annulus with grooves round the inside
        const ri = p.loopD / 2, ro = loopOuterR
        let loop2d = k(k(CrossSection.circle(ro, 64)).subtract(k(CrossSection.circle(ri, 64))))
        if (p.scallop === 'on') {
          const n = Math.max(8, Math.round((TAU * ri) / 3.2))
          const notches = []
          for (let j = 0; j < n; j++) notches.push(k(k(CrossSection.circle(0.9, 12)).translate([ri * Math.cos((TAU * j) / n), ri * Math.sin((TAU * j) / n)])))
          loop2d = k(loop2d.subtract(k(CrossSection.union(notches))))
        }
        let loop
        if (loopDir === 'flat') {
          // lying in the disc plane, on the bed
          loop = k(k(loop2d.extrude(Math.min(p.loopT, H))).translate([loopC, 0, 0]))
        } else {
          // standing in the radial-vertical plane, facing the direction of travel, bottom on the bed
          // (face: standing on the plate, sunk 0.6 mm into it)
          loop = k(k(k(k(loop2d.extrude(p.loopT)).translate([0, 0, -p.loopT / 2])).rotate([90, 0, 0])).translate([loopC, 0, ro + (face ? p.flangeT - 0.6 : 0)]))
        }
        for (let i = 0; i < nLoops; i++) parts.push(k(loop.rotate([0, 0, (360 * i) / nLoops + p.rotate + 180 / nLoops])))
      }
      ring = k(k(Manifold.union(parts)).subtract(holeSet))
      if (segs > 1) {
        // cut into arcs with 0.6 mm gaps, the cuts midway between bolts
        const cuts = []
        for (let i = 0; i < segs; i++) {
          const a = (360 * i) / segs + p.rotate
          cuts.push(k(k(k(Manifold.cube([ringR + 20, 0.6, 400], false)).translate([0, -0.3, -200])).rotate([0, 0, a])))
        }
        ring = k(ring.subtract(k(Manifold.union(cuts))))
      }
      const loopTop = loopDir === 'flat' ? Math.min(p.loopT, H) : 2 * loopOuterR + (face ? p.flangeT - 0.6 : 0)
      ringInfo = {
        face, segs, bolts, diameter: 2 * ringR, height: Math.max(H, loopTop),
        // where the loops are, in the hub's frame, for the bubble simulator
        loops: nLoops, loopC, loopR: p.loopD / 2, dir: loopDir, grooves: p.scallop === 'on',
        phase: p.rotate + 180 / Math.max(1, nLoops),
        // loop centre height in the hub's frame (face: the ring is flipped under the hub)
        zc: face ? -(loopDir === 'flat' ? p.flangeT + Math.min(p.loopT, H) / 2 : p.flangeT - 0.6 + loopOuterR) : (loopDir === 'flat' ? Math.min(p.loopT, H) / 2 : loopOuterR) - p.flangeT,
        tyreArea: face ? Math.PI * (Rout * Rout - flIn * flIn) : TAU * Rout * H, // wetted outside, mm²
      }
    }
    // ---------------------------------------------------- snap-on weight
    // One-piece hoop with a C section: outer wall, chamfered lip over the rim's
    // top face, and a mass block under the rim (side away from the collar).
    // Hoop tension holds it, so it must stay one piece: no segments.
    // Profile in (r, z) of the hub frame; z = 0 is the hub's underside.
    let snapInfo = null
    const snapMeshes = {}
    if (p.snap && p.snap !== 'off' && p.ring !== 'on') {
      const Hr = Math.max(T, p.rimH)
      const Rin = R + p.snapFit / 2, Rout = Rin + p.snapWall
      const lipT = 1.6, lip = Math.min(p.snapLip, p.rimW - 0.5)
      const under = Math.min(p.rimW - 0.5, 9) // block reaches in under the rim, not past it
      const profile = (drop) => {
        const zb = -Math.max(drop, 0.8)
        // clockwise from the outer bottom corner; lip tip chamfered 45° on its top
        const c = Math.min(lip, lipT) * 0.9
        return [[Rout, zb], [Rout, Hr + lipT], [Rin - lip + c, Hr + lipT], [Rin - lip, Hr + lipT - c], [Rin - lip, Hr], [Rin, Hr], [Rin, 0], [Rin - under, 0], [Rin - under, zb]]
      }
      const variants = { light: p.snapLight, medium: p.snapMedium, heavy: p.snapHeavy }
      const mat0 = opts.material || MATERIALS.tpu95
      const grams = {}
      for (const [name, drop] of Object.entries(variants)) {
        const m = k(k(new CrossSection([profile(drop)], 'Positive')).revolve(256))
        grams[name] = (m.volume() / 1000) * mat0.density
        const zb = -Math.max(drop, 0.8)
        snapMeshes[name] = meshData(k(m.translate([0, 0, -zb]))) // printed block-down
        if (name === p.snap) snapMeshes.worn = meshData(m)
      }
      snapInfo = { weight: p.snap, grams, diameter: 2 * Rout, bore: 2 * (Rin - lip), fitsBed: 2 * Rout <= (opts.bed || 256) - 2 }

      // LED version of the worn weight (plan: led-ring-plan.html §5). Same outline,
      // so it never grows past the bed: slot + window in the block, a wire groove,
      // and two pod tabs reaching in under the hub, opening on the bottom face.
      if (p.snapLed === 'on') {
        const roof = p.ledRoof, sH = p.ledSlotH
        const D = Math.max(variants[p.snap], roof + sH + 2.5, 10)
        const zb = -D
        const sOut = Rout - p.ledWindow, sIn = sOut - p.ledSlotD
        const rect = (r0, r1, z0, z1) => [[r0, z0], [r1, z0], [r1, z1], [r0, z1]]
        const ringOf = (poly) => k(k(new CrossSection([poly], 'Positive')).revolve(256))
        let m = ringOf(profile(D))
        const cav = [ringOf(rect(sIn, sOut, -roof - sH, -roof)), ringOf(rect(Rin - 3.9, Rin - 1.7, -roof - 2.5, -roof))]
        // pod tabs: arc sectors under the hub, as deep as the block
        const pIn = Rin - p.podDepth, rMid = (pIn + Rin) / 2
        const sector = (r0, r1, len, a) => {
          const ha = len / 2 / rMid, pts = []
          for (let i = 0; i <= 24; i++) { const t = a - ha + (2 * ha * i) / 24; pts.push([r1 * Math.cos(t), r1 * Math.sin(t)]) }
          for (let i = 24; i >= 0; i--) { const t = a - ha + (2 * ha * i) / 24; pts.push([r0 * Math.cos(t), r0 * Math.sin(t)]) }
          return k(new CrossSection([pts], 'Positive'))
        }
        const a0 = ((p.podAngle + p.rotate) * Math.PI) / 180
        const podAt = [a0, a0 + Math.PI]
        const tabs = [], lids = []
        for (const a of podAt) {
          tabs.push(k(k(sector(pIn, Rin - under + 1, p.podLen, a).extrude(D)).translate([0, 0, zb])))
          const mouth = sector(pIn + 2, Rin - 3, p.podLen - 4, a)
          cav.push(k(k(mouth.extrude(D - 2.5)).translate([0, 0, zb - 0.01])))
          // wires from the slot into the pod
          cav.push(k(k(k(Manifold.cube([sIn - (Rin - 3) + 1, 5, 3], false)).translate([Rin - 3.5, -2.5, -roof - 3])).rotate([0, 0, (a * 180) / Math.PI])))
          lids.push(k(k(mouth.offset(0.15, 'Round', 2, 16)).extrude(1.6))) // press-fit plug, flush with the face
        }
        m = k(k(m.add(k(Manifold.union(tabs)))).subtract(k(Manifold.union(cav))))
        const tpuG = (m.volume() / 1000) * mat0.density
        snapMeshes.worn = meshData(m)
        snapMeshes.led = meshData(k(m.translate([0, 0, D])))
        snapMeshes.ledLids = meshData(k(Manifold.union(lids)))
        const rPod = (pIn + 2 + Rin - 3) / 2
        snapInfo.led = {
          depth: D, pauseAt: D - roof, tpuG, podG: p.podA + p.podB, stripG: p.stripG,
          total: tpuG + p.podA + p.podB + p.stripG,
          pods: podAt.map((a, i) => ({ x: rPod * Math.cos(a), y: rPod * Math.sin(a), g: i ? p.podB : p.podA })),
          mismatch: Math.abs(p.podA - p.podB),
        }
      }
    }
    const sz = screwZ(p, T)
    if (sz != null) {
      const z = sz
      solid = k(solid.subtract(k(k(k(Manifold.cylinder(R, p.screw / 2, p.screw / 2, 24)).rotate([0, 90, 0])).translate([0, 0, z]))))
    }
    // optional: lock onto a metal Locking Dowel in the pole end (dowel.js)
    let lockInfo = null
    if (p.lockOn) {
      const lk = lockKey(p.lockType), zL = hubLockZ(p, T)
      const lockWarns = [], lockWarn = (t) => lockWarns.push(t)
      lockInfo = { type: lk, name: LOCKS[lk], zL: null, fromCollarEnd: null, stub: p.collarH, warns: lockWarns }
      if (lk !== 'bolt' && zL == null) lockWarn(`The collar is too short to lock onto the dowel: make Collar length at least ${Math.ceil(T + 10)} mm.`)
      else {
        const along = (r, len, x0, z) => k(k(k(Manifold.cylinder(len, r, r, 24)).rotate([0, 90, 0])).translate([x0, 0, z]))
        const turn = (m) => k(m.rotate([0, 0, (g.rot * 180) / Math.PI + 90])) // between the first spokes, off the set-screw line
        if (lk === 'grub') {
          // M5 clearance through the collar wall, an M5 nut trapped in the wall, loaded from the collar end
          const rm = (boreR + Rc) / 2
          if (Rc - boreR < 7) lockWarn(`The collar wall is ${(Rc - boreR).toFixed(1)} mm: make Collar OD at least ${Math.ceil(2 * boreR + 14)} mm to hold the grub screw's nut.`)
          const slot = k(k(Manifold.cube([4.4, 9.6, p.collarH - zL + 4.8 + 1], false)).translate([rm - 2.2, -4.8, zL - 4.8]))
          solid = k(solid.subtract(turn(k(along(2.7, Rc + 2, boreR - 1, zL).add(slot)))))
        } else if (lk === 'pin') {
          solid = k(solid.subtract(turn(along(2.75, 2 * Rc + 4, -Rc - 2, zL))))
        }
        Object.assign(lockInfo, { zL, fromCollarEnd: zL == null ? null : p.collarH - zL })
      }
    }

    // drop zero-volume slivers that boolean rounding can leave where surfaces graze
    {
      const partsList = solid.decompose().map(k)
      const real = partsList.filter((m) => m.volume() > 1)
      if (real.length < partsList.length) solid = k(Manifold.compose(real))
    }
    const meshes = { combined: meshData(solid) }
    if (ring) {
      meshes.ringFlat = meshData(ring)
      meshes.ring = meshData(ringInfo.snap ? ringWorn
        : ringInfo.face
        ? k(ring.mirror([0, 0, 1])) // printed loops-up, worn loops-down under the hub
        : k(ring.translate([0, 0, -p.flangeT]))) // the hub sits on the flange
    }
    if (snapInfo) Object.assign(meshes, { snap: snapMeshes.worn, snapLight: snapMeshes.light, snapMedium: snapMeshes.medium, snapHeavy: snapMeshes.heavy, snapLed: snapMeshes.led, snapLedLids: snapMeshes.ledLids })
    zoneB.push(...podOuters)
    if (zoneB.length) {
      // two-colour split: frame = colour A, glow = colour B (shapes, lanterns)
      const zone = k(Manifold.union(zoneB))
      meshes.glow = meshData(k(solid.intersect(zone)))
      meshes.frame = meshData(k(solid.subtract(zone)))
    }
    if (podOuters.length) {
      if (lid && lidSecs.length) {
        const lids = union(lidSecs)
        meshes.lidsFlat = meshData(k(lids.extrude(p.lidT)))
        meshes.lids = meshData(k(k(lids.extrude(p.lidT)).translate([0, 0, podH - p.lidT])))
      }
    }

    // ---------------------------------------------------- mass and balance
    const mat = opts.material || MATERIALS.tpu95
    const body = massProps(meshes.combined)
    const lidM = meshes.lids ? massProps(meshes.lids) : { V: 0, cx: 0, cy: 0 }
    const ringM = meshes.ring ? massProps(meshes.ring) : { V: 0, cx: 0, cy: 0 }
    const gRing = (ringM.V / 1000) * mat.density
    const gBody = ((body.V + lidM.V) / 1000) * mat.density
    const caps = pods.filter((q) => !q.sec.isEmpty())
    let mx = (body.V * body.cx + lidM.V * lidM.cx) / 1000 * mat.density
    let my = (body.V * body.cy + lidM.V * lidM.cy) / 1000 * mat.density
    for (const q of caps) (mx += p.capMass * q.cap.x), (my += p.capMass * q.cap.y)
    mx += gRing * ringM.cx
    my += gRing * ringM.cy
    const gSnap = snapInfo ? (snapInfo.led ? snapInfo.led.total : snapInfo.grams[snapInfo.weight]) : 0 // the hoop is round: only LED pods can unbalance it
    for (const q of snapInfo?.led?.pods || []) (mx += q.g * q.x), (my += q.g * q.y)
    const gTotal = gBody + gRing + gSnap + caps.length * p.capMass

    // filament per colour: by part (two-colour 3MF) and by height (one nozzle, swap at T)
    const gOf = (mesh) => (mesh ? (massProps(mesh).V / 1000) * mat.density : 0)
    const gLids = (lidM.V / 1000) * mat.density
    const split = meshes.glow
      ? {
          partA: gOf(meshes.frame), partB: gOf(meshes.glow),
          swapA: gOf(meshData(k(solid.trimByPlane([0, 0, -1], -T)))),
          swapB: gOf(meshData(k(solid.trimByPlane([0, 0, 1], T)))),
        }
      : null
    const cx = mx / gTotal, cy = my / gTotal

    // capsule checks
    const capWarn = []
    caps.forEach((q, i) => {
      if (k(q.foot.subtract(circle(Ri - 0.5))).area() > 1) capWarn.push(`capsule ${i + 1} runs into the rim`)
      if (k(q.foot.intersect(circle(hubR + 0.5, 96))).area() > 1) capWarn.push(`capsule ${i + 1} hits the collar`)
      for (let j = i + 1; j < caps.length; j++)
        if (k(q.foot.intersect(caps[j].foot)).area() > 1) capWarn.push(`capsules ${i + 1} and ${j + 1} overlap`)
    })

    const box = solid.boundingBox()
    return {
      meshes,
      polygons: {
        base: base.toPolygons(),
        relief: relief ? relief.toPolygons() : [],
        pods: [...caps.map((q) => q.sec.toPolygons()).flat(), ...(membAll ? membAll.toPolygons() : [])],
        weak: weak.toPolygons(),
      },
      podH,
      ring: ringInfo,
      snap: snapInfo,
      lock: lockInfo,
      colourChangeAt: zoneB.length ? T : null, // one-nozzle trick: swap filament at this height
      stats: {
        grams: gBody,
        gramsRing: gRing,
        gramsSnap: gSnap,
        gramsTotal: gTotal,
        gramsLids: gLids,
        split,
        capsules: caps.length,
        capWarn,
        centroidOffset: Math.hypot(cx, cy),
        cx, cy,
        imbalance: gTotal * Math.hypot(cx, cy),
        dropped,
        parts: solid.decompose().map(k).length,
        weakArea: weak.area(),
        fixes,
        minW,
        boreD: boreR * 2,
        ribTipD: p.ribs > 0 ? (boreR - p.ribH) * 2 : boreR * 2,
        height: box.max[2] - box.min[2],
        tris: meshes.combined.indices.length / 3,
      },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

/** Just the collar and ribs, 12 mm tall: print this first to check the fit on the real pole. */
export function buildFitTest(wasm, p) {
  const { CrossSection } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const boreR = (p.poleOD + p.fit) / 2
    const Rc = Math.max(p.collarOD / 2, boreR + 2)
    const bore = ribbedBore(CrossSection, k, boreR, p.ribs, p.ribH)
    return meshData(k(k(k(CrossSection.circle(Rc, 128)).subtract(bore)).extrude(12)))
  } finally {
    for (const o of live) o.delete?.()
  }
}

/**
 * A single lantern cup with its cradle, for test-fitting a real capsule
 * before printing a whole hub: same walls, slot and lid ledge as the hub.
 */
export function buildCapsuleTest(wasm, p) {
  const fake = {
    id: 'captest',
    params: [],
    draw: () => ({ pods: [{ shapes: [], cap: { x: 120, y: 0, angle: Math.PI / 2 } }] }),
  }
  // tiny hub: rim and collar shrink away; we keep only the glow part
  const q = { ...p, diameter: 400, rimW: 4, rimH: 2, flareW: 0, collarOD: 26, collarH: 4, bezelW: 0, ribs: 0 }
  const m = buildHub(wasm, fake, q, { keepIslands: true }).meshes.glow
  // move it to the origin for printing
  for (let i = 0; i < m.positions.length; i += 3) m.positions[i] -= 120
  return m
}

/** Binary STL from mesh data. */
export function toSTL(mesh, name = 'dragon hub') {
  const P = mesh.positions, I = mesh.indices
  const n = I.length / 3
  const buf = new ArrayBuffer(84 + n * 50)
  const dv = new DataView(buf)
  const head = `${name} - dream.sc hub forge`.slice(0, 80)
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i))
  dv.setUint32(80, n, true)
  let o = 84
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2]
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const L = Math.hypot(nx, ny, nz) || 1
    for (const v of [nx / L, ny / L, nz / L]) (dv.setFloat32(o, v, true), (o += 4))
    for (const idx of [a, b, c]) for (let j = 0; j < 3; j++) (dv.setFloat32(o, P[idx + j], true), (o += 4))
    o += 2
  }
  return buf
}

/** SVG of the flat footprint (laser / waterjet, or a stencil). */
export function toSVG(polys, diameter) {
  const r = diameter / 2 + 2
  const d = polys.map((poly) => 'M' + poly.map((q) => `${q[0].toFixed(3)},${(-q[1]).toFixed(3)}`).join('L') + 'Z').join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${2 * r}mm" height="${2 * r}mm" viewBox="${-r} ${-r} ${2 * r} ${2 * r}"><path d="${d}" fill="#000" fill-rule="evenodd"/></svg>\n`
}

// ------------------------------------------------------------------ 3MF ----
// A two-part 3MF: one object made of colour A and colour B parts. Bambu Studio
// and PrusaSlicer load it as a single object with two parts, so each part just
// gets its own filament. Written as an uncompressed zip, no library needed.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zipStore(files) {
  const enc = new TextEncoder()
  const parts = [], central = []
  let offset = 0
  for (const [name, text] of files) {
    const data = typeof text === 'string' ? enc.encode(text) : text
    const nm = enc.encode(name)
    const crc = crc32(data)
    const head = new DataView(new ArrayBuffer(30))
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true)
    head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true)
    head.setUint16(26, nm.length, true)
    parts.push(new Uint8Array(head.buffer), nm, data)
    const cen = new DataView(new ArrayBuffer(46))
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true)
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true)
    cen.setUint16(28, nm.length, true); cen.setUint32(42, offset, true)
    central.push(new Uint8Array(cen.buffer), nm)
    offset += 30 + nm.length + data.length
  }
  const cenSize = central.reduce((a, b) => a + b.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0))
  let o = 0
  for (const a of all) (out.set(a, o), (o += a.length))
  return out.buffer
}

function meshXML(mesh) {
  const P = mesh.positions, I = mesh.indices
  const v = [], t = []
  for (let i = 0; i < P.length; i += 3) v.push(`<vertex x="${P[i].toFixed(4)}" y="${P[i + 1].toFixed(4)}" z="${P[i + 2].toFixed(4)}"/>`)
  for (let i = 0; i < I.length; i += 3) t.push(`<triangle v1="${I[i]}" v2="${I[i + 1]}" v3="${I[i + 2]}"/>`)
  return `<mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh>`
}

/** parts: [[name, mesh], ...] → .3mf ArrayBuffer with one object made of those parts. */
export function to3MF(parts, name = 'dragon hub') {
  const objs = parts.map(([n, m], i) => `<object id="${i + 1}" name="${n}" type="model">${meshXML(m)}</object>`).join('')
  const comps = parts.map((_, i) => `<component objectid="${i + 1}"/>`).join('')
  const id = parts.length + 1
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${name}</metadata><metadata name="Application">dream.sc hub forge</metadata>
<resources>${objs}<object id="${id}" name="${name}" type="model"><components>${comps}</components></object></resources>
<build><item objectid="${id}"/></build></model>`
  return zipStore([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`],
    ['3D/3dmodel.model', model],
  ])
}
