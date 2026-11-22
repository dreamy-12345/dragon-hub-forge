/**
 * Meteor cages: oversized fire balls for meteors, rope darts and poi, like the
 * big ringed meteorites: a sphere of metal bands cut from flat plate and wrapped
 * in Kevlar. Seven flat parts:
 *   equator   one full ring, notched from the outside where the hoops cross it
 *   hoops     four half-rings (pole to pole), notched from the inside at the
 *             equator, with a tab at each end
 *   poles     a top and a bottom plate with four slots for the tabs; the top one
 *             has the eye for the shackle and swivel, the bottom one a hole to
 *             chain on a tail or another head
 * Joins: tabs through the slots twisted a quarter turn (no welding), or welded or
 * brazed, or lashed with stainless wire through the small holes by each joint.
 * Units mm; the ball is centred on the origin, z up (the chain at the top).
 */
import { TAU } from './geom.js'

const KEVLAR = 1.44 * 0.6, WET = 1.3, TAPE_T = 2.5

export const CAGE_PARAMS = [
  { key: 'ballD', label: 'Ball size', unit: 'mm', min: 80, max: 400, step: 5, value: 200, hint: 'Across the outside of the bands.' },
  { key: 'band', label: 'Band width', unit: 'mm', min: 8, max: 30, step: 0.5, value: 16, hint: 'How wide each ring is. Kevlar tape wraps round it: 50 mm tape suits a 15–20 mm band.' },
  { key: 'join', label: 'Join with', options: ['tabs twisted through the slots (no welding)', 'weld or braze the joints', 'stainless wire lashing'], value: 'tabs twisted through the slots (no welding)', hint: 'Twist: each hoop end has a tab that goes through a slot in the pole plate and is twisted a quarter turn with pliers. Weld: tack every joint. Lashing: tie each crossing with stainless wire through the small holes.' },
  { key: 'wickW', label: 'Kevlar tape', unit: 'mm', min: 25, max: 75, step: 1, value: 50, presets: [25, 38, 50] },
  { key: 'eyeD', label: 'Top eye', unit: 'mm', min: 6, max: 16, step: 0.5, value: 10, hint: 'The hole in the top plate for the shackle that takes the swivel and chain.' },
]

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

