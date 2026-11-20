/**
 * Rope dart heads: the weight on the end of a rope dart. 3D print them (TPU for
 * soft practice, PETG for a firmer feel) or have them turned in metal on a CNC
 * lathe (the classic ones are solids of revolution: the forge gives the lathe
 * profile as a drawing and a DXF). The modern faceted and twisted ones need a
 * 4-axis mill or metal 3D printing: send the STL.
 *
 * Every head has an eye at the top for the rope, rounded through and edged so
 * it does not cut the rope. Units mm, the dart's axis is z, tip at the bottom.
 */
import { TAU } from './geom.js'
import { geoEdges } from './balls.js'

export const DART_PARAMS = [
  { key: 'length', label: 'Length', unit: 'mm', min: 60, max: 180, step: 1, value: 110, hint: 'Tip to the top of the eye.' },
  { key: 'maxD', label: 'Widest', unit: 'mm', min: 20, max: 70, step: 0.5, value: 34 },
  { key: 'attach', label: 'Rope attaches by', options: ['eye', 'swivel socket (M8)'], value: 'eye', hint: 'Eye: tie the rope through the hole (figure-eight loop). Swivel socket: a threaded M8 socket at the top for a stainless swivel eye bolt, so the rope never twists; lock the thread with a drop of thread-locker (metal) or the printed nut trap (print).' },
  { key: 'ropeD', label: 'Rope', unit: 'mm', min: 3, max: 14, step: 0.5, value: 7, presets: [6, 8, 10], hint: 'The eye fits this rope with a millimetre to spare.' },
]

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

// half-profiles [r, z] from the tip (z = 0) up to the shoulder under the eye, for the turned shapes
function profile(style, L, R) {
  const pts = []
  const add = (r, z) => pts.push([Math.max(0, r), z])
  const N = 48
  if (style === 'classic') {
    // a spike: blunt tip, long cone, round shoulder, neck
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = t * L
      const r = t < 0.72 ? 2.5 + (R - 2.5) * Math.pow(t / 0.72, 0.85) : R * Math.cos(((t - 0.72) / 0.28) * Math.PI * 0.42)
      add(r, z)
    }
  } else if (style === 'bell') {
    // a meteor bell: weight low and round, a waist, two rings below the eye
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = t * L
      let r = R * Math.sin(Math.min(1, t / 0.55) * Math.PI * 0.5) ** 0.6
      if (t > 0.55) r = R - (R * 0.58) * Math.sin(((t - 0.55) / 0.45) * Math.PI * 0.5)
      if (t > 0.7 && t < 0.76) r += 2.2 * Math.sin(((t - 0.7) / 0.06) * Math.PI)
      if (t > 0.84 && t < 0.9) r += 2.2 * Math.sin(((t - 0.84) / 0.06) * Math.PI)
      add(i === 0 ? 0 : Math.max(r, 3), z)
    }
  } else if (style === 'willow') {
    // a willow-leaf spindle: long, slim, both ends drawn out
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = t * L
      add(2.5 + (R - 2.5) * Math.pow(Math.sin(t * Math.PI), 0.75) * (t < 0.5 ? 1 : 0.85 + 0.15 * Math.cos((t - 0.5) * Math.PI)), z)
    }
  } else {
    // glow drop: a teardrop with room for an LED capsule
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = t * L
      const r = t < 0.62 ? R * Math.sin((t / 0.62) * Math.PI * 0.5) ** 0.55 : R * Math.cos(((t - 0.62) / 0.38) * Math.PI * 0.42)
      add(i === 0 ? 0 : Math.max(r, 4), z)
    }
  }
  return pts
}

