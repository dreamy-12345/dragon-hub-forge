// Dog designs. See designs.js for the design format.
import { drawSpokes, bez, ribbon, deg } from './designs.js'
import { TAU, place, ccw, circlePts, Canvas } from './geom.js'

const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
const lerp = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]

/** Corner-cutting: rounds a closed polygon. */
function smooth(pts, n = 3) {
  for (let k = 0; k < n; k++) {
    const out = []
    for (let i = 0; i < pts.length; i++) {
      const A = pts[i], B = pts[(i + 1) % pts.length]
      out.push(lerp(A, B, 0.25), lerp(A, B, 0.75))
    }
    pts = out
  }
  return pts
}

/** A unit vector at angle th from straight down, + towards the front. */
const down = (th) => [Math.sin(th), -Math.cos(th)]
const add = (A, v, L) => [A[0] + v[0] * L, A[1] + v[1] * L]

/**
 * A greyhound in side view, one moment of the gallop. Local units: s = body
 * length, x forward, y up, paws near y = 0. ph runs 0..1 over one stride.
 * P maps local to hub coordinates.
 */
function drawHound(rc, holes, P, s, ph) {
  const e = Math.cos(TAU * ph) // 1 stretched out, -1 gathered under
  const gth = (1 - e) / 2
  const M = (pts) => pts.map(([x, y]) => P(x, y))
  const limb = (pts, w0, w1) => rc.taper(M(pts), Math.max(3, w0 * s), Math.max(3, w1 * s))

  // the body: deep chest, tucked waist, spine arching as the legs gather
  const Sx = 0.2 + 0.03 * e, Hx = -0.27 - 0.03 * e, arch = 0.05 * gth
  const torso = smooth([
    [Sx + 0.13, 0.6], [Sx + 0.02, 0.69], [0.0, 0.67 + arch], [Hx + 0.02, 0.66 + arch * 0.4], [Hx - 0.08, 0.6],
    [Hx - 0.08, 0.5], [Hx + 0.04, 0.46], [-0.08, 0.53 + 0.02 * gth], [-0.02, 0.5], [Sx - 0.08, 0.33], [Sx + 0.05, 0.3], [Sx + 0.15, 0.44],
  ], 3)
  rc.solid(M(torso))

  // neck and long narrow head, reaching further when stretched
  const N0 = [Sx + 0.1, 0.6], Hb = [Sx + 0.27 + 0.03 * e, 0.79 - 0.03 * e]
  limb([N0, lerp(N0, Hb, 0.5).map((v, i) => v + (i ? 0.02 : 0)), Hb], 0.2, 0.12)
  const hd = 0.06 * e // head dips slightly when stretched
  const head = smooth([
    [Hb[0] - 0.05, Hb[1] + 0.02], [Hb[0] + 0.02, Hb[1] + 0.07], [Hb[0] + 0.1, Hb[1] + 0.045 - hd * 0.3],
    [Hb[0] + 0.2, Hb[1] - 0.0 - hd], [Hb[0] + 0.21, Hb[1] - 0.06 - hd], [Hb[0] + 0.07, Hb[1] - 0.07 - hd * 0.5], [Hb[0] - 0.03, Hb[1] - 0.06],
  ], 2)
  rc.solid(M(head))
  // rose ear folded back along the neck
  rc.solid(M(smooth([[Hb[0] + 0.03, Hb[1] + 0.06], [Hb[0] - 0.06, Hb[1] + 0.1], [Hb[0] - 0.19, Hb[1] + 0.09], [Hb[0] - 0.1, Hb[1] + 0.03], [Hb[0] - 0.02, Hb[1] + 0.0]], 2)))
  const eye = P(Hb[0] + 0.06, Hb[1] + 0.0 - hd * 0.2)
  holes.push(ccw(circlePts(eye[0], eye[1], Math.max(1.3, 0.022 * s), 14)))

  // tail: long and thin, flung up behind when stretched, tucked when gathered
  const T0 = [Hx - 0.06, 0.62]
  limb(bez(T0, [T0[0] - 0.15, T0[1] + 0.02 + 0.08 * e], [T0[0] - 0.3, T0[1] - 0.12 + 0.12 * e], [T0[0] - 0.42, T0[1] - 0.04 + 0.16 * e], 10), 0.06, 0.035)

  // front legs: reach forward when stretched, sweep back and fold when gathered
  const F0 = [Sx, 0.44]
  for (const [off, k] of [[0.18, 1], [-0.12, 0.85]]) {
    const th = 0.95 * e * k + off
    const fold = Math.max(0, -Math.sin(TAU * ph + off * 3)) * 1.3 // the carpus flicks up after push-off
    const elbow = add(F0, down(th), 0.21)
    const wrist = add(elbow, down(th - fold), 0.19)
    const paw = add(wrist, down(th - fold + 1.25), 0.06)
    limb([F0, elbow], 0.1, 0.065)
    limb([elbow, wrist, paw], 0.055, 0.05)
  }
  // hind legs: big thigh, long shank, the hock angle back
  const H0 = [Hx + 0.04, 0.5]
  for (const [off, k] of [[0.15, 1], [-0.12, 0.85]]) {
    const ps = -1.0 * e * k + off
    const stifle = add(H0, down(ps + 0.55), 0.2)
    const hock = add(stifle, down(ps - 0.75), 0.21)
    const paw = add(hock, down(ps + 0.15), 0.13)
    const toe = add(paw, down(ps + 1.4), 0.05)
    limb([H0, lerp(H0, stifle, 0.5), stifle], 0.22, 0.09)
    limb([stifle, hock], 0.07, 0.05)
    limb([hock, paw, toe], 0.05, 0.05)
  }
}

