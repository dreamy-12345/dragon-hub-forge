/**
 * Finish: your own logo, text or picture on any design, raised or engraved.
 * The picture arrives as traced outlines in a unit box (create.js traceCanvas).
 * It is projected onto the part from one side (or several, round the sides):
 *   raised    the layer just outside every surface that faces that way, inside
 *             the outline, h mm deep, is added
 *   engraved  the layer just inside those surfaces is taken away
 * Anything the projection would put inside a hidden cavity (a socket floor under
 * a roof, a sealed chamber) is dropped by casting a ray back towards the viewer.
 * On flat cut parts (CNC) the outline goes on the ENGRAVE layer instead.
 */

function meshData(m) {
  const mesh = m.getMesh(), np = mesh.numProp, n = mesh.vertProperties.length / np
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * np + j]
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l) }

/** Does a ray from o along d hit any triangle of the mesh (beyond a hair)? */
function rayHits(P, I, o, d) {
  for (let t = 0; t < I.length; t += 3) {
    const a = [P[I[t] * 3], P[I[t] * 3 + 1], P[I[t] * 3 + 2]], b = [P[I[t + 1] * 3], P[I[t + 1] * 3 + 1], P[I[t + 1] * 3 + 2]], c = [P[I[t + 2] * 3], P[I[t + 2] * 3 + 1], P[I[t + 2] * 3 + 2]]
    const e1 = sub3(b, a), e2 = sub3(c, a), h = cross(d, e2), det = dot(e1, h)
    if (Math.abs(det) < 1e-9) continue
    const f = 1 / det, s = sub3(o, a), u = f * dot(s, h)
    if (u < 0 || u > 1) continue
    const q = cross(s, e1), v = f * dot(d, q)
    if (v < 0 || u + v > 1) continue
    if (f * dot(e2, q) > 0.05) return true
  }
  return false
}

/** The faces to stamp: outward directions with the logo's own right and up. */
function facesOf(f) {
  const out = []
  const turn = ((f.turn || 0) * Math.PI) / 180
  if (f.where === 'round the side') {
    const n = Math.max(1, Math.round(f.copies || 1))
    for (let i = 0; i < n; i++) { const a = turn + (2 * Math.PI * i) / n, v = [Math.cos(a), Math.sin(a), 0]; out.push({ v, right: [-Math.sin(a), Math.cos(a), 0], up: [0, 0, 1], spin: 0 }) }
    return out
  }
  const F = {
    top: { v: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] },
    bottom: { v: [0, 0, -1], right: [-1, 0, 0], up: [0, 1, 0] },
    front: { v: [0, -1, 0], right: [1, 0, 0], up: [0, 0, 1] },
    back: { v: [0, 1, 0], right: [-1, 0, 0], up: [0, 0, 1] },
    left: { v: [-1, 0, 0], right: [0, -1, 0], up: [0, 0, 1] },
    right: { v: [1, 0, 0], right: [0, 1, 0], up: [0, 0, 1] },
  }[f.where] || { v: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] }
  out.push({ ...F, spin: turn })
  return out
}

/** The stamp solid for one face: the logo prism through the part, cut to the skin. */
function stampFor(wasm, k, M, box, f, face) {
  const { CrossSection, Manifold } = wasm
  const loops = f.loops.map((l) => l.map(([x, y]) => [x * f.size, y * f.size]))
  let cs = k(new CrossSection(loops, 'Positive'))
  if (face.spin) cs = k(cs.rotate((face.spin * 180) / Math.PI))
  const diag = Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) + 10
  // centre of the face, moved by the offsets (as a share of the part's size in the logo's right/up directions)
  const c = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2]
  const ext = (dir) => Math.abs(dir[0]) * (box.max[0] - box.min[0]) + Math.abs(dir[1]) * (box.max[1] - box.min[1]) + Math.abs(dir[2]) * (box.max[2] - box.min[2])
  const at = c.map((v, i) => v + (face.right[i] * (f.across || 0) * ext(face.right)) / 200 + (face.up[i] * (f.up || 0) * ext(face.up)) / 200)
  // the prism in its own frame (x right, y up, z towards the viewer), then turned into place
  let prism = k(k(cs.extrude(2 * diag)).translate([0, 0, -diag]))
  const R = face.right, U = face.up, V = face.v
  const m = [R[0], U[0], V[0], at[0], R[1], U[1], V[1], at[1], R[2], U[2], V[2], at[2]]
  // manifold's transform takes a column-major 4x4
  prism = k(prism.transform([m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, m[3], m[7], m[11], 1]))
  const h = f.depth
  const skin = f.style === 'engraved'
    ? k(M.subtract(k(M.translate(V.map((x) => -x * h)))))
    : k(k(M.translate(V.map((x) => x * h))).subtract(M))
  return { stamp: k(prism.intersect(skin)), v: V }
}

