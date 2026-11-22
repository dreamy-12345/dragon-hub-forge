/**
 * Contact staff ball ends: a ball that pushes onto the end of the staff.
 * Printed in three flat parts so nothing needs supports: the lower half
 * (with the pole socket, crush ribs inside), the upper half, and a joiner
 * ring that presses into both. Inside is a sealed chamber: leave it hollow
 * or pour in sand or steel shot before closing, to set the weight.
 * Units mm, the staff runs along z, the ball sits on top of the pole.
 */
import { TAU } from './geom.js'

export const BALL_PARAMS = [
  { key: 'ballD', label: 'Ball size', unit: 'mm', min: 50, max: 130, step: 1, value: 85, presets: [70, 85, 100], hint: 'Diameter. Bigger rolls slower and steadier.' },
  { key: 'wall', label: 'Wall', unit: 'mm', min: 2, max: 10, step: 0.1, value: 3.6, hint: 'Thicker = heavier and tougher. TPU at 3–4 mm takes a hard drop.' },
  { key: 'depth', label: 'Socket depth', unit: 'mm', min: 20, max: 70, step: 1, value: 38, hint: 'How far the pole goes in. Deeper holds better; it stops just short of the centre.' },
  { key: 'fill', label: 'Inside', options: ['hollow', 'sand', 'steel shot', 'heaviest: packed steel shot'], value: 'hollow', hint: 'Pour sand or steel shot into the lower half before you press the halves together. Heaviest: pack the chamber right up with steel shot (tap it down as you fill), with thick walls and a big ball. Steel shot, not lead: lead is toxic to handle.' },
  { key: 'fillPct', label: 'How full', unit: '%', min: 0, max: 100, step: 5, value: 40 },
]

const RIB = 0.55

