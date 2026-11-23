/**
 * Bubble Spinners: practice dragon staff hubs that blow bubbles and feed their own
 * loops while they spin. A spinning staff is never the same way up, so the loops
 * cannot dip into a tray. Instead the spin is the pump: bubble mix is held in a
 * sealed tank, or in the hollow pole itself, and the spin flings it out along a
 * channel inside every spoke (or round a channel inside the rim) to a small outlet
 * at each loop. Each loop is wrapped in cotton yarn with its tail tucked into the
 * outlet: the yarn soaks the mix up and keeps the loop wet, so the film keeps
 * coming back as the staff turns.
 *
 * Feeds
 *   tank     a sealed ring tank round the collar; slides on anywhere on the pole
 *   socket   an end hub: a socket over the pole end, sealed by two O-rings inside
 *            it; the pole end opens straight into the hub, so the pole is the tank
 *   plug     an end hub with an internal fixing: a spigot with two O-rings pushes
 *            inside the pole, a lip covers the end; the pole is the tank
 * Layouts
 *   spokes   a loop on the tip of each spoke
 *   wheel    a rim with a ring channel inside it and loops all round it
 *
 * Units mm. The hub lies flat, z = 0 is its outer face; the pole side is +z, and
 * the loops stand up on that side too, so it prints flat as shown, no supports.
 */
const PETG = 1.27, MIX = 1.03

export const BUBBLE_HUB_PARAMS = [
  { key: 'feed', label: 'Bubble mix comes from', options: ['a ring tank round the collar', 'the hollow pole: socket over the end', 'the hollow pole: plug inside the end'], value: 'a ring tank round the collar', rerender: true, hint: 'Tank: a sealed tank in the hub; it slides on anywhere along the pole. Hollow pole, socket: an end hub that fits over the pole end, sealed by two O-rings inside it; the open pole end feeds straight into the hub, so the whole pole is the tank. Hollow pole, plug: an internal fixing; a spigot sealed by two O-rings pushes inside the pole and a lip covers the end.' },
  { key: 'layout', label: 'Loops', options: ['on the spoke tips', 'round a rim (wheel)'], value: 'on the spoke tips', rerender: true },
  { key: 'spokes', label: 'Spokes', unit: '', min: 3, max: 8, step: 1, value: 5 },
  { key: 'reach', label: 'Reach', unit: 'mm', min: 60, max: 220, step: 1, value: 88, hint: 'From the middle to the end of a spoke (or the outside of the rim). Further out, the spin pushes the mix harder.' },
  { key: 'rimLoops', label: 'Loops round the rim', unit: '', min: 6, max: 18, step: 1, value: 10, showIf: (p) => (p.layout || '').startsWith('round') },
  { key: 'loopD', label: 'Loop size', unit: 'mm', min: 25, max: 90, step: 1, value: 46, hint: 'Inside diameter. Bigger loops, bigger bubbles, more mix.' },
  { key: 'loopT', label: 'Loop wire', unit: 'mm', min: 3.5, max: 7, step: 0.1, value: 4.5, hint: 'The yarn wraps round this: 4 mm or more holds plenty of mix.' },
  { key: 'thick', label: 'Hub thickness', unit: 'mm', min: 10, max: 22, step: 0.5, value: 14 },
  { key: 'outlet', label: 'Outlet', unit: 'mm', min: 1, max: 3, step: 0.1, value: 1.6, hint: 'The hole at each loop the yarn tail tucks into. Smaller feeds slower and drips less; thick mix (with glycerine or guar) wants 2 mm or more.' },
  { key: 'tankD', label: 'Tank', unit: 'mm', min: 56, max: 130, step: 1, value: 86, showIf: (p) => (p.feed || '').startsWith('a ring'), hint: 'Outside diameter of the tank round the collar.' },
  { key: 'tankH', label: 'Tank height', unit: 'mm', min: 16, max: 45, step: 1, value: 28, showIf: (p) => (p.feed || '').startsWith('a ring') },
  { key: 'poleIn', label: 'Pole inside', unit: 'mm', min: 8, max: 30, step: 0.1, value: 19, showIf: (p) => (p.feed || '').includes('pole'), hint: 'The hole down the middle of your pole. Measure it: the socket opens to it, the plug fits it.' },
  { key: 'poleLen', label: 'Pole length', unit: 'mm', min: 600, max: 2000, step: 10, value: 1500, showIf: (p) => (p.feed || '').includes('pole') },
]

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

