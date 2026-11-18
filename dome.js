/**
 * The physical dome, as data.
 *
 * Single source of truth for where the junctions are and which junctions are
 * joined by an LED path. Pure geometry — it draws nothing and knows nothing
 * about any game. Imported by both the server (collision, pathfinding) and the
 * browser (rendering), so it must stay dependency-free.
 *
 * Extracted from the original pacman prototype (~/Projects/pacman/index.html),
 * which built this topology as a side effect of its draw call and created ~90
 * duplicate centre nodes. Same structure, minus those problems.
 *
 * COORDINATES: normalised to a mapping circle of radius 1 centred on (0,0),
 * with +y pointing DOWN (canvas convention). The outer ring lands at 0.8625.
 * Multiply by whatever radius you're drawing at.
 *
 * DIRECTIONS: `in` = toward the centre, `out` = toward the rim, `cw`/`ccw` =
 * around the ring. Increasing junction index is clockwise on screen.
 */

// Ring 0 is the OUTERMOST. Radii come from the prototype's 800px canvas
// (half-width 400), normalised.
const PROTOTYPE_HALF_CANVAS = 400
export const RING_RADII = [345, 264, 172.5, 87, 40].map((r) => r / PROTOTYPE_HALF_CANVAS)
export const RING_COUNTS = [24, 24, 24, 12, 6]
const RING_OFFSETS = [0, 0, 0, 0, Math.PI / 6]

export const RING_COUNT = RING_RADII.length
export const CENTRE_RING = RING_COUNT // the hub's "ring" index

function buildDome() {
  const junctions = []
  const rings = []

  for (let ring = 0; ring < RING_COUNT; ring++) {
    const ids = []
    for (let i = 0; i < RING_COUNTS[ring]; i++) {
      const angle = (Math.PI * 2 * i) / RING_COUNTS[ring] + RING_OFFSETS[ring]
      const radius = RING_RADII[ring]
      ids.push(junctions.length)
      junctions.push({
        id: junctions.length,
        ring,
        index: i,
        angle,
        radius,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        dirs: {},
        adj: [],
      })
    }
    rings.push(ids)
  }

  // The hub. Exactly one of these — the prototype accidentally made ~90.
  const centre = {
    id: junctions.length,
    ring: CENTRE_RING,
    index: 0,
    angle: 0,
    radius: 0,
    x: 0,
    y: 0,
    dirs: {},
    adj: [],
  }
  junctions.push(centre)
  rings.push([centre.id])

  const edges = []
  const seen = new Set()

  const join = (aId, bId, dirFromA, dirFromB) => {
    if (aId === bId) return
    const key = aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`
    const a = junctions[aId]
    const b = junctions[bId]
    if (dirFromA) a.dirs[dirFromA] = bId
    if (dirFromB) b.dirs[dirFromB] = aId
    if (seen.has(key)) return
    seen.add(key)
    a.adj.push(bId)
    b.adj.push(aId)
    edges.push({ a: aId, b: bId })
  }

  // --- around each ring -------------------------------------------------
  for (let ring = 0; ring < RING_COUNT; ring++) {
    const ids = rings[ring]
    const n = ids.length
    for (let i = 0; i < n; i++) {
      join(ids[i], ids[(i + 1) % n], 'cw', 'ccw')
    }
  }

  // --- rings 0<->1 and 1<->2: zig-zag ----------------------------------
  // Both rings have 24 junctions. Alternate junctions fan inward to the two
  // neighbours straddling them. Ring 0 fans from its even junctions, ring 1
  // from its odd ones, which is what makes the zig-zag alternate.
  for (let ring = 0; ring < 2; ring++) {
    const outer = rings[ring]
    const inner = rings[ring + 1]
    const n = outer.length
    for (let j = 0; j < n; j++) {
      if (j % 2 !== ring % 2) continue
      join(outer[j], inner[(j + 1) % n], 'inCw', 'outCcw')
      join(outer[j], inner[(j - 1 + n) % n], 'inCcw', 'outCw')
    }
  }

  // --- ring 2 (24) <-> ring 3 (12) --------------------------------------
  // Every 4th junction runs straight in; the ones between it fan to either side.
  {
    const outer = rings[2]
    const inner = rings[3]
    const m = inner.length
    for (let j = 0; j < outer.length; j++) {
      const half = Math.floor(j / 2)
      if (j % 4 === 2) {
        join(outer[j], inner[half % m], 'in', 'out')
      } else if (j % 4 === 0) {
        join(outer[j], inner[(half + 1) % m], 'inCw', 'outCcw')
        join(outer[j], inner[(half - 1 + m) % m], 'inCcw', 'outCw')
      }
    }
  }

  // --- ring 3 (12) <-> ring 4 (6) ---------------------------------------
  {
    const outer = rings[3]
    const inner = rings[4]
    const m = inner.length
    for (let j = 0; j < outer.length; j++) {
      const half = Math.floor(j / 2)
      if (j % 2 === 1) {
        join(outer[j], inner[half % m], 'in', 'out')
      } else {
        join(outer[j], inner[half % m], 'inCw', 'outCcw')
        join(outer[j], inner[(half - 1 + m) % m], 'inCcw', 'outCw')
      }
    }
  }

  // --- ring 4 -> hub ----------------------------------------------------
  rings[4].forEach((id, i) => {
    join(id, centre.id, 'in', `spoke${i}`)
  })

  return { junctions, edges, rings }
}

const dome = buildDome()

export const JUNCTIONS = dome.junctions
export const EDGES = dome.edges
export const RINGS = dome.rings
export const CENTRE_ID = dome.junctions[dome.junctions.length - 1].id

/** Junctions scaled to a pixel radius, ready to draw. */
export function junctionsAt(radius, cx = 0, cy = 0) {
  return JUNCTIONS.map((j) => ({ ...j, x: cx + j.x * radius, y: cy + j.y * radius }))
}

/** LED paths as line segments at a pixel radius — for drawing, or for walls. */
export function edgeSegmentsAt(radius, cx = 0, cy = 0) {
  return EDGES.map(({ a, b }) => {
    const A = JUNCTIONS[a]
    const B = JUNCTIONS[b]
    return {
      a,
      b,
      x1: cx + A.x * radius,
      y1: cy + A.y * radius,
      x2: cx + B.x * radius,
      y2: cy + B.y * radius,
    }
  })
}

/** Nearest junction to a point given in the same normalised space. */
export function nearestJunction(x, y) {
  let best = null
  let bestD = Infinity
  for (const j of JUNCTIONS) {
    const d = (j.x - x) ** 2 + (j.y - y) ** 2
    if (d < bestD) {
      bestD = d
      best = j
    }
  }
  return best
}

/** Walk a named direction from a junction, or null if there's no path that way. */
export function step(junctionId, dir) {
  const next = JUNCTIONS[junctionId]?.dirs?.[dir]
  return next == null ? null : JUNCTIONS[next]
}

export const DOME_STATS = {
  junctions: JUNCTIONS.length,
  edges: EDGES.length,
  rings: RING_COUNTS.slice(),
  outerRadius: RING_RADII[0],
}
