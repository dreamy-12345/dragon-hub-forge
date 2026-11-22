/**
 * Tube fire swords: built like the big fire longswords spinners make. A machined
 * hilt connector (a four-way block) is the heart of it:
 *   below   the handle: your own 19 or 22 mm staff pole, grip-taped
 *   above   the blade: a metal tube wound its full length in Kevlar tape
 *   sides   the crossguard: two tubes, bent up towards the blade, Kevlar wound too
 * and a Kevlar ball on the end of the handle is the pommel: it burns with the
 * rest, and a steel core inside it is sized so the sword balances where you want.
 * Every socket is clamped by an M5 bolt straight through block and tube (or two
 * set screws), so nothing can fly off.
 *
 * The forge models it all, works out the pommel weight wet, and gives the
 * connector to a machine shop (or to print in PETG/nylon for a practice sword),
 * plus the cut list: tube lengths, Kevlar tape, bolts.
 * Units mm; z along the sword from the middle of the connector (blade up), the
 * guard along x.
 */
const KEVLAR = 1.44 * 0.6 // woven Kevlar tape, g/cm³
const WET = 1.3
const TAPE_T = 2.5

const TUBES = { 'aluminium tube (6061)': 2.7, 'stainless tube (304)': 7.93, 'titanium tube': 4.5 }
const POLES = { 'aluminium pole': 2.7, 'carbon fibre pole': 1.55, 'fibreglass pole': 1.9, 'steel pole': 7.85 }

export const TSWORD_PARAMS = [
  { key: 'bladeL', label: 'Blade', unit: 'mm', min: 350, max: 1200, step: 5, value: 850, hint: 'From the top of the hilt connector to the tip.' },
  { key: 'bladeOD', label: 'Blade tube', unit: 'mm', min: 10, max: 25.4, step: 0.1, value: 16, presets: [12, 16, 19], hint: 'Outside of the blade tube. 16 mm aluminium is stiff and light; go 19 mm for blades over a metre.' },
  { key: 'bladeWall', label: 'Blade tube wall', unit: 'mm', min: 0.8, max: 3, step: 0.1, value: 1.5 },
  { key: 'tube', label: 'Blade and guard tubes', options: Object.keys(TUBES), value: 'aluminium tube (6061)', hint: 'Aluminium is the usual: light and takes the heat with Kevlar on it. Stainless for the toughest, heaviest sword.' },
  { key: 'bare', label: 'Bare above the hilt', unit: 'mm', min: 40, max: 250, step: 5, value: 110, hint: 'The blade stays bare metal this far above the connector, so the flame stays off your hands.' },
  { key: 'guardL', label: 'Guard arms', unit: 'mm', min: 60, max: 260, step: 5, value: 170, hint: 'Each arm, from the connector to its tip.' },
  { key: 'guardOD', label: 'Guard tube', unit: 'mm', min: 10, max: 22, step: 0.1, value: 16, presets: [12, 16] },
  { key: 'guardUp', label: 'Guard bend', unit: '°', min: 0, max: 70, step: 1, value: 35, hint: 'How far the arms curve up towards the blade: 0 = straight across.' },
  { key: 'guardFire', label: 'Guard arms', options: ['Kevlar on them (they burn)', 'bare metal'], value: 'Kevlar on them (they burn)' },
  { key: 'wickW', label: 'Kevlar tape', unit: 'mm', min: 25, max: 75, step: 1, value: 50, presets: [25, 38, 50], hint: 'Tape width, wound in a tight spiral, each turn half over the last.' },
  { key: 'poleOD', label: 'Handle pole', unit: 'mm', min: 12, max: 32, step: 0.1, value: 22, presets: [19, 22, 25.4], hint: 'Your staff pole is the handle: 19 or 22 mm.' },
  { key: 'poleWall', label: 'Pole wall', unit: 'mm', min: 0.8, max: 4, step: 0.05, value: 1.5 },
  { key: 'pole', label: 'Pole is', options: Object.keys(POLES), value: 'aluminium pole' },
  { key: 'handleL', label: 'Handle', unit: 'mm', min: 120, max: 500, step: 5, value: 320, hint: 'Pole showing between the connector and the pommel ball. Two hands: 280 mm or more.' },
  { key: 'ballD', label: 'Pommel ball', unit: 'mm', min: 35, max: 110, step: 1, value: 62, hint: 'The Kevlar ball on the end of the handle: it burns too, and the steel core inside it balances the sword.' },
  { key: 'pommel', label: 'Pommel', options: ['Kevlar ball (burns)', 'bare steel ball'], value: 'Kevlar ball (burns)' },
  { key: 'balanceAt', label: 'Balance point', unit: 'mm', min: -40, max: 200, step: 5, value: 70, hint: 'Where it balances, measured up the blade from the connector. 50–100 mm rolls round the body under control; nearer the hilt feels quicker.' },
  { key: 'clamp', label: 'Sockets held by', options: ['M5 bolt through block and tube', 'two M5 set screws'], value: 'M5 bolt through block and tube', hint: 'Through-bolt: drill the tube through the block\'s hole; it can never slip or turn. Set screws: no drilling, but put an insert in a carbon pole first.' },
]

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

