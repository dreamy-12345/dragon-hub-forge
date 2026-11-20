/**
 * Fun contact staff ends: shapes that push onto the end of the staff instead
 * of a ball. One TPU part each, printed standing on its socket (socket down),
 * with crush ribs inside the socket. Every edge is rounded: they hit bodies.
 * Units mm, the pole runs along z, the socket opens at z = 0.
 */

export const NOVELTY_PARAMS = [
  { key: 'size', label: 'Size', unit: '%', min: 60, max: 150, step: 1, value: 100 },
  { key: 'depth', label: 'Socket depth', unit: 'mm', min: 20, max: 60, step: 1, value: 35, hint: 'How far the pole goes in.' },
  { key: 'balance', label: 'Balance', options: ['steel shot low down', 'as printed'], value: 'steel shot low down', hint: 'Steel shot low down: the top is hollow and there are sealed chambers near the pole tip. Pause the print where it says, pour steel shot into the chambers, and carry on. The weight then sits on the pole tip instead of out at the end, so it rolls and spins true. (Mace, heart and cheeky.)' },
]

const RIB = 0.55

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

function centroid({ positions: P, indices: I }) {
  let V = 0, cx = 0, cy = 0, cz = 0
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, d = I[t + 2] * 3
    const v = (P[a] * (P[b + 1] * P[d + 2] - P[b + 2] * P[d + 1]) - P[a + 1] * (P[b] * P[d + 2] - P[b + 2] * P[d]) + P[a + 2] * (P[b] * P[d + 1] - P[b + 1] * P[d])) / 6
    V += v; cx += (v * (P[a] + P[b] + P[d])) / 4; cy += (v * (P[a + 1] + P[b + 1] + P[d + 1])) / 4; cz += (v * (P[a + 2] + P[b + 2] + P[d + 2])) / 4
  }
  return { V, x: cx / V, y: cy / V, z: cz / V }
}