/** Put the finish on a built design (mutates the result's meshes). */
export function applyFinish(wasm, result, f) {
  const { Manifold, Mesh } = wasm
  const live = []
  const k = (o) => (live.push(o), o)
  try {
    if (!f || !f.loops || !f.loops.length) return result
    // flat cut parts: the outline goes on the ENGRAVE layer, centred on the plate
    const flatPlate = result.cnc && result.layers?.cut?.length && !result.lathe && !result.dowel && !result.acro && !result.dart && !result.hilt && !result.tsword && !result.taxe?.mace && !result.taxe?.diamond
    if (flatPlate) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const P of result.layers.cut) for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
      const cx = (x0 + x1) / 2 + ((f.across || 0) * (x1 - x0)) / 200, cy = (y0 + y1) / 2 + ((f.up || 0) * (y1 - y0)) / 200
      const a = ((f.turn || 0) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a)
      result.layers.engrave = [...(result.layers.engrave || []), ...f.loops.map((l) => l.map(([x, y]) => [cx + (x * ca - y * sa) * f.size, cy + (x * sa + y * ca) * f.size]))]
      result.finishNote = 'Your finish is on the ENGRAVE layer of the cut file.'
    }
    const data = result.meshes?.combined
    if (!data) return result
    const M = k(new Manifold(new Mesh({ numProp: 3, vertProperties: data.positions, triVerts: data.indices })))
    const box = M.boundingBox()
    let out = M, added = 0
    for (const face of facesOf(f)) {
      const { stamp, v } = stampFor(wasm, k, out, box, f, face)
      if (stamp.isEmpty()) continue
      // drop anything that lands in a hidden cavity: cast a ray back towards the viewer from each piece
      const pieces = stamp.decompose().map(k)
      const keep = []
      const mesh = out.getMesh(), P = mesh.vertProperties, I = mesh.triVerts, np = mesh.numProp
      const PP = np === 3 ? P : (() => { const n = P.length / np, q = new Float32Array(n * 3); for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) q[i * 3 + j] = P[i * np + j]; return q })()
      for (const q of pieces.slice(0, 600)) {
        if (q.volume() < 0.05) continue
        const b = q.boundingBox(), c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
        const far = Math.max(dot(b.min, v), dot(b.max, v), dot([b.min[0], b.max[1], b.min[2]], v), dot([b.max[0], b.min[1], b.max[2]], v))
        const o = c.map((x, i) => x + v[i] * (far - dot(c, v) + 0.05))
        if (!rayHits(PP, I, o, v)) keep.push(q)
      }
      if (!keep.length) continue
      let S = k(Manifold.union(keep))
      if (f.style !== 'engraved') S = k(k(S.translate(v.map((x) => -x * 0.3))).add(S)) // sink it 0.3 mm so it fuses to the surface
      out = f.style === 'engraved' ? k(out.subtract(S)) : k(out.add(S))
      added += keep.length
    }
    if (added) {
      // tidy away zero-volume slivers the booleans can leave
      const ps = out.decompose().map(k), keepP = ps.filter((q) => Math.abs(q.volume()) > 0.5)
      if (keepP.length && keepP.length < ps.length) out = k(Manifold.compose(keepP))
      result.meshes.combined = meshData(out)
      result.finishNote = (result.finishNote ? result.finishNote + ' ' : '') + `Your ${f.style === 'engraved' ? 'engraving' : 'raised finish'} is on the part shown and in its STL.`
      // flat copies of the same part (the print layout): same vertices, moved: put it on them too
      for (const [key, md] of Object.entries(result.meshes)) {
        if (key === 'combined' || !md?.positions || md.positions.length !== data.positions.length) continue
        const T = fitRigid(data.positions, md.positions)
        if (!T) continue
        const O = k(new Manifold(new Mesh({ numProp: 3, vertProperties: md.positions, triVerts: md.indices })))
        const moved = k(out.transform(T))
        if (Math.abs(moved.volume() - out.volume()) < 1 && O) result.meshes[key] = meshData(moved)
      }
      if (result.stats) result.stats.finish = f.style
    }
    return result
  } catch (e) {
    result.stats?.warns?.push(`The finish could not be put on this design (${e.message || e}).`)
    return result
  } finally {
    for (const o of live) o.delete?.()
  }
}