export function buildBallEnd(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const R = p.ballD / 2, ri = R - p.wall
    const boreR = (p.poleOD + p.fit) / 2
    const tubeR = boreR + 3
    const warns = []
    if (tubeR > ri - 4) warns.push(`The ball is too small for a Ø${p.poleOD} pole: make it at least ${Math.ceil(2 * (tubeR + p.wall + 6))} mm.`)
    const depth = Math.min(p.depth, R - 4)
    if (depth < p.depth) warns.push(`Socket depth is held to ${depth.toFixed(0)} mm so it stops short of the centre.`)
    const style = opts.style || 'smooth'

    // outer surface with its pattern (the same solid the silicone moulds are made round)
    let solid = k(ballMaster(wasm, k, R, style, p).subtract(k(Manifold.sphere(ri, 96))))
    // socket tube from the bottom of the ball up to the equator (prints standing on the bed)
    solid = k(solid.add(k(k(Manifold.cylinder(R, tubeR, tubeR, 64)).translate([0, 0, -R]))))
    // bore with crush ribs, open at the bottom, closed with a cap at depth
    let bore = k(k(Manifold.cylinder(depth + 1, boreR, boreR, 64)).translate([0, 0, -R - 1]))
    if (p.ribs > 0) {
      const ribs = []
      for (let i = 0; i < p.ribs; i++) {
        const a = (360 * i) / p.ribs
        ribs.push(k(k(k(Manifold.cube([RIB * 2, 2.2, depth + 2], true)).translate([boreR, 0, -R + depth / 2])).rotate([0, 0, a])))
      }
      bore = k(bore.subtract(k(Manifold.union(ribs))))
    }
    solid = k(solid.subtract(bore))
    // the tube stays open above its cap so the chamber is one space
    const capT = 3
    solid = k(solid.subtract(k(k(Manifold.cylinder(R - depth - capT, boreR, boreR, 48)).translate([0, 0, -R + depth + capT]))))


    // split at the equator; a joiner ring presses into both halves
    const big = R * 3
    const lower = k(solid.trimByPlane([0, 0, -1], 0))
    const upper = k(solid.trimByPlane([0, 0, 1], 0))
    const jh = Math.min(16, R * 0.4), jOut = ri - 0.12, jIn = Math.max(tubeR + 1.5, ri - 2.4)
    let joiner = k(k(k(Manifold.cylinder(jh, jOut, jOut, 128)).subtract(k(k(Manifold.cylinder(jh + 2, jIn, jIn, 128)).translate([0, 0, -1])))).translate([0, 0, -jh / 2]))
    // the inner wall curves in above and below the equator: trim the joiner to it, minus the press fit
    joiner = k(joiner.intersect(k(Manifold.sphere(ri + 0.15, 128))))
    void big

    const meshData = (m) => {
      const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
      const positions = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
      return { positions, indices: Uint32Array.from(mesh.triVerts) }
    }
    // in the view: the ball sits on the staff end (pole runs along z), shown whole
    const shown = k(Manifold.union([lower, upper, joiner]))
    const meshes = {
      combined: meshData(shown),
      lowerFlat: meshData(k(k(lower.rotate([180, 0, 0])).translate([0, 0, 0]))), // equator down, socket up
      upperFlat: meshData(upper), // equator down
      joinerFlat: meshData(k(joiner.translate([0, 0, jh / 2]))),
    }
    const density = opts.density || 1.21
    const gShell = ((lower.volume() + upper.volume() + joiner.volume()) / 1000) * density
    const cavity = (4 / 3) * Math.PI * ri ** 3 - Math.PI * tubeR ** 2 * R - joiner.volume()
    const heaviest = p.fill.startsWith('heaviest')
    const fillDens = p.fill === 'sand' ? 1.6 : p.fill === 'steel shot' || heaviest ? 4.6 : 0
    const gFill = ((cavity * (heaviest ? 100 : p.fillPct)) / 100 / 1000) * fillDens
    const fullShot = (cavity / 1000) * 4.6
    const squeeze = p.poleOD - 2 * (boreR - (p.ribs > 0 ? RIB : 0))
    return {
      ball: { R, depth, style, squeeze, cavityCm3: cavity / 1000, fullShot, gFill, fill: p.fill, jh, eye: style.startsWith('eye-') ? (() => {
        const ri = R * (p.iris ?? 45) / 100, rp = ri * (p.pupil ?? 42) / 100, kind = style.slice(4)
        const z = (r) => Math.sqrt(Math.max(0, R * R - r * r))
        const pr = kind === 'dragon' ? ri * 0.85 : kind === 'cat' ? ri * 0.85 : kind === 'nazar' ? ri * 0.42 : kind === 'googly' ? ri * 0.38 + Math.max(4, rp) : rp
        return { kind, irisZ: z(kind === 'nazar' ? ri * 0.66 : ri), pupilZ: z(pr) }
      })() : null },
      meshes,
      viewR: R * 1.15,
      polygons: { base: k(CrossSection.circle(R, 96)).toPolygons(), relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: gShell, gramsTotal: gShell + gFill, gShell, gFill, warns, height: 2 * R },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

/** The ball's outer solid with its surface pattern, centred on the origin, the socket neck at the bottom. */
export function ballMaster(wasm, k, R, style, p) {
  const { CrossSection, Manifold } = wasm
  let solid = k(Manifold.sphere(R, style === 'faceted' ? 14 : 128))
  if (style === 'dimpled') {
    const n = p.dimples || 70, dr = R * 0.12
    const cuts = []
    for (let i = 0; i < n; i++) {
      const z = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - z * z), a = i * Math.PI * (3 - Math.sqrt(5))
      if (z < -0.72) continue // keep the neck round the socket solid
      const d = R + dr * 0.45
      cuts.push(k(k(Manifold.sphere(dr, 24)).translate([d * r * Math.cos(a), d * r * Math.sin(a), d * z])))
    }
    if (cuts.length) solid = k(solid.subtract(k(Manifold.union(cuts))))
  } else if (style === 'geo') {
    // raised geometric lines laid over the ball: ridges along the edges of a polyhedron
    const edges = geoEdges(p.pattern || 'geodesic')
    const rr = Math.max(1.2, (p.ridge || 3) / 2), rad = R - rr * 0.35, ball = k(Manifold.sphere(rr, 12))
    const bits = []
    for (const [a, b] of edges) {
      const ang = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))
      const n = Math.max(2, Math.ceil((ang * R) / 6))
      const pts = []
      for (let i = 0; i <= n; i++) {
        // slerp along the great circle
        const t = i / n, s0 = Math.sin((1 - t) * ang) / Math.sin(ang), s1 = Math.sin(t * ang) / Math.sin(ang)
        pts.push([(a[0] * s0 + b[0] * s1) * rad, (a[1] * s0 + b[1] * s1) * rad, (a[2] * s0 + b[2] * s1) * rad])
      }
      for (let i = 0; i < n; i++) {
        if (pts[i][2] < -0.8 * R && pts[i + 1][2] < -0.8 * R) continue // keep clear of the socket neck
        bits.push(k(Manifold.hull([k(ball.translate(pts[i])), k(ball.translate(pts[i + 1]))])))
      }
    }
    if (bits.length) solid = k(solid.add(k(Manifold.union(bits))))
  } else if (style.startsWith('eye-')) {
    // an eyeball looking out along the staff (+z): iris, pupil and the rest as relief on the ball
    const kind = style.slice(4)
    const ri = R * (p.iris ?? 45) / 100, rp = ri * (p.pupil ?? 42) / 100
    const axisCyl = (r, sx = 1) => k(k(k(Manifold.cylinder(R + 10, r, r, 96)).scale([sx, 1, 1])).translate([0, 0, 0]))
    const shell = (r0, r1) => k(k(Manifold.sphere(r1, 128)).subtract(k(Manifold.sphere(r0, 128))))
    const raise = (r, h, sx = 1) => { solid = k(solid.add(k(k(Manifold.sphere(R + h, 128)).intersect(axisCyl(r, sx))))) }
    const sink = (r, d, sx = 1) => { solid = k(solid.subtract(k(shell(R - d, R + 8).intersect(axisCyl(r, sx))))) }
    const ringCut = (r0, r1, d) => { solid = k(solid.subtract(k(k(shell(R - d, R + 8).intersect(axisCyl(r1))).subtract(axisCyl(r0))))) }
    const lens = (w, h) => { // an almond: two circles crossing, as a prism along z
      const rho = (w * w / 4 + h * h / 4) / w, dd = rho - w / 2
      const a = k(k(CrossSection.circle(rho, 64)).translate([dd, 0])), b = k(k(CrossSection.circle(rho, 64)).translate([-dd, 0]))
      return k(k(a.intersect(b)).extrude(R + 10))
    }
    if (kind === 'classic') {
      raise(ri, 0.8)
      ringCut(ri - 0.2, ri + 1.4, 0.7) // the dark ring round the iris
      sink(rp, 1.6)
      // veins: a few wandering raised threads from the iris out over the white
      const rng = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647) })()
      const ball = k(Manifold.sphere(0.75, 8)), bits = []
      for (let v = 0; v < 8; v++) {
        let az = (v / 8) * Math.PI * 2 + rng() * 0.4, el = Math.asin(Math.min(0.99, Math.sqrt(R * R - (ri + 2) ** 2) / R))
        let prev = null
        for (let s = 0; s < 14; s++) {
          const q = [Math.cos(el) * Math.cos(az) * (R - 0.25), Math.cos(el) * Math.sin(az) * (R - 0.25), Math.sin(el) * (R - 0.25)]
          if (prev) bits.push(k(Manifold.hull([k(ball.translate(prev)), k(ball.translate(q))])))
          prev = q
          el -= 0.07 + rng() * 0.05; az += (rng() - 0.5) * 0.35
          if (el < -0.15) break
        }
      }
      solid = k(solid.add(k(Manifold.union(bits))))
    } else if (kind === 'dragon') {
      raise(ri, 1.0)
      const ridges = []
      for (let i = 0; i < 30; i++) ridges.push(k(k(k(Manifold.cube([ri, 0.9, R * 2], true)).translate([ri / 2 + rp * 0.4, 0, R])).rotate([0, 0, (360 * i) / 30])))
      solid = k(solid.add(k(k(Manifold.union(ridges)).intersect(k(shell(R + 0.9, R + 1.7).intersect(axisCyl(ri - 0.6)))))))
      solid = k(solid.subtract(k(shell(R - 1.8, R + 8).intersect(axisCyl(ri * 0.85, 0.18)))))
    } else if (kind === 'cat') {
      sink(ri, 0.6)
      for (const f of [0.55, 0.75, 0.92]) ringCut(ri * f - 0.35, ri * f + 0.35, 1.1)
      solid = k(solid.subtract(k(shell(R - 2, R + 8).intersect(lens(rp * 0.7, ri * 1.7)))))
    } else if (kind === 'nazar') {
      raise(ri, 0.7)
      ringCut(ri * 0.68, ri * 0.72, 0.4)
      sink(ri * 0.66, 0.4)
      raise(ri * 0.42, 1.3)
      sink(ri * 0.2, 1.0)
    } else if (kind === 'googly') {
      raise(ri, 1.0)
      ringCut(ri - 0.3, ri + 1.2, 0.6)
      // the pupil: a round button off to one side, standing proud
      const pr = Math.max(4, rp), ang = 0.35, zc = Math.sqrt(Math.max(0, R * R - (ri * 0.38) ** 2))
      const dome = k(k(Manifold.sphere(pr, 48)).scale([1, 1, 0.55]))
      const dir = [Math.sin(ang) * 0.38 * ri / R, 0, 1]
      solid = k(solid.add(k(dome.translate([ri * 0.38, ri * 0.12, zc + 1.2]))))
      void dir
    }
  } else if (style === 'grip') {
    // grip rings: shallow grooves round the ball, like a tennis ball seam turned into rings
    const rings = []
    for (const z of [-0.45, -0.15, 0.15, 0.45, 0.72].map((f) => f * R)) {
      const rr = Math.sqrt(R * R - z * z)
      rings.push(k(k(k(CrossSection.circle(1.4, 16)).translate([rr + 0.3, z])).revolve(128)))
    }
    solid = k(solid.subtract(k(Manifold.union(rings))))
  }

  return solid
}