export function buildCage(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const warns = []
    const mat = opts.mat || { name: 'Stainless steel 304', density: 7.93, kind: 'metal' }
    const T = opts.thick || 3
    const R = p.ballD / 2, bw = p.band, s = T + 0.3 // slot width
    const tw = Math.min(8, bw * 0.5), tabL = T + 6 // tabs
    const rs0 = p.eyeD / 2 + 4 // the tabs (and the plate slots) start this far out, clear of the eye in the middle
    const wire = (p.join || '').startsWith('stainless')
    const hole = (x, y, r) => k(k(CrossSection.circle(r, 20)).translate([x, y]))
    const rect = (x0, y0, x1, y1) => k(k(CrossSection.square([x1 - x0, y1 - y0], false)).translate([x0, y0]))
    // ---- equator: full ring, notched from the outside at 0, 90, 180, 270
    let eq = k(k(CrossSection.circle(R, 192)).subtract(k(CrossSection.circle(R - bw, 192))))
    const notches = [], wholes = []
    for (let i = 0; i < 4; i++) {
      const a = (90 * i)
      notches.push(k(rect(R - bw / 2, -s / 2, R + 1, s / 2).rotate(a)))
      if (wire) for (const sg of [-1, 1]) wholes.push(k(hole(R - bw / 2, sg * (s / 2 + 3.5), 1.3).rotate(a)))
    }
    eq = k(eq.subtract(k(CrossSection.union([...notches, ...wholes]))))
    // ---- half hoop: a semicircle (u >= 0) from pole to pole, notched from the inside at the equator, tabs at the ends
    let half = k(k(k(CrossSection.circle(R, 192)).subtract(k(CrossSection.circle(R - bw, 192)))).intersect(rect(0, -R - 1, R + 1, R + 1)))
    half = k(half.subtract(rect(R - bw - 1, -s / 2, R - bw / 2, s / 2)))
    // tabs: at each end, standing up (and down) past the band, through the pole plate's slot
    half = k(half.add(k(CrossSection.union([rect(rs0, R - bw / 2, rs0 + tw, R + tabL), rect(rs0, -R - tabL, rs0 + tw, -R + bw / 2)]))))
    if (wire) half = k(half.subtract(k(CrossSection.union([hole(R - bw / 2, s / 2 + 3.5, 1.3), hole(R - bw / 2, -s / 2 - 3.5, 1.3)]))))
    // ---- pole plates: discs with four slots for the tabs, the eye in the middle
    const plateR = rs0 + tw + 7
    const pole = (eye) => {
      let d = k(CrossSection.circle(plateR, 64))
      const sl = []
      for (let i = 0; i < 4; i++) sl.push(k(rect(rs0 - 0.15, -s / 2, rs0 + tw + 0.15, s / 2).rotate(90 * i)))
      return k(d.subtract(k(CrossSection.union([...sl, hole(0, 0, eye / 2)]))))
    }
    const topP = pole(p.eyeD), botP = pole(8)
    // ---- 3D: assemble for the view
    const ex = (cs) => k(k(cs.extrude(T)).translate([0, 0, -T / 2]))
    const parts3 = []
    parts3.push(ex(eq))
    const half3 = k(ex(half).rotate([90, 0, 0])) // its plane: x (outward) and z (up)
    for (let i = 0; i < 4; i++) parts3.push(k(half3.rotate([0, 0, 90 * i + 45])))
    const top3 = k(k(ex(topP).rotate([0, 0, 45])).translate([0, 0, R + T / 2 + 0.3]))
    const bot3 = k(k(ex(botP).rotate([0, 0, 45])).translate([0, 0, -R - T / 2 - 0.3]))
    parts3.push(top3, bot3)
    const cage = k(Manifold.union(parts3))
    const g = (cage.volume() / 1000) * mat.density
    // Kevlar: wound round every band
    const kv = []
    const bandR = R - bw / 2
    const torusBand = (rot) => k(k(k(k(CrossSection.square([bw + 2 * TAPE_T, T + 2 * TAPE_T], true)).translate([bandR, 0])).revolve(96)).rotate(rot))
    kv.push(torusBand([0, 0, 0]), torusBand([90, 0, 45]), torusBand([90, 0, 135]))
    const caps = k(Manifold.union([k(k(Manifold.cylinder(R * 0.5, plateR + 4, plateR + 4, 32)).translate([0, 0, R * 0.8])), k(k(Manifold.cylinder(R * 0.5, plateR + 4, plateR + 4, 32)).translate([0, 0, -R * 1.3]))]))
    const kev = k(k(Manifold.union(kv)).subtract(caps)) // the tape stops short of the pole plates
    const bandsLen = TAU * bandR * 3
    const tapeM = (bandsLen * (bw + T + 2 * TAPE_T) * 2) / (p.wickW * 0.5) / 1000 // spiralled round the band's section, each turn half over the last
    const kevG = ((tapeM * 1000 * p.wickW * TAPE_T) / 1000) * KEVLAR * WET
    // ---- flat parts for the cutter: nest them in a row
    const flat = [['equator ring', eq, 1], ['half hoop', half, 4], ['top plate (eye)', topP, 1], ['bottom plate', botP, 1]]
    const layers = { cut: [], holes: [], drill: [], pocket: [], pocketDepth: 0, engrave: [] }
    let xo = 0
    for (const [, cs, n] of flat) for (let i = 0; i < n; i++) {
      const b = cs.bounds()
      const moved = k(cs.translate([xo - b.min[0], -b.min[1]]))
      layers.cut.push(...moved.toPolygons())
      xo += b.max[0] - b.min[0] + 8
    }
    if (bw > R * 0.35) warns.push('The bands are very wide for this ball: narrow them or make the ball bigger.')
    if (T > 3 && mat.density > 7) warns.push('Steel over 3 mm makes a very heavy head: 2–3 mm stainless is plenty.')
    const meshes = { combined: meshData(cage), kevlar: meshData(kev) }
    const circle = []
    for (let i = 0; i < 64; i++) circle.push([R * Math.cos((TAU * i) / 64), R * Math.sin((TAU * i) / 64)])
    return {
      cageBall: { R, bw, T, g, kevG, tapeM, total: g + kevG, join: p.join, parts: flat.map(([name, , n]) => `${n} × ${name}`), mat: mat.name, sheet: [xo, 2 * R + 2 * tabL] },
      meshes,
      viewR: R * 1.4,
      polygons: { base: [circle], relief: [], pods: [], weak: [] },
      layers,
      podH: 0, ring: null, snap: null, cnc: true,
      stats: { tris: meshes.combined.indices.length / 3, grams: g, gramsTotal: g + kevG, warns, height: 2 * R },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function cageDesigns() {
  const d = (id, name, group, blurb, over) => ({
    id, name, group, blurb, cageBall: true, cncOnly: true, cnc: { material: 'ss304', thick: 2 }, added: '2026-11-22',
    params: CAGE_PARAMS.map((x) => ({ ...x, ...(over[x.key] !== undefined ? { value: over[x.key] } : {}) })),
    draw: () => {},
  })
  return [
    d('cageMeteor', 'Big Meteor Cage', 'MeteorCages', 'A big ringed meteorite: a ball of crossed metal bands cut from flat stainless, slotted together, and wound in Kevlar so the whole sphere burns. Make two for a meteor; a shackle and swivel on the top eye.', { ballD: 240, band: 18 }),
    d('cagePoi', 'Ringed Fire Poi', 'CagePoi', 'An oversized ringed fire poi head: crossed bands wound in Kevlar, a big ball of fire on a chain.', { ballD: 150, band: 14 }),
    d('cageDart', 'Ringed Rope Dart', 'MeteorCages', 'A ringed fire rope dart head: a smaller cage of crossed bands wound in Kevlar, on a swivel at the top eye.', { ballD: 110, band: 12 }),
  ]
}
