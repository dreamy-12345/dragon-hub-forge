/**
 * Pine cones: scales laid on the golden angle round a body of revolution, the
 * way a real cone grows them. Each scale is a little rounded pyramid (the woody
 * tip a cone shows, with its raised centre), its free end pointing towards the
 * cone's tip; "open" lifts the ends out like a cone that has dried and opened.
 *
 * Used by the rope dart and poi heads (darts.js), the contact and acro staff ends
 * (acro.js), and three flat dragon staff hubs drawn from a cone seen from below.
 */
import { TAU, ccw, circlePts } from './geom.js'

const GOLD = Math.PI * (3 - Math.sqrt(5))

export const CONE_PARAMS = [
  { key: 'scales', label: 'Scales', unit: '', min: 30, max: 360, step: 1, value: 120, hint: 'How many scales spiral round the cone. More = smaller, finer scales.' },
  { key: 'open', label: 'Open scales', unit: '', min: 0, max: 1, step: 0.05, value: 0.3, hint: '0 = a closed green cone, smooth to the touch. 1 = a dry, open cone with the scale ends standing out (more grip, more to catch).' },
]

/** Pine cone body shapes, radius at t (0 = the cone's tip, 1 = the stem end), as a share of R. */
export const CONE_SHAPES = {
  pine: (t) => Math.max(0.12, Math.pow(Math.sin((Math.PI / 2) * Math.min(1, t / 0.68)), 0.7) * (t > 0.68 ? 1 - 0.5 * Math.pow((t - 0.68) / 0.32, 1.6) : 1)),
  fir: (t) => Math.max(0.12, Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.04)), 0.55)),
  cartoon: (t) => Math.max(0.16, Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.03)), 0.45) * (t > 0.8 ? 1 - 0.9 * (t - 0.8) : 1)),
  stone: (t) => Math.max(0.1, Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)) * (t > 0.85 ? 1 - 1.2 * (t - 0.85) : 1)),
}

/**
 * Scales over a surface of revolution about z. rAt(z) is the body radius; scales
 * cover z0..z1; dir = +1 when the cone's tip is towards +z, -1 when towards -z.
 * Returns a Manifold (the union of the scales), or null.
 */
export function coneScales(wasm, k, { rAt, z0, z1, N, open = 0.3, dir = 1, minR = 3, skip = null }) {
  const { Manifold } = wasm
  // even coverage: place scales by surface area, not by height
  const steps = 200, acc = [0]
  for (let i = 1; i <= steps; i++) {
    const za = z0 + ((z1 - z0) * (i - 1)) / steps, zb = z0 + ((z1 - z0) * i) / steps
    const ra = rAt(za), rb = rAt(zb)
    acc.push(acc[i - 1] + Math.PI * (ra + rb) * Math.hypot(zb - za, rb - ra))
  }
  const A = acc[steps]
  if (A <= 0 || N < 1) return null
  const zOf = (f) => { const tgt = f * A; let i = 1; while (i < steps && acc[i] < tgt) i++; const u = (tgt - acc[i - 1]) / Math.max(1e-9, acc[i] - acc[i - 1]); return z0 + ((z1 - z0) * (i - 1 + u)) / steps }
  const s = Math.sqrt(A / N) * 1.08
  const ball = k(Manifold.sphere(Math.max(0.5, s * 0.07), 6))
  const bits = []
  for (let i = 0; i < N; i++) {
    const z = zOf((i + 0.5) / N), r = rAt(z)
    if (r < minR) continue
    const a = i * GOLD
    if (skip && skip(a, z)) continue
    const c = Math.cos(a), sn = Math.sin(a)
    const w = Math.min(s * 1.25, (TAU * r) / 5), h = s * 1.15, th = s * 0.42
    const at = (rad, tan, dz) => [rad * c - tan * sn, rad * sn + tan * c, z + dz]
    const rUp = rAt(z + dir * h * 0.55), rDn = rAt(z - dir * h * 0.45)
    const pts = [
      at(r - th * 1.2, 0, -dir * h * 0.25), // the root, inside the body
      at(r + th * 0.35, -w / 2, 0), at(r + th * 0.35, w / 2, 0), // the two side corners
      at(Math.max(r, rUp) + th * (0.45 + 1.1 * open), 0, dir * h * (0.55 + 0.15 * open)), // the free end, towards the tip
      at(rDn + 0.1, 0, -dir * h * 0.45), // the end tucked under the scale below
      at(r + th * (0.85 + 0.6 * open), 0, dir * h * 0.05), // the raised centre
    ]
    bits.push(k(Manifold.hull(pts.map((q) => k(ball.translate(q))))))
  }
  return bits.length ? k(Manifold.union(bits)) : null
}

// ----------------------------------------------------------------- hubs --
// Three flat hubs: a cone seen from below (the scales in their spirals), a wheel
// of cones, and pine branches with cones at the rim.