/** If B is A moved rigidly (same vertex order), the 4x4 column-major transform, else null. */
function fitRigid(A, B) {
  const n = A.length / 3
  if (n < 4) return null
  const pick = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1]
  const a = pick.map((i) => [A[i * 3], A[i * 3 + 1], A[i * 3 + 2]]), b = pick.map((i) => [B[i * 3], B[i * 3 + 1], B[i * 3 + 2]])
  // solve B = R A + t from the first point and three difference vectors
  const da = [sub3(a[1], a[0]), sub3(a[2], a[0]), sub3(a[3], a[0])], db = [sub3(b[1], b[0]), sub3(b[2], b[0]), sub3(b[3], b[0])]
  const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const Dm = [[da[0][0], da[1][0], da[2][0]], [da[0][1], da[1][1], da[2][1]], [da[0][2], da[1][2], da[2][2]]]
  const D = det3(Dm)
  if (Math.abs(D) < 1e-6) return null
  // R = Db * inv(Da) (columns are the difference vectors)
  const inv = (() => {
    const m = Dm, c = (r, cc) => { const s = [0, 1, 2].filter((x) => x !== r), t = [0, 1, 2].filter((x) => x !== cc); return ((r + cc) % 2 ? -1 : 1) * (m[s[0]][t[0]] * m[s[1]][t[1]] - m[s[0]][t[1]] * m[s[1]][t[0]]) }
    return [0, 1, 2].map((i) => [0, 1, 2].map((j) => c(j, i) / D))
  })()
  const Db = [[db[0][0], db[1][0], db[2][0]], [db[0][1], db[1][1], db[2][1]], [db[0][2], db[1][2], db[2][2]]]
  const Rm = [0, 1, 2].map((i) => [0, 1, 2].map((j) => Db[i][0] * inv[0][j] + Db[i][1] * inv[1][j] + Db[i][2] * inv[2][j]))
  const t = [0, 1, 2].map((i) => b[0][i] - (Rm[i][0] * a[0][0] + Rm[i][1] * a[0][1] + Rm[i][2] * a[0][2]))
  // check a few more points
  for (let s = 0; s < 12; s++) {
    const i = Math.floor((n * (s + 0.5)) / 12), p = [A[i * 3], A[i * 3 + 1], A[i * 3 + 2]]
    for (let j = 0; j < 3; j++) if (Math.abs(Rm[j][0] * p[0] + Rm[j][1] * p[1] + Rm[j][2] * p[2] + t[j] - B[i * 3 + j]) > 0.01) return null
  }
  return [Rm[0][0], Rm[1][0], Rm[2][0], 0, Rm[0][1], Rm[1][1], Rm[2][1], 0, Rm[0][2], Rm[1][2], Rm[2][2], 0, t[0], t[1], t[2], 1]
}
