/**
 * Bubble toys: tools for giant bubbles, circus-themed wands, and other bubble makers.
 * Every part prints flat or standing with no supports unless the notes say so.
 * Units mm. Each builder returns its print pieces (one STL each, with counts) and
 * rows of notes for the panel.
 */
const PETG = 1.27

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

export const TOY_PARAMS = {
  wand: [
    { key: 'size', label: 'Loop size', unit: 'mm', min: 40, max: 160, step: 1, value: 80, hint: 'Across the shape.' },
    { key: 'wire', label: 'Loop wire', unit: 'mm', min: 2.5, max: 6, step: 0.1, value: 3.5 },
    { key: 'thick', label: 'Thickness', unit: 'mm', min: 2.5, max: 6, step: 0.1, value: 4 },
    { key: 'handle', label: 'Handle', unit: 'mm', min: 60, max: 250, step: 5, value: 130 },
    { key: 'notches', label: 'Film notches', options: ['yes', 'no'], value: 'yes', hint: 'Little notches round the inside edge hold more mix: more bubbles per dip.' },
  ],
  triTop: [
    { key: 'dowel', label: 'Stick', unit: 'mm', min: 12, max: 32, step: 0.5, value: 19, presets: [16, 19, 22, 25], hint: 'A dowel, a broom handle or a tent pole.' },
    { key: 'ropeD', label: 'Cotton rope', unit: 'mm', min: 3, max: 10, step: 0.5, value: 6 },
  ],
  bead: [
    { key: 'beadD', label: 'Bead size', unit: 'mm', min: 20, max: 50, step: 1, value: 36 },
    { key: 'ropeD', label: 'Cotton rope', unit: 'mm', min: 3, max: 10, step: 0.5, value: 6 },
    { key: 'shot', label: 'Steel shot inside', unit: 'g', min: 0, max: 120, step: 5, value: 30, hint: 'The weight that holds the bottom string down: pause the print to pour it in.' },
  ],
  ring: [
    { key: 'ringD', label: 'Ring size', unit: 'mm', min: 200, max: 600, step: 10, value: 320, hint: 'Inside diameter. It prints in click-together arcs that fit your bed.' },
    { key: 'dowel', label: 'Handle stick', unit: 'mm', min: 12, max: 32, step: 0.5, value: 19 },
  ],
  tray: [
    { key: 'trayL', label: 'Length', unit: 'mm', min: 120, max: 290, step: 5, value: 260 },
    { key: 'trayW', label: 'Width', unit: 'mm', min: 80, max: 290, step: 5, value: 180 },
    { key: 'trayH', label: 'Depth', unit: 'mm', min: 15, max: 60, step: 1, value: 32 },
  ],
  net: [
    { key: 'netD', label: 'Frame size', unit: 'mm', min: 100, max: 250, step: 5, value: 180 },
    { key: 'cell', label: 'Little loops', unit: 'mm', min: 18, max: 50, step: 1, value: 30 },
    { key: 'handle', label: 'Handle', unit: 'mm', min: 60, max: 250, step: 5, value: 140 },
  ],
  clip: [
    { key: 'dowel', label: 'Pole', unit: 'mm', min: 12, max: 40, step: 0.5, value: 22, presets: [19, 22, 25, 32] },
    { key: 'ropeD', label: 'Rope', unit: 'mm', min: 3, max: 10, step: 0.5, value: 6 },
  ],
  snake: [
    { key: 'tubeD', label: 'Tube', unit: 'mm', min: 25, max: 70, step: 1, value: 40 },
    { key: 'tubeL', label: 'Length', unit: 'mm', min: 50, max: 160, step: 5, value: 90 },
  ],
  cup: [
    { key: 'cupD', label: 'Cup', unit: 'mm', min: 60, max: 140, step: 1, value: 96 },
    { key: 'water', label: 'Water', unit: 'ml', min: 100, max: 1500, step: 50, value: 600 },
    { key: 'soap', label: 'Washing-up liquid', unit: 'ml', min: 10, max: 200, step: 5, value: 50 },
    { key: 'glyc', label: 'Glycerine', unit: 'ml', min: 0, max: 100, step: 5, value: 25 },
  ],
  frame: [
    { key: 'frameShape', label: 'Shape', options: ['cube', 'pyramid (tetrahedron)', 'triangular prism'], value: 'cube' },
    { key: 'side', label: 'Side', unit: 'mm', min: 30, max: 90, step: 1, value: 50 },
    { key: 'bar', label: 'Bar', unit: 'mm', min: 2.5, max: 5, step: 0.1, value: 3.4 },
  ],
  wheel: [
    { key: 'wheelD', label: 'Wheel', unit: 'mm', min: 100, max: 200, step: 5, value: 150 },
    { key: 'loops', label: 'Loops', unit: '', min: 5, max: 12, step: 1, value: 8 },
  ],
}

