/**
 * Infill: how solid a print is, and where the solid goes.
 *
 *   fill     sparse infill, 0 (walls only) to 100% (solid)
 *   place    even        the slicer's usual: a few walls, the same infill all through
 *            outside     solid out to the surface: thick walls (the band), lighter inside
 *            inside      solid round the pole hole or the core (the band), lighter
 *                        towards the outside; a "solid zone" modifier tells the slicer
 *   band     how thick the solid part is, mm
 *
 * The weight is worked out from the part's volume and surface: the walls are about
 * surface x thickness, the rest is infill. Units mm.
 */
export const INFILL0 = { fill: 100, place: 'even', band: 3 }
export const PLACES = {
  even: 'even all through',
  outside: 'solid outer edges, lighter inside',
  inside: 'solid inner edges (round the pole or core), lighter outside',
}
const LINE = 0.45 // extrusion width
const LAYER = 0.2
const WALL0 = 1.2 // the slicer's usual walls and skins, about 3 lines

/** What to type into a slicer (and what the 3MF carries). */
export function slicerSettings(inf) {
  const fill = Math.round(inf.fill)
  const solid = fill >= 100
  const band = inf.place === 'outside' ? inf.band : WALL0
  const walls = Math.max(2, Math.ceil(band / LINE))
  const skins = Math.max(4, Math.ceil(band / LAYER))
  const pattern = solid ? 'rectilinear' : fill <= 15 ? 'gyroid' : 'gyroid'
  const zone = inf.place === 'inside' && !solid
  const text = solid
    ? '100% infill (solid), any pattern'
    : `${fill}% ${pattern} infill, ${walls} walls, ${skins} top and ${skins} bottom layers` + (zone ? `, plus the solid zone as a modifier at 100% infill` : '')
  return { fill, solid, walls, skins, pattern, zone, text }
}

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}
function areaVol(md) {
  const P = md.positions, I = md.indices
  let A = 0, V = 0
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
    A += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
    V += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6
  }
  return { A, V: Math.abs(V) }
}

/** After a build: the weight at this infill, and the solid zone for the slicer. */
export function applyInfill(wasm, result, inf) {
  const bodyKey = result.meshes?.printFlat ? 'printFlat' : result.meshes?.combined ? 'combined' : null
  if (!bodyKey || !result.stats) return result
  const s = slicerSettings(inf)
  const body = result.meshes[bodyKey]
  const { A, V } = areaVol(body)
  if (!V) return result
  const fill = s.fill / 100
  let Veff, zone = null, Vz = 0
  if (s.zone) {
    const { Manifold, Mesh } = wasm
    const live = []
    const k = (o) => (live.push(o), o)
    try {
      const M = k(new Manifold(new Mesh({ numProp: 3, vertProperties: body.positions, triVerts: body.indices })))
      const b = M.boundingBox(), cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2
      // the axis: through the pole socket if there is one (the narrowest hole down the middle), else the core
      const inside = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c } return c }
      let rIn = Infinity
      for (const f of [0.15, 0.3, 0.5, 0.7, 0.85]) {
        const around = k(M.slice(b.min[2] + f * (b.max[2] - b.min[2]))).toPolygons().filter((q) => inside(q, cx, cy))
        if (!around.length || around.length % 2) continue // the middle is solid here
        let r = Infinity
        for (const q of around) for (let i = 0; i < q.length; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % q.length]; const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / L)) : 0; r = Math.min(r, Math.hypot(cx - x1 - t * dx, cy - y1 - t * dy)) }
        rIn = Math.min(rIn, r)
      }
      if (!Number.isFinite(rIn)) rIn = 0
      const cyl = k(k(Manifold.cylinder(b.max[2] - b.min[2] + 2, rIn + inf.band, rIn + inf.band, 64)).translate([cx, cy, b.min[2] - 1]))
      const Z = k(M.intersect(cyl))
      Vz = Z.volume()
      if (Vz > 0) zone = meshData(Z)
    } catch { zone = null; Vz = 0 } finally { for (const o of live) o.delete?.() }
  }
  if (s.solid) Veff = V
  else if (zone) {
    const Vr = V - Vz, Ar = A * (Vr / V), Vs = Math.min(Vr, Ar * WALL0)
    Veff = Vz + Vs + (Vr - Vs) * fill
  } else {
    const t = inf.place === 'outside' ? inf.band : WALL0
    const Vs = Math.min(V, A * t)
    Veff = Vs + (V - Vs) * fill
  }
  const ratio = Veff / V
  const g0 = result.stats.grams
  const g = g0 * ratio
  result.stats = { ...result.stats, grams: g, gramsTotal: result.stats.gramsTotal - g0 + g, gramsSolid: g0 }
  result.infill = { ...inf, ratio, settings: s, bodyKey, zone: !!zone, gSolid: g0, g }
  if (zone) result.meshes.solidZone = zone
  return result
}

