// A loyal dog. A white dog with yellow-orange ears, a
// medium coat (soft feathering on chest, tail and the backs of the legs) and a
// loyal heart. In every design her white body is the low frame (colour A) and
// her ears stand up as colour-B relief, so on the staff she reads as a white
// dog with orange ears. See designs.js for the design format.
import { drawSpokes, deg } from './designs.js'
import { TAU, ccw, cw, circlePts, Canvas } from './geom.js'

const DOG_COLOURS = { A: '#f2efe6', B: '#f2a33a' } // white coat, yellow-orange ears

const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
const lerp = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]

/**
 * Closed outline from control points [x, y, feathered?]. Corner-cut smooth,
 * resampled evenly, and the feathered stretches get soft tufts pushed outward:
 * the medium coat, without going fluffy.
 */
function coat(ctrl, { smooth = 3, step = 0.012, tuft = 0.035, tufts = 0.06 } = {}) {
  let pts = ctrl.map(([x, y, f]) => ({ x, y, f: !!f }))
  for (let k = 0; k < smooth; k++) {
    const out = []
    for (let i = 0; i < pts.length; i++) {
      const A = pts[i], B = pts[(i + 1) % pts.length], f = A.f && B.f
      out.push({ ...lerpP(A, B, 0.25), f }, { ...lerpP(A, B, 0.75), f })
    }
    pts = out
  }
  // resample to an even spacing so tufts come out the same size everywhere
  const even = []
  for (let i = 0; i < pts.length; i++) {
    const A = pts[i], B = pts[(i + 1) % pts.length]
    const n = Math.max(1, Math.ceil(Math.hypot(B.x - A.x, B.y - A.y) / step))
    for (let s = 0; s < n; s++) even.push({ ...lerpP(A, B, s / n), f: A.f })
  }
  const area = even.reduce((a, p, i) => { const q = even[(i + 1) % even.length]; return a + p.x * q.y - q.x * p.y }, 0)
  const sgn = area > 0 ? 1 : -1 // outward normal side
  let run = 0
  return even.map((p, i) => {
    if (!p.f) { run = 0; return [p.x, p.y] }
    const A = even[(i - 1 + even.length) % even.length], B = even[(i + 1) % even.length]
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1
    const ph = (run * step) / tufts
    run++
    // a soft lock of coat: rounded, uneven in length, swept a little along the outline
    const k = (0.5 - 0.5 * Math.cos(TAU * ph)) * (0.65 + 0.35 * Math.sin(ph * 2.3 + 1))
    const nx = (sgn * dy) / L, ny = (-sgn * dx) / L
    return [p.x + (nx - (dx / L) * 0.12) * tuft * k, p.y + (ny - (dy / L) * 0.12) * tuft * k]
  })
}
const lerpP = (A, B, t) => ({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t })
const mirrorX = (pts) => pts.map(([x, y, f]) => [-x, y, f])

/** Local (x along the tangent, y radially out) at angle a, radius r0, scale s. */
const frameAt = (a, r0, s) => (x, y) => {
  const R = r0 + y * s, T = x * s
  return [R * Math.cos(a) - T * Math.sin(a), R * Math.sin(a) + T * Math.cos(a)]
}

// ------------------------------------------------------------ her face --
// Front view, unit = head height, chin at y = 0. Ears are her mark: upright,
// a little tipped out, the tips softly folded forward.
const FACE_HALF = [
  [0, 0], [0.1, 0.01], [0.16, 0.06], [0.18, 0.18], [0.2, 0.3], // muzzle
  [0.34, 0.36, 1], [0.44, 0.46, 1], [0.48, 0.6, 1], // cheek ruff: medium coat
  [0.46, 0.76], [0.38, 0.88], [0.2, 0.96], [0, 0.98],
]
const FACE = (() => { const h = FACE_HALF.slice(1, -1); return [...FACE_HALF, ...mirrorX(h).reverse()] })()
function earPts(side, lift, fold) {
  // base on the skull, tip up and out; the fold bends the tip forward and down
  const tip = [0.48 + 0.1 * lift, 1.3 + 0.14 * lift - 0.16 * fold]
  const pts = [[0.12, 0.92], [0.22, 1.06], [0.36 + 0.04 * lift, 1.22 + 0.1 * lift - 0.08 * fold], tip, [0.56 + 0.06 * lift, 1.1], [0.54, 0.9], [0.44, 0.8]]
  return pts.map(([x, y]) => [side * x, y])
}

