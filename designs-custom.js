// "My creation": a shape someone drew or uploaded on the Create page, fitted
// round the staff by the forge. The shape lives in the params (p.shape: loops
// in a unit box, outer loops CCW, holes CW, +y = up = towards the rim), so it
// saves, reloads and builds in the worker like any other setting.
import { Canvas, TAU, signedArea } from './geom.js'

// shown until someone makes their own: a five-point star
export const STAR = [(() => {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (TAU * i) / 10, r = i % 2 ? 0.2 : 0.5
    pts.push([r * Math.cos(a), r * Math.sin(a)])
  }
  return pts
})()]

const LEVELS = ['raised', 'flat', 'outline', 'outline on flat']

function bbox(loops) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const l of loops) for (const [x, y] of l) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }
}

/** Area-weighted centroid of loops (holes count negative). */
function centroid(loops) {
  let A = 0, cx = 0, cy = 0
  for (const l of loops) {
    for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
      const c = l[j][0] * l[i][1] - l[i][0] * l[j][1]
      A += c; cx += (l[j][0] + l[i][0]) * c; cy += (l[j][1] + l[i][1]) * c
    }
  }
  A /= 2
  return Math.abs(A) < 1e-9 ? { A: 0, x: 0, y: 0 } : { A, x: cx / (6 * A), y: cy / (6 * A) }
}