const diamond = (x, y, along, across, ang) => {
  const ca = Math.cos(ang), sa = Math.sin(ang)
  return [[along, 0], [0, across], [-along, 0], [0, -across]].map(([u, v]) => [x + u * ca - v * sa, y + u * sa + v * ca])
}

function coneOutline(cx, cy, ang, L, W) {
  // a cone in side view: stem end at (cx, cy), tip along ang, widest a third of the way
  const pts = []
  const n = 28
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const r = (W / 2) * CONE_SHAPES.pine(1 - t)
    pts.push([t * L, r])
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n
    pts.push([t * L, -(W / 2) * CONE_SHAPES.pine(1 - t)])
  }
  const ca = Math.cos(ang), sa = Math.sin(ang)
  return pts.map(([u, v]) => [cx + u * ca - v * sa, cy + u * sa + v * ca])
}

function coneRelief(cx, cy, ang, L, W, count) {
  // scale diamonds over a cone's side view, in offset rows
  const out = []
  const ca = Math.cos(ang), sa = Math.sin(ang)
  const rows = Math.max(3, Math.round(count))
  for (let j = 0; j < rows; j++) {
    const t = 0.12 + (0.78 * (j + 0.5)) / rows
    const half = (W / 2) * CONE_SHAPES.pine(1 - t) * 0.82
    const per = Math.max(1, Math.round((2 * half) / (L / rows) / 1.1))
    const step = (2 * half) / per
    for (let q = 0; q < per; q++) {
      const v = -half + step * (q + 0.5) + (j % 2 ? step / 4 : -step / 4)
      if (Math.abs(v) > half - step * 0.3) continue
      const u = t * L
      const x = cx + u * ca - v * sa, y = cy + u * sa + v * ca
      const sz = Math.min(step, L / rows) * 0.42
      out.push(ccw(diamond(x, y, sz * 0.8, sz * 1.05, ang)))
    }
  }
  return out
}