export function ballDesigns() {
  const ball = (id, name, style, blurb, extra = []) => ({
    id, name, group: 'Contact', blurb, ballEnd: true, style, added: '2026-11-20',
    params: [...BALL_PARAMS.map((d) => ({ ...d })), ...extra],
    draw: () => {},
  })
  return [
    ball('ballSmooth', 'Contact Ball', 'smooth', 'A round ball that pushes onto the end of a contact staff: three flat parts that print with no supports (two halves and a joiner ring), crush ribs to grip the pole, and a sealed chamber you can weight with sand or steel shot.'),
    ball('ballDimple', 'Dimple Ball', 'dimpled', 'A contact ball covered in shallow dimples like a golf ball: it catches the light as it rolls and gives your hands something to feel.', [{ key: 'dimples', label: 'Dimples', unit: '', min: 20, max: 160, step: 1, value: 70 }]),
    ball('ballGeo', 'Geo Ball', 'geo', 'A contact ball with a raised geometric pattern laid over it: geodesic triangles, an icosahedron or crossing great circles. The ridges catch the light as it rolls and give your hands something to feel.', [
      { key: 'pattern', label: 'Pattern', options: ['geodesic', 'icosahedron', 'great circles', 'cube star'], value: 'geodesic' },
      { key: 'ridge', label: 'Line thickness', unit: 'mm', min: 2, max: 6, step: 0.1, value: 3.2, hint: 'How wide and proud the raised lines stand.' },
    ]),
    ...[
      ['ballEye', 'Eyeball', 'eye-classic', 'A contact ball that looks back at you: a raised iris, a sunken pupil, a dark ring round the iris and fine veins wandering over the white. Swap filament at the heights the forge gives and it prints in three colours.', { iris: 42, pupil: 42 }],
      ['ballDragonEye', 'Dragon Eye', 'eye-dragon', 'A dragon\'s eye: a big ridged iris and a tall slit pupil. Print the iris in gold or fire orange.', { iris: 52, pupil: 40 }],
      ['ballCatEye', 'Cat Eye', 'eye-cat', 'A cat\'s eye: an almond pupil in a ringed, glassy iris. Glow-in-the-dark filament for the iris is magic at night.', { iris: 55, pupil: 40 }],
      ['ballEvilEye', 'Evil Eye', 'eye-nazar', 'The blue evil-eye charm that wards off bad luck: rings of blue, white and dark blue round a black centre, each ring its own height so a colour change makes it.', { iris: 62, pupil: 40 }],
      ['ballGoogly', 'Googly Eye', 'eye-googly', 'A giant googly eye: a big white disc with a round pupil standing off to one side. Silly and very grabbable.', { iris: 60, pupil: 45 }],
    ].map(([id, name, st, blurb, o]) => ({ ...ball(id, name, st, blurb, [
      { key: 'iris', label: 'Iris', unit: '%', min: 25, max: 75, step: 1, value: o.iris, hint: 'How wide the iris is, as a share of the ball.' },
      { key: 'pupil', label: 'Pupil', unit: '%', min: 20, max: 70, step: 1, value: o.pupil, hint: 'How big the pupil is inside the iris.' },
    ]), group: 'Eyes' })),
    ball('ballGrip', 'Grip Ball', 'grip', 'A contact ball with shallow rings round it: a sure grip for catches and hand rolls, in grippy TPU.'),
  ]
}
void TAU

