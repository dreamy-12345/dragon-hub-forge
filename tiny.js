/**
 * Tiny props: juggling clubs, and tiny versions of the other props (made by the
 * Scale setting: see TINY below, which designs.js turns into the Tiny props list).
 *
 * A juggling club is a solid of revolution: a flat-bottomed body that bulges, a
 * taper to a slim handle, and a knob on the end. It prints standing on its body,
 * the knob's underside at 45 degrees, so no supports. Units mm, z up.
 */
export const CLUB_PARAMS = [
  { key: 'clubL', label: 'Length', unit: 'mm', min: 50, max: 520, step: 1, value: 110, presets: [90, 110, 150], hint: 'Tiny desk clubs are 90 to 150 mm; a real juggling club is about 500.' },
  { key: 'clubD', label: 'Body', unit: 'mm', min: 12, max: 110, step: 0.5, value: 30, hint: 'Widest part of the body.' },
  { key: 'clubStyle', label: 'Shape', options: ['classic', 'bulb', 'slim'], value: 'classic' },
  { key: 'stripes', label: 'Stripes', unit: '', min: 0, max: 4, step: 1, value: 2, hint: 'Shallow rings round the body: change colour at them for a striped club.' },
]

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

export function buildClub(wasm, p, opts = {}) {
  const { CrossSection, Manifold } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    const L = p.clubL, R = p.clubD / 2, st = p.clubStyle || 'classic'
    const shape = { classic: [0.27, 0.6, 0.13], bulb: [0.22, 0.52, 0.12], slim: [0.33, 0.66, 0.15] }[st] || [0.27, 0.6, 0.13]
    const [zMax, zNeck, hr] = shape
    const handleR = Math.max(1.6, R * hr * 2), knobR = Math.max(handleR + 1, R * 0.42)
    const pts = [[0, 0], [R * 0.62, 0]]
    const N = 60
    for (let i = 1; i <= N; i++) {
      const t = i / N, z = t * L
      let r
      if (t < zMax) r = R * (0.62 + 0.38 * Math.sin((t / zMax) * Math.PI * 0.5)) // the body swelling up from its flat base
      else if (t < zNeck) r = handleR + (R - handleR) * (0.5 + 0.5 * Math.cos(((t - zMax) / (zNeck - zMax)) * Math.PI)) // the taper
      else if (t < 0.9) r = handleR
      else {
        const u = (t - 0.9) / 0.1 // the knob: 45 degrees out from the handle, then round over the top
        r = u < 0.35 ? handleR + (knobR - handleR) * (u / 0.35) : knobR * Math.sqrt(Math.max(0, 1 - ((u - 0.35) / 0.65) ** 2))
      }
      pts.push([Math.max(0.01, r), z])
    }
    pts.push([0, L])
    let club = k(k(new CrossSection([pts], 'Positive')).revolve(96))
    const rAt = (z) => { for (let i = 1; i < pts.length; i++) if (pts[i][1] >= z) return pts[i][0]; return 0 }
    const grooves = []
    const ns = Math.round(p.stripes ?? 2)
    for (let i = 0; i < ns; i++) {
      const z = L * (zMax + 0.02 + (0.16 * (i + 1)) / (ns + 1)), r = rAt(z)
      grooves.push(k(k(k(CrossSection.circle(0.5, 12)).translate([r + 0.1, z])).revolve(96)))
    }
    if (grooves.length) club = k(club.subtract(k(Manifold.union(grooves))))
    const g = (club.volume() / 1000) * (opts.density || 1.21)
    const meshes = { combined: meshData(k(club.translate([0, 0, -L / 2]))), printFlat: meshData(club) }
    const circle = []
    for (let i = 0; i < 48; i++) circle.push([R * Math.cos((2 * Math.PI * i) / 48), R * Math.sin((2 * Math.PI * i) / 48)])
    return {
      club: { L, R, g, style: st, stripes: grooves.map((_, i) => +(L * (zMax + 0.02 + (0.16 * (i + 1)) / (ns + 1))).toFixed(1)) },
      meshes,
      viewR: Math.max(L * 0.6, 40),
      polygons: { base: [circle], relief: [], pods: [], weak: [] },
      podH: 0, ring: null, snap: null,
      stats: { tris: meshes.combined.indices.length / 3, grams: g, gramsTotal: g, warns: [], height: L },
    }
  } finally {
    for (const o of live) o.delete?.()
  }
}

/** Tiny props: four of each kind, each a tiny copy of a full-size design at the scale given. */
export const TINY = [
  ['TinyHubs', 0.25, ['dragon', 'flower', 'nzSilverFern', 'shroomRing']],
  ['TinyDarts', 0.4, ['dartClassic', 'dartPine', 'dartEnt', 'dartBark']],
  ['TinyPoi', 0.4, ['poiBall', 'poiPine', 'poiShroom', 'poiScales']],
  ['TinyContact', 0.35, ['ballSmooth', 'ballEvilEyeWhole', 'ballGeo', 'endTrident']],
  ['TinyAcro', 0.4, ['acroDome', 'acroBall', 'acroPine', 'acroMushroom']],
  ['TinyAxes', 0.4, ['endAxe', 'endGreat', 'endLabrys', 'endHalberd']],
  ['TinyBubbles', 0.55, ['bubblePoiClassic', 'bhTank', 'bhWheel']],
]

export function tinyDesigns(DESIGNS) {
  const out = []
  const club = (id, name, style, blurb) => ({ id, name, group: 'TinyJuggle', club: true, added: '2026-11-23', blurb, params: CLUB_PARAMS.map((x) => ({ ...x, ...(x.key === 'clubStyle' ? { value: style } : {}) })), draw: () => {} })
  out.push(
    club('clubClassic', 'Tiny Juggling Club', 'classic', 'A tiny juggling club for your desk or fingers: a round body, a slim handle and a knob, with stripes to change colour at. Prints standing up, no supports. Make three and juggle them.'),
    club('clubBulb', 'Tiny Bulb Club', 'bulb', 'A tiny club with a fat, round bulb of a body and a short taper: chunky and cute.'),
    club('clubSlim', 'Tiny Slim Club', 'slim', 'A long, slim tiny club, like a skittle: elegant spins between the fingers.'),
  )
  for (const [group, s, ids] of TINY) for (const id of ids) {
    const d = DESIGNS.find((x) => x.id === id)
    if (!d) continue
    out.push({ ...d, id: `tiny_${id}`, name: `Tiny ${d.name}`, group, tiny: s, tinyOf: id, added: '2026-11-23', blurb: `A tiny ${d.name}, ${Math.round(s * 100)}% of full size: a desk toy, a fidget, or a keyring. Change its size with Scale. ${d.blurb}` })
  }
  return out
}
