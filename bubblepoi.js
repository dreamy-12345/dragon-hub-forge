/**
 * Bubble poi heads: dip them in bubble mix and spin, and they trail bubbles.
 * A weighted central stem with the leash eye on top, and bubble loops standing
 * round it like fins (each loop's plane holds the stem's axis), so whichever way
 * the poi travels, air goes through some of them.
 *
 *   no string  printed loops with film notches round the inside that hold the mix
 *   string     smooth, round-edged loops to wrap with cotton yarn (yarn holds far
 *              more mix: the giant-bubble trick), with tie-off holes at the stem
 *
 * Prints standing on its flat bottom: the first loops stand on the bed and any
 * second row stands on the first, so nothing needs supports. Units mm, z up
 * (the leash direction).
 */
const SHOT = 4.6

export const BUBBLE_POI_PARAMS = [
  { key: 'film', label: 'Film', options: ['no string: printed loops', 'string: wrap with cotton yarn'], value: 'no string: printed loops', hint: 'No string: the notches inside each loop hold the mix; dip and spin. String: wrap each loop with 100% cotton yarn (not acrylic): it soaks up far more mix, so you get many more and bigger bubbles per dip.' },
  { key: 'fins', label: 'Loops round', unit: '', min: 2, max: 8, step: 1, value: 4 },
  { key: 'tiers', label: 'Rows', unit: '', min: 1, max: 3, step: 1, value: 1, hint: 'Rows of loops stacked up the stem.' },
  { key: 'loopD', label: 'Loop size', unit: 'mm', min: 20, max: 110, step: 1, value: 50, hint: 'Inside diameter. Bigger loops, bigger bubbles, more mix per dip.' },
  { key: 'loopT', label: 'Loop wire', unit: 'mm', min: 2, max: 6, step: 0.1, value: 3, hint: 'String loops want 3.5 mm or more so the yarn has something to wrap.' },
  { key: 'weight', label: 'Weight', options: ['steel shot in the stem', 'as printed'], value: 'steel shot in the stem', hint: 'Poi spin better with weight: pause the print where it says and fill the stem chamber with steel shot.' },
  { key: 'ropeD', label: 'Leash cord', unit: 'mm', min: 2, max: 8, step: 0.5, value: 5, hint: 'The eye on top fits this cord, or a swivel clip.' },
]

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

