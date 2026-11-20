/**
 * CNC mode: the same hub designs, made by cutting instead of printing.
 *
 *   buildPlate     any forge design → one flat plate for a laser, waterjet,
 *                  plasma or CNC router, fixed to what that cutter can do,
 *                  with fire ends (Kevlar tape on bolt-on tabs, or a Kevlar
 *                  rope ring laced on / in a milled groove) or practice ends
 *                  (TPU bumpers on the same tabs, matched to a wet wick).
 *   buildSpokeHub  a machined (or printed practice) hub that takes 8 mm fire
 *                  spokes like the common 2" dragon fire spoke: radial sockets clamped by M5 grub screws.
 *   toDXF, toCutSVG  files a cutting shop or CAM program reads.
 *
 * Nothing here changes how a design prints: print mode never calls this file
 * (except buildSpokeHub, for the spoke-hub designs only). Units mm, staff on z.
 */

import { TAU } from './geom.js'
import { expanderParts } from './grip.js'

// density g/cm3. kind decides what is allowed: only metal goes near fire.
export const CNC_MATERIALS = {
  al6061: { name: 'Aluminium 6061-T6', kind: 'metal', density: 2.70, thick: [3, 4, 5, 6], def: 4, fire: 'good', colour: '#c9cdd3',
    note: 'Light, stiff, every cutting shop stocks it. Fine for fire on the stand-off tabs: the flame sits past the rim and aluminium spreads the heat. Let it cool between burns; it softens if it is kept very hot.' },
  al5052: { name: 'Aluminium 5052', kind: 'metal', density: 2.68, thick: [2, 3, 4, 5], def: 4, fire: 'good', colour: '#d3d6da',
    note: 'Softer than 6061: bends instead of cracking when dropped. The easiest aluminium sheet to buy, and cuts cleanly on a fibre laser or waterjet.' },
  ss304: { name: 'Stainless steel 304', kind: 'metal', density: 7.93, thick: [1.5, 2, 3], def: 2, fire: 'best', colour: '#b4b8bd',
    note: 'The fire-prop metal: does not mind heat, never rusts. Three times heavier than aluminium, so use thinner sheet (2 mm) or it spins heavy.' },
  steel: { name: 'Mild steel', kind: 'metal', density: 7.85, thick: [1.5, 2, 3], def: 2, fire: 'good', colour: '#73777d',
    note: 'Cheapest, fine with fire, but rusts once fuel and sweat get on it. Paint or zinc-plate it, or pick stainless.' },
  brass: { name: 'Brass', kind: 'metal', density: 8.5, thick: [1, 1.5, 2, 3], def: 2, fire: 'good', colour: '#c9a34a',
    note: 'The classic rope dart metal: heavy, turns beautifully on a lathe, never rusts. Heavy for a big hub plate.' },
  acrylic: { name: 'Perspex (cast acrylic)', kind: 'plastic', density: 1.19, thick: [3, 4, 5, 6, 8, 10], def: 6, fire: 'never', colour: '#8fd8ff', clear: true,
    note: 'Glassy, edge-lit glow under LEDs and blacklight, laser-cuts with polished edges. But it is brittle: it can crack on a hard drop onto concrete. Practise on grass or mats, keep struts wide, and buy cast acrylic, not extruded. Never near fire.' },
  pc: { name: 'Polycarbonate (Lexan)', kind: 'plastic', density: 1.20, thick: [3, 4, 5, 6, 8], def: 5, fire: 'never', colour: '#bfe9ff', clear: true,
    note: 'Looks like Perspex, almost unbreakable. Cut it on a router or waterjet: a laser burns its edges yellow and gives off nasty fumes. Never near fire.' },
  hdpe: { name: 'HDPE', kind: 'plastic', density: 0.95, thick: [6, 8, 10, 12], def: 8, fire: 'never', colour: '#f2efe6',
    note: 'The toughest practice hub: soft, light, shrugs off drops. Router only (melts on a laser). Never near fire.' },
  pom: { name: 'Delrin / POM (acetal)', kind: 'plastic', density: 1.41, thick: [4, 5, 6, 8, 10], def: 6, fire: 'never', colour: '#2a2a2e',
    note: 'Slippery, tough and machines beautifully. Heavier than HDPE. Router only. Never near fire.' },
}

// What each cutter can do, for sheet thickness t and router bit d.
// web: narrowest bar of material it leaves strong; gap: narrowest slot or
// hole it can cut; inR: smallest inside-corner radius.
export const PROCESSES = {
  router: { name: 'CNC router / mill', mill: true, plastics: true, metals: true,
    limits: (t, d) => ({ web: Math.max(3, d), gap: d * 1.15, inR: d / 2 }),
    note: 'Inside corners come out round (the bit is round): the forge rounds them to the bit for you, and fills any gap the bit cannot fit into. Only a router or mill can cut the rope groove.' },
  laser: { name: 'Laser cutter', plastics: true, metals: true,
    limits: (t, d, kind) => kind === 'metal' ? { web: Math.max(2, t), gap: Math.max(1, t), inR: 0.5 } : { web: Math.max(2.5, t * 0.6), gap: 1.2, inR: 0.3 },
    note: 'Fibre laser for metal, CO2 for Perspex. Cheapest and fastest. Holes in metal should be at least as big as the sheet is thick.' },
  waterjet: { name: 'Waterjet', plastics: true, metals: true,
    limits: (t) => ({ web: Math.max(2.5, t * 0.75), gap: Math.max(1.6, t * 0.6), inR: 0.8 }),
    note: 'Any material, no heat, clean edges. Slower and dearer than laser.' },
  plasma: { name: 'Plasma', plastics: false, metals: true,
    limits: (t) => ({ web: Math.max(4, t * 1.5), gap: Math.max(4, t * 1.5), inR: 1.5 }),
    note: 'Metal only and rough: small holes come out tapered and wide. Drill the bolt holes afterwards (they are in their own layer).' },
}

export const ENDS = {
  none: 'none',
  tape: 'fire: Kevlar tape on tabs (bolted)',
  rope: 'fire: Kevlar rope ring',
  bumper: 'practice: TPU bumpers on tabs',
}
const ENDS_BY_LABEL = Object.fromEntries(Object.entries(ENDS).map(([k, v]) => [v, k]))
export const endsKey = (label) => ENDS_BY_LABEL[label] || label