const esc = (t) => String(t).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c])

/**
 * A 3MF that carries the print settings: one object, the part plus (when there is one)
 * the solid zone as a modifier volume at 100% infill. PrusaSlicer reads the settings
 * from Metadata/Slic3r_PE_model.config.
 */
export function to3MFPrint(zipStore, body, zone, s, name) {
  const verts = [], tris = []
  const add = (m) => {
    const base = verts.length / 3, t0 = tris.length / 3
    for (let i = 0; i < m.positions.length; i++) verts.push(m.positions[i])
    for (let i = 0; i < m.indices.length; i++) tris.push(m.indices[i] + base)
    return [t0, tris.length / 3 - 1]
  }
  const [b0, b1] = add(body)
  const zr = zone ? add(zone) : null
  let vx = ''
  for (let i = 0; i < verts.length; i += 3) vx += `<vertex x="${verts[i].toFixed(4)}" y="${verts[i + 1].toFixed(4)}" z="${verts[i + 2].toFixed(4)}"/>`
  let tx = ''
  for (let i = 0; i < tris.length; i += 3) tx += `<triangle v1="${tris[i]}" v2="${tris[i + 1]}" v3="${tris[i + 2]}"/>`
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">
<metadata name="slic3rpe:Version3mf">1</metadata><metadata name="Title">${esc(name)}</metadata><metadata name="Application">dream.sc hub forge</metadata>
<resources><object id="1" name="${esc(name)}" type="model"><mesh><vertices>${vx}</vertices><triangles>${tx}</triangles></mesh></object></resources>
<build><item objectid="1"/></build></model>`
  const meta = (key, value, type = 'object') => `  <metadata type="${type}" key="${key}" value="${esc(value)}"/>\n`
  const cfg = `<?xml version="1.0" encoding="UTF-8"?>
<config>
 <object id="1" instances_count="1">
${meta('name', name)}${meta('fill_density', `${s.fill}%`)}${meta('fill_pattern', s.pattern)}${meta('perimeters', s.walls)}${meta('top_solid_layers', s.skins)}${meta('bottom_solid_layers', s.skins)}  <volume firstid="${b0}" lastid="${b1}">
${meta('name', name, 'volume')}${meta('volume_type', 'ModelPart', 'volume')}  </volume>
${zr ? `  <volume firstid="${zr[0]}" lastid="${zr[1]}">
${meta('name', 'solid zone', 'volume')}${meta('volume_type', 'ParameterModifier', 'volume')}${meta('modifier', '1', 'volume')}${meta('fill_density', '100%', 'volume')}${meta('fill_pattern', 'rectilinear', 'volume')}  </volume>
` : ''} </object>
</config>
`
  return zipStore([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="text/xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`],
    ['3D/3dmodel.model', model],
    ['Metadata/Slic3r_PE_model.config', cfg],
  ])
}
