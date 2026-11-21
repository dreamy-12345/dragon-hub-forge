/**
 * Silicone and rubber moulds for contact staff balls, rope dart heads and poi.
 * Two ways to make one:
 *
 *   printed mould  Print a rigid two-part mould (PLA or PETG) and pour silicone
 *                  or urethane rubber straight into it: the cast IS the end, soft
 *                  and grippy. Split down the middle through the axis, with
 *                  registration keys, bolt holes, a pour funnel and air vents.
 *                  A printed core pin makes the pole socket in a ball; a cast-in
 *                  M8 nut (or a moulded eye) takes the rope or leash on a dart or poi.
 *   mould box      Print the shape itself (the master) plus a mould box and a
 *                  parting board, pour silicone or rubber round the master in two
 *                  halves, and you have a flexible mould to cast as many copies as
 *                  you like: resin, rubber, or wax for lost-wax brass.
 *
 * Units mm. The part stands on its axis (z up) the way it is poured; the mould
 * splits on the plane y = 0, which holds the axis. Printed halves lie with the
 * split face up, so nothing needs supports.
 */
import { TAU } from './geom.js'
import { ballMaster, BALL_PARAMS } from './balls.js'
import { buildDart, DART_PARAMS } from './darts.js'

export const RUBBERS = {
  'platinum silicone 30A': { d: 1.08, silicone: true, note: 'The all-rounder: soft, grippy, lasts for years, skin safe once cured. Mix 1:1.' },
  'platinum silicone 20A (extra soft)': { d: 1.07, silicone: true, note: 'Squishy and kind to the body; tears more easily, so not for eyes or nuts.' },
  'platinum silicone 50A (firm)': { d: 1.15, silicone: true, note: 'Firm and tough: the one for rope darts and poi that pull on a cast-in nut or a moulded eye.' },
  'tin silicone 25A (cheaper, moulds only)': { d: 1.12, silicone: true, tin: true, note: 'Cheaper and never inhibited by prints, but it shrinks a little and is not skin safe: use it for mould boxes, not ends you touch.' },
  'urethane rubber 60A (tough, cheaper)': { d: 1.04, urethane: true, note: 'Tougher than silicone and cheaper. Sticks to everything: seal the print and use release.' },
  'heavy: silicone 30A with steel shot': { d: 2.4, silicone: true, heavy: true, note: 'About 2 parts fine steel shot to 1 part mixed silicone by weight, stirred in just before pouring: more than twice the weight. Printed moulds only.' },
}
const COPIES = {
  'urethane resin (hard)': { d: 1.08, hot: false },
  'urethane rubber (soft)': { d: 1.04, hot: false },
  'silicone (needs release)': { d: 1.08, hot: false },
  'casting wax (lost-wax brass)': { d: 0.95, hot: false, brass: true },
  'low-melt pewter (high-heat silicone)': { d: 7.3, hot: true },
}

const PRINTED = 'printed mould: cast the end in rubber'
const BOX = 'mould box: make a rubber mould, cast copies'
const isBox = (p) => (p.method || '').startsWith('mould box')

export const MOULD_PARAMS = [
  { key: 'method', label: 'Mould', options: [PRINTED, BOX], value: PRINTED, rerender: true, hint: 'Printed mould: print a hard mould and pour silicone or urethane rubber into it; the cast is your end. Mould box: print the shape and a box, pour silicone round it to make a flexible mould, then cast copies in resin, rubber or wax.' },
  { key: 'rubber', label: 'Rubber', options: Object.keys(RUBBERS), value: 'platinum silicone 30A', hint: 'Printed mould: what the end is made of. Mould box: what the flexible mould is made of.' },
  { key: 'copies', label: 'Cast copies in', options: Object.keys(COPIES), value: 'urethane resin (hard)', showIf: isBox, hint: 'What you pour into the finished rubber mould.' },
  { key: 'mwall', label: 'Mould wall', unit: 'mm', min: 6, max: 25, step: 0.5, value: 10, hint: 'Printed mould: plastic round the cavity. Mould box: rubber round the shape (10 mm is plenty for silicone).' },
  { key: 'clamp', label: 'Hold it shut with', options: ['M5 bolts and wing nuts', 'clamps or rubber bands'], value: 'M5 bolts and wing nuts', showIf: (p) => !isBox(p) },
]

