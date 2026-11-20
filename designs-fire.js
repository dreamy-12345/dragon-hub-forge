/**
 * Designs made for CNC mode and fire, some new, some re-cut from favourites
 * with bolder bars a cutter (and a flame) can live with. They still print in
 * 3D print mode as practice hubs. Each carries a `cnc` preset: the material,
 * cutter and ends it was drawn for (you can change them all).
 *
 * The spoke hubs (spokeHub) are a different kind of part: a small machined
 * hub with radial sockets for 8 mm fire spokes, see cnc.js buildSpokeHub.
 */

import { TAU } from './geom.js'
import { SPOKE_PARAMS } from './cnc.js'

const deg = (d) => (d * Math.PI) / 180

// a favourite design re-cut: same drawing, bolder bars
function recut(src, extra) {
  return {
    params: src.params.map((d) => ({ ...d })),
    overrides: { ...(src.overrides || {}), strutW: Math.max(5, src.overrides?.strutW || 0), fillet: 2.5 },
    draw: (c, g, p) => src.draw(c, g, p),
    glow: src.glow,
    strobe: src.strobe,
    ...extra,
  }
}

export function fireDesigns(all, { drawSpokes, drawVortex }) {
  const by = (id) => all.find((d) => d.id === id)
  const out = [
    {
      id: 'fireWheel',
      group: 'Fire',
      name: 'Fire Wheel',
      blurb: 'The classic fire hub: bold spokes, a solid rim, and a Kevlar wick on a tab at the end of every spoke. Cut it from aluminium or stainless, or print it as a practice hub.',
      overrides: { strutW: 7, rimW: 12, fillet: 3 },
      cnc: { material: 'al6061', process: 'laser', ends: 'tape', tabs: 3 },
      params: [
        { key: 'spokes', label: 'Spokes', unit: '', min: 3, max: 12, step: 1, value: 6, hint: 'With 3 wicks they sit on every other spoke; set Wicks (in Ends) to 6 for one on every spoke.' },
        { key: 'inner', label: 'Inner ring', options: ['on', 'off'], value: 'on' },
      ],
      draw(c, g, p) {
        drawSpokes(c, g, p.spokes, 0, g.w)
        if (p.inner === 'on') c.ring(0, 0, (g.Rc + g.Ri) * 0.45, g.w * 0.8)
        c.disc(0, 0, g.hubR + 3)
      },
    },
    {
      id: 'emberVortex',
      group: 'Fire',
      name: 'Ember Vortex',
      blurb: 'Curved arms that sweep one way, so it looks like it is turning even when it is still, with a Kevlar rope ring laced round the rim: a full circle of fire.',
      overrides: { strutW: 6, rimW: 10, fillet: 3 },
      cnc: { material: 'ss304', process: 'laser', ends: 'rope' },
      params: [
        { key: 'arms', label: 'Arms', unit: '', min: 3, max: 10, step: 1, value: 6 },
        { key: 'twist', label: 'Sweep', unit: '°', min: 20, max: 140, step: 1, value: 75 },
      ],
      draw(c, g, p) {
        drawVortex(c, g, p.arms, p.twist, 1.3, true)
        c.disc(0, 0, g.hubR + 3)
      },
    },
    {
      id: 'fireSun',
      group: 'Fire',
      name: 'Sun Wick',
      blurb: 'A sun: straight rays and wavy rays between them, every straight ray ending in a wick tab. Lit, it is a ring of little suns; unlit in Perspex it throws the light from the edges.',
      overrides: { strutW: 5.5, rimW: 10, fillet: 2.5 },
      cnc: { material: 'al5052', process: 'waterjet', ends: 'tape', tabs: 4 },
      params: [
        { key: 'rays', label: 'Rays', unit: '', min: 4, max: 12, step: 1, value: 8 },
        { key: 'wave', label: 'Wave', unit: 'mm', min: 0, max: 14, step: 0.5, value: 7 },
      ],
      draw(c, g, p) {
        drawSpokes(c, g, p.rays, 0, g.w)
        for (let i = 0; i < p.rays; i++) {
          const a0 = g.rot + (TAU * (i + 0.5)) / p.rays, pts = []
          for (let s = 0; s <= 36; s++) {
            const r = g.hubR + 4 + ((g.Ri - g.hubR - 4) * s) / 36
            const a = a0 + (p.wave / r) * Math.sin((s / 36) * TAU * 2)
            pts.push([r * Math.cos(a), r * Math.sin(a)])
          }
          c.taper(pts, g.w * 0.9, g.w * 0.7)
        }
        c.ring(0, 0, g.hubR + 10, g.w)
      },
    },
    {
      id: 'practiceDisc',
      group: 'Fire',
      name: 'Practice Halo',
      blurb: 'Made to learn on: wide, rounded bars that take a drop, three rings for weight at the edge, and TPU bumpers on the tabs weighted like wet wicks, so the moves you learn carry straight over to fire. Cut it in Perspex for the glow or HDPE for toughness.',
      overrides: { strutW: 8, rimW: 14, fillet: 4 },
      cnc: { material: 'acrylic', process: 'laser', ends: 'bumper', tabs: 3, thick: 6 },
      params: [
        { key: 'spokes', label: 'Spokes', unit: '', min: 3, max: 10, step: 1, value: 6 },
        { key: 'rings', label: 'Rings', unit: '', min: 0, max: 3, step: 1, value: 2 },
      ],
      draw(c, g, p) {
        drawSpokes(c, g, p.spokes, 0, g.w)
        for (let i = 1; i <= p.rings; i++) c.ring(0, 0, g.hubR + ((g.Ri - g.hubR) * i) / (p.rings + 1), g.w * 0.75)
        c.disc(0, 0, g.hubR + 4)
      },
    },
  ]
  // favourites, re-cut for cutting and fire
  const melt = by('meltRim'), fern = by('koru'), veins = by('veins')
  if (melt) out.push({ ...recut(melt), id: 'fireMelt', group: 'Fire', name: 'Molten Fire', blurb: 'Meltdown re-cut for metal: the same drips running in off the rim, thickened so a cutter and a flame can live with them, and a wick tab between the drips. It looks like the rim is melting into the fire.', cnc: { material: 'al6061', process: 'waterjet', ends: 'tape', tabs: 3 } })
  if (fern) out.push({ ...recut(fern), id: 'fireFronds', group: 'Fire', name: 'Fire Fronds', blurb: 'Fern Fronds re-cut for metal: unfurling fronds from the staff, bolder, with a Kevlar rope ring round the rim so the fronds curl inside a circle of flame.', cnc: { material: 'al5052', process: 'router', ends: 'rope' } })
  if (veins) out.push({ ...recut(veins), id: 'fireVeins', group: 'Fire', name: 'Burning Wings', blurb: 'Wing Veins re-cut for metal: the veined wings with chunkier cells (small cells are filled for you in CNC mode), wicks on tabs past the rim.', cnc: { material: 'ss304', process: 'laser', ends: 'tape', tabs: 4 } })

  // ------------------------------------------------------------- spoke hubs
  const spoke = (id, name, shape, blurb, over = {}) => ({
    id, name, group: 'SpokeHubs', blurb, spokeHub: true, shape,
    cnc: { material: 'al6061', process: 'router' },
    params: SPOKE_PARAMS.map((d) => ({ ...d, ...(over[d.key] !== undefined ? { value: over[d.key] } : {}) })),
    draw: () => {},
  })
  out.push(
    spoke('spokeRound', 'Spoke Hub', 'round', 'A round machined hub for 8 mm fire spokes, like the common 2" dragon fire spoke: each spoke pushes into a socket and one grub screw clamps it; two more clamp the pole. Pick fire ends, or practice ends that weigh the same as a wet wick.'),
    spoke('spokeStar', 'Spoke Star', 'star', 'A star-shaped spoke hub: a boss round each socket and nothing in between, so it is lighter and looks like part of the staff. Takes 8 mm fire spokes.'),
    spoke('spokePetal', 'Spoke Petal', 'petal', 'A spoke hub with a fat petal round each socket, flowing into the next. Takes 8 mm fire spokes; print it in PETG or nylon to practise first.'),
    spoke('spokeMinimal', 'Minimal Spoke Hub', 'star', 'A small, light three-spoke hub for 6 mm cable spokes with knot wicks: just enough metal round each socket, an expanding spigot inside the pole end (or a clamp), and nothing else. Pairs with the Pole Joiner for a three-piece travel staff.', { spokes: 3, rodD: 6, hubD: 72, hubT: 15, depth: 20 }),
    spoke('spokeFlower', 'Spoke Flower', 'flower', 'Broad petals with vent holes between them: lighter, and the holes glow orange in the firelight. Takes 8 mm fire spokes.'),
  )
  for (const d of out) d.added = '2026-11-20'
  void deg
  return out
}