export function buildNovelty(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const s = p.size / 100
    const kind = opts.kind
    const boreR = (p.poleOD + p.fit) / 2
    const cR = boreR + 3.5 // socket collar
    const z0 = p.depth + 4 // the shape starts on top of the socket
    const sph = (r, x, y, z, n = 48) => k(k(Manifold.sphere(r, n)).translate([x, y, z]))
    const hull = (list) => k(Manifold.hull(list))
    // a flat outline drawn in (x, height), made T thick, standing up, edges rounded
    const plate = (polys, T, round = 2.5) => {
      let c = k(new CrossSection(polys, 'Positive'))
      c = k(k(c.offset(round, 'Round', 2, 16)).offset(-2 * round, 'Round', 2, 16))
      c = k(c.offset(round, 'Round', 2, 16))
      return k(k(k(c.extrude(T)).translate([0, 0, -T / 2])).rotate([90, 0, 0]))
    }
    const rect = (x0, z_0, x1, z1) => [[x0, z_0], [x1, z_0], [x1, z1], [x0, z1]]
    const parts = [k(Manifold.cylinder(z0 + 2, cR, cR, 64))]
    const chambers = [], hollows = [] // steel shot goes in the chambers; hollows stay empty
    let blurbName = kind

    if (kind === 'trident') {
      const T = 14 * s, w = 12 * s
      const top = z0 + 40 * s, bar = top + 12 * s
      const polys = [rect(-w / 2, z0 - 4, w / 2, top + 2), rect(-36 * s, top, 36 * s, bar)]
      for (const [x, L] of [[-30 * s, 42 * s], [0, 58 * s], [30 * s, 42 * s]]) {
        const tipZ = bar + L
        polys.push(rect(x - 5 * s, bar - 1, x + 5 * s, tipZ - 14 * s))
        // a fat arrow head with blunt barbs
        polys.push([[x - 11 * s, tipZ - 20 * s], [x + 11 * s, tipZ - 20 * s], [x + 3 * s, tipZ], [x - 3 * s, tipZ]])
      }
      parts.push(plate(polys, T, 2.4))
    } else if (kind === 'heart') {
      // two lobes and a point, rounded, a little flattened front to back
      const r = 27 * s, lz = z0 + 58 * s
      const L = sph(r, -17 * s, 0, lz), R = sph(r, 17 * s, 0, lz), tip = sph(7 * s, 0, 0, z0 + 4 * s)
      let h = k(Manifold.union([hull([L, tip]), hull([R, tip])]))
      h = k(h.scale([1, 0.62, 1]))
      parts.push(h)
      // hollow lobes; a shot chamber down in the point, right on top of the pole
      hollows.push(k(k(Manifold.union([sph(r - 4, -17 * s, 0, lz, 32), sph(r - 4, 17 * s, 0, lz, 32)])).scale([1, 0.5, 1])))
      chambers.push(k(k(Manifold.cylinder(22 * s, 4 * s, 13 * s, 32)).translate([0, 0, z0 + 3])))
    } else if (kind === 'mace') {
      const r = 30 * s, cz = z0 + r - 2
      parts.push(sph(r, 0, 0, cz, 64))
      // the ball is hollow: a shot chamber in its lower half keeps the weight near the pole tip
      chambers.push(k(sph(r - 4, 0, 0, cz, 40).intersect(k(k(Manifold.cube([3 * r, 3 * r, r], true)).translate([0, 0, cz - r / 2 + 1])))))
      hollows.push(k(sph(r - 4, 0, 0, cz, 40).intersect(k(k(Manifold.cube([3 * r, 3 * r, r], true)).translate([0, 0, cz + r / 2 + 1])))))
      const g = (1 + Math.sqrt(5)) / 2
      const dirs = [[-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1]]
        .map((v) => { const l = Math.hypot(...v); return v.map((x) => x / l) })
      for (const d of dirs) {
        if (d[2] < -0.6) continue // nothing pointing into the socket
        const base = k(k(Manifold.cylinder(1, 9 * s, 9 * s, 24)).translate([0, 0, -0.5]))
        // a cone from inside the ball out, with a soft round tip
        const tipP = d.map((x) => x * (r + 18 * s))
        const baseP = d.map((x) => x * (r - 4))
        const ax = [d[0], d[1], d[2]]
        const pitch = (Math.acos(ax[2]) * 180) / Math.PI, yaw = (Math.atan2(ax[1], ax[0]) * 180) / Math.PI
        const disc = k(k(k(base.rotate([0, pitch, 0])).rotate([0, 0, yaw])).translate(baseP))
        parts.push(k(hull([disc, sph(3 * s, ...tipP, 16)]).translate([0, 0, cz])))
      }
    } else if (kind === 'axe') {
      const T = 13 * s, hw = 9 * s
      const polys = [rect(-hw, z0 - 4, hw, z0 + 118 * s)]
      // a bearded blade: the lower edge climbs at 45° so it prints without supports
      const e = 58 * s
      const blade = [[hw - 1, z0 + 40 * s], [e, z0 + 40 * s + (e - hw)]]
      for (let i = 1; i <= 12; i++) { const a = -0.55 + (1.1 * i) / 12; blade.push([e + 10 * s * Math.cos(a * 1.4) - 10 * s, z0 + 98 * s + 40 * s * Math.sin(a)]) }
      blade.push([hw - 1, z0 + 112 * s])
      polys.push(blade)
      // a small back spike
      polys.push([[-hw + 1, z0 + 82 * s], [-30 * s, z0 + 100 * s], [-hw + 1, z0 + 104 * s]])
      parts.push(plate(polys, T, 3))
      // the blade edge is round and thick: it's TPU and it hits people
    } else if (kind === 'cheeky') {
      const r = 16 * s
      const shaftTop = z0 + 70 * s
      parts.push(k(Manifold.cylinder(shaftTop, Math.max(r, cR + 1.5), r, 64)))
      parts.push(k(k(sph(r * 1.12, 0, 0, 0, 48).scale([1, 1, 1.25])).translate([0, 0, shaftTop + 4 * s])))
      parts.push(k(k(k(k(CrossSection.circle(2.6 * s, 16)).translate([r * 1.05, 0])).revolve(64)).translate([0, 0, shaftTop - 2 * s])))
      const br = 17 * s
      for (const x of [-1, 1]) parts.push(sph(br, x * (r + br * 0.55), 0, br, 40))
      blurbName = 'cheeky'
      // hollow shaft and head, shot chambers in the balls: weight down on the pole tip, even both sides
      chambers.push(...[-1, 1].map((x) => sph(br - 3.2, x * (r + br * 0.55), 0, br, 32)))
      hollows.push(k(k(Manifold.cylinder(shaftTop - z0 - 4, r - 3.2, r - 3.2, 48)).translate([0, 0, z0 + 4])), k(k(sph((r * 1.12 - 3.2), 0, 0, 0, 32).scale([1, 1, 1.25])).translate([0, 0, shaftTop + 4 * s])))
    }

    // centre the shape's weight over the pole (the axe's blade is one-sided): move it, not the socket
    {
      const shape = k(Manifold.union(parts.slice(1)))
      const P = meshData(shape), c = centroid(P)
      if (Math.hypot(c.x, c.y) > 0.2) {
        const sh = [-c.x, -c.y, 0]
        for (let i = 1; i < parts.length; i++) parts[i] = k(parts[i].translate(sh))
        for (let i = 0; i < chambers.length; i++) chambers[i] = k(chambers[i].translate(sh))
        for (let i = 0; i < hollows.length; i++) hollows[i] = k(hollows[i].translate(sh))
      }
    }
    let m = k(Manifold.union(parts))
    const shot = p.balance !== 'as printed' && chambers.length
    let chamber = null, pauseAt = 0
    if (shot) {
      chamber = k(Manifold.union(chambers))
      m = k(m.subtract(k(Manifold.union([chamber, ...hollows]))))
      pauseAt = chamber.boundingBox().max[2] - 0.3
    }
    // anything under the bed goes (the balls on the cheeky one, the heart tip)
    m = k(m.trimByPlane([0, 0, 1], 0))
    // socket with crush ribs
    let bore = k(k(Manifold.cylinder(p.depth + 1, boreR, boreR, 64)).translate([0, 0, -1]))
    const ribs = []
    for (let i = 0; i < (p.ribs || 6); i++) ribs.push(k(k(k(Manifold.cube([RIB * 2, 2.2, p.depth + 2], true)).translate([boreR, 0, p.depth / 2])).rotate([0, 0, (360 * i) / (p.ribs || 6)])))
    bore = k(bore.subtract(k(Manifold.union(ribs))))
    m = k(m.subtract(bore))
    // the view: the pole runs up into it from below
    const box = m.boundingBox()
    const dens = opts.density || 1.21
    const g = (m.volume() / 1000) * dens
    // balance: centre of mass of the print plus any steel shot, against the pole axis and the pole tip
    const cm = centroid
    const body = cm(meshData(m))
    const shotC = chamber ? cm(meshData(chamber)) : null
    const gShot = shotC ? (shotC.V / 1000) * 4.6 : 0
    const tot = g + gShot
    const com = shotC ? ['x', 'y', 'z'].map((q) => (body[q] * g + shotC[q] * gShot) / tot) : [body.x, body.y, body.z]
    const meshes = { combined: meshData(m) }
    const R = Math.max(...box.max.map(Math.abs), ...box.min.map(Math.abs))
    return {
      novelty: { kind: blurbName, height: box.max[2], width: box.max[0] - box.min[0], squeeze: p.poleOD - 2 * (boreR - RIB) },
      meshes,
      viewR: Math.max(140, R * 1.05),
      polygons: { base: [k(CrossSection.circle(Math.max(box.max[0], box.max[1]), 64)).toPolygons()[0]], relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: g, gramsTotal: tot, gShot, pauseAt, comOff: Math.hypot(com[0], com[1]), comAbove: com[2] - p.depth, comPrinted: body.z - p.depth, warns: [], height: box.max[2] },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function noveltyDesigns() {
  const d = (id, name, kind, blurb) => ({
    id, name, group: 'Contact', blurb, novelty: true, kind, added: '2026-11-20',
    params: NOVELTY_PARAMS.map((x) => ({ ...x })),
    draw: () => {},
  })
  return [
    d('endTrident', 'Trident End', 'trident', 'A sea-god trident for the end of your contact staff: three prongs with fat, blunt barbs, all edges rounded. Prints standing on its socket in TPU.'),
    d('endHeart', 'Big Heart End', 'heart', 'A big chunky heart on the end of the staff. Soft TPU, prints standing on its point, no supports.'),
    d('endMace', 'Mace End', 'mace', 'A medieval mace head with soft, round-tipped spikes: looks fierce, bounces off you in TPU.'),
    d('endAxe', 'Axe End', 'axe', 'A bearded battle-axe head with a back spike. The blade is thick and round-edged (it is a toy), and its lower edge climbs at 45° so it prints without supports.'),
    d('endCheeky', 'Cheeky End', 'cheeky', 'For the cheeky ones: an unmistakable rude shape for the end of your contact staff, all soft rounded TPU. Adult humour.'),
  ]
}