// ---- 2D shapes for the circus wands (filled silhouettes, about 100 units across, centred)
function circusShape(CS, k, theme) {
  const c = (r, x, y) => k(k(CS.circle(r, 48)).translate([x, y]))
  const poly = (pts) => k(new CS([pts], 'Positive'))
  const rect = (x0, y0, x1, y1) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
  const U = (list) => k(CS.union(list))
  if (theme === 'tent') return U([poly([[-40, -40], [40, -40], [40, 0], [0, 42], [-40, 0]]), rect(-2, 38, 2, 54), poly([[2, 54], [20, 48], [2, 42]])])
  if (theme === 'elephant') {
    const trunk = []
    for (let i = 0; i <= 12; i++) { const t = i / 12; trunk.push(c(5 - 1.5 * t, 44 + 8 * Math.sin(t * 2), 8 - 40 * t)) }
    return U([c(28, -6, 0), c(18, 26, 14), c(13, 18, 20), ...trunk, rect(-28, -42, -18, -20), rect(6, -42, 16, -20), poly([[-34, 4], [-46, -6], [-32, -2]])])
  }
  if (theme === 'lion') {
    const bumps = []
    for (let i = 0; i < 14; i++) { const a = (2 * Math.PI * i) / 14; bumps.push(c(9, 36 * Math.cos(a), 36 * Math.sin(a))) }
    return U([c(36, 0, 0), ...bumps, c(7, -22, 38), c(7, 22, 38)])
  }
  if (theme === 'clown') return U([c(30, 0, -6), poly([[-22, 18], [22, 18], [4, 52]]), c(6, 4, 54), poly([[-24, -38], [0, -30], [-24, -22]]), poly([[24, -38], [0, -30], [24, -22]])])
  if (theme === 'star') {
    const pts = []
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (Math.PI * i) / 5, r = i % 2 ? 20 : 48; pts.push([r * Math.cos(a), r * Math.sin(a)]) }
    return poly(pts)
  }
  return c(40, 0, 0)
}

