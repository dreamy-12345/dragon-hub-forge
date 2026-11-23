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

const START = {
  'Classic: six circles over a big crossed ring': { smallN: 6, smallD: 24, bigD: 70, loopT: 3.4, thick: 4, linkD: 4.5, loops: 'circles', crossSmall: 'single', bigShape: 'circle', cross: 'crossed by a second ring', film: 'no string: printed loops', taper: 'same size' },
  'Mini: small and light, for kids and doubles': { smallN: 6, smallD: 18, bigD: 50, loopT: 2.8, thick: 3.5, linkD: 4, loops: 'circles', crossSmall: 'single', bigShape: 'circle', cross: 'crossed by a second ring', film: 'no string: printed loops', taper: 'same size' },
  'Giant: wrapped in yarn for giant bubbles': { smallN: 5, smallD: 30, bigD: 120, loopT: 4.5, thick: 5, linkD: 5, loops: 'circles', crossSmall: 'single', bigShape: 'circle', cross: 'crossed by a second ring', film: 'string: wrap with cotton yarn', taper: 'same size' },
  'Toadstools: mushroom loops over a crossed ring': { smallN: 6, smallD: 24, bigD: 70, loopT: 3.4, thick: 4, linkD: 4.5, loops: 'mushrooms', crossSmall: 'single', bigShape: 'circle', cross: 'crossed by a second ring', film: 'no string: printed loops', taper: 'same size' },
  'Mushroom cap: a big crossed cap at the bottom': { smallN: 5, smallD: 24, bigD: 80, loopT: 3.4, thick: 4, linkD: 4.5, loops: 'circles', crossSmall: 'single', bigShape: 'mushroom cap', cross: 'crossed by a second ring', film: 'no string: printed loops', taper: 'same size' },
  'Long ladder: nine small loops': { smallN: 9, smallD: 17, bigD: 52, loopT: 2.8, thick: 4, linkD: 4.5, loops: 'circles', crossSmall: 'single', bigShape: 'circle', cross: 'crossed by a second ring', film: 'no string: printed loops', taper: 'same size' },
}
const KINDS = ['circle', 'mushroom', 'crossed circle', 'crossed mushroom']
export const BUBBLE_POI_PARAMS = [
  { key: 'start', label: 'Start from', options: Object.keys(START), value: Object.keys(START)[0], applies: START, hint: 'Loads a starting point: every part below can then be changed.' },
  { key: 'film', label: 'Film', options: ['no string: printed loops', 'string: wrap with cotton yarn'], value: 'no string: printed loops', hint: 'No string: the notches inside each loop hold the mix; dip and spin. String: wrap each loop with 100% cotton yarn (not acrylic): it soaks up far more mix, so you get many more and bigger bubbles per dip.' },
  { key: 'smallN', label: 'Small circles', unit: '', min: 1, max: 12, step: 1, value: 6, rerender: true, hint: 'How many small circles hang in the chain above the big one.' },
  { key: 'smallD', label: 'Small circle size', unit: 'mm', min: 12, max: 60, step: 1, value: 24, hint: 'Inside diameter of each small circle.' },
  { key: 'bigD', label: 'Big circle size', unit: 'mm', min: 30, max: 180, step: 1, value: 70, hint: 'Inside diameter of the big circle at the bottom: the one that makes the giant bubbles.' },
  { key: 'loops', label: 'Small loops', options: ['circles', 'mushrooms', 'circles and mushrooms, alternating', 'choose each loop'], value: 'circles', rerender: true, hint: 'Mushrooms: each small loop is a little toadstool outline, cap and stem. Choose each loop: pick a circle, a mushroom, or either one crossed, for every place down the chain.' },
  ...Array.from({ length: 12 }, (_, i) => ({ key: `pos${i + 1}`, label: `Loop ${i + 1}${i === 0 ? ' (top)' : ''}`, options: KINDS, value: i % 2 ? 'mushroom' : 'circle', showIf: (p) => p.loops === 'choose each loop' && i < p.smallN })),
  { key: 'taper', label: 'Small loop sizes', options: ['same size', 'growing towards the big loop', 'shrinking towards the big loop'], value: 'same size', hint: 'Growing: small at the top, a third bigger at the bottom. Shrinking: the other way round.' },
  { key: 'bigShape', label: 'Big loop', options: ['circle', 'mushroom cap'], value: 'circle', rerender: true, hint: 'Mushroom cap: the big loop is one big mushroom outline; it can be crossed by a second cap too.' },
  { key: 'cross', label: 'Big loop', options: ['crossed by a second ring', 'single ring'], value: 'crossed by a second ring', hint: 'A second ring slots through the big one at right angles (a half-depth slot in each, top and bottom), so it makes bubbles whichever way it swings.' },
  { key: 'crossSmall', label: 'Small loops crossed', showIf: (p) => p.loops !== 'choose each loop', options: ['single', 'crossed by a second ring'], value: 'single', hint: 'Each small loop gets its own crossing ring too, slotted through it at right angles: twice the film, more bubbles. One more flat piece per loop.' },
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
    const str = (v) => (typeof v === 'string' ? v : '') // an old saved number must not break the build
    const yarn = str(p.film).startsWith('string')
    const T = yarn ? Math.max(p.loopT, 3.5) : p.loopT
    const H = p.thick
    const crossed = str(p.cross).startsWith('crossed'), crossS = str(p.crossSmall).startsWith('crossed')
    // one flat loop (xy, centred): a circle, or a mushroom outline; an eye tab on top (+y) and one underneath (-y)
    const ringSec = (ri, topHole, botHole, notch, shape = 'circle') => {
      let fill // the shape of the loop's centre line, filled
      if (shape === 'mushroom') {
        const a = ri * 1.2, b = ri * 0.85, y0 = ri * 0.05, pts = []
        for (let i2 = 0; i2 <= 40; i2++) { const t = Math.PI * (i2 / 40); pts.push([a * Math.cos(t), y0 + b * Math.sin(t)]) }
        const sw = ri * 0.32
        pts.push([-a * 0.55, y0 - ri * 0.12], [-sw, y0 - ri * 0.12], [-sw * 1.15, -ri * 0.95], [sw * 1.15, -ri * 0.95], [sw, y0 - ri * 0.12], [a * 0.55, y0 - ri * 0.12])
        fill = k(k(k(new CrossSection([pts.reverse()], 'NonZero')).offset(-2, 'Round', 2, 16)).offset(2, 'Round', 2, 16))
      } else fill = k(CrossSection.circle(ri + T / 2, 128))
      let sec = k(k(fill.offset(T / 2, 'Round', 2, 24)).subtract(k(fill.offset(-T / 2, 'Round', 2, 24))))
      const outer = k(fill.offset(T / 2, 'Round', 2, 24)).bounds()
      const hole = k(fill.offset(-T / 2, 'Round', 2, 24)), hb = hole.bounds()
      const eyes = []
      for (const [hd, s2] of [[topHole, 1], [botHole, -1]]) {
        if (!hd) continue
        const ro = hd / 2 + 2.2, edge = s2 > 0 ? outer.max[1] : outer.min[1], yc = edge + s2 * (hd / 2 + 1.4)
        const stem = k(k(CrossSection.square([2 * ro, Math.abs(yc - edge) + T / 2], false)).translate([-ro, s2 > 0 ? edge - T / 2 : yc]))
        eyes.push({ solid: k(k(k(CrossSection.circle(ro, 40)).translate([0, yc])).add(stem)), hole: k(k(CrossSection.circle(hd / 2, 32)).translate([0, yc])) })
      }
      if (eyes.length) sec = k(sec.add(k(CrossSection.union(eyes.map((e) => e.solid)))))
      sec = k(sec.subtract(hole))
      if (eyes.length) sec = k(sec.subtract(k(CrossSection.union(eyes.map((e) => e.hole)))))
      if (!yarn) {
        // film notches every 5.5 mm round the inside edge
        const nn = []
        for (const poly of hole.toPolygons()) {
          let acc = 0
          for (let i2 = 0; i2 < poly.length; i2++) {
            const [x1, y1] = poly[i2], [x2, y2] = poly[(i2 + 1) % poly.length], l = Math.hypot(x2 - x1, y2 - y1)
            acc += l
            if (acc >= 5.5) { acc = 0; nn.push(k(k(CrossSection.circle(0.9, 12)).translate([x1, y1]))) }
          }
        }
        if (nn.length) sec = k(sec.subtract(k(CrossSection.union(nn))))
      }
      if (notch) {
        // half-depth slots at the top and bottom where the crossing ring passes: from the inside edge (A) or the outside edge (B)
        const w2 = H + 0.3, cuts = []
        for (const s2 of [1, -1]) {
          const hin = s2 > 0 ? hb.max[1] : -hb.min[1], hout = s2 > 0 ? outer.max[1] : -outer.min[1] // inside and outside edge, up or down the middle line
          const y0 = notch === 'in' ? s2 * (hin - 1) : s2 * (hin + T / 2 - 0.1), y1 = notch === 'in' ? s2 * (hin + T / 2 + 0.1) : s2 * (hout + 1)
          cuts.push(k(k(CrossSection.square([w2, Math.abs(y1 - y0)], false)).translate([-w2 / 2, Math.min(y0, y1)])))
        }
        sec = k(sec.subtract(k(CrossSection.union(cuts))))
      }
      return sec
    }
    const smallR = p.smallD / 2, bigR = p.bigD / 2
    const pieces = [] // [label, manifold]
    const sShape = str(p.loops).startsWith('mushroom') ? 'mushroom' : 'circle', bShape = str(p.bigShape).startsWith('mushroom') ? 'mushroom' : 'circle'
    // every small loop: its shape, whether it is crossed, and its size (a taper grows or shrinks them down the chain)
    const mode = str(p.loops)
    const kindAt = (i) => {
      if (mode === 'choose each loop') { const v = str(p[`pos${i + 1}`]) || 'circle'; return { shape: v.includes('mushroom') ? 'mushroom' : 'circle', crossed: v.startsWith('crossed') } }
      const shape = mode.startsWith('circles and') ? (i % 2 ? 'mushroom' : 'circle') : sShape
      return { shape, crossed: crossS }
    }
    const tp = str(p.taper), sizeAt = (i) => smallR * (tp.startsWith('growing') ? 1 + (0.33 * i) / Math.max(1, p.smallN - 1) : tp.startsWith('shrinking') ? 1.33 - (0.33 * i) / Math.max(1, p.smallN - 1) : 1)
    const cacheA = new Map(), cacheB = new Map(), counts = new Map()
    const pieceA = (i) => {
      const { shape, crossed: cx } = kindAt(i), r = +sizeAt(i).toFixed(1), top = i === 0
      const key = `${top ? 'top' : 'loop'} ${shape}${cx ? ' crossed' : ''} ${(2 * r).toFixed(0)}`
      if (!cacheA.has(key)) cacheA.set(key, k(ringSec(r, top ? p.ropeD : p.linkD, p.linkD, cx ? 'in' : null, shape).extrude(H)))
      counts.set(key, (counts.get(key) || 0) + 1)
      return { m: cacheA.get(key), r, key }
    }
    const pieceB = (i) => {
      const { shape, crossed: cx } = kindAt(i), r = +sizeAt(i).toFixed(1)
      if (!cx) return null
      const key = `cross ${shape} ${(2 * r).toFixed(0)}`
      if (!cacheB.has(key)) cacheB.set(key, k(ringSec(r, 0, 0, 'out', shape).extrude(H)))
      counts.set(key, (counts.get(key) || 0) + 1)
      return cacheB.get(key)
    }
    const bigA = k(ringSec(bigR, p.linkD, p.linkD, crossed ? 'in' : null, bShape).extrude(H))
    const bigB = crossed ? k(ringSec(bigR, 0, 0, 'out', bShape).extrude(H)) : null
    // ---- the chain, assembled for the view: rings in a column, small swivels between them
    const gap = p.linkD + 7 // a small swivel or split ring between the eyes
    const views = [], hw = []
    let y = 0
    const place = (m, ri, top, bot) => {
      const h = ri + T + (top ? top + 1.4 + 2.2 : 0)
      y -= h
      const moved = k(m.translate([0, y, -H / 2]))
      const yc = y
      y -= ri + T + (bot ? bot + 1.4 + 2.2 : 0)
      return { moved, yc }
    }
    // a crossed pair, turned 25° about the hanging line so both rings show from the front as a cross
    const pair = ({ moved, yc }, B) => {
      if (!B) return [moved]
      const bView = k(k(k(B.translate([0, 0, -H / 2])).rotate([0, 90, 0])).translate([0, yc, 0]))
      const turn = (m) => k(k(k(m.translate([0, -yc, 0])).rotate([0, 25, 0])).translate([0, yc, 0]))
      return [turn(moved), turn(bView)]
    }
    const ring3 = (yc) => hw.push(k(k(k(k(k(CrossSection.circle(0.9, 10)).translate([gap / 2 - 1, 0])).revolve(24)).rotate([0, 90, 0])).translate([0, yc, 0])))
    for (let i = 0; i < p.smallN; i++) {
      const a = pieceA(i)
      views.push(...pair(place(a.m, a.r, i === 0 ? p.ropeD : p.linkD, p.linkD), pieceB(i)))
      ring3(y - gap / 2 + 2.5); y -= gap - 5
    }
    views.push(...pair(place(bigA, bigR, p.linkD, p.linkD), bigB))
    const assembled = k(Manifold.union(views))
    const bb = assembled.boundingBox(), cy = (bb.max[1] + bb.min[1]) / 2
    // ---- print plate: every piece flat, side by side
    // one flat STL per different piece, with how many to print
    const label = (key) => key.startsWith('top') ? `Top loop (leash eye), ${key.split(' ')[1]}${key.includes('crossed') ? ' crossed' : ''}, Ø${key.split(' ').pop()} mm` : key.startsWith('cross') ? `Crossing ring for the ${key.split(' ')[1]} loops, Ø${key.split(' ').pop()} mm` : `${key.split(' ')[1][0].toUpperCase() + key.split(' ')[1].slice(1)} loop${key.includes('crossed') ? ', crossed' : ''}, Ø${key.split(' ').pop()} mm`
    const flats = [...cacheA, ...cacheB].map(([key, m], j) => [`p${j}`, m, label(key), counts.get(key)])
    flats.push(['bigA', bigA, `Big ${bShape === 'mushroom' ? 'mushroom cap' : 'ring'}${crossed ? ' (slotted)' : ''}`, 1])
    if (crossed) flats.push(['bigB', bigB, `Big crossing ${bShape === 'mushroom' ? 'cap' : 'ring'}`, 1])
    const meshes = { combined: meshData(k(assembled.translate([0, -cy, 0]))) }
    if (hw.length) meshes.rods = meshData(k(k(Manifold.union(hw)).translate([0, -cy, 0])))
    for (const [key, m] of flats) meshes[`flat_${key}`] = meshData(m)
    const dens = opts.density || 1.27
    const gOf = (m) => (m.volume() / 1000) * dens
    const g = flats.reduce((a, [, m, , n]) => a + n * gOf(m), 0)
    const anyCross = [...counts.keys()].some((key) => key.startsWith('cross'))
    const len = bb.max[1] - bb.min[1], wid = bb.max[0] - bb.min[0]
    if (!yarn && p.bigD > 90) warns.push('A printed loop over about 90 mm struggles to hold a film: use string for a giant big circle.')
    if (2 * (bigR + T) + 2 * (p.linkD + 4) > 250) warns.push('The big ring is bigger than most beds: lay it corner to corner, or make it smaller.')
    const rings = [smallR, bigR, ...(crossed ? [bigR] : [])]
    const yarnM = yarn ? ((anyCross ? 1.5 : 1) * p.smallN * ((2 * Math.PI * (smallR + T / 2)) / 3) * (2 * T + 2 * H) + rings.slice(1).reduce((a, r) => a + ((2 * Math.PI * (r + T / 2)) / 3) * (2 * T + 2 * H), 0)) / 1000 : 0
    const outline = k(CrossSection.circle(bigR + T, 64))
    return {
      bubblePoi: { yarn, small: p.smallN, loops: flats.reduce((a, [, , , n]) => a + n, 0), len, wid, height: H, yarnM, crossed, crossSmall: anyCross, swivels: p.smallN, pieces: flats.map(([key, , lab, n]) => ({ key: 'flat_' + key, label: lab, n })) },
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
    d('bubblePoiClassic', 'Bubble Poi', 'Build your own bubble poi: a chain of small loops linked by little swivels over a big loop at the bottom. Start from a classic, mini, giant, toadstool, mushroom cap or long ladder, then choose every part: circles or mushrooms, crossed or single, loop by loop, growing or shrinking down the chain, and the big loop as a ring or a mushroom cap, crossed or single. Every piece prints flat on its own.', {}),
  ]
}
