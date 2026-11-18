/**
 * 2D drawing helpers shared by the designs: a contour collector (Canvas),
 * shapes (heart, wing, logo dragonfly), a seeded RNG and a Voronoi.
 * Pure JS, no wasm: designs produce plain point lists and hub.js does the CSG.
 * Units mm, +y up.
 */

import { DRAGONFLY } from './dragonfly.js'

export const TAU = Math.PI * 2

export function signedArea(pts) {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
  return a / 2
}
export const ccw = (pts) => (signedArea(pts) < 0 ? pts.slice().reverse() : pts)
export const cw = (pts) => (signedArea(pts) > 0 ? pts.slice().reverse() : pts)
export const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
export const place = (pts, a, ox, oy) => pts.map((p) => { const q = rot(p, a); return [q[0] + ox, q[1] + oy] })

export function circlePts(cx, cy, r, n) {
  n = n || Math.max(12, Math.min(160, Math.ceil(r * 1.6)))
  const pts = []
  for (let i = 0; i < n; i++) pts.push([cx + r * Math.cos((TAU * i) / n), cy + r * Math.sin((TAU * i) / n)])
  return pts
}

/** Collects stroke contours; everything is unioned later with the Positive fill rule. */
export class Canvas {
  constructor(w) {
    this.w = w
    this.contours = []
  }
  disc(x, y, r) {
    if (r > 0) this.contours.push(ccw(circlePts(x, y, r)))
  }
  seg(x1, y1, x2, y2, w = this.w, w2 = w) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy)
    if (L < 1e-6) return
    const ux = -dy / L, uy = dx / L
    this.contours.push(ccw([
      [x1 + (ux * w) / 2, y1 + (uy * w) / 2], [x2 + (ux * w2) / 2, y2 + (uy * w2) / 2],
      [x2 - (ux * w2) / 2, y2 - (uy * w2) / 2], [x1 - (ux * w) / 2, y1 - (uy * w) / 2],
    ]))
  }
  /** Polyline with round joints. */
  line(pts, w = this.w, closed = false) {
    this.taper(pts, w, w)
    if (closed) this.seg(pts.at(-1)[0], pts.at(-1)[1], pts[0][0], pts[0][1], w)
  }
  /** Polyline whose width runs from w0 to w1 along its length: vines, veins. */
  taper(pts, w0, w1) {
    const n = pts.length - 1
    const wAt = (i) => w0 + ((w1 - w0) * i) / Math.max(1, n)
    for (let i = 0; i < n; i++) this.seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], wAt(i), wAt(i + 1))
    pts.forEach((p, i) => this.disc(p[0], p[1], wAt(i) / 2))
  }
  /** Stroked circle: outer CCW + inner CW is an annulus under Positive. */
  ring(cx, cy, r, w = this.w) {
    this.contours.push(ccw(circlePts(cx, cy, r + w / 2)))
    if (r - w / 2 > 0) this.contours.push(cw(circlePts(cx, cy, r - w / 2)))
  }
  solid(pts) {
    this.contours.push(ccw(pts))
  }
}

// --------------------------------------------------------------- random ----
export function rng(seed) {
  let a = (seed * 2654435761) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// -------------------------------------------------------------- voronoi ----
// Half-plane clipping: O(n²) but n stays in the low hundreds here.
function clipHalf(poly, ax, ay, nx, ny) {
  // keep points where (p - a)·n <= 0
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length]
    const dp = (P[0] - ax) * nx + (P[1] - ay) * ny
    const dq = (Q[0] - ax) * nx + (Q[1] - ay) * ny
    if (dp <= 0) out.push(P)
    if (dp * dq < 0) {
      const t = dp / (dp - dq)
      out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t])
    }
  }
  return out
}

/** Voronoi cells of `sites` inside a circle of radius `bound`. */
export function voronoi(sites, bound) {
  const box = circlePts(0, 0, bound, 72)
  return sites.map((s, i) => {
    let poly = box
    for (let j = 0; j < sites.length && poly.length; j++) {
      if (j === i) continue
      const t = sites[j]
      poly = clipHalf(poly, (s[0] + t[0]) / 2, (s[1] + t[1]) / 2, t[0] - s[0], t[1] - s[1])
    }
    return poly
  })
}

export function pointInPoly([x, y], poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// --------------------------------------------------------------- shapes ----

/**
 * Classic heart curve, normalised: point at (0,0), top of the lobes at y=1.
 * Also returns `wide`, the y of its widest line (where a capsule goes across).
 */
export const HEART = (() => {
  const raw = []
  for (let i = 0; i < 160; i++) {
    const t = (TAU * i) / 160
    raw.push([16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)])
  }
  const ys = raw.map((p) => p[1])
  const y0 = Math.min(...ys), h = Math.max(...ys) - y0
  const pts = raw.map(([x, y]) => [x / h, (y - y0) / h])
  let wide = 0.5, best = 0
  for (let y = 0.3; y < 0.9; y += 0.01) {
    const xs = []
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [x1, y1] = pts[j], [x2, y2] = pts[i]
      if ((y1 - y) * (y2 - y) < 0) xs.push(x1 + ((x2 - x1) * (y - y1)) / (y2 - y1))
    }
    const w = xs.length ? Math.max(...xs) - Math.min(...xs) : 0
    if (w > best) (best = w), (wide = y)
  }
  return { pts, wide, width: best, aspect: (Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]))) }
})()

/**
 * A dragonfly wing, root at the origin, pointing along +x. The leading edge
 * (+y) is straighter than the trailing edge, like the real thing.
 */
export function wingPoly(L, W, n = 28) {
  const top = [], bot = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    top.push([L * t, W * 0.36 * Math.sin(Math.PI * t ** 0.85)])
    bot.push([L * t, -W * 0.64 * Math.sin(Math.PI * t ** 0.6)])
  }
  return ccw([...top, ...bot.reverse().slice(1, -1)])
}

/**
 * The dream.sc logo dragonfly, scaled to half-wingspan `s`, head along +y
 * before rotation. `flap` (radians) foreshortens the wings as seen from above:
 * fore and hind wings beat a quarter cycle apart, as dragonflies do.
 */
export function logoDragonfly(s, angle, ox, oy, { trails = false, flap = null } = {}) {
  const out = []
  const xf = (p, f) => [p[0] * f, p[1]]
  for (const w of DRAGONFLY.wings) {
    let f = 1
    if (flap !== null) {
      const fore = w.reduce((a, p) => a + p[1], 0) / w.length > 0
      f = 0.3 + 0.7 * Math.abs(Math.cos(flap + (fore ? 0 : Math.PI / 2)))
    }
    out.push(ccw(place(w.map((p) => xf(p, f)).map(([x, y]) => [x * s, y * s]), angle, ox, oy)))
  }
  for (const k of trails ? ['body', 'tail', 'trails'] : ['body', 'tail'])
    for (const p of DRAGONFLY[k]) out.push(ccw(place(p.map(([x, y]) => [x * s, y * s]), angle, ox, oy)))
  // neck: the logo's head floats just above the thorax
  const nw = 0.035
  out.push(ccw(place([[-nw, 0.05], [nw, 0.05], [nw, 0.2], [-nw, 0.2]].map(([x, y]) => [x * s, y * s]), angle, ox, oy)))
  return out
}

/** Rectangle of the capsule seen from above, centred on (x,y), long axis at `angle`. */
export function capsuleRect(x, y, angle, L, D) {
  return place([[-L / 2, -D / 2], [L / 2, -D / 2], [L / 2, D / 2], [-L / 2, D / 2]], angle, x, y)
}