export function buildBubbleToy(wasm, p, opts = {}) {
  const { CrossSection: CS, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const kind = opts.kind, warns = [], rows = [], pieces = [] // pieces: [label, manifold (as printed), count]
    let shown = null // the view
    const cyl = (h, r, z = 0, x = 0, y = 0, n = 48, r2 = r) => k(k(Manifold.cylinder(h, r, r2, n)).translate([x, y, z]))
    const box = (x0, y0, z0, x1, y1, z1) => k(k(Manifold.cube([x1 - x0, y1 - y0, z1 - z0], false)).translate([x0, y0, z0]))
    // a closed outline of a filled shape, w wide, with film notches round the inside
    const outline = (S, w, notches) => {
      let ring = k(k(S.offset(w / 2, 'Round', 2, 16)).subtract(k(S.offset(-w / 2, 'Round', 2, 16))))
      if (notches) {
        const nn = []
        for (const poly of k(S.offset(-w / 2, 'Round', 2, 16)).toPolygons()) {
          let acc = 0
          for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; acc += Math.hypot(x2 - x1, y2 - y1); if (acc >= 5.5) { acc = 0; nn.push(k(k(CS.circle(0.9, 10)).translate([x1, y1]))) } }
        }
        if (nn.length) ring = k(ring.subtract(k(CS.union(nn))))
      }
      return ring
    }
    const handle2D = (yTop, len, w = 9) => k(k(k(CS.square([w, len], false)).translate([-w / 2, yTop - len])).add(k(k(CS.circle(w / 2 + 1.5, 32)).translate([0, yTop - len]))))

    if (kind === 'circus' || kind === 'dumbbell') {
      const sc = p.size / 100
      let S, extra = null
      if (kind === 'dumbbell') {
        // two plate loops joined by a solid bar, the handle off the middle of the bar
        const r = 22
        S = k(CS.union([k(k(CS.circle(r, 48)).translate([-38, 0])), k(k(CS.circle(r, 48)).translate([38, 0]))]))
        extra = k(k(CS.square([52, 6], false)).translate([-26, -3]))
      } else S = circusShape(CS, k, opts.theme)
      S = k(S.scale([sc, sc]))
      if (extra) extra = k(extra.scale([sc, sc]))
      const b = S.bounds()
      let flat = outline(S, p.wire, p.notches === 'yes')
      if (extra) flat = k(flat.add(extra))
      const strip = k(S.intersect(k(CS.square([2, 1000], true))))
      const yTop = (extra ? -3 * sc : strip.isEmpty() ? b.min[1] : strip.bounds().min[1]) + p.wire / 2
      flat = k(flat.add(handle2D(yTop, p.handle)))
      const m = k(flat.extrude(p.thick))
      pieces.push(['Wand', m, 1])
      shown = m
      rows.push(['Loop', `${(b.max[0] - b.min[0]).toFixed(0)} × ${(b.max[1] - b.min[1]).toFixed(0)} mm, ${p.wire} mm wire${p.notches === 'yes' ? ', notched to hold mix' : ''}`])
      rows.push(['Make it', 'PETG or PLA, flat on the bed, no supports. Dip, lift slowly, blow gently or wave it.'])
    } else if (kind === 'triTop') {
      // a socket for the stick and a tab with two holes: the top string and the bottom string both tie on here
      const r = p.dowel / 2 + 0.25, w = 3.2, hd = p.ropeD + 1.5
      let m = k(cyl(34, r + w, 0).subtract(cyl(32, r, -0.01)))
      const tab = box(-(hd * 2 + 12) / 2, -5, 33, (hd * 2 + 12) / 2, 5, 33 + hd + 14)
      m = k(m.add(tab))
      for (const sx of [-1, 1]) m = k(m.subtract(k(k(k(Manifold.cylinder(14, hd / 2, hd / 2, 24)).rotate([90, 0, 0])).translate([sx * (hd / 2 + 3), 7, 33 + 7 + hd / 2]))))
      m = k(m.subtract(k(k(k(Manifold.cylinder(r * 2 + w * 2 + 2, 2.1, 2.1, 16)).rotate([0, 90, 0])).translate([-(r + w + 1), 0, 14])))) // a screw across holds it on the stick
      pieces.push(['Wand top (print 2)', m, 2])
      shown = m
      rows.push(['Giant bubbles', `Two sticks, each with a top. Tie a ${p.ropeD} mm cotton rope (about 1.2 m) between the two tops' left holes, and a longer one (about 2.4 m) between the right holes with the weighted bead on it: the two strings make the triangle that holds the film. Dip it all, lift, open the sticks slowly and walk backwards.`])
      rows.push(['Fit', `Ø${p.dowel} stick, 32 mm deep; a screw through the side hole holds it`])
    } else if (kind === 'bead') {
      const R = p.beadD / 2, rr = p.ropeD / 2 + 0.6
      let m = k(k(Manifold.sphere(R, 64)).subtract(cyl(p.beadD + 2, rr, -R - 1)))
      let pause = null
      if (p.shot > 0) {
        const vol = (p.shot / 4.6) * 1000, ri = rr + 2, ro = Math.sqrt(vol / (Math.PI * (R * 0.9)) + ri * ri)
        if (ro > R - 2.5) warns.push(`${p.shot} g of shot needs a bigger bead.`)
        const h = Math.min(R * 0.9, vol / (Math.PI * (ro * ro - ri * ri)))
        m = k(m.subtract(k(cyl(h, Math.min(ro, R - 2.5), -h / 2).subtract(cyl(h + 2, ri, -h / 2 - 1)))))
        pause = R + h / 2 - 0.3
      }
      const flat = k(m.translate([0, 0, R]))
      pieces.push(['Weighted bead', flat, 1])
      shown = flat
      rows.push(['Weight', `${(((m.volume() / 1000) * PETG) + (p.shot || 0)).toFixed(0)} g with ${p.shot} g of steel shot${pause ? ` · pause the print at ${pause.toFixed(1)} mm to pour it in` : ''}`])
      rows.push(['Use', 'Thread it onto the bottom string of a tri-string wand: it pulls the string down so the triangle opens. A tiny cut-down version is a good fishing weight for small wands.'])
    } else if (kind === 'ring') {
      // a big ring in four arcs that join with printed pins; one arc carries the handle socket
      const R = p.ringD / 2, w = 10, t = 7, segN = 4
      const arc = (a0, a1) => {
        const pts = [], n = 64
        for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([(R + w) * Math.cos(a), (R + w) * Math.sin(a)]) }
        for (let i = n; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / n; pts.push([R * Math.cos(a), R * Math.sin(a)]) }
        return k(new CS([pts], 'Positive'))
      }
      const segs = [], views = []
      for (let s2 = 0; s2 < segN; s2++) {
        const a0 = (2 * Math.PI * s2) / segN, a1 = (2 * Math.PI * (s2 + 1)) / segN
        let seg = k(arc(a0, a1).extrude(t))
        for (const a of [a0, a1]) { // a pin hole in each end, along the ring
          const cx = (R + w / 2) * Math.cos(a), cy = (R + w / 2) * Math.sin(a)
          const pin = k(k(k(k(Manifold.cylinder(20, 2.6, 2.6, 16)).rotate([0, 90, 0])).translate([-10, 0, t / 2])).rotate([0, 0, (a * 180) / Math.PI + 90]))
          seg = k(seg.subtract(k(pin.translate([cx, cy, 0]))))
        }
        if (s2 === 0) { // the handle socket sticks out from the middle of this arc
          const am = (a0 + a1) / 2, rs = p.dowel / 2 + 0.25
          let sock = k(k(Manifold.cylinder(40, rs + 3.2, rs + 3.2, 48)).subtract(k(k(Manifold.cylinder(40, rs, rs, 48)).translate([0, 0, 6]))))
          sock = k(k(k(sock.rotate([0, 90, 0])).translate([R + w - 2, 0, rs + 3.2])).rotate([0, 0, (am * 180) / Math.PI]))
          seg = k(seg.add(sock))
        }
        segs.push(seg); views.push(seg)
      }
      const pin = cyl(19, 2.4, 0, 0, 0, 16)
      pieces.push(['Ring arc with the handle socket', segs[0], 1], ['Ring arc', segs[1], 3], ['Joining pin', pin, 4])
      shown = k(Manifold.union(views))
      const bb = segs[1].boundingBox()
      if (Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) > (opts.bed || 300) - 4) warns.push('An arc is bigger than your bed: make the ring smaller.')
      rows.push(['Giant ring', `Ø${p.ringD} inside, in 4 arcs joined by 4 printed pins (a drop of glue). Wrap the whole ring in 100% cotton yarn or cotton rope: it holds the mix. Push a Ø${p.dowel} stick into the socket.`])
      rows.push(['Make bubbles', 'Dip the ring in a big tray (the Dipping Tray), lift it out, and walk slowly into the wind or sweep it through the air.'])
    } else if (kind === 'tray') {
      const L = p.trayL, W = p.trayW, H = p.trayH, wall = 3
      const rr = (l, w2, h, z = 0, inset = 0) => k(k(k(k(k(CS.square([l - 2 * inset, w2 - 2 * inset], true)).offset(-12 + inset, 'Round', 2, 16)).offset(12 - inset, 'Round', 2, 16)).extrude(h)).translate([0, 0, z]))
      let m = k(rr(L, W, H).subtract(rr(L, W, H, 3, wall)))
      // a sloped ramp at one end to slide a wand in and out, and a pour spout at a corner
      const pts = [[L / 2 - wall, 3], [L / 2 - wall - H * 1.4, 3], [L / 2 - wall, H - 2]]
      const wedge = k(k(k(k(new CS([pts], 'NonZero')).extrude(W - 2 * wall - 1)).rotate([90, 0, 0])).translate([0, (W - 2 * wall - 1) / 2, 0]))
      m = k(m.add(wedge))
      m = k(m.subtract(k(k(Manifold.cube([16, 16, 10], true)).translate([-L / 2 + 4, W / 2 - 4, H]))))
      pieces.push(['Dipping tray', m, 1])
      shown = m
      const vol = ((L - 2 * wall) * (W - 2 * wall) * (H - 5)) / 1e6
      rows.push(['Holds', `about ${vol.toFixed(1)} litres of mix · ${L} × ${W} mm, ${H} mm deep`])
      rows.push(['Make it', 'Print it bottom down, 3 walls, so it holds water; PETG. The ramp at one end lets a ring or string wand slide in flat.'])
    } else if (kind === 'net') {
      // a frame full of little loops: a cloud of bubbles from one swing
      const R = p.netD / 2, c = p.cell, wire = 3.2
      const loops = [], q = c + wire * 0.6
      for (let y = -R; y <= R; y += q * Math.sqrt(3) / 2) for (let x = -R; x <= R; x += q) {
        const xx = x + ((Math.round((y + R) / (q * Math.sqrt(3) / 2)) % 2) * q) / 2
        if (Math.hypot(xx, y) + c / 2 + wire < R - wire / 2) loops.push(k(k(k(CS.circle(c / 2 + wire / 2, 40)).subtract(k(CS.circle(c / 2 - wire / 2, 40)))).translate([xx, y])))
      }
      let flat = k(k(k(CS.circle(R, 96)).subtract(k(CS.circle(R - wire, 96)))).add(k(CS.union(loops))))
      // ties from each little loop to its neighbours happen where they touch; add spokes so every loop is held
      const spokes = []
      for (let i = 0; i < 6; i++) { const a = (Math.PI * i) / 3; spokes.push(k(k(CS.square([R * 2, 2.4], true)).rotate((a * 180) / Math.PI))) }
      flat = k(flat.add(k(k(CS.union(spokes)).intersect(k(CS.circle(R - 1, 96))))))
      flat = k(flat.add(handle2D(-R + wire, p.handle, 10)))
      const m = k(flat.extrude(4))
      pieces.push(['Bubble net', m, 1])
      shown = m
      rows.push(['Loops', `${loops.length} little loops of Ø${c} in a Ø${p.netD} frame: one swing throws a cloud of bubbles`])
    } else if (kind === 'clip') {
      const r = p.dowel / 2, w = 3.4, t = 10, hd = p.ropeD + 1.5
      let ring = k(k(CS.circle(r + w, 96)).subtract(k(CS.circle(r + 0.2, 96))))
      ring = k(ring.subtract(k(k(CS.square([r * 1.4, r + w + 2], false)).translate([-r * 0.7, 0]))))
      let flat = k(ring.add(k(k(k(CS.circle(hd / 2 + 4, 48)).subtract(k(CS.circle(hd / 2, 32)))).translate([0, -(r + w + hd / 2 + 2)]))))
      flat = k(flat.add(k(k(CS.square([8, 5], false)).translate([-4, -(r + w + 3)]))))
      const m = k(flat.extrude(t))
      pieces.push(['Rope clip (print 2)', m, 2])
      shown = m
      rows.push(['Use', `snaps onto a Ø${p.dowel} pole; tie the wand's cotton strings through the eye. Two clips turn any two poles into a giant-bubble wand.`])
      rows.push(['Make it', 'PETG or nylon, flat, 4 walls: it has to flex to snap on.'])
    } else if (kind === 'snake') {
      // a tube: blow in the narrow end, a sock or cloth stretched over the wide rim makes a bubble snake
      const R = p.tubeD / 2, L = p.tubeL
      const pts = [[R - 2, 0], [R + 3, 0], [R + 3, 4], [R + 1.2, 6], [R + 1.2, L * 0.65], [9, L - 6], [9, L], [6.5, L], [6.5, L - 6], [R - 0.8, L * 0.65], [R - 0.8, 0.01]]
      const m = k(k(new CS([pts], 'Positive')).revolve(96))
      pieces.push(['Snake blower', m, 1])
      shown = m
      rows.push(['Bubble snakes', 'Stretch an old sock, a cotton cloth or a bit of towel over the wide end and hold it with a rubber band (the rim stops it slipping). Dip the cloth in mix and blow gently through the mouthpiece: out comes a long snake of tiny bubbles. Add food colouring to the cloth for rainbow snakes. Blow out, never suck in.'])
    } else if (kind === 'cup') {
      // a cup with raised rings at the fill lines of a giant-bubble recipe
      const R = p.cupD / 2, wall = 2.4, area = Math.PI * (R - wall) ** 2
      const steps = [['water', p.water], ['washing-up liquid', p.soap], ['glycerine', p.glyc]].filter(([, v]) => v > 0)
      let acc = 0
      const lines = steps.map(([n, v]) => { acc += v * 1000; return [n, 3 + acc / area] })
      const H = Math.max(40, acc / area + 18)
      let m = k(cyl(H, R, 0, 0, 0, 96).subtract(cyl(H, R - wall, 3, 0, 0, 96)))
      const rings = lines.map(([, z], i) => k(k(k(k(CS.circle(0.8, 12)).translate([R + 0.1, 0])).revolve(96)).translate([0, 0, z])))
      // dots by each line say which step it is: one dot, two, three
      const dots = []
      lines.forEach(([, z], i) => { for (let j = 0; j <= i; j++) dots.push(k(k(Manifold.sphere(1.4, 12)).translate([R + 0.4, -6 + j * 5, z + 4]))) })
      m = k(m.add(k(Manifold.union([...rings, ...dots]))))
      pieces.push(['Recipe cup', m, 1])
      shown = m
      rows.push(['Fill lines', lines.map(([n, z], i) => `${'●'.repeat(i + 1)} ${n} to ${z.toFixed(0)} mm`).join(' · ')])
      rows.push(['Recipe', `${p.water} ml water, ${p.soap} ml washing-up liquid, ${p.glyc} ml glycerine. Stir gently (no froth) and let it rest a few hours: old mix makes better bubbles. For giants, a pinch of guar gum mixed into the glycerine first.`])
      if (H > 230) warns.push('That much mix makes a very tall cup: make it wider.')
    } else if (kind === 'frame') {
      // a wire-frame solid: dip it and the film inside makes a little square (or triangle) bubble in the middle
      const s = p.side, b = p.bar / 2, shape = p.frameShape || 'cube'
      let V, E
      if (shape.startsWith('pyramid')) { const h = s * Math.sqrt(2 / 3); V = [[0, 0, 0], [s, 0, 0], [s / 2, (s * Math.sqrt(3)) / 2, 0], [s / 2, (s * Math.sqrt(3)) / 6, h]]; E = [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]] }
      else if (shape.startsWith('tri')) { const t = (s * Math.sqrt(3)) / 2; V = [[0, 0, 0], [s, 0, 0], [s / 2, t, 0], [0, 0, s], [s, 0, s], [s / 2, t, s]]; E = [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3], [0, 3], [1, 4], [2, 5]] }
      else { V = []; for (const z of [0, s]) for (const [x, y] of [[0, 0], [s, 0], [s, s], [0, s]]) V.push([x, y, z]); E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] }
      const ball = k(Manifold.sphere(b, 12)), bars = []
      for (const [a, c2] of E) bars.push(k(Manifold.hull([k(ball.translate(V[a])), k(ball.translate(V[c2]))])))
      const top = Math.max(...V.map((v) => v[2])), cx = V.reduce((a, v) => a + v[0], 0) / V.length, cy = V.reduce((a, v) => a + v[1], 0) / V.length
      const topV = V.filter((v) => v[2] === top)
      for (const v of topV) bars.push(k(Manifold.hull([k(ball.translate(v)), k(ball.translate([cx, cy, top]))]))) // braces to the handle
      bars.push(k(Manifold.hull([k(ball.translate([cx, cy, top])), k(k(Manifold.sphere(3, 16)).translate([cx, cy, top + 80]))])))
      let m = k(Manifold.union(bars))
      m = k(m.translate([0, 0, b]))
      pieces.push([`${shape[0].toUpperCase() + shape.slice(1).split(' ')[0]} bubble frame`, m, 1])
      shown = m
      rows.push(['Science toy', `Dip the whole ${shape.split(' ')[0]} in mix and lift it out: the films meet in the middle and a little flat-sided bubble appears there. Poke it with a wet straw to blow a bubble into the centre.`])
      rows.push(['Make it', 'Stand it on its base as shown; the top bars bridge, so print a little slower with the fan on.'])
    } else if (kind === 'wheel') {
      // a hand-crank wheel: its loops dip through the trough as it turns
      const R = p.wheelD / 2, n = Math.round(p.loops), lr = 13, wire = 3.2, t = 5
      let wf = k(k(CS.circle(R, 96)).subtract(k(CS.circle(R - 6, 96))))
      const sp = [], lp = []
      for (let i = 0; i < 4; i++) sp.push(k(k(CS.square([2 * R - 4, 6], true)).rotate(45 * i)))
      for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n; lp.push(k(k(k(CS.circle(lr + wire / 2, 40)).subtract(k(CS.circle(lr - wire / 2, 40)))).translate([(R + lr - 1) * Math.cos(a), (R + lr - 1) * Math.sin(a)]))) }
      wf = k(k(CS.union([wf, ...sp, ...lp, k(CS.circle(10, 48))])).subtract(k(CS.square([6.4, 6.4], true)))) // a square hole so the crank turns it
      const wheel = k(wf.extrude(t))
      const outR = R + 2 * lr, axleZ = outR + 12, trL = 2 * outR + 30, trW = 50
      let base = k(box(-trL / 2, -trW / 2, 0, trL / 2, trW / 2, 45).subtract(box(-trL / 2 + 3, -trW / 2 + 3, 3, trL / 2 - 3, trW / 2 - 3, 46)))
      for (const sy of [-1, 1]) base = k(base.add(box(-12, sy > 0 ? trW / 2 - 6 : -trW / 2, 0, 12, sy > 0 ? trW / 2 : -trW / 2 + 6, axleZ + 12)))
      base = k(base.subtract(k(k(k(Manifold.cylinder(trW + 4, 4.4, 4.4, 24)).rotate([90, 0, 0])).translate([0, trW / 2 + 2, axleZ]))))
      const crank = k(Manifold.union([k(k(Manifold.cube([6, 6, trW + 6], true)).translate([0, 0, 0])), cyl(trW / 2 - 3, 4, -trW / 2 - 3 + 0.01), box(-4, -4, trW / 2 + 3, 40, 4, trW / 2 + 9), cyl(30, 5, trW / 2 + 9, 36, 0)]))
      const wheelShown = k(k(k(wheel.translate([0, 0, -t / 2])).rotate([90, 0, 0])).translate([0, 0, axleZ]))
      pieces.push(['Wheel', wheel, 1], ['Trough with axle stands', base, 1], ['Crank and axle', k(k(crank.rotate([0, 90, 0])).translate([0, 0, 6])), 1])
      shown = k(Manifold.union([base, wheelShown]))
      rows.push(['How it works', `Fill the trough to about 20 mm. Turn the crank: each of the ${n} loops dips through the mix at the bottom and lifts a film into the air, where a fan or the breeze blows it into a bubble.`])
      rows.push(['Make it', 'Print all three flat; the square axle pushes through the stands into the wheel. PETG.'])
    }
    // print pieces: lay each on the bed
    const meshes = {}
    const out = []
    pieces.forEach(([label, m, n], i) => {
      const b = m.boundingBox()
      meshes[`toy_${i}`] = meshData(k(m.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]])))
      out.push({ key: `toy_${i}`, label, n })
    })
    const sb = shown.boundingBox()
    meshes.combined = meshData(k(shown.translate([-(sb.min[0] + sb.max[0]) / 2, -(sb.min[1] + sb.max[1]) / 2, -sb.min[2]])))
    const g = pieces.reduce((a, [, m, n]) => a + ((m.volume() / 1000) * (opts.density || PETG)) * n, 0)
    const span = Math.max(sb.max[0] - sb.min[0], sb.max[1] - sb.min[1], sb.max[2] - sb.min[2])
    const circle = []
    for (let i = 0; i < 48; i++) circle.push([(span / 2) * Math.cos((2 * Math.PI * i) / 48), (span / 2) * Math.sin((2 * Math.PI * i) / 48)])
    return {
      bubbleToy: { kind, rows, pieces: out },
      meshes,
      viewR: Math.max(40, span * 0.65),
      polygons: { base: [circle], relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: g, gramsTotal: g, warns, height: sb.max[2] - sb.min[2] },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function bubbleToyDesigns() {
  const d = (id, name, group, kind, blurb, extra = {}) => ({ id, name, group, bubbleToy: true, kind, added: '2026-11-23', blurb, params: (TOY_PARAMS[extra.pk || kind] || []).map((x) => ({ ...x })), draw: () => {}, ...extra })
  return [
    // giant bubbles
    d('gbTriTop', 'Tri-String Wand Tops', 'BubbleGiant', 'triTop', 'The classic giant-bubble wand: two sticks and a triangle of cotton rope. These tops push onto any dowel or broom handle and hold both strings, so two sticks become a wand that makes bubbles as big as a car.'),
    d('gbBead', 'Weighted Bubble Bead', 'BubbleGiant', 'bead', 'The weight on the bottom string of a giant-bubble wand: a bead with steel shot inside that pulls the triangle open. The rope threads through the middle.'),
    d('gbRing', 'Giant Ring Wand', 'BubbleGiant', 'ring', 'A giant bubble ring in four click-together arcs (pinned and glued), with a socket for a stick. Wrap it in cotton yarn and sweep it through the air for huge, wobbling bubbles.'),
    d('gbTray', 'Bubble Dipping Tray', 'BubbleGiant', 'tray', 'A big, shallow tray for giant-bubble mix, with a ramp at one end so ring and string wands slide in flat, and a corner to pour from.'),
    d('gbNet', 'Bubble Net', 'BubbleGiant', 'net', 'A frame packed with little loops: one swing and a whole cloud of bubbles pours out. The biggest bubble count per dip of anything here.'),
    d('gbClip', 'Pole Rope Clips', 'BubbleGiant', 'clip', 'Two snap-on clips that turn any two poles (tent poles, broom handles, your dragon staff) into a giant-bubble wand: tie the cotton strings through the eyes.'),
    // circus wands
    d('cwTent', 'Big Top Wand', 'BubbleCircus', 'circus', 'A circus tent with its flag flying: blows big-top-shaped bubbles (well, round ones, from a tent).', { pk: 'wand', theme: 'tent' }),
    d('cwElephant', 'Elephant Wand', 'BubbleCircus', 'circus', 'An elephant with a curling trunk, standing on its legs: dip and blow a trunkful of bubbles.', { pk: 'wand', theme: 'elephant' }),
    d('cwLion', 'Lion Wand', 'BubbleCircus', 'circus', 'A lion\'s head with a big scalloped mane and two little ears.', { pk: 'wand', theme: 'lion' }),
    d('cwClown', 'Clown Wand', 'BubbleCircus', 'circus', 'A clown\'s face with a pointy hat and pom-pom, and a bow tie underneath.', { pk: 'wand', theme: 'clown' }),
    d('cwDumbbell', 'Strongman Wand', 'BubbleCircus', 'dumbbell', 'The strongman\'s dumbbell: two round plates, two bubbles at once.', { pk: 'wand' }),
    d('cwStar', 'Ringmaster Star Wand', 'BubbleCircus', 'circus', 'A five-point star for the ringmaster: notched all round to hold plenty of mix.', { pk: 'wand', theme: 'star' }),
    // other bubble makers
    d('boSnake', 'Bubble Snake Blower', 'BubbleOther', 'snake', 'Stretch a sock or cloth over the wide end, dip, and blow: a long snake of foam bubbles comes out. Colour the cloth for rainbow snakes.'),
    d('boCup', 'Bubble Recipe Cup', 'BubbleOther', 'cup', 'A mixing cup with raised fill lines for a giant-bubble recipe: water to the first line, washing-up liquid to the second, glycerine to the third. Change the recipe and the lines move.'),
    d('boFrame', 'Cube Bubble Frame', 'BubbleOther', 'frame', 'A wire-frame cube (or pyramid, or prism) on a handle: dip it and the films meet in the middle in a little flat-sided bubble. Bubble science.'),
    d('boWheel', 'Hand-Crank Bubble Wheel', 'BubbleOther', 'wheel', 'A bubble machine you turn by hand: a wheel of loops dips through a trough of mix and lifts films into the breeze. Three parts, no glue.'),
  ]
}