export const CNC_PARAMS = [
  { key: 'material', label: 'Material', options: Object.values(CNC_MATERIALS).map((m) => m.name), value: CNC_MATERIALS.al6061.name, group: 'Cut' },
  { key: 'process', label: 'Cut with', options: Object.values(PROCESSES).map((m) => m.name), value: PROCESSES.laser.name, group: 'Cut' },
  { key: 'thick', label: 'Sheet thickness', unit: 'mm', min: 1, max: 15, step: 0.5, value: 4, group: 'Cut', presetsFrom: 'material', hint: 'Buy what the shop stocks: the chips are the usual sheet sizes for this material.' },
  { key: 'tool', label: 'Router bit', unit: 'mm', min: 1, max: 8, step: 0.025, value: 3.175, presets: [3.175, 4, 6], group: 'Cut', onlyFor: 'router', hint: '3.175 mm (1/8") is the usual bit for detail. Bigger bits cut faster but round more.' },
  { key: 'clear', label: 'Bore clearance', unit: 'mm', min: 0, max: 1, step: 0.05, value: 0.2, group: 'Cut', hint: 'Bore = pole + this. Metal does not stretch: 0.2 slides on a 22 mm pole; the collar does the gripping.' },
  { key: 'mount', label: 'On the pole', options: ['collar round the pole', 'End Expander inside the pole'], value: 'collar round the pole', group: 'Cut', hint: 'Collar: a clamp collar (the forge Clamp Collar, or a bought flange collar) bolts to the plate and clamps round the pole; fit a Pole Insert inside a carbon pole. End Expander: the plate bolts onto an expander that grips the INSIDE of the pole end, so nothing squeezes the carbon. Print it from Pole fittings.' },
  { key: 'flangeN', label: 'Collar bolts', unit: '', min: 0, max: 8, step: 1, value: 4, group: 'Cut', hint: 'A flat plate needs a collar to stay square on the pole: bolt on a flanged shaft collar (search "flange shaft collar 22 mm" or "rigid flange coupling 22 mm"), or print the forge collar for practice hubs. 0 = just the bore.' },
  { key: 'flangePCD', label: 'Collar bolt circle', unit: 'mm', min: 30, max: 90, step: 0.5, value: 44, group: 'Cut', hint: 'Measure across the bolt holes of your collar, centre to centre.' },
  { key: 'flangeHole', label: 'Collar bolt hole', unit: 'mm', min: 3, max: 8.5, step: 0.1, value: 4.5, presets: [3.4, 4.5, 5.5], group: 'Cut', hint: '3.4 for M3, 4.5 for M4, 5.5 for M5.' },
  { key: 'engrave', label: 'Engrave raised shapes', options: ['on', 'off'], value: 'on', group: 'Cut', hint: 'The outlines of the shapes that stand proud on a printed hub, as a separate engrave layer, so the design still reads on a flat plate.' },

  { key: 'ends', label: 'Ends', options: Object.values(ENDS), value: ENDS.tape, group: 'Ends', hint: 'Fire: Kevlar wicks on tabs that stand off past the rim, or a Kevlar rope ring round it (metal only). Practice: TPU bumpers on the same tabs, weighted like a wet wick, so practice feels like fire.' },
  { key: 'tabs', label: 'Wicks', unit: '', min: 2, max: 12, step: 1, value: 3, presets: [3, 4, 6], group: 'Ends', hint: 'How many wicks round the hub. 3 is light and quick, 4 is the most common, 6 is a big ring of fire.' },
  { key: 'tabAngle', label: 'Tab position', unit: '°', min: -90, max: 90, step: 0.5, value: 0, group: 'Ends', hint: 'Turn the tabs to line up with spokes in the design.' },
  { key: 'tabW', label: 'Tab width', unit: 'mm', min: 12, max: 40, step: 0.5, value: 20, group: 'Ends' },
  { key: 'neck', label: 'Tab neck', unit: 'mm', min: 4, max: 40, step: 0.5, value: 10, group: 'Ends', hint: 'Bare metal between rim and wick: keeps the flame off the rim.' },
  { key: 'wickW', label: 'Wick width', unit: 'mm', min: 20, max: 76, step: 1, value: 50, presets: [25, 38, 50], group: 'Ends', hint: 'The Kevlar tape width: 25 mm (1"), 38 mm (1.5") or 50 mm (2", the size on commercial dragon spokes).' },
  { key: 'tapeLen', label: 'Tape per wick', unit: 'mm', min: 100, max: 900, step: 10, value: 450, group: 'Ends', hint: 'Commercial 2" dragon spokes use about 450 mm of tape each.' },
  { key: 'tapeT', label: 'Tape thickness', unit: 'mm', min: 1, max: 5, step: 0.1, value: 2.5, group: 'Ends' },
  { key: 'tabBolt', label: 'Wick bolt hole', unit: 'mm', min: 3, max: 6.5, step: 0.1, value: 4.5, presets: [3.4, 4.5], group: 'Ends', hint: 'Two stainless bolts through tape and tab. 4.5 for M4.' },
  { key: 'ropeD', label: 'Rope', unit: 'mm', min: 5, max: 20, step: 0.5, value: 10, presets: [6, 10, 13, 16], group: 'Ends', hint: '10 mm (3/8") braided Kevlar rope is the common one.' },
  { key: 'ropePlace', label: 'Rope sits', options: ['woven through slots', 'on the face', 'round the edge'], value: 'woven through slots', group: 'Ends', hint: 'Woven: the rope threads up and down through a ring of slots in the rim, over one face then under the other, so its own tension holds it; tie the two ends off with stainless wire at the two small holes. On the face: in a groove (router/mill) or flat on the rim band, laced down with stainless wire. Round the edge: like a fire hoop, laced through holes just inside the rim.' },
  { key: 'laceStep', label: 'Lacing every', unit: 'mm', min: 12, max: 60, step: 1, value: 25, group: 'Ends', hint: 'Pairs of holes for stainless wire (or Kevlar thread) that hold the rope down. Woven: the gap between slots is about 1.6 times this.' },
]

export function cncDefaults(design) {
  const c = {}
  for (const d of CNC_PARAMS) c[d.key] = d.value
  const pre = design.cnc || {}
  if (pre.material) c.material = CNC_MATERIALS[pre.material]?.name || c.material
  if (pre.process) c.process = PROCESSES[pre.process]?.name || c.process
  if (pre.ends) c.ends = ENDS[pre.ends] || c.ends
  for (const [k, v] of Object.entries(pre)) if (!['material', 'process', 'ends'].includes(k)) c[k] = v
  const m = matOf(c)
  if (!pre.thick) c.thick = m.def
  return c
}
export const matOf = (c) => Object.values(CNC_MATERIALS).find((m) => m.name === c.material) || CNC_MATERIALS.al6061
export const procKey = (c) => Object.keys(PROCESSES).find((k) => PROCESSES[k].name === c.process) || 'laser'
export const matKey = (c) => Object.keys(CNC_MATERIALS).find((k) => CNC_MATERIALS[k].name === c.material) || 'al6061'

// ------------------------------------------------------------------ helpers
function meshData(m) {
  const mesh = m.getMesh()
  const np = mesh.numProp
  const n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}
function polyStats(polys) {
  let A = 0, cx = 0, cy = 0, L = 0
  for (const P of polys) {
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const cr = P[j][0] * P[i][1] - P[i][0] * P[j][1]
      A += cr / 2
      cx += ((P[j][0] + P[i][0]) * cr) / 6
      cy += ((P[j][1] + P[i][1]) * cr) / 6
      L += Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1])
    }
  }
  return { A, cx: A ? cx / A : 0, cy: A ? cy / A : 0, L }
}
// Kevlar: 1.44 g/cm3, about 60% fibre in a wound wick or braided rope
const KEVLAR = 1.44 * 0.6
const WET = 1.3 // white gas / paraffin soaked in, spun off: about 30% on top of the dry wick
const TPU = 1.21

/** A wick tape wound flat round a tab: diameter of the finished head. */
export const wickHeadD = (c, t) => Math.sqrt((4 * (c.tapeLen * c.tapeT + c.tabW * t)) / Math.PI)