export function buildBubblePoi(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const warns = []
    const yarn = (p.film || '').startsWith('string')
    const ri = p.loopD / 2, T = yarn ? Math.max(p.loopT, 3.5) : p.loopT, ro = ri + T
    const sR = 11 // the stem
    const nT = Math.max(1, p.tiers), H = nT * 2 * ro - (nT - 1) + 6 // stem height
    const thick = yarn ? T : Math.max(2.4, T * 0.9) // loop thickness across its plane
    // one loop, in its own plane (x, z), centred on x = 0
    let loop2d = k(k(CrossSection.circle(ro, 96)).subtract(k(CrossSection.circle(ri, 96))))
    if (!yarn) {
      // film notches round the inside hold the mix
      const n = Math.max(10, Math.round((Math.PI * 2 * ri) / 6)), notch = []
      for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n; notch.push(k(k(CrossSection.circle(1.1, 12)).translate([ri * Math.cos(a), ri * Math.sin(a)]))) }
      loop2d = k(loop2d.subtract(k(CrossSection.union(notch))))
    }
    // printed: a flat ring with notches. String: a round-section ring (smooth all round, so yarn wraps snug)
    const loop = yarn
      ? k(k(k(k(CrossSection.circle(T / 2, 24)).translate([ri + T / 2, 0])).revolve(96)).rotate([90, 0, 0]))
      : k(k(k(loop2d.extrude(thick)).translate([0, 0, -thick / 2])).rotate([90, 0, 0]))
    const parts = []
    const rc = sR + ro - 1.2 // fused 1.2 mm into the stem
    for (let t = 0; t < nT; t++) {
      const zc = ro + t * (2 * ro - 1)
      for (let i = 0; i < p.fins; i++) {
        let l = k(loop.translate([rc, 0, zc]))
        if (yarn) {
          const holes = [-1, 1].map((s) => k(k(k(Manifold.cylinder(thick + 2, 1.1, 1.1, 12)).rotate([90, 0, 0])).translate([sR + 1.5, thick / 2 + 1, zc + s * (ri + T / 2)])))
          l = k(l.subtract(k(Manifold.union(holes))))
        }
        parts.push(k(l.rotate([0, 0, (360 * i) / p.fins])))
      }
    }
    // the stem: flat bottom with a chamfer, round top, the leash eye standing on it
    let stem = k(Manifold.union([
      k(Manifold.cylinder(1.2, sR - 1.2, sR, 64)),
      k(k(Manifold.cylinder(H - 1.2, sR, sR, 64)).translate([0, 0, 1.2])),
      k(k(Manifold.sphere(sR, 64)).translate([0, 0, H])).intersect(k(k(Manifold.cylinder(sR, sR, sR, 64)).translate([0, 0, H]))),
    ]))
    const eyeR = p.ropeD / 2 + 0.8, eyeW = 2.6
    const eye = k(k(k(k(k(CrossSection.circle(eyeR + eyeW, 48)).subtract(k(CrossSection.circle(eyeR, 48)))).extrude(5)).translate([0, 0, -2.5])).rotate([90, 0, 0]))
    stem = k(stem.add(k(eye.translate([0, 0, H + sR * 0.7 + eyeR]))))
    // a sealed chamber for steel shot, with a 45° roof so it prints closed
    const shot = (p.weight || '').startsWith('steel')
    let pauseAt = 0, gShot = 0
    let m = k(Manifold.union([stem, ...parts]))
    if (shot) {
      const cr = sR - 2.4, z0 = 3, z1 = H - 2
      const ch = k(Manifold.union([k(k(Manifold.cylinder(z1 - z0, cr, cr, 48)).translate([0, 0, z0])), k(k(Manifold.cylinder(cr, cr, 0.5, 48)).translate([0, 0, z1]))]))
      m = k(m.subtract(ch))
      pauseAt = z1 - 0.3
      gShot = ((Math.PI * cr * cr * (z1 - z0)) / 1000) * SHOT
    }
    const dens = opts.density || 1.27
    const g = (m.volume() / 1000) * dens
    const box = m.boundingBox()
    const span = box.max[0] - box.min[0]
    if (span > 250) warns.push(`It is ${span.toFixed(0)} mm across: check it fits your printer bed, or use smaller or fewer loops.`)
    if (!yarn && p.loopD > 70) warns.push('Big printed loops struggle to hold a film: over about 70 mm, use string loops.')
    const meshes = { combined: meshData(m) }
    const circle = []
    for (let i = 0; i < 64; i++) circle.push([(span / 2) * Math.cos((2 * Math.PI * i) / 64), (span / 2) * Math.sin((2 * Math.PI * i) / 64)])
    return {
      bubblePoi: { yarn, fins: p.fins, tiers: nT, loops: p.fins * nT, span, height: box.max[2], gShot, pauseAt, yarnM: yarn ? (p.fins * nT * ((2 * Math.PI * (ri + T / 2)) / 3) * Math.PI * (T + 2)) / 1000 : 0 },
      meshes,
      viewR: Math.max(span, box.max[2]) * 0.7,
      polygons: { base: [circle], relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: g, gramsTotal: g + gShot, warns, height: box.max[2] },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function bubblePoiDesigns() {
  const d = (id, name, blurb, over) => ({
    id, name, group: 'BubblePoi', blurb, bubblePoi: true, added: '2026-11-21',
    params: BUBBLE_POI_PARAMS.map((x) => ({ ...x, ...(over[x.key] !== undefined ? { value: over[x.key] } : {}) })),
    draw: () => {},
  })
  return [
    d('bubblePoiFins', 'Bubble Poi: Four Fins', 'A bubble poi head: four loops standing round a weighted stem like fins, so air goes through them whichever way it swings. Dip it and spin. Printed loops, or wrap them with cotton yarn for far more bubbles.', {}),
    d('bubblePoiBloom', 'Bubble Poi: Bloom', 'Six small loops in two rows round the stem, like a flower: a cloud of small bubbles from every direction.', { fins: 6, tiers: 2, loopD: 30 }),
    d('bubblePoiGiant', 'Bubble Poi: Giant Loops', 'Two big loops for giant bubbles: made to be wrapped in cotton yarn, which holds enough mix for long trails.', { fins: 2, loopD: 90, loopT: 4, film: 'string: wrap with cotton yarn' }),
    d('bubblePoiTrio', 'Bubble Poi: Trio', 'Three mid-size loops: the easy all-rounder, light and quick to dip.', { fins: 3, loopD: 45 }),
  ]
}