export function buildTubeSword(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const warns = []
    const dens = opts.density || 2.7 // the connector's metal
    const tubeD = TUBES[p.tube] || 2.7
    const w = 4.5 // connector wall round each tube
    const c = Math.max(p.poleOD, p.bladeOD, p.guardOD) + 2 * w // the core block
    const hd = 40, bd = 32, gd = 30 // socket depths: handle, blade, guards
    const cyl = (r, z0, z1, n = 48) => k(k(Manifold.cylinder(z1 - z0, r, r, n)).translate([0, 0, z0]))
    const alongX = (r, x0, x1, n = 40) => k(k(k(Manifold.cylinder(x1 - x0, r, r, n)).rotate([0, 90, 0])).translate([x0, 0, 0]))
    const alongY = (r, len, x, z, n = 20) => k(k(k(Manifold.cylinder(len, r, r, n)).rotate([90, 0, 0])).translate([x, len / 2, z]))

    // ------------------------------------------------- the hilt connector
    const core = k(k(Manifold.cube([c, c, c], true)).intersect(k(Manifold.sphere(c * 0.78, 64))))
    const hb = cyl(p.poleOD / 2 + w, -c / 2 - hd, 0, 64)
    const bb = cyl(p.bladeOD / 2 + w, 0, c / 2 + bd, 64)
    const gr = p.guardOD / 2 + w
    const gb = alongX(gr, -c / 2 - gd, c / 2 + gd, 64)
    let conn = k(Manifold.union([core, hb, bb, gb]))
    // chamfer the socket mouths a little
    const mouth = (r, z, up) => k(k(Manifold.cylinder(1.2, up ? r : r + 1.2, up ? r + 1.2 : r, 48)).translate([0, 0, z - (up ? 1.2 : 0)]))
    const bores = [
      cyl(p.poleOD / 2 + 0.1, -c / 2 - hd - 1, -c / 2 + 3, 64), mouth(p.poleOD / 2 + 0.1, -c / 2 - hd, false),
      cyl(p.bladeOD / 2 + 0.1, c / 2 - 3, c / 2 + bd + 1, 64), mouth(p.bladeOD / 2 + 0.1, c / 2 + bd, true),
      alongX(p.guardOD / 2 + 0.1, c / 2 - 3, c / 2 + gd + 1), alongX(p.guardOD / 2 + 0.1, -c / 2 - gd - 1, -c / 2 + 3),
    ]
    // M5 through every socket (or two tapped holes)
    const through = (p.clamp || '').startsWith('M5 bolt')
    const sockets = [[0, -c / 2 - hd * 0.5, 'z'], [0, c / 2 + bd * 0.55, 'z'], [c / 2 + gd * 0.55, 0, 'x'], [-c / 2 - gd * 0.55, 0, 'x']]
    for (const [x, z] of sockets) {
      if (through) bores.push(alongY(2.7, c + 30, x, z))
      else for (const s of [-1, 1]) bores.push(k(alongY(2.1, c / 2 + 15, x, z).translate([0, s > 0 ? c / 4 + 7.5 : -(c / 4 + 7.5), 0])))
    }
    conn = k(conn.subtract(k(Manifold.union(bores))))
    const connG = (conn.volume() / 1000) * dens

    // ------------------------------------------------------- the parts
    const tube = (od, wall, len) => (Math.PI * ((od / 2) ** 2 - (od / 2 - wall) ** 2) * len) / 1000 // cm³
    const tapeG = (len) => ((len * p.wickW * TAPE_T) / 1000) * KEVLAR // dry, len in mm
    const spiral = (od, len) => (Math.PI * (od + TAPE_T) * len) / (p.wickW * 0.5) // tape length, half-overlapped
    const zTop = c / 2 + bd
    // blade
    const bladeTube = p.bladeL + bd - 3
    const bladeG = tube(p.bladeOD, p.bladeWall, bladeTube) * tubeD
    const bladeZ = c / 2 - 3 + bladeTube / 2
    const kevL = Math.max(0, p.bladeL - p.bare)
    const bladeTape = spiral(p.bladeOD, kevL) + Math.PI * p.bladeOD * 2 // and over the tip
    const bladeKevG = tapeG(bladeTape) * WET
    const bladeKevZ = zTop + p.bare + kevL / 2
    if (p.bladeL > 1000 && p.bladeOD < 19) warns.push('A blade over a metre wants 19 mm tube or more, or it whips.')
    // guards: straight out of the block, then bent up towards the blade
    const st = Math.min(p.guardL * 0.3, 50)
    const bendL = p.guardL - st
    const a = (p.guardUp * Math.PI) / 180
    const Rb = a > 0.01 ? bendL / a : Infinity
    const x0 = c / 2 + gd
    const path = (s) => { // a point s mm along a guard arm from the block face
      if (s <= st || !isFinite(Rb)) return [x0 + s, 0]
      const t = (s - st) / Rb
      return [x0 + st + Rb * Math.sin(t), Rb * (1 - Math.cos(t))]
    }
    const guardTube = p.guardL + gd - 3
    const guardG = tube(p.guardOD, 1.5, guardTube) * tubeD
    let gz = 0
    for (let i = 0; i <= 20; i++) gz += path((p.guardL * i) / 20)[1] / 21
    const guardFire = (p.guardFire || '').startsWith('Kevlar')
    const guardKevL = Math.max(0, p.guardL - 15)
    const guardTape = guardFire ? spiral(p.guardOD, guardKevL) + Math.PI * p.guardOD * 2 : 0
    const guardKevG = tapeG(guardTape) * WET
    // handle: the pole
    const ri = p.poleOD / 2 - p.poleWall
    const poleLen = p.handleL + hd - 3
    const poleG = tube(p.poleOD, p.poleWall, poleLen) * (POLES[p.pole] || 2.7)
    const zEnd = -c / 2 - hd - p.handleL
    const poleZ = (-c / 2 + 3 + zEnd) / 2
    // pommel: an end plug (aluminium) with an M8 stud, a steel core on it, Kevlar wound round into a ball
    const R = p.ballD / 2
    const zb = zEnd - R * 0.82
    const plugG = 35
    const kevBall = (p.pommel || '').startsWith('Kevlar')
    const coreR = R * (kevBall ? 0.58 : 1)
    const ballKevG = kevBall ? ((4 / 3) * Math.PI * (R ** 3 - coreR ** 3) / 1000) * KEVLAR * WET : 0
    // balance: solve the steel core so the sword balances at balanceAt
    const parts = [[connG, 0], [bladeG, bladeZ], [bladeKevG, bladeKevZ], [2 * guardG, gz], [2 * guardKevG, gz], [poleG, poleZ], [plugG, zEnd], [ballKevG, zb]]
    const M = parts.reduce((s, [m]) => s + m, 0), Mz = parts.reduce((s, [m, z]) => s + m * z, 0)
    const b = p.balanceAt
    let coreG = (Mz - b * M) / (b - zb)
    const coreMax = ((4 / 3) * Math.PI * coreR ** 3 / 1000) * 7.85 * 0.75 // a stack of steel discs filling most of the core
    if (coreG < 0) { warns.push(`It balances nearer the hilt than ${b} mm without any pommel weight: a longer blade, a lighter pole, or move the balance point down.`); coreG = 0 }
    if (coreG > coreMax) { warns.push(`It needs ${coreG.toFixed(0)} g in the pommel, more than a Ø${p.ballD} ball holds (${coreMax.toFixed(0)} g): make the ball bigger, the blade shorter, or move the balance point up the blade.`); coreG = coreMax }
    const total = M + coreG
    const balance = (Mz + coreG * zb) / total

    // ------------------------------------------------------ the 3D view
    const meshes = { combined: meshData(conn) }
    const rods = [], kev = []
    rods.push(cyl(p.bladeOD / 2, c / 2 - 3, zTop + p.bladeL, 32), k(k(Manifold.sphere(p.bladeOD / 2, 24)).translate([0, 0, zTop + p.bladeL])))
    rods.push(cyl(p.poleOD / 2, zEnd, -c / 2 + 3, 32))
    if (kevL > 0) kev.push(cyl(p.bladeOD / 2 + 2 * TAPE_T, zTop + p.bare, zTop + p.bladeL, 32), k(k(Manifold.sphere(p.bladeOD / 2 + 2 * TAPE_T, 24)).translate([0, 0, zTop + p.bladeL])))
    const arm = (r, from) => {
      // straight run, then the bend (a torus piece), mirrored for the other side
      const bits = []
      const s0 = Math.max(0, from)
      if (s0 < st) bits.push(alongX(r, x0 + s0 - (from < 0 ? -from : 0), x0 + st, 28))
      if (isFinite(Rb) && bendL > 0) {
        const t0 = Math.max(0, (s0 - st) / Rb), deg0 = (t0 * 180) / Math.PI, deg = (a * 180) / Math.PI - deg0
        if (deg > 0.5) {
          let tor = k(k(k(CrossSection.circle(r, 24)).translate([Rb, 0])).revolve(Math.max(8, Math.ceil(deg / 3)), deg))
          tor = k(k(k(tor.rotate([0, 0, deg0])).rotate([90, 0, 0])).rotate([0, 90, 0]))
          bits.push(k(tor.translate([x0 + st, 0, Rb])))
        }
      } else if (bendL > 0) bits.push(alongX(r, Math.max(x0 + st, x0 + s0), x0 + p.guardL, 28))
      const [ex, ez] = path(p.guardL)
      bits.push(k(k(Manifold.sphere(r, 20)).translate([ex, 0, ez])))
      const one = k(Manifold.union(bits))
      return k(one.add(k(one.mirror([1, 0, 0]))))
    }
    rods.push(arm(p.guardOD / 2, -gd + 3))
    if (guardFire) kev.push(arm(p.guardOD / 2 + 2 * TAPE_T, 15))
    // the pommel
    if (kevBall) kev.push(k(k(Manifold.sphere(R, 40)).translate([0, 0, zb])))
    else rods.push(k(k(Manifold.sphere(R, 40)).translate([0, 0, zb])))
    meshes.rods = meshData(k(Manifold.union(rods)))
    if (kev.length) meshes.kevlar = meshData(k(Manifold.union(kev)))
    // the connector lying on its side for printing (practice) or the machinist
    const fl = k(conn.rotate([90, 0, 0])); const fb = fl.boundingBox()
    meshes.connFlat = meshData(k(fl.translate([0, 0, -fb.min[2]])))
    // the pommel plug: a spigot into the pole, a flange on its end, tapped M8 for the stud
    let plug = k(Manifold.union([cyl(ri - 0.1, 0, 28, 48), cyl(p.poleOD / 2 + 0.5, -4, 0.01, 48)]))
    plug = k(plug.subtract(cyl(3.4, -5, 29, 24)))
    meshes.plugFlat = meshData(k(plug.translate([0, 0, 4])))
    const len = zTop + p.bladeL - (zb - R)
    const tapeTotal = bladeTape + 2 * guardTape
    const ballTape = kevBall ? (((4 / 3) * Math.PI * (R ** 3 - coreR ** 3)) / (p.wickW * TAPE_T)) * 1.1 : 0
    return {
      tsword: {
        c, connG, bladeG, bladeKevG, guardG: 2 * guardG, guardKevG: 2 * guardKevG, poleG, ballKevG, coreG, coreR, plugG, total, balance, target: b,
        len, bladeTube, guardTube, poleLen, tapeTotal, ballTape, kevL, through, hd, bd, gd,
        width: 2 * path(p.guardL)[0] + p.guardOD,
      },
      meshes,
      viewR: len * 0.55,
      polygons: { base: [[[-c / 2, -c / 2], [c / 2, -c / 2], [c / 2, c / 2], [-c / 2, c / 2]]], relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null, cnc: true,
      stats: { tris: meshes.combined.indices.length / 3, grams: connG, gramsTotal: total, warns, height: len },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

/** The connector for the machine shop: the key sizes, as a sheet to send with the STL. */
export function connectorSheetSVG(hub, p, matName, name) {
  const v = hub.tsword
  const rows = [
    `${name}: hilt connector. ${matName}.`,
    `Core block ${v.c.toFixed(1)} mm, corners rounded to a sphere of R${(v.c * 0.78).toFixed(1)}.`,
    `Handle socket: bore Ø${(p.poleOD + 0.2).toFixed(2)} × ${v.hd} deep, boss Ø${(p.poleOD + 9).toFixed(1)}.`,
    `Blade socket: bore Ø${(p.bladeOD + 0.2).toFixed(2)} × ${v.bd} deep, boss Ø${(p.bladeOD + 9).toFixed(1)}.`,
    `Guard sockets (both sides): bore Ø${(p.guardOD + 0.2).toFixed(2)} × ${v.gd} deep, boss Ø${(p.guardOD + 9).toFixed(1)}.`,
    v.through ? 'Each socket: Ø5.3 hole straight through, square to the face, half way down the socket (M5 bolt + all-metal lock nut).' : 'Each socket: two M5 tapped holes (4.2 drill) from the front and back faces, half way down the socket.',
    '1 mm × 45° chamfer on every socket mouth. Break all edges. Anodise or leave bare.',
  ]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="${20 + rows.length * 7}mm" viewBox="0 0 200 ${20 + rows.length * 7}">
<rect width="100%" height="100%" fill="#fff"/><g font-family="Helvetica,Arial,sans-serif">
${rows.map((t, i) => `<text x="6" y="${12 + i * 7}" font-size="${i ? 4 : 5.5}"${i ? '' : ' font-weight="700"'}>${t}</text>`).join('\n')}
</g></svg>\n`
}

export function tubeSwordDesigns() {
  const d = (id, name, blurb, over) => ({
    id, name, group: 'TubeSwords', blurb, tsword: true, cncOnly: true, cnc: { material: 'al6061' }, added: '2026-11-22',
    params: TSWORD_PARAMS.map((x) => ({ ...x, ...(over[x.key] !== undefined ? { value: over[x.key] } : {}) })),
    draw: () => {},
  })
  return [
    d('tsLongsword', 'Fire Longsword', 'The big one: a long Kevlar-wound blade tube and curved Kevlar guard arms, all held in a machined hilt connector on your 22 mm staff pole, with a burning Kevlar ball for a pommel that balances it. Every socket bolted through.', {}),
    d('tsBroadsword', 'Fire Broadsword (tube)', 'A shorter, quicker tube sword with gently raised guard arms and a pommel ball that balances it close to the hilt.', { bladeL: 680, guardL: 140, guardUp: 18, handleL: 250, ballD: 56, balanceAt: 55 }),
    d('tsClaymore', 'Fire Claymore', 'A huge two-hander: 19 mm blade over a metre long, guard arms swept steeply up in a V, a long handle and a big pommel ball.', { bladeL: 1050, bladeOD: 19, guardL: 210, guardUp: 55, guardOD: 16, handleL: 400, ballD: 76, balanceAt: 90 }),
    d('tsArming', 'Fire Arming Sword', 'A one-hand tube sword on a 19 mm pole: straight guard, short handle, small pommel ball. Light enough to spin all day.', { bladeL: 560, bladeOD: 12, guardL: 110, guardUp: 0, guardOD: 12, poleOD: 19, handleL: 170, ballD: 56, balanceAt: 40 }),
  ]
}

// ------------------------------------------------------------ tube axes --
/**
 * Fire axe heads for the end of a contact staff, built the same way: a machined
 * block on the pole end, and each axe bit is one tube bent into a crescent loop,
 * both its ends bolted into the block, the outer edge wound in Kevlar. A spike
 * (or a Kevlar ball) on top burns too. The other end of the staff gets a Kevlar
 * ball with a steel core that weighs the same as the head, so the staff balances.
 */
const AXE_STYLES = {
  bearded: { reach: 1, H: 0.9, horn: 0.15, beard: 0.55, curl: 0, double: false, spike: true, back: false },
  dane: { reach: 1.05, H: 1.25, horn: 0.3, beard: 0.3, curl: 0.05, double: false, spike: true, back: true },
  double: { reach: 0.95, H: 1.15, horn: 0.25, beard: 0.25, curl: 0.1, double: true, spike: false, back: false },
  anime: { reach: 1.25, H: 1.5, horn: 0.6, beard: 0.45, curl: 0.45, double: false, spike: true, back: true },
  moon: { reach: 1.1, H: 1.45, horn: 0.55, beard: 0.55, curl: 0.5, double: true, spike: true, back: false },
}

export const TAXE_PARAMS = [
  { key: 'size', label: 'Axe size', unit: 'mm', min: 90, max: 260, step: 5, value: 150, hint: 'How far the bit reaches out from the pole. Everything else scales with it.' },
  { key: 'bitOD', label: 'Bit tube', unit: 'mm', min: 8, max: 16, step: 0.5, value: 12, presets: [10, 12, 16], hint: 'Outside of the tube the bits are bent from.' },
  { key: 'tube', label: 'Tube', options: Object.keys(TUBES), value: 'aluminium tube (6061)' },
  { key: 'curl', label: 'Horn curl', unit: '%', min: 0, max: 100, step: 5, value: -1, hint: 'How far the horns curl back: 0 = a clean crescent, 100 = big anime hooks. -1 = the style\'s own.' },
  { key: 'spikeL', label: 'Top spike', unit: 'mm', min: 0, max: 200, step: 5, value: 90, hint: 'A Kevlar-wound spike on top. 0 = a Kevlar ball instead.' },
  { key: 'wickW', label: 'Kevlar tape', unit: 'mm', min: 25, max: 75, step: 1, value: 50, presets: [25, 38, 50] },
  { key: 'poleOD', label: 'Pole', unit: 'mm', min: 12, max: 32, step: 0.1, value: 22, presets: [19, 22, 25.4] },
  { key: 'counter', label: 'Other end of the staff', options: ['matched Kevlar ball (burns)', 'nothing'], value: 'matched Kevlar ball (burns)', hint: 'A Kevlar ball on a steel core that weighs the same as the axe head, wet, so the staff balances in the middle.' },
]

export function buildTubeAxe(wasm, p, opts = {}) {
  const { Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const warns = []
    const S0 = AXE_STYLES[opts.style] || AXE_STYLES.bearded
    const S = { ...S0, curl: p.curl >= 0 ? p.curl / 100 : S0.curl }
    const dens = opts.density || 2.7, tubeD = TUBES[p.tube] || 2.7
    const r = p.bitOD / 2, w = 4
    const c = Math.max(p.poleOD, 2 * p.bitOD + 8) + 2 * w
    const hd = 40, sd = 26 // pole socket, bit sockets
    const ang = 28 // the bit sockets point out at ±28° from level
    const sph = (rr, x, z) => k(k(Manifold.sphere(rr, 16)).translate([x, 0, z]))
    const capsule = (pts, rr) => k(Manifold.union(pts.slice(1).map((q, i) => k(Manifold.hull([sph(rr, ...pts[i]), sph(rr, ...q)])))))
    const dirCyl = (rr, len, x, z, phi) => k(k(k(Manifold.cylinder(len, rr, rr, 40)).rotate([0, phi, 0])).translate([x, 0, z])) // along a direction phi° from +z towards +x
    // ---- the block
    let block = k(k(Manifold.cube([c, c * 0.8, c], true)).intersect(k(Manifold.sphere(c * 0.72, 48))))
    const bosses = [k(k(Manifold.cylinder(hd, p.poleOD / 2 + w, p.poleOD / 2 + w, 48)).translate([0, 0, -c / 2 - hd + 4]))]
    const sides = S.double ? [1, -1] : [1]
    const sockets = []
    for (const sd0 of sides) for (const up of [1, -1]) {
      const phi = sd0 * (90 - up * ang)
      const ox = sd0 * (c / 2 - 3) * Math.cos((ang * Math.PI) / 180), oz = up * (c / 2 - 3) * Math.sin((ang * Math.PI) / 180) * 0.9
      sockets.push({ phi, x: ox, z: oz, sd0, up })
      bosses.push(dirCyl(r + w, sd + 4, ox, oz, phi))
    }
    if (S.back && !S.double) bosses.push(dirCyl(r + w, sd, -(c / 2 - 3), 0, -90)) // a back spike socket
    const topOD = p.spikeL > 0 ? p.bitOD : 12
    bosses.push(k(k(Manifold.cylinder(sd, topOD / 2 + w, topOD / 2 + w, 40)).translate([0, 0, c / 2 - 4])))
    block = k(Manifold.union([block, ...bosses]))
    const bores = [k(k(Manifold.cylinder(hd, p.poleOD / 2 + 0.1, p.poleOD / 2 + 0.1, 48)).translate([0, 0, -c / 2 - hd + 3]))]
    const dirOf = (phi) => [Math.sin((phi * Math.PI) / 180), Math.cos((phi * Math.PI) / 180)]
    const mouthOf = (s) => { const [dx, dz] = dirOf(s.phi); return [s.x + dx * (sd + 4), s.z + dz * (sd + 4)] }
    for (const s of sockets) { const [dx, dz] = dirOf(s.phi); bores.push(dirCyl(r + 0.1, sd + 2, s.x + dx * 3, s.z + dz * 3, s.phi)) }
    if (S.back && !S.double) bores.push(dirCyl(r + 0.1, sd + 1, -(c / 2 - 3) - 2, 0, -90))
    bores.push(k(k(Manifold.cylinder(sd + 1, topOD / 2 + 0.1, topOD / 2 + 0.1, 40)).translate([0, 0, c / 2 + 1])))
    // M5 through-bolts across every socket (y)
    const yb = (x, z) => k(k(k(Manifold.cylinder(c + 20, 2.7, 2.7, 16)).rotate([90, 0, 0])).translate([x, c / 2 + 10, z]))
    bores.push(yb(0, -c / 2 - hd / 2 + 4), yb(0, c / 2 + sd / 2))
    for (const s of sockets) { const [dx, dz] = dirOf(s.phi); bores.push(yb(s.x + dx * (sd / 2 + 4), s.z + dz * (sd / 2 + 4))) }
    block = k(block.subtract(k(Manifold.union(bores))))
    const blockG = (block.volume() / 1000) * dens

    // ---- the bits: a loop from the upper socket out round the edge and back into the lower one
    const A = p.size
    const rods = [], kev = []
    let tubeLen = 0, kevLen = 0, bitZ = 0
    const tapeSpiral = (od, len) => (Math.PI * (od + TAPE_T) * len) / (p.wickW * 0.5)
    const catmull = (P, n) => {
      const out = []
      for (let i = 0; i < P.length - 1; i++) {
        const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)]
        for (let j = 0; j < n; j++) {
          const t = j / n, t2 = t * t, t3 = t2 * t
          out.push([0, 1].map((q) => 0.5 * (2 * p1[q] + (-p0[q] + p2[q]) * t + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * t2 + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * t3)))
        }
      }
      out.push(P[P.length - 1])
      return out
    }
    for (const sd0 of sides) {
      const su = sockets.find((s) => s.sd0 === sd0 && s.up === 1), sl = sockets.find((s) => s.sd0 === sd0 && s.up === -1)
      const [ax, az] = mouthOf(su), [bx, bz] = mouthOf(sl)
      const X = (x) => sd0 * x
      const reach = A * S.reach, H = A * S.H
      const ctrl = [
        [ax, az], [X(reach * 0.35), az + H * 0.18],
        [X(reach * (0.82 - 0.35 * S.curl)), H * 0.5 + A * S.horn], // upper horn tip, curling back
        [X(reach * (0.92 + 0.05 * S.curl)), H * 0.28], [X(reach), 0], [X(reach * 0.95), -H * 0.3],
        [X(reach * (0.78 - 0.3 * S.curl)), -H * 0.5 - A * S.beard], // lower horn, the beard
        [X(reach * 0.3), bz - H * 0.2], [bx, bz],
      ]
      const pts = catmull(ctrl, 8)
      rods.push(capsule(pts, r))
      // Kevlar on the outer edge: from the upper horn round to the lower one
      const i0 = Math.floor(pts.length * 0.2), i1 = Math.ceil(pts.length * 0.8)
      kev.push(capsule(pts.slice(i0, i1), r + 2 * TAPE_T))
      for (let i = 1; i < pts.length; i++) {
        const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
        tubeLen += l; if (i > i0 && i <= i1) kevLen += l
        bitZ += l * (pts[i][1] + pts[i - 1][1]) / 2
      }
      tubeLen += 2 * sd
    }
    // the spike on top, or a Kevlar ball
    let topG = 0, topKev = 0
    const zTop = c / 2 + sd - 4
    if (p.spikeL > 0) {
      rods.push(k(k(Manifold.cylinder(p.spikeL + sd, topOD / 2, topOD / 2, 24)).translate([0, 0, c / 2])), sph(topOD / 2, 0, zTop + p.spikeL))
      kev.push(k(k(Manifold.cylinder(p.spikeL - 15, topOD / 2 + 2 * TAPE_T, topOD / 2 + 2 * TAPE_T, 24)).translate([0, 0, zTop + 15])), sph(topOD / 2 + 2 * TAPE_T, 0, zTop + p.spikeL))
      topG = (Math.PI * ((topOD / 2) ** 2 - (topOD / 2 - 1.5) ** 2) * (p.spikeL + sd)) / 1000 * tubeD
      topKev = tapeSpiral(topOD, p.spikeL)
    } else {
      kev.push(sph(26, 0, zTop + 22))
      topKev = ((4 / 3) * Math.PI * (26 ** 3 - 12 ** 3)) / (p.wickW * TAPE_T)
    }
    if (S.back && !S.double) {
      const L2 = A * 0.45
      rods.push(k(k(k(Manifold.cylinder(L2 + sd, r, r, 24)).rotate([0, -90, 0])).translate([-(c / 2 - 3), 0, 0])), sph(r, -(c / 2 + L2 + sd - 3), 0))
      kev.push(k(k(k(Manifold.cylinder(L2 - 10, r + 2 * TAPE_T, r + 2 * TAPE_T, 24)).rotate([0, -90, 0])).translate([-(c / 2 + sd + 7), 0, 0])), sph(r + 2 * TAPE_T, -(c / 2 + L2 + sd - 3), 0))
      tubeLen += L2 + sd; kevLen += L2 - 10
    }
    rods.push(k(k(Manifold.cylinder(260, p.poleOD / 2, p.poleOD / 2, 32)).translate([0, 0, -c / 2 - 260 + 3])))
    const bitG = (Math.PI * (r ** 2 - (r - 1.5) ** 2) * tubeLen) / 1000 * tubeD
    const tape = tapeSpiral(p.bitOD, kevLen) + topKev
    const kevG = ((tape * p.wickW * TAPE_T) / 1000) * KEVLAR * WET
    const total = blockG + bitG + topG + kevG
    // the matched ball for the other end: Kevlar round a steel core, same weight wet
    let counter = null
    if ((p.counter || '').startsWith('matched')) {
      const plug = 35
      let D = 50
      for (; D < 140; D += 1) {
        const R = D / 2, rc = R * 0.58
        const kv = ((4 / 3) * Math.PI * (R ** 3 - rc ** 3) / 1000) * KEVLAR * WET
        const coreMax = ((4 / 3) * Math.PI * rc ** 3 / 1000) * 7.85 * 0.75
        if (kv + coreMax + plug >= total) { counter = { D, kev: kv, core: Math.max(0, total - kv - plug), plug, tape: ((4 / 3) * Math.PI * (R ** 3 - rc ** 3)) / (p.wickW * TAPE_T) * 1.1 }; break }
      }
      if (!counter) warns.push('The head is too heavy for one counterweight ball: a lighter tube or a smaller axe.')
    }
    const meshes = { combined: meshData(block), rods: meshData(k(Manifold.union(rods))), kevlar: meshData(k(Manifold.union(kev))) }
    const fl = k(block.rotate([90, 0, 0])); const fb = fl.boundingBox()
    meshes.connFlat = meshData(k(fl.translate([0, 0, -fb.min[2]])))
    const all = k(Manifold.union([block, ...rods.slice(0, -1)])).boundingBox()
    return {
      taxe: { style: opts.style, blockG, bitG, topG, kevG, total, tape, tubeLen, kevLen, counter, c, width: all.max[0] - all.min[0], height: all.max[2] - all.min[2], bits: sides.length },
      meshes,
      viewR: Math.max(all.max[0] - all.min[0], all.max[2] - all.min[2]) * 0.7,
      polygons: { base: [[[-c / 2, -c / 2], [c / 2, -c / 2], [c / 2, c / 2], [-c / 2, c / 2]]], relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null, cnc: true,
      stats: { tris: meshes.combined.indices.length / 3, grams: blockG, gramsTotal: total, warns, height: all.max[2] - all.min[2] },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

export function tubeAxeDesigns() {
  const d = (id, name, style, blurb, over = {}) => ({
    id, name, group: 'TubeAxes', blurb, taxe: true, style, cncOnly: true, cnc: { material: 'al6061' }, added: '2026-11-22',
    params: TAXE_PARAMS.map((x) => ({ ...x, ...(over[x.key] !== undefined ? { value: over[x.key] } : {}) })),
    draw: () => {},
  })
  return [
    d('taxeBearded', 'Viking Bearded Fire Axe', 'bearded', 'A Viking bearded axe for the end of a contact staff: the bit is one tube bent into a crescent whose lower horn drops into a long beard, its edge wound in Kevlar, both ends bolted into a machined block on the pole. A Kevlar spike on top, and a matched Kevlar ball for the other end.'),
    d('taxeDane', 'Dane Fire Axe', 'dane', 'A big, broad Dane axe crescent with a back spike and a top spike, all wound in Kevlar: three points of fire from one end of the staff.', { size: 170 }),
    d('taxeDouble', 'Double Fire Axe', 'double', 'Two crescents back to back, a Kevlar ball on top: balanced both ways round, so it spins true.', { spikeL: 0 }),
    d('taxeAnime', 'Anime Fire Axe', 'anime', 'Not history, just cool: a huge crescent with horns that hook right back, a back spike and a long top spike, all burning.', { size: 190, spikeL: 140 }),
    d('taxeMoon', 'Twin Moon Fire Axe', 'moon', 'Two great hooked crescents like twin moons, and a spike between them. Big and theatrical: it lights up the whole circle.', { size: 170, spikeL: 110 }),
  ]
}