export function buildDart(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const style = opts.style || 'classic'
    const R = p.maxD / 2
    const eyeR = p.ropeD / 2 + 0.5 // the hole
    const bossR = Math.max(eyeR + 4, p.ropeD * 1.1)
    const bossH = 2 * eyeR + 8
    let L = p.length - bossH + 2 // the body below the eye (round ones reset it from their size)
    const warns = []
    let body, prof = null, Lr = 0
    const turned = ['classic', 'bell', 'willow', 'glow'].includes(style)
    const round = ['orb', 'saturn', 'geodesic'].includes(style)
    if (round || style === 'pod') {
      // round ones: the ball sets the length (the Length slider is ignored)
      Lr = style === 'pod' ? 3 * R : 2 * R
    }
    if (round || style === 'pod') {
      body = k(k(k(Manifold.sphere(R, 96)).scale([1, 1, style === 'pod' ? 1.5 : 1])).translate([0, 0, Lr / 2]))
      if (style === 'saturn') {
        // a ring round the middle, tilted a little, joined to the ball all the way round
        const ring = k(k(k(CrossSection.circle(2.8, 24)).translate([R + 4, 0])).revolve(128))
        const web = k(k(Manifold.cylinder(1.6, R + 4, R + 4, 128)).translate([0, 0, -0.8]))
        body = k(body.add(k(k(k(ring.add(web)).rotate([12, 0, 0])).translate([0, 0, Lr / 2]))))
      } else if (style === 'pod') {
        // eight long grooves, like a seed pod or a hop flower
        const g = []
        for (let i = 0; i < 8; i++) {
          const a = (TAU * i) / 8
          g.push(k(k(k(Manifold.sphere(1, 24)).scale([2.6, 2.6, Lr * 0.42])).translate([R * 1.02 * Math.cos(a), R * 1.02 * Math.sin(a), Lr / 2])))
        }
        body = k(body.subtract(k(Manifold.union(g))))
      } else if (style === 'geodesic') {
        // a fine raised geodesic web over the whole ball (an icosahedron subdivided twice)
        const rr = 1.15, rad = R - 0.3, ball = k(Manifold.sphere(rr, 10))
        const bits = []
        for (const [a, b] of geoEdges('geodesic fine')) {
          const pa = a.map((x) => x * rad), pb = b.map((x) => x * rad)
          bits.push(k(Manifold.hull([k(ball.translate(pa)), k(ball.translate(pb))])))
        }
        body = k(body.add(k(k(Manifold.union(bits)).translate([0, 0, Lr / 2]))))
      }
    } else if (style === 'scales' || style === 'fibonacci') {
      // a teardrop covered in a golden-angle spiral of raised scales (or dimples)
      prof = profile('glow', L, R)
      const poly = [[0, 0], ...prof.filter(([r]) => r > 0), [0, L]]
      body = k(k(new CrossSection([poly], 'Positive')).revolve(96))
      const rAt = (z) => { for (let i = 1; i < prof.length; i++) if (prof[i][1] >= z) { const [r0, z0] = prof[i - 1], [r1, z1] = prof[i]; return r0 + ((r1 - r0) * (z - z0)) / Math.max(1e-6, z1 - z0) } return 0 }
      const N = style === 'scales' ? 260 : 420, bits = []
      const size = style === 'scales' ? Math.max(2.2, R * 0.16) : Math.max(1.4, R * 0.1)
      for (let i = 0; i < N; i++) {
        const z = L * (0.06 + (0.86 * i) / N), r = rAt(z)
        if (r < size * 1.6) continue
        const a = i * Math.PI * (3 - Math.sqrt(5))
        const push = style === 'scales' ? r - size * 0.35 : r + size * 0.45
        const b = k(k(Manifold.sphere(size, style === 'scales' ? 10 : 8)).scale(style === 'scales' ? [1, 1, 0.7] : [1, 1, 1]))
        bits.push(k(b.translate([push * Math.cos(a), push * Math.sin(a), z])))
      }
      const u = k(Manifold.union(bits))
      body = style === 'scales' ? k(body.add(u)) : k(body.subtract(u))
      prof = null // not a plain lathe job any more: the pattern needs a 4-axis mill or a metal print
    } else if (turned) {
      prof = profile(style, L, R)
      const poly = [[0, 0], ...prof.filter(([r]) => r > 0), [0, L]]
      body = k(k(new CrossSection([poly], 'Positive')).revolve(96))
    } else if (style === 'prism') {
      // a faceted bipyramid: 8 flat faces down to the tip, 8 up to the eye, a flat band between
      const pts = []
      const ring = (r, z, n = 8, off = 0) => { for (let i = 0; i < n; i++) pts.push([r * Math.cos((TAU * i) / n + off), r * Math.sin((TAU * i) / n + off), z]) }
      ring(3, 0); ring(R, L * 0.6); ring(R, L * 0.68); ring(bossR + 1, L, 8)
      body = k(Manifold.hull(pts.map((q) => k(k(Manifold.sphere(0.8, 6)).translate(q)))))
    } else {
      // twist: a six-point star, twisted as it narrows to the tip and to the eye
      const star = []
      for (let i = 0; i < 12; i++) { const r = i % 2 ? R * 0.62 : R; star.push([r * Math.cos((TAU * i) / 12), r * Math.sin((TAU * i) / 12)]) }
      const sec = k(k(new CrossSection([star], 'Positive')).offset(-1.5, 'Round', 2, 12))
      const sec2 = k(sec.offset(1.5, 'Round', 2, 12))
      const lower = k(k(k(sec2.extrude(L * 0.62, 24, 90, [0.12, 0.12])).mirror([0, 0, 1])).translate([0, 0, L * 0.62]))
      const upper = k(k(sec2.extrude(L * 0.38, 16, -60, [(bossR + 1) / R, (bossR + 1) / R])).translate([0, 0, L * 0.62]))
      body = k(lower.add(upper))
    }
    // the eye: a round boss with a cross hole, the hole's edges rounded off
    if (Lr) L = Lr - 1 // the eye sits on the top of the ball
    const boss = k(k(Manifold.cylinder(bossH, bossR, bossR * 0.92, 48)).translate([0, 0, L - 2]))
    const top = k(k(Manifold.sphere(bossR * 0.92, 48)).translate([0, 0, L - 2 + bossH - bossR * 0.92 * 0.5]))
    let m = k(Manifold.union([body, boss]))
    m = k(m.add(k(top.intersect(k(k(Manifold.cylinder(bossR * 2, bossR * 2, bossR * 2, 16)).translate([0, 0, L - 2]))))))
    const eyeZ = L - 2 + bossH / 2 + 1
    const hole = k(k(k(Manifold.cylinder(4 * bossR, eyeR, eyeR, 32)).rotate([90, 0, 0])).translate([0, 2 * bossR, eyeZ]))
    const flare = k(k(k(Manifold.cylinder(2.2, eyeR + 1.4, eyeR, 32)).rotate([90, 0, 0])).translate([0, bossR + 0.6, eyeZ]))
    const flare2 = k(k(k(Manifold.cylinder(2.2, eyeR, eyeR + 1.4, 32)).rotate([90, 0, 0])).translate([0, -bossR + 1.6, eyeZ]))
    if ((p.attach || 'eye').startsWith('swivel')) {
      // no eye: a flat top with an M8 socket (tapped in metal; a hex nut trap in a print)
      m = k(m.subtract(k(k(Manifold.cube([4 * bossR, 4 * bossR, bossH + 4], true)).translate([0, 0, L - 2 + bossH / 2 + 4.5]))))
      const topZ = L + 2.5
      m = k(m.subtract(k(k(Manifold.cylinder(18, opts.cnc ? 3.4 : 4.3, opts.cnc ? 3.4 : 4.3, 24)).translate([0, 0, topZ - 17]))))
      if (!opts.cnc) m = k(m.subtract(k(k(Manifold.cylinder(6.6, 13.2 / Math.sqrt(3), 13.2 / Math.sqrt(3), 6)).translate([0, 0, topZ - 14]))))
    } else m = k(m.subtract(k(Manifold.union([hole, flare, flare2]))))
    m = k(m.trimByPlane([0, 0, 1], 0))

    let plug = null
    if (style === 'glow') {
      // an LED capsule slides in from the tip; a TPU plug closes it
      const cd = (p.capD || 21) + 0.6, cl = (p.capL || 88) + 1
      if (cd / 2 + 1.6 > R) warns.push(`A Ø${p.capD || 21} capsule needs the dart at least ${Math.ceil(cd + 3.2)} mm wide.`)
      if (cl + 6 > L) warns.push(`A ${p.capL || 88} mm capsule needs the dart about ${Math.ceil(cl + 6 + bossH)} mm long.`)
      const pocket = k(k(Manifold.cylinder(cl, cd / 2, cd / 2, 48)).translate([0, 0, 4]))
      const mouth = k(k(Manifold.cylinder(4.01, cd / 2 - 1, cd / 2 - 1, 48)).translate([0, 0, -0.01]))
      m = k(m.subtract(k(pocket.add(mouth))))
      plug = k(k(Manifold.cylinder(4, cd / 2 - 1.1, cd / 2 - 1.1, 48)).add(k(k(Manifold.cylinder(1.2, cd / 2 - 0.4, cd / 2 - 0.4, 48)).translate([0, 0, 4]))))
    }

    const density = opts.density || 1.21
    const g = (m.volume() / 1000) * density
    const vol = m.volume()
    const H = m.boundingBox().max[2]
    // print it eye-down: flip so the boss sits on the bed
    const flat = k(k(m.rotate([180, 0, 0])).translate([0, 0, H]))
    const meshes = { combined: meshData(k(m.translate([0, 0, -H / 2]))), printFlat: meshData(flat) }
    if (plug) meshes.plugFlat = meshData(plug)
    const circle = []
    for (let i = 0; i < 48; i++) circle.push([R * Math.cos((TAU * i) / 48), R * Math.sin((TAU * i) / 48)])
    // lathe profile: the full side outline (both halves) for the drawing and the DXF
    let side = null
    if (prof) {
      const right = prof.map(([r, z]) => [r, z])
      const left = [...prof].reverse().map(([r, z]) => [-r, z])
      side = [[...right, [bossR, L - 2], [bossR * 0.92, L - 2 + bossH], [-bossR * 0.92, L - 2 + bossH], [-bossR, L - 2], ...left]]
    }
    return {
      dart: { style, turned, H, vol, R, bossR, eyeR, eyeZ, prof, side, L, plug: !!plug },
      meshes,
      viewR: Math.min(59, H * 0.55),
      polygons: { base: [circle], relief: [], pods: [], weak: [] },
      layers: side ? { cut: side, holes: [], drill: [], pocket: [], pocketDepth: 0, engrave: [] } : null,
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: g, gramsTotal: g, warns, height: H },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

/** A lathe drawing: the side profile at 1:1 with a table of diameters every 10 mm. */
export function dartDrawingSVG(hub, p, matName, name) {
  const d = hub.dart
  if (!d.side) return null
  const H = d.H, W = Math.max(120, 2 * d.R + 120), pad = 20
  const path = 'M' + d.side[0].map(([x, z]) => `${(x + W / 2).toFixed(2)},${(H - z + pad).toFixed(2)}`).join('L') + 'Z'
  const rows = []
  for (let z = 0; z <= d.L; z += 10) {
    let r = 0
    for (let i = 1; i < d.prof.length; i++) if (d.prof[i][1] >= z) { const [r0, z0] = d.prof[i - 1], [r1, z1] = d.prof[i]; r = r0 + ((r1 - r0) * (z - z0)) / Math.max(1e-6, z1 - z0); break }
    rows.push(`<text x="${W + 10}" y="${pad + 14 + rows.length * 5.5}" font-size="4">z ${z.toFixed(0)} mm: Ø${(2 * r).toFixed(1)}</text>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W + 90}mm" height="${H + 2 * pad + 30}mm" viewBox="0 0 ${W + 90} ${H + 2 * pad + 30}">
<rect width="100%" height="100%" fill="#fff"/>
<g font-family="Helvetica,Arial,sans-serif">
<text x="6" y="10" font-size="6" font-weight="700">${name}: rope dart head, lathe profile, 1:1 (mm)</text>
<text x="6" y="16" font-size="4">${matName}. Overall ${H.toFixed(1)} mm long, Ø${(2 * d.R).toFixed(1)} widest. Tip at z = 0.</text>
<path d="${path}" fill="#eef1f5" stroke="#000" stroke-width="0.35"/>
<line x1="${W / 2}" y1="${pad - 5}" x2="${W / 2}" y2="${H + pad + 5}" stroke="#06c" stroke-width="0.2" stroke-dasharray="3 2"/>
<circle cx="${W / 2}" cy="${H - d.eyeZ + pad}" r="${d.eyeR}" fill="#fff" stroke="#c00" stroke-width="0.35"/>
<text x="${W + 10}" y="${pad + 6}" font-size="4.5" font-weight="700">Diameters</text>
${rows.join('\n')}
<text x="6" y="${H + 2 * pad + 12}" font-size="4">Eye: Ø${(2 * d.eyeR).toFixed(1)} cross hole at z ${d.eyeZ.toFixed(1)}, both ends chamfered/rounded 1.4 mm so the rope cannot fray. Break all edges.</text>
<text x="6" y="${H + 2 * pad + 18}" font-size="4">Turn on a lathe from bar Ø${Math.ceil(2 * d.R + 3)} mm; drill the eye on a mill or drill press.</text>
</g></svg>\n`
}

export function dartDesigns() {
  const d = (id, name, style, group, blurb, over = {}) => ({
    id, name, group, blurb, dart: true, style, added: '2026-11-20',
    params: DART_PARAMS.map((x) => ({ ...x, ...(over[x.key] !== undefined ? { value: over[x.key] } : {}) })),
    draw: () => {},
  })
  return [
    d('dartClassic', 'Classic Dart', 'classic', 'DartClassic', 'The traditional rope dart: a long cone with a blunt tip, a rounded shoulder and an eye for the rope. Turn it in brass or steel on a lathe, or print it in TPU to practise.'),
    d('dartBell', 'Meteor Bell', 'bell', 'DartClassic', 'A round, bell-shaped weight with its mass low and two rings under the eye: the meteor-hammer feel, smooth to wrap and unwrap.', { length: 95, maxD: 42 }),
    d('dartWillow', 'Willow Leaf', 'willow', 'DartClassic', 'A long, slim willow-leaf spindle, drawn out at both ends: fast through the air and easy to catch.', { length: 140, maxD: 28 }),
    d('dartGlow', 'Glow Drop', 'glow', 'DartModern', 'A teardrop in clear TPU with an LED capsule inside: slide the capsule in from the tip and press the plug in. Lights your whole rope dart.', { length: 140, maxD: 32 }),
    d('dartPrism', 'Prism', 'prism', 'DartModern', 'A faceted crystal: eight flat faces down to the tip and eight up to the eye. Flashes as it spins. Print it, or have it milled or metal-printed.', { length: 105, maxD: 36 }),
    d('dartOrb', 'Orb', 'orb', 'DartRound', 'A plain, perfect ball on the rope: rolls off the body smoothly and is the easiest to catch. Size it with Widest.', { maxD: 46 }),
    d('dartSaturn', 'Saturn', 'saturn', 'DartRound', 'A ball with a ring round it, tilted a little like the planet: the ring flashes in a wobble as it spins.', { maxD: 42 }),
    d('dartPod', 'Seed Pod', 'pod', 'DartRound', 'A long oval with eight deep grooves, like a seed pod or a hop flower: grippy to catch, and the grooves stripe the light as it turns.', { maxD: 38 }),
    d('dartScales', 'Dragon Scales', 'scales', 'DartPattern', 'A teardrop covered in hundreds of raised scales laid out on a golden-angle spiral, the way scales and seeds grow: dense, tactile, catches every bit of light.', { length: 125, maxD: 38 }),
    d('dartFibonacci', 'Fibonacci', 'fibonacci', 'DartPattern', 'Four hundred little dimples spiralling round a teardrop on the golden angle: look at it and the spirals run both ways at once.', { length: 125, maxD: 38 }),
    d('dartGeo', 'Geodesic Orb', 'geodesic', 'DartPattern', 'A ball wrapped in a fine raised geodesic web, hundreds of tiny triangles: a little planet on a rope. Print it fine (0.12 mm layers) to get every line.', { maxD: 48 }),
    d('dartTwist', 'Twist', 'twist', 'DartModern', 'A six-pointed star twisted down to the tip: it looks like it is spinning even when it hangs still.', { length: 120, maxD: 34 }),
  ]
}