export function buildBubbleHub(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const warns = []
    const feed = (p.feed || '').startsWith('a ring') ? 'tank' : (p.feed || '').includes('plug') ? 'plug' : 'socket'
    const wheel = (p.layout || '').startsWith('round')
    const H = p.thick, n = Math.round(p.spokes), R = p.reach
    const T = p.loopT, lr = p.loopD / 2, cr = 1.4 // channel radius
    const w = Math.max(11, 2 * cr + 7) // spoke width
    const rb = (p.poleOD + (p.fit ?? 0.3)) / 2
    const zc = H / 2
    const cyl = (r, z0, z1, n2 = 64, r2 = r) => k(k(Manifold.cylinder(z1 - z0, r, r2, n2)).translate([0, 0, z0]))
    const ring = (r0, r1, z0, z1, n2 = 96) => k(cyl(r1, z0, z1, n2).subtract(cyl(r0, z0 - 1, z1 + 1, n2)))
    // a horizontal channel along +x from r0 to r1 at height z, turned to angle a
    const chan = (r0, r1, a, rad = cr, z = zc) => k(k(k(k(Manifold.cylinder(r1 - r0, rad, rad, 20)).rotate([0, 90, 0])).translate([r0, 0, z])).rotate([0, 0, a]))
    const box = (x0, x1, y0, y1, z0, z1, a = 0) => k(k(k(Manifold.cube([x1 - x0, y1 - y0, z1 - z0], false)).translate([x0, y0, z0])).rotate([0, 0, a]))
    const solids = [], cuts = [], show = []
    let inner = 0, liquidMl = 0, fill = null, oRing = null, collarTop = H

    // ---- the middle: tank, socket or plug
    if (feed === 'tank') {
      const Rt = p.tankD / 2, Ht = Math.max(p.tankH, H + 4), wall = 2.4
      if (Rt < rb + 14) warns.push('The tank is barely wider than the pole: make it bigger.')
      solids.push(ring(rb, Rt, 0, Ht), ring(rb, rb + 5, Ht - 1, Ht + 14, 64)) // tank + collar above it for the grub screw
      const cav = ring(rb + 3, Rt - wall, wall, Ht - wall)
      cuts.push(cav)
      liquidMl = cav.volume() / 1000
      inner = Rt - wall - 1.5
      cuts.push(k(k(k(Manifold.cylinder(rb + 8, 2.1, 2.1, 16)).rotate([0, 90, 0])).translate([0, 0, Ht + 7]))) // M5 grub screw, tapped into the print
      const fr = (rb + 3 + Rt - wall) / 2, fa = Math.PI / n // fill port on top, between two spokes
      fill = { x: fr * Math.cos(fa), y: fr * Math.sin(fa), z: Ht - wall - 0.5, len: wall + 1 }
      collarTop = Ht + 14
    } else if (feed === 'socket') {
      const ri = p.poleIn / 2, ch = Math.max(ri + 1, rb - 0.6) // the chamber is as wide as the pole's hole: mix at the pole wall runs straight in
      const sk = rb + 4.5, depth = 32
      solids.push(cyl(sk + 2, 0, H), ring(rb, sk, H - 1, H + depth, 64))
      cuts.push(cyl(ch, 2.4, H + 0.01))
      for (const z of [H + 8, H + 19]) cuts.push(ring(rb - 0.01, rb + 1.5, z, z + 2.3, 64)) // O-ring grooves in the socket wall
      cuts.push(k(k(k(Manifold.cylinder(sk + 6, 2.1, 2.1, 16)).rotate([0, 90, 0])).translate([0, 0, H + depth - 4]))) // grub screw beyond the seals: bites the outside, no leak
      inner = ch - 1
      oRing = { id: Math.round(p.poleOD - 1), cs: 2, n: 2, where: 'inside the socket' }
      fill = { x: 0, y: 0, z: -0.5, len: 3.4 } // fill port in the outer face, straight into the chamber
      collarTop = H + depth
      if (p.poleIn > p.poleOD - 1.6) warns.push('The pole wall is very thin for its inside size: check Pole inside.')
    } else {
      const ri = p.poleIn / 2, so = ri - 0.15, wall = 2.2, bore = so - wall, len = 34
      if (bore < 3.5) warns.push('The pole is too narrow inside for a plug: use the socket.')
      solids.push(cyl(rb + 5, 0, H), ring(rb, rb + 3, H - 1, H + 8, 64), ring(Math.max(2, bore), so, H - 1, H + len, 64))
      cuts.push(cyl(Math.max(2, bore), 2.4, H + 0.01))
      for (const z of [H + 12, H + 24]) cuts.push(ring(so - 1.2, so + 0.01, z, z + 1.8, 64)) // O-ring grooves round the spigot
      inner = bore - 1
      oRing = { id: Math.max(4, Math.round((so - 1.2) * 2)), cs: 1.5, n: 2, where: 'round the spigot' }
      fill = { x: 0, y: 0, z: -0.5, len: 3.4 }
      collarTop = H + len
      warns.push('The plug narrows the pole\'s opening: it feeds best once a few end-over-end turns have thrown the mix to this end. The socket feeds straight away.')
    }

    // ---- spokes, rim, channels, outlets and loops
    const loopAt = [] // [angle, radius of the outlet face]
    const spokeEnd = wheel ? R - 6 : R
    for (let i = 0; i < n; i++) {
      const a = (360 * i) / n
      solids.push(box(3, spokeEnd, -w / 2, w / 2, 0, H, a))
      cuts.push(chan(inner, wheel ? R - 6 : R - 4, a))
      if (!wheel) { cuts.push(chan(R - 4.5, R + 1, a, p.outlet / 2)); loopAt.push([a, R]) }
    }
    if (wheel) {
      solids.push(ring(R - 12, R, 0, H))
      cuts.push(k(k(k(CrossSection.circle(cr, 20)).translate([R - 6, zc])).revolve(128))) // the ring channel inside the rim
      const m = Math.round(p.rimLoops)
      for (let j = 0; j < m; j++) { const a = (360 * (j + 0.5)) / m; cuts.push(chan(R - 6, R + 1, a, p.outlet / 2)); loopAt.push([a, R]) }
    }
    const loops = [], yarn = []
    const rc = (Rs) => Rs + 1 + lr + T / 2
    for (const [a, Rs] of loopAt) {
      // an edge-on loop standing on a foot beyond the outlet: it faces the way it moves, so air goes through it
      const sec = k(k(k(CrossSection.circle(lr + T / 2, 64)).subtract(k(CrossSection.circle(lr - T / 2, 64)))).translate([rc(Rs), lr + T / 2]))
      const toPlane = (cs, th) => k(k(k(k(cs.extrude(th)).rotate([90, 0, 0])).translate([0, th / 2, 0])).rotate([0, 0, a]))
      loops.push(toPlane(sec, T))
      loops.push(box(Rs - 1, rc(Rs), -(T + 2) / 2, (T + 2) / 2, 0, Math.max(2.5, zc - cr - 1.2), a))
      const ysec = k(k(k(CrossSection.circle(lr + T / 2 + 0.9, 64)).subtract(k(CrossSection.circle(lr - T / 2 - 0.9, 64)))).translate([rc(Rs), lr + T / 2]))
      yarn.push(k(toPlane(ysec, T + 1.8).subtract(toPlane(k(k(CrossSection.circle(lr - T / 2 - 0.9, 64)).translate([rc(Rs), lr + T / 2])), T + 4))))
    }
    let hub = k(k(Manifold.union([...solids, ...loops])).subtract(k(Manifold.union(cuts))))
    if (feed === 'tank') hub = k(hub.subtract(cyl(rb, -1, collarTop + 1, 64))) // the pole goes right through
    // fill port and its stopper (TPU, with a pinhole vent so the mix can leave)
    let stopper = null
    if (fill) {
      hub = k(hub.subtract(k(k(Manifold.cylinder(fill.len + 1, 4, 4, 32)).translate([fill.x, fill.y, feed === 'tank' ? fill.z : -0.5]))))
      stopper = k(k(Manifold.union([k(Manifold.cylinder(2, 6, 6, 32)), k(k(Manifold.cylinder(fill.len + 0.5, 4.15, 4.15, 32)).translate([0, 0, 2]))])).subtract(k(k(Manifold.cylinder(20, 0.4, 0.4, 8)).translate([0, 0, -1]))))
    }
    const parts = hub.decompose()
    if (parts.length > 1) { for (const q of parts) live.push(q); hub = k(Manifold.compose(parts.filter((q) => q.volume() > 50))) } // a lone piece comes back as the same object: never free it twice
    const g = (hub.volume() / 1000) * (opts.density || PETG)
    if (feed !== 'tank') liquidMl = (Math.PI * (p.poleIn / 2) ** 2 * p.poleLen) / 1000
    const reach = (wheel ? R : rc(R) + lr + T / 2)
    const span = 2 * reach
    if (span > (opts.bed || 300) - 2) warns.push(`It is ${span.toFixed(0)} mm across: bigger than your print bed. Shorten Reach or the loops.`)
    if (p.outlet < 1.4) warns.push('Outlets under 1.4 mm block with thick mix: thin the mix or open them up.')
    const meshes = { combined: meshData(hub), practice: meshData(k(Manifold.union(yarn))) }
    if (stopper) {
      const sb = stopper.boundingBox()
      meshes.stopperFlat = meshData(k(stopper.translate([0, 0, -sb.min[2]])))
      // shown in place in the view
      const placed = feed === 'tank' ? k(k(stopper.rotate([180, 0, 0])).translate([fill.x, fill.y, fill.z + fill.len + 2.5])) : k(stopper.translate([0, 0, -2]))
      meshes.rods = meshData(placed)
    }
    const circle = []
    for (let i = 0; i < 64; i++) circle.push([reach * Math.cos((2 * Math.PI * i) / 64), reach * Math.sin((2 * Math.PI * i) / 64)])
    return {
      bubbleHub: { feed, wheel, loops: loopAt.length, spokes: n, g, liquidMl, oRing, span, end: feed !== 'tank', collarTop, outlet: p.outlet, gMix: feed === 'tank' ? liquidMl * MIX : 0 },
      meshes,
      viewR: reach * 1.15,
      polygons: { base: [circle], relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: g, gramsTotal: g + (feed === 'tank' ? liquidMl * MIX : 0), warns, height: collarTop },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function bubbleHubDesigns() {
  const d = (id, name, blurb, over) => ({
    id, name, group: 'BubbleHubs', blurb, bubbleHub: true, added: '2026-11-23',
    params: BUBBLE_HUB_PARAMS.map((x) => ({ ...x, ...(over[x.key] !== undefined ? { value: over[x.key] } : {}) })),
    draw: () => {},
  })
  return [
    d('bhTank', 'Bubble Spinner: Tank', 'A practice dragon staff hub that blows bubbles and feeds its own loops. A sealed tank round the collar holds the bubble mix; when you spin, the mix is flung out along a channel inside every spoke to the yarn-wrapped loop on its tip, so the film keeps coming back. Slides on anywhere along the pole.', {}),
    d('bhPole', 'Bubble Spinner: Pole Fed', 'An end hub that turns your hollow pole into the tank: it fits over the pole end, sealed by two O-rings, and the open end feeds straight into the hub. Fill the pole with bubble mix, spin, and the spokes carry it out to the loops. Hundreds of ml: hours of bubbles.', { feed: 'the hollow pole: socket over the end' }),
    d('bhPlug', 'Bubble Spinner: Pole Plug', 'The internal-fixing version: a spigot sealed by two O-rings pushes inside the hollow pole and a lip covers the end, so nothing grips the outside. The pole is the tank.', { feed: 'the hollow pole: plug inside the end' }),
    d('bhWheel', 'Bubble Wheel', 'A bubble wheel: a rim with a ring channel inside it and ten yarn-wrapped loops all round, fed from a tank round the collar. A wall of bubbles from every turn.', { layout: 'round a rim (wheel)', spokes: 4, reach: 120, loopD: 40 }),
    d('bhPoleWheel', 'Bubble Wheel: Pole Fed', 'The bubble wheel fed from the hollow pole: an end hub, sealed over the pole end, twelve loops round the rim.', { layout: 'round a rim (wheel)', feed: 'the hollow pole: socket over the end', spokes: 4, reach: 120, loopD: 38, rimLoops: 12 }),
  ]
}
