/**
 * Bubble poi heads, the classic way: a column of small circles stacked one on the
 * next, then one big circle at the bottom. An eye at the top takes the leash
 * swivel, and a small eye at the bottom takes a little swivel so heads, weights or
 * tails link on underneath. Dip it and spin: the small loops make clouds of small
 * bubbles and the big one makes the giants.
 *
 *   no string  printed loops with film notches round the inside that hold the mix
 *   string     loops to wrap with cotton yarn (yarn holds far more mix: the giant-
 *              bubble trick); tie the yarn off round the wire
 *
 * One flat piece, printed lying on the bed, so nothing needs supports. Each loop
 * overlaps the next so the joints are solid. Units mm; the column runs along y
 * (top eye at +y), z is the print height.
 */
export const BUBBLE_POI_PARAMS = [
  { key: 'film', label: 'Film', options: ['no string: printed loops', 'string: wrap with cotton yarn'], value: 'no string: printed loops', hint: 'No string: the notches inside each loop hold the mix; dip and spin. String: wrap each loop with 100% cotton yarn (not acrylic): it soaks up far more mix, so you get many more and bigger bubbles per dip.' },
  { key: 'smallN', label: 'Small circles', unit: '', min: 1, max: 12, step: 1, value: 6, hint: 'How many small circles hang in the chain above the big one.' },
  { key: 'smallD', label: 'Small circle size', unit: 'mm', min: 12, max: 60, step: 1, value: 24, hint: 'Inside diameter of each small circle.' },
  { key: 'bigD', label: 'Big circle size', unit: 'mm', min: 30, max: 180, step: 1, value: 70, hint: 'Inside diameter of the big circle at the bottom: the one that makes the giant bubbles.' },
  { key: 'cross', label: 'Big circle', options: ['crossed by a second ring', 'single ring'], value: 'crossed by a second ring', hint: 'A second ring slots through the big one at right angles (a half-depth slot in each, top and bottom), so it makes bubbles whichever way it swings.' },
  { key: 'loopT', label: 'Loop wire', unit: 'mm', min: 2, max: 7, step: 0.1, value: 3.4, hint: 'How wide each ring is. String loops want 3.5 mm or more so the yarn has something to wrap.' },
  { key: 'thick', label: 'Thickness', unit: 'mm', min: 2.5, max: 8, step: 0.1, value: 4, hint: 'How thick each ring prints (lying flat).' },
  { key: 'linkD', label: 'Link eyes', unit: 'mm', min: 3, max: 8, step: 0.5, value: 4.5, hint: 'The small eye at the top and bottom of every circle: it takes a small swivel or a split ring to link the circles into a chain.' },
  { key: 'ropeD', label: 'Top eye (leash)', unit: 'mm', min: 3, max: 10, step: 0.5, value: 6, hint: 'The eye at the very top, for the leash swivel.' },
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
    const T = yarn ? Math.max(p.loopT, 3.5) : p.loopT
    const H = p.thick
    const crossed = (p.cross || '').startsWith('crossed')
    // one flat ring (xy, centred), with an eye tab on top (+y) and one underneath (-y)
    const ringSec = (ri, topHole, botHole, notch) => {
      let sec = k(k(CrossSection.circle(ri + T, 128)).subtract(k(CrossSection.circle(ri, 128))))
      const eyes = []
      for (const [hole, s] of [[topHole, 1], [botHole, -1]]) {
        if (!hole) continue
        const ro = hole / 2 + 2.2, yc = s * (ri + T + hole / 2 + 1.4)
        const stem = k(k(CrossSection.square([2 * ro, Math.abs(yc) - ri - T / 2], false)).translate([-ro, s > 0 ? ri + T / 2 : yc]))
        eyes.push({ solid: k(k(k(CrossSection.circle(ro, 40)).translate([0, yc])).add(stem)), hole: k(k(CrossSection.circle(hole / 2, 32)).translate([0, yc])) })
      }
      if (eyes.length) sec = k(sec.add(k(CrossSection.union(eyes.map((e) => e.solid)))))
      sec = k(sec.subtract(k(CrossSection.circle(ri, 128))))
      if (eyes.length) sec = k(sec.subtract(k(CrossSection.union(eyes.map((e) => e.hole)))))
      if (!yarn) {
        const n = Math.max(8, Math.round((Math.PI * 2 * ri) / 5.5)), nn = []
        for (let j2 = 0; j2 < n; j2++) { const a = (2 * Math.PI * (j2 + 0.5)) / n; nn.push(k(k(CrossSection.circle(0.9, 12)).translate([ri * Math.cos(a), ri * Math.sin(a)]))) }
        sec = k(sec.subtract(k(CrossSection.union(nn))))
      }
      if (notch) {
        // half-depth slots at the top and bottom where the crossing ring passes: from the inside edge (A) or the outside edge (B)
        const w = H + 0.3, cuts = []
        for (const s of [1, -1]) {
          const y0 = notch === 'in' ? s * (ri - 1) : s * (ri + T / 2 - 0.1), y1 = notch === 'in' ? s * (ri + T / 2 + 0.1) : s * (ri + T + 1)
          cuts.push(k(k(CrossSection.square([w, Math.abs(y1 - y0)], false)).translate([-w / 2, Math.min(y0, y1)])))
        }
        sec = k(sec.subtract(k(CrossSection.union(cuts))))
      }
      return sec
    }
    const smallR = p.smallD / 2, bigR = p.bigD / 2
    const pieces = [] // [label, manifold]
    const small = k(ringSec(smallR, p.linkD, p.linkD, null).extrude(H))
    const topRing = k(ringSec(smallR, p.ropeD, p.linkD, null).extrude(H))
    const bigA = k(ringSec(bigR, p.linkD, p.linkD, crossed ? 'in' : null).extrude(H))
    const bigB = crossed ? k(ringSec(bigR, 0, 0, 'out').extrude(H)) : null
    // ---- the chain, assembled for the view: rings in a column, small swivels between them
    const gap = p.linkD + 7 // a small swivel or split ring between the eyes
    const views = [], hw = []
    let y = 0
    const place = (m, ri, top, bot) => {
      const h = ri + T + (top ? top + 1.4 + 2.2 : 0)
      y -= h
      const moved = k(m.translate([0, y, -H / 2]))
      y -= ri + T + (bot ? bot + 1.4 + 2.2 : 0)
      return moved
    }
    const ring3 = (yc) => hw.push(k(k(k(k(k(CrossSection.circle(0.9, 10)).translate([gap / 2 - 1, 0])).revolve(24)).rotate([0, 90, 0])).translate([0, yc, 0])))
    for (let i = 0; i < p.smallN; i++) {
      views.push(place(i === 0 ? topRing : small, smallR, i === 0 ? p.ropeD : p.linkD, p.linkD))
      ring3(y - gap / 2 + 2.5); y -= gap - 5
    }
    const aView = place(bigA, bigR, p.linkD, p.linkD)
    if (crossed) {
      // the big pair turned 25° about the hanging line so both rings show from the front as a cross
      const yc = aView.boundingBox().min[1] + p.linkD + 3.6 + bigR + T
      const bView = k(k(k(bigB.translate([0, 0, -H / 2])).rotate([0, 90, 0])).translate([0, yc, 0]))
      const turn = (m) => k(k(k(m.translate([0, -yc, 0])).rotate([0, 25, 0])).translate([0, yc, 0]))
      views.push(turn(aView), turn(bView))
    } else views.push(aView)
    const assembled = k(Manifold.union(views))
    const bb = assembled.boundingBox(), cy = (bb.max[1] + bb.min[1]) / 2
    // ---- print plate: every piece flat, side by side
    const flats = [['top', topRing], ...(p.smallN > 1 ? [['small', small]] : []), ['bigA', bigA], ...(crossed ? [['bigB', bigB]] : [])]
    const meshes = { combined: meshData(k(assembled.translate([0, -cy, 0]))) }
    if (hw.length) meshes.rods = meshData(k(k(Manifold.union(hw)).translate([0, -cy, 0])))
    for (const [key, m] of flats) meshes[`flat_${key}`] = meshData(m)
    const dens = opts.density || 1.27
    const gOf = (m) => (m.volume() / 1000) * dens
    const g = gOf(topRing) + (p.smallN - 1) * gOf(small) + gOf(bigA) + (crossed ? gOf(bigB) : 0)
    const len = bb.max[1] - bb.min[1], wid = bb.max[0] - bb.min[0]
    if (!yarn && p.bigD > 90) warns.push('A printed loop over about 90 mm struggles to hold a film: use string for a giant big circle.')
    if (2 * (bigR + T) + 2 * (p.linkD + 4) > 250) warns.push('The big ring is bigger than most beds: lay it corner to corner, or make it smaller.')
    const rings = [smallR, bigR, ...(crossed ? [bigR] : [])]
    const yarnM = yarn ? (p.smallN * ((2 * Math.PI * (smallR + T / 2)) / 3) * (2 * T + 2 * H) + rings.slice(1).reduce((a, r) => a + ((2 * Math.PI * (r + T / 2)) / 3) * (2 * T + 2 * H), 0)) / 1000 : 0
    const outline = k(CrossSection.circle(bigR + T, 64))
    return {
      bubblePoi: { yarn, small: p.smallN, loops: p.smallN + 1 + (crossed ? 1 : 0), len, wid, height: H, yarnM, crossed, swivels: p.smallN, pieces: flats.map(([k2]) => k2) },
      meshes,
      viewR: Math.max(len, wid) * 0.6,
      polygons: { base: outline.toPolygons(), relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: g, gramsTotal: g, warns, height: H },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function bubblePoiDesigns() {
  const d = (id, name, blurb, over) => ({
    id, name, group: 'BubblePoi', blurb, bubblePoi: true, added: '2026-11-22',
    params: BUBBLE_POI_PARAMS.map((x) => ({ ...x, ...(over[x.key] !== undefined ? { value: over[x.key] } : {}) })),
    draw: () => {},
  })
  return [
    d('bubblePoiClassic', 'Bubble Poi: Classic', 'The classic bubble poi: six small circles linked in a chain by little swivels, and a big circle at the bottom crossed by a second ring. Every circle prints flat on its own, with an eye top and bottom; the leash clips to the top one.', {}),
    d('bubblePoiMini', 'Bubble Poi: Mini', 'A smaller, lighter classic: six little circles and a palm-sized big one. Quick to spin, good for kids and for doubles.', { smallD: 18, bigD: 50, loopT: 2.8, thick: 3.5, linkD: 4 }),
    d('bubblePoiGiant', 'Bubble Poi: Giant', 'Five circles and a huge one at the bottom, made to be wrapped in cotton yarn: it holds enough mix for giant bubbles and long trails.', { smallN: 5, smallD: 30, bigD: 120, loopT: 4.5, thick: 5, film: 'string: wrap with cotton yarn', linkD: 5 }),
    d('bubblePoiLadder', 'Bubble Poi: Long Ladder', 'Nine small circles linked into a long ladder over a big one: a long ribbon of small bubbles behind every swing.', { smallN: 9, smallD: 17, bigD: 52, loopT: 2.8, cross: 'single ring' }),
  ]
}
