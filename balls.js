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
  { key: 'fill', label: 'Inside', options: ['hollow', 'sand', 'steel shot'], value: 'hollow', hint: 'Pour sand or steel shot into the lower half before you press the halves together. A full chamber of steel shot is heavy: fill it part way and weigh it.' },
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

    // outer surface
    let outer
    if (style === 'faceted') outer = k(Manifold.sphere(R, 14))
    else outer = k(Manifold.sphere(R, 128))
    let solid = k(outer.subtract(k(Manifold.sphere(ri, 96))))
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

    // surface styles
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
    } else if (style === 'grip') {
      // grip rings: shallow grooves round the ball, like a tennis ball seam turned into rings
      const rings = []
      for (const z of [-0.45, -0.15, 0.15, 0.45, 0.72].map((f) => f * R)) {
        const rr = Math.sqrt(R * R - z * z)
        rings.push(k(k(k(CrossSection.circle(1.4, 16)).translate([rr + 0.3, z])).revolve(128)))
      }
      solid = k(solid.subtract(k(Manifold.union(rings))))
    }

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
    const fillDens = p.fill === 'sand' ? 1.6 : p.fill === 'steel shot' ? 4.6 : 0
    const gFill = ((cavity * p.fillPct) / 100 / 1000) * fillDens
    const fullShot = (cavity / 1000) * 4.6
    const squeeze = p.poleOD - 2 * (boreR - (p.ribs > 0 ? RIB : 0))
    return {
      ball: { R, depth, style, squeeze, cavityCm3: cavity / 1000, fullShot, gFill, fill: p.fill, jh },
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

export function ballDesigns() {
  const ball = (id, name, style, blurb, extra = []) => ({
    id, name, group: 'Contact', blurb, ballEnd: true, style, added: '2026-11-20',
    params: [...BALL_PARAMS.map((d) => ({ ...d })), ...extra],
    draw: () => {},
  })
  return [
    ball('ballSmooth', 'Contact Ball', 'smooth', 'A round ball that pushes onto the end of a contact staff: three flat parts that print with no supports (two halves and a joiner ring), crush ribs to grip the pole, and a sealed chamber you can weight with sand or steel shot.'),
    ball('ballDimple', 'Dimple Ball', 'dimpled', 'A contact ball covered in shallow dimples like a golf ball: it catches the light as it rolls and gives your hands something to feel.', [{ key: 'dimples', label: 'Dimples', unit: '', min: 20, max: 160, step: 1, value: 70 }]),
    ball('ballGem', 'Gem Ball', 'faceted', 'A faceted ball, cut like a gem: flat faces flash as the staff turns. Rolls a little bumpy on the body, so it suits isolations more than long rolls.'),
    ball('ballGrip', 'Grip Ball', 'grip', 'A contact ball with shallow rings round it: a sure grip for catches and hand rolls, in grippy TPU.'),
  ]
}
void TAU