// unit-vector edge lists for the Geo Ball patterns
export function geoEdges(kind) {
  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l) }
  const key = (v) => v.map((x) => x.toFixed(4)).join(',')
  if (kind === 'great circles' || kind === 'cube star') {
    // great circles as many short edges
    const axes = kind === 'great circles'
      ? [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, -1]].map(norm)
      : [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1]].map(norm)
    const out = []
    for (const ax of axes) {
      const u = norm(Math.abs(ax[2]) < 0.9 ? [-ax[1], ax[0], 0] : [0, -ax[2], ax[1]])
      const v = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]]
      const at = (t) => u.map((x, i) => x * Math.cos(t) + v[i] * Math.sin(t))
      for (let i = 0; i < 24; i++) out.push([at((TAU * i) / 24), at((TAU * (i + 1)) / 24)])
    }
    return out
  }
  const g = (1 + Math.sqrt(5)) / 2
  let V = [[-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1]].map(norm)
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
  for (let pass = 0; pass < (kind === 'geodesic' ? 1 : kind === 'geodesic fine' ? 2 : 0); pass++) {
    const mid = new Map()
    const m = (a, b) => { const k2 = a < b ? `${a}-${b}` : `${b}-${a}`; if (!mid.has(k2)) { V.push(norm(V[a].map((x, i) => x + V[b][i]))); mid.set(k2, V.length - 1) } return mid.get(k2) }
    F = F.flatMap(([a, b, c]) => { const ab = m(a, b), bc = m(b, c), ca = m(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]] })
  }
  const seen = new Set(), out = []
  for (const [a, b, c] of F) for (const [x, y] of [[a, b], [b, c], [c, a]]) {
    const k2 = x < y ? `${x}-${y}` : `${y}-${x}`
    if (!seen.has(k2)) { seen.add(k2); out.push([V[x], V[y]]) }
  }
  void key
  return out
}