/** A paw print, pointing along heading h, centred on its main pad; u = toe size. */
function pawPrint(c, rc, C, h, u, toeW) {
  const P = (x, y) => place([[x * u, y * u]], h - Math.PI / 2, C[0], C[1])[0]
  // main pad: wide at the back with three soft lobes, narrower toward the toes
  const pad = []
  for (let q = 0; q < 60; q++) {
    const t = (TAU * q) / 60
    const x = Math.cos(t), y = Math.sin(t)
    const lobes = y < 0 ? 0.07 * Math.cos(3 * t) * -y : 0
    pad.push(P(x * (0.62 - 0.12 * y + lobes), y * 0.5 - 0.15 + lobes * 0.5))
  }
  rc.solid(pad)
  const toes = [[-0.62, 0.62, 0.42], [-0.22, 0.98, 0.12], [0.22, 0.98, -0.12], [0.62, 0.62, -0.42]]
  const ctr = P(0, -0.1)
  for (const [x, y, tilt] of toes) {
    const pts = []
    for (let q = 0; q < 28; q++) {
      const t = (TAU * q) / 28
      const lx = 0.2 * Math.cos(t), ly = 0.27 * Math.sin(t)
      pts.push(P(x + lx * Math.cos(tilt) - ly * Math.sin(tilt), y + lx * Math.sin(tilt) + ly * Math.cos(tilt)))
    }
    rc.solid(pts)
    const T = P(x, y)
    c.seg(ctr[0], ctr[1], T[0], T[1], toeW) // a low web ties each toe to the pad
  }
}