function drawFace(c, rc, holes, P, opt) {
  const M = (pts) => pts.map(([x, y]) => P(x, y))
  c.solid(M(coat(FACE, { tuft: 0.03, tufts: 0.07 })))
  for (const side of [1, -1]) {
    const ear = coat(earPts(side, opt.lift, opt.fold).map(([x, y]) => [x, y]), { smooth: 3, tuft: 0 })
    rc.solid(M(ear))
    // inner ear: a shallow recess, so the orange has a soft inside
    const inner = earPts(side, opt.lift, opt.fold).map(([x, y]) => [side * 0.4 + (x - side * 0.4) * 0.42, 1.08 + (y - 1.08) * 0.42])
    holes.push(ccw(M(coat(inner, { smooth: 2, tuft: 0 }))))
    // eyes: kind, a touch of brow above (through-holes in the white)
    c.contours.push(cw(M(circlePts(side * 0.17, 0.62, 0.055, 18))))
  }
  // nose: a soft rounded triangle at the end of her muzzle
  c.contours.push(cw(M(coat([[0, 0.1], [0.08, 0.17], [0.09, 0.22], [0, 0.24], [-0.09, 0.22], [-0.08, 0.17]], { smooth: 2, tuft: 0 }))))
}

// ------------------------------------------------------- the dog, sitting --
// Side view facing +x, ground y = 0, unit = height to the top of her skull.
// Flag 1 = feathered (medium coat): chest, backs of the legs.
const SIT_BODY = [
  [0.42, 0], [0.29, 0], [0.27, 0.05], [0.25, 0.28], [0.2, 0.24], [0.17, 0.1], [0.18, 0], // front paw, leg, tuck
  [-0.12, 0], [-0.19, 0.04, 1], [-0.27, 0.13, 1], [-0.3, 0.25, 1], // hind paw, back of the leg
  [-0.27, 0.37], [-0.2, 0.48], [-0.1, 0.58], [0, 0.66], [0.07, 0.72], [0.1, 0.8], // rump, back, neck
  [0.28, 0.8], [0.36, 0.72], [0.4, 0.62, 1], [0.41, 0.5, 1], [0.39, 0.4, 1], // throat, chest
  [0.34, 0.33], [0.33, 0.1], [0.35, 0.03],
]
// head about the neck pivot, level gaze; rotated by tilt. A dog's head: domed
// skull, a clear stop, and a blunt, square muzzle (a pointed one reads as a rat)
const SIT_PIVOT = [0.19, 0.78]
const SIT_HEAD = [
  [0.1, 0.8], [0.1, 0.88], [0.14, 0.95], [0.21, 0.985], [0.29, 0.975], [0.34, 0.94], [0.36, 0.915], // skull, stop
  [0.42, 0.91], [0.47, 0.905], [0.495, 0.895], [0.505, 0.87], [0.5, 0.845], // muzzle, square nose
  [0.47, 0.83], [0.43, 0.82], [0.4, 0.8], [0.34, 0.775], [0.26, 0.755], [0.18, 0.75], [0.12, 0.77], // lip, jaw, cheek
]
const SIT_EAR = [[0.15, 0.92], [0.26, 0.975], [0.265, 1.04], [0.25, 1.1], [0.225, 1.14], [0.2, 1.13], [0.17, 1.06], [0.15, 0.99]]
const SIT_EYE = [0.315, 0.885]
const SIT_NOSE = [0.505, 0.87]
const SIT_TAIL = (() => {
  // a low plume lying along the ground behind her, feathered underneath
  const path = [[-0.24, 0.14], [-0.34, 0.07], [-0.46, 0.055], [-0.56, 0.08], [-0.61, 0.13]]
  const top = [], bot = []
  path.forEach((q, i) => {
    const A = path[Math.max(0, i - 1)], B = path[Math.min(path.length - 1, i + 1)]
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]), w = 0.06 - 0.02 * (i / (path.length - 1))
    const nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L
    top.push([q[0] + nx * w, q[1] + ny * w, 0]); bot.push([q[0] - nx * w, q[1] - ny * w, 1])
  })
  return [...top, ...bot.reverse()]
})()
const turn = ([x, y], a, [cx, cy] = SIT_PIVOT) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]

/** The ground she sits on: a straight bar under her paws and tail, tied to the collar. */
function drawGround(c, g, a, rg, s, P) {
  c.taper([P(-0.68, -0.03), P(0.47, -0.03)], 3.6, 3.6)
  c.taper([polar(g.hubR - 1, a), polar(rg, a)], 7, 5)
}