export const CUSTOM_DESIGNS = [
  {
    id: 'custom',
    name: 'My creation',
    group: 'Creations',
    custom: true,
    blurb: 'Your own picture or drawing, fitted round the staff by the forge. Press Create to change it.',
    overrides: { strutW: 3.2, frameH: 4 },
    params: [
      { key: 'copies', label: 'Copies round the staff', unit: '', min: 1, max: 12, step: 1, value: 6, hint: '2 or more spin balanced on their own.' },
      { key: 'size', label: 'Size', unit: '%', min: 30, max: 100, step: 1, value: 92 },
      { key: 'turn', label: 'Turn', unit: '°', min: -180, max: 180, step: 1, value: 0 },
      { key: 'push', label: 'In or out', unit: '%', min: -100, max: 100, step: 1, value: 0, hint: 'Slide it towards the staff (−) or the rim (+).' },
      { key: 'level', label: 'Prints as', options: LEVELS, value: 'raised', hint: 'Raised: tall in colour B. Flat: low in colour A. Outline: just its edge, raised.' },
      { key: 'mirror', label: 'Flip every other copy', options: ['off', 'on'], value: 'off' },
      { key: 'lineW', label: 'Outline width', unit: 'mm', min: 2, max: 8, step: 0.1, value: 3.2 },
      { key: 'cw', label: 'Counterweight', unit: '%', min: 0, max: 250, step: 1, value: 100, balance: true, hint: 'Only with 1 copy: a disc opposite your shape so the hub spins true.' },
    ],
    draw(c, g, p) {
      const loops0 = Array.isArray(p.shape) && p.shape.length ? p.shape : STAR
      const fixes = []
      const N = Math.max(1, Math.round(p.copies))
      // turn the picture first, then measure it
      const t = (p.turn * Math.PI) / 180, ct = Math.cos(t), st = Math.sin(t)
      const turned = loops0.map((l) => l.map(([x, y]) => [x * ct - y * st, x * st + y * ct]))
      const b = bbox(turned)
      const cx0 = (b.x0 + b.x1) / 2, cy0 = (b.y0 + b.y1) / 2
      // the band between collar and rim, with a little air at both ends
      const rIn = g.hubR + 2, rOut = g.Ri - 2, band = rOut - rIn
      const rMid = (rIn + rOut) / 2
      const tang = N > 1 ? 2 * rMid * Math.sin(Math.PI / N) * 0.92 : band * 1.6
      const s = Math.min(band / Math.max(b.h, 1e-6), tang / Math.max(b.w, 1e-6)) * (p.size / 100)
      const hS = b.h * s
      const rc = rMid + ((p.push / 100) * Math.max(0, band - hS)) / 2
      fixes.push(`fitted it between the collar and the rim (${Math.round(Math.max(b.w, b.h) * s)} mm across)`)

      // picture (x right, y up) -> hub: y runs outward along u, x along -t (no mirror)
      const place = (loops, a, flip) => {
        const ux = Math.cos(a), uy = Math.sin(a)
        return loops.map((l) => {
          const q = l.map(([x, y]) => {
            const X = (flip ? -(x - cx0) : x - cx0) * s, Y = (y - cy0) * s
            return [rc * ux + Y * ux + X * uy, rc * uy + Y * uy - X * ux]
          })
          return flip ? q.reverse() : q
        })
      }
      let placed = []
      for (let i = 0; i < N; i++) placed.push(...place(turned, g.rot + (TAU * i) / N, p.mirror === 'on' && i % 2 === 1))
      if (N > 1) fixes.push(`repeated it ${N}× round the staff, so it spins balanced`)

      // one copy: a disc of matching mass opposite, so it still spins true
      if (N === 1 && p.cw > 0) {
        const cen = centroid(place(turned, g.rot, false))
        const area = Math.abs(cen.A), r = Math.hypot(cen.x, cen.y)
        if (area > 1 && r > 1) {
          const k = p.cw / 100
          const R = Math.min(Math.sqrt((area * k) / Math.PI), band / 2 - 1)
          const rr = Math.min(rOut - R, Math.max(rIn + R, (r * area * k) / (Math.PI * R * R)))
          const a = Math.atan2(cen.y, cen.x) + Math.PI
          const disc = []
          for (let i = 0; i < 64; i++) disc.push([rr * Math.cos(a) + R * Math.cos((TAU * i) / 64), rr * Math.sin(a) + R * Math.sin((TAU * i) / 64)])
          placed.push(disc)
          fixes.push('added a counterweight opposite, so one copy still spins true')
        }
      }

      // floating pieces: tie each to the collar and the rim with low struts
      let joined = 0
      for (const l of placed) {
        if (signedArea(l) <= 0) continue // holes ride on their outline
        let inP = l[0], outP = l[0], inR = Infinity, outR = -Infinity
        for (const q of l) {
          const r = Math.hypot(q[0], q[1])
          if (r < inR) (inR = r), (inP = q)
          if (r > outR) (outR = r), (outP = q)
        }
        let did = false
        if (inR > g.hubR - 0.5) {
          const a = Math.atan2(inP[1], inP[0]), r1 = g.hubR - 1
          c.seg(inP[0] + Math.cos(a) * 1.5, inP[1] + Math.sin(a) * 1.5, r1 * Math.cos(a), r1 * Math.sin(a))
          did = true
        }
        if (outR < g.Ri + 0.5) {
          const a = Math.atan2(outP[1], outP[0]), r1 = g.Ri + 1
          c.seg(outP[0] - Math.cos(a) * 1.5, outP[1] - Math.sin(a) * 1.5, r1 * Math.cos(a), r1 * Math.sin(a))
          did = true
        }
        if (did) joined++
      }
      if (joined) fixes.push(`joined ${joined} floating piece${joined > 1 ? 's' : ''} to the collar and rim with low struts`)

      const fix = { minW: Math.max(2.4, g.w * 0.75), minArea: 6 }
      const out = { fixes, frameFix: fix, copies: N }
      const outline = () => {
        const rc2 = new Canvas(p.lineW)
        for (const l of placed) rc2.line(l, p.lineW, true)
        return rc2.contours
      }
      if (p.level === 'flat') c.contours.push(...placed)
      else if (p.level === 'outline') out.relief = { contours: outline(), thicken: 0, gap: 0, fix }
      else if (p.level === 'outline on flat') {
        c.contours.push(...placed)
        out.relief = { contours: outline(), thicken: 0, gap: 0, fix }
      } else out.relief = { contours: placed, thicken: 0, gap: 0, fix }
      return out
    },
  },
]