export function pineHubDesigns() {
  return [
    {
      id: 'pineSpiral', group: 'PineCones', name: 'Pine Cone Spiral', added: '2026-11-22',
      blurb: 'A pine cone seen from underneath: diamond scales in the two sets of golden-angle spirals a real cone grows, small at the centre and big at the rim. Pierced right through, or raised scales on a web.',
      overrides: { strutW: 2.8, frameH: 4, reliefH: 8 },
      params: [
        { key: 'scaleN', label: 'Scales', unit: '', min: 30, max: 260, step: 1, value: 110 },
        { key: 'angle', label: 'Spiral angle', unit: '°', min: 135, max: 140, step: 0.01, value: 137.51, hint: '137.51° is the golden angle a real cone uses.' },
        { key: 'scaleSize', label: 'Scale size', unit: '%', min: 50, max: 95, step: 1, value: 78, hint: 'How much of its space each scale fills: smaller leaves wider webs between them.' },
        { key: 'style', label: 'Style', options: ['pierced scales', 'raised scales'], value: 'pierced scales' },
      ],
      draw(c, g, p) {
        const N = p.scaleN, div = (p.angle * Math.PI) / 180
        const r0 = g.hubR + 3, r1 = g.Ri - 2
        const area = Math.PI * (r1 * r1 - r0 * r0)
        const sp = Math.sqrt(area / N)
        const cells = []
        for (let i = 0; i < N; i++) {
          const f = Math.sqrt((i + 0.5) / N)
          const r = Math.sqrt(r0 * r0 + (r1 * r1 - r0 * r0) * ((i + 0.5) / N))
          const th = g.rot + i * div
          const x = r * Math.cos(th), y = r * Math.sin(th)
          const grow = 0.7 + 0.6 * f
          const along = sp * 0.5 * (p.scaleSize / 100) * grow, across = sp * 0.62 * (p.scaleSize / 100) * grow
          if (r - along < r0 || r + along > r1) continue
          cells.push({ x, y, r, th, along, across })
        }
        if (p.style === 'pierced scales') {
          return { veins: [{ region: 'disk', border: 3, round: 0.6, cells: cells.map((q) => ({ pts: ccw(diamond(q.x, q.y, q.along, q.across, q.th)), inset: 0 })) }] }
        }
        // raised: each scale linked to its nearest two, tied to the collar and the rim
        const seen = new Set()
        cells.forEach((a, i) => {
          const near = cells.map((b, j) => [j, (a.x - b.x) ** 2 + (a.y - b.y) ** 2]).filter(([j]) => j !== i).sort((u, v) => u[1] - v[1]).slice(0, 3)
          for (const [j] of near) { const key = i < j ? `${i}:${j}` : `${j}:${i}`; if (!seen.has(key)) { seen.add(key); c.seg(a.x, a.y, cells[j].x, cells[j].y) } }
          const ux = a.x / a.r, uy = a.y / a.r
          if (a.r < r0 + sp * 1.2) c.seg(a.x, a.y, ux * (g.hubR - 1), uy * (g.hubR - 1))
          if (a.r > r1 - sp * 1.2) c.seg(a.x, a.y, ux * (g.Ri + 1), uy * (g.Ri + 1))
        })
        for (const q of cells) c.solid(ccw(diamond(q.x, q.y, q.along, q.across, q.th)))
        return { relief: { contours: cells.map((q) => ccw(diamond(q.x, q.y, q.along * 0.55, q.across * 0.55, q.th))), thicken: 0, gap: 0, slits: false } }
      },
    },
    {
      id: 'pineWheel', group: 'PineCones', name: 'Pine Cone Wheel', added: '2026-11-22',
      blurb: 'A wheel of pine cones: each spoke is a cone hanging from its stem at the collar, its tip resting on the rim, every scale raised so it catches the light.',
      overrides: { strutW: 3.2, frameH: 4, reliefH: 8 },
      params: [
        { key: 'cones', label: 'Cones', unit: '', min: 3, max: 10, step: 1, value: 6 },
        { key: 'coneW', label: 'Cone width', unit: '%', min: 40, max: 100, step: 1, value: 72, hint: 'How fat each cone is, as a share of its space round the hub.' },
        { key: 'rows', label: 'Rows of scales', unit: '', min: 4, max: 14, step: 1, value: 8 },
      ],
      draw(c, g, p) {
        const n = p.cones
        const stem = g.hubR + 4, L = g.Ri - stem + 2
        const relief = []
        for (let i = 0; i < n; i++) {
          const ang = g.rot + (TAU * i) / n
          const space = (TAU * (stem + L * 0.4)) / n
          const W = Math.min(L * 0.55, space * (p.coneW / 100))
          const sx = stem * Math.cos(ang), sy = stem * Math.sin(ang)
          c.seg((g.hubR - 1) * Math.cos(ang), (g.hubR - 1) * Math.sin(ang), sx, sy) // the stem
          c.solid(ccw(coneOutline(sx, sy, ang, L, W)))
          relief.push(...coneRelief(sx, sy, ang, L, W, p.rows))
        }
        return { relief: { contours: relief, thicken: 0, gap: 0, slits: false } }
      },
    },
    {
      id: 'pineBranch', group: 'PineCones', name: 'Pine Branches', added: '2026-11-22',
      blurb: 'Pine branches for spokes, needles in pairs all along them, and a little cone hanging at the end of each one by the rim.',
      overrides: { strutW: 2.6, frameH: 4, reliefH: 7 },
      params: [
        { key: 'branches', label: 'Branches', unit: '', min: 3, max: 9, step: 1, value: 5 },
        { key: 'needles', label: 'Needle pairs', unit: '', min: 3, max: 16, step: 1, value: 9 },
        { key: 'needleL', label: 'Needle length', unit: 'mm', min: 6, max: 30, step: 0.5, value: 15 },
        { key: 'bend', label: 'Branch curve', unit: '°', min: -40, max: 40, step: 1, value: 18 },
      ],
      draw(c, g, p) {
        const n = p.branches, relief = []
        for (let i = 0; i < n; i++) {
          const a0 = g.rot + (TAU * i) / n
          // the branch: a gentle curve from the collar to just short of the rim
          const pts = []
          const rA = g.hubR - 1, rB = g.Ri - (g.Ri - g.hubR) * 0.3
          for (let s = 0; s <= 24; s++) {
            const t = s / 24, r = rA + (rB - rA) * t, a = a0 + ((p.bend * Math.PI) / 180) * t * t
            pts.push([r * Math.cos(a), r * Math.sin(a)])
          }
          c.taper(pts, g.w * 1.9, g.w * 1.1)
          // needles in pairs along it, swept forwards
          for (let j = 1; j <= p.needles; j++) {
            const t = 0.12 + (0.8 * j) / (p.needles + 1)
            const idx = Math.min(23, Math.floor(t * 24)), [x, y] = pts[idx], [x2, y2] = pts[idx + 1]
            const h = Math.atan2(y2 - y, x2 - x)
            for (const sgn of [1, -1]) {
              const na = h + sgn * 0.75, len = p.needleL * (0.7 + 0.3 * Math.sin(Math.PI * t))
              c.seg(x, y, x + len * Math.cos(na), y + len * Math.sin(na), g.w * 0.7, g.w * 0.45)
            }
          }
          // the cone: hangs from the branch end to the rim
          const [ex, ey] = pts[24]
          const ang = Math.atan2(ey, ex)
          const L = g.Ri - Math.hypot(ex, ey) + 2
          const W = Math.min(L * 0.62, 30)
          c.solid(ccw(coneOutline(ex, ey, ang, L, W)))
          relief.push(...coneRelief(ex, ey, ang, L, W, Math.max(4, Math.round(L / 6))))
        }
        // tie every needle tip to the frame: a thin ring web just inside the rim
        c.ring(0, 0, g.Ri - 1, g.w * 0.8)
        return { relief: { contours: relief, thicken: 0, gap: 0, slits: false } }
      },
    },
  ]
}
void circlePts