export const DOGS_DESIGNS = [
  {
    id: 'doghounds',
    group: 'Dogs',
    name: 'Galloping Hounds',
    blurb: 'A greyhound zoetrope. A ring of running hounds, each one a frame further through the gallop: stretched out, flying, gathered under, pushing off. Press Zoetrope strobe, or match a strobing capsule, and the pack runs round the staff. Unstrobed, they blur into a racing band.',
    overrides: { strutW: 2.8, frameH: 3.5 },
    params: [
      { key: 'frames', label: 'Frames', options: ['8', '12', '16', '24'], value: '12', hint: 'Frames round the hub. 8 and 12 run a 4- or 6-step stride, 16 and 24 an 8-step one. The stride repeats at least twice per turn, so the hub stays balanced.' },
      { key: 'size', label: 'Hound length', unit: 'mm', min: 30, max: 70, step: 1, value: 39 },
      { key: 'track', label: 'Track radius', unit: '%', min: 0, max: 100, step: 1, value: 100, hint: 'Where the hounds run, from the collar (0) to the rim (100).' },
      { key: 'track2', label: 'Second track', options: ['off', 'inner ring'], value: 'off', hint: 'Adds a ring of smaller hounds nearer the staff, running the same stride.' },
    ],
    strobe: (p) => Number(p.frames),
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = [], N = Number(p.frames)
      const STEPS = N === 8 ? 4 : N === 12 ? 6 : 8
      const lw = Math.max(2.6, g.w)
      const ring = (s, rG) => {
        for (let i = 0; i < N; i++) {
          const a = g.rot + (TAU * i) / N
          // local y points out from the staff, x runs clockwise round it
          const h = a - Math.PI / 2
          const P = (x, y) => place([[-x * s, y * s]], h, ...polar(rG, a))[0]
          drawHound(rc, holes, P, s, (i % STEPS) / STEPS)
        }
        c.ring(0, 0, rG + 0.0 * s, lw) // the track under their paws
        c.ring(0, 0, rG + 0.6 * s, lw * 0.9)
      }
      const s = p.size
      const lo = g.hubR + 6, hi = g.Ri - 0.98 * s
      ring(s, lo + ((hi - lo) * p.track) / 100)
      if (p.track2 !== 'off') ring(s * 0.62, g.hubR + 4)
      drawSpokes(c, g, N, 0)
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'dogpaws',
    group: 'Dogs',
    name: 'Paw Trails',
    blurb: 'Dogs wandering out from the staff: trails of paw prints, left and right, spiralling from the collar to the rim and growing as they go. Spun, the prints smear into soft spiral arms.',
    overrides: { strutW: 2.6, frameH: 3.5 },
    params: [
      { key: 'trails', label: 'Trails', unit: '', min: 2, max: 6, step: 1, value: 3 },
      { key: 'steps', label: 'Prints per trail', unit: '', min: 4, max: 14, step: 1, value: 8 },
      { key: 'twist', label: 'Spiral', unit: '°', min: 0, max: 200, step: 5, value: 95 },
      { key: 'size0', label: 'Smallest print', unit: 'mm', min: 6, max: 16, step: 0.5, value: 11, hint: 'Toe-to-heel size near the staff; prints grow toward the rim.' },
      { key: 'size1', label: 'Biggest print', unit: 'mm', min: 10, max: 30, step: 0.5, value: 19 },
      { key: 'gait', label: 'Stride width', unit: 'mm', min: 4, max: 20, step: 0.5, value: 12, hint: 'Sideways step between left and right paws.' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), n = p.trails
      const lw = Math.max(2.6, g.w)
      const r0 = g.hubR + 14, r1 = g.Ri - p.size1 * 1.3
      const path = (a0, t) => {
        const r = r0 + (r1 - r0) * t
        return polar(r, a0 + deg(p.twist) * t)
      }
      for (let k = 0; k < n; k++) {
        const a0 = g.rot + (TAU * k) / n
        const line = []
        for (let s = 0; s <= 80; s++) line.push(path(a0, s / 80))
        c.line([polar(g.hubR - 1, a0), ...line, polar(g.Ri + 0.5, a0 + deg(p.twist))], lw) // the trail, low
        for (let i = 0; i < p.steps; i++) {
          const t = (i + 0.5) / p.steps
          const A = path(a0, t - 0.01), B = path(a0, t + 0.01), C = path(a0, t)
          const h = Math.atan2(B[1] - A[1], B[0] - A[0])
          const side = i % 2 ? 1 : -1
          const u = (p.size0 + (p.size1 - p.size0) * t) / 1.6
          const nx = -Math.sin(h), ny = Math.cos(h)
          const off = (p.gait / 2) * side * (0.6 + 0.6 * t)
          const P = [C[0] + nx * off, C[1] + ny * off]
          c.seg(C[0], C[1], P[0], P[1], lw)
          pawPrint(c, rc, P, h, u, Math.max(2.4, lw * 0.85))
        }
      }
      return { relief: { contours: rc.contours, holes: [], thicken: 0, gap: 0, slits: false } }
    },
  },
  {
    id: 'dogchase',
    group: 'Dogs',
    name: 'Tail Chase',
    blurb: 'Big dogs running flat out round the staff, bent into the circle, each one\'s nose at the next one\'s tail. Spun, it is a dog chasing its tail forever. Stride moment sets the pose: stretched out, flying or gathered under.',
    overrides: { strutW: 3, frameH: 3.5 },
    params: [
      { key: 'dogs', label: 'Dogs', unit: '', min: 2, max: 4, step: 1, value: 3 },
      { key: 'size', label: 'Dog size', unit: '%', min: 60, max: 100, step: 1, value: 92, hint: 'How much of the space between collar and rim the dogs fill.' },
      { key: 'pose', label: 'Stride moment', unit: '%', min: 0, max: 100, step: 1, value: 0, hint: '0 stretched out, 50 gathered under.' },
      { key: 'feet', label: 'Paws toward', options: ['staff', 'rim'], value: 'staff' },
    ],
    draw(c, g, p) {
      const rc = new Canvas(g.w), holes = [], n = p.dogs
      const lw = Math.max(2.6, g.w)
      const room = g.Ri - g.hubR - 6
      const s = (room / 0.98) * (p.size / 100)
      const out = p.feet === 'staff'
      const rG = out ? g.hubR + 3 : g.Ri - 3 // the paws' ground line
      const rMid = rG + (out ? 0.45 : -0.45) * s // the ring under their bellies
      for (let k = 0; k < n; k++) {
        const a0 = g.rot + (TAU * k) / n
        // bend the side view round the staff: x runs along the circle, y away from the ground
        const P = (x, y) => polar(rG + (out ? y : -y) * s, a0 + (x * s) / rMid)
        drawHound(rc, holes, P, s, p.pose / 100)
      }
      c.ring(0, 0, rMid, lw)
      drawSpokes(c, g, n * 2, 0)
      return { relief: { contours: rc.contours, holes, thicken: 0, gap: 0, slits: false } }
    },
  },
]
