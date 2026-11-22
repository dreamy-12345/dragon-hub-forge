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
  { key: 'smallN', label: 'Small circles', unit: '', min: 1, max: 12, step: 1, value: 6, hint: 'How many small circles are stacked above the big one.' },
  { key: 'smallD', label: 'Small circle size', unit: 'mm', min: 12, max: 60, step: 1, value: 22, hint: 'Inside diameter of each small circle.' },
  { key: 'bigD', label: 'Big circle size', unit: 'mm', min: 30, max: 180, step: 1, value: 64, hint: 'Inside diameter of the big circle at the bottom: the one that makes the giant bubbles.' },
  { key: 'loopT', label: 'Loop wire', unit: 'mm', min: 2, max: 7, step: 0.1, value: 3.2, hint: 'How wide each ring is. String loops want 3.5 mm or more so the yarn has something to wrap.' },
  { key: 'thick', label: 'Thickness', unit: 'mm', min: 2.5, max: 8, step: 0.1, value: 4, hint: 'How thick it prints (lying flat). Thicker is stiffer and holds a little more mix.' },
  { key: 'join', label: 'Joints', unit: 'mm', min: 0.8, max: 6, step: 0.1, value: 2.2, hint: 'How much each circle overlaps the next. More = stronger joints.' },
  { key: 'ropeD', label: 'Top eye (leash)', unit: 'mm', min: 3, max: 10, step: 0.5, value: 6, hint: 'The hole at the top for the leash swivel or cord.' },
  { key: 'linkD', label: 'Bottom eye (link)', unit: 'mm', min: 0, max: 10, step: 0.5, value: 5, hint: 'A small eye under the big circle: clip on a small swivel to link another head, a weight or a tail below. 0 = none.' },
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
    // the rings, top to bottom: small ones, then the big one
    const rings = []
    for (let i = 0; i < p.smallN; i++) rings.push(p.smallD / 2)
    rings.push(p.bigD / 2)
    const centres = []
    let y = 0
    for (let i = 0; i < rings.length; i++) {
      if (i) y -= rings[i - 1] + T + rings[i] + T - p.join
      centres.push(y)
    }
    const ring2d = (ri, yc) => {
      let r = k(k(k(CrossSection.circle(ri + T, 96)).subtract(k(CrossSection.circle(ri, 96)))).translate([0, yc]))
      return r
    }
    let sec = k(CrossSection.union(rings.map((ri, i) => ring2d(ri, centres[i]))))
    // the eyes: a tab above the top circle and one below the big circle
    const eye = (hole, yc, up) => {
      const ro = hole / 2 + 2.4
      const stem = k(k(CrossSection.square([2 * ro, ro + T], true)).translate([0, yc - (up ? (ro + T) / 2 : -(ro + T) / 2)]))
      return { solid: k(k(k(CrossSection.circle(ro, 48)).translate([0, yc])).add(stem)), hole: k(k(CrossSection.circle(hole / 2, 32)).translate([0, yc])) }
    }
    const topR = rings[0] + T, botR = rings[rings.length - 1] + T
    const topEye = eye(p.ropeD, centres[0] + topR + p.ropeD / 2 + 1.6, true)
    const parts = [topEye]
    if (p.linkD > 0) parts.push(eye(p.linkD, centres[centres.length - 1] - botR - p.linkD / 2 - 1.6, false))
    sec = k(sec.add(k(CrossSection.union(parts.map((e) => e.solid)))))
    // but never fill a loop: keep each opening clear
    for (let i = 0; i < rings.length; i++) sec = k(sec.subtract(k(k(CrossSection.circle(rings[i], 96)).translate([0, centres[i]]))))
    sec = k(sec.subtract(k(CrossSection.union(parts.map((e) => e.hole)))))
    if (!yarn) {
      // film notches round the inside of every loop hold the mix
      const notches = []
      rings.forEach((ri, i) => {
        const n = Math.max(8, Math.round((Math.PI * 2 * ri) / 5.5))
        for (let j = 0; j < n; j++) { const a = (2 * Math.PI * (j + 0.5)) / n; notches.push(k(k(CrossSection.circle(0.9, 12)).translate([ri * Math.cos(a), centres[i] + ri * Math.sin(a)]))) }
      })
      sec = k(sec.subtract(k(CrossSection.union(notches))))
    }
    let m = k(sec.extrude(H))
    const dens = opts.density || 1.27
    const g = (m.volume() / 1000) * dens
    const box = m.boundingBox()
    const len = box.max[1] - box.min[1], wid = box.max[0] - box.min[0]
    if (len > 250) warns.push(`It is ${len.toFixed(0)} mm long: lay it corner to corner on the bed, or use fewer or smaller circles.`)
    if (!yarn && p.bigD > 90) warns.push('A printed loop over about 90 mm struggles to hold a film: use string for a giant big circle.')
    if (p.join < T * 0.4) warns.push('The joints are thin: raise Joints so each circle overlaps the next more.')
    // centre it for the view and the bed
    const cy = (box.max[1] + box.min[1]) / 2
    const flat = k(m.translate([0, -cy, 0]))
    const meshes = { combined: meshData(flat) }
    const outline = k(sec.translate([0, -cy])).toPolygons()
    const yarnM = yarn ? rings.reduce((a, ri) => a + ((2 * Math.PI * (ri + T / 2)) / 3) * (2 * T + 2 * H), 0) / 1000 : 0
    return {
      bubblePoi: { yarn, small: p.smallN, loops: rings.length, len, wid, height: H, yarnM, link: p.linkD > 0 },
      meshes,
      viewR: Math.max(len, wid) * 0.6,
      polygons: { base: outline, relief: [], pods: [], weak: [] },
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
    d('bubblePoiClassic', 'Bubble Poi: Classic', 'The classic bubble poi: six small circles stacked in a column and one big circle at the bottom. An eye on top for the leash swivel, and a small eye underneath to link another head or a weight on a little swivel. Prints flat, no supports.', {}),
    d('bubblePoiMini', 'Bubble Poi: Mini', 'A smaller, lighter classic: six little circles and a palm-sized big one. Quick to spin, good for kids and for doubles.', { smallD: 18, bigD: 50, loopT: 2.8, thick: 3.5 }),
    d('bubblePoiGiant', 'Bubble Poi: Giant', 'Five circles and a huge one at the bottom, made to be wrapped in cotton yarn: it holds enough mix for giant bubbles and long trails.', { smallN: 5, smallD: 30, bigD: 120, loopT: 4.5, thick: 5, film: 'string: wrap with cotton yarn' }),
    d('bubblePoiLadder', 'Bubble Poi: Long Ladder', 'Nine small circles stacked into a long ladder over a big one: a long ribbon of small bubbles behind every swing.', { smallN: 9, smallD: 17, bigD: 52, loopT: 2.8 }),
  ]
}