// ------------------------------------------------------------- flat plate
export function buildPlate(wasm, hub, p, c) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  const circle = (r, n = 256) => k(CrossSection.circle(r, n))
  try {
    const mat = matOf(c), pk = procKey(c), proc = PROCESSES[pk]
    const metal = mat.kind === 'metal'
    let ends = endsKey(c.ends)
    const warns = [], fixes = []
    if (!metal && (ends === 'tape' || ends === 'rope')) { warns.push(`Fire wicks only go on metal: ${mat.name} gets practice bumpers instead.`); ends = 'bumper' }
    if (!metal && !proc.plastics) warns.push(`${proc.name} only cuts metal. Pick a laser, waterjet or router for ${mat.name}.`)
    if (pk === 'laser' && matKey(c) === 'pc') warns.push('A laser burns polycarbonate edges yellow and the fumes are harmful: cut it on a router or waterjet.')
    if (pk === 'laser' && (matKey(c) === 'hdpe' || matKey(c) === 'pom')) warns.push(`${mat.name} melts on a laser: use a router.`)
    const t = c.thick
    const R = p.diameter / 2
    const lim = proc.limits(t, c.tool, mat.kind)
    const boreR = (p.poleOD + c.clear) / 2

    let S = k(new CrossSection(hub.polygons.base, 'EvenOdd'))
    // the printed bore had crush ribs: fill it, the plate gets a plain round bore
    const land = c.flangeN > 0 ? c.flangePCD / 2 + c.flangeHole / 2 + Math.max(4, t) : boreR + Math.max(6, 1.5 * t)
    S = k(S.add(circle(Math.max(land, boreR + 3), 128)))

    // rope on the face needs a band wide enough for the rope and a lacing hole each side
    const laceR = 1.1 // 2.2 mm holes take 1–1.5 mm stainless wire or doubled Kevlar thread
    let ropeR = 0, band = 0
    if (ends === 'rope') {
      if (c.ropePlace === 'woven through slots') {
        band = c.ropeD + 1.5 + 2 * Math.max(6, t * 1.5)
        ropeR = R - band / 2
        S = k(S.add(k(circle(R).subtract(circle(R - band)))))
        if (band > p.rimW + 0.5) fixes.push(`widened the rim to ${band.toFixed(0)} mm to carry the woven rope`)
      } else if (c.ropePlace === 'on the face') {
        band = c.ropeD + 2 * (2 * laceR + 3)
        ropeR = R - band / 2
        S = k(S.add(k(circle(R).subtract(circle(R - band)))))
        if (band > p.rimW + 0.5) fixes.push(`widened the rim to ${band.toFixed(0)} mm to carry the rope`)
      } else ropeR = R + c.ropeD / 2 - 0.6
    }

    // what the cutter cannot do: gaps it cannot get into, bars it would leave too thin
    const g = lim.gap / 2
    const closed = k(k(S.offset(g, 'Round', 2, 24)).offset(-g, 'Round', 2, 24))
    const filledBits = k(k(closed.subtract(S)).offset(-0.05)).decompose().map(k).filter((q) => q.area() > 2)
    if (filledBits.length) fixes.push(`filled ${filledBits.length} gap${filledBits.length > 1 ? 's' : ''} narrower than ${lim.gap.toFixed(1)} mm (too small for the ${pk === 'router' ? 'bit' : 'cut'})`)
    S = k(closed.intersect(circle(R)))
    const opened = k(k(S.offset(-lim.web / 2, 'Round', 2, 16)).offset(lim.web / 2, 'Round', 2, 16))
    const thin = k(k(S.subtract(opened)).offset(-0.05)).decompose().map(k).filter((q) => q.area() > 1)
    if (thin.length) {
      S = k(k(S.add(k(k(CrossSection.union(thin)).offset(lim.web * 0.45, 'Round', 2, 16)))).intersect(circle(R)))
      const n = thin.filter((q) => q.area() > 4).length
      if (n) fixes.push(`thickened ${n} bar${n > 1 ? 's' : ''} thinner than ${lim.web.toFixed(1)} mm`)
    }
    // anything not joined on falls out when it is cut
    const parts = S.decompose().map(k)
    if (parts.length > 1) {
      parts.sort((a, b) => b.area() - a.area())
      S = parts[0]
      fixes.push(`left out ${parts.length - 1} loose piece${parts.length > 2 ? 's' : ''} that would fall out`)
    }

    // ------------------------------------------------------------- tabs
    const tabbed = ends === 'tape' || ends === 'bumper'
    const tabAngles = []
    const holes = [] // { x, y, r, kind }
    if (tabbed) {
      const L = c.neck + c.wickW, r0 = R - Math.max(p.rimW, 6) - 2
      const rr = Math.min(c.tabW / 2 - 0.5, 4)
      const tab = k(k(k(k(CrossSection.square([R + L - r0, c.tabW], false)).translate([r0, -c.tabW / 2])).offset(-rr, 'Round', 2, 16)).offset(rr, 'Round', 2, 16))
      const list = []
      for (let i = 0; i < c.tabs; i++) {
        const a = p.rotate + c.tabAngle + (360 * i) / c.tabs
        tabAngles.push(a)
        list.push(k(tab.rotate(a)))
        const ar = (a * Math.PI) / 180
        for (const f of [0.28, 0.72]) {
          const r = R + c.neck + c.wickW * f
          holes.push({ x: r * Math.cos(ar), y: r * Math.sin(ar), r: c.tabBolt / 2, kind: 'wick bolt' })
        }
      }
      S = k(S.add(k(CrossSection.union(list))))
      // round the inside corners where each tab meets the rim
      S = k(k(S.offset(3, 'Round', 2, 24)).offset(-3, 'Round', 2, 24))
    }

    // ------------------------------------------------------------- holes
    const inside = (c.mount || '').startsWith('End Expander')
    if (inside) c = { ...c, flangeN: 4 } // the expander has 4 bolts
    holes.push({ x: 0, y: 0, r: inside ? 6.2 : boreR, kind: inside ? 'expander bolt head' : 'bore' })
    for (let i = 0; i < c.flangeN; i++) {
      const a = (TAU * i) / c.flangeN + TAU / (2 * Math.max(1, c.flangeN))
      holes.push({ x: (c.flangePCD / 2) * Math.cos(a), y: (c.flangePCD / 2) * Math.sin(a), r: c.flangeHole / 2, kind: 'collar bolt' })
    }
    let pocket = null, pocketDepth = 0
    const weave = ends === 'rope' && c.ropePlace === 'woven through slots'
    let nSlots = 0
    if (weave) {
      // an even number of slots, so over-and-under comes back round to where it started
      nSlots = Math.max(8, 2 * Math.round((TAU * ropeR) / (c.laceStep * 1.6) / 2))
      const sw = c.ropeD + 1.5, sl = c.ropeD * 1.5 + 2
      const slot = k(k(k(CrossSection.square([sw, sl - sw], true)).add(k(k(CrossSection.circle(sw / 2, 32)).translate([0, (sl - sw) / 2])))).add(k(k(CrossSection.circle(sw / 2, 32)).translate([0, -(sl - sw) / 2]))))
      const slots = []
      for (let i = 0; i < nSlots; i++) slots.push(k(k(slot.translate([ropeR, 0])).rotate((360 * i) / nSlots)))
      S = k(S.subtract(k(CrossSection.union(slots))))
      // tie-off: two small holes beside the first slot, for stainless wire round both rope ends
      for (const dr of [-1, 1]) holes.push({ x: ropeR + dr * (sw / 2 + laceR + 2.2), y: 0, r: laceR, kind: 'tie-off' })
    }
    if (ends === 'rope' && !weave) {
      const n = Math.max(8, Math.round((TAU * ropeR) / c.laceStep))
      for (let i = 0; i < n; i++) {
        const a = (TAU * i) / n
        const radii = c.ropePlace === 'on the face'
          ? [ropeR - c.ropeD / 2 - laceR - 1.2, ropeR + c.ropeD / 2 + laceR + 1.2]
          : [R - laceR - Math.max(2.5, t)]
        for (const r of radii) holes.push({ x: r * Math.cos(a), y: r * Math.sin(a), r: laceR, kind: 'lacing' })
      }
      if (c.ropePlace === 'on the face' && proc.mill) {
        pocketDepth = Math.min(c.ropeD * 0.35, t - 1.5)
        if (pocketDepth >= 0.8) pocket = k(circle(ropeR + c.ropeD * 0.45).subtract(circle(ropeR - c.ropeD * 0.45)))
        else { pocketDepth = 0; warns.push(`The sheet is too thin for a rope groove (needs ${(c.ropeD * 0.35 + 1.5).toFixed(1)} mm or more): the rope sits on the face, laced down.`) }
      }
    }
    // small holes a cutter cannot make get drilled
    const tooSmall = holes.filter((h) => 2 * h.r < lim.gap)
    if (tooSmall.length) warns.push(`${tooSmall.length} hole${tooSmall.length > 1 ? 's are' : ' is'} smaller than ${lim.gap.toFixed(1)} mm: ${pk === 'plasma' ? 'plasma marks them; drill them after' : 'they are on the DRILL layer; drill them after cutting'}.`)

    const holeSec = k(CrossSection.union(holes.map((h) => k(k(CrossSection.circle(h.r, Math.max(24, Math.ceil(h.r * 8)))).translate([h.x, h.y])))))
    const plate = k(S.subtract(holeSec))

    // engrave: the raised shapes' outlines, kept 1 mm inside the plate
    let engrave = []
    if (c.engrave === 'on' && hub.polygons.relief?.length && pk !== 'plasma') {
      const rel = k(k(new CrossSection(hub.polygons.relief, 'EvenOdd')).intersect(k(plate.offset(-1, 'Round', 2, 16))))
      if (!rel.isEmpty()) engrave = rel.toPolygons()
    }

    // ------------------------------------------------------------- 3D
    let solid = k(plate.extrude(t))
    if (pocket) solid = k(solid.subtract(k(k(pocket.extrude(pocketDepth + 1)).translate([0, 0, t - pocketDepth]))))
    const meshes = { combined: meshData(solid) }

    // kevlar or practice ends
    let kev = null, kevG = 0, bumper = null, bumperG = 0, headD = 0
    const kevParts = []
    if (ends === 'tape') {
      headD = wickHeadD(c, t)
      const wick = k(k(k(Manifold.cylinder(c.wickW, headD / 2, headD / 2, 40)).rotate([0, 90, 0])).translate([R + c.neck, 0, t / 2]))
      for (const a of tabAngles) kevParts.push(k(wick.rotate([0, 0, a])))
      kevG = (c.tapeLen * c.wickW * c.tapeT / 1000) * KEVLAR * c.tabs
    }
    let ropeLen = 0
    if (ends === 'rope' && weave) {
      // the rope dives through each slot and runs over the top face, then under the bottom, and so on
      const rr = c.ropeD / 2, A = t / 2 + rr * 0.9, per = 10, n = nSlots * per
      const pts = []
      for (let i = 0; i <= n; i++) {
        const th = (TAU * i) / n
        pts.push([ropeR * Math.cos(th), ropeR * Math.sin(th), t / 2 + A * Math.sin((nSlots / 2) * th)])
      }
      const ball = k(Manifold.sphere(rr, 16))
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[i + 1]
        ropeLen += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
        kevParts.push(k(Manifold.hull([k(ball.translate(a)), k(ball.translate(b))])))
      }
      kevG = (ropeLen * Math.PI * rr ** 2 / 1000) * KEVLAR
    } else if (ends === 'rope') {
      const zc = c.ropePlace === 'on the face' ? t - pocketDepth + c.ropeD / 2 * 0.95 : t / 2
      kevParts.push(k(k(CrossSection.circle(c.ropeD / 2, 24)).translate([ropeR, zc]).revolve(256)))
      ropeLen = TAU * ropeR
      kevG = (ropeLen * Math.PI * (c.ropeD / 2) ** 2 / 1000) * KEVLAR
    }
    if (kevParts.length) kev = k(Manifold.union(kevParts))
    if (ends === 'bumper') {
      // weight one like a wet wick: solve the wall for the target mass
      const target = (c.tapeLen * c.wickW * c.tapeT / 1000) * KEVLAR * WET
      const W = c.tabW + 0.4, T = t + 0.4, L = c.wickW
      const V = (target / TPU) * 1000
      const wall = Math.max(2, Math.min(25, (-2 * (W + T) + Math.sqrt(4 * (W + T) ** 2 + (16 * V) / L)) / 8))
      const outer = k(Manifold.cube([L + 3, W + 2 * wall, T + 2 * wall], false))
      const slot = k(k(Manifold.cube([L + 0.01, W, T], false)).translate([-0.01, wall, wall]))
      let b = k(outer.subtract(slot))
      for (const f of [0.28, 0.72]) b = k(b.subtract(k(k(Manifold.cylinder(T + 2 * wall + 2, c.tabBolt / 2, c.tabBolt / 2, 24)).translate([L * f, W / 2 + wall, -1]))))
      bumperG = (b.volume() / 1000) * TPU
      // printed slot-up isn't possible, so it prints on its side: the slot is a short bridge
      bumper = { wall, g: bumperG, target }
      meshes.bumperFlat = meshData(k(k(b.rotate([90, 0, 0])).translate([0, 0, W + 2 * wall])))
      const placed = k(b.translate([R + c.neck, -(W / 2 + wall), t / 2 - T / 2 - wall]))
      kev = k(Manifold.union(tabAngles.map((a) => k(placed.rotate([0, 0, a])))))
      meshes.practice = meshData(kev)
      kev = null
    }
    if (kev) meshes.kevlar = meshData(kev)

    // ------------------------------------------------------------- numbers
    const polys = plate.toPolygons()
    const ps = polyStats(polys)
    const gPlate = ((ps.A * t - (pocket ? pocket.area() * pocketDepth : 0)) / 1000) * mat.density
    const outer = polyStats(S.toPolygons())
    const holesL = holes.reduce((a, h) => a + TAU * h.r, 0)
    const gEnds = kevG * (ends === 'tape' || ends === 'rope' ? WET : 0) + (ends === 'bumper' ? bumperG * c.tabs : 0)
    const overD = tabbed ? 2 * (R + c.neck + c.wickW) + (ends === 'tape' ? 0 : 0) : ends === 'rope' && c.ropePlace === 'round the edge' ? 2 * (R + c.ropeD) : 2 * R
    if (metal && gPlate > 700) warns.push(`${gPlate.toFixed(0)} g is heavy for one hub: thinner sheet, aluminium, or a design with more open space.`)
    if (!metal && t < 4 && matKey(c) === 'acrylic') warns.push('Perspex under 4 mm snaps easily on a spinning hub: 5–6 mm is safer.')
    if (ends === 'tape' && c.tabW < 2 * c.tabBolt + 6) warns.push('Tabs are narrow for the wick bolts: widen them or use smaller bolts.')

    return {
      cnc: true,
      ends,
      meshes,
      viewR: overD / 2,
      polygons: { base: polys, relief: [], pods: [], weak: [] },
      layers: {
        cut: S.toPolygons(),
        holes: holes.filter((h) => 2 * h.r >= lim.gap),
        drill: holes.filter((h) => 2 * h.r < lim.gap),
        pocket: pocket ? pocket.toPolygons() : [],
        pocketDepth,
        engrave,
      },
      holes,
      podH: 0,
      ring: null,
      snap: null,
      stats: {
        tris: meshes.combined.indices.length / 3,
        gPlate, gEnds, gTotal: gPlate + gEnds,
        kevG, bumper, headD, wet: WET,
        area: ps.A, cutLen: outer.L + holesL, pierces: S.toPolygons().length + holes.length,
        cx: ps.cx, cy: ps.cy, offset: Math.hypot(ps.cx, ps.cy),
        overD, thick: t, lim, fixes, warns,
        tabs: tabbed ? c.tabs : 0, laceHoles: holes.filter((h) => h.kind === 'lacing').length,
        ropeLen, ropeR, pocketDepth, slots: nSlots,
      },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

// ------------------------------------------------------------ spoke hub
export const SPOKE_ENDS = {
  store: 'fire: 2" Kevlar spokes (bought)',
  fist: 'fire: monkey fist (Kevlar rope)',
  tpu: 'practice: TPU weights',
  led: 'practice: LED capsule ends',
  none: 'none (hub only)',
}
const SPOKE_BY_LABEL = Object.fromEntries(Object.entries(SPOKE_ENDS).map(([k, v]) => [v, k]))

export const SPOKE_PARAMS = [
  { key: 'spokes', label: 'Spokes', unit: '', min: 3, max: 8, step: 1, value: 3, presets: [3, 4], hint: 'Per hub. 3 is light and quick; 4 is the most common.' },
  { key: 'hubD', label: 'Hub diameter', unit: 'mm', min: 50, max: 140, step: 1, value: 92 },
  { key: 'hubT', label: 'Hub thickness', unit: 'mm', min: 14, max: 34, step: 0.5, value: 18, hint: 'At least the rod plus 5 mm of wall each side.' },
  { key: 'rodD', label: 'Spoke rod', unit: 'mm', min: 5, max: 12, step: 0.1, value: 8, presets: [6, 8, 10], hint: 'The common 2" dragon fire spoke has an 8 mm rod. Measure yours.' },
  { key: 'rodClr', label: 'Socket clearance', unit: 'mm', min: 0, max: 0.8, step: 0.05, value: 0.15 },
  { key: 'depth', label: 'Socket depth', unit: 'mm', min: 12, max: 40, step: 0.5, value: 25, hint: 'How far each spoke goes in. Deeper holds better but needs a bigger hub.' },
  { key: 'grub', label: 'Clamp screws', options: ['M5', 'M4', 'M6'], value: 'M5', hint: 'One grub screw per spoke, from the face, onto the rod. Two more grip the pole.' },
  { key: 'spokeLen', label: 'Spoke length', unit: 'mm', min: 100, max: 300, step: 1, value: 185, hint: 'Whole spoke, rod end included. 185 mm on a common 2" dragon fire spoke.' },
  { key: 'ends', label: 'Ends', options: Object.values(SPOKE_ENDS), value: SPOKE_ENDS.store, hint: 'Fire for burning; practice ends are the same length and about the same weight as a wet wick, so the staff moves the same.' },
  { key: 'practiceG', label: 'Practice end weight', unit: 'g', min: 15, max: 120, step: 1, value: 60, hint: 'About a fuelled 2" wick. Lighter = easier to learn, heavier = closer to fire.' },
  { key: 'poleGrip', label: 'Pole grip', options: ['inside the pole (expanding spigot)', 'split clamp (pinch bolt)', 'grub screws'], value: 'inside the pole (expanding spigot)', hint: 'Inside the pole: a spigot under the hub slides into the pole end and one M6 bolt spreads it against the inside of the tube, so nothing squeezes the carbon. Split clamp: the hub is slit and one M5 bolt pinches it round the pole. Grub screws: two M5 screws onto the pole. Clamp and grub screws need a Pole Insert inside a carbon pole.' },
  { key: 'poleWall', label: 'Pole wall', unit: 'mm', min: 0.5, max: 5, step: 0.05, value: 1.5, hint: 'For the expanding spigot: (outside − inside) ÷ 2. Set it once in My pole at the top right.' },
  { key: 'twist', label: 'Spoke offset', unit: '°', min: 0, max: 45, step: 0.5, value: 0, hint: 'Turn the spokes against the pole grub screws.' },
]

const GRUB = { M4: { tap: 3.3, clear: 4.5, nut: 7.0 }, M5: { tap: 4.2, clear: 5.5, nut: 8.0 }, M6: { tap: 5.0, clear: 6.6, nut: 10.0 } }

/**
 * A hub that takes fire spokes. mode 'cnc': aluminium/steel, tapped holes,
 * plain bore. mode 'print': practice hub in PA or PETG with nut traps.
 * shape: 'round' | 'star' | 'petal' | 'flower'.
 */
export function buildSpokeHub(wasm, p, opts) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const cnc = opts.mode === 'cnc'
    const shape = opts.shape || 'round'
    const n = p.spokes, T = p.hubT, Rout = p.hubD / 2
    const rs = (p.rodD + (cnc ? p.rodClr : p.rodClr + 0.25)) / 2
    const boreR = (p.poleOD + (cnc ? 0.2 : p.fit)) / 2
    const G = GRUB[p.grub] || GRUB.M5
    const warns = []
    const ang = (i) => (TAU * i) / n + ((p.rotate + p.twist) * Math.PI) / 180
    const deg = (a) => (a * 180) / Math.PI

    // ---------------------------------------------------------- outline
    let body
    const core = k(CrossSection.circle(Math.max(boreR + 9, Rout * (shape === 'round' ? 1 : 0.55)), 128))
    if (shape === 'round') body = k(CrossSection.circle(Rout, 160))
    else {
      const bossR = rs + Math.max(6, p.rodD * 0.75) // wall round each socket
      const lobes = []
      for (let i = 0; i < n; i++) {
        const a = ang(i)
        if (shape === 'star') lobes.push(k(k(k(CrossSection.square([Rout - bossR, 2 * bossR], false)).translate([0, -bossR])).rotate(deg(a))), k(k(CrossSection.circle(bossR, 48)).translate([(Rout - bossR) * Math.cos(a), (Rout - bossR) * Math.sin(a)])))
        else {
          // petal / flower: a fat teardrop round each socket
          const pts = []
          const w = shape === 'flower' ? bossR * 1.55 : bossR * 1.25
          for (let s = 0; s <= 40; s++) {
            const u = (s / 40) * TAU
            const r = Rout * 0.5 + (Rout * 0.5) * Math.cos(u / 2) ** 2
            const x = (Rout * 0.55) * (1 - Math.cos(u)) / 2 + (Rout * 0.45)
            const y = Math.sin(u) * w * (0.5 + 0.5 * Math.cos(u / 2) ** 2) * (shape === 'flower' ? 1 : 0.9)
            pts.push([Math.min(x, Rout), y])
            void r
          }
          lobes.push(k(k(new CrossSection([pts], 'Positive')).rotate(deg(a))), k(k(CrossSection.circle(bossR, 48)).translate([(Rout - bossR) * Math.cos(a), (Rout - bossR) * Math.sin(a)])))
        }
      }
      body = k(k(k(CrossSection.union([core, ...lobes])).offset(4, 'Round', 2, 32)).offset(-4, 'Round', 2, 32))
      if (shape === 'flower') {
        // small vent holes between petals: lighter, and they glow orange in the firelight
        const vents = []
        for (let i = 0; i < n; i++) {
          const a = ang(i) + Math.PI / n, r = Rout * 0.42
          vents.push(k(k(CrossSection.circle(Math.min(5, Rout * 0.07), 32)).translate([r * Math.cos(a), r * Math.sin(a)])))
        }
        const v = k(CrossSection.union(vents))
        if (k(v.intersect(body)).area() > 0.95 * v.area()) body = k(body.subtract(v))
      }
    }

    let solid = k(body.extrude(T))
    const cuts = []
    // sockets: from the hub edge inward along each spoke
    const sockets = []
    for (let i = 0; i < n; i++) {
      const a = ang(i)
      const edge = Rout
      const r0 = edge - p.depth
      if (r0 < boreR + 4) warns.push(`Sockets reach within ${(r0 - boreR).toFixed(1)} mm of the bore: make the hub bigger or the sockets shallower.`)
      sockets.push({ a, r0, edge })
      cuts.push(k(k(k(Manifold.cylinder(p.depth + 20, rs, rs, 40)).rotate([0, 90, 0])).translate([r0, 0, T / 2])).rotate([0, 0, deg(a)]))
      // clamp screw from the face onto the rod
      const xs = edge - p.depth * 0.45
      const hole = cnc ? G.tap : G.clear
      cuts.push(k(k(k(Manifold.cylinder(T / 2 + 1, hole / 2, hole / 2, 24)).translate([xs, 0, T / 2])).rotate([0, 0, deg(a)])))
      if (!cnc) cuts.push(k(k(k(Manifold.cylinder(4.2, G.nut / Math.sqrt(3) + 0.15, G.nut / Math.sqrt(3) + 0.15, 6)).translate([xs, 0, T - 4.2 + 0.01])).rotate([0, 0, deg(a)]))) // nut trap
    }
    if (warns.length > 1) warns.splice(1)
    // the pole: inside it (expanding spigot), or round it (split clamp or grub screws)
    const grip = p.poleGrip || 'grub screws'
    let spigot = null
    if (grip.startsWith('inside')) {
      const ri = (p.poleOD - 2 * (p.poleWall || 1.5)) / 2 - 0.15
      if (ri < 6) warns.push('The pole is too narrow inside for the expanding spigot: pick the split clamp.')
      spigot = expanderParts(wasm, k, { ri: Math.max(ri, 6), L: 30 })
      cuts.push(k(k(Manifold.cylinder(T + 2, 3.3, 3.3, 24)).translate([0, 0, -1]))) // M6 through the centre
      cuts.push(k(k(Manifold.cylinder(6.5, 5.6, 5.6, 32)).translate([0, 0, T - 6]))) // the bolt head sinks in
    } else {
      cuts.push(k(k(Manifold.cylinder(T + 2, boreR, boreR, 96)).translate([0, 0, -1])))
      if (grip.startsWith('split')) {
        const a = ang(0) + Math.PI / n
        cuts.push(k(k(k(Manifold.cube([Rout + 10, 1.6, T + 2], false)).translate([boreR - 1, -0.8, -1])).rotate([0, 0, deg(a)])))
        const hole = (cnc ? G.tap : G.clear) / 2, xb = boreR + 7
        cuts.push(k(k(k(k(Manifold.cylinder(Rout * 2, hole, hole, 24)).rotate([90, 0, 0])).translate([xb, Rout, T / 2])).rotate([0, 0, deg(a)])))
        if (cnc) cuts.push(k(k(k(k(Manifold.cylinder(Rout, G.clear / 2, G.clear / 2, 24)).rotate([90, 0, 0])).translate([xb, Rout + 0.8, T / 2])).rotate([0, 0, deg(a)]))) // clearance on the head side
        else cuts.push(k(k(k(k(Manifold.cylinder(4.5, G.nut / Math.sqrt(3) + 0.15, G.nut / Math.sqrt(3) + 0.15, 6)).rotate([90, 0, 0])).translate([xb, -12, T / 2])).rotate([0, 0, deg(a)])))
      } else for (const j of [0, Math.floor(n / 2)]) {
        const a = ang(j) + Math.PI / n
        cuts.push(k(k(k(k(Manifold.cylinder(Rout + 2, (cnc ? G.tap : G.clear) / 2, (cnc ? G.tap : G.clear) / 2, 24)).rotate([0, 90, 0])).translate([0, 0, T / 2])).rotate([0, 0, deg(a)])))
      }
    }
    solid = k(solid.subtract(k(Manifold.union(cuts))))
    if (spigot) solid = k(solid.add(spigot.sleeve))
    const meshes = { combined: meshData(solid) }
    if (spigot) meshes.wedgeFlat = meshData(spigot.wedge)

    // ---------------------------------------------------------- spokes + ends
    let ek = SPOKE_BY_LABEL[p.ends] || p.ends || 'store'
    // wicks only ever go on a fire-safe (metal) hub: anything else gets practice ends
    if (!opts.fireSafe && (ek === 'store' || ek === 'fist')) { ek = 'tpu'; warns.push('Fire wicks only go on a metal hub: this one is shown with practice ends.') }
    const outLen = p.spokeLen - p.depth // past the hub edge
    const rods = [], kev = [], prac = []
    let gSpoke = 0, gEnd = 0, endInfo = null
    const along = (m, r) => (a) => k(k(m.translate([r, 0, T / 2])).rotate([0, 0, deg(a)]))
    const rodM = (len) => k(k(Manifold.cylinder(len, p.rodD / 2, p.rodD / 2, 24)).rotate([0, 90, 0]))
    if (ek !== 'none') {
      const wickL = 50
      if (ek === 'store') {
        const rod = rodM(p.spokeLen - wickL), D = 40
        const wick = k(k(k(Manifold.cylinder(wickL, D / 2, D / 2, 40)).rotate([0, 90, 0])).translate([p.spokeLen - wickL, 0, 0]))
        for (const s of sockets) (rods.push(along(rod, s.r0)(s.a)), kev.push(along(wick, s.r0)(s.a)))
        gSpoke = 88 // a typical 2" spoke, wick included, dry
        endInfo = { kind: 'store', wickD: D, wickL }
      } else if (ek === 'fist') {
        const D = 46
        const rod = rodM(p.spokeLen - D / 2)
        const fist = k(k(Manifold.sphere(D / 2, 48)).translate([p.spokeLen - D / 2, 0, 0]))
        for (const s of sockets) (rods.push(along(rod, s.r0)(s.a)), kev.push(along(fist, s.r0)(s.a)))
        gSpoke = (Math.PI * (p.rodD / 2) ** 2 * p.spokeLen / 1000) * 7.93 + 45
        endInfo = { kind: 'fist', D }
      } else {
        const rod = rodM(p.spokeLen - 30)
        let end, flat
        if (ek === 'tpu') {
          // a TPU bob the rod pushes into: diameter set so it weighs practiceG
          const L = 50
          const V = (p.practiceG / TPU) * 1000 + Math.PI * (p.rodD / 2) ** 2 * (L - 8)
          const D = Math.max(p.rodD + 8, 2 * Math.sqrt(V / (Math.PI * L)))
          const bob = k(k(Manifold.cylinder(L, D / 2, D / 2, 48)).subtract(k(k(Manifold.cylinder(L - 8 + 0.01, p.rodD / 2 - 0.15, p.rodD / 2 - 0.15, 24)).translate([0, 0, -0.01]))))
          flat = bob
          end = k(k(bob.rotate([0, 90, 0])).translate([p.spokeLen - L, 0, 0]))
          gEnd = (bob.volume() / 1000) * TPU
          endInfo = { kind: 'tpu', D, L, g: gEnd }
        } else {
          // LED: a clear sleeve that holds a LED capsule (Ø21 × 88) in line with the spoke
          const cd = (p.capD || 21) + 0.6, cl = (p.capL || 88) + 1, wall = 1.8
          const L = cl + wall + 14
          let sleeve = k(Manifold.cylinder(L, cd / 2 + wall, cd / 2 + wall, 48))
          sleeve = k(sleeve.subtract(k(k(Manifold.cylinder(cl + 0.01, cd / 2, cd / 2, 48)).translate([0, 0, L - cl]))))
          sleeve = k(sleeve.subtract(k(k(Manifold.cylinder(12.01, p.rodD / 2 - 0.15, p.rodD / 2 - 0.15, 24)).translate([0, 0, -0.01]))))
          // snap lips at the open end
          flat = sleeve
          end = k(k(sleeve.rotate([0, 90, 0])).translate([p.spokeLen - 30 - 12 + 0.5, 0, 0]))
          gEnd = (sleeve.volume() / 1000) * TPU + (p.capMass || 32)
          endInfo = { kind: 'led', L, g: gEnd }
        }
        for (const s of sockets) (rods.push(along(rod, s.r0)(s.a)), prac.push(along(end, s.r0)(s.a)))
        gSpoke = (Math.PI * (p.rodD / 2) ** 2 * (p.spokeLen - 30) / 1000) * 2.70 + gEnd // aluminium practice rod
        meshes.practiceFlat = meshData(flat)
      }
    }
    if (rods.length) meshes.rods = meshData(k(Manifold.union(rods)))
    if (kev.length) meshes.kevlar = meshData(k(Manifold.union(kev)))
    if (prac.length) meshes.practice = meshData(k(Manifold.union(prac)))

    const density = opts.density || 2.7
    const gHub = (solid.volume() / 1000) * density
    const over = Rout + outLen
    const minWall = Math.min(T / 2 - rs, ...sockets.map((s) => s.r0 - boreR))
    if (T / 2 - rs < 4) warns.push(`Only ${(T / 2 - rs).toFixed(1)} mm of wall above and below each spoke: make the hub thicker.`)
    return {
      spoke: { mode: opts.mode, grip, ends: ek, endInfo, n, outLen, shape, grub: p.grub, tap: G.tap, clear: G.clear, socketD: 2 * rs, boreD: 2 * boreR, minWall },
      meshes,
      viewR: over,
      polygons: { base: body.toPolygons(), relief: [], pods: [], weak: [] },
      layers: {
        cut: body.toPolygons(),
        holes: [{ x: 0, y: 0, r: boreR, kind: 'bore' }],
        drill: sockets.map((s) => ({ x: (s.edge - p.depth * 0.45) * Math.cos(s.a), y: (s.edge - p.depth * 0.45) * Math.sin(s.a), r: G.tap / 2, kind: `${p.grub} tap` })),
        pocket: [], pocketDepth: 0, engrave: [],
      },
      podH: T,
      ring: null,
      snap: null,
      stats: {
        tris: meshes.combined.indices.length / 3,
        gHub, gSpoke, gEnd, gTotal: gHub + n * gSpoke, overD: 2 * over, warns,
        grams: gHub, gramsTotal: gHub + n * gSpoke, height: T,
      },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

// ------------------------------------------------------------ files
/** DXF R12, mm. Layers: CUT (outline + inside cuts), HOLES (circles cut through),
 *  DRILL (too small to cut: drill), POCKET_<depth> (rope groove, mill only), ENGRAVE. */
export function toDXF(layers, title = 'dragon hub') {
  const out = []
  const w = (code, v) => out.push(String(code), String(v))
  const L = { CUT: 7, HOLES: 1, DRILL: 3, ENGRAVE: 5 }
  const pocketName = layers.pocket.length ? `POCKET_${layers.pocketDepth.toFixed(1).replace('.', '_')}MM_DEEP` : null
  if (pocketName) L[pocketName] = 4
  if (layers.bend?.length) L.BEND = 2
  w(999, `${title} - dream.sc hub forge, millimetres`)
  w(0, 'SECTION'); w(2, 'HEADER'); w(9, '$ACADVER'); w(1, 'AC1009'); w(9, '$INSUNITS'); w(70, 4); w(9, '$MEASUREMENT'); w(70, 1); w(0, 'ENDSEC')
  w(0, 'SECTION'); w(2, 'TABLES'); w(0, 'TABLE'); w(2, 'LAYER'); w(70, Object.keys(L).length)
  for (const [name, col] of Object.entries(L)) { w(0, 'LAYER'); w(2, name); w(70, 0); w(62, col); w(6, 'CONTINUOUS') }
  w(0, 'ENDTAB'); w(0, 'ENDSEC')
  w(0, 'SECTION'); w(2, 'ENTITIES')
  const poly = (layer, P) => {
    w(0, 'POLYLINE'); w(8, layer); w(66, 1); w(70, 1); w(10, 0); w(20, 0); w(30, 0)
    for (const [x, y] of P) { w(0, 'VERTEX'); w(8, layer); w(10, x.toFixed(4)); w(20, y.toFixed(4)); w(30, 0) }
    w(0, 'SEQEND'); w(8, layer)
  }
  const circ = (layer, h) => { w(0, 'CIRCLE'); w(8, layer); w(10, h.x.toFixed(4)); w(20, h.y.toFixed(4)); w(30, 0); w(40, h.r.toFixed(4)) }
  for (const P of layers.cut) poly('CUT', P)
  for (const h of layers.holes) circ('HOLES', h)
  for (const h of layers.drill) circ('DRILL', h)
  if (pocketName) for (const P of layers.pocket) poly(pocketName, P)
  for (const P of layers.engrave) poly('ENGRAVE', P)
  // fold lines: open lines, not cuts
  for (const [a, b] of layers.bend || []) { w(0, 'LINE'); w(8, 'BEND'); w(10, a[0].toFixed(4)); w(20, a[1].toFixed(4)); w(30, 0); w(11, b[0].toFixed(4)); w(21, b[1].toFixed(4)); w(31, 0) }
  w(0, 'ENDSEC'); w(0, 'EOF')
  return out.join('\n') + '\n'
}

/** SVG at true size (mm): black = cut through, red = drill, blue = pocket, green = engrave. */
export function toCutSVG(layers, R) {
  // the drawing's own extent (a flat pattern is not centred on the staff)
  const xs = layers.cut.flat().map((q) => q[0]), ys = layers.cut.flat().map((q) => -q[1])
  const x0 = Math.min(...xs, -R) - 4, x1 = Math.max(...xs, R) + 4, y0 = Math.min(...ys, -R) - 4, y1 = Math.max(...ys, R) + 4
  const fit = layers.bend?.length || Math.max(-x0, x1, -y0, y1) > R + 6
  const path = (polys) => polys.map((P) => 'M' + P.map(([x, y]) => `${x.toFixed(3)},${(-y).toFixed(3)}`).join('L') + 'Z').join('')
  const circles = (list, col) => list.map((h) => `<circle cx="${h.x.toFixed(3)}" cy="${(-h.y).toFixed(3)}" r="${h.r.toFixed(3)}" fill="none" stroke="${col}" stroke-width="0.1"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(fit ? x1 - x0 : 2 * R + 8).toFixed(1)}mm" height="${(fit ? y1 - y0 : 2 * R + 8).toFixed(1)}mm" viewBox="${fit ? `${x0} ${y0} ${x1 - x0} ${y1 - y0}` : `${-R - 4} ${-R - 4} ${2 * R + 8} ${2 * R + 8}`}">
<g id="cut"><path d="${path(layers.cut)}" fill="none" stroke="#000" stroke-width="0.1"/>${circles(layers.holes, '#000')}</g>
<g id="drill">${circles(layers.drill, '#e00')}</g>
${layers.pocket.length ? `<g id="pocket-${layers.pocketDepth.toFixed(1)}mm"><path d="${path(layers.pocket)}" fill="#3060ff" fill-opacity="0.25" fill-rule="evenodd" stroke="#3060ff" stroke-width="0.1"/></g>` : ''}
${layers.bend?.length ? `<g id="bend">${layers.bend.map(([a, b]) => `<line x1="${a[0].toFixed(3)}" y1="${(-a[1]).toFixed(3)}" x2="${b[0].toFixed(3)}" y2="${(-b[1]).toFixed(3)}" stroke="#c80" stroke-width="0.15" stroke-dasharray="2 1"/>`).join('')}</g>` : ''}
${layers.engrave.length ? `<g id="engrave"><path d="${path(layers.engrave)}" fill="none" stroke="#0a0" stroke-width="0.1"/></g>` : ''}
</svg>\n`
}

/** A one-page drawing of a spoke hub for a machine shop: plan view, side view and the numbers. */
export function spokeDrawingSVG(hub, p, matName) {
  const s = hub.spoke
  const R = p.hubD / 2
  const W = 420, H = 297 // A3-ish landscape, in mm
  const cx = 110, cy = 140, sc = Math.min(1.6, 150 / p.hubD)
  const path = hub.layers.cut.map((P) => 'M' + P.map(([x, y]) => `${(cx + x * sc).toFixed(2)},${(cy - y * sc).toFixed(2)}`).join('L') + 'Z').join('')
  const lines = []
  const ang = (i) => (TAU * i) / s.n + ((p.rotate + p.twist) * Math.PI) / 180
  for (let i = 0; i < s.n; i++) {
    const a = ang(i), r0 = R - p.depth
    lines.push(`<line x1="${cx + r0 * sc * Math.cos(a)}" y1="${cy - r0 * sc * Math.sin(a)}" x2="${cx + R * sc * Math.cos(a)}" y2="${cy - R * sc * Math.sin(a)}" stroke="#06c" stroke-width="${(s.socketD * sc).toFixed(2)}" stroke-opacity="0.35"/>`)
  }
  const dots = hub.layers.drill.map((h) => `<circle cx="${cx + h.x * sc}" cy="${cy - h.y * sc}" r="${h.r * sc}" fill="none" stroke="#c00" stroke-width="0.4"/>`).join('')
  const txt = (x, y, t, size = 4.2, weight = 400) => `<text x="${x}" y="${y}" font-family="Helvetica,Arial,sans-serif" font-size="${size}" font-weight="${weight}">${t}</text>`
  const notes = [
    `Material: ${matName}. Thickness ${p.hubT} mm. Overall Ø${p.hubD} mm (${s.shape} outline).`,
    `Centre bore Ø${s.boreD.toFixed(2)} mm through (pole Ø${p.poleOD}), H7-ish slide fit.`,
    `${s.n} radial sockets Ø${s.socketD.toFixed(2)} × ${p.depth} mm deep, on the mid-plane (${(p.hubT / 2).toFixed(1)} mm from each face), equally spaced.`,
    `${s.n} × ${p.grub} tapped holes (tap drill Ø${s.tap}) from the top face into each socket, ${(p.depth * 0.45).toFixed(1)} mm in from the edge.`,
    s.grip?.startsWith('inside') ? `Centre: Ø6.6 through for an M6 bolt, Ø11.2 × 6 counterbore on top; expanding spigot underneath (see the STL) slides into the pole.` : s.grip?.startsWith('split') ? `Pole clamp: a 1.6 mm slit from the bore to the edge between two spokes, and one ${p.grub} pinch bolt across it (tapped one side).` : `2 × ${p.grub} tapped holes, radial, on the mid-plane, between spokes, into the bore (pole clamp).`,
    'Break all edges 0.5 mm. Deburr sockets. Anodise or bead-blast optional.',
    'Takes 8 mm-rod fire spokes, like the common 2" dragon fire spoke; measure the rod.',
  ]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#fff"/>
${txt(14, 18, 'Dragon staff spoke hub', 8, 700)}${txt(14, 26, 'Dragon Hub Forge · all sizes in mm · scale 1:' + (1 / sc).toFixed(2) + ' (use the STEP/STL/DXF for true size)', 4)}
<path d="${path}" fill="#eef1f5" stroke="#000" stroke-width="0.5" fill-rule="evenodd"/>
${lines.join('')}
<circle cx="${cx}" cy="${cy}" r="${(s.boreD / 2) * sc}" fill="#fff" stroke="#000" stroke-width="0.5"/>
${dots}
${txt(cx - 20, cy + R * sc + 14, 'Plan view (top face)', 4.5, 700)}
<g transform="translate(250,70)">
  <rect x="0" y="0" width="${p.hubD * sc * 0.8}" height="${p.hubT * sc * 0.8}" fill="#eef1f5" stroke="#000" stroke-width="0.5"/>
  <rect x="0" y="${(p.hubT / 2 - s.socketD / 2) * sc * 0.8}" width="${p.depth * sc * 0.8}" height="${s.socketD * sc * 0.8}" fill="#cfe0f5" stroke="#06c" stroke-width="0.4"/>
  ${txt(0, -4, 'Side section through one socket', 4.5, 700)}
</g>
${notes.map((n, i) => txt(250, 150 + i * 9, '• ' + n, 3.6)).join('')}
</svg>\n`
}
