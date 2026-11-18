// Signature: three hubs from the Dreamscape world (the dome, the music, the
// machines that run the show, the visuals). See designs.js for the design format.
import { Canvas, TAU, rng, ccw, cw, circlePts } from './geom.js'
import { drawSpokes, bez } from './designs.js'

const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)]

/** Closed wobbly ring r(a) as a stroked loop. */
function waveRing(c, rOf, w, n = 360) {
  const pts = []
  for (let s = 0; s < n; s++) {
    const a = (TAU * s) / n
    pts.push(polar(rOf(a), a))
  }
  c.line(pts, w, true)
}

/**
 * Spur gear outline (CCW), centre (cx, cy), pitch radius rp, z teeth.
 * internal: teeth point inward (a ring gear's teeth, as the hole's edge).
 */
function gearPts(cx, cy, rp, z, depth, phase = 0, internal = false) {
  const pts = []
  const tip = internal ? rp - depth / 2 : rp + depth / 2
  const root = internal ? rp + depth / 2 : rp - depth / 2
  // trapezoid teeth: root land, flank, tip land, flank; tip a little narrower than root
  const prof = [[0, root], [0.18, root], [0.32, tip], [0.68, tip], [0.82, root], [1, root]]
  for (let i = 0; i < z; i++) {
    for (const [f, r] of prof.slice(0, -1)) {
      const a = phase + ((i + f) * TAU) / z
      // a few points along each land so big gears stay round
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
  }
  return ccw(pts)
}

export const SIGNATURE_DESIGNS = [
  // ------------------------------------------------------------ Bass Bloom
  {
    id: 'sigbass',
    group: 'Dreamscape',
    name: 'Bass Bloom',
    blurb: 'A spinning equaliser. Tall spectrum bars rise from a ring round the collar, bass longest in the middle of each petal, and low treble bars hang in from the rim between them, over waveform rings. Spun, every bar length becomes a ring of light, so the hub glows in bands shaped like the spectrum. Reroll the track for a new song.',
    overrides: { strutW: 2.8, frameH: 3.5 },
    params: [
      { key: 'sym', label: 'Repeats', unit: '', min: 2, max: 8, step: 1, value: 4, hint: 'How many times the spectrum goes round the hub.' },
      { key: 'per', label: 'Bars per repeat', unit: '', min: 5, max: 16, step: 1, value: 11 },
      { key: 'barW', label: 'Bar width', unit: 'mm', min: 3, max: 9, step: 0.5, value: 4.5 },
      { key: 'drop', label: 'Bass weight', unit: '%', min: 0, max: 100, step: 5, value: 80, hint: 'How much longer the bass bars are than the treble.' },
      { key: 'waves', label: 'Waveform rings', unit: '', min: 0, max: 5, step: 1, value: 3 },
      { key: 'track', label: 'Track', unit: '', min: 1, max: 999, step: 1, value: 37, seed: true },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), random = rng(p.track)
      const n = p.sym * p.per
      const r0 = g.hubR + 20, r1 = g.Ri
      const span = r1 - r0
      // the spectrum: a few random peaks over a bass-heavy fall-off, shared by every repeat
      const peaks = Array.from({ length: 4 }, () => [random(), 0.08 + random() * 0.18, 0.3 + random() * 0.7])
      const spec = (t) => {
        let v = (p.drop / 100) * Math.exp(-2.2 * t) + 0.08
        for (const [m, s, h] of peaks) v += 0.45 * h * Math.exp(-(((t - m) / s) ** 2))
        return Math.min(1, v)
      }
      let max = 0
      for (let i = 0; i < p.per; i++) max = Math.max(max, spec(Math.abs((2 * (i + 0.5)) / p.per - 1)))
      c.ring(0, 0, r0, g.w + 1) // the bars stand on this
      for (let k = 0; k < n; k++) {
        const i = k % p.per, t = Math.abs((2 * (i + 0.5)) / p.per - 1) // bass in the middle of each petal
        const a = g.rot + (TAU * k) / n
        const len = 8 + (span * 0.64 - 8) * (spec(t) / max) ** 1.4
        // rising bar: wide at the root, rounded tip
        rc.taper([polar(r0, a), polar(r0 + len, a)], p.barW, p.barW * 0.8)
        // a short echo inward toward the collar, like the mirrored half of a waveform view
        if (k % 2 === 0) rc.taper([polar(r0, a), polar(r0 - 4 - 9 * (spec(t) / max), a)], p.barW * 0.9, p.barW * 0.7)
        // a floating cap above each bar, like a peak-hold meter, tied to the bar by a thin neck
        const cap = r0 + len + 5
        if (cap < r1 - 12) {
          rc.seg(...polar(r0 + len, a), ...polar(cap, a), 2.6)
          const half = (p.barW * 0.75) / cap
          rc.line([polar(cap, a - half), polar(cap, a + half)], 3.2)
        }
        // treble hangs from the rim, between the bars, in the low frame
        const b = a + Math.PI / n
        const hang = 8 + (span * 0.3 - 8) * (1 - spec(t) / max)
        c.taper([polar(r1 + 1, b), polar(r1 - hang, b)], Math.max(3.2, p.barW * 0.75), Math.max(2.8, p.barW * 0.55))
      }
      // waveform rings: their wave count is a multiple of the repeats, so they stay balanced
      for (let j = 0; j < p.waves; j++) {
        const f = (j + 1) / (p.waves + 1)
        const rr = r0 + span * (0.2 + 0.7 * f)
        const m = p.sym * (2 + 2 * j)
        const amp = 2 + 3 * f
        waveRing(c, (a) => rr + amp * Math.sin(m * (a - g.rot) + j), g.w * 0.9)
      }
      drawSpokes(c, g, p.sym * 2, Math.PI / n, g.w * 1.1)
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },

  // ---------------------------------------------------------- Dream Engine
  {
    id: 'sigengine',
    group: 'Dreamscape',
    name: 'Dream Engine',
    blurb: 'A planetary gear train, for whoever runs the machine behind the show. Planet gears stand tall between a sun gear round the staff and a ring gear inside the rim, carried on low arms. It never actually turns, but spin the staff and it looks like an engine driving the dream. Teeth counts are real, so the gears would mesh.',
    overrides: { strutW: 3.2, frameH: 4 },
    params: [
      { key: 'planets', label: 'Planets', unit: '', min: 3, max: 6, step: 1, value: 4 },
      { key: 'sunR', label: 'Sun gear size', unit: 'mm', min: 30, max: 60, step: 1, value: 40 },
      { key: 'module', label: 'Tooth size', unit: 'mm', min: 3, max: 8, step: 0.5, value: 4.5, hint: 'Gear module: the tooth pitch is π × this.' },
      { key: 'spokes', label: 'Planet spokes', unit: '', min: 3, max: 9, step: 1, value: 5 },
      { key: 'swirl', label: 'Spoke swirl', unit: '°', min: 0, max: 80, step: 1, value: 45, hint: 'Curved spokes look like they are already turning.' },
      { key: 'inner', label: 'Planet centres', options: ['ring', 'lens', 'star'], value: 'star' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const m = p.module, depth = 2.25 * m * 0.8
      // tooth counts: ring = sun + 2 × planet, and (sun + ring) divisible by planets so they space evenly
      let zs = Math.max(10, Math.round((2 * p.sunR) / m))
      const ringR = g.Ri - depth / 2 - 1.5
      let zr = Math.round((2 * ringR) / m)
      if ((zr - zs) % 2) zr--
      while ((zs + zr) % p.planets) { zr -= 2 }
      const zp = (zr - zs) / 2
      const rs = (zs * m) / 2, rRing = (zr * m) / 2, rp = (zp * m) / 2
      const ro = rs + rp
      const gap = 0.9 // printed clearance between meshing teeth
      // sun gear on the collar, standing tall
      const sunHole = rs - depth / 2 - gap / 2 - 5.5
      rc.solid(gearPts(0, 0, rs - gap / 2, zs, depth, g.rot))
      rc.contours.push(cw(circlePts(0, 0, sunHole, 128)))
      for (let s = 0; s < p.planets * 2; s++) {
        const a0 = g.rot + (TAU * s) / (p.planets * 2), sw = (-p.swirl * Math.PI) / 180
        const pts = []
        for (let q = 0; q <= 10; q++) { const t = q / 10, r = g.hubR - 2 + (sunHole + 1 - g.hubR + 2) * t; pts.push(polar(r, a0 + sw * t)) }
        rc.taper(pts, 5, 3.6)
      }
      // ring gear: the rim's inner edge grows teeth (relief annulus with a toothed hole)
      rc.contours.push(ccw(circlePts(0, 0, g.Ri + 1, 256)))
      rc.contours.push(cw(gearPts(0, 0, rRing + gap / 2, zr, depth, g.rot + Math.PI / zr, true)))
      // carrier: low arms from the collar to each planet, plus a ring through the planet centres
      c.ring(0, 0, ro, g.w)
      for (let i = 0; i < p.planets; i++) {
        const a = g.rot + (TAU * i) / p.planets
        const [x, y] = polar(ro, a)
        c.seg(...polar(g.hubR - 2, a), ...polar(ro + rp * 0.4, a), g.w * 1.6)
        // planet, turned so its teeth fall between the sun's and the ring's
        const spin = (a * zs) / zp + Math.PI / zp + a
        const rim = rp - depth / 2 - gap / 2 - 5.5
        rc.contours.push(gearPts(x, y, rp - gap / 2, zp, depth, spin))
        rc.contours.push(cw(circlePts(x, y, rim, 96)))
        // swirling spokes and a centre boss
        const boss = Math.max(6, rp * 0.22)
        for (let s = 0; s < p.spokes; s++) {
          const a0 = spin + (TAU * s) / p.spokes, sw = (p.swirl * Math.PI) / 180
          const pts = []
          for (let q = 0; q <= 12; q++) {
            const t = q / 12, r = boss + (rim + 1 - boss) * t
            pts.push([x + r * Math.cos(a0 + sw * t), y + r * Math.sin(a0 + sw * t)])
          }
          rc.taper(pts, 4.2, 3)
        }
        if (p.inner === 'ring') rc.ring(x, y, boss, 3)
        else if (p.inner === 'lens') rc.disc(x, y, boss + 1.5)
        else {
          // a little four-point star in the middle of each planet
          const st = []
          for (let q = 0; q < 8; q++) st.push([x + (q % 2 ? boss * 0.55 : boss + 3) * Math.cos(spin + (q * TAU) / 8), y + (q % 2 ? boss * 0.55 : boss + 3) * Math.sin(spin + (q * TAU) / 8)])
          rc.solid(st)
        }
      }
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false }, info: { zs, zp, zr } }
    },
  },

  // ----------------------------------------------------------- Kaleidoscope
  {
    id: 'sigkaleido',
    group: 'Dreamscape',
    name: 'Kaleidoscope',
    blurb: 'A kaleidoscope: random strokes in one thin wedge, mirrored and turned round the hub, in two layers with different seeds so the tall pattern and the low one interlace. Every reroll is a new kaleidoscope, never seen before; it stays balanced whatever comes out. Spun, it melts into rings; at a slow spin it shimmers.',
    overrides: { strutW: 2.6, frameH: 3.5 },
    params: [
      { key: 'fold', label: 'Mirrors', unit: '', min: 5, max: 12, step: 1, value: 8 },
      { key: 'strokes', label: 'Strokes per wedge', unit: '', min: 2, max: 9, step: 1, value: 5 },
      { key: 'tallW', label: 'Tall stroke width', unit: 'mm', min: 2.6, max: 7, step: 0.1, value: 3.6 },
      { key: 'gems', label: 'Gems', options: ['on', 'off'], value: 'on', hint: 'Round jewels where the mirrors meet the strokes.' },
      { key: 'seed', label: 'Turn the tube', unit: '', min: 1, max: 999, step: 1, value: 404, seed: true },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w)
      const half = Math.PI / p.fold
      const r0 = g.hubR + 4, r1 = g.Ri - 1
      const rings = [r0 + (r1 - r0) * 0.36, r0 + (r1 - r0) * 0.7]
      // every copy of a wedge stroke: mirrored and turned
      const stamp = (canvas, pts, w0, w1) => {
        for (let i = 0; i < p.fold; i++) {
          const base = g.rot + 2 * half * i
          for (const sg of [1, -1]) {
            const q = pts.map(([r, a]) => polar(r, base + sg * a))
            canvas.taper(q, w0, w1)
          }
        }
      }
      const layer = (seed, canvas, wMax, count) => {
        const random = rng(seed)
        const gems = []
        for (let s = 0; s < count; s++) {
          // each stroke runs from a mirror line (so its reflection meets it) to a ring or the other mirror
          const ra = r0 + 6 + random() * (r1 - r0 - 12)
          const onEdge = random() < 0.5 ? 0 : half
          const rb = random() < 0.6 ? rings[Math.floor(random() * rings.length)] : r0 + 6 + random() * (r1 - r0 - 12)
          const ab = random() * half
          const P0 = [ra, onEdge], P3 = [rb, ab]
          const P1 = [ra + (random() - 0.5) * 40, half * random()]
          const P2 = [rb + (random() - 0.5) * 40, half * random()]
          const pts = bez(P0, P1, P2, P3, 24).map(([r, a]) => [Math.min(r1, Math.max(r0, r)), Math.min(half, Math.max(0, a))])
          const w = wMax * (0.75 + 0.25 * random())
          stamp(canvas, pts, w, Math.max(2.6, w * 0.7))
          gems.push(P0)
        }
        return gems
      }
      // low layer: the mirrors themselves, rings, and its own strokes
      for (const r of rings) c.ring(0, 0, r, g.w)
      for (let i = 0; i < 2 * p.fold; i++) {
        const a = g.rot + half * i
        c.seg(...polar(g.hubR - 1, a), ...polar(r1 + 1, a), i % 2 ? Math.max(2.8, g.w) : g.w * 1.3)
      }
      layer(p.seed * 7 + 3, c, g.w * 1.1, Math.max(2, p.strokes - 1))
      // tall layer
      const gems = layer(p.seed, rc, p.tallW, p.strokes)
      if (p.gems === 'on') {
        for (const [r, a] of gems) {
          const gr = Math.min(6, 2.6 + r / 40)
          for (let i = 0; i < p.fold; i++) {
            const base = g.rot + 2 * half * i
            rc.disc(...polar(r, base + a), gr)
            if (a) rc.disc(...polar(r, base - a), gr)
          }
        }
      }
      return { relief: { contours: rc.contours, thicken: 0, gap: 0, slits: false } }
    },
  },
]