const PETG = 1.27
const SHANKS = [30, 40, 50, 60, 70, 80, 100, 120]

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

// 2D helpers on the split face (x, z)
const segDist = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0
  return Math.hypot(px - ax - t * dx, pz - az - t * dz)
}
function clearance(polys, px, pz) {
  let d = Infinity, inside = false
  for (const poly of polys) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i]
    d = Math.min(d, segDist(px, pz, ax, az, bx, bz))
    if ((bz > pz) !== (az > pz) && px < ((ax - bx) * (pz - bz)) / (az - bz) + bx) inside = !inside
  }
  return inside ? -d : d
}

export function buildMould(wasm, p, opts = {}) {
  const { CrossSection, Manifold, Mesh } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const kind = opts.kind || 'ball', style = opts.style || 'smooth'
    const box = isBox(p)
    const rub = RUBBERS[p.rubber] || RUBBERS['platinum silicone 30A']
    const warns = []
    const W = p.mwall
    const cyl = (r, z0, z1, x = 0, n = 32, r2 = r) => k(k(Manifold.cylinder(z1 - z0, r, r2, n)).translate([x, 0, z0]))
    const along = (r, x, z, len, r2 = r, n = 32) => k(k(k(Manifold.cylinder(len, r, r2, n)).rotate([-90, 0, 0])).translate([x, 0, z])) // along +y from y = 0

    // --- the master: the shape that is cast, standing the way it is poured ---
    let master, top, pin = null, pinR = 0, R, hw = [] // hw: hardware shown in the view (metal)
    let sprX, sprZ, sprR, vents = [], channels = [], cavityExtra = []
    let nut = null, bore = null
    const sliceR = (m, z) => Math.sqrt(Math.max(0, k(m.slice(z)).area()) / Math.PI)
    if (kind === 'ball') {
      R = p.ballD / 2
      // the neck (no pattern there) goes to the top, where the pole goes in
      master = k(ballMaster(wasm, k, R, style, p).rotate([180, 0, 0]))
      top = R
      // the core pin makes the socket: a little under the pole so the rubber grips it
      pinR = (p.poleOD - (p.squeeze ?? 1)) / 2
      const depth = Math.min(p.depth, R + R * 0.55)
      bore = { d: 2 * pinR, depth }
      if (pinR + 6 > R * 0.7) warns.push(`A Ø${p.poleOD} pole needs a ball of at least ${Math.ceil((pinR + 6) / 0.35)} mm for a strong neck.`)
      sprR = 4; sprX = pinR + 0.5 * (R - pinR); sprZ = 0
      vents.push([-sprX, 0])
      pin = { z0: R - depth }
    } else {
      // rope dart or poi head from the dart builder, eye up, tip down
      const nutWay = (p.attach || '').startsWith('cast-in')
      const d = buildDart(wasm, { ...p, attach: nutWay ? 'swivel socket (M8)' : 'eye' }, { style, cnc: true })
      const { positions, indices } = d.meshes.combined
      master = k(k(new Manifold(new Mesh({ numProp: 3, vertProperties: positions, triVerts: indices }))).translate([0, 0, d.dart.H / 2]))
      top = master.boundingBox().max[2]
      R = d.dart.R
      if (nutWay) master = k(master.add(cyl(3.6, top - 19, top))) // fill the tapped hole: the nut makes the thread
      // where it is widest: the pour goes in there, clear of the eye or the nut
      let zMax = 0, rMax = 0
      for (let i = 1; i < 40; i++) { const z = (top * i) / 40, r = sliceR(master, z); if (r > rMax) (rMax = r), (zMax = z) }
      sprR = Math.max(2.5, Math.min(3.5, rMax * 0.2)); sprX = Math.max(nutWay ? 4.2 + sprR + 2 : 0, rMax * 0.6); sprZ = zMax
      if (sprX + sprR > rMax - 1) sprX = rMax - sprR - 1
      vents.push([-sprX, zMax])
      if (!nutWay) vents.push([0, top - 1.5]) // the top of the eye boss traps air
      if (nutWay) {
        // a hex nut and a big washer cast in, screwed onto a plain M8 bolt that holds them from the top of the mould
        let washer = 12, zn = null
        for (const wr of [12, 8]) {
          for (let z = top - 10; z > top * 0.3; z -= 1) if (sliceR(master, z) >= wr + 3.5 && sliceR(master, z - 7) >= wr + 3.5) { zn = z; break }
          if (zn !== null) { washer = wr; break }
        }
        if (zn === null) { zn = top - 12; washer = 8; warns.push('This head is too slim for a cast-in nut and washer: use the moulded eye, or make it wider.') }
        nut = { z: zn, washer }
        channels.push(cyl(4.2, top - 1, top + W + 1, 0, 24))
        if ((p.rubber || '').includes('20A')) warns.push('20A silicone is too soft to hold a cast-in nut on a swinging head: use 50A or urethane rubber.')
      } else if (!(p.rubber || '').includes('50A') && !(p.rubber || '').startsWith('urethane')) warns.push('A rubber eye takes the whole pull of the rope: cast it in 50A silicone or urethane rubber, or pick the cast-in nut.')
    }
    const bb = master.boundingBox()
    const x0 = bb.min[0] - W, x1 = bb.max[0] + W, z0 = bb.min[2] - W, z1 = top + W
    const ymax = Math.max(-bb.min[1], bb.max[1]) + W

    // pour funnel, sprue and vents, all on the split plane so each half carries half of them
    const funnelH = Math.min(10, W)
    channels.push(cyl(sprR, sprZ, z1 + 1, sprX), cyl(sprR, z1 - funnelH, z1 + 0.01, sprX, 32, sprR + funnelH * 0.9))
    for (const [vx, vz] of vents) channels.push(cyl(1.6, vz, z1 + 1, vx, 16))
    if (pin) {
      pin.top = z1
      channels.push(cyl(pinR + 0.15, R - 1, z1 + 1, 0, 64))
    }
    const cavity = k(Manifold.union([master, ...channels]))

    // the cast part (what comes out of a printed mould): the master less the pin's socket
    let cast = master
    if (pin) cast = k(master.subtract(cyl(pinR, pin.z0, R + 1, 0, 64)))

    // where the bolts and keys can go: clear of the cavity on the split face
    const face = k(k(cavity.rotate([90, 0, 0])).slice(0)).toPolygons().map((poly) => poly.map(([x, y]) => [x, -y]))
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
    const pick = (need, edge, avoid) => {
      const out = []
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        let best = null, bd = -1
        for (let x = x0 + edge; x <= x1 - edge; x += 1.5) for (let z = z0 + edge; z <= z1 - edge; z += 1.5) {
          if ((x - cx) * sx < 0 || (z - cz) * sz < 0) continue
          if (clearance(face, x, z) < need) continue
          if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue
          const dd = Math.hypot(x - cx, z - cz)
          if (dd > bd) (bd = dd), (best = [x, z])
        }
        if (best) out.push(best)
      }
      return out
    }
    const bolts = !box && (p.clamp || '').startsWith('M5') ? pick(2.75 + 3, 6, []) : []
    const keys = pick(4.3 + 3, 6, [...bolts.map(([x, z]) => [x, z, 2.75 + 4.3 + 3]), [sprX, z1, sprR + funnelH + 6]])
    if (keys.length < 2) warns.push('There is little room for registration keys: make the mould wall thicker.')
    if (!box && (p.clamp || '').startsWith('M5') && bolts.length < 4) warns.push('Not every corner has room for a bolt: make the mould wall thicker, or hold it with clamps.')

    const meshes = {}
    // drop zero-volume slivers a boolean can leave behind
    const clean = (m, min = 1) => { const ps = m.decompose(); const keep = ps.filter((q) => q.volume() > min); const out = keep.length === ps.length ? m : k(Manifold.compose(keep)); for (const q of ps) live.push(q); return out }
    const parts = [] // [label, file suffix, manifold, how many]
    let plugsN = 0
    let view, gPrint = 0, rubberG = 0, copyG = 0, rubberMl = 0
    const footprint = []
    const flatUp = (m, side) => { // split face up, on the bed
      const r = k(m.rotate([side < 0 ? 90 : -90, 0, 0]))
      const b = r.boundingBox()
      return k(r.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]]))
    }
    const flatDown = (m, side) => { // split face down, on the bed
      const r = k(m.rotate([side < 0 ? -90 : 90, 0, 0]))
      const b = r.boundingBox()
      return k(r.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]]))
    }

    // the core pin: rests on the top of the mould by its flange, with a grip to pull it out by
    let pinM = null
    if (pin) {
      pinM = k(Manifold.union([cyl(pinR, pin.z0, z1 + 0.01, 0, 64), cyl(pinR + 7, z1, z1 + 3, 0, 64), cyl(4, z1 + 3, z1 + 15, 0, 24)]))
      // a little chamfer on its tip so it slides in
      pinM = k(pinM.subtract(k(k(k(Manifold.cylinder(1.2, pinR + 1, pinR - 0.2, 64)).translate([0, 0, pin.z0 - 0.01])).subtract(cyl(pinR - 1.2, pin.z0 - 1, pin.z0 + 2, 0, 64)))))
    }
    if (nut) {
      const zt = z1 + 6 // the bolt head sits on top of the mould
      const hex = (r, za, zb) => cyl(r, za, zb, 0, 6)
      hw.push(cyl(4, nut.z - 7.5, zt, 0, 24), hex(7.5, z1, zt), hex(7.5, nut.z - 6.5, nut.z), cyl(nut.washer, nut.z, nut.z + 1.6, 0, 32))
      nut.bolt = SHANKS.find((s) => s >= z1 - (nut.z - 7.5)) || 120
    }

    if (!box) {
      // --- printed mould: a block, split in two, keys on one half, sockets on the other ---
      const block = k(k(Manifold.cube([x1 - x0, 2 * ymax, z1 - z0], false)).translate([x0, -ymax, z0]))
      let mould = k(block.subtract(cavity))
      for (const [bx, bz] of bolts) mould = k(mould.subtract(k(along(2.75, bx, bz, 2 * ymax + 2).translate([0, -ymax - 1, 0])))) // M5 clearance
      let A = k(mould.trimByPlane([0, -1, 0], 0)), B = k(mould.trimByPlane([0, 1, 0], 0))
      if (keys.length) {
        A = k(A.add(k(Manifold.union(keys.map(([x, z]) => k(along(4.1, x, z, 3.5, 2.2).translate([0, -0.5, 0])))))))
        B = k(B.subtract(k(Manifold.union(keys.map(([x, z]) => k(along(4.3, x, z, 3.3, 2.5).translate([0, -0.01, 0])))))))
      }
      // pry slots at the bottom corners so a screwdriver can split it
      A = clean(A); B = clean(B)
      const pry = k(Manifold.union([x0, x1].map((x) => k(k(Manifold.cube([8, 3, 4], true)).translate([x, 0, z0])))))
      A = k(A.subtract(pry)); B = k(B.subtract(pry))
      const gap = Math.max(25, ymax * 0.45)
      view = [k(A.translate([0, -gap, 0])), k(B.translate([0, gap, 0]))]
      meshes.halfAFlat = meshData(flatUp(A, -1))
      meshes.halfBFlat = meshData(flatUp(B, 1))
      parts.push(['Mould half A (keys)', 'A', A, 1], ['Mould half B (sockets)', 'B', B, 1])
      footprint.push([x1 - x0, z1 - z0, ymax])
      const cav = cast.volume()
      rubberMl = cav / 1000 + (channels.length ? 4 : 0)
      rubberG = (cav / 1000) * rub.d
      if (rub.heavy) warns.push('Steel shot sinks: stir it in well, pour quickly, and keep the mould turning slowly for the first few minutes, or the weight ends up all at the bottom.')
      if (rub.tin) warns.push('Tin silicone is not skin safe and shrinks: for an end you hold, cast platinum silicone or urethane rubber.')
    } else {
      // --- mould box: a two-part rubber mould poured round a printed master ---
      if (rub.heavy) warns.push('Steel-shot silicone is for printed moulds only; the mould box uses plain silicone.')
      const copy = COPIES[p.copies] || COPIES['urethane resin (hard)']
      const mAll = cavity // master with its sprue, vents and pin print reaching the edge of the rubber
      const masterOnly = k(mAll.intersect(k(k(Manifold.cube([x1 - x0, 2 * ymax + 2, z1 - z0], false)).translate([x0, -ymax - 1, z0]))))
      // two halves of the master, printed flat, joined with two filament dowels
      let mA = k(masterOnly.trimByPlane([0, -1, 0], 0)), mB = k(masterOnly.trimByPlane([0, 1, 0], 0))
      const mface = k(k(master.rotate([90, 0, 0])).slice(0)).toPolygons().map((poly) => poly.map(([x, y]) => [x, -y]))
      const dowels = []
      for (let z = bb.min[2] + 4; z < top - 4; z += 2) for (const x of [0]) if (clearance(mface, x, z) < -3.5) dowels.push([x, z])
      const dw = dowels.length ? [dowels[Math.floor(dowels.length * 0.2)], dowels[Math.floor(dowels.length * 0.8)]] : []
      if (pin) dw.splice(0, dw.length, ...[[R * 0.45, -R * 0.2], [-R * 0.45, -R * 0.2]].filter(([x, z]) => clearance(mface, x, z) < -3.5))
      for (const [x, z] of dw) {
        mA = k(mA.subtract(k(along(1.0, x, z, 6).translate([0, -6, 0]))))
        mB = k(mB.subtract(along(1.0, x, z, 6)))
      }
      // the parting board: sits under the first half, the master pressed into its cut-out
      const fw = 5, ear = 7, T = 4
      const ox0 = x0 - fw, ox1 = x1 + fw, oz0 = z0 - fw, oz1 = z1 + fw
      const ears = [[ox0 - ear, oz0 - ear], [ox1 + ear, oz0 - ear], [ox0 - ear, oz1 + ear], [ox1 + ear, oz1 + ear]].map(([x, z]) => [x + (x < cx ? ear : -ear) * 0.5, z + (z < cz ? ear : -ear) * 0.5])
      const slab = (ya, yb, inner) => {
        let s = k(k(Manifold.cube([ox1 - ox0, yb - ya, oz1 - oz0], false)).translate([ox0, ya, oz0]))
        for (const [ex, ez] of ears) s = k(s.add(k(k(Manifold.cube([2 * ear + 4, yb - ya, 2 * ear + 4], true)).translate([ex, (ya + yb) / 2, ez]))))
        if (inner) s = k(s.subtract(k(k(Manifold.cube([x1 - x0, yb - ya + 2, z1 - z0], false)).translate([x0, ya - 1, z0]))))
        for (const [ex, ez] of ears) s = k(s.subtract(k(along(2.2, ex, ez, yb - ya + 2).translate([0, ya - 1, 0]))))
        return s
      }
      let board = slab(-T, 0, false)
      const cut = k(k(k(new CrossSection(face, 'NonZero')).offset(0.2, 'Round', 2, 12)).extrude(T + 2))
      // the cut-out goes through the board along y: the section is in (x, z)
      // the prism is in (x, z, thickness): turn it so the thickness runs down y through the board
      board = k(board.subtract(k(k(cut.rotate([90, 0, 0])).translate([0, 1, 0]))))
      if (keys.length) board = k(board.subtract(k(Manifold.union(keys.map(([x, z]) => k(along(2.2, x, z, 3.01, 4.3).translate([0, -3, 0])))))))
      board = clean(board, 60) // keeps the eye plug (it prints with the board), drops slivers
      plugsN = board.decompose().length - 1
      for (const q of board.decompose()) live.push(q)
      const hA = ymax, frame = slab(0, hA, true)
      const frameB = k(frame.translate([0, -T - hA, 0]))
      view = [frame, board, frameB].map((m) => k(m.rotate([90, 0, 0]))) // poured with the split face level
      meshes.masterAFlat = meshData(flatDown(mA, -1))
      meshes.masterBFlat = meshData(flatDown(mB, 1))
      const fr = k(frame.rotate([-90, 0, 0])); const fb = fr.boundingBox()
      meshes.frameFlat = meshData(k(fr.translate([0, 0, -fb.min[2]])))
      const bbB = k(board.rotate([-90, 0, 0])).boundingBox()
      meshes.boardFlat = meshData(k(k(board.rotate([-90, 0, 0])).translate([0, 0, -bbB.min[2]])))
      parts.push(['Master, half 1', 'master-1', mA, 1], ['Master, half 2', 'master-2', mB, 1], ['Parting board', 'board', board, 1], ['Mould box frame', 'frame', frame, 2])
      footprint.push([ox1 - ox0 + 2 * ear, oz1 - oz0 + 2 * ear, hA])
      const inner = (x1 - x0) * (z1 - z0) * hA
      rubberMl = (2 * inner - masterOnly.volume()) / 1000
      rubberG = rubberMl * rub.d
      copyG = (cast.volume() / 1000) * copy.d
      if (copy.hot && !(p.rubber || '').startsWith('platinum') && !(p.rubber || '').startsWith('tin')) warns.push('Molten pewter needs a high-heat silicone mould (rated over 300 °C): never urethane.')
      if (copy.hot) warns.push('Pewter: pour outside, leather gloves and goggles, the mould bone dry (any water spits molten metal). Lead-free pewter only.')
      if (copy.d < 1.1 && (p.rubber || '').startsWith('urethane') && !p.copies.startsWith('casting')) warns.push('Urethane sticks to urethane: with a urethane rubber mould, use release on every cast.')
      if (copy.brass) warns.push('Lost-wax brass: cast the copy in wax, then a foundry or casting shop invests it and pours brass. Ask them for the sprue size they want.')
    }

    // the cast part in the view (and the core pin, nut and bolt)
    meshes.combined = meshData(k(Manifold.union(view)))
    meshes.practice = meshData(cast)
    if (pinM) hw.push(pinM)
    if (hw.length) meshes.rods = meshData(k(Manifold.union(hw)))
    if (!box) {
      // stand the open mould up in the view: pour direction up the screen, the halves opened left and right
      for (const key of ['combined', 'practice', 'rods']) {
        const P = meshes[key]?.positions
        if (!P) continue
        for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1], z = P[i + 2]; P[i] = y; P[i + 1] = z - (z0 + z1) / 2; P[i + 2] = x }
      }
    }
    if (box) {
      // in the box view the master lies with its split face level
      meshes.practice = meshData(k(cast.rotate([90, 0, 0])))
      if (hw.length) meshes.rods = meshData(k(k(Manifold.union(hw)).rotate([90, 0, 0])))
    }
    meshes.castFlat = meshData(cast)
    if (pinM) {
      const fl = k(pinM.rotate([180, 0, 0])); const b = fl.boundingBox()
      meshes.pinFlat = meshData(k(fl.translate([0, 0, -b.min[2]])))
      parts.push(['Core pin (makes the pole socket)', 'pin', pinM, 1])
    }
    for (const [, , m, n] of parts) gPrint += (m.volume() / 1000) * PETG * n
    const rect = [[x0, z0 - cz], [x1, z0 - cz], [x1, z1 - cz], [x0, z1 - cz]]
    return {
      mould: {
        kind, box, R, rubber: p.rubber, rub, copies: p.copies,
        castG: (cast.volume() / 1000) * rub.d, castMl: cast.volume() / 1000, rubberG, rubberMl, copyG,
        bolts: bolts.length, keys: keys.length, plugs: typeof plugsN === 'number' ? plugsN : 0, bore, nut, pin: !!pinM,
        size: [x1 - x0, 2 * ymax, z1 - z0], footprint: footprint[0], gPrint,
        parts: parts.map(([label, file, , n]) => ({ label, file, n })),
      },
      meshes,
      viewR: Math.max(x1 - x0, z1 - z0, 2 * ymax) * 0.75,
      polygons: { base: [rect], relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: gPrint, gramsTotal: gPrint, warns, height: z1 - z0 },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function mouldDesigns() {
  const poleParam = { key: 'poleOD', unit: 'mm', min: 10, max: 40, step: 0.1, value: 22, presets: [13, 16, 22] }
  const pick = (list, keys, over = {}) => list.filter((x) => keys.includes(x.key)).map((x) => ({ ...x, ...(over[x.key] !== undefined ? { value: over[x.key] } : {}) }))
  const ballP = (extra = [], over = {}) => [
    ...pick(BALL_PARAMS, ['ballD'], over),
    { key: 'depth', label: 'Socket depth', unit: 'mm', min: 20, max: 70, step: 1, value: 38, hint: 'How far the pole goes in. The core pin makes the socket.' },
    { ...poleParam, label: 'Pole (OD)', hint: 'The core pin is a little under this so the rubber grips the pole.' },
    { key: 'squeeze', label: 'Grip', unit: 'mm', min: 0, max: 3, step: 0.1, value: 1, hint: 'The socket is this much under the pole. Rubber stretches: 1 mm holds firm and still pushes on by hand.' },
    ...extra, ...MOULD_PARAMS.map((x) => ({ ...x })),
  ]
  const dartP = (over = {}, round = false) => [
    ...pick(DART_PARAMS, round ? ['maxD', 'ropeD'] : ['length', 'maxD', 'ropeD'], over).map((q) => q.key === 'ropeD' ? { ...q, label: 'Rope or leash cord' } : q),
    { key: 'attach', label: 'Rope or leash fixes to', options: ['cast-in M8 nut (screw in a swivel)', 'moulded eye'], value: over.attach || 'cast-in M8 nut (screw in a swivel)', hint: 'Cast-in nut: an M8 nut and a big washer are set in the rubber, then you screw in a stainless swivel eye bolt. Strongest. Moulded eye: a hole through the rubber head; cast it in 50A silicone or urethane rubber so it does not tear.' },
    ...MOULD_PARAMS.map((x) => ({ ...x })),
  ]
  const d = (id, name, kind, style, group, blurb, params) => ({ id, name, group, blurb, mould: true, kind, style, added: '2026-11-21', params, draw: () => {} })
  return [
    d('mouldBall', 'Contact Ball Mould', 'ball', 'smooth', 'MouldContact', 'A mould for a solid silicone contact ball: print the two halves and the core pin, bolt it shut, and pour. The ball comes out soft, grippy and heavy, with the pole socket made by the pin. Or switch to Mould box to make a rubber mould and cast copies.', ballP()),
    d('mouldDimple', 'Dimple Ball Mould', 'ball', 'dimpled', 'MouldContact', 'Cast a golf-ball-dimpled contact ball in silicone: the dimples come out crisp and give your hands something to feel.', ballP([{ key: 'dimples', label: 'Dimples', unit: '', min: 20, max: 160, step: 1, value: 70 }])),
    d('mouldGeo', 'Geo Ball Mould', 'ball', 'geo', 'MouldContact', 'Cast a contact ball with a raised geometric web in silicone: geodesic, icosahedron, great circles or cube star.', ballP([
      { key: 'pattern', label: 'Pattern', options: ['geodesic', 'icosahedron', 'great circles', 'cube star'], value: 'geodesic' },
      { key: 'ridge', label: 'Line thickness', unit: 'mm', min: 2, max: 6, step: 0.1, value: 3.2 },
    ])),
    d('mouldDart', 'Classic Dart Mould', 'dart', 'classic', 'MouldDart', 'A mould for a classic rope dart head in silicone or urethane rubber, with an M8 nut cast in for a swivel. A rubber dart hurts far less than a metal one: the one to learn with.', dartP()),
    d('mouldOrb', 'Orb Dart Mould', 'dart', 'orb', 'MouldDart', 'Cast a round rubber rope dart head: rolls off the body, kind to the floor.', dartP({ maxD: 46 }, true)),
    d('mouldScales', 'Dragon Scales Mould', 'dart', 'scales', 'MouldDart', 'Cast the dragon-scale teardrop: hundreds of scales come out of the mould in one pour. Brush a thin first coat into the scales so no air is trapped.', dartP({ length: 125, maxD: 38 })),
    d('mouldPoi', 'Poi Ball Mould', 'dart', 'orb', 'MouldPoi', 'A mould for a soft rubber poi head: a heavy, grippy ball with a cast-in nut for the leash swivel. Make a pair.', dartP({ maxD: 70, ropeD: 5 }, true)),
    d('mouldPoiGeo', 'Geo Poi Mould', 'dart', 'geodesic', 'MouldPoi', 'Cast a geodesic-web poi head in rubber: hundreds of tiny raised triangles. Make a pair; brush the first coat in.', dartP({ maxD: 66, ropeD: 5 }, true)),
  ]
}
void TAU