/** The dog sitting, drawn through P (local -> hub). tilt in radians lifts her head. Returns her nose tip. */
function drawSitting(c, rc, P, tilt, s) {
  const M = (pts) => pts.map(([x, y]) => P(x, y))
  const big = ([x, y]) => [SIT_PIVOT[0] + (x - SIT_PIVOT[0]) * 1.2, SIT_PIVOT[1] + (y - SIT_PIVOT[1]) * 1.2] // a good head on her
  const T = (pts) => pts.map((q) => [...turn(big(q), tilt), q[2]])
  const tuft = 1.2 / s, tufts = 3.6 / s // soft locks about 1.2 mm deep and 3.6 mm apart, whatever her size
  c.solid(M(coat(SIT_BODY, { tuft, tufts, step: 0.25 / s })))
  c.solid(M(coat(SIT_TAIL, { tuft: tuft * 1.2, tufts, step: 0.25 / s })))
  c.solid(M(coat(T(SIT_HEAD), { smooth: 2, tuft: 0, step: 0.6 / s })))
  rc.solid(M(coat(T(SIT_EAR), { smooth: 2, tuft: 0, step: 0.6 / s })))
  c.contours.push(cw(M(circlePts(...turn(big(SIT_EYE), tilt), 1.8 / s, 14))))
  return P(...turn(big(SIT_NOSE), tilt))
}

export const LOYALDOG_DESIGNS = [
  {
    id: 'dogmandala',
    group: 'LoyalDog',
    name: 'Loyal Dog Mandala',
    colors: DOG_COLOURS,
    blurb: "The dog's face, again and again round the staff, ears up: a white face with kind eyes and her yellow-orange ears standing tall in colour B. Her cheeks have the soft ruff of her medium coat. Spinning, the ears blur into an orange crown of dogs.",
    overrides: { strutW: 3, frameH: 3.5 },
    params: [
      { key: 'n', label: 'Faces', unit: '', min: 3, max: 8, step: 1, value: 5 },
      { key: 'size', label: 'Face size', unit: 'mm', min: 30, max: 70, step: 1, value: 52 },
      { key: 'lift', label: 'Ears up', unit: '%', min: 0, max: 100, step: 1, value: 60, hint: 'How tall and alert her ears stand.' },
      { key: 'fold', label: 'Ear tips folded', unit: '%', min: 0, max: 100, step: 1, value: 35 },
      { key: 'paws', label: 'Paw prints between', options: ['on', 'off'], value: 'on' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = [], n = p.n, s = p.size
      const top = g.Ri - 4 // ear tips just under the rim
      const r0 = Math.max(g.hubR + 12, top - s * (1.32 + 0.12 * p.lift / 100)) // chin radius
      for (let i = 0; i < n; i++) {
        const a = g.rot + (TAU * i) / n
        drawFace(c, rc, holes, frameAt(a, r0, s), { lift: p.lift / 100, fold: p.fold / 100 })
        // a neck strut down to the collar
        c.taper([polar(g.hubR - 1, a), polar(r0 + 2, a)], 9, 6)
        if (p.paws === 'on') {
          // between the faces: a round plaque with her paw print cut through it
          const b = a + Math.PI / n, rp = r0 + s * 0.5
          const Q = frameAt(b, rp, 1)
          c.disc(...Q(0, 2), 16)
          c.contours.push(cw(coat([[-6.5, -8.5], [6.5, -8.5], [8, -2.5], [3.5, 2.2], [-3.5, 2.2], [-8, -2.5]].map(([x, y]) => [x, y]), { smooth: 3, tuft: 0 }).map(([x, y]) => Q(x, y))))
          for (const [x, y, r] of [[-9.8, 5, 2.5], [-3.8, 10.2, 2.5], [3.8, 10.2, 2.5], [9.8, 5, 2.5]]) c.contours.push(cw(circlePts(...Q(x, y), r, 16)))
          c.taper([polar(g.hubR - 1, b), Q(0, -12)], 4, 3.2)
          c.taper([Q(0, 16), polar(g.Ri + 1, b)], 3.2, 3.2)
        }
      }
      c.ring(0, 0, r0 + s * 0.5, 2.8)
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'doghowl',
    group: 'LoyalDog',
    name: 'Howling at the Moon',
    colors: DOG_COLOURS,
    blurb: "The dog sits and sings, nose to the sky. Each white the dog sits on a ring round the staff with her orange ear back and her medium coat feathering her chest, tail and back legs; her howl rises in orange arcs to an orange moon on the rim. Spun, the moons and ears make an orange halo and the howls ripple.",
    overrides: { strutW: 3, frameH: 3.5 },
    params: [
      { key: 'n', label: 'Dogs', unit: '', min: 2, max: 5, step: 1, value: 3 },
      { key: 'size', label: 'Size', unit: 'mm', min: 40, max: 85, step: 1, value: 66 },
      { key: 'moon', label: 'Moon size', unit: 'mm', min: 8, max: 26, step: 0.5, value: 16 },
      { key: 'arcs', label: 'Howl arcs', unit: '', min: 0, max: 4, step: 1, value: 3 },
      { key: 'tilt', label: 'Head up', unit: '°', min: 20, max: 70, step: 1, value: 48 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = [], n = p.n, s = p.size
      const rg = Math.max(g.hubR + 12, g.Ri - 12 - s * 1.2) // the ground she sits on
      drawSpokes(c, g, n, -Math.PI / n) // collar to rim, between the dogs
      for (let i = 0; i < n; i++) {
        const a = g.rot + (TAU * i) / n
        const P = frameAt(a, rg, s)
        drawGround(c, g, a, rg, s, (x, y) => P(x - 0.05, y))
        const nose = drawSitting(c, rc, (x, y) => P(x - 0.05, y), deg(p.tilt), s)
        // the moon: a crescent on the rim, ahead of her nose
        const am = a + (Math.PI / n) * 0.62 // ahead of her nose (she faces the way the angle grows)
        const rm = g.Ri - p.moon + 3
        const [mx, my] = polar(rm, am)
        const moon = [...circlePts(mx, my, p.moon, 48)]
        const [bx, by] = polar(rm - p.moon * 0.42, am - 0.06)
        rc.solid(moon)
        holes.push(ccw(circlePts(bx, by, p.moon * 0.82, 40))) // the shadowed part, a recess: still reads as a crescent
        rc.taper([polar(rm + p.moon - 1, am), polar(g.Ri + 2, am)], 6, 6)
        // the howl: a fine white line from her nose to the moon, crossed by orange arcs
        c.taper([nose, [mx, my]], 2.8, 2.8)
        const hd = Math.atan2(my - nose[1], mx - nose[0]), dist = Math.hypot(mx - nose[0], my - nose[1]) - p.moon
        for (let k = 1; k <= p.arcs; k++) {
          const R = (dist * k) / (p.arcs + 1), sweep = 1.0 + 0.1 * k, pts = []
          for (let q = 0; q <= 14; q++) { const t = hd - sweep / 2 + (sweep * q) / 14; pts.push([nose[0] + R * Math.cos(t), nose[1] + R * Math.sin(t)]) }
          rc.taper(pts, 2.8, 2.8)
        }
      }
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'dogloyal',
    group: 'LoyalDog',
    name: 'Loyal',
    colors: DOG_COLOURS,
    blurb: "The dog sitting tall by the staff, ears up, gazing up at the one she loves: three white dogs round the staff, each looking up at an orange heart. Her medium coat feathers her chest, tail and the backs of her legs, and her yellow-orange ears stand up in colour B. Spun, the hearts and ears become an orange halo round a ring of white dogs.",
    overrides: { strutW: 3, frameH: 3.5 },
    params: [
      { key: 'n', label: 'Dogs', unit: '', min: 2, max: 5, step: 1, value: 3 },
      { key: 'size', label: 'Size', unit: 'mm', min: 40, max: 80, step: 1, value: 66, hint: 'Her sitting height to the top of her head.' },
      { key: 'tilt', label: 'Gaze up', unit: '°', min: 0, max: 40, step: 1, value: 16 },
      { key: 'heart', label: 'Heart size', unit: 'mm', min: 8, max: 30, step: 0.5, value: 21 },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), n = p.n, s = p.size
      const rg = Math.max(g.hubR + 12, g.Ri - 8 - s * 1.22) // the ground she sits on
      for (let i = 0; i < n; i++) {
        const a = g.rot + (TAU * i) / n
        const P = frameAt(a, rg, s)
        drawGround(c, g, a, rg, s, (x, y) => P(x - 0.05, y))
        const nose = drawSitting(c, rc, (x, y) => P(x - 0.05, y), deg(p.tilt), s)
        // the heart she gazes at: ahead of her nose and up, resting on the rim
        const look = deg(p.tilt) + 0.35
        const fwd = [P(1, 0)[0] - P(0, 0)[0], P(1, 0)[1] - P(0, 0)[1]].map((v) => v / s) // her forward
        const out = [Math.cos(a), Math.sin(a)]
        const dir = [fwd[0] * Math.cos(look) + out[0] * Math.sin(look), fwd[1] * Math.cos(look) + out[1] * Math.sin(look)]
        let hx = nose[0], hy = nose[1]
        for (let k = 0; k < 400 && Math.hypot(hx, hy) < g.Ri - p.heart * 0.3; k++) (hx += dir[0] * 0.5), (hy += dir[1] * 0.5)
        const up = Math.atan2(hy, hx) - Math.PI / 2 // heart upright: point at the staff
        const heart = []
        for (let q = 0; q < 48; q++) {
          const t = (TAU * q) / 48, x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
          const k = p.heart / 32
          heart.push([hx + k * (x * Math.cos(up) - (y + 2) * Math.sin(up)), hy + k * (x * Math.sin(up) + (y + 2) * Math.cos(up))])
        }
        rc.solid(heart)
        // a strut from the collar to the rim between each pair of dogs
        const b = a - Math.PI / n
        c.taper([polar(g.hubR - 1, b), polar(g.Ri + 1, b)], 4.5, 3.2)
      }
      return { relief: { contours: rc.contours, holes: [], thicken: 0, gap: 0, slits: false } }
    },
  },
]
