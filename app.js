import * as THREE from 'three'
import { OrbitControls } from './vendor/OrbitControls.js'
import { DESIGNS, COMMON_PARAMS, MATERIALS, defaults, toSTL, toSVG, to3MF, zipStore } from './hub.js'
import { INFILL0, PLACES, slicerSettings, to3MFPrint } from './infill.js'
import { LIGHTS0, LIGHT_SIZES, LIGHTS_THAT_FIT, CAPSULES, lightDims, CAP_H, WALL } from './lights.js'
import { createCommunity } from './community.js'
import { LED_MODES, PAGE_NAMES } from './leds.js'
import { BubbleSim } from './bubbles.js'
import { initCreate, traceCanvas } from './create.js'
import { createLikes } from './likes.js'
import { initHelp } from './help.js'
import { CNC_PARAMS, PROCESSES, cncDefaults, matOf, matKey, procKey, endsKey, ENDS, SPOKE_ENDS, toDXF, toCutSVG, spokeDrawingSVG } from './cnc.js'
import { dartDrawingSVG } from './darts.js'
import { acroDrawingSVG } from './acro.js'
import { dowelDrawingSVG } from './dowel.js'
import { connectorSheetSVG } from './tubeswords.js'

const $ = (id) => document.getElementById(id)
// UV colours glow under the blacklight view; the others stay dark
const FILAMENTS = [
  ['Black', '#232227'], ['Red', '#d6343f'], ['Blue', '#2f6bff'], ['Natural', '#e8e4d8'],
  ['UV green', '#7dff6a', true], ['UV pink', '#ff4fb8', true], ['UV yellow', '#f5f03a', true], ['UV orange', '#ff8a1f', true],
]
const isUV = (hex) => FILAMENTS.some((f) => f[1] === hex && f[2])
const GLOWS = [
  ['Pink', '#ff3d7f'], ['Red', '#ff2a2a'], ['Amber', '#ffae2a'], ['Lime', '#b9ff5c'],
  ['Cyan', '#3fe0ff'], ['Blue', '#3b5bff'], ['Violet', '#a64dff'], ['White', '#fff4e6'],
]
const GROUPS = { Creations: 'Your creations', Adaptors: 'Pole adaptors', Glow: 'Glowing lanterns', Spin: 'Made for spinning', Creatures: 'Creatures', Organic: 'Organic', Classics: 'Classics', Claude: "Claude's own", Earth: 'Earth fractals', 'Fractal creatures': 'Fractal creatures', Thai: 'Myths and patterns', Fire: '⚙️ CNC cut: metal and fire', SpokeHubs: '⚙️ Machined metal: fire spoke hubs', PracticeSpokes: 'Practice spokes (fit the spoke hubs)', CageStaff: 'Ringed fire staff ends', BubbleHubs: 'Bubble spinners', Sleeves: 'Pole inserts (stop clamps crushing the pole)', Dowels: '⚙️ Locking dowels: lock a hub on the pole end', Grips: 'Hub to pole grips (no crushing)', Collapsible: 'Collapsible staff joints', Contact: 'Balls and fun ends', Axes: 'Battle axes (with counterweights)', Acro: 'Acro staff ends (printed, weighted)', FistContact: "Monkey's fist ends", MeteorCages: '⚙️ Meteor cages (metal bands, Kevlar)', CagePoi: '⚙️ Ringed fire poi', Aotearoa: 'Aotearoa New Zealand', Cans: 'Beer can', Mushrooms: 'Mushrooms', Eyes: 'Eyeball balls', FistRope: "Monkey's fist heads", FistPoi: "Monkey's fist poi", PineContact: 'Pine cone staff ends', DartPine: 'Pine cones', PineCones: 'Pine cones', AcroMetal: '⚙️ Acro staff ends: turned metal', MouldAcro: 'Acro end moulds', DartClassic: 'Classic', DartModern: 'Modern', DartRound: 'Round', DartPattern: 'Detailed patterns', DartNature: 'Nature and fun', Poi: 'Poi heads', MouldContact: 'Contact ball moulds', MouldDart: 'Rope dart moulds', MouldPoi: 'Poi moulds', Hoops: 'Hoops: cut lengths and connectors', HoopJoints: 'Push-button and pin joints', Swords: '⚙️ CNC cut: fire contact swords', TubeSwords: '⚙️ Tube fire swords (hilt connector on your pole)', TubeAxes: '⚙️ Tube fire axes (Viking and anime)', BubblePoi: 'Bubble poi', SparkDragon: 'For dragon staffs (spoke tips)', SparkRope: 'For rope darts', SparkStaff: 'For staff ends', Dreamscape: 'Dreamscape', Dogs: 'Dogs', LoyalDog: 'The loyal dog', Signature: 'Signature', Melt: 'Melted' }

// ------------------------------------------------------------------ state --
const saved = (() => {
  try { return JSON.parse(localStorage.getItem('dragonhub2') || '{}') } catch { return {} }
})()
const state = {
  design: DESIGNS.find((d) => d.id === saved.design) ? saved.design : DESIGNS.find((d) => !d.adaptor && !d.custom).id,
  params: {},
  material: saved.material in MATERIALS ? saved.material : 'tpu95',
  color: saved.color || FILAMENTS[0][1], // colour A: the frame
  colorB: saved.colorB || '#e8e4d8', // colour B: raised shapes and lanterns
  colorRing: saved.colorRing || null, // weight ring, printed separately; null = match the hub (snap: B, bubble: A)
  glow: saved.glow && saved.glow !== 'rainbow' ? saved.glow : null, // capsule colour for solid/strobe; null = the design's own
  glow2: saved.glow2 || '#3b5bff', // gradient mode fades between the capsule colour and this
  bed: saved.bed || '300', // the Bambu H2D, both nozzles
}
// v2 (2026-11-17): standard hub is 280 mm, rim 15 mm, shapes 10 mm. Older saves carried the
// old sizes for every design, so drop those three and let the new standard apply.
if ((saved.v || 1) < 2) for (const sp of Object.values(saved.params || {})) { delete sp.diameter; delete sp.rimH; delete sp.reliefH }
// v3 (2026-11-18): bubble loops default to the tool-free snap ring; 'edge' was the old default, saved for every design
if ((saved.v || 1) < 3) for (const sp of Object.values(saved.params || {})) if (sp.ringPlace === 'edge') delete sp.ringPlace
// v4 (2026-11-22): swords default to Kevlar the full length of the blade, right up to the guard; drop older saved wick choices
if ((saved.v || 1) < 4) for (const d of DESIGNS) if (d.sword && saved.params?.[d.id]) { delete saved.params[d.id].wicks; delete saved.params[d.id].bare }
// v5 (2026-11-23): the Morel was reshaped squat and broad; drop its old saved size
if ((saved.v || 1) < 5 && saved.params?.dartMorel) { delete saved.params.dartMorel.length; delete saved.params.dartMorel.maxD }
// saved values that no longer fit a design's control (an old number where it now takes a choice, or the other way) are dropped
const fits = (def, v) => !def || (def.options ? def.options.includes(v) : def.check ? typeof v === 'boolean' : typeof def.value === 'number' ? typeof v === 'number' && Number.isFinite(v) : typeof v === typeof def.value)
for (const d of DESIGNS) {
  const sp = { ...(saved.params?.[d.id] || {}) }
  for (const key of Object.keys(sp)) if (!fits(d.params.find((x) => x.key === key) || COMMON_PARAMS.find((x) => x.key === key), sp[key])) delete sp[key]
  state.params[d.id] = { ...defaults(d), ...sp }
}
state.v = 5
// finish (logo, text, picture) per design
state.finish = saved.finish && typeof saved.finish === 'object' ? saved.finish : {}
// infill (how solid, and where the solid goes) per design
state.infill = saved.infill && typeof saved.infill === 'object' ? saved.infill : {}
// gloving-light pockets per design
state.lights = saved.lights && typeof saved.lights === 'object' ? saved.lights : {}
state.units = ['mm', 'in', 'banana'].includes(saved.units) ? saved.units : 'mm'
// How it is made: 3D print (everything above) or CNC cut. CNC settings are per design
// and live apart from the print settings, so switching never changes a print design.
state.mode = saved.mode === 'cnc' ? 'cnc' : 'print'
state.cncp = {}
for (const d of DESIGNS) state.cncp[d.id] = { ...cncDefaults(d), ...(saved.cncp?.[d.id] || {}) }
const isCnc = () => state.mode === 'cnc'
const cncOnly = (d) => !!d.cncOnly // fire swords: metal, cut on a CNC, never printed
const printOnly = (d) => !!(d.bubbleHub || d.fist || (d.acro && !d.acroMetal) || d.bubblePoi || d.hoop || d.mould || d.adaptor || d.ballEnd || d.sleeve || d.practiceSpoke || d.novelty || d.grip) // always 3D printed, in either mode
const cncp = () => state.cncp[state.design]
const design = () => DESIGNS.find((d) => d.id === state.design)
const params = () => state.params[state.design]
const glowColor = () => state.glow || design().glow || '#ffae2a'
const persist = () => {
  try { localStorage.setItem('dragonhub2', JSON.stringify(state)) } catch {}
}

// ----------------------------------------------------------------- worker --
function makeWorker() {
  const w = new Worker(window.__WORKER_URL || './worker.js', { type: 'module' }) // the portable build passes a blob URL
  w.onerror = (e) => {
    status(`geometry engine failed to load: ${e.message || 'see the browser console'}`)
    for (const p of pending.values()) p.reject(new Error(e.message || 'worker error'))
    pending.clear()
  }
  let seq = 0
  const pending = new Map()
  w.onmessage = ({ data }) => {
    const p = pending.get(data.id)
    pending.delete(data.id)
    if (p) data.error ? p.reject(new Error(data.error)) : p.resolve(data.result)
  }
  return (op, payload = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      w.postMessage({ id, op, ...payload })
    })
}
const work = makeWorker() // the hub you are editing
const thumbWork = makeWorker() // gallery thumbnails, in the background

// ------------------------------------------------------------------ three --
// Two views of one scene: face-on (how the audience sees a spinning hub) and an
// angled view (how it sits on the bed). One fills the stage, the other sits in
// a small picture-in-picture; clicking the PIP swaps them.
const BG = new THREE.Color(0x0e0d12), BG_DARK = new THREE.Color(0x030305), BG_UV = new THREE.Color(0x07031a)
const canvas = $('gl')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
const scene = new THREE.Scene()

const camFace = new THREE.PerspectiveCamera(30, 1, 1, 5000)
camFace.up.set(0, 1, 0)
camFace.position.set(0, 0, 620)
const camAngle = new THREE.PerspectiveCamera(35, 1, 1, 5000)
camAngle.up.set(0, 0, 1)
camAngle.position.set(260, -330, 300)
const ctlFace = new OrbitControls(camFace, canvas)
// every view can be turned to look from any side; 360° (or swapping views) puts it back
ctlFace.target.set(0, 0, 8)
const ctlAngle = new OrbitControls(camAngle, canvas)
ctlAngle.enableDamping = true
ctlAngle.target.set(0, 0, 8)
// cameras were placed for a ~140 mm radius hub; scale them for much smaller parts
let framedR = 140
function frameView(R) {
  const want = R < 60 ? R * 1.9 : Math.max(140, R) // a small part fills about the same share of the view as a hub
  if (Math.abs(want - framedR) / framedR < 0.25) return
  const f = want / framedR
  framedR = want
  setMain(want >= 140) // face-on looks down the staff, which hides a small part: show it angled
  for (const [cam, ctl] of [[camFace, ctlFace], [camAngle, ctlAngle]]) {
    ctl.target.multiplyScalar(f)
    cam.position.sub(ctl.target.clone().divideScalar(f)).multiplyScalar(f).add(ctl.target)
    ctl.update()
  }
}
let mainIsFace = true
const mainCam = () => (mainIsFace ? camFace : camAngle)
const pipCam = () => (mainIsFace ? camAngle : camFace)
function setMain(face) {
  mainIsFace = face
  ctlFace.enabled = face
  ctlAngle.enabled = !face
  $('pipLabel').textContent = face ? 'Angled · click to swap' : 'Face on · click to swap'
}

const hemi = new THREE.HemisphereLight(0xfff1e0, 0x1a1530, 1.1)
scene.add(hemi)
const key = new THREE.DirectionalLight(0xffffff, 2.2)
key.position.set(200, -150, 400)
scene.add(key)
const back = new THREE.DirectionalLight(0xb48cff, 1.2)
back.position.set(-300, 250, -100)
scene.add(back)

const spinner = new THREE.Group()
scene.add(spinner)
const frameMat = new THREE.MeshStandardMaterial({ color: state.color, roughness: 0.6, metalness: 0.05 })
const glowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, transparent: true, opacity: 0.92, emissive: 0x000000 })
const lidMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, transparent: true, opacity: 0.55, emissive: 0x000000, depthWrite: false })
const frameMesh = new THREE.Mesh(new THREE.BufferGeometry(), frameMat)
// eye balls: the view paints the bands by height, the same heights the filament changes go in at
const eyeU = { eyeZ: { value: new THREE.Vector3(1e9, 1e9, 1e9) }, eyeC: { value: [0, 1, 2, 3].map(() => new THREE.Color()) } }
const eyeMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05 })
eyeMat.onBeforeCompile = (sh) => {
  // colour by the part's own height: z over pupil, iris, white thresholds, crisp at any mesh size
  Object.assign(sh.uniforms, eyeU)
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vEyeZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvEyeZ = position.z;')
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vEyeZ;\nuniform vec3 eyeZ;\nuniform vec3 eyeC[4];')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vEyeZ > eyeZ.x ? eyeC[3] : vEyeZ > eyeZ.y ? eyeC[2] : vEyeZ > eyeZ.z ? eyeC[1] : eyeC[0];')
}
const EYE_COLOURS = { whole: ['#13369a', '#f4f4f2', '#58b4ff', '#0b0b0e'], nazar: ['#13369a', '#13369a', '#58b4ff', '#0b0b0e'], classic: ['#f4f2ec', '#f4f2ec', '#5e8a3c', '#0b0b0e'], dragon: ['#f4f2ec', '#f4f2ec', '#ff9a1f', '#0b0b0e'], cat: ['#f4f2ec', '#f4f2ec', '#c9d82e', '#0b0b0e'] }
function paintEye(mesh, e) {
  ;(EYE_COLOURS[e.kind] || EYE_COLOURS.classic).forEach((h, i) => eyeU.eyeC.value[i].set(h))
  eyeU.eyeZ.value.set(e.pupilZ, e.irisZ, e.whiteZ ?? e.irisZ)
  eyeMat.clippingPlanes = frameMat.clippingPlanes; eyeMat.clipIntersection = true; eyeMat.side = frameMat.side; eyeMat.needsUpdate = true
  mesh.material = eyeMat
}
const glowMesh = new THREE.Mesh(new THREE.BufferGeometry(), glowMat)
const lidMesh = new THREE.Mesh(new THREE.BufferGeometry(), lidMat)
const ringMat = new THREE.MeshStandardMaterial({ color: state.color, roughness: 0.6, metalness: 0.05 }) // bubble weight ring
const ringMesh = new THREE.Mesh(new THREE.BufferGeometry(), ringMat)
const snapMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x000000 }) // snap-on weight: colour B, or lit if it has the LED strip
const snapMesh = new THREE.Mesh(new THREE.BufferGeometry(), snapMat)
spinner.add(frameMesh, glowMesh, lidMesh, ringMesh, snapMesh)
// fire spokes, Kevlar wicks and practice ends
const rodMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.9 })
const kevMat = new THREE.MeshStandardMaterial({ color: 0xd8a93a, roughness: 0.95, emissive: 0x000000 })
const pracMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 })
const rodMesh = new THREE.Mesh(new THREE.BufferGeometry(), rodMat)
const kevMesh = new THREE.Mesh(new THREE.BufferGeometry(), kevMat)
const pracMesh = new THREE.Mesh(new THREE.BufferGeometry(), pracMat)
spinner.add(rodMesh, kevMesh, pracMesh)
// the infill's solid zone, seen inside the part when the cross section is on
const zoneMat = new THREE.MeshStandardMaterial({ color: 0xff7a2a, roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 })
const zoneMesh = new THREE.Mesh(new THREE.BufferGeometry(), zoneMat)
spinner.add(zoneMesh)
const showZone = () => { zoneMesh.visible = !!(view.cut && current?.hub.infill?.zone && current.hub.infill.bodyKey === 'combined') }
// "How it works": a design can hand over moving parts (hub.anim) that slide out and back to show how it goes together
const animGroup = new THREE.Group()
spinner.add(animGroup)
const ghostMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.5, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false })
function setAnim(hub) {
  for (const m of animGroup.children) m.geometry.dispose()
  animGroup.clear()
  const list = hub?.anim || []
  for (const a of list) {
    const data = hub.meshes[a.key]
    if (!data) continue
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
    g.setIndex(new THREE.BufferAttribute(data.indices, 1))
    g.computeVertexNormals()
    const mat = a.look === 'kevlar' ? kevMat : a.look === 'ghost' ? ghostMat : a.look === 'part' ? frameMat : rodMat
    const m = new THREE.Mesh(g, mat)
    m.userData = a
    animGroup.add(m)
  }
  $('vAnim').hidden = !list.length
}

// halo: the lantern outlines, blurred, drawn additively above and below the disc
const haloCanvas = document.createElement('canvas')
haloCanvas.width = haloCanvas.height = 512
const haloTex = new THREE.CanvasTexture(haloCanvas)
const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff })
const haloTop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat)
const haloBot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat)
spinner.add(haloTop, haloBot)

const weakMat = new THREE.MeshBasicMaterial({ color: 0xff3048, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.9 })
const weakGroup = new THREE.Group()
spinner.add(weakGroup)

const bubbles = new BubbleSim(scene, spinner)

// size reference: a person (any height) or a lighter (about 8 cm), stood next to the design
const refGroup = new THREE.Group()
scene.add(refGroup)
const refMat = new THREE.MeshStandardMaterial({ color: 0x8fa3c8, roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false })
const REFS = ['off', 'person', 'lighter']
state.ref = REFS.includes(saved.ref) ? saved.ref : 'off'
state.refH = saved.refH || 170
function buildRef() {
  refGroup.clear()
  const kind = state.ref
  if (kind === 'off') return null
  const add = (geo, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, refMat); m.position.set(x, y, z); m.rotation.x = rx; refGroup.add(m); return m }
  if (kind === 'lighter') {
    // a refillable lighter: 81 × 26 × 12 mm body with its hood on top
    add(new THREE.BoxGeometry(26, 12, 64), 0, 0, 32)
    add(new THREE.BoxGeometry(22, 11, 17), 0, 0, 72.5)
    return { w: 26, h: 81 }
  }
  // a simple standing person, H mm tall, facing the viewer
  const H = state.refH * 10, cap = (r, len) => new THREE.CapsuleGeometry(r, Math.max(1, len - 2 * r), 6, 12)
  const legL = 0.47 * H, torsoL = 0.3 * H, headR = 0.065 * H, armL = 0.36 * H
  for (const s of [-1, 1]) {
    add(cap(0.045 * H, legL), s * 0.055 * H, 0, legL / 2, Math.PI / 2)
    add(cap(0.032 * H, armL), s * 0.135 * H, 0, legL + torsoL - armL / 2, Math.PI / 2)
  }
  add(cap(0.11 * H, torsoL + 0.05 * H), 0, 0, legL + torsoL / 2, Math.PI / 2).scale.set(1, 1, 0.6)
  add(new THREE.SphereGeometry(headR, 20, 14), 0, 0, legL + torsoL + headR * 1.1)
  return { w: 0.32 * H, h: H }
}
function placeRef() {
  const r = buildRef()
  $('vRef').textContent = 'Size: ' + (state.ref === 'off' ? 'off' : state.ref === 'person' ? `person ${state.refH} cm` : 'lighter')
  $('vRef').setAttribute('aria-pressed', String(state.ref !== 'off'))
  $('refHRow').hidden = state.ref !== 'person'
  if (!r) return
  // beside the design, standing on the same floor
  const box = new THREE.Box3()
  for (const m of [frameMesh, glowMesh, rodMesh, kevMesh, pracMesh]) if (m.visible && m.geometry.attributes.position) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox) }
  if (box.isEmpty()) box.set(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, 10))
  refGroup.position.set(box.max.x + 20 + r.w / 2, (box.min.y + box.max.y) / 2, box.min.z)
}

const pole = new THREE.Mesh(
  new THREE.CylinderGeometry(11, 11, 320, 48, 1, true),
  new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide })
)
pole.rotation.x = Math.PI / 2
pole.position.z = 20
scene.add(pole)

const bed = new THREE.Group()
scene.add(bed)
function drawBed() {
  bed.clear()
  const s = Number(state.bed)
  const sq = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(s, s)), new THREE.LineBasicMaterial({ color: 0x4a4458 }))
  sq.position.z = -0.2
  const grid = new THREE.GridHelper(s, s / 16, 0x2a2633, 0x221f2a)
  grid.rotation.x = Math.PI / 2
  grid.position.z = -0.3
  bed.add(sq, grid)
}

// trails: instead of clearing, fade the last frame a little each frame
const fadeScene = new THREE.Scene()
const fadeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
const fadeMat = new THREE.MeshBasicMaterial({ color: BG_DARK, transparent: true, opacity: 0.12, depthTest: false, depthWrite: false })
fadeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat))

let size = { w: 1, h: 1 }
const pipRect = () => {
  const w = Math.round(Math.max(150, Math.min(320, size.w * 0.3)))
  const h = Math.round(w * 0.75)
  return { x: size.w - w - 14, y: 58, w, h } // CSS px from the top-left, under the toolbar row
}
function resize() {
  const r = canvas.parentElement.getBoundingClientRect()
  size = { w: r.width, h: r.height }
  renderer.setSize(r.width, r.height, false)
  const p = pipRect()
  Object.assign($('pip').style, { left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px' })
}
new ResizeObserver(resize).observe(canvas.parentElement)

// clicking the PIP swaps the views; a drag that starts there is ignored
$('stage').addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect(), p = pipRect()
  const x = e.clientX - r.left, y = e.clientY - r.top
  if (!$('pip').hidden && x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
    e.stopPropagation()
    e.preventDefault()
    setMain(!mainIsFace)
  }
}, { capture: true })

const view = { dark: false, uv: false, spin: false, trails: false, strobe: false, rate: 1.5, led: 'rainbow', hz: 12, duty: 0.25, blinkHz: 2, fadeSec: 3 }
let frameNo = 0
let last = performance.now()
let ledClock = 0

const podLeds = () => !!design().pods
const ringLeds = () => { const p = params(); return p.snap !== 'off' && p.snapLed === 'on' && p.ring !== 'on' }
const hasLeds = () => podLeds() || ringLeds()
const ledMode = () => LED_MODES.find((m) => m.id === view.led) || LED_MODES[0]
const rgb = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b] }
const baseRGB = () => rgb(glowColor())

/** Light the lanterns for LED time `t`; returns false when the capsule is dark. */
function setLed(t) {
  if (!view.dark || !hasLeds()) return true
  const [r, g, b] = ledMode().fn(t, baseRGB(), { hz: view.hz, duty: view.duty, blinkHz: view.blinkHz, fadeSec: view.fadeSec, base2: rgb(state.glow2) })
  const on = r + g + b > 0.02
  const c = new THREE.Color(r, g, b)
  if (podLeds()) {
    glowMat.emissive.copy(c)
    glowMat.color.copy(on ? c : new THREE.Color(0x101014))
    lidMat.emissive.copy(c)
    lidMat.color.copy(on ? c : new THREE.Color(0x101014))
    haloMat.color.copy(c)
    haloTop.visible = haloBot.visible = on
  }
  if (ringLeds()) {
    snapMat.emissive.copy(c)
    snapMat.color.copy(on ? c : new THREE.Color(0x101014))
  }
  return on
}

function applyLook() {
  const dark = view.dark
  hemi.intensity = dark ? 0.06 : 1.1
  key.intensity = dark ? 0.12 : 2.2
  back.intensity = dark ? 0.05 : 1.2
  // blacklight: UV filament fluoresces, everything else stays near black
  const uvA = dark && view.uv && isUV(state.color)
  const uvB = dark && view.uv && isUV(state.colorB)
  frameMat.color.set(uvA ? state.color : dark ? '#141318' : state.color)
  frameMat.emissive.set(uvA ? state.color : '#000000')
  frameMat.emissiveIntensity = uvA ? 0.75 : 0
  renderer.setClearColor(dark && view.uv ? BG_UV : dark ? BG_DARK : BG)
  fadeMat.color.copy(dark && view.uv ? BG_UV : dark ? BG_DARK : BG)
  if (dark && ringLeds()) snapMat.emissiveIntensity = 1.4
  else {
    const snapC = state.colorRing || state.colorB, uvS = dark && view.uv && isUV(snapC)
    snapMat.color.set(uvS ? snapC : dark ? '#1a191f' : snapC)
    snapMat.emissive.set(uvS ? snapC : '#000000')
    snapMat.emissiveIntensity = uvS ? 0.75 : 0
  }
  const ringC = state.colorRing || state.color, uvR = dark && view.uv && isUV(ringC)
  ringMat.color.set(uvR ? ringC : dark ? '#141318' : ringC)
  ringMat.emissive.set(uvR ? ringC : '#000000')
  ringMat.emissiveIntensity = uvR ? 0.75 : 0
  if (dark && podLeds()) {
    glowMat.emissiveIntensity = 1.4
    lidMat.emissiveIntensity = 1.1
  } else {
    // colour B filament: translucent for lanterns, solid for raised shapes
    glowMat.color.set(uvB ? state.colorB : dark ? '#1a191f' : state.colorB)
    glowMat.emissive.set(uvB ? state.colorB : '#000000')
    glowMat.emissiveIntensity = uvB ? 0.75 : 0
    glowMat.opacity = podLeds() ? 0.88 : 1
    lidMat.emissive.set('#000000')
    lidMat.color.set('#ffffff')
    haloTop.visible = haloBot.visible = false
  }
  const cut = isCnc() && current && (current.hub.cnc || current.hub.spoke)
  if (cut) {
    const m = matOf(cncp()), metal = m.kind === 'metal'
    frameMat.color.set(dark ? (metal ? '#2a2a30' : '#141318') : m.colour)
    frameMat.metalness = metal ? 0.85 : 0.05
    frameMat.roughness = metal ? 0.32 : 0.22
    frameMat.transparent = !!m.clear
    frameMat.opacity = m.clear ? 0.7 : 1
  } else {
    frameMat.metalness = 0.05; frameMat.roughness = 0.6; frameMat.transparent = false; frameMat.opacity = 1
  }
  if (current?.hub.spoke && !isCnc()) { frameMat.color.set(dark ? '#141318' : state.color) }
  kevMat.color.set(dark ? '#ffb347' : '#d8a93a')
  kevMat.emissive.set(dark ? '#ff5a0a' : '#000000')
  if (!dark) kevMat.emissiveIntensity = 0
  pracMat.color.set(dark ? '#1a191f' : state.colorB)
  pole.material.color.set(dark ? 0x050506 : 0x1b1b1f)
  bed.visible = !dark && !isCnc() && $('vBed').getAttribute('aria-pressed') === 'true'
  weakGroup.visible = !dark && $('vWeak').getAttribute('aria-pressed') === 'true'
}

function drawView(cam, x, y, w, h) {
  cam.aspect = w / Math.max(1, h)
  cam.updateProjectionMatrix()
  renderer.setViewport(x, y, w, h)
  renderer.setScissor(x, y, w, h)
  renderer.render(scene, cam)
}

const SUB = 8 // sub-frames per frame when painting trails: strobes land as crisp dashes

renderer.setAnimationLoop((t) => {
  const dt = Math.min(0.1, (t - last) / 1000)
  last = t
  frameNo++
  if (animGroup.children.length) {
    // slide each part out along its path and back: out, hold, in, hold
    const u = view.anim ? (t / 1000 / 4) % 1 : 0
    const f = !view.anim ? 0 : u < 0.35 ? 0.5 - 0.5 * Math.cos((u / 0.35) * Math.PI) : u < 0.5 ? 1 : u < 0.85 ? 0.5 + 0.5 * Math.cos(((u - 0.5) / 0.35) * Math.PI) : 0
    for (const m of animGroup.children) {
      const a = m.userData, k = Math.min(1, Math.max(0, f * (a.lead || 1)))
      m.position.set(a.dir[0] * k, a.dir[1] * k, a.dir[2] * k)
      if (a.spin) m.rotation.z = a.spin * k
    }
  }
  if (view.dark && kevMesh.visible) kevMat.emissiveIntensity = 1.4 + Math.random() * 0.9 // the wicks are burning
  ctlFace.update()
  ctlAngle.update()
  bubbles.update(dt, view.rate, view.spin)
  const { w, h } = size
  renderer.setScissorTest(true)
  renderer.autoClear = false

  const N = design().strobe?.(params())
  const trails = view.trails && view.spin && !(view.strobe && N)
  if (view.strobe && N) {
    // zoetrope: N flashes per turn, slightly slow so the ring creeps forward.
    // Each flash is held until the next instead of flashing black in between.
    if (frameNo % 5 === 0) spinner.rotation.z -= ((Math.PI * 2) / N) * 1.04
    ledClock += dt
    setLed(ledClock)
    renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h); renderer.clear()
    drawView(mainCam(), 0, 0, w, h)
  } else if (trails && !hasLeds()) {
    // trails without capsules: fade and draw once per frame
    spinner.rotation.z += dt * view.rate * Math.PI * 2
    renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h)
    renderer.render(fadeScene, fadeCam)
    renderer.clearDepth()
    drawView(mainCam(), 0, 0, w, h)
  } else if (trails) {
    // light painting: fade what is there, then draw the lanterns at SUB moments
    // through this frame, so a strobe or colour change lands where it happened
    renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h)
    renderer.render(fadeScene, fadeCam)
    const w0 = spinner.rotation.z, step = (dt * view.rate * Math.PI * 2) / SUB
    const hide = [frameMesh, ringMesh, ...(ringLeds() ? [] : [snapMesh]), pole, bed, weakGroup, bubbles.bubbleMesh, bubbles.dropMesh, bubbles.filmMesh, bubbles.growMesh]
    const was = hide.map((o) => o.visible)
    for (let s = 1; s <= SUB; s++) {
      spinner.rotation.z = w0 + step * s
      const lit = setLed(ledClock + (dt * s) / SUB)
      const final = s === SUB
      hide.forEach((o, i) => (o.visible = final ? was[i] : false))
      if (!lit && !final) continue
      renderer.clearDepth()
      drawView(mainCam(), 0, 0, w, h)
    }
    hide.forEach((o, i) => (o.visible = was[i]))
    ledClock += dt
  } else {
    if (view.spin) spinner.rotation.z += dt * view.rate * Math.PI * 2
    ledClock += dt
    setLed(ledClock)
    renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h); renderer.clear()
    drawView(mainCam(), 0, 0, w, h)
  }

  // picture-in-picture, no trails: a clean look at the other angle
  if (!$('pip').hidden) {
    const p = pipRect()
    const y = h - p.y - p.h // WebGL counts from the bottom
    renderer.setViewport(p.x, y, p.w, p.h)
    renderer.setScissor(p.x, y, p.w, p.h)
    renderer.clear()
    drawView(pipCam(), p.x, y, p.w, p.h)
  }
  renderer.setScissorTest(false)
})

// --------------------------------------------------------------- controls --
// sizes shown in mm, inches or bananas (one banana = 178 mm); everything inside stays in mm
const UNITS = { mm: 'mm', in: 'inches', banana: 'bananas' }
const showLen = (v) => {
  v = +v
  if (state.units === 'in') return `${+(v / 25.4).toFixed(v < 25.4 ? 3 : 2)}″`
  if (state.units === 'banana') { const b = v / 178; return `${+b.toPrecision(b < 1 ? 2 : 3)} 🍌` }
  return `${+v.toFixed(2)} mm`
}
function control(def, get, set) {
  const id = 'p_' + def.key
  const wrap = document.createElement('div')
  wrap.className = 'ctl'
  if (def.check) {
    wrap.innerHTML = `<label class="check" for="${id}"><input type="checkbox" id="${id}"${get() ? ' checked' : ''}> ${def.label}</label>`
    wrap.querySelector('input').onchange = (e) => set(e.target.checked)
  } else if (def.options) {
    wrap.innerHTML = `<label for="${id}">${def.label}</label><select id="${id}">${def.options.map((o) => `<option${o === get() ? ' selected' : ''}>${o}</option>`).join('')}</select>`
    wrap.querySelector('select').onchange = (e) => set(e.target.value)
  } else {
    const fmt = (v) => (def.unit === 'mm' ? showLen(v) : `${+(+v).toFixed(2)}${def.unit ? ' ' + def.unit : ''}`)
    wrap.innerHTML = `<label for="${id}">${def.label}</label><output>${fmt(get())}</output>
      <input type="range" id="${id}" min="${def.min}" max="${def.max}" step="${def.step}" value="${get()}">`
    const out = wrap.querySelector('output')
    const input = wrap.querySelector('input')
    input.oninput = (e) => { out.textContent = fmt(e.target.value); set(Number(e.target.value)) }
    if (def.presets) {
      const row = document.createElement('div')
      row.className = 'presets'
      for (const v of def.presets) {
        const b = document.createElement('button')
        b.className = 'chip'
        b.textContent = def.unit === 'mm' ? showLen(v) : def.unit ? `${v} ${def.unit}` : String(v)
        b.dataset.v = v
        b.setAttribute('aria-pressed', String(+get() === v))
        b.onclick = () => {
          input.value = v; out.textContent = fmt(v); set(v)
          for (const c of row.children) c.setAttribute('aria-pressed', String(c === b))
        }
        row.append(b)
      }
      input.addEventListener('input', () => { for (const c of row.children) c.setAttribute('aria-pressed', String(+c.dataset.v === +input.value)) })
      wrap.append(row)
    }
    if (def.seed) {
      const b = document.createElement('button')
      b.className = 'btn'
      b.style.gridColumn = '1 / -1'
      b.textContent = 'Reroll'
      b.onclick = () => {
        const v = 1 + Math.floor(Math.random() * 998)
        input.value = v; out.textContent = fmt(v); set(v)
      }
      wrap.append(b)
    }
  }
  if (def.hint) wrap.insertAdjacentHTML('beforeend', `<div class="hint">${def.hint}</div>`)
  return wrap
}

// CNC mode: cutting settings, fire or practice ends, then the size of the design
function renderCncParams(d, cp, set) {
  const c = cncp(), pk = procKey(c), ek = endsKey(c.ends)
  const setC = (key) => (v) => {
    c[key] = v
    if (key === 'material') { c.thick = matOf(c).def; if (matOf(c).kind !== 'metal' && ['tape', 'rope'].includes(endsKey(c.ends))) c.ends = ENDS.bumper }
    if (['material', 'process', 'ends', 'flangeN', 'ropePlace', 'mount'].includes(key)) renderParams()
    renderGuide()
    schedule()
  }
  const sec = (title, rows, open) => {
    const det = document.createElement('details')
    det.open = open
    det.innerHTML = `<summary>${title}</summary><div></div>`
    for (const [def, get, s] of rows) det.lastChild.append(control(def, get, s))
    cp.append(det)
  }
  const P = (keys) => keys.map((k) => COMMON_PARAMS.find((x) => x.key === k)).map((def) => [def, () => params()[def.key], set(def.key)])
  const C = (keys) => keys.map((k) => CNC_PARAMS.find((x) => x.key === k)).map((def) => {
    let dd = def.presetsFrom ? { ...def, presets: matOf(c).thick } : def
    if (def.key === 'ends' && matOf(c).kind !== 'metal') dd = { ...def, options: def.options.filter((o) => !o.startsWith('fire')) }
    return [dd, () => c[def.key], setC(def.key)]
  })
  if (d.cage) {
    const steelOnly = C(['material', 'process', 'thick'])
    steelOnly[0][0] = { ...steelOnly[0][0], options: steelOnly[0][0].options.filter((o) => /stainless|mild steel/i.test(o)) }
    if (!steelOnly[0][0].options.includes(c.material)) c.material = steelOnly[0][0].options[0]
    steelOnly[1][0] = { ...steelOnly[1][0], options: steelOnly[1][0].options.filter((o) => !/router/i.test(o)) }
    sec('Cut from steel sheet', steelOnly, true)
    return
  }
  if (d.dart) {
    sec('Material', C(['material']), true)
    return
  }
  if (d.paxe || d.cageBall) {
    const metal = C(['material', 'process', 'thick'])
    metal[0][0] = { ...metal[0][0], options: metal[0][0].options.filter((o) => matOf({ material: o }).kind === 'metal') }
    if (!metal[0][0].options.includes(c.material)) c.material = metal[0][0].options[0]
    sec(d.cageBall ? 'Bands cut from metal sheet' : 'Head cut from metal plate', metal, true)
    return
  }
  if (d.acroMetal || d.dowel || d.tsword || d.taxe || d.hilt) {
    const metal = C(['material'])
    metal[0][0] = { ...metal[0][0], options: metal[0][0].options.filter((o) => matOf({ material: o }).kind === 'metal') }
    if (!metal[0][0].options.includes(c.material)) c.material = metal[0][0].options[0]
    sec(d.tsword || d.taxe || d.hilt ? 'Connector machined from' : 'Turned from metal bar', metal, true)
    return
  }
  if (d.sword) {
    const metal = C(['material', 'process', 'thick'])
    metal[0][0] = { ...metal[0][0], options: metal[0][0].options.filter((o) => matOf({ material: o }).kind === 'metal') }
    if (!metal[0][0].options.includes(c.material)) c.material = metal[0][0].options[0]
    sec('Cut from metal sheet', metal, true)
    return
  }
  if (d.spokeHub) {
    sec('Material', C(['material']), true)
    sec('Pole size', P(['poleOD']), true)
    return
  }
  sec('Cut', C(['material', 'process', 'thick', ...(pk === 'router' ? ['tool'] : []), 'mount', 'clear', 'flangeN', ...(c.flangeN > 0 ? ['flangePCD', 'flangeHole'] : []), 'engrave']), true)
  const endKeys = ek === 'tape' ? ['tabs', 'tabAngle', 'tabW', 'neck', 'wickW', 'tapeLen', 'tapeT', 'tabBolt']
    : ek === 'bumper' ? ['tabs', 'tabAngle', 'tabW', 'neck', 'wickW', 'tabBolt']
    : ek === 'rope' ? ['ropeD', 'ropePlace', 'laceStep'] : []
  sec('Ends: fire or practice', C(['ends', ...endKeys]), true)
  sec('Size and shape', P(['diameter', 'rimW', 'rotate', 'strutW', 'fillet']), false)
  sec('Pole size', P(['poleOD']), false)
}

function renderParams() {
  const d = design()
  const dp = $('designParams')
  dp.innerHTML = '<h2>Design</h2>'
  const set = (key) => (v) => { params()[key] = v; schedule() }
  // fire wicks only ever on fire-safe material: a printed or plastic spoke hub only offers practice ends
  const fireSafe = isCnc() && matOf(cncp()).kind === 'metal'
  for (const def0 of d.params) {
    let def = def0
    if (def0.showIf && !def0.showIf(params())) continue
    if (d.spokeHub && def.key === 'ends' && !fireSafe) {
      def = { ...def0, options: def0.options.filter((o) => !o.startsWith('fire')) }
      if (!def.options.includes(params().ends)) params().ends = SPOKE_ENDS.tpu
    }
    dp.append(control(def, () => params()[def.key], def.applies ? (v) => { Object.assign(params(), def.applies[v] || {}, { [def.key]: v }); schedule(); renderParams() } : def.rerender ? (v) => { set(def.key)(v); renderParams() } : set(def.key)))
  }
  const bal = d.params.find((x) => x.balance)
  if (bal) {
    const b = document.createElement('button')
    b.className = 'btn'
    b.textContent = 'Auto-balance on the staff'
    b.onclick = async () => {
      b.textContent = 'Balancing…'
      Object.assign(params(), await work('balance', { design: d.id, params: params(), key: bal.key, material: state.material }))
      renderParams()
      schedule(0)
    }
    dp.append(b)
  }
  const cp = $('commonParams')
  cp.innerHTML = ''
  $('matSection').hidden = isCnc() && !printOnly(d)
  if (isCnc() && !printOnly(d)) renderCncParams(d, cp, set)
  const groups = d.adaptor || (isCnc() && !printOnly(d)) ? [] : d.sleeve || d.practiceSpoke || d.dart || d.cage || d.grip || d.mould || d.hoop || d.bubblePoi || d.acro || d.fist || d.hilt ? [] : d.spokeHub || d.ballEnd || d.novelty || d.bubbleHub ? ['Fit'] : [...new Set(COMMON_PARAMS.map((p) => p.group))].filter((g) => g !== 'Glow' || d.pods)
  const label = { Lock: 'Lock onto a metal dowel (optional)', Fit: 'Pole size and fit', Glow: 'Lanterns and capsules', 'Weight ring': 'Bubble weight ring', 'Snap weight': 'Snap-on weight ring' }
  for (const g of groups) {
    const det = document.createElement('details')
    if (g === 'Levels' || g === 'Fit' || (g === 'Lock' && params().lockOn)) det.open = true
    det.innerHTML = `<summary>${label[g] || g}</summary><div></div>`
    for (const def of COMMON_PARAMS.filter((p) => p.group === g)) {
      if (def.showIf && !def.showIf(params())) continue
      det.lastChild.append(control(def, () => params()[def.key], def.rerender ? (v) => { set(def.key)(v); renderParams() } : set(def.key)))
    }
    cp.append(det)
  }
  if (!d.custom) cp.append(finishPanel(d))
  if (!d.custom && !d.cncOnly && !(isCnc() && !printOnly(d))) cp.append(infillPanel(d))
  if ((lightsOK(d) || capsuleOK(d)) && !(isCnc() && !printOnly(d))) cp.append(lightsPanel(d))
  else placing = false
  if (!d.custom) cp.append(community.panel(d, () => ({ design: d.id, params: { ...params() }, material: state.material, infill: state.infill[d.id] || null, lights: state.lights[d.id] || null })))
  const reset = document.createElement('button')
  reset.className = 'btn'
  reset.textContent = `Reset ${d.name} to defaults`
  reset.onclick = () => { state.params[d.id] = defaults(d); if (isCnc()) state.cncp[d.id] = cncDefaults(d); renderParams(); schedule() }
  cp.append(reset)
  $('dName').textContent = d.name
  $('dBlurb').textContent = d.blurb
  $('vStrobe').hidden = !d.strobe
  if (!d.strobe && view.strobe) $('vStrobe').click()
  $('glowRow').hidden = !hasLeds()
  $('ledRow').hidden = !hasLeds()
  renderExports()
}

// ---------------------------------------------------------------- finish --
// Your own logo, text or picture on any design: traced to outlines here, put on the part in the worker.
const FONTS = { 'bold sans': '900 220px system-ui, sans-serif', serif: '700 220px Georgia, serif', rounded: '800 220px "Arial Rounded MT Bold", system-ui, sans-serif', script: 'italic 700 220px "Brush Script MT", cursive', mono: '700 200px ui-monospace, monospace' }
let finishImg = null
function squareOf(src, w, h) {
  // letterbox into a square so the trace keeps its shape
  const n = Math.max(w, h), cv = document.createElement('canvas')
  cv.width = cv.height = n
  const ctx = cv.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, n, n)
  ctx.drawImage(src, (n - w) / 2, (n - h) / 2, w, h)
  return cv
}
function traceFinish(f) {
  try {
    let sq = null
    if (f.kind === 'text' && f.text.trim()) {
      const cv = document.createElement('canvas'), ctx = cv.getContext('2d')
      ctx.font = FONTS[f.font] || FONTS['bold sans']
      const w = Math.ceil(ctx.measureText(f.text).width) + 40
      cv.width = w; cv.height = 300
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, 300)
      ctx.font = FONTS[f.font] || FONTS['bold sans']; ctx.fillStyle = '#000'; ctx.textBaseline = 'middle'
      ctx.fillText(f.text, 20, 160)
      sq = squareOf(cv, w, 300)
    } else if (f.kind === 'picture' && finishImg) sq = squareOf(finishImg, finishImg.naturalWidth || finishImg.width, finishImg.naturalHeight || finishImg.height)
    if (!sq) { f.loops = null; f.sig = ''; return }
    const { loops } = traceCanvas(sq, { threshold: f.threshold, invert: f.invert, soft: 1, res: 260 })
    f.loops = loops
    f.sig = `${f.kind}:${f.text}:${f.font}:${f.threshold}:${f.invert}:${loops.length}:${loops.reduce((a, l) => a + l.length, 0)}`
  } catch (e) { f.loops = null; status('Could not trace that: ' + e.message) }
}
function finishPanel(d) {
  const f = finOf(d.id)
  const det = document.createElement('details')
  det.className = 'finishPanel'
  if (f.kind !== 'none') det.open = true
  det.innerHTML = '<summary>✨ Finish: your logo, text or picture</summary><div></div>'
  const box = det.lastChild
  const changed = (retrace) => { if (retrace) traceFinish(f); persist(); schedule(150) }
  const add = (def, get, set) => box.append(control(def, get, set))
  add({ key: 'finKind', label: 'Put on it', options: ['none', 'text', 'picture'] }, () => f.kind, (v) => { f.kind = v; changed(true); renderParams() })
  if (f.kind === 'text') {
    const wrap = document.createElement('div'); wrap.className = 'ctl'
    wrap.innerHTML = '<label for="finText">Text</label><input id="finText" type="text" maxlength="40" style="grid-column:1/-1">'
    const inp = wrap.querySelector('input'); inp.value = f.text
    let tm = null
    inp.oninput = () => { f.text = inp.value; clearTimeout(tm); tm = setTimeout(() => changed(true), 400) }
    box.append(wrap)
    add({ key: 'finFont', label: 'Lettering', options: Object.keys(FONTS) }, () => f.font, (v) => { f.font = v; changed(true) })
  }
  if (f.kind === 'picture') {
    const wrap = document.createElement('div'); wrap.className = 'ctl'
    wrap.innerHTML = '<label for="finFile">Picture or logo (PNG, JPG, SVG)</label><input id="finFile" type="file" accept="image/*" style="grid-column:1/-1"><div class="hint">Dark parts become the logo. A clean black-on-white logo works best.</div>'
    wrap.querySelector('input').onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return
      const img = new Image()
      img.onload = () => { finishImg = img; changed(true) }
      img.src = URL.createObjectURL(file)
    }
    box.append(wrap)
    add({ key: 'finTh', label: 'Darkness cut-off', unit: '', min: 20, max: 235, step: 1 }, () => f.threshold, (v) => { f.threshold = v; clearTimeout(f._t); f._t = setTimeout(() => changed(true), 300) })
    add({ key: 'finInv', label: 'Swap light and dark', check: true }, () => f.invert, (v) => { f.invert = v; changed(true) })
  }
  if (f.kind !== 'none') {
    add({ key: 'finStyle', label: 'Style', options: ['raised', 'engraved'], hint: 'Raised stands proud of the surface; engraved is cut in. On metal plates it goes on the engrave layer.' }, () => f.style, (v) => { f.style = v; changed() })
    add({ key: 'finDepth', label: 'Depth', unit: 'mm', min: 0.3, max: 4, step: 0.1 }, () => f.depth, (v) => { f.depth = v; changed() })
    add({ key: 'finSize', label: 'Size', unit: 'mm', min: 8, max: 300, step: 1, hint: 'The width (or height) of the logo.' }, () => f.size, (v) => { f.size = v; changed() })
    add({ key: 'finWhere', label: 'Where', options: ['top', 'bottom', 'front', 'back', 'left', 'right', 'round the side'], rerender: true }, () => f.where, (v) => { f.where = v; changed(); renderParams() })
    if (f.where === 'round the side') add({ key: 'finCopies', label: 'Copies round', unit: '', min: 1, max: 12, step: 1 }, () => f.copies, (v) => { f.copies = v; changed() })
    add({ key: 'finAcross', label: 'Move across', unit: '%', min: -50, max: 50, step: 1 }, () => f.across, (v) => { f.across = v; changed() })
    add({ key: 'finUp', label: 'Move up', unit: '%', min: -50, max: 50, step: 1 }, () => f.up, (v) => { f.up = v; changed() })
    add({ key: 'finTurn', label: 'Turn', unit: '°', min: -180, max: 180, step: 1 }, () => f.turn, (v) => { f.turn = v; changed() })
    if (f.kind === 'picture' && !f.loops?.length) box.insertAdjacentHTML('beforeend', '<div class="hint">Pick a picture above.</div>')
    if (f.kind === 'text' && !f.loops?.length) traceFinish(f)
  }
  return det
}

// --------------------------------------------------------------- community --
// reviews, shared versions, download tally and the visit map (dream.sc copy); private notes everywhere
const community = createCommunity({
  db: window.dreamDB && window.dreamDB.available ? window.dreamDB : null,
  status: (m) => status(m),
  onOpenVersion: (d, v) => {
    state.design = d.id
    state.params[d.id] = { ...defaults(d), ...(v.params || {}) }
    if (v.infill) state.infill[d.id] = v.infill
    if (v.lights) state.lights[d.id] = v.lights
    if (v.material && MATERIALS[v.material]) state.material = v.material
    persist(); renderGallery(); renderParams(); applyLook(); schedule(0)
    status(`Opened "${v.name || 'a shared version'}": change anything, then save or share your own.`)
  },
})
// units: a small switch in the header
{
  const sel = document.createElement('select')
  sel.id = 'unitSel'; sel.title = 'Show sizes in'; sel.setAttribute('aria-label', 'Show sizes in')
  sel.innerHTML = Object.entries(UNITS).map(([k2, v]) => `<option value="${k2}"${state.units === k2 ? ' selected' : ''}>${v}</option>`).join('')
  sel.onchange = () => { state.units = sel.value; persist(); renderParams(); if (sel.value === 'banana') status('Sizes in bananas: one banana is 178 mm (7 inches). The drawings and files stay in mm.') }
  $('knotsBtn').after(sel)
}
if (community.on) {
  const btn = document.createElement('button')
  btn.className = 'btn'; btn.id = 'mapBtn'; btn.textContent = '🌍 Map'; btn.title = 'Where people use the forge from (signed-in members)'
  $('knotsBtn').after(btn)
  const dlg = document.createElement('dialog')
  dlg.className = 'mapdlg'
  dlg.innerHTML = '<form method="dialog" class="mapclose"><button class="btn">Close</button></form><h2>Where the forge is used</h2><div class="mapbox"></div>'
  document.body.append(dlg)
  btn.onclick = () => { dlg.showModal(); community.showMap(dlg) }
}

// ---------------------------------------------------------- gloving lights --
// Pockets for gloving lights, placed by clicking on the design; a green or red marker shows if one fits.
const lightsOK = (d) => !(d.mould || d.bubblePoi || d.hoop || d.joint || d.fist || d.grip || d.practiceSpoke || d.acroMetal || d.dowel || d.cncOnly || d.sword || d.tsword || d.taxe || d.cage || d.cageBall) // everything printed with room for a light
let placing = false, downXY = null
const ray = new THREE.Raycaster()
const markMat = new THREE.MeshBasicMaterial({ color: 0x6cd39a, transparent: true, opacity: 0.55, depthTest: false })
const hoverMark = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32), markMat)
hoverMark.visible = false
hoverMark.renderOrder = 10
frameMesh.add(hoverMark)
function pickSurface(ev) {
  const r = canvas.getBoundingClientRect()
  ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), mainCam())
  const hit = ray.intersectObject(frameMesh, false)[0]
  if (!hit?.face) return null
  return { p: frameMesh.worldToLocal(hit.point.clone()), n: hit.face.normal.clone().normalize() }
}
function lightFits(p, n) {
  const { d, len } = lightDims(litOf(design().id)), r = (d + 0.4) / 2, depth = len + CAP_H
  const side0 = frameMesh.material.side
  frameMesh.material.side = THREE.DoubleSide
  const cast = (o, dir) => {
    const oW = frameMesh.localToWorld(o.clone()), dW = frameMesh.localToWorld(o.clone().add(dir)).sub(oW).normalize()
    ray.set(oW, dW); ray.far = 1e4
    const h = ray.intersectObject(frameMesh, false)
    return h.length ? h[0].distance : 0
  }
  const inw = n.clone().negate()
  let ok = cast(p.clone().addScaledVector(inw, 0.3), inw) >= depth + WALL - 0.3
  if (ok) {
    const q = p.clone().addScaledVector(inw, depth * 0.5)
    const u = new THREE.Vector3().crossVectors(inw, Math.abs(inw.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)).normalize()
    const v = new THREE.Vector3().crossVectors(inw, u)
    for (const dir of [u, u.clone().negate(), v, v.clone().negate()]) if (cast(q, dir) < r + WALL) { ok = false; break }
  }
  frameMesh.material.side = side0
  return { ok, r, depth }
}
function showMark(s) {
  if (!s) { hoverMark.visible = false; return }
  const { ok, r, depth } = lightFits(s.p, s.n)
  const inw = s.n.clone().negate()
  hoverMark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), inw)
  hoverMark.position.copy(s.p).addScaledVector(inw, depth / 2)
  hoverMark.scale.set(r, depth, r)
  markMat.color.set(ok ? 0x6cd39a : 0xff6070)
  hoverMark.visible = true
  return ok
}
canvas.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY] })
canvas.addEventListener('pointermove', (e) => { if (placing && !e.buttons) showMark(pickSurface(e)) })
canvas.addEventListener('pointerup', (e) => {
  if (!placing || !downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 5) return
  const s = pickSurface(e)
  if (!s) return
  const ok = showMark(s), L = litOf(design().id)
  L.spots = [...L.spots, [[s.p.x, s.p.y, s.p.z].map((v) => +v.toFixed(2)), [s.n.x, s.n.y, s.n.z].map((v) => +v.toFixed(4))]]
  if (!ok) status('That light is too close to an edge or a hollow: it will break through. Undo it and try somewhere thicker.')
  persist(); schedule(100); renderParams()
})
// LED capsules: one tap sets the pocket to a capsule that fits, with where to buy it
const capsuleOK = (d) => !!(d.pods || d.dart)
const capsuleOn = (d) => !!(d.pods || d.style === 'glow' || (d.dart && (params().capsule || '').startsWith('yes')))
function capsuleBody(d, box) {
  const p = params()
  const row = document.createElement('div'); row.className = 'btns'
  for (const c of CAPSULES) {
    const b = document.createElement('button')
    const on = Math.abs(p.capD - c.d) < 0.05 && Math.abs(p.capL - c.len) < 0.6
    b.className = 'btn' + (on ? ' primary' : ''); b.textContent = `${on ? '✓ ' : ''}${c.name.replace('Flowtoys ', '')}`
    b.onclick = () => { p.capD = c.d; p.capL = c.len; persist(); schedule(); renderParams() }
    row.append(b)
  }
  box.append(row)
  if (!d.pods) { // the darts and poi have no capsule sliders of their own
    box.append(control({ key: 'capD', label: 'Capsule diameter', unit: 'mm', min: 10, max: 30, step: 0.1 }, () => p.capD, (v) => { p.capD = v; schedule() }))
    box.append(control({ key: 'capL', label: 'Capsule length', unit: 'mm', min: 40, max: 120, step: 0.5 }, () => p.capL, (v) => { p.capL = v; schedule() }))
  }
  box.insertAdjacentHTML('beforeend', `<ul class="fitlist">${CAPSULES.map((c) => `<li><a href="${c.url}" target="_blank" rel="noopener">${c.name}</a> <small>(${c.note})</small></li>`).join('')}</ul>
    <div class="hint">Any LED capsule works if you measure it and set the size. Vision props have their lights built in, so there is no loose capsule to fit. Not affiliated with any maker: sizes are from their own listings; check yours before printing (the capsule test cup is quick).</div>`)
}
function lightsPanel(d) {
  const L = litOf(d.id)
  const det = document.createElement('details')
  det.className = 'finishPanel'
  if (L.on) det.open = true
  det.innerHTML = '<summary>💡 Lights</summary><div></div>'
  const box = det.lastChild
  const changed = (re) => { persist(); schedule(150); if (re) renderParams() }
  // which light: none, gloving LEDs placed by clicking, or an LED capsule (only what this design can take)
  const CH = { none: 'none', glove: 'gloving LEDs (click to place them)', capsule: d.pods ? 'LED capsules (in the lanterns)' : 'an LED capsule inside' }
  const can = ['none', ...(lightsOK(d) ? ['glove'] : []), ...(capsuleOK(d) ? ['capsule'] : [])].filter((k2) => !(d.pods && k2 === 'none'))
  const now = L.on ? 'glove' : capsuleOn(d) ? 'capsule' : 'none'
  if (now !== 'none') det.open = true
  box.append(control({ key: 'litKind', label: 'Light', options: can.map((k2) => CH[k2]), hint: 'Gloving LEDs: small fingertip lights set in pockets wherever you click. LED capsule: a flow-prop capsule inside, glowing through clear TPU.' }, () => CH[now], (v) => {
    const k2 = Object.keys(CH).find((x) => CH[x] === v)
    L.on = k2 === 'glove'
    if (!L.on) placing = false
    if (d.dart && d.style !== 'glow') params().capsule = k2 === 'capsule' ? 'yes: a capsule slides in from the tip' : 'none'
    changed(true)
  }))
  if (now === 'capsule') capsuleBody(d, box)
  if (L.on) {
    box.append(control({ key: 'litSize', label: 'Light size', options: Object.values(LIGHT_SIZES).map((s) => s.label), hint: 'Measure your light across its widest part with calipers: the size class is set by its batteries.' }, () => LIGHT_SIZES[L.size].label, (v) => { L.size = Object.keys(LIGHT_SIZES).find((k2) => LIGHT_SIZES[k2].label === v) || 'nano'; changed(true) }))
    if (L.size === 'custom') {
      box.append(control({ key: 'litD', label: 'Light width', unit: 'mm', min: 8, max: 22, step: 0.1, hint: 'Across the widest part.' }, () => L.d, (v) => { L.d = v; changed() }))
      box.append(control({ key: 'litLen', label: 'Light length', unit: 'mm', min: 12, max: 45, step: 0.5, hint: 'Base to the top of the LED.' }, () => L.len, (v) => { L.len = v; changed() }))
    }
    const row = document.createElement('div'); row.className = 'btns'
    row.innerHTML = `<button class="btn ${placing ? 'primary' : ''}" id="litPlace">${placing ? '✓ Placing: click the design' : '📍 Place lights'}</button><button class="btn" id="litUndo" ${L.spots.length ? '' : 'disabled'}>Undo last</button>`
    box.append(row)
    row.querySelector('#litPlace').onclick = () => { placing = !placing; if (!placing) hoverMark.visible = false; renderParams() }
    row.querySelector('#litUndo').onclick = () => { L.spots = L.spots.slice(0, -1); changed(true) }
    const lit = current?.design === d ? current.hub.lights : null
    box.insertAdjacentHTML('beforeend', `<div class="hint">${placing ? 'Move over the design: the marker is <b style="color:var(--good)">green</b> where a light fits and <b style="color:var(--bad)">red</b> where it would break through. Click to place. Turn the view to reach other sides.' : `${L.spots.length} light${L.spots.length === 1 ? '' : 's'} placed.`}${lit ? ` Pockets Ø${(lit.d + 0.4).toFixed(1)} × ${lit.depth.toFixed(0)} mm deep, with a seat for a clear TPU diffuser cap and a notch to lift the light out.` : ''}</div>`)
    if (L.spots.length) { const c = document.createElement('button'); c.className = 'btn'; c.textContent = 'Clear all lights'; c.onclick = () => { L.spots = []; changed(true) }; box.append(c) }
    const fit = LIGHTS_THAT_FIT.filter((x) => L.size === 'custom' || x.size === L.size)
    box.insertAdjacentHTML('beforeend', `<details class="fitlist"><summary>Lights that fit</summary><ul>${fit.map((x) => `<li><a href="${x.url}" target="_blank" rel="noopener">${x.name}</a>${x.note ? ` <small>(${x.note})</small>` : ''}</li>`).join('') || '<li>Measure your light and use Custom.</li>'}</ul><div class="hint">Not affiliated with any of these makers: sizes are from their own listings. Check your light with calipers before you print. Buying through them supports the people who make the lights.</div></details>`)
  }
  return det
}
function lightsExports(d) {
  const lit = current?.design === d ? current.hub.lights : null
  if (!lit) return
  const b = document.createElement('button'); b.className = 'btn'
  b.textContent = `Diffuser caps STL (${lit.n}, clear TPU)`
  b.onclick = () => download(toSTL(current.hub.meshes.lightCaps, d.name + ' light caps'), `${d.id}-light-caps-${lit.d}mm.stl`)
  $('exports').append(b)
  $('exportNote').insertAdjacentHTML('beforeend', `<div class="hint" style="margin-top:8px"><b>Gloving lights:</b> ${lit.n} pocket${lit.n === 1 ? '' : 's'} for ${lit.d} mm lights. Print the caps in clear or natural TPU. Push a light in LED up, press the cap into the seat over it; lift the light out by the notch to change its mode. Check the fit with one light before you print the whole design.</div>`)
}

// ---------------------------------------------------------------- infill --
// How solid the print is, and where the solid goes: the weight follows, and the 3MF carries it to the slicer.
const fillWords = (hub) => (hub?.infill ? `at ${hub.infill.fill}% infill, ${hub.infill.place === 'even' ? 'even' : hub.infill.place === 'outside' ? 'solid outside' : 'solid inside'}` : 'at 100% infill')
const loadBearing = (d) => !!(d.grip || d.sleeve || d.practiceSpoke || d.hilt || d.adaptor || d.joint || d.spokeHub || d.dowel || (d.hoop && !d.hoopDance))
function infillPanel(d) {
  const f = infOf(d.id)
  const det = document.createElement('details')
  det.className = 'finishPanel'
  if (f.fill < 100) det.open = true
  det.innerHTML = '<summary>🧱 Infill: how solid, and where</summary><div></div>'
  const box = det.lastChild
  const changed = (re) => { persist(); schedule(150); if (re) renderParams() }
  box.append(control({ key: 'infFill', label: 'Infill', unit: '%', min: 0, max: 100, step: 5, hint: '100% is solid. Lower is lighter, faster and uses less filament, but softer and weaker. 0% is walls only.' }, () => f.fill, (v) => { const was = f.fill < 100; f.fill = v; changed(was !== (v < 100)) }))
  if (f.fill < 100) {
    box.append(control({ key: 'infPlace', label: 'Where the solid goes', options: Object.values(PLACES), hint: 'Even: the slicer\'s usual walls with the same infill all through. Solid outer edges: a thick solid skin (the band) round a lighter inside: tough to knock, the most common choice. Solid inner edges: solid round the pole hole or the core, lighter towards the outside: the grip and the weight stay in the middle, and a softer outside is kinder to the body.' }, () => PLACES[f.place], (v) => { f.place = Object.keys(PLACES).find((k2) => PLACES[k2] === v) || 'even'; changed(true) }))
    if (f.place !== 'even') box.append(control({ key: 'infBand', label: f.place === 'outside' ? 'Solid skin' : 'Solid round the middle', unit: 'mm', min: 1, max: 20, step: 0.5, hint: f.place === 'outside' ? 'How thick the solid outside is: walls and top and bottom layers.' : 'How far out from the pole hole (or the core) it stays solid.' }, () => f.band, (v) => { f.band = v; changed() }))
  }
  if (loadBearing(d) && f.fill < 100) box.insertAdjacentHTML('beforeend', '<div class="warnline">This part carries load: print it solid (100%).</div>')
  box.insertAdjacentHTML('beforeend', '<div class="hint" id="infillOut"></div>')
  return det
}
function infillReadout() {
  const el = $('infillOut')
  if (!el || !current) return
  const d = current.design, f = infOf(d.id), s = slicerSettings(f), inf = current.hub.infill
  el.innerHTML = f.fill >= 100
    ? 'Solid: 100% infill. Set it lower to see the weight drop.'
    : `<b>Slicer:</b> ${s.text}.${inf ? ` <b>Weight:</b> ${inf.g.toFixed(0)} g instead of ${inf.gSolid.toFixed(0)} g solid (${Math.round(inf.ratio * 100)}%).` : ''}${s.zone && inf && !inf.zone ? ' (No solid zone could be found for this shape: it prints even.)' : ''}`
}
const infill3MF = (d) => !d.bubbleHub && !!(d.dart || d.acro || d.novelty || d.sleeve || d.adaptor || !(d.mould || d.ballEnd || d.bubblePoi || d.hoop || d.joint || d.fist || d.hilt || d.grip || d.practiceSpoke || d.spokeHub || d.acroMetal || d.dowel || d.cncOnly))
function infillExports(d) {
  const inf = current?.design === d ? current.hub.infill : null
  if (!inf) return
  const box = $('exports'), m = current.hub.meshes, base = `${d.id}-${inf.fill}pc-infill`
  const btn = (label, fn) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.onclick = fn; box.append(b) }
  if (infill3MF(d)) btn('3MF with these print settings', () => download(to3MFPrint(zipStore, m[inf.bodyKey], inf.zone ? m.solidZone : null, inf.settings, d.name), base + '.3mf', 'model/3mf'))
  if (inf.zone) btn('Solid zone STL (slicer modifier)', () => download(toSTL(m.solidZone, d.name + ' solid zone'), base + '-solid-zone.stl'))
  $('exportNote').insertAdjacentHTML('beforeend', `<div class="warnline" style="margin-top:8px"><b>Your infill:</b> ${inf.settings.text}. ${infill3MF(d) ? 'The 3MF carries these settings into PrusaSlicer (and slicers that read its files)' : 'Set these in your slicer'}${inf.zone ? '; in any other slicer, load the solid zone STL as a modifier (right-click the part, add modifier, load) and set it to 100% infill' : ''}. This replaces any infill the steps above mention.</div>`)
}

function drawThumb(cv, polys, R, glow = '#ffae2a') {
  const ctx = cv.getContext('2d')
  const s = cv.width / (2 * R + 4)
  ctx.clearRect(0, 0, cv.width, cv.height)
  const fill = (list, color) => {
    if (!list.length) return
    ctx.save()
    ctx.translate(cv.width / 2, cv.height / 2)
    ctx.scale(s, -s)
    ctx.beginPath()
    for (const poly of list) { poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath() }
    ctx.fillStyle = color
    ctx.fill('evenodd')
    ctx.restore()
  }
  fill(polys.base, '#8a8499')
  fill(polys.relief, '#f2eef8')
  fill(polys.pods, glow === 'rainbow' ? '#ff3d7f' : glow)
}

// ---------------------------------------------------------------- gallery --
// One list for everything: built-in designs, your creations and saved designs.
// Search, a few filter chips, a sort, collapsible groups (remembered) and a
// heart on every card. Entries are { key: 'd:id' | 'i:id', design?, idea? }.
const LIST_KEY = 'dragonhub-list'
const listUI = (() => { try { return { filter: 'all', sort: 'groups', q: '', collapsed: [], ...JSON.parse(localStorage.getItem(LIST_KEY) || '{}') } } catch { return { filter: 'all', sort: 'groups', q: '', collapsed: [] } } })()
const keepList = () => { try { localStorage.setItem(LIST_KEY, JSON.stringify(listUI)) } catch {} }
const FILTERS = [['all', 'All'], ['liked', '♥ Mine'], ['top', 'Most liked'], ['creations', 'Creations'], ['saved', 'Saved'], ['new', 'New']]
let ideaList = [], ideaSig = ''
const NEW_DAYS = 30
const isNew = (e) => {
  const t = e.design ? e.design.added : e.idea.time
  return !!t && Date.now() - new Date(t).getTime() < NEW_DAYS * 864e5
}
const when = (e) => (e.design ? e.design.added || '' : e.idea.time || '')
const titleOf = (e) => (e.design ? e.design.name : e.idea.name || 'Untitled')
const likeCount = (e) => likes.count(e.key) + (e.idea?.votes || 0) // older anonymous +1s still count

function galleryTools() {
  const g = $('gallery')
  if ($('listTools')) return
  g.querySelector('h2').insertAdjacentHTML('afterend', `<div class="listtools" id="listTools">
    <div class="searchrow"><input type="search" id="listQ" placeholder="Search all designs" aria-label="Search designs" autocomplete="off"><button class="chip" id="filtBtn" aria-expanded="false">Filters</button></div>
    <div class="filtbox" id="filtBox" hidden>
    <div class="chips" id="listChips" role="group" aria-label="Show"></div>
    <label class="sortby">Made from <select id="listMade"><option value="all">anything</option><option value="print">3D print</option><option value="metal">metal (CNC, machined)</option><option value="rubber">rubber (moulds)</option><option value="fire">fire (Kevlar)</option></select></label>
    <label class="sortby">Sort <select id="listSort"><option value="groups">by group</option><option value="liked">most liked</option><option value="new">newest</option><option value="az">A to Z</option></select></label>
    </div>
    <div class="who" id="whoBox" hidden><span>Your name, so hearts are yours:</span><input id="whoName" maxlength="40" placeholder="Name"><button class="btn primary" id="whoOk">OK</button></div>
  </div>`)
  $('filtBtn').onclick = () => { listUI.filters = !listUI.filters; keepList(); renderGallery() }
  $('listQ').value = listUI.q
  $('listQ').oninput = (e) => { listUI.q = e.target.value; keepList(); renderGallery() }
  $('listSort').value = listUI.sort
  $('listMade').value = listUI.made || 'all'
  $('listMade').onchange = (e) => { listUI.made = e.target.value; keepList(); renderGallery() }
  $('listSort').onchange = (e) => { listUI.sort = e.target.value; keepList(); renderGallery() }
  for (const [v, label] of FILTERS) {
    const b = document.createElement('button')
    b.className = 'chip'
    b.textContent = label
    b.dataset.f = v
    b.onclick = () => { listUI.filter = v; keepList(); renderGallery() }
    $('listChips').append(b)
  }
  $('whoOk').onclick = () => {
    if (!likes.setName($('whoName').value)) return $('whoName').focus()
    $('whoBox').hidden = true
    if (pendingLike) { const t = pendingLike; pendingLike = null; likes.toggle(t) }
  }
  $('whoName').onkeydown = (e) => e.key === 'Enter' && $('whoOk').click()
}

let pendingLike = null
async function tapHeart(key) {
  await likes.ready
  if (!likes.me()) {
    pendingLike = key
    $('whoBox').hidden = false
    $('whoName').focus()
    return
  }
  likes.toggle(key)
}

function heartHTML(e) {
  const n = likeCount(e), on = likes.likedByMe(e.key)
  const who = likes.names(e.key)
  const tip = who.length ? `Liked by ${who.join(', ')}` + (e.idea?.votes ? ` and ${e.idea.votes} earlier` : '') : 'Like it'
  return `<span class="heart" role="button" tabindex="0" aria-pressed="${on}" title="${tip.replace(/"/g, '&quot;')}" aria-label="${tip.replace(/"/g, '&quot;')}">${on ? '♥' : '♡'}${n ? ' ' + n : ''}</span>`
}

function entries() {
  const designs = DESIGNS.map((d) => ({ key: 'd:' + d.id, design: d, group: d.group }))
  const ideas = ideaList.map((i) => ({ key: 'i:' + i.id, idea: i, group: i.design === 'custom' ? 'Creations' : 'Saved' }))
  const q = listUI.q.trim().toLowerCase()
  const match = (e) => !q || [titleOf(e), e.design?.blurb, e.idea?.note, GROUPS[e.group] || e.group, e.idea && (DESIGNS.find((d) => d.id === e.idea.design)?.name)].join(' ').toLowerCase().includes(q)
  const mine = likes.myLikes()
  let list
  switch (listUI.filter) {
    case 'liked': list = [...designs, ...ideas].filter((e) => mine.has(e.key)); break
    case 'top': list = [...designs, ...ideas].filter((e) => likeCount(e) > 0); break
    case 'creations': list = [...designs.filter((e) => e.design.custom), ...ideas.filter((e) => e.group === 'Creations')]; break
    case 'saved': list = ideas; break
    case 'new': list = [...designs, ...ideas].filter(isNew); break
    default: list = [...designs, ...ideas.filter((e) => e.group === 'Creations')] // saved designs have their own filter
  }
  if (q) list = [...designs, ...ideas].filter(match) // search looks everywhere
  const sort = listUI.filter === 'top' && listUI.sort === 'groups' ? 'liked' : listUI.filter === 'new' && listUI.sort === 'groups' ? 'new' : listUI.sort
  if (sort === 'liked') list.sort((a, b) => likeCount(b) - likeCount(a) || titleOf(a).localeCompare(titleOf(b)))
  else if (sort === 'new') list.sort((a, b) => String(when(b)).localeCompare(String(when(a))))
  else if (sort === 'az') list.sort((a, b) => titleOf(a).localeCompare(titleOf(b)))
  return { list, all: [...designs, ...ideas], grouped: sort === 'groups' && !q, mine }
}

// the big folders in the design list, and which groups live in each
const SECTIONS = { hubs: 'Dragon staff hubs', fire: 'Fire and metal (CNC)', sparks: 'Spark cages (charcoal, CNC only)', rope: 'Rope dart heads', poi: 'Poi', contact: 'Contact staff ends', acro: 'Acro staff ends', moulds: 'Silicone and rubber moulds', hoops: 'Hoops', collapse: 'Collapsible hoops', fittings: 'Pole fittings' }
const SECTION_OF = {
  Fire: 'fire', CageStaff: 'fire', Swords: 'fire', TubeSwords: 'fire', TubeAxes: 'fire', SpokeHubs: 'fire', PracticeSpokes: 'fire',
  Contact: 'contact', Axes: 'contact', Acro: 'acro', AcroMetal: 'acro', FistContact: 'contact', Eyes: 'contact', MeteorCages: 'rope', CagePoi: 'poi', FistRope: 'rope', FistPoi: 'poi', PineContact: 'contact', DartPine: 'rope', MouldAcro: 'moulds',
  DartClassic: 'rope', DartModern: 'rope', DartRound: 'rope', DartPattern: 'rope', DartNature: 'rope',
  Poi: 'poi', BubblePoi: 'poi', Hoops: 'hoops', HoopJoints: 'collapse', MouldContact: 'moulds', MouldDart: 'moulds', MouldPoi: 'moulds',
  SparkDragon: 'sparks', SparkRope: 'sparks', SparkStaff: 'sparks',
  Adaptors: 'fittings', Sleeves: 'fittings', Dowels: 'fittings', Grips: 'fittings', Collapsible: 'fittings',
}
for (const d of DESIGNS) if (!d.custom && d.group !== 'Creations' && !SECTION_OF[d.group]) SECTION_OF[d.group] = 'hubs'
// first time with folders: hub styles start folded, except the one you are on, so the list is short
if (!listUI.folders) {
  const cur = DESIGNS.find((d) => d.id === state.design)?.group
  listUI.collapsed = [...new Set([...listUI.collapsed, ...Object.keys(SECTION_OF).filter((g) => SECTION_OF[g] === 'hubs' && g !== cur)])]
  listUI.folders = 1
  keepList()
}

// the browser: prop tiles first, then one prop's designs as a thumbnail grid with style chips
const CATS = [['hubs', 'Dragon staff hubs', '🐉'], ['bubbles', 'Bubble toys', '🫧'], ['rope', 'Rope darts and meteors', '🪢'], ['poi', 'Poi', '🌀'], ['contact', 'Contact staff ends', '⚪'], ['acro', 'Acro staff ends', '🤸'], ['hoops', 'Hoops', '⭕'], ['fire', 'Swords, axes and fire metal', '🔥'], ['moulds', 'Rubber moulds', '🧪'], ['fittings', 'Pole fittings', '🔩']]
const BUBBLE_GROUPS = ['BubblePoi', 'BubbleHubs']
const catOf = (g) => { if (BUBBLE_GROUPS.includes(g)) return 'bubbles'; const x = SECTION_OF[g]; return x === 'collapse' ? 'hoops' : x === 'sparks' ? 'fire' : x }
const METAL_HUB_GROUPS = ['Fire', 'SpokeHubs', 'PracticeSpokes']
const inCatOf = (e, cat) => catOf(e.group) === cat || !!e.design?.alsoIn?.includes(cat) || (cat === 'hubs' && METAL_HUB_GROUPS.includes(e.group))
function renderGallery() {
  galleryTools()
  const g = $('gallery')
  g.querySelectorAll('.design, h3, .empty, .cats, .catbar, .dgrid, .nowopen').forEach((n) => n.remove())
  for (const b of $('listChips').children) b.setAttribute('aria-pressed', b.dataset.f === listUI.filter)
  $('filtBox').hidden = !listUI.filters
  const filtOn = listUI.filter !== 'all' || (listUI.made && listUI.made !== 'all') || listUI.sort !== 'groups'
  $('filtBtn').setAttribute('aria-expanded', String(!!listUI.filters))
  $('filtBtn').textContent = filtOn ? 'Filters •' : 'Filters'
  const { list, grouped } = entries()
  const madeOf = (d) => {
    const m = new Set()
    if (!d) return m
    if (!d.cncOnly) m.add('print')
    if (d.cncOnly || d.cnc || (!d.adaptor && !d.custom && !printOnly(d) && !d.dart && !d.ballEnd && !d.mould && !d.bubblePoi)) m.add('metal')
    if (d.dart) m.add('metal') // turned or milled
    if (d.mould) { m.delete('metal'); m.add('rubber') }
    if (d.sword || d.tsword || d.taxe || d.fist || d.spokeHub || d.cage || d.group === 'Fire' || d.hilt) m.add('fire')
    if (!d.cncOnly && !printOnly(d) && !d.dart && !d.mould && !d.adaptor && !d.custom && d.draw) m.add('fire') // any hub cut in metal can carry wicks
    return m
  }
  const rows = listUI.made && listUI.made !== 'all' ? list.filter((e) => !e.design || madeOf(e.design).has(listUI.made)) : list
  const grid = () => { const x = document.createElement('div'); x.className = 'dgrid'; g.append(x); return x }
  const label = (txt) => { const h = document.createElement('h3'); h.className = 'sub'; h.textContent = txt; g.append(h) }
  const card = (e) => (e.design ? designCard(e) : ideaCard(e))
  const empty = (t) => g.insertAdjacentHTML('beforeend', `<div class="empty">${t}</div>`)
  // searching, or a filter other than All: one flat grid of everything that matches
  if (!grouped || listUI.filter !== 'all') {
    if (!rows.length) return empty(listUI.filter === 'liked' ? 'No hearts yet. Tap ♡ on any design you love.' : listUI.filter === 'top' ? 'Nothing has a heart yet. Be the first!' : listUI.q ? 'Nothing matches. Try a shorter word.' : 'Nothing here yet.')
    label(`${rows.length} design${rows.length === 1 ? '' : 's'}`)
    const x = grid(); for (const e of rows) x.append(card(e))
    return
  }
  const cur = DESIGNS.find((d) => d.id === state.design)
  if (!listUI.cat) {
    // the start: what is open now, then one tile per prop
    if (cur) {
      const now = document.createElement('div'); now.className = 'nowopen'
      now.innerHTML = '<span>Open now</span>'
      const e = { key: 'd:' + cur.id, design: cur, group: cur.group }
      const c = designCard(e); c.classList.add('wide'); now.append(c); g.append(now)
    }
    const box = document.createElement('div'); box.className = 'cats'
    const count = {}
    for (const e of rows) if (e.design && !e.design.custom) for (const [key] of CATS) if (inCatOf(e, key)) count[key] = (count[key] || 0) + 1
    const mineN = rows.filter((e) => e.group === 'Creations' || e.design?.custom).length
    const tile = (icon, name, n, fn) => { const b = document.createElement('button'); b.className = 'cat'; b.innerHTML = `<span class="ci">${icon}</span><b>${name}</b><small>${n}</small>`; b.onclick = fn; box.append(b) }
    for (const [key, name, icon] of CATS) if (count[key]) tile(icon, name, count[key], () => { listUI.cat = key; listUI.sub = 'all'; keepList(); renderGallery(); g.scrollTop = 0 })
    tile('✏️', 'Your creations', mineN || 'make one', () => { listUI.filter = 'creations'; listUI.filters = true; keepList(); renderGallery() })
    g.append(box)
    return
  }
  // inside one prop: back, style chips, the grid
  const name = CATS.find(([key]) => key === listUI.cat)?.[1] || ''
  let inCat = rows.filter((e) => e.design && !e.design.custom && inCatOf(e, listUI.cat))
  const bar = document.createElement('div'); bar.className = 'catbar'
  bar.innerHTML = `<button class="back">← All props</button><b>${name}</b><small>${inCat.length}</small><div class="chips kinds"></div><div class="chips subs"></div>`
  if (listUI.cat === 'hubs') {
    // two sections first: printed hubs, and metal ones (CNC cut or machined)
    const metal = (e) => !!(e.design.cnc || e.design.cncOnly || e.design.spokeHub || METAL_HUB_GROUPS.includes(e.group))
    const kind = listUI.hubKind === 'metal' ? 'metal' : 'print'
    const kinds = bar.querySelector('.kinds')
    for (const [k2, lab] of [['print', '3D printed'], ['metal', 'Metal (CNC)']]) {
      const c = document.createElement('button'); c.className = 'chip'
      c.textContent = `${lab} ${inCat.filter((e) => (k2 === 'metal') === metal(e)).length}`
      c.setAttribute('aria-pressed', String(kind === k2))
      c.onclick = () => { listUI.hubKind = k2; listUI.sub = 'all'; keepList(); renderGallery() }
      kinds.append(c)
    }
    inCat = inCat.filter((e) => (kind === 'metal') === metal(e))
  }
  bar.querySelector('.back').onclick = () => { listUI.cat = null; keepList(); renderGallery(); g.scrollTop = 0 }
  const groups = [...new Set(inCat.map((e) => e.group))]
  const subs = bar.querySelector('.subs')
  if (!groups.includes(listUI.sub)) listUI.sub = 'all'
  const nOf = (gname) => (gname === 'all' ? inCat.length : inCat.filter((e) => e.group === gname).length)
  if (groups.length > 7) {
    // lots of styles: one dropdown instead of a wall of chips
    const sel = document.createElement('select'); sel.className = 'subsel'; sel.setAttribute('aria-label', 'Style')
    for (const gname of ['all', ...groups]) { const o = document.createElement('option'); o.value = gname; o.textContent = `${gname === 'all' ? 'All styles' : GROUPS[gname] || gname} (${nOf(gname)})`; o.selected = listUI.sub === gname; sel.append(o) }
    sel.onchange = () => { listUI.sub = sel.value; keepList(); renderGallery() }
    subs.append(sel)
  } else if (groups.length > 1) for (const gname of ['all', ...groups]) {
    const c = document.createElement('button'); c.className = 'chip'
    const n = gname === 'all' ? inCat.length : inCat.filter((e) => e.group === gname).length
    c.textContent = `${gname === 'all' ? 'All' : GROUPS[gname] || gname} ${n}`
    c.setAttribute('aria-pressed', String(listUI.sub === gname))
    c.onclick = () => { listUI.sub = gname; keepList(); renderGallery() }
    subs.append(c)
  }
  g.append(bar)
  if (!inCat.length) return empty('Nothing here with this filter.')
  for (const gname of listUI.sub === 'all' ? groups : [listUI.sub]) {
    if (listUI.sub === 'all' && groups.length > 1) label(GROUPS[gname] || gname)
    const x = grid(); for (const e of inCat.filter((r) => r.group === gname)) x.append(card(e))
  }
}

function designCard(e) {
  const d = e.design, g = $('gallery')
  const b = document.createElement('button')
  b.className = 'design'
  b.setAttribute('aria-pressed', d.id === state.design)
  const cm = d.cnc ? matOf(cncDefaults(d)) : null
  const tag = !cm ? '' : `<span class="cutTag ${cm.kind}">⚙️ ${d.spokeHub ? 'machined metal · fire spokes' : cm.kind === 'metal' ? `CNC · ${cm.name.split(' ')[0].toLowerCase()} · fire` : `CNC · ${cm.name.split(' ')[0]} · practice`}</span>`
  b.title = d.blurb.split('. ')[0].replace(/\.$/, '') + '.'
  b.innerHTML = `<canvas width="128" height="128"></canvas><div><b>${d.name}</b>${tag}<small>${b.title}</small></div>${heartHTML(e)}`
  b.onclick = (ev) => {
    if (ev.target.closest('.heart')) return tapHeart(e.key)
    state.design = d.id
    g.querySelectorAll('.design').forEach((n) => n.setAttribute('aria-pressed', n === b))
    if (d.colors) {
      // designs that only work in particular colours set them
      state.color = d.colors.A
      state.colorB = d.colors.B
      for (const [box, hex] of [['swatches', d.colors.A], ['swatchesB', d.colors.B]])
        $(box).querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-pressed', s.style.background && new THREE.Color(s.style.background).getHexString() === hex.slice(1)))
    }
    if (cncOnly(d) && !isCnc()) { state.autoCnc = true; return setMode('cnc') } // spark cages are only ever cut in steel
    if (!cncOnly(d) && isCnc() && state.autoCnc) { state.autoCnc = false; return setMode('print') } // back to printing after a metal-only design
    renderParams()
    applyLook()
    schedule(0)
  }
  heartKeys(b, e.key)
  // a design can show twice (also pinned under Liked by me): every card gets its thumbnail
  d._btn = b
  d._thumb = b.querySelector('canvas')
  d._thumb.dataset.thumb = d.id
  if (d._thumbData) drawThumb(d._thumb, ...d._thumbData, d.glow)
  return b
}

function ideaCard(e) {
  const idea = e.idea
  const d = DESIGNS.find((x) => x.id === idea.design)
  const b = document.createElement('button')
  b.className = 'design creation'
  b.innerHTML = `<img alt="" width="64" height="64" style="width:64px;height:64px"><div><b></b><small></small></div>${heartHTML(e)}`
  if (idea.thumb) b.querySelector('img').src = idea.thumb
  b.querySelector('b').textContent = idea.name || 'Untitled'
  b.querySelector('small').textContent = [idea.design === 'custom' ? idea.note : d?.name, `${Number(idea.grams || 0).toFixed(0)} g`].filter(Boolean).join(' · ')
  b.onclick = (ev) => {
    if (ev.target.closest('.heart')) return tapHeart(e.key)
    openIdea(idea)
  }
  heartKeys(b, e.key)
  return b
}

function heartKeys(card, key) {
  const h = card.querySelector('.heart')
  h.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); tapHeart(key) } }
}

/** Every design's thumbnail is drawn into whichever card shows it, now and after the list re-renders. */
function setThumb(d, polys, R) {
  d._thumbData = [polys, R]
  for (const c of document.querySelectorAll(`canvas[data-thumb="${d.id}"]`)) drawThumb(c, polys, R, d.glow)
}

const builtHooks = []
let creator = null

// Thumbnails build one at a time in the background: always the next one you can SEE first
// (an open folder), so new designs at the end of the list never sit blank.
let thumbing = false
async function fillThumbs() {
  if (thumbing) return
  thumbing = true
  const left = new Set(DESIGNS)
  const next = () => {
    for (const d of left) if (document.querySelector(`canvas[data-thumb="${d.id}"]`)) return d
    return left.values().next().value
  }
  while (left.size) {
    const d = next()
    left.delete(d)
    try {
      const p = { ...state.params[d.id] }
      const k = keyOf(d.id, p)
      if (!cache.has(k)) remember(k, await thumbWork('build', { design: d.id, params: p, material: state.material, bed: Number(state.bed) }))
      setThumb(d, cache.get(k).polygons, cache.get(k).viewR || p.diameter / 2)
      // someone is waiting on exactly this hub: show it now
      if (k === keyOf(state.design, params())) rebuild()
    } catch {}
  }
  thumbing = false
}

// ------------------------------------------------------------------ build --
let current = null
let timer = 0
let ticket = 0

// Built hubs, most recent last. The gallery thumbnails build every design in
// the background, so most clicks on a design are answered from here at once.
const cache = new Map()
const FINISH0 = { kind: 'none', text: 'DREAM', font: 'bold sans', style: 'raised', depth: 1, size: 40, where: 'top', copies: 1, across: 0, up: 0, turn: 0, threshold: 128, invert: false, loops: null, sig: '' }
const finOf = (id) => (state.finish[id] = { ...FINISH0, ...(state.finish[id] || {}) })
const finishPayload = (id) => { const f = state.finish[id]; return f && f.kind !== 'none' && f.loops?.length ? { ...f } : null }
const infOf = (id) => (state.infill[id] = { ...INFILL0, ...(state.infill[id] || {}) })
const litOf = (id) => (state.lights[id] = { ...LIGHTS0, ...(state.lights[id] || {}) })
const lightsPayload = (id) => { const L = state.lights[id]; return L && L.on && L.spots?.length ? { ...LIGHTS0, ...L } : null }
const infillPayload = (id) => { const f = state.infill[id]; return f && f.fill < 100 ? { ...INFILL0, ...f } : null }
const keyOf = (id, p, mode = 'print') => { const f = finishPayload(id); return JSON.stringify([id, p, state.material, state.bed, mode === 'cnc' ? state.cncp[id] : 0, f ? { ...f, loops: f.sig } : 0, mode === 'cnc' ? 0 : infillPayload(id), mode === 'cnc' ? 0 : lightsPayload(id)]) }
function remember(k, hub) {
  cache.delete(k)
  cache.set(k, hub)
  while (cache.size > 30) cache.delete(cache.keys().next().value)
}

function schedule(ms = 90) {
  clearTimeout(timer)
  $('busy').hidden = false
  timer = setTimeout(rebuild, ms)
}

// The loader: shown only if a build takes longer than a blink, so slider
// tweaks don't flash it. The old hub stays visible but dimmed meanwhile.
let loaderTimer = 0, loaderTick = 0
function showLoader(d, t0) {
  clearTimeout(loaderTimer)
  clearInterval(loaderTick)
  document.querySelectorAll('.design.building').forEach((b) => b.classList.remove('building'))
  loaderTimer = setTimeout(() => {
    $('loaderName').textContent = `Building ${d.name}`
    $('loader').hidden = false
    canvas.classList.add('stale')
    $('verdict').classList.add('stale') // those numbers belong to the old hub
    d._btn?.classList.add('building')
    const tick = () => ($('loaderTime').textContent = `${((performance.now() - t0) / 1000).toFixed(1)} s`)
    tick()
    loaderTick = setInterval(tick, 100)
  }, 250)
}
function hideLoader() {
  clearTimeout(loaderTimer)
  clearInterval(loaderTick)
  $('loader').hidden = true
  canvas.classList.remove('stale')
  $('verdict').classList.remove('stale')
  document.querySelectorAll('.design.building').forEach((b) => b.classList.remove('building'))
}

function setGeo(mesh, data) {
  mesh.geometry.dispose()
  if (!data) { mesh.geometry = new THREE.BufferGeometry(); mesh.visible = false; return }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
  // skip sliver triangles: their normals come out as zero and shade black
  const P = data.positions, I = data.indices, keep = []
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2]
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    if (nx * nx + ny * ny + nz * nz > 1e-8) keep.push(I[t], I[t + 1], I[t + 2])
  }
  g.setIndex(keep)
  mesh.geometry = g.toNonIndexed() // flat facets: crisp edges on a CAD part
  mesh.geometry.computeVertexNormals()
  g.dispose()
  mesh.visible = true
}

function drawHalo(hub, p) {
  const R = p.diameter / 2 + 20
  const ctx = haloCanvas.getContext('2d')
  ctx.clearRect(0, 0, 512, 512)
  ctx.save()
  ctx.filter = 'blur(14px)'
  ctx.translate(256, 256)
  ctx.scale(256 / R, -256 / R)
  ctx.beginPath()
  for (const poly of hub.polygons.pods) { poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath() }
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fill('evenodd')
  ctx.restore()
  haloTex.needsUpdate = true
  for (const h of [haloTop, haloBot]) h.scale.set(2 * R, 2 * R, 1)
  haloTop.position.z = hub.podH + 0.6
  haloBot.position.z = -0.6
}

let inflight = false, queued = false
async function rebuild() {
  const d = design(), p = { ...params() }
  const cncNow = isCnc() && !printOnly(d)
  const k = keyOf(d.id, p, cncNow ? 'cnc' : 'print')
  const mine = ++ticket
  const t0 = performance.now()
  if (cache.has(k)) return show(cache.get(k), d, p, t0)
  showLoader(d, t0)
  // latest wins: while a build runs, newer requests just mark themselves and
  // the finished build hands over to whichever one is newest
  if (inflight) { queued = true; return }
  inflight = true
  let hub
  try {
    hub = cncNow
      ? await work('cnc', { design: d.id, params: p, cnc: { ...cncp() }, finish: finishPayload(d.id) })
      : await work('build', { design: d.id, params: p, material: state.material, bed: Number(state.bed), finish: finishPayload(d.id), infill: infillPayload(d.id), lights: lightsOK(d) ? lightsPayload(d.id) : null })
    remember(k, hub)
  } catch (e) {
    inflight = false
    hideLoader()
    $('busy').hidden = true
    status('build failed: ' + e.message)
    if (queued) (queued = false), rebuild()
    return
  }
  inflight = false
  if (queued || mine !== ticket) { queued = false; return rebuild() }
  show(hub, d, p, t0)
}

function show(hub, d, p, t0) {
  current = { hub, design: d, params: { ...p } }
  bubbles.setRing(hub.ring)
  $('vBubbles').hidden = !hub.ring
  if (!hub.ring && bubbles.enabled) $('vBubbles').click()
  const m = hub.meshes
  setGeo(frameMesh, m.frame || m.combined)
  frameMesh.material = frameMat
  if (hub.ball?.eye && frameMesh.visible) paintEye(frameMesh, hub.ball.eye)
  setGeo(glowMesh, m.glow)
  setGeo(lidMesh, m.lids)
  setGeo(ringMesh, m.ring)
  setGeo(snapMesh, m.snap)
  setGeo(rodMesh, m.rods)
  setGeo(kevMesh, m.kevlar)
  setGeo(zoneMesh, hub.infill?.zone && hub.infill.bodyKey === 'combined' ? m.solidZone : null)
  showZone()
  setGeo(pracMesh, m.practice)
  $('vSpokes').hidden = !(m.rods || m.kevlar || m.practice || hub.hoop)
  $('vSpokes').textContent = hub.bubbleHub ? 'Yarn and stopper' : hub.bubblePoi ? 'Swivels' : hub.hoop ? (hub.hoop.close ? '◀ Whole hoop' : 'Connector close-up ▶') : hub.fist ? 'Knot' : hub.acro ? (hub.acro.metal ? (hub.acro.plugIn ? 'Bolt, wedge, O-rings' : 'O-rings') : 'Coins') : hub.dowel ? 'Bolt and wedge' : hub.spoke ? 'Spokes' : hub.mould ? (hub.mould.box ? 'Master' : 'Cast part') : hub.novelty?.counter ? 'Counterweight' : hub.hoop ? 'Connector' : 'Wicks / ends'
  if (view.spokes === false) for (const x of [rodMesh, kevMesh, pracMesh]) x.visible = false
  $('ringColourRow').hidden = !(m.ring || m.snap)
  $('glowRow').hidden = $('ledRow').hidden = !hasLeds() // the LED ring can switch them on for any design
  weakGroup.clear()
  for (const poly of hub.polygons.weak) {
    const w = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)))), weakMat)
    w.position.z = p.frameH + 0.3
    weakGroup.add(w)
  }
  drawHalo(hub, p)
  infillReadout()
  // no staff through things held by a hilt, or ends that sit on the pole's tip
  const noPole = !!(hub.bubbleHub?.end || hub.cageBall || hub.hilt || hub.fist || hub.sword || hub.tsword || hub.taxe || hub.acro || hub.dowel || hub.bubblePoi || hub.hoop || hub.mould || hub.ball || hub.novelty || hub.dart || hub.cage || hub.sleeve || hub.practiceSpoke || hub.grip)
  $('vPole').hidden = noPole
  // swords, poi and rope darts are not spun on a staff: no spin controls
  const noSpin = !!(hub.sword || hub.tsword || hub.dart || hub.bubblePoi)
  $('vSpin').hidden = noSpin
  $('spinRate').closest('.ctl').hidden = noSpin
  if (noSpin && view.spin) $('vSpin').click()
  pole.visible = !noPole && $('vPole').getAttribute('aria-pressed') === 'true'
  const poleD = hub.adaptor ? p.small : p.poleOD // an adaptor shows its thin pole running through it
  setAnim(hub)
  applyLayers(); renderLayers()
  placeRef()
  if (view.cut) for (const o of [...animGroup.children, ...refGroup.children]) for (const m of [].concat(o.material)) { m.clippingPlanes = [cutPlane, cutPlane2]; m.clipIntersection = true; m.side = THREE.DoubleSide; m.needsUpdate = true }
  frameView(Math.max(hub.viewR || p.diameter / 2, state.ref === 'person' ? state.refH * 10 * 0.6 : 0))
  if (state.ref !== 'off' || hub.tsword || hub.taxe) setMain(false) // standing things and the size reference read from the side
  pole.scale.set(poleD / 22, 1, poleD / 22)
  if (!hub.cnc && !(hub.spoke && hub.spoke.mode === 'cnc')) setThumb(d, hub.polygons, hub.viewR || p.diameter / 2)
  applyLook()
  renderGuide()
  renderVerdict(hub, p)
  renderExports()
  if (hub.finishNote) $('exportNote').insertAdjacentHTML('beforeend', `<div class="hint">✨ ${hub.finishNote}</div>`)
  $('busy').hidden = true
  hideLoader()
  status(`built in ${Math.round(performance.now() - t0)} ms · ${hub.stats.tris.toLocaleString()} triangles`)
  persist()
  for (const f of builtHooks) f(hub, d, p)
}

const status = (s) => ($('status').textContent = s)
const pill = (kind, text) => `<span class="pill ${kind}">${text}</span>`

// 1.75 mm filament: grams → metres for this material
const metres = (g, mat) => (g / mat.density) * 1000 / (Math.PI * 0.875 ** 2) / 1000
const WASTE = 1.1 // skirt, purge after a colour swap, the odd failed first layer

function filamentRows(s, mat) {
  const snapTPU = current?.hub.snap?.led ? current.hub.snap.led.tpuG : s.gramsSnap || 0 // plastic only, not the LED pods' contents
  const g = s.grams + s.gramsRing + snapTPU // printed plastic for one hub (body, lids, bubble ring, snap weight)
  const gm = (x) => `${x.toFixed(0)} g · ${metres(x, mat).toFixed(0)} m`
  const sp = s.split
  return `
    <div class="sub">Filament (1.75 mm ${mat.name})</div>
    <div class="row"><span>One hub</span><span>${gm(g)}</span></div>
    <div class="row"><span>A pair</span><span>${gm(g * 2)}</span></div>
    ${sp ? `<div class="row"><span>Swap colour at ${current?.hub.colourChangeAt ?? ''} mm: A / B</span><span>${sp.swapA.toFixed(0)} g / ${sp.swapB.toFixed(0)} g</span></div>
    <div class="row"><span>Two-colour 3MF: A / B</span><span>${sp.partA.toFixed(0)} g / ${sp.partB.toFixed(0)} g</span></div>` : ''}
    ${s.gramsRing + snapTPU > 0 ? `<div class="row"><span>of which weight ring${state.colorRing ? ` (${FILAMENTS.find((f) => f[1] === state.colorRing)?.[0]})` : ''}</span><span>${gm(s.gramsRing + snapTPU)}</span></div>` : ''}
    ${s.gramsLids ? `<div class="row"><span>of which lantern lids</span><span>${s.gramsLids.toFixed(0)} g</span></div>` : ''}
    <div class="row"><span>Hubs from a 1 kg spool</span><span>${Math.floor(1000 / (g * WASTE))} <small>(10% spare for purge and skirt)</small></span></div>
    <div class="sub"></div>`
}

function renderAdaptorVerdict(hub, p, mat) {
  const a = hub.adaptor, s = hub.stats
  const bad = p.small >= p.big
    ? `The pole (Ø${p.small}) must be thinner than the hub size (Ø${p.big}).`
    : !a.ok ? `Wall is only ${a.wall.toFixed(1)} mm between a Ø${p.small} pole and Ø${p.big}: too thin to print or grip (needs 1.2 mm). Print the hub for Ø${p.small} instead.` : ''
  $('verdict').innerHTML = `
    <div class="big">${s.grams.toFixed(1)} g<small>Ø${p.small} pole → Ø${p.big} hub</small></div>
    ${bad ? `<div class="warnline">${bad}</div>` : ''}
    <div class="row"><span>Length · lip</span><span>${a.length.toFixed(1)} mm · Ø${a.lipD.toFixed(0)} mm</span></div>
    <div class="row"><span>Wall</span><span>${a.wall < 2 ? pill('warn', a.wall.toFixed(1) + ' mm, thin') : a.wall.toFixed(1) + ' mm'}</span></div>
    <div class="row"><span>Grip on Ø${p.small} pole</span><span>${a.squeeze > 0 ? a.squeeze.toFixed(2) + ' mm squeeze' : pill('bad', 'loose')}</span></div>
    <div class="row"><span>Hub grip</span><span>like a real Ø${p.big} pole</span></div>
    ${a.collet ? `<div class="row"><span>Collet slit</span><span>${p.slit} mm</span></div>` : ''}
    <div class="row"><span>Material</span><span>${pill({ best: 'good', good: 'good', ok: 'warn', avoid: 'bad' }[mat.verdict], mat.name)}</span></div>
    <div class="row"><span>From a 1 kg spool</span><span>${Math.floor(1000 / (s.grams * WASTE))}</span></div>
    ${s.parts > 1 ? `<div class="row"><span>Separate solids</span><span>${pill('bad', String(s.parts))}</span></div>` : ''}`
}

const kg = (g) => (g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${g.toFixed(0)} g`)
function renderCncVerdict(hub, p) {
  const s = hub.stats, c = cncp(), m = matOf(c), ek = hub.ends
  const fire = m.kind === 'metal'
  const bal = s.offset < 0.2 ? pill('good', 'balanced') : s.offset < 1 ? pill('warn', `${s.offset.toFixed(2)} mm off`) : pill('bad', `${s.offset.toFixed(1)} mm off`)
  const endsTxt = { tape: `${s.tabs} Kevlar wicks`, rope: 'a Kevlar rope ring', bumper: `${s.tabs} practice bumpers`, none: 'no ends' }[ek]
  $('verdict').innerHTML = `
    <div class="big">${kg(s.gTotal)}<small>each, with ${endsTxt}${ek === 'tape' || ek === 'rope' ? ' (fuelled)' : ''} · ${kg(s.gTotal * 2)} a pair</small></div>
    <div class="row"><span>Plate</span><span>${m.name}, ${s.thick} mm · ${kg(s.gPlate)}</span></div>
    ${ek === 'tape' ? `<div class="row"><span>Wicks</span><span>${s.tabs} × ${c.wickW} mm tape, ${c.tapeLen} mm each</span></div>
    <div class="row"><span>Kevlar tape to buy</span><span>${((c.tapeLen * s.tabs) / 1000 * 1.1).toFixed(1)} m of ${c.wickW} mm</span></div>
    <div class="row"><span>Wick head</span><span>about Ø${s.headD.toFixed(0)} mm · ${(s.kevG / s.tabs).toFixed(0)} g dry, ${((s.kevG * s.wet) / s.tabs).toFixed(0)} g fuelled</span></div>
    <div class="row"><span>Bolts</span><span>${s.tabs * 2} stainless, Ø${c.tabBolt} holes, all-metal lock nuts</span></div>` : ''}
    ${ek === 'rope' ? `<div class="row"><span>Rope to buy</span><span>${((s.ropeLen / 1000) * 1.15 + (s.slots ? 0.3 : 0)).toFixed(2)} m of ${c.ropeD} mm Kevlar</span></div>
    ${s.slots ? `<div class="row"><span>Woven through</span><span>${s.slots} slots · held by its own tension</span></div>` : `<div class="row"><span>Lacing holes</span><span>${s.laceHoles} · stainless wire or Kevlar thread</span></div>`}
    ${s.pocketDepth ? `<div class="row"><span>Rope groove</span><span>${s.pocketDepth.toFixed(1)} mm deep (milled)</span></div>` : ''}` : ''}
    ${ek === 'bumper' ? `<div class="row"><span>Practice bumpers</span><span>${s.tabs} × ${s.bumper.g.toFixed(0)} g TPU</span></div>
    <div class="row"><span>A wet wick would be</span><span>${s.bumper.target.toFixed(0)} g ${pill(Math.abs(s.bumper.g - s.bumper.target) < 5 ? 'good' : 'warn', Math.abs(s.bumper.g - s.bumper.target) < 5 ? 'matched' : 'close')}</span></div>` : ''}
    <div class="row"><span>Across the ends</span><span>Ø${s.overD.toFixed(0)} mm</span></div>
    <div class="row"><span>Balance on the staff</span><span>${bal}</span></div>
    <div class="row"><span>Cut length · pierces</span><span>${(s.cutLen / 1000).toFixed(1)} m · ${s.pierces}</span></div>
    <div class="row"><span>Thinnest bar · smallest gap</span><span>${s.lim.web.toFixed(1)} mm · ${s.lim.gap.toFixed(1)} mm</span></div>
    <div class="row"><span>Fire</span><span>${fire ? pill('good', 'yes, with Kevlar only') : pill('bad', 'never: practice only')}</span></div>
    ${c.flangeN > 0 ? insertTip('A bolted collar clamps the pole with screws.') : ''}
    ${s.fixes.length ? `<div class="sub">The forge fixed it for cutting</div>${s.fixes.map((f) => `<div class="row"><span>✓ ${f}</span><span></span></div>`).join('')}` : ''}
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
}

// jump to another design (e.g. a pole insert for this pole), carrying the pole size over
function goDesign(id) {
  const from = params()
  state.design = id
  if (from?.poleOD && 'poleOD' in params()) params().poleOD = from.poleOD
  renderGallery(); renderParams(); applyLook(); schedule(0)
  document.querySelector('.design[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' })
}
// clamps and screws on a hollow carbon pole can crush it: point at the inserts
function insertTip(why) {
  return `<div class="row"><span>Carbon or hollow pole?</span><span><button class="btn" data-go="sleeveSolid">Pole insert ↗</button></span></div>
    <div class="hint">${why} A printed pole insert inside the pole under the hub stops it crushing.</div>`
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) goDesign(b.dataset.go) })

function openGripGuide() {
  if (!window.__GRIP_GUIDE_HTML) return window.open('pole-grip-guide.html', '_blank')
  const w = window.open('', '_blank')
  if (!w) return status('Allow pop-ups to open the pole grip guide.')
  w.document.open(); w.document.write(window.__GRIP_GUIDE_HTML); w.document.close()
}
function renderGripVerdict(hub, p, mat) {
  const s = hub.stats, v = hub.grip
  $('verdict').innerHTML = `
    <div class="big">${s.grams.toFixed(0)} g<small>${['joiner', 'thread', 'bayonet', 'snap'].includes(v.kind) ? 'one per joint (a 3-piece staff has 2)' : 'one per hub'}</small></div>
    <div class="row"><span>Pole</span><span>Ø${p.poleOD} outside · Ø${(2 * v.rIn).toFixed(1)} inside</span></div>
    <div class="row"><span>Bolts to buy</span><span>${v.bolt}${['expander', 'clamp'].includes(v.kind) ? ' + 4 × M4 for the hub' : ''}</span></div>
    ${['expander', 'clamp'].includes(v.kind) ? `<div class="row"><span>Hub bolt circle</span><span>4 × M4 on Ø${p.pcd} (same as the CNC plates)</span></div>` : ''}
    <div class="row"><span>Crushes carbon?</span><span>${v.kind === 'clamp' ? pill('warn', 'fit a Pole Insert inside') : pill('good', 'no: it works from inside')}</span></div>
    <div class="row"><span>Material</span><span>${pill(state.material.startsWith('tpu') ? 'bad' : mat.verdict === 'avoid' ? 'bad' : 'good', mat.name)}</span></div>
    ${state.material.startsWith('tpu') ? '<div class="warnline">Grips must be rigid: print them in PETG or nylon (PA), 100% infill.</div>' : ''}
    <div class="row"><span>How to fit it</span><span><button class="btn" id="gripGuideBtn">Pole grip guide ↗</button></span></div>
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
  $('gripGuideBtn').onclick = openGripGuide
}
function renderCageVerdict(hub, p) {
  const s = hub.stats, v = hub.cage, m = matOf(cncp())
  const [a, b, h] = v.size
  $('verdict').innerHTML = `
    <div class="big">${s.grams.toFixed(0)} g<small>empty · about ${(s.grams + v.coalG).toFixed(0)} g loaded with ${v.coalG.toFixed(0)} g of charcoal</small></div>
    <div class="row"><span>Folded size</span><span>${a.toFixed(0)} × ${b.toFixed(0)} × ${h.toFixed(0)} mm</span></div>
    <div class="row"><span>Flat sheet</span><span>${v.flatW.toFixed(0)} × ${v.flatH.toFixed(0)} mm, ${s.thick} mm ${m.name}</span></div>
    <div class="row"><span>Spark holes</span><span>${v.sparks} × Ø${p.perf} mm</span></div>
    <div class="row"><span>Fixings</span><span>${v.holes.filter((x) => x.kind === 'rivet').length} rivets${v.holes.some((x) => x.kind === 'stitch') ? ' · stainless wire stitching' : ''}${v.holes.some((x) => x.kind === 'cap bolt') ? ' · M4 cap bolts' : ''}${v.holes.some((x) => x.kind === 'lid bolt') ? ' · M5 lid bolt' : ''}</span></div>
    <div class="row"><span>Made by</span><span>${pill('good', 'laser or waterjet, then folded')}</span></div>
    <div class="row"><span>Never printed</span><span>${pill('bad', 'steel only, never aluminium')}</span></div>
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
}
function renderDartVerdict(hub, p, mat) {
  const s = hub.stats, v = hub.dart, cnc = isCnc()
  const mName = cnc ? matOf(cncp()).name : mat.name
  $('verdict').innerHTML = `
    <div class="big">${s.grams.toFixed(0)} g<small>in ${mName}${v.style === 'glow' ? ', plus the capsule' : ''}</small></div>
    <div class="row"><span>Size</span><span>${v.H.toFixed(0)} mm long · Ø${(2 * v.R).toFixed(0)} widest</span></div>
    <div class="row"><span>${design().poi ? 'Leash' : 'Rope'}</span><span>${(p.attach || 'eye').startsWith('swivel') ? (cnc ? 'M8 tapped socket: screw in a stainless swivel eye bolt' : 'M8 nut trap: drop in an M8 nut while printing (pause), screw in a swivel eye bolt') : `Ø${(2 * v.eyeR).toFixed(1)} mm eye for ${p.ropeD} mm rope`}</span></div>
    <div class="row"><span>Same shape in</span><span>TPU ${((v.vol / 1000) * 1.21).toFixed(0)} g · alu ${((v.vol / 1000) * 2.7).toFixed(0)} g · brass ${((v.vol / 1000) * 8.5).toFixed(0)} g</span></div>
    <div class="row"><span>${cnc ? 'Made on' : 'Prints'}</span><span>${cnc ? (v.turned ? 'a lathe (drawing below)' : '4-axis mill or metal 3D print') : 'eye-down, with a brim'}</span></div>
    ${!cnc && !state.material.startsWith('tpu') ? `<div class="warnline">${design().poi ? 'Poi hit you' : 'A rope dart hits you'}: print it in TPU for practice.</div>` : ''}
    <div class="row"><span>Cast it in rubber?</span><span><button class="btn" data-go="${design().poi ? 'mouldPoi' : 'mouldDart'}">Moulds ↗</button></span></div>
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
}

function openMouldGuide() {
  if (!window.__MOULD_GUIDE_HTML) return window.open('mould-guide.html', '_blank')
  const w = window.open('', '_blank')
  if (!w) return status('Allow pop-ups to open the mould guide.')
  w.document.open(); w.document.write(window.__MOULD_GUIDE_HTML); w.document.close()
}
const M5 = [40, 50, 60, 70, 80, 100, 120, 150]
function renderMouldVerdict(hub, p, mat) {
  const s = hub.stats, v = hub.mould, bed = Number(state.bed)
  const [fw, fh] = v.footprint, fits = Math.max(fw, fh) <= bed - 2
  const what = v.kind === 'ball' ? 'contact ball' : v.kind === 'acro' ? 'acro staff end' : design().group === 'MouldPoi' ? 'poi head' : 'rope dart head'
  const rubberName = v.rubber.replace(/ \(.*\)/, '')
  const boltL = M5.find((x) => x >= v.size[1] + 8) || 150
  $('verdict').innerHTML = v.box ? `
    <div class="big">${(v.rubberMl * 1.1).toFixed(0)} ml<small>of ${rubberName} for the mould (both halves, with 10% spare)</small></div>
    <div class="row"><span>Each copy</span><span>${v.copyG.toFixed(0)} g in ${p.copies.replace(/ \(.*\)/, '')} · ${v.castMl.toFixed(0)} ml</span></div>
    <div class="row"><span>Mould block</span><span>${v.size.map((x) => x.toFixed(0)).join(' × ')} mm of rubber, in two halves</span></div>
    <div class="row"><span>Print</span><span>master (2 halves), parting board, 2 frames${v.pin ? ', core pin' : ''} · about ${(s.grams * 0.4).toFixed(0)} g PLA/PETG</span></div>
    ${v.plugs ? `<div class="row"><span>Eye plug</span><span>prints with the board: it sits in the eye hole for the first pour</span></div>` : ''}
    <div class="row"><span>Registration keys</span><span>${v.keys} (the board makes them in the first half)</span></div>
    <div class="row"><span>Pour and vents</span><span>${v.bottomFill ? 'sprue and runner fill it from the bottom' : 'straight in from the top'} · ${v.vents} vent${v.vents === 1 ? '' : 's'} on the master${v.markVents ? ` + ${v.markVents} to cut with a blade (marked)` : ''} · +${v.shrinkPct}% for shrink</span></div>
    ${v.bore ? `<div class="row"><span>Pole socket</span><span>the printed core pin: Ø${v.bore.d.toFixed(1)} × ${v.bore.depth.toFixed(0)} mm in every copy</span></div>` : ''}
    ${v.nut ? `<div class="row"><span>In every copy</span><span>M8 nut + Ø${2 * v.nut.washer} washer on an M8 × ${v.nut.bolt} bolt through the mould top</span></div>` : ''}
    <div class="row"><span>Fits ${bed} mm bed</span><span>${fits ? pill('good', 'yes') : pill('bad', `the box is ${Math.max(fw, fh).toFixed(0)} mm`)}</span></div>
    <div class="row"><span>How to</span><span><button class="btn" id="mouldGuideBtn">Mould making guide ↗</button></span></div>
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}` : `
    <div class="big">${v.castG.toFixed(0)} g<small>the ${what} in ${rubberName} · ${(v.castG * 2).toFixed(0)} g a pair</small></div>
    <div class="row"><span>Rubber to mix</span><span>${(v.castMl * 1.15).toFixed(0)} ml (${(v.castG * 1.15).toFixed(0)} g) with spare for the funnel</span></div>
    ${v.bore ? `<div class="row"><span>Pole socket</span><span>Ø${v.bore.d.toFixed(1)} × ${v.bore.depth.toFixed(0)} mm: ${p.squeeze} mm under a Ø${p.poleOD} pole, the rubber grips it</span></div>` : ''}
    ${v.nut ? `<div class="row"><span>Rope or leash</span><span>M8 nut + Ø${2 * v.nut.washer} mm washer cast in, held by an M8 × ${v.nut.bolt} bolt; then screw in a stainless M8 swivel eye bolt</span></div>` : v.kind === 'dart' ? `<div class="row"><span>Rope or leash</span><span>${(p.attach || '').startsWith('rope cast in') ? `the ${p.ropeD} mm rope cast straight in, a stopper knot on its end set in the middle of the head` : `moulded eye for ${p.ropeD} mm cord`}</span></div>` : ''}
    <div class="row"><span>Same mould, other rubbers</span><span>${Object.entries({ '30A': 1.08, '50A': 1.15, urethane: 1.04, 'with steel shot': 2.4 }).map(([n, d]) => `${n} ${((v.castMl * d)).toFixed(0)} g`).join(' · ')}</span></div>
    <div class="row"><span>Print</span><span>2 halves${v.pin ? ' + core pin' : ''}, split face up, no supports · about ${(s.grams * 0.4).toFixed(0)} g</span></div>
    <div class="row"><span>Hold shut</span><span>${v.bolts ? `${v.bolts} × M5 × ${boltL} bolts + wing nuts` : 'two clamps or strong rubber bands'} · ${v.keys} keys line it up · a seal ridge round the cavity stops leaks</span></div>
    <div class="row"><span>Pour</span><span>${v.bottomFill ? 'into the funnel: it runs down the sprue and fills from the bottom up' : 'into the funnel, straight in from the top'} · ${v.vents} vent${v.vents === 1 ? '' : 's'}, one at every air trap · stop when rubber shows at every vent</span></div>
    <div class="row"><span>Built in</span><span>+${v.shrinkPct}% for shrink · ${v.undercut > 0.02 ? `${(v.undercut * 100).toFixed(0)}% undercut: peel it out slowly` : 'no undercuts to speak of'}${v.pin ? ' · pointed core pin with draft' : ''}</span></div>
    <div class="row"><span>Mould</span><span>${v.size.map((x) => x.toFixed(0)).join(' × ')} mm</span></div>
    <div class="row"><span>Fits ${bed} mm bed</span><span>${fits ? pill('good', 'yes') : pill('bad', `a half is ${Math.max(fw, fh).toFixed(0)} mm`)}</span></div>
    ${state.material.startsWith('tpu') ? '<div class="warnline">Print the mould rigid, in PLA or PETG: a TPU mould bulges and the cast comes out lopsided.</div>' : ''}
    <div class="row"><span>How to</span><span><button class="btn" id="mouldGuideBtn">Mould making guide ↗</button></span></div>
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
  $('mouldGuideBtn').onclick = openMouldGuide
}

function openHoopGuide() {
  if (!window.__HOOP_GUIDE_HTML) return window.open('hoop-guide.html', '_blank')
  const w = window.open('', '_blank')
  if (!w) return status('Allow pop-ups to open the hoop guide.')
  w.document.open(); w.document.write(window.__HOOP_GUIDE_HTML); w.document.close()
}
function renderJointVerdict(hub, p) {
  const v = hub.hoop, j = v.joint, t = v.tube, s = hub.stats
  const inch = (mm) => (mm / 25.4).toFixed(2) + '"'
  const metal = j.style === 'button' || j.style === 'double'
  $('verdict').innerHTML = `
    <div class="big">${j.N} × ${inch(j.seg)}<small>${(j.seg / 10).toFixed(1)} cm per section · ${j.N} joints</small></div>
    <div class="row"><span>Total to cut</span><span>${inch(v.L)} (${(v.L / 10).toFixed(1)} cm) of ${t.label}, cut into ${j.N} equal pieces</span></div>
    <div class="row"><span>Joint</span><span>${j.name}</span></div>
    <div class="row"><span>Holes</span><span>${j.style === 'clip' ? `Ø3.2 straight through ${j.sB} mm from the sliding end` : `Ø${p.btnD} button hole ${j.sB} mm from the end, on the inside of the hoop`}${j.style !== 'double' ? ` · Ø3.3 rivet ${j.sR.toFixed(0)} mm from the fixed end` : ''}</span></div>
    <div class="row"><span>You need</span><span>${j.N} printed connectors${metal ? ` · ${j.N * (j.style === 'double' ? 2 : 1)} V-spring push buttons with a ${p.btnD} mm button (core Ø${j.core.toFixed(1)})` : ''}${j.style === 'clip' ? ` · ${j.N} × 3 mm stainless clevis pins with clips, or hairpin clips` : ''}${j.style !== 'double' ? ` · ${j.N} × 3.2 mm aluminium pop rivets (short)` : ''}</span></div>
    <div class="row"><span>Weight</span><span>${s.gramsTotal.toFixed(0)} g (tube ${v.tubeG.toFixed(0)} g + connectors ${v.connG.toFixed(0)} g)</span></div>
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
}

function renderHoopVerdict(hub, p, mat) {
  if (hub.hoop.joint) return renderJointVerdict(hub, p)
  const v = hub.hoop, t = v.tube, s = hub.stats
  const inch = (mm) => (mm / 25.4).toFixed(2) + '"'
  const cm = (mm) => (mm / 10).toFixed(1) + ' cm'
  const sizes = []
  for (let d = 20; d <= 46; d += 2) sizes.push(d)
  $('verdict').innerHTML = `
    <div class="big">${inch(v.L)}<small>of tubing to cut for a hoop ${inch(v.D)} OUTSIDE diameter (${inch(v.D - 2 * t.od)} inside) · ${cm(v.L)} · ${(v.L / 1000).toFixed(3)} m</small></div>
    <div class="row"><span>Outside diameter</span><span>${inch(v.D)} (${(v.D / 10).toFixed(1)} cm): the size hoops are sold by, edge to edge across the outside</span></div>
    <div class="row"><span>Inside diameter</span><span>${inch(v.D - 2 * t.od)} (${((v.D - 2 * t.od) / 10).toFixed(1)} cm): across the inside, the outside less two tube widths</span></div>
    <div class="row"><span>Tubing</span><span>${t.label}: Ø${t.od} mm outside, ${t.wall} mm wall, bore Ø${v.id.toFixed(1)} mm · ${t.note}</span></div>
    <div class="row"><span>How it's worked out</span><span>π × (${inch(v.D)} outside − ${inch(t.od)} tube) = ${inch(v.L)}: the tube bends round its own centre line</span></div>
    <div class="row"><span>Weight</span><span>about ${v.total.toFixed(0)} g before tape (tape adds 30–80 g)</span></div>
    <div class="row"><span>Connector</span><span>print 1 · ${p.connL} mm long, curved to the hoop · ${v.connG.toFixed(0)} g ${state.material.startsWith('tpu') ? 'PETG' : mat.name}</span></div>
    <div class="row"><span>Tube for 2 hoops</span><span>${((2 * v.L) / 1000).toFixed(2)} m · for 4: ${((4 * v.L) / 1000).toFixed(2)} m (buy 5% extra for squaring the ends)</span></div>
    <details class="hoopTable"><summary>Cut lengths for every size on this tube</summary>
      <div class="tbl"><table><tr><th>Hoop</th><th>Cut</th><th></th></tr>
      ${sizes.map((d) => { const L = Math.PI * (d * 25.4 - t.od); return `<tr${d === p.hoopIn ? ' style="color:var(--accent,#f0a23b)"' : ''}><td>${d}"</td><td>${inch(L)}</td><td>${cm(L)}</td></tr>` }).join('')}
      </table></div></details>
    ${state.material.startsWith('tpu') ? '<div class="warnline">Print the connector in PETG or nylon: TPU is too soft to hold the joint round.</div>' : ''}
    <div class="row"><span>How to</span><span><button class="btn" id="hoopGuideBtn">Hoop making guide ↗</button></span></div>
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
  $('hoopGuideBtn').onclick = openHoopGuide
}

// Hoops are about one number: how much tube to cut. A table of every size sits next to the view.
function renderCutPanel(hub, p) {
  const box = $('cutPanel')
  if (!hub?.hoop) { box.hidden = true; return }
  const v = hub.hoop, t = v.tube, j = v.joint
  const inch = (mm) => (mm / 25.4).toFixed(2) + '"'
  const rows = []
  const inside = (p.measure || '').includes('INSIDE')
  for (let d = 16; d <= 50; d += 1) {
    const OD = inside ? d * 25.4 + 2 * t.od : d * 25.4, ID = OD - 2 * t.od, L = Math.PI * (OD - t.od)
    rows.push(`<tr data-in="${d}"${Math.abs(d - p.hoopIn) < 0.01 ? ' class="on"' : ''}><td>${(OD / 25.4).toFixed(inside ? 2 : 0)}"</td><td>${(ID / 25.4).toFixed(inside ? 0 : 2)}"</td><td>${inch(L)}</td><td>${(L / 10).toFixed(1)}</td>${j ? `<td>${(L / 10 / j.N).toFixed(1)}</td>` : ''}</tr>`)
  }
  const ID = v.D - 2 * t.od
  const diag = `<svg viewBox="0 0 220 120" style="width:100%;height:auto;margin:4px 0 8px" role="img" aria-label="Outside and inside diameter of the hoop">
    <circle cx="70" cy="60" r="50" fill="none" stroke="var(--ember)" stroke-width="7"/>
    <line x1="16.5" y1="60" x2="123.5" y2="60" stroke="#ddd" stroke-width="1.2" marker-start="url(#ah)" marker-end="url(#ah)"/>
    <line x1="23.5" y1="78" x2="116.5" y2="78" stroke="#8fd" stroke-width="1.2" marker-start="url(#ah2)" marker-end="url(#ah2)"/>
    <defs><marker id="ah" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0L6,3L0,6z" fill="#ddd"/></marker><marker id="ah2" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0L6,3L0,6z" fill="#8fd"/></marker></defs>
    <text x="132" y="50" fill="#ddd" font-size="11">Outside (size)</text><text x="132" y="63" fill="#ddd" font-size="11" font-weight="700">${(v.D / 25.4).toFixed(2)}" · ${(v.D / 10).toFixed(1)} cm</text>
    <text x="132" y="84" fill="#8fd" font-size="11">Inside</text><text x="132" y="97" fill="#8fd" font-size="11" font-weight="700">${(ID / 25.4).toFixed(2)}" · ${(ID / 10).toFixed(1)} cm</text>
  </svg>`
  box.innerHTML = `<h3>${inch(v.L)} to cut</h3>${diag}
    <p>for a hoop <b>${(v.D / 25.4).toFixed(2)}" outside diameter</b> (${((v.D - 2 * t.od) / 25.4).toFixed(2)}" inside) on ${t.label}${j ? `: ${j.N} pieces of ${(v.L / j.N / 10).toFixed(1)} cm` : ''}. Cut length = π × (hoop size − tube width). Tap a row to pick that size.</p>
    <table><thead><tr><th>Outside ⌀</th><th>Inside ⌀</th><th>Cut</th><th>cm</th>${j ? '<th>each cm</th>' : ''}</tr></thead><tbody>${rows.join('')}</tbody></table>`
  box.hidden = false
  box.querySelectorAll('tbody tr').forEach((tr) => (tr.onclick = () => { params().hoopIn = Number(tr.dataset.in); renderParams(); schedule(0) }))
  box.querySelector('tr.on')?.scrollIntoView({ block: 'center' })
}

function renderBubbleHubVerdict(hub, p, mat) {
  const s = hub.stats, v = hub.bubbleHub, bed = Number(state.bed)
  const feedTxt = v.feed === 'tank' ? `the tank round the collar holds ${v.liquidMl.toFixed(0)} ml` : `the pole: about ${(v.liquidMl).toFixed(0)} ml if full; fill it a third (${(v.liquidMl / 3).toFixed(0)} ml) so the mix can run to the ends`
  $('verdict').innerHTML = `
    <div class="big">${s.grams.toFixed(0)} g<small>printed in ${mat.name}${v.feed === 'tank' ? ` · ${(s.gramsTotal).toFixed(0)} g with a full tank` : ''}</small></div>
    <div class="row"><span>Bubble mix</span><span>${feedTxt}</span></div>
    <div class="row"><span>Loops</span><span>${v.loops} edge-on, each fed by its own channel · ${v.outlet} mm outlets</span></div>
    <div class="row"><span>How it feeds</span><span>The spin is the pump: it flings the mix out along the channel ${v.wheel ? 'in each spoke to a ring channel inside the rim, and out of an outlet at every loop' : 'inside each spoke to the outlet at its tip'}. Cotton yarn wrapped round each loop, its tail tucked into the outlet, soaks the mix up and keeps the loop wet.</span></div>
    ${v.oRing ? `<div class="row"><span>Seals</span><span>${v.oRing.n} × O-rings ${v.oRing.id} × ${v.oRing.cs} mm (inside × thickness) ${v.oRing.where}, nitrile; a smear of silicone grease and they slide on</span></div>` : '<div class="row"><span>On the pole</span><span>slides on anywhere; an M5 grub screw in the collar above the tank holds it</span></div>'}
    <div class="row"><span>Across</span><span>${v.span.toFixed(0)} mm · ${v.span <= bed - 2 ? pill('good', `fits the ${bed} mm bed`) : pill('bad', 'bigger than your bed')}</span></div>
    ${mat.name.startsWith('TPU') ? '<div class="warnline">Print it in PETG: the channels need a rigid hub, and PETG holds water with 4 walls.</div>' : ''}
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
}
function renderBubblePoiVerdict(hub, p, mat) {
  const s = hub.stats, v = hub.bubblePoi
  $('verdict').innerHTML = `
    <div class="big">${s.gramsTotal.toFixed(0)} g<small>one poi, all its circles · make a pair</small></div>
    <div class="row"><span>Loops</span><span>${v.small} small (Ø${p.smallD}${(p.taper || '').startsWith('same') ? '' : ', ' + p.taper}), then Ø${p.bigD} at the bottom${v.crossed ? ' crossed by a second Ø' + p.bigD + ' ring' : ''} (inside sizes)</span></div>
    <div class="row"><span>Print</span><span>${(v.pieces || []).map((pc) => `${pc.n} × ${pc.label}`).join(' · ')}, all lying flat</span></div>
    <div class="row"><span>Linking</span><span>${v.swivels} small swivels or Ø${(p.linkD + 4).toFixed(0)} mm split rings, one between each pair of circles, through the Ø${p.linkD} eyes</span></div>
    ${v.crossed ? '<div class="row"><span>Big rings</span><span>slide the crossing ring onto the big ring at right angles: the slots at top and bottom lock them together. A drop of superglue in each slot if they are loose.</span></div>' : ''}
    <div class="row"><span>Film</span><span>${v.yarn ? `wrap each circle in 100% cotton yarn · about ${Math.ceil(v.yarnM)} m for one poi` : 'printed notches hold the mix: just dip'}</span></div>
    <div class="row"><span>Hanging length</span><span>about ${v.len.toFixed(0)} mm from the leash eye to the bottom</span></div>
    <div class="row"><span>Material</span><span>${pill(state.material.startsWith('tpu') ? 'warn' : 'good', mat.name)}</span></div>
    ${state.material.startsWith('tpu') ? '<div class="warnline">TPU loops flop and drop the film: print bubble poi in PETG.</div>' : ''}
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
}

function renderAcroVerdict(hub, p, mat) {
  const s = hub.stats, a = hub.acro
  const rows = []
  if (a.metal) {
    rows.push(['Body · ' + (a.plugIn ? 'steel wedge and bolt' : 'grub screw'), a.plugIn ? `${a.g.toFixed(0)} g · about ${(a.wedgeG + 12).toFixed(0)} g` : `${a.g.toFixed(0)} g · M5 cup point`])
    rows.push(['Size', `Ø${a.D.toFixed(1)} (${p.circ} mm round) × ${a.L} mm`])
    rows.push(['On the pole', a.plugIn ? `spigot Ø${(2 * a.sr).toFixed(1)} × ${a.sL} mm inside, ${a.lipL ? `lip ${a.lipL} mm over the outside` : 'flat shoulder'} · ${a.bolt}` : `socket Ø${(p.poleOD + 0.16).toFixed(2)} × ${a.grip.toFixed(0)} mm, M5 grub screw`])
    if (a.plugIn) {
      rows.push(['How it works', 'The spigot below the lip goes inside the pole. It is split into three fingers with a cone-shaped bore inside. A cone wedge sits in the bottom of it on the bolt. Turn the allen key and the bolt pulls the wedge up into the cone, the fingers spread and grip the inside of the pole all the way round. The lip sits on the pole end and wraps its outside, so the end cannot pull off, push in or rock. Press <b>How it works ▶</b> above the view to watch it.'])
      rows.push(['Fitting', `1 · bolt and wedge in, wedge just started on the thread · 2 · push the spigot into the pole until the lip sits on the end · 3 · tighten with a 5 mm allen key through the tip: firm, not forced · 4 · press the rubber tip cap in`])
      rows.push(['Taking it off', 'pull the cap, loosen the bolt 3 turns, tap the bolt head to knock the wedge down, pull the end off'])
    }
    if (a.grooves.length) rows.push(['O-rings', `${a.grooves.length} × ${p.oRingCS} mm cross-section, inside Ø${a.grooves[0].d.toFixed(1)} (buy that size, stretched on)`])
  } else {
    rows.push(['TPU', `${(hub.infill ? hub.infill.g : a.g).toFixed(0)} g ${fillWords(hub)}`])
    if (a.coin) rows.push(['Coins', `${a.coin.n} × Ø${a.coin.d} · about ${a.coin.g.toFixed(0)} g (weigh yours)`])
    if (a.shot) rows.push(['Steel shot', `${a.shot.g.toFixed(0)} g${a.shot.full ? ' (all that fits)' : ''}`])
    rows.push(['Size', `Ø${a.D.toFixed(1)} (${p.circ} mm round${a.sides ? `, ${a.sides} faces` : ''}) × ${a.L} mm`])
    rows.push(['Socket', `Ø${(2 * a.rb).toFixed(1)} × ${a.grip.toFixed(0)} mm deep · wall ${Math.max(0, a.wallS).toFixed(1)} mm${a.plug ? ` · plug Ø${a.plug.d.toFixed(1)} inside the pole` : ''}`])
    const pauses = []
    if (a.coin?.pauseAt) pauses.push(`${a.coin.pauseAt.toFixed(1)} mm: drop the coin${a.coin.n > 1 ? 's' : ''} in`)
    if (a.shot) pauses.push(`${a.shot.pauseAt.toFixed(1)} mm: pour in ${a.shot.g.toFixed(0)} g of shot`)
    if (pauses.length) rows.push(['Pause the print at', pauses.join('; ')])
    if (a.coin && a.coin.push) rows.push(['Coins go in', 'after printing: push them down the socket'])
    rows.push(['Prints', 'standing on its mouth, no supports'])
    rows.push(['Material', pill(state.material.startsWith('tpu') ? 'good' : 'warn', mat.name)])
  }
  $('verdict').innerHTML = `
    <div class="big">${a.total.toFixed(0)} g<small>each, all in · ${(2 * a.total).toFixed(0)} g a pair</small></div>
    ${rows.map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join('')}
    <div class="row"><span>Balance</span><span>make both ends the same weight, within 5 g: weigh them and add or take out a coin or some shot</span></div>
    ${!a.metal && !state.material.startsWith('tpu') ? '<div class="warnline">Acro ends take hits: print them in TPU (95A, or 85A for softer).</div>' : ''}
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
}

function renderSwordVerdict(hub, p) {
  const s = hub.stats, v = hub.sword
  $('verdict').innerHTML = `
    <div class="big">${kg(v.total)}<small>ready to burn: wet wicks${v.pomG ? ' and the pommel weight' : ''} on</small></div>
    <div class="row"><span>Plate</span><span>${v.T} mm ${v.mat} · ${v.plateG.toFixed(0)} g · ${v.length.toFixed(0)} × ${v.width.toFixed(0)} mm</span></div>
    <div class="row"><span>Fire</span><span>${v.full ? (v.full.kind === 'wrap' ? `${p.wickW} mm Kevlar tape wound the full blade (${v.full.along.toFixed(0)} mm from ${v.full.x0} mm above the guard to the tip), half-overlapped · ${v.full.tapeM.toFixed(1)} m of tape` : `${p.wickW} mm Kevlar tape folded over both edges, full length, bolted every 70 mm · ${v.full.tapeM.toFixed(1)} m of tape`) : v.rope ? `${p.ropeD} mm Kevlar rope laced through ${v.rope.n} slots · ${(v.rope.len / 1000).toFixed(1)} m` : `${v.tabs} Kevlar wicks · ${p.wickW} mm tape × ${p.tapeLen} mm each (${(v.tapeTotal / 1000).toFixed(1)} m)`} · ${v.fireG.toFixed(0)} g wet</span></div>
    <div class="row"><span>Pommel weight</span><span>${v.pomG ? `${v.pomG.toFixed(0)} g of steel washers on an M8 bolt` : 'none'}</span></div>
    <div class="row"><span>Balance point</span><span>${v.balance.toFixed(0)} mm in front of the guard ${Math.abs(v.balance - v.target) < 15 ? pill('good', 'rolls under control') : v.balance > v.target ? pill('warn', 'tip-heavy') : pill('warn', 'handle-heavy')}</span></div>
    <div class="row"><span>Handle</span><span>${p.handleL} mm: rivet on wooden scales (3 × Ø5 rivets) or wrap it</span></div>
    <div class="row"><span>Fire</span><span>${pill('good', 'metal: yes')}</span></div>
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
}

function renderNoveltyVerdict(hub, p, mat) {
  const s = hub.stats, v = hub.novelty
  $('verdict').innerHTML = `
    <div class="big">${s.gramsTotal.toFixed(0)} g<small>${s.gShot ? 'with its steel shot' : fillWords(hub)} · ${(s.gramsTotal * 2).toFixed(0)} g a pair</small></div>
    ${s.gShot ? `<div class="row"><span>Print · steel shot</span><span>${s.grams.toFixed(0)} g · ${s.gShot.toFixed(0)} g</span></div>
    <div class="row"><span>Pause the print at</span><span>${s.pauseAt.toFixed(1)} mm: fill the chambers with steel shot</span></div>` : ''}
    <div class="row"><span>Balance point</span><span>${s.comAbove.toFixed(0)} mm past the pole tip${s.gShot ? ` (${s.comPrinted.toFixed(0)} mm without shot)` : ''} · ${s.comOff < 0.3 ? pill('good', 'on the axis') : pill('warn', s.comOff.toFixed(1) + ' mm off')}</span></div>
    <div class="row"><span>Size</span><span>${v.width.toFixed(0)} wide × ${v.height.toFixed(0)} mm tall</span></div>
    ${v.counter ? `<div class="row"><span>Other end: ${v.counter.ball ? 'contact ball' : 'counterweight'}</span><span>Ø${v.counter.D.toFixed(0)}${v.counter.ball ? '' : ` × ${v.counter.H.toFixed(0)}`} mm · ${v.counter.total.toFixed(0)} g (${v.counter.g.toFixed(0)} g print${v.counter.shot > 0.5 ? ` + ${v.counter.shot.toFixed(0)} g steel shot` : ''})</span></div>
    ${v.counter.shot > 0.5 ? `<div class="row"><span>${v.counter.ball ? 'Ball' : 'Counterweight'}: pause at</span><span>${v.counter.pauseAt.toFixed(1)} mm, pour in ${v.counter.shot.toFixed(0)} g of steel shot (weigh it), carry on</span></div>` : ''}
    <div class="row"><span>Staff balance</span><span>${v.counter.heavy || v.counter.short ? pill('warn', `axe ${s.gramsTotal.toFixed(0)} g · other end ${v.counter.total.toFixed(0)} g`) : pill('good', 'both ends ' + s.gramsTotal.toFixed(0) + ' g: balances in the middle')}</span></div>
    ${v.counter.heavy ? `<div class="warnline">Even empty, the smallest ball (${v.counter.g.toFixed(0)} g) is heavier than this axe: make the axe bigger with Size, or pick the compact counterweight.</div>` : ''}
    ${v.counter.short ? '<div class="warnline">The other end cannot hold enough shot at this size: make it bigger (Counterweight / ball size 0 picks for you).</div>' : ''}` : v.axe ? '<div class="warnline">With no counterweight the axe end is heavier: the staff spins off-centre.</div>' : ''}
    <div class="row"><span>Grip on Ø${p.poleOD} pole</span><span>${v.squeeze.toFixed(2)} mm squeeze</span></div>
    <div class="row"><span>Prints</span><span>standing on its socket, one part</span></div>
    <div class="row"><span>Material</span><span>${pill(state.material.startsWith('tpu') ? 'good' : 'warn', mat.name)}</span></div>
    ${!state.material.startsWith('tpu') ? '<div class="warnline">These hit your body and the floor: print them in TPU 95A.</div>' : ''}
    <div class="row"><span>Heavier?</span><span><button class="btn" data-go="ballSmooth">Weightable balls ↗</button></span></div>`
}

function renderSleeveVerdict(hub, p, mat) {
  const s = hub.stats, v = hub.sleeve
  $('verdict').innerHTML = `
    <div class="big">${s.grams.toFixed(0)} g<small>each · one under every hub</small></div>
    <div class="row"><span>Fits inside</span><span>Ø${p.poleOD} pole with ${p.poleWall} mm wall (inside Ø${v.id.toFixed(1)})</span></div>
    <div class="row"><span>Insert</span><span>Ø${v.od.toFixed(2)} × ${v.L} mm</span></div>
    <div class="row"><span>Material</span><span>${pill(state.material.startsWith('tpu') ? 'warn' : mat.verdict === 'avoid' ? 'bad' : 'good', mat.name)}</span></div>
    ${state.material.startsWith('tpu') ? '<div class="warnline">An insert must be rigid to stop crushing: print it in PETG or nylon, 100% infill.</div>' : ''}
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
}
function renderPracticeVerdict(hub, p, mat) {
  const s = hub.stats, v = hub.practiceSpoke
  $('verdict').innerHTML = `
    <div class="big">${s.gramsTotal.toFixed(0)} g<small>each spoke with its head · print one per hub socket</small></div>
    <div class="row"><span>Printed spoke</span><span>${v.gSpoke.toFixed(0)} g ${state.material.startsWith('tpu') ? 'PETG/nylon' : mat.name}</span></div>
    <div class="row"><span>TPU head</span><span>Ø${v.headD.toFixed(0)} mm · ${v.gHead.toFixed(0)} g${v.head === 'glow' ? ' with capsule' : ''}</span></div>
    <div class="row"><span>Shank</span><span>Ø${(p.rodD - 0.2).toFixed(1)} × ${p.depth} mm, with a flat for the clamp screw</span></div>
    <div class="row"><span>Fire</span><span>${pill('bad', 'never: practice only')}</span></div>
    ${state.material.startsWith('tpu') ? '<div class="warnline">Print the spoke itself in PETG or nylon so it stays straight; only the head is TPU.</div>' : ''}
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
}

function renderBallVerdict(hub, p, mat) {
  const s = hub.stats, b = hub.ball
  const bedMax = Number(state.bed)
  $('verdict').innerHTML = `
    <div class="big">${kg(s.gramsTotal)}<small>each · ${kg(s.gramsTotal * 2)} a pair</small></div>
    <div class="row"><span>Printed ball</span><span>${s.gShell.toFixed(0)} g ${mat.name}</span></div>
    ${b.fill !== 'hollow' ? `<div class="row"><span>${b.fill.startsWith('heaviest') ? 'packed steel shot' : b.fill} inside</span><span>${b.gFill.toFixed(0)} g (${b.fill.startsWith('heaviest') ? 100 : p.fillPct}% full)</span></div>` : ''}
    ${b.eye?.whiteZ ? `<div class="row"><span>Colours</span><span>the bottom half all dark blue. Top half: start dark blue, change to white at ${(b.eye.whiteZ + 0.2).toFixed(1)} mm, light blue at ${(b.eye.irisZ + 0.2).toFixed(1)} mm and black at ${(b.eye.pupilZ + 0.2).toFixed(1)} mm (slicer: colour change / pause at height). A dab of white paint in the catchlight dimple. Or paint it with flexible paint.</span></div>` : b.eye ? `<div class="row"><span>Colours (top half)</span><span>print the top half white, change to the iris colour at ${(b.eye.irisZ + 0.2).toFixed(1)} mm and to the pupil colour at ${(b.eye.pupilZ + 0.2).toFixed(1)} mm (slicer: colour change / pause at height). Or paint it with flexible paint.</span></div>` : ''}
    <div class="row"><span>As heavy as it gets</span><span>${kg(s.gShell + b.fullShot)} packed with steel shot</span></div>
    <div class="row"><span>Chamber holds</span><span>${b.cavityCm3.toFixed(0)} cm³ · up to ${b.fullShot.toFixed(0)} g of steel shot</span></div>
    <div class="row"><span>Ball · socket</span><span>Ø${p.ballD} mm · ${b.depth.toFixed(0)} mm deep</span></div>
    <div class="row"><span>Grip on Ø${p.poleOD} pole</span><span>${b.squeeze > 0 ? b.squeeze.toFixed(2) + ' mm squeeze' : pill('bad', 'loose')}</span></div>
    <div class="row"><span>Prints as</span><span>3 parts, no supports</span></div>
    <div class="row"><span>Solid silicone instead?</span><span><button class="btn" data-go="mouldBall">Ball moulds ↗</button></span></div>
    <div class="row"><span>Material</span><span>${pill(mat.verdict === 'avoid' ? 'bad' : state.material.startsWith('tpu') ? 'good' : 'warn', mat.name)}</span></div>
    <div class="row"><span>Fits ${bedMax} mm bed</span><span>${p.ballD <= bedMax - 2 ? pill('good', 'yes') : pill('bad', 'too big')}</span></div>
    ${!state.material.startsWith('tpu') ? '<div class="warnline">Contact balls hit your body and the floor: TPU 95A is strongly recommended.</div>' : ''}
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
}

function renderSpokeVerdict(hub, p) {
  const s = hub.stats, sp = hub.spoke
  const cnc = sp.mode === 'cnc'
  const mName = cnc ? matOf(cncp()).name : MATERIALS[state.material].name
  const endName = SPOKE_ENDS[sp.ends]
  const tpu = !cnc && state.material.startsWith('tpu')
  $('verdict').innerHTML = `
    <div class="big">${kg(s.gTotal)}<small>one end of the staff: hub + ${sp.n} spokes · ${kg(s.gTotal * 2)} both ends</small></div>
    <div class="row"><span>Hub</span><span>${mName} · ${kg(s.gHub)}</span></div>
    <div class="row"><span>Each spoke</span><span>${sp.ends === 'none' ? '—' : `${s.gSpoke.toFixed(0)} g · ${endName}`}</span></div>
    ${sp.endInfo?.kind === 'tpu' ? `<div class="row"><span>Practice weight</span><span>Ø${sp.endInfo.D.toFixed(0)} × ${sp.endInfo.L} mm · ${sp.endInfo.g.toFixed(0)} g TPU</span></div>` : ''}
    ${sp.endInfo?.kind === 'led' ? `<div class="row"><span>LED end</span><span>holds a Ø${p.capD} × ${p.capL} capsule · ${sp.endInfo.g.toFixed(0)} g with it</span></div>` : ''}
    <div class="row"><span>Sockets</span><span>${sp.n} × Ø${sp.socketD.toFixed(2)} × ${p.depth} mm</span></div>
    <div class="row"><span>Spoke clamp screws</span><span>${sp.n * sp.perSpoke} × ${sp.grub} (${sp.perSpoke} a spoke) ${cnc ? `(tap drill Ø${sp.tap})` : 'grub screws + nuts in the traps'}</span></div>
    <div class="row"><span>On the pole</span><span>${sp.grip.startsWith('inside') ? `expanding spigot inside the pole end · 1 × M6 × 40 bolt` : sp.grip.startsWith('split') ? `split clamp · 1 × ${sp.grub} pinch bolt · bore Ø${sp.boreD.toFixed(2)}` : `2 × ${sp.grub} grub screws · bore Ø${sp.boreD.toFixed(2)}`}</span></div>
    <div class="row"><span>Across the spoke tips</span><span>Ø${s.overD.toFixed(0)} mm</span></div>
    <div class="row"><span>Thinnest wall</span><span>${sp.minWall < 4 ? pill('warn', sp.minWall.toFixed(1) + ' mm') : sp.minWall.toFixed(1) + ' mm'}</span></div>
    <div class="row"><span>Fire</span><span>${cnc && matOf(cncp()).kind === 'metal' ? pill('good', 'yes') : pill('bad', 'practice only')}</span></div>
    ${sp.grip.startsWith('inside') ? '' : insertTip(sp.grip.startsWith('split') ? 'The split clamp squeezes the pole.' : 'Two clamp screws press straight onto the pole.')}
    <div class="row"><span>No fire spokes yet?</span><span><button class="btn" data-go="practiceWick">Practice spokes ↗</button></span></div>
    ${tpu ? '<div class="warnline">TPU is too soft to hold 185 mm spokes straight: print the practice spoke hub in PETG or nylon (PA), 100% infill.</div>' : ''}
    ${!cnc && sp.ends !== 'tpu' && sp.ends !== 'led' && sp.ends !== 'none' ? '<div class="warnline">A printed hub must never carry fire spokes that are lit. Use it to practise with the spokes unlit, or pick practice ends.</div>' : ''}
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
}

function renderVerdict(hub, p) {
  renderCutPanel(hub, p)
  const s = hub.stats
  const mat = MATERIALS[state.material]
  if (hub.adaptor) return renderAdaptorVerdict(hub, p, mat)
  if (hub.cage) return renderCageVerdict(hub, p)
  if (hub.grip) return renderGripVerdict(hub, p, mat)
  if (hub.tsword) {
    const v = hub.tsword, s = hub.stats
    $('verdict').innerHTML = `
      <div class="big">${kg(v.total)}<small>ready to burn: Kevlar wet, pommel core in</small></div>
      <div class="row"><span>Balance point</span><span>${v.balance.toFixed(0)} mm up the blade from the connector ${Math.abs(v.balance - v.target) < 8 ? pill('good', 'as you set it') : pill('warn', 'off target')}</span></div>
      <div class="row"><span>Pommel</span><span>Ø${p.ballD} ${(p.pommel || '').startsWith('Kevlar') ? 'Kevlar ball' : 'steel ball'} on a ${(p.poleOD - 2 * p.poleWall).toFixed(1)} mm end plug with an M8 stud · steel core ${v.coreG.toFixed(0)} g (discs Ø${(v.coreR * 1.6).toFixed(0)} on the stud)${v.ballKevG ? ` · ${(v.ballTape / 1000).toFixed(1)} m of tape wound round` : ''}</span></div>
      <div class="row"><span>Connector</span><span>${v.connG.toFixed(0)} g, ${v.c.toFixed(0)} mm block · ${v.through ? '4 × M5 bolts through block and tube, all-metal lock nuts' : '8 × M5 set screws'}</span></div>
      <div class="row"><span>Cut list</span><span>blade tube Ø${p.bladeOD} × ${p.bladeWall} wall, ${v.bladeTube.toFixed(0)} mm · 2 guard tubes Ø${p.guardOD}, ${v.guardTube.toFixed(0)} mm each, bent ${p.guardUp}° · your Ø${p.poleOD} pole, ${v.poleLen.toFixed(0)} mm</span></div>
      <div class="row"><span>Kevlar tape</span><span>${((v.tapeTotal + v.ballTape) / 1000).toFixed(1)} m of ${p.wickW} mm (${(v.tapeTotal / 1000).toFixed(1)} m for the blade${(p.guardFire || '').startsWith('Kevlar') ? ' and guard' : ''})</span></div>
      <div class="row"><span>Weights</span><span>blade ${(v.bladeG + v.bladeKevG).toFixed(0)} g · guard ${(v.guardG + v.guardKevG).toFixed(0)} g · handle ${v.poleG.toFixed(0)} g · pommel ${(v.ballKevG + v.coreG + v.plugG).toFixed(0)} g</span></div>
      <div class="row"><span>Size</span><span>${v.len.toFixed(0)} mm long, guard ${v.width.toFixed(0)} mm across</span></div>
      ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
    return
  }
  if (hub.taxe) {
    const v = hub.taxe, s = hub.stats
    $('verdict').innerHTML = `
      <div class="big">${v.total.toFixed(0)} g<small>the ${v.mace ? 'mace' : v.diamond ? 'diamond' : 'axe'} head, wet · ${v.counter ? kg(v.total + v.counter.kev + v.counter.core + v.counter.plug) + ' both ends' : ''}</small></div>
      <div class="row"><span>Block</span><span>${v.blockG.toFixed(0)} g machined · M5 bolts through every socket</span></div>
      <div class="row"><span>${v.plate ? 'Head' : v.mace ? 'Spikes' : v.diamond ? 'Diamond' : 'Bits'}</span><span>${v.plate ? `cut from ${v.T} mm ${v.mat} plate, ${v.bitG.toFixed(0)} g · its tongue bolts into the block with 2 × M6` : v.mace ? `${v.bits} spikes of Ø${p.bitOD} tube, each bolted into its socket in the core` : v.diamond ? `one Ø${p.bitOD} tube bent into a diamond, both ends bolted into the block` : `${v.bits} crescent${v.bits > 1 ? 's' : ''} bent from Ø${p.bitOD} tube`} · ${v.tubeLen.toFixed(0)} mm of tube in all</span></div>
      <div class="row"><span>Kevlar tape</span><span>${(v.tape / 1000).toFixed(1)} m of ${p.wickW} mm ${v.plate ? 'folded over the cutting edge, bolted through every hole with M4 stainless bolts and all-metal lock nuts' : `on the edges${p.spikeL ? ' and the spike' : ' and the top ball'}`}</span></div>
      ${v.counter ? `<div class="row"><span>Other end</span><span>Ø${v.counter.D} Kevlar ball: steel core ${v.counter.core.toFixed(0)} g on an M8 stud in an end plug, ${(v.counter.tape / 1000).toFixed(1)} m of tape · weighs the same as the head, so the staff balances</span></div>` : ''}
      <div class="row"><span>Size</span><span>${v.width.toFixed(0)} wide × ${v.height.toFixed(0)} mm tall (head and the pole stub shown)</span></div>
      ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
    return
  }
  if (hub.cageBall) {
    const v = hub.cageBall, s = hub.stats
    const twist = (p.join || '').startsWith('tabs'), wire = (p.join || '').startsWith('stainless')
    $('verdict').innerHTML = `
      <div class="big">${kg(v.total)}<small>one head, Kevlar fuelled · ${kg(2 * v.total)} a pair</small></div>
      <div class="row"><span>Metal</span><span>${v.g.toFixed(0)} g · ${v.T} mm ${v.mat}, ${(v.sheet[0] / 10).toFixed(0)} × ${(v.sheet[1] / 10).toFixed(0)} cm of sheet</span></div>
      <div class="row"><span>Parts</span><span>${v.parts.join(' · ')}</span></div>
      <div class="row"><span>Joining</span><span>${twist ? 'slot the four half hoops onto the equator ring (inside notches over outside notches), push the tabs through the pole plates and twist each a quarter turn with pliers' : wire ? 'slot it together, then lash every crossing and every tab with 1 mm stainless wire through the small holes, twisted tight and tucked' : 'slot it together and tack-weld or braze every crossing and every tab'}</span></div>
      <div class="row"><span>Kevlar</span><span>${v.tapeM.toFixed(1)} m of ${p.wickW} mm tape spiralled round the bands, each turn half over the last, ends wired down · ${v.kevG.toFixed(0)} g fuelled</span></div>
      ${v.staff ? `<div class="row"><span>On the staff</span><span>a turned stainless mount (${v.mountG.toFixed(0)} g): a plug Ø${(v.poleIn - 0.2).toFixed(1)} inside the pole, cross-bolted with M5, a lip over the pole end, a ${v.neck} mm neck holding the ball clear, and an M8 stud up through the bottom plate, nutted inside the cage. Press <b>How it works ▶</b> to watch it go together.</span></div>` : `<div class="row"><span>Hang it</span><span>a stainless shackle through the Ø${p.eyeD} top eye, then a ball-bearing swivel and the chain; the bottom plate's hole takes a tail or another head. Press <b>How it works ▶</b> to see how the bands go together.</span></div>`}
      ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
    return
  }
  if (hub.hilt) {
    const v = hub.hilt, s = hub.stats
    const lockTxt = v.lockKind === 'bolt' ? 'each tube straight into its socket, drilled through the block\'s hole, an M5 bolt and all-metal lock nut' : v.lockKind === 'grub' ? 'an insert glued and riveted in each tube end; its spigot goes in the socket and an M5 × 8 grub screw (cup point) drops into the groove round it' : 'an insert in each tube end with two pins: push in, twist a quarter turn, locked. No tools'
    $('verdict').innerHTML = `
      <div class="big">${v.g.toFixed(0)} g<small>the block, ${isCnc() ? matOf(cncp()).name : MATERIALS[state.material].name}</small></div>
      <div class="row"><span>Sockets</span><span>handle Ø${v.sockets.handle.toFixed(1)} · blade Ø${v.sockets.blade.toFixed(1)} · guards Ø${v.sockets.guard.toFixed(1)}${v.inserts ? ' (for the inserts\' spigots)' : ''}</span></div>
      <div class="row"><span>Locks by</span><span>${lockTxt}</span></div>
      ${v.inserts ? `<div class="row"><span>Inserts</span><span>print 4 (handle, blade, 2 guards) in PETG or nylon, or have them turned in aluminium for fire: glue each into its tube with epoxy and pop a 3.2 mm rivet through the hole</span></div>` : ''}
      <div class="row"><span>Make it</span><span>${isCnc() ? 'machine it: send the STL to a machine shop' : 'print it: PETG or nylon, 100% infill, lying on its side. For fire, switch to CNC and have it machined in aluminium'}</span></div>
      <div class="row"><span>See it go together</span><span>press <b>How it works ▶</b> above the view</span></div>
      ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
    return
  }
  if (hub.fist) {
    const f = hub.fist, s = hub.stats
    const coreTxt = f.coreKind === 'steel' ? `a Ø${f.coreD} steel ball${f.use === 'staff' ? ', drilled Ø8.5 through, on an M8 stud in an end plug (Pole fittings)' : ''}` : f.coreKind === 'printed' ? `the printed core: pause at ${f.pauseAt.toFixed(1)} mm and fill it with ${f.shotG.toFixed(0)} g of steel shot${f.socket ? `; it takes the Ø${p.poleOD} pole ${f.socket.depth.toFixed(0)} mm deep` : ''}` : `a Ø${f.coreD} rubber or tennis ball`
    $('verdict').innerHTML = `
      <div class="big">${f.total.toFixed(0)} g<small>${f.rope ? 'fuelled' : 'practice'} · Ø${f.fin} mm finished</small></div>
      <div class="row"><span>Turns per set</span><span>${f.n} (three sets) of ${f.d} mm ${f.rope ? 'Kevlar rope' : 'cord'}</span></div>
      <div class="row"><span>Rope to cut</span><span>${(f.ropeL / 1000).toFixed(2)} m (${(f.tails / 1000).toFixed(1)} m of that is the two tails to tie off)</span></div>
      <div class="row"><span>Core</span><span>${coreTxt}</span></div>
      <div class="row"><span>Weight</span><span>rope ${f.ropeG.toFixed(0)} g${f.wetG ? ` + fuel ${f.wetG.toFixed(0)} g` : ''} · core ${(f.coreG + f.shotG).toFixed(0)} g</span></div>
      <div class="row"><span>Tails</span><span>${f.use === 'staff' ? 'bind both tails down the pole with a double constrictor of Kevlar thread and two turns of stainless wire' : 'bring both tails out side by side and tie a figure-eight loop to the swivel, or bind them to it with a double constrictor and wire'}</span></div>
      <div class="row"><span>How to tie it</span><span><button class="btn" id="knotGuideBtn">Knots and wicking 101 ↗</button></span></div>
      ${f.use === 'meteor' || f.use === 'poi' ? '<div class="row"><span>Pair</span><span>make two, weigh them, match within 5 g</span></div>' : ''}
      ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
    $('knotGuideBtn').onclick = openKnotGuide
    return
  }
  if (hub.acro) return renderAcroVerdict(hub, p, mat)
  if (hub.dowel) {
    const v = hub.dowel, s = hub.stats
    $('verdict').innerHTML = `
      <div class="big">${v.g.toFixed(0)} g<small>the dowel, ${matOf(cncp()).name}</small></div>
      <div class="row"><span>In the pole</span><span>${v.expand ? `spigot Ø${(2 * v.rs).toFixed(1)} × ${p.inL} mm, expands on an ${v.bolt}` : `spigot Ø${(2 * v.rs).toFixed(1)} × ${p.inL} mm, epoxy and a Ø3.2 rivet across`}</span></div>
      <div class="row"><span>On the pole end</span><span>${p.lipL > 0 ? `lip Ø${v.D.toFixed(1)} wraps ${p.lipL} mm down the outside` : `flat flange Ø${v.D.toFixed(1)}`}</span></div>
      <div class="row"><span>The hub sits on</span><span>a Ø${p.poleOD} stub, ${v.stubL.toFixed(1)} mm long</span></div>
      <div class="row"><span>Locked by</span><span>${v.lock === 'grub' ? `an M5 cup-point grub screw in the hub collar, into a groove ${(v.zL - p.flangeT).toFixed(1)} mm up` : v.lock === 'pin' ? `an M5 bolt with an all-metal lock nut (or a 5 mm clevis pin and R-clip) through collar and stub, ${(v.zL - p.flangeT).toFixed(1)} mm up` : `the same bolt through a Ø${v.washer?.od || 30} mm washer on the hub face`}</span></div>
      <div class="row"><span>In the hub</span><span>tick <b>Lock onto a metal dowel</b> and pick the same lock: the forge cuts the ${v.lock === 'grub' ? 'grub screw hole and nut trap' : v.lock === 'pin' ? 'cross hole' : 'nothing extra; the washer does it'}</span></div>
      ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
    return
  }
  if (hub.sword) return renderSwordVerdict(hub, p)
  if (hub.dart) return renderDartVerdict(hub, p, mat)
  if (hub.mould) return renderMouldVerdict(hub, p, mat)
  if (hub.hoop) return renderHoopVerdict(hub, p, mat)
  if (hub.bubblePoi) return renderBubblePoiVerdict(hub, p, mat)
  if (hub.bubbleHub) return renderBubbleHubVerdict(hub, p, mat)
  if (hub.cnc) return renderCncVerdict(hub, p)
  if (hub.spoke) return renderSpokeVerdict(hub, p)
  if (hub.ball) return renderBallVerdict(hub, p, mat)
  if (hub.sleeve) return renderSleeveVerdict(hub, p, mat)
  if (hub.novelty) return renderNoveltyVerdict(hub, p, mat)
  if (hub.practiceSpoke) return renderPracticeVerdict(hub, p, mat)
  const bedMax = Number(state.bed)
  const bal = s.centroidOffset < 0.1 ? pill('good', 'balanced') : s.centroidOffset < 1 ? pill('warn', `${s.centroidOffset.toFixed(2)} mm off`) : pill('bad', `${s.centroidOffset.toFixed(1)} mm off`)
  const weak = s.weakArea < 1 ? pill('good', 'none') : s.weakArea < 150 ? pill('warn', `${s.weakArea.toFixed(0)} mm²`) : pill('bad', `${s.weakArea.toFixed(0)} mm²`)
  const matPill = { best: 'good', good: 'good', ok: 'warn', avoid: 'bad' }[mat.verdict]
  const squeeze = p.poleOD - s.ribTipD
  const caps = s.capsules
  $('verdict').innerHTML = `
    <div class="big">${s.gramsTotal.toFixed(0)} g<small>each${caps ? ` with ${caps} capsules` : ''} · ${(s.gramsTotal * 2).toFixed(0)} g a pair</small></div>
    ${caps ? `<div class="row"><span>Printed part / capsules</span><span>${s.grams.toFixed(0)} g / ${(caps * p.capMass).toFixed(0)} g</span></div>` : ''}
    ${hub.ring?.internal ? `<div class="row"><span>Bubble loops</span><span>${hub.ring.loops} inside the rim, part of the hub</span></div>` : ''}
    ${s.gramsRing ? `<div class="row"><span>Bubble weight ring</span><span>${s.gramsRing.toFixed(0)} g · Ø${hub.ring.diameter.toFixed(0)} mm</span></div>
    <div class="row"><span>Ring prints as</span><span>${hub.ring.segs > 1 ? `${hub.ring.segs} segments` : 'one piece'} · ${hub.ring.loops} loops · ${hub.ring.snap ? 'snaps on, no tools' : hub.ring.bolts + ' bolts'}</span></div>
    ${hub.ring.snap && !hub.ring.fitsBed ? `<div class="warnline">The snap bubble ring is Ø${hub.ring.diameter.toFixed(0)} mm and must print in one piece (hoop tension holds it on). Shrink the hub a little or use the 320 mm single-nozzle bed.</div>` : ''}` : ''}
    ${hub.snap ? `<div class="row"><span>Snap-on weight (${hub.snap.weight})</span><span>${s.gramsSnap.toFixed(0)} g · Ø${hub.snap.diameter.toFixed(0)} mm</span></div>
    ${hub.snap.led ? `<div class="row"><span>LED ring: TPU / pods / strip</span><span>${hub.snap.led.tpuG.toFixed(0)} / ${hub.snap.led.podG.toFixed(1)} / ${hub.snap.led.stripG.toFixed(0)} g</span></div>
    <div class="row"><span>Block depth · pause print at</span><span>${hub.snap.led.depth} mm · ${hub.snap.led.pauseAt.toFixed(1)} mm</span></div>
    <div class="row"><span>Pod A vs B</span><span>${hub.snap.led.mismatch <= 1 ? pill('good', `${hub.snap.led.mismatch.toFixed(1)} g apart`) : pill('warn', `${hub.snap.led.mismatch.toFixed(1)} g apart: add trim to the light pod`)}</span></div>` : ''}
    <div class="row"><span>Light / medium / heavy</span><span>${['light', 'medium', 'heavy'].map((w) => hub.snap.grams[w].toFixed(0)).join(' / ')} g</span></div>
    ${hub.snap.fitsBed ? '' : `<div class="warnline">The snap-on weight is Ø${hub.snap.diameter.toFixed(0)} mm and must print in one piece (hoop tension is what holds it on). Shrink the hub a little or use a bigger bed.</div>`}` : ''}
    ${p.snap !== 'off' && p.ring === 'on' ? '<div class="warnline">The snap-on weight is off while the bubble ring is on: they both wrap the rim.</div>' : ''}
    ${filamentRows(s, mat)}
    <div class="row"><span>Balance on the staff</span><span>${bal}</span></div>
    <div class="row"><span>Thin spots under ${s.minW.toFixed(1)} mm</span><span>${weak}</span></div>
    <div class="row"><span>Material</span><span>${pill(matPill, mat.name)}</span></div>
    <div class="row"><span>Fits ${bedMax} mm bed</span><span>${p.diameter <= bedMax - 2 ? pill('good', `${p.diameter} mm`) : pill('bad', `${p.diameter} mm, too big`)}</span></div>
    <div class="row"><span>Grip on Ø${p.poleOD} pole</span><span>${squeeze > 0 ? squeeze.toFixed(2) + ' mm squeeze' : pill('bad', 'loose')}</span></div>
    ${hub.lock ? `<div class="row"><span>Locks onto a dowel</span><span>${hub.lock.name}${hub.lock.fromCollarEnd != null ? ` · set the dowel's Stub to ${p.collarH} mm and Lock from the flange to ${hub.lock.fromCollarEnd.toFixed(1)} mm` : hub.lock.type === 'bolt' ? ` · set the dowel's Stub to ${p.collarH} mm` : ''}. Fit it with the flat face out, collar end on the dowel's flange.</span></div>${hub.lock.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}` : ''}
    ${p.screw > 0 ? insertTip('The set screw presses on the pole.') : ''}
    ${caps ? `<div class="row"><span>Lantern height</span><span>${hub.podH.toFixed(1)} mm</span></div>` : ''}
    ${s.parts > 1 ? `<div class="row"><span>Separate solids</span><span>${pill('bad', String(s.parts))}</span></div>` : ''}
    ${s.dropped ? `<div class="row"><span>Loose bits removed</span><span>${pill('warn', String(s.dropped))}</span></div>` : ''}
    ${s.capWarn.map((w) => `<div class="warnline">${w[0].toUpperCase() + w.slice(1)}. Shrink the shapes, move them, or make the hub bigger.</div>`).join('')}`
}

// the portable build carries the plan inline: write it into a new window
// (a page opened from disk may not open blob: or data: URLs)
function openLedPlan() {
  if (!window.__LED_PLAN_HTML) return window.open('led-ring-plan.html', '_blank')
  const w = window.open('', '_blank')
  if (!w) return status('Allow pop-ups to open the LED ring plan.')
  w.document.open(); w.document.write(window.__LED_PLAN_HTML); w.document.close()
}

function openKnotGuide() {
  if (!window.__KNOT_GUIDE_HTML) return window.open('knot-guide.html', '_blank')
  const w = window.open('', '_blank')
  if (!w) return status('Allow pop-ups to open the knots guide.')
  w.document.open(); w.document.write(window.__KNOT_GUIDE_HTML); w.document.close()
}
document.getElementById('knotsBtn').onclick = openKnotGuide
// the liability notice: shown once on a first visit, and always one tap away on the line at the bottom
{
  const dlg = document.getElementById('noticeDlg'), KEY = 'forge-liability-ok'
  const show = () => { try { dlg.showModal() } catch {} }
  dlg.addEventListener('close', () => { try { localStorage.setItem(KEY, '1') } catch {} })
  let seen = false
  try { seen = localStorage.getItem(KEY) === '1' } catch {}
  if (!seen) setTimeout(show, 600)
  const line = document.getElementById('liabilityLine')
  line.onclick = show
  line.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && show()
}
// Big job mate: the fire dome plans, behind their disclaimer
document.getElementById('bigJobBtn').onclick = () => { try { document.getElementById('bigJobDlg').showModal() } catch {} }
document.getElementById('bigJobGo').onclick = () => document.getElementById('bigJobDlg').close()

function openWickGuide() {
  if (!window.__WICK_GUIDE_HTML) return window.open('wicking-guide.html', '_blank')
  const w = window.open('', '_blank')
  if (!w) return status('Allow pop-ups to open the wicking guide.')
  w.document.open(); w.document.write(window.__WICK_GUIDE_HTML); w.document.close()
}

function exportButtons(list) {
  const box = $('exports')
  box.innerHTML = ''
  for (const [label, cls, fn, off] of list) {
    const b = document.createElement('button')
    b.className = 'btn ' + cls
    b.textContent = label
    b.disabled = !!off
    b.onclick = fn
    box.append(b)
  }
}

function renderCutExports(d) {
  const hub0 = current && current.design === d ? current.hub : null
  const hub = hub0 && (hub0.cnc || hub0.spoke || hub0.cage || hub0.dart || hub0.sword) ? hub0 : null // a print build still on screen does not count
  const ready = !!hub
  const c = cncp(), p = params()
  const name = `hub-${d.id}-${matKey(c)}`
  const txt = (data, file, type) => () => download(data(), file, type)
  if (d.cage) {
    exportButtons([
      ['Flat pattern (DXF)', 'primary', txt(() => toDXF(hub.layers, d.name), `spark-cage-${d.kind}-${c.thick}mm.dxf`, 'application/dxf'), !ready],
      ['Flat pattern (SVG, true size)', '', txt(() => toCutSVG(hub.layers, 0), `spark-cage-${d.kind}-${c.thick}mm.svg`, 'image/svg+xml'), !ready],
      ['Folded 3D model (STL)', '', () => download(toSTL(hub.meshes.combined, d.name), `spark-cage-${d.kind}.stl`), !ready],
    ])
    const attach = d.mount === 'spoke' ? `<b>On the staff:</b> each cage goes on a spoke tip of a fire spoke hub. Use M8 stainless threaded rod as the spokes (it fits the 8 mm sockets): the rod goes through the cage floor, with a nut and washer inside and out. ` : d.mount === 'pole' ? `<b>On the staff:</b> the floor has the 4 × M4 holes on the forge's 44 mm circle: bolt it to the forge <b>End Expander</b> (inside the pole end, safe for carbon) or a <b>Clamp Collar</b>. ` : d.kind === 'diamond' ? `<b>On the rope:</b> a stainless shackle through the stitch holes at the top point, then a swivel. ` : `<b>On the rope:</b> an M8 stainless eye bolt through the top cap (nut and lock nut inside), then a swivel so the rope never twists. `
    const lock = d.kind === 'diamond' ? `<b>Opening and locking:</b> the loading seam is closed with stainless lock-wire, twisted tight with pliers and the twisted tail tucked in (aviation safety-wire style); check it before every burn. ` : `<b>Opening and locking:</b> ${d.kind === 'tube' ? 'the top cap comes off for loading; its bolts take <b>all-metal lock nuts</b>' : 'the lid has <b>two bolts</b> with <b>all-metal lock nuts</b>, so it stays shut even if one works loose'}. Never nylon-insert nuts: the nylon melts next to charcoal. `
    $('exportNote').innerHTML = attach + lock + `<b>Send the DXF</b> to a laser or waterjet shop: ${c.thick} mm ${matOf(c).name}. Layers: <b>CUT</b> outline, <b>HOLES</b> spark holes and fixings, <b>BEND</b> fold lines (not cut: ask them to fold on these, or fold it yourself in a vice, every fold 90° the same way). ${d.kind === 'diamond' ? 'Fold every BEND line to make the diamond, then stitch the open edges with 1 mm stainless wire through the small holes; leave one edge as the loading door, tied with a twist of wire.' : d.kind === 'tube' ? `${d.sides ? 'Fold the big rectangle on every BEND line into a six-sided tube' : 'Roll the big rectangle into a tube round a pipe'}, overlap the seam and rivet it; fold the cap tabs down and bolt the caps in with M4 stainless bolts (one cap comes off to load). ${d.mount === 'spoke' ? 'The spoke tip goes through the bottom cap: nut and washer inside and out.' : 'An M8 stainless eye bolt through the top cap takes the rope.'}` : 'Fold the sides up, fold the tabs in and pop-rivet them (3.2 mm stainless rivets), then fold the lid over and bolt its tab to the front with an M5 bolt. ' + (d.kind === 'box' && d.mount !== 'spoke' ? 'The floor bolts to a flange collar on the staff end.' : 'Each cube goes on a spoke tip: an 8 mm threaded spoke end through the floor hole, a nut and washer inside and out.')}`
    return
  }
  if (d.cageBall) {
    const nm = `meteor-cage-${p.ballD}mm-${c.thick}mm-${matKey(c)}`
    exportButtons([
      ['Cut file, all parts (DXF)', 'primary', txt(() => toDXF(hub.layers, d.name), nm + '.dxf', 'application/dxf'), !ready],
      ['Cut file (SVG, true size)', '', txt(() => toCutSVG(hub.layers, 0), nm + '.svg', 'image/svg+xml'), !ready],
      ['3D model (STL)', '', () => download(toSTL(hub.meshes.cageAll || hub.meshes.combined, d.name), nm + '.stl'), !ready],
      ...(hub?.meshes?.cageMount ? [['Staff mount for the lathe (STL)', '', () => download(toSTL(hub.meshes.cageMount, d.name + ' staff mount'), `${nm}-staff-mount-${p.poleOD}x${p.poleIn}.stl`), !ready]] : []),
      ['Knots and wicking 101', '', openKnotGuide],
    ])
    $('exportNote').innerHTML = `Send the DXF to a laser or waterjet shop: ${c.thick} mm ${matOf(c).name}, every part laid out in a row. Ask for the edges deburred. ${hub?.cageBall?.staff ? `The staff mount is one turned stainless part: send its STL to a lathe shop (plug Ø${(p.poleIn - 0.2).toFixed(1)} into your Ø${p.poleOD} pole, M8 tapped hole in the top, an M5 cross hole). Drill the pole to match the cross hole and bolt through with an M5 stainless bolt and all-metal lock nut. Screw an M8 stainless stud into the mount, put the cage's bottom plate on it, and lock it with a washer and two nuts inside the cage.` : 'Make two for a meteor.'}`
    return
  }
  if (d.hilt) {
    const v = hub?.hilt, nm = `hilt-connector-${p.poleOD}pole-${matKey(c)}`
    exportButtons([
      ['Hilt connector for the machine shop (STL)', 'primary', () => download(toSTL(hub.meshes.connFlat, d.name), nm + '.stl'), !ready],
      ...(v?.insertNames || []).map((n) => [`${n[0].toUpperCase() + n.slice(1)} insert (STL)${n === 'guard' ? ' × 2' : ''}`, '', () => download(toSTL(hub.meshes[`ins_${n}`], `${d.name} ${n} insert`), `${nm}-${n}-insert.stl`), !ready]),
    ])
    $('exportNote').innerHTML = `Send the STL to a machine shop, ${matOf(c).name}. Ask for the sockets reamed to size${v?.lockKind === 'grub' ? ' and the four grub screw holes tapped M5' : ''}. The inserts turn on a lathe from round bar.`
    return
  }
  if (d.tsword || d.taxe) {
    const nm = `${d.tsword ? 'fire-sword' : 'fire-axe'}-${d.id}-connector-${p.poleOD}pole-${matKey(c)}`
    exportButtons([
      ...(d.paxe ? [['Axe head cut file (DXF)', 'primary', txt(() => toDXF(hub.layers, d.name), `${d.id}-head-${c.thick}mm-${matKey(c)}.dxf`, 'application/dxf'), !ready], ['Axe head (SVG, true size)', '', txt(() => toCutSVG(hub.layers, 0), `${d.id}-head-${c.thick}mm.svg`, 'image/svg+xml'), !ready]] : []),
      ['Connector for the machine shop (STL)', d.paxe ? '' : 'primary', () => download(toSTL(hub.meshes.connFlat, d.name + ' connector'), nm + '.stl'), !ready],
      ...(d.tsword ? [['Connector sizes sheet (SVG)', '', txt(() => connectorSheetSVG(hub, p, matOf(c).name, d.name), nm + '-sheet.svg', 'image/svg+xml'), !ready]] : []),
      ...(hub?.meshes.plugFlat ? [['Pommel end plug (STL)', '', () => download(toSTL(hub.meshes.plugFlat, d.name + ' pommel plug'), nm + '-pommel-plug.stl'), !ready]] : []),
      ['Wicking and knots guide', '', openWickGuide],
    ])
    $('exportNote').innerHTML = d.tsword
      ? `Send the connector STL and the sizes sheet to a machine shop (a CNC mill, or a lathe and a mill); ${matOf(c).name}. For a practice sword print it in PETG or nylon, 100% infill. <b>Build:</b> cut the tubes to the cut list, bend the guard tubes round a former (fill them with dry sand first so they do not kink), push every tube into its socket, drill through the block's holes and bolt each one with an M5 bolt and an all-metal lock nut. Wind the Kevlar tape in a tight spiral from the bare section to the tip and over it, each turn half over the last, and tie it off with stainless wire; same on the guard arms. The pommel: glue or rivet the end plug into the pole end, screw in an M8 stud, stack the steel discs on it, and wind Kevlar round them into a tight ball, finishing with stainless wire.`
      : `Send the block STL to a machine shop, ${matOf(c).name} (or print it in PETG or nylon for a practice axe). <b>Build:</b> bend each bit from one length of tube round a former to the shape shown (fill it with dry sand first so it does not kink), push both ends into their sockets, drill through the block's holes and bolt them. Wind Kevlar tape tight round the outer edge, each turn half over the last, wire the ends. The block goes on the pole end with an M5 bolt through. Make the matched ball for the other end the same way as a sword pommel, and weigh both ends: they should match within 10 g.`
    return
  }
  if (d.dowel) {
    const v = hub?.dowel, nm = `locking-dowel-${d.lock}-${p.poleOD}pole-${matKey(c)}`
    exportButtons([
      ['Lathe drawing (SVG)', 'primary', txt(() => dowelDrawingSVG(hub, p, matOf(c).name, d.name), nm + '-lathe.svg', 'image/svg+xml'), !ready],
      ['Side profile (DXF)', '', txt(() => toDXF(hub.layers, d.name), nm + '-profile.dxf', 'application/dxf'), !ready],
      ['3D model for the machinist (STL)', '', () => download(toSTL(hub.meshes.combined, d.name), nm + '.stl'), !ready],
      ...(hub?.meshes.wedgeFlat ? [['Wedge (STL)', '', () => download(toSTL(hub.meshes.wedgeFlat, d.name + ' wedge'), nm + '-wedge.stl'), !ready]] : []),
    ])
    $('exportNote').innerHTML = `Send the lathe drawing and the STL to a machine shop: a small lathe turns it from Ø${v ? Math.ceil(v.D + 2) : ''} bar, then a drill press for the cross holes. ${matOf(c).name}, ${v ? v.g.toFixed(0) : ''} g. <b>Fitting:</b> ${v?.expand ? `push the spigot into the pole until the lip sits on the end, drop the ${v.bolt} down the middle into the wedge and tighten with a 5 mm allen key` : 'mix epoxy, coat the spigot, push it home, let it cure, then drill through the pole at the rivet hole and pop a 3.2 mm rivet through'}. ${d.lock === 'grub' ? 'Push an M5 nut into the slot in the hub collar, slide the hub on (flat face out), and screw an M5 × 10 cup-point grub screw in through the collar until it bites in the groove.' : d.lock === 'pin' ? 'Slide the hub on (flat face out), line up the holes, push an M5 bolt through and fit an all-metal lock nut (or a clevis pin and R-clip for quick changes).' : 'Slide the hub on (flat face out), put the big washer on the bolt, and tighten it all with the one allen key.'} Check it before every session.`
    return
  }
  if (d.acroMetal) {
    const a = hub?.acro, nm = `acro-end-${d.id}-${p.circ}mm-${p.poleOD}pole-${matKey(c)}`
    exportButtons([
      ['Lathe drawing (SVG)', 'primary', txt(() => acroDrawingSVG(hub, p, matOf(c).name, d.name), nm + '-lathe.svg', 'image/svg+xml'), !ready],
      ['Side profile (DXF)', '', txt(() => toDXF(hub.layers, d.name), nm + '-profile.dxf', 'application/dxf'), !ready],
      ['3D model for the machinist (STL)', '', () => download(toSTL(hub.meshes.combined, d.name), nm + '.stl'), !ready],
      ...(hub?.meshes.wedgeFlat ? [['Wedge (STL)', '', () => download(toSTL(hub.meshes.wedgeFlat, d.name + ' wedge'), nm + '-wedge.stl'), !ready]] : []),
      ...(hub?.meshes.capFlat ? [['Rubber tip cap (STL, print in TPU)', '', () => download(toSTL(hub.meshes.capFlat, d.name + ' tip cap'), nm + '-tip-cap.stl'), !ready]] : []),
    ])
    $('exportNote').innerHTML = `Send the lathe drawing and the STL to a machine shop (any small lathe can turn it from Ø${a ? Math.ceil(a.D + 3) : ''} bar). ${matOf(c).name}: ${a ? a.g.toFixed(0) : ''} g. ${d.plugIn ? `To fit it: push the spigot into the pole until the lip sits on the pole end, put the ${a?.bolt || 'M6 cap screw'} down the middle into the wedge, and turn the allen key until it is tight: the wedge pulls up and the spigot grips the inside of the pole. Press the rubber cap into the tip.` : 'To fit it: slide it on the pole and tighten the M5 grub screw. In a carbon or thin-walled pole, put a Pole Insert inside under the screw (Pole fittings) so it cannot crush the tube.'} ${a?.grooves.length ? 'Roll the O-rings into the grooves.' : ''}`
    return
  }
  if (d.sword) {
    const v = hub?.sword, nm = `fire-sword-${d.id}-${c.thick}mm-${matKey(c)}`
    exportButtons([
      ['Cut file (DXF)', 'primary', txt(() => toDXF(hub.layers, d.name), nm + '.dxf', 'application/dxf'), !ready],
      ['Cut file (SVG, true size)', '', txt(() => toCutSVG(hub.layers, 0), nm + '.svg', 'image/svg+xml'), !ready],
      ['3D model (STL)', '', () => download(toSTL(hub.meshes.combined, d.name), nm + '.stl'), !ready],
      ['Wicking and knots guide', '', openWickGuide],
    ])
    $('exportNote').innerHTML = `<b>Send the DXF</b> to a laser, waterjet or plasma shop: ${c.thick} mm ${matOf(c).name}, ${v ? v.length.toFixed(0) + ' × ' + v.width.toFixed(0) + ' mm' : ''}. Layers: <b>CUT</b> the outline${v?.rope ? ' and the rope slots' : ''}, <b>HOLES</b> wick bolts (M5), handle rivets (Ø5.2), pommel bolt (M8) and lanyard. Ask for every edge deburred and rounded: it is a contact prop. Then: ${v?.full ? (v.full.kind === 'wrap' ? `bolt the start of ${v.full.tapeM.toFixed(1)} m of ${p.wickW} mm Kevlar tape under the M5 bolt just above the bare section, wind it up the blade in a tight spiral, each turn half over the last, to the tip and back down a little, bolt the end under the top M5 bolt, and stitch it to the blade with stainless lock wire through the small holes down the middle` : `fold ${p.wickW} mm Kevlar tape over each edge (${v.full.tapeM.toFixed(1)} m in all) and bolt it through every 70 mm with M4 stainless bolts and all-metal lock nuts, heads on one side`) : v?.rope ? `lace ${(v.rope.len / 1000).toFixed(1)} m of ${p.ropeD} mm Kevlar rope over and under through the slots and wire both ends to the tie holes with stainless wire` : `wrap ${p.tapeLen} mm of ${p.wickW} mm Kevlar tape round each tab and bolt through with M5 stainless bolts and all-metal lock nuts`}; rivet wooden handle scales (or wrap it in leather or cotton tape); bolt ${v?.pomG ? `about ${Math.round(v.pomG)} g of steel washers` : 'any weight'} to the pommel on an M8 bolt.`
    return
  }
  if (d.dart) {
    const nm = `rope-dart-${d.id}-${matKey(c)}`
    exportButtons([
      ...(hub?.dart.turned ? [['Lathe drawing (SVG)', 'primary', txt(() => dartDrawingSVG(hub, p, matOf(c).name, d.name), nm + '-lathe.svg', 'image/svg+xml'), !ready],
        ['Side profile (DXF)', '', txt(() => toDXF(hub.layers, d.name), nm + '-profile.dxf', 'application/dxf'), !ready]] : []),
      ['3D model (STL)', hub?.dart.turned ? '' : 'primary', () => download(toSTL(hub.meshes.printFlat, d.name), nm + '.stl'), !ready],
    ])
    $('exportNote').innerHTML = hub?.dart.turned
      ? `A classic turned shape: a lathe shop can make it from the drawing (diameters every 10 mm) or the DXF profile. ${matOf(c).name} makes it ${hub ? hub.stats.grams.toFixed(0) : ''} g. Ask for the eye hole edges rounded so the rope does not fray.`
      : 'Not a lathe shape: send the STL to a shop with a 4-axis mill, or to a metal 3D printing service (stainless or bronze). Or print it in TPU.'
    return
  }
  if (d.spokeHub) {
    const cnc = hub?.spoke?.mode === 'cnc'
    exportButtons([
      [cnc ? '3D model for the machinist (STL)' : 'Practice hub STL', 'primary', () => download(toSTL(hub.meshes.combined, d.name), `${name}-spoke-hub.stl`), !ready],
      ...(cnc ? [
        ['Drawing for the machine shop (SVG)', '', txt(() => spokeDrawingSVG(hub, p, matOf(c).name), `${name}-drawing.svg`, 'image/svg+xml'), !ready],
        ['Top profile (DXF)', '', txt(() => toDXF(hub.layers, d.name), `${name}-profile.dxf`, 'application/dxf'), !ready],
      ] : []),
      ...(hub?.meshes.practiceFlat ? [[`Practice end STL (print ${hub.spoke.n})`, '', () => download(toSTL(hub.meshes.practiceFlat, 'practice end'), `${name}-practice-end.stl`), !ready]] : []),
      ['How to make it work ↓', '', () => $('guide').scrollIntoView({ behavior: 'smooth' })],
      ['Wicking and knots guide', '', openWickGuide],
    ])
    $('exportNote').innerHTML = cnc
      ? 'Send the STL and the drawing to a machine shop (CNC mill, or a lathe plus a drill press with a jig). Ask for the sockets on the mid-plane and the grub-screw holes tapped. Fit the spokes, tighten one grub screw per spoke onto the rod, and check every screw before each burn.'
      : 'Print the practice hub flat, 100% infill, in PETG or nylon. Push a nut into each trap, thread the grub screws in from the face, and clamp each spoke. For practice spokes use 8 mm aluminium rod with the practice ends pushed on.'
    return
  }
  const t = c.thick
  exportButtons([
    ['Cut file (DXF)', 'primary', txt(() => toDXF(hub.layers, d.name), `${name}-${t}mm.dxf`, 'application/dxf'), !ready],
    ['Cut file (SVG, true size)', '', txt(() => toCutSVG(hub.layers, hub.viewR), `${name}-${t}mm.svg`, 'image/svg+xml'), !ready],
    ['3D model (STL)', '', () => download(toSTL(hub.meshes.combined, d.name), `${name}-${t}mm.stl`), !ready],
    ...(hub?.meshes.bumperFlat ? [[`Practice bumper STL (print ${hub.stats.tabs})`, '', () => download(toSTL(hub.meshes.bumperFlat, 'practice bumper'), `${name}-bumper.stl`), !ready]] : []),
    ['Wicking and knots guide', '', openWickGuide],
  ])
  $('exportNote').innerHTML = `<b>Send the DXF</b> to any laser, waterjet, plasma or CNC cutting shop: it is in millimetres, and they quote from it. Layers: <b>CUT</b> cut through, <b>HOLES</b> cut through, <b>DRILL</b> drill after cutting${hub?.layers.pocket.length ? `, <b>POCKET</b> mill ${hub.layers.pocketDepth.toFixed(1)} mm deep from the face (the rope groove)` : ''}${hub?.layers.engrave.length ? ', <b>ENGRAVE</b> light engrave or scribe' : ''}. Ask for ${t} mm ${matOf(c).name} and deburred edges. The SVG is the same at true size: print it at 100% as a drilling template.`
}

function renderExports() {
  renderExports0()
  const d = design()
  if (!(isCnc() && !printOnly(d)) && !d.cncOnly) { lightsExports(d); infillExports(d) }
}
function renderExports0() {
  const d = design()
  const box = $('exports')
  const m = current && current.design === d ? current.hub.meshes : null
  if ((isCnc() && !printOnly(d)) || d.spokeHub) return renderCutExports(d)
  if (d.hilt) {
    const v = current?.hub.hilt, nm = `hilt-connector-${params().poleOD}pole`
    exportButtons([
      ['Hilt connector STL (print lying on its side)', 'primary', () => download(toSTL(m.connFlat, d.name), nm + '.stl'), !m],
      ...(v?.insertNames || []).map((n) => [`${n[0].toUpperCase() + n.slice(1)} insert STL${n === 'guard' ? ' (print 2)' : ''}`, '', () => download(toSTL(m[`ins_${n}`], `${d.name} ${n} insert`), `${nm}-${n}-insert.stl`), !m]),
    ])
    $('exportNote').innerHTML = 'Print the block in PETG or nylon at 100% infill, lying on its side; print the inserts standing on their collars. This printed block is for practice and LED swords: for fire, switch to CNC and have the block (and the inserts) machined in aluminium.'
    return
  }
  if (d.bubbleHub) {
    const v = current?.hub.bubbleHub, nm = `bubble-spinner-${d.id}-${params().reach}mm`
    exportButtons([
      ['Hub STL (prints flat, as shown)', 'primary', () => download(toSTL(m.combined, d.name), nm + '.stl'), !m],
      ...(m?.stopperFlat ? [['Fill stopper STL (TPU)', '', () => download(toSTL(m.stopperFlat, d.name + ' stopper'), nm + '-stopper.stl'), false]] : []),
    ])
    $('exportNote').innerHTML = `Print the hub flat as shown, PETG, 4 walls, 0.2 mm layers, no supports: the channels are small tunnels, so slow the bridges and keep the fan on. Blow through each outlet to check its channel is open (a 1.5 mm drill bit by hand clears it). Print the stopper in TPU and push a pin through its vent hole. <b>Loops:</b> wrap each loop tightly in 100% cotton yarn, turns touching, and tuck a 15 mm tail of the yarn into the outlet with a toothpick: the tail is the wick that feeds the loop. ${v?.feed === 'tank' ? 'Fill the tank through the port with a syringe or squeeze bottle, about three quarters full, and push the stopper in.' : `Push the O-rings into ${v?.feed === 'socket' ? 'the socket grooves' : 'the spigot grooves'}, grease them, pour bubble mix into the pole (a third full), and push the hub on. The port in the end tops it up.`} Store it loops up: at rest some mix can drip from the outlets. Thick mix (glycerine or guar) needs bigger outlets.`
    return
  }
  if (d.fist) {
    const p = params(), f = current?.hub.fist
    exportButtons([
      ...(m?.coreFlat ? [['Core STL (pause and fill with shot)', 'primary', () => download(toSTL(m.coreFlat, d.name + ' core'), `fist-core-${d.use}-${p.coreD}mm.stl`), false]] : []),
      ['Knots and wicking 101', m?.coreFlat ? '' : 'primary', openKnotGuide],
    ])
    $('exportNote').innerHTML = f?.coreKind === 'printed' ? `Print the core in PETG or TPU, 100% infill, standing on its flat. Pause at ${f.pauseAt.toFixed(1)} mm, pour in ${f.shotG.toFixed(0)} g of steel shot, tap it level, carry on. Then tie the knot round it. Never light a printed core on its own: the Kevlar must cover it completely.` : 'Nothing to print: buy the core, cut the rope to the length shown and tie the knot. The guide has the steps.'
    return
  }
  if (d.acro) {
    const p = params(), a = current?.hub.acro
    exportButtons([
      ['STL (print standing on its mouth)', 'primary', () => download(toSTL(m.combined, d.name), `acro-end-${d.id}-${p.circ}mm-${p.poleOD}pole.stl`), !m],
      ['Fit-test ring', '', async () => download(toSTL(await work('fit', { params: { ...params(), fit: p.fit } }), 'fit test'), `fit-test-${p.poleOD}pole-${p.fit}.stl`)],
    ])
    $('exportNote').innerHTML = `Print in TPU 95A, 100% infill (or 6 walls and 40% gyroid if you want it lighter), 0.2 mm layers, standing on its open end as it comes. ${a?.coin?.pauseAt ? `Add a <b>pause at ${a.coin.pauseAt.toFixed(1)} mm</b> in your slicer and drop the coins in flat. ` : ''}${a?.shot ? `Add a <b>pause at ${a.shot.pauseAt.toFixed(1)} mm</b> and pour in ${a.shot.g.toFixed(0)} g of steel shot, tap it level, then carry on. ` : ''}Print two and weigh them: match them within 5 g.`
    return
  }
  if (d.bubblePoi) {
    const p = params(), v = current?.hub.bubblePoi
    const nm = `bubble-poi-${d.id}-${p.smallD}-${p.bigD}mm${(p.film || '').startsWith('string') ? '-string' : ''}`
    // one STL per different piece, each with how many to print
    exportButtons((v?.pieces || []).map((pc, i) => [`${pc.label}${pc.n > 1 ? ` (print ${pc.n})` : ''}`, 'primary', () => download(toSTL(m[pc.key], `${d.name} ${pc.label}`), `${nm}-${i + 1}-${pc.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}.stl`), !m?.[pc.key]]))
    $('exportNote').innerHTML = `Print every piece lying flat, PETG, 100% infill, 0.2 mm layers. Link the circles top to bottom with small swivels (or split rings) through the eyes, ${v?.crossSmall ? 'slot a small crossing ring through each small circle (the slots meet half way), ' : ''}${v?.crossed ? 'slot the crossing ring through the big ring, ' : ''}and clip the leash swivel to the top eye. ${(p.film || '').startsWith('string') ? 'Wrap each circle in 100% cotton yarn, tight turns about 3 mm apart, tied off on the wire.' : 'Dip in a tray of mix, lift out slowly, and spin.'} Make two.`
    return
  }
  if (d.joint) {
    const p = params(), v = current?.design === d ? current.hub.hoop : null, j = v?.joint
    exportButtons([
      [`Connector STL (print ${p.sections})`, 'primary', () => download(toSTL(m.connFlat, d.name + ' connector'), `hoop-joint-${d.joint}-${(v?.id || 0).toFixed(1)}mm-bore.stl`), !m?.connFlat],
      ['Drill guide STL', '', () => download(toSTL(m.guideFlat, d.name + ' drill guide'), `hoop-drill-guide-${v ? v.tube.od.toFixed(1) : ''}mm.stl`), !m?.guideFlat],
      ['Hoop making guide', '', openHoopGuide],
    ])
    $('exportNote').innerHTML = `Print the connectors lying flat as they come, PETG or nylon, 100% infill, and the drill guide in anything. Cut the tube into ${p.sections} pieces of ${j ? (j.seg / 25.4).toFixed(2) + '"' : 'equal length'}. The steps are under the 3D view.`
    return
  }
  if (d.hoop) {
    const p = params(), v = current?.design === d ? current.hub.hoop : null
    exportButtons([
      ['Connector STL', 'primary', () => download(toSTL(m.connFlat, d.name + ' connector'), `hoop-connector-${p.hoopIn}in-${(v?.id || 0).toFixed(1)}mm-bore.stl`), !m?.connFlat],
      ['Hoop making guide', '', openHoopGuide],
    ])
    $('exportNote').innerHTML = `Print the connector lying flat as it comes, PETG or nylon, 4 walls, 100% infill. Cut the tube to ${v ? (v.L / 25.4).toFixed(2) + '"' : 'the length shown'}, square and clean. Dip both ends in very hot water for a minute, push them onto the connector until they meet at the notch, and fix each side with a small screw or rivet. The guide has every step.`
    return
  }
  if (d.mould) {
    const p = params(), v = current?.design === d ? current.hub.mould : null
    const nm = `mould-${d.id}-${d.kind === 'ball' ? p.ballD : d.kind === 'acro' ? p.circ + 'round' : p.maxD}mm`
    const st = (key, label, file, prim = 'primary') => [label, prim, () => download(toSTL(m[key], d.name + ' ' + file), `${nm}-${file}.stl`), !m?.[key]]
    exportButtons(v?.box ? [
      st('masterAFlat', 'Master, half 1 STL', 'master-1'),
      st('masterBFlat', 'Master, half 2 STL', 'master-2'),
      st('boardFlat', 'Parting board STL', 'board'),
      st('frameFlat', 'Box frame STL (print 2)', 'frame'),
      ...(m?.pinFlat ? [st('pinFlat', 'Core pin STL', 'core-pin')] : []),
      ['Mould making guide', '', openMouldGuide],
    ] : [
      st('halfAFlat', 'Mould half A STL', 'half-A'),
      st('halfBFlat', 'Mould half B STL', 'half-B'),
      ...(m?.pinFlat ? [st('pinFlat', 'Core pin STL', 'core-pin')] : []),
      st('castFlat', 'The cast part STL (to check it)', 'cast', ''),
      ['Mould making guide', '', openMouldGuide],
    ])
    $('exportNote').innerHTML = v?.box
      ? 'Print the master halves split face down, 0.12 mm layers, and glue them with two short pieces of filament in the holes; sand and seal the master smooth (every layer line shows in the rubber). The sprue, runner and vents print as part of the master: they make the channels in the rubber. Print the board and both frames flat, PLA or PETG. Release between the two pours or the halves bond into one. The guide takes you through both pours step by step.'
      : 'Print both halves split face up as they come, PLA or PETG, <b>0.12 mm layers, 5 walls, 30% infill</b> (thin walls let rubber seep into the infill), no supports. Seal the cavity with two thin coats of brushing epoxy, dry a day, and test a spoonful of rubber on a scrap first. Release on everything the rubber touches, pin included. Bolt it shut with the ridge seated in its groove, pour in one thin, steady stream into the funnel until rubber shows at every vent, top up after 5 minutes, and wait the full cure. Trim the gate and vents flush. The guide has every step.'
    return
  }
  if (d.dart) {
    const p = params()
    exportButtons([
      ['STL (print eye-down)', 'primary', () => download(toSTL(m.printFlat, d.name), `${d.poi ? 'poi' : 'rope-dart'}-${d.id}-${d.poi ? p.maxD : p.length}mm.stl`), !m?.printFlat],
      ...(m?.plugFlat ? [['Capsule plug STL', '', () => download(toSTL(m.plugFlat, d.name + ' plug'), `${d.poi ? 'poi' : 'rope-dart'}-${d.id}-plug.stl`), false]] : []),
    ])
    $('exportNote').innerHTML = d.poi ? 'Print it standing on its eye as it comes, TPU 95A, 100% infill for weight, with a brim. Print two and weigh them: within 5 g. Clip a ball-bearing swivel through the eye and on to your leash. Want them soft and heavier? Try the Poi moulds.' : 'Print it standing on its eye as it comes, TPU 95A for practice (it will hit you), 100% infill for weight, with a brim. Thread the rope through the eye and tie it off with a stopper knot or a figure-eight loop. Want it heavier or for fire practice in metal? Switch to CNC: the classic shapes come with a lathe drawing.'
    return
  }
  if (d.novelty) {
    const p = params()
    exportButtons([
      ['STL', 'primary', () => download(toSTL(m.combined, d.name), `contact-end-${d.kind}-${p.poleOD}pole.stl`), !m],
      ...(m?.counterFlat ? [[current?.hub.novelty?.counter?.ball ? 'Ball STL (other end)' : 'Counterweight STL (other end)', 'primary', () => download(toSTL(m.counterFlat, d.name + ' counterweight'), `counterweight-${d.kind}-${p.poleOD}pole.stl`), false]] : []),
      ['Fit-test ring', '', async () => download(toSTL(await work('fit', { params: params() }), 'fit test'), `fit-test-${params().poleOD}pole-${params().fit}clear.stl`)],
    ])
    $('exportNote').innerHTML = 'Print it standing on its socket as shown, TPU 95A, 3+ walls; 100% infill for the most weight (or 20–40% gyroid for a lighter end). Print the fit-test ring first. Push it onto the staff end; the crush ribs grip it.'
    return
  }
  if (d.grip) {
    const p = params(), nm = `pole-${d.kind}-${p.poleOD}x${(p.poleOD - 2 * p.poleWall).toFixed(1)}`
    exportButtons([
      [current?.hub.grip?.halves ? 'Half A STL (stub)' : d.kind === 'expander' ? 'Expander STL (cap down)' : d.kind === 'joiner' ? 'Joiner STL' : 'Clamp Collar STL', 'primary', () => download(toSTL(m.mainFlat, d.name), nm + (current?.hub.grip?.halves ? '-A.stl' : '.stl')), !m?.mainFlat],
      ...(m?.wedgeFlat ? [[current?.hub.grip?.halves ? 'Half B STL (collar)' : 'Wedge STL', 'primary', () => download(toSTL(m.wedgeFlat, d.name + (current.hub.grip.halves ? ' B' : ' wedge')), nm + (current.hub.grip.halves ? '-B.stl' : '-wedge.stl')), false]] : []),
      ...(d.kind === 'clamp' ? [['Pole Insert ↗', '', () => goDesign('sleeveSolid')]] : []),
      ['Pole grip guide', '', openGripGuide],
    ])
    $('exportNote').innerHTML = 'Print in PETG or nylon (PA), 100% infill, 4+ walls, flat as they come. The STL also works for a machinist if you want it in aluminium (best next to fire). The guide explains every step, what to buy, and how tight is tight.'
    return
  }
  if (d.sleeve || d.practiceSpoke) {
    const p = params(), nm = d.sleeve ? `pole-insert-${d.id}-${p.poleOD}x${p.poleWall}-${p.length}mm` : `practice-spoke-${d.id}-${p.rodD}mm`
    exportButtons(d.sleeve
      ? [['Pole insert STL', 'primary', () => download(toSTL(m.combined, d.name), nm + '.stl'), !m]]
      : [['Spoke STL (PETG / nylon)', 'primary', () => download(toSTL(m.spokeFlat, d.name), nm + '-spoke.stl'), !m?.spokeFlat],
         ['Head STL (TPU)', 'primary', () => download(toSTL(m.practiceFlat, d.name + ' head'), nm + '-head.stl'), !m?.practiceFlat],
         ['Spoke hubs ↗', '', () => goDesign('spokeRound')]])
    $('exportNote').innerHTML = d.sleeve
      ? 'Print it standing up, 100% infill, PETG or nylon. Measure the inside of your pole first. Tie a string through the end hole, push the insert into the pole and pull it to where the hub will sit; the hub screws then press on the insert, not the bare tube. One per hub.'
      : 'Print the spoke lying on its flat (as shown), PETG or nylon, 4+ walls; print the head standing up in TPU 95A. Push the head onto the peg. Slide the shank into a hub socket with the flat towards the clamp screw, and tighten the screw onto the flat. Print one per socket and weigh them: all within 2 g.'
    return
  }
  if (d.ballEnd) {
    const ready = m?.lowerFlat, p = params(), nm = `contact-ball-${d.id}-${p.ballD}mm-${p.poleOD}pole`
    exportButtons([
      ['Lower half STL (socket)', 'primary', () => download(toSTL(m.lowerFlat, d.name + ' lower'), nm + '-lower.stl'), !ready],
      ['Upper half STL', 'primary', () => download(toSTL(m.upperFlat, d.name + ' upper'), nm + '-upper.stl'), !ready],
      ['Joiner ring STL', '', () => download(toSTL(m.joinerFlat, d.name + ' joiner'), nm + '-joiner.stl'), !ready],
      ...(m?.lidFlat ? [['Light lid with cradle STL', 'primary', () => download(toSTL(m.lidFlat, d.name + ' light lid'), nm + '-light-lid.stl'), false]] : []),
      ['Fit-test ring', '', async () => download(toSTL(await work('fit', { params: params() }), 'fit test'), `fit-test-${params().poleOD}pole-${params().fit}clear.stl`)],
    ])
    $('exportNote').innerHTML = 'Print all three flat as they come, no supports, TPU 95A, 3+ walls. Print the fit-test ring first and push it on your pole. Press the joiner ring into the lower half, pour in any sand or steel shot, then press the upper half on. A drop of TPU-safe glue (or a hot soldering iron run round the seam) makes it permanent. Push the ball onto the staff end; the ribs grip it.'
    if (m?.lidFlat) $('exportNote').insertAdjacentHTML('beforeend', ` <b>Light inside:</b> print the halves and lid in clear or natural TPU and leave the ball hollow. Print the lid domed side down with a brim and supports touching the bed only. Push the ${current?.hub.ball?.light?.kind === 'capsule' ? 'capsule' : 'light'} up into the cradle, switch it on, and press the lid into the top of the ball until the snap ring clicks; lift it out by the notch.`)
    return
  }
  if (d.adaptor) {
    const p = params()
    box.innerHTML = ''
    const b = document.createElement('button')
    b.className = 'btn primary'
    b.textContent = 'Adaptor STL'
    b.disabled = !m
    b.onclick = () => download(toSTL(m.combined, d.name), `adaptor-${p.style}-${p.small}to${p.big}mm.stl`)
    box.append(b)
    $('exportNote').innerHTML = 'Print it lip-down as shown, 100% infill (it is small, so this costs little). It is also its own fit test: push it on the pole first. Then push the hub on until its collar meets the lip. Print one per hub, per pole size.'
    return
  }
  const base = () => `hub-${d.id}-${params().diameter}mm`
  const two = m?.glow
  const bName = d.pods ? 'lanterns' : 'shapes'
  const list = []
  if (two || !m) list.push(['Two-colour 3MF', 'primary', () => download(to3MF([['frame (colour A)', m.frame], [`${bName} (colour B)`, m.glow]], d.name), base() + '-2colour.3mf', 'model/3mf')])
  list.push(['One-colour STL', two ? '' : 'primary', () => download(toSTL(m.combined, d.name), base() + '.stl')])
  if (two) {
    list.push(['Colour A STL (frame)', '', () => download(toSTL(m.frame, d.name + ' frame'), base() + '-A-frame.stl')])
    list.push([`Colour B STL (${bName})`, '', () => download(toSTL(m.glow, d.name + ' ' + bName), base() + `-B-${bName}.stl`)])
  }
  if (d.pods) {
    if (m?.lidsFlat) list.push(['Lids STL (clear)', '', () => download(toSTL(m.lidsFlat, d.name + ' lids'), base() + '-lids.stl')])
    list.push(['Capsule test cup', '', async () => download(toSTL(await work('captest', { params: params() }), 'capsule test'), `capsule-test-${params().capD}x${params().capL}.stl`)])
  }
  if (m?.snapLight) for (const w of ['light', 'medium', 'heavy']) {
    const key = 'snap' + w[0].toUpperCase() + w.slice(1)
    list.push([`Snap weight: ${w} (${current.hub.snap.grams[w].toFixed(0)} g)`, '', () => download(toSTL(m[key], `snap weight ${w}`), base() + `-snap-${w}.stl`)])
  }
  if (m?.snapLed) {
    list.push([`LED weight ring (${current.hub.snap.led.tpuG.toFixed(0)} g TPU)`, '', () => download(toSTL(m.snapLed, 'LED snap weight'), base() + `-snap-led-pause-${current.hub.snap.led.pauseAt.toFixed(1)}mm.stl`)])
    list.push(['LED pod lids (2)', '', () => download(toSTL(m.snapLedLids, 'LED pod lids'), base() + '-snap-led-lids.stl')])
    list.push(['LED ring build plan', '', () => openLedPlan()])
  }
  if (m?.ringFlat) list.push(['Bubble weight ring STL', '', () => download(toSTL(m.ringFlat, 'bubble weight ring'), base() + '-weight-ring.stl')])
  list.push(['Fit-test ring', '', async () => download(toSTL(await work('fit', { params: params() }), 'fit test'), `fit-test-${params().poleOD}pole-${params().fit}clear.stl`)])
  list.push(['Flat SVG', '', () => download(toSVG([...current.hub.polygons.base], params().diameter), base() + '.svg', 'image/svg+xml')])
  box.innerHTML = ''
  for (const [label, cls, fn] of list) {
    const b = document.createElement('button')
    b.className = 'btn ' + cls
    b.textContent = label
    b.disabled = !m
    b.onclick = fn
    box.append(b)
  }
  const swapAt = current?.hub.colourChangeAt
  $('exportNote').innerHTML = (two
    ? `<b>Two colours.</b> Open the 3MF in Bambu Studio or PrusaSlicer: it loads as one object with two parts; give the frame colour A and the ${bName} colour B. Needs a printer that can feed both (TPU will not go through most AMS units). <b>Bambu H2D:</b> load one colour in each nozzle, TPU fed from the external spools; it switches nozzles instead of swapping filament, so there is no manual stop and very little purge. Keep the hub within the two-nozzle area (300 mm wide). <b>One nozzle instead:</b> print the one-colour STL and add a filament change at <b>${swapAt} mm</b>; everything above that comes out in colour B${d.pods ? ', though the lower walls of the lanterns stay colour A' : ''}. `
    : 'This design is all one level, so it prints in one colour. ') +
    (d.pods ? 'Print the capsule test cup and the fit-test ring first; they take minutes, the hub takes hours.' : 'Print the 12 mm fit-test ring first and push it onto the real staff. It takes 10 minutes, the hub takes hours.')
}

// Step-by-step for the spoke hubs: what to buy, how to get it made, how to put it together
function spokeHowTo(d, cnc) {
  const p = params(), ek = endsKeyOf(p.ends), g = p.grub, n = p.spokes
  const fire = ek === 'store' || ek === 'fist'
  const buy = [
    `${n} fire spokes with an ${p.rodD} mm rod, about ${p.spokeLen} mm long (the common 2" dragon fire spoke), or ${p.rodD} mm rod to make your own`,
    `${n * ((p.screwsV === 'none' ? 0 : (p.screwsV || '').includes('bottom') ? 2 : 1) + (p.screwsH === 'both sides' ? 2 : p.screwsH === 'one side' ? 1 : 0)) + ((p.poleGrip || '').startsWith('grub') ? 2 : 0)} × ${g} stainless grub screws, cup point, ${Math.round(p.hubT / 2)} mm long, and the hex key for them`,
    `a staff that is Ø${p.poleOD} mm (two hubs for a dragon staff: one each end, or both near the middle)`,
    ...(ek === 'tpu' || ek === 'led' ? [`practice spokes: print them (the Practice spokes designs) or use ${p.rodD} mm aluminium rod, ${n} pieces ${p.spokeLen - 30} mm long`] : []),
    (p.poleGrip || '').startsWith('inside') ? 'one M6 × 40 bolt per hub for the expanding spigot (it grips the inside of the pole end: safe for carbon)' : 'a carbon or hollow pole? a Pole Insert under each hub, so the clamp cannot crush it',
    ...(ek === 'fist' ? ['10 mm braided Kevlar rope (about 1.2 m per monkey fist) and a steel ball or rod core'] : []),
  ]
  const make = cnc ? [
    'Download the <b>3D model (STL)</b> and the <b>drawing</b> below.',
    'Send both to a machine shop or a CNC service and ask for a quote in aluminium 6061 (or stainless for heavy fire use). Say: “sockets on the mid-plane, grub-screw holes tapped ' + g + '”.',
    'When it arrives, run each spoke into its socket to check the fit before anything else.',
  ] : [
    'Download the <b>Practice hub STL</b>. Print it flat, 100% infill, in PETG or nylon (TPU is too soft).',
    `Push an ${g} nut into each hexagon trap on the face (tap it in with a hot soldering iron if it is tight).`,
    'A printed hub is for practice only: never light spokes in it.',
  ]
  const fit = [
    `Slide the hub onto the staff and tighten the two pole grub screws.`,
    `Push each spoke in until it stops, then tighten its grub screws onto the rod (the top one first, then the sides). Snug, not crushing.`,
    ...(ek === 'tpu' ? ['Print the practice ends (download below), push one onto each rod end, and weigh them: all within 2 g.'] : []),
    ...(ek === 'led' ? ['Print the LED ends, push one onto each rod, switch the capsules on and push them in.'] : []),
    ...(ek === 'fist' ? ['Tie a monkey fist in Kevlar round a steel core on each rod end (see the wicking and knots guide), and lock it with stainless wire.'] : []),
    'Spin it gently first. If it wobbles, a spoke is not fully in or one end is heavier.',
    ...(fire ? ['Before every burn: check every grub screw and wick, dip, spin off the fuel away from people, safety person with a damp towel ready.'] : []),
  ]
  const ol = (list) => `<ol>${list.map((x) => `<li>${x}</li>`).join('')}</ol>`
  return `<div class="howto"><h2>How to make it work</h2>
    <h3>1. What you need</h3>${ol(buy)}
    <h3>2. ${cnc ? 'Get the hub made' : 'Print the practice hub'}</h3>${ol(make)}
    <h3>3. Put it together</h3>${ol(fit)}
    <p><a href="#" class="wickLink">Wicking and knots guide</a> · fire spokes can be re-wicked with Kevlar tape, or given rope heads.</p></div>`
}
const endsKeyOf = (label) => Object.keys(SPOKE_ENDS).find((k) => SPOKE_ENDS[k] === label) || 'store'

function renderCutGuide() {
  if (design().sword) {
    $('guide').innerHTML = `<h2>Fire contact sword</h2><ol>
      <li><b>Cut</b> from the DXF in ${matOf(cncp()).name}. Ask for every edge deburred and rounded over: it rolls on your body.</li>
      <li><b>Wicks:</b> 100% Kevlar only. ${(params().wicks || '').startsWith('Kevlar wrapped') ? 'Bolt the start of the tape under the lower M5 bolt, wind it up the whole blade in a tight spiral, each turn half over the last, over the tip and back, bolt the end under the top bolt and stitch it down with stainless lock wire through the small holes. ' : (params().wicks || '').startsWith('Kevlar along') ? 'Fold the tape over each edge, the full length, and bolt through every hole with M4 stainless bolts and all-metal lock nuts. ' : ''}Wrap the tape tight round each tab, the end tucked under, and bolt through both holes with M5 stainless bolts, big washers and all-metal lock nuts. Never nylon-insert nuts or paracord: nylon melts.</li>
      <li><b>Rope blade:</b> lace the Kevlar rope over and under through the slots, pull it snug, and wire each end through its tie hole with stainless wire.</li>
      <li><b>Handle:</b> rivet on two wooden scales, or wrap it in leather or cotton tape. It must stay cool and dry: no plastic grips near the flame.</li>
      <li><b>Balance:</b> bolt the pommel weight on (steel washers on an M8 bolt) until it balances where the forge says, a hand in front of the guard.</li>
      <li><b>Fuel:</b> soak the wicks, then spin off the excess away from people and fire before lighting. A safety person with a fire blanket and a wet towel, every time.</li>
      <li><b>Before every burn:</b> check every bolt and lock nut, the rope ties, and the blade for cracks at the tabs and the guard.</li></ol>
      <p><a href="#" class="wickLink">Wicking and knots guide</a></p>`
    for (const l of document.querySelectorAll('.wickLink')) l.onclick = (e) => { e.preventDefault(); openWickGuide() }
    return
  }
  const d = design(), c = cncp(), m = matOf(c), proc = PROCESSES[procKey(c)]
  if (d.cage) {
    $('guide').innerHTML = `<h2>Spark cages: safely</h2><ul>
      <li><b>Steel only.</b> Stainless 304 is best; mild steel works but rusts. Never aluminium: burning charcoal is hotter than aluminium melts.</li>
      <li><b>Charcoal:</b> crushed shisha (hookah) charcoal throws the best sparks and burns steady. Fill the cage about two-thirds, close it, light it with the cage on a fireproof stand, and let it glow evenly before you spin.</li>
      <li><b>Sparks fall everywhere,</b> not just outwards. Fireproof hood or balaclava, goggles, natural-fibre clothes, closed shoes. Clear a wide space, no dry grass, a safety person with a fire blanket and water.</li>
      <li><b>Heat travels:</b> keep the cage off the staff's grip area and let everything cool before touching. Check rivets, bolts and wire stitching before every burn; replace any that have burnt thin.</li>
      <li><b>Empty the ash</b> into a metal bucket of water, never onto the ground.</li></ul>`
    return
  }
  if (d.dart) {
    $('guide').innerHTML = `<h2>Making the rope dart head</h2><ul>
      <li><b>${m.name}:</b> ${m.note}</li>
      <li><b>Turned shapes</b> (Classic, Meteor Bell, Willow Leaf, Glow Drop): any lathe shop can make them from the drawing. Brass and stainless are the classic, heavy choice; aluminium is lighter for learning.</li>
      <li><b>Faceted and twisted shapes</b> need a 4-axis mill or metal 3D printing (stainless or bronze), or print them in TPU.</li>
      <li><b>The rope:</b> round the eye's edges so the rope cannot fray; thread it and tie a figure-eight loop or a stopper knot. Check the rope at the eye before every session.</li>
      <li><b>Fire:</b> a fire rope dart has a Kevlar wick head, not a metal dart: see the monkey's fist in the <a href="#" class="wickLink">wicking and knots guide</a>.</li></ul>`
    for (const l of document.querySelectorAll('.wickLink')) l.onclick = (e) => { e.preventDefault(); openWickGuide() }
    return
  }
  const metal = m.kind === 'metal'
  $('guide').innerHTML = `<h2>${d.spokeHub ? 'Making the spoke hub' : 'Cutting it'}</h2>
    <ul>
      <li><b>${m.name}:</b> ${m.note}</li>
      ${d.spokeHub ? '' : `<li><b>${proc.name}:</b> ${proc.note}</li>`}
      ${d.spokeHub ? '' : (c.mount || '').startsWith('End') ? `<li><b>On the pole:</b> print the <b>End Expander</b> (Pole fittings) for your pole; it grips the inside of the pole end and the plate bolts to it with 4 × M4 on the ${c.flangePCD} mm circle. Nothing squeezes the carbon. <a href="#" class="gripLink">Pole grip guide</a>.</li>` : `<li><b>On the pole:</b> a flat plate needs a collar to stay square. Print the forge <b>Clamp Collar</b> (or bolt on a bought flange shaft collar) and set its bolt circle under Cut. On a carbon pole, always put a <b>Pole Insert</b> inside under it. <a href="#" class="gripLink">Pole grip guide</a>.</li>`}
      ${metal ? `<li><b>Fire:</b> only 100% Kevlar tape, rope and thread, and bare stainless bolts and wire, near the flame. Never nylon paracord, cotton or polyester: nylon melts and drips. Check every bolt, screw and lacing before each burn. Step-by-step wicking, and knots taken from paracord work (monkey's fist, Turk's head, cobra) tied in Kevlar: <a href="#" id="wickLink">wicking and knots guide</a>.</li>
      <li><b>Balance:</b> wrap every wick with the same length of tape, and weigh them. A heavy wick makes the staff wobble.</li>` : `<li><b>No fire, ever:</b> ${m.name} burns or melts. This is a practice hub: drop it on grass or mats.</li>`}
      <li><b>Practice ends</b> weigh about the same as a fuelled wick, so what you learn with them carries over to fire.</li>
    </ul>`
  if (d.spokeHub) $('guide').innerHTML = spokeHowTo(d, true) + $('guide').innerHTML
  for (const l of document.querySelectorAll('#wickLink, .wickLink')) l.onclick = (e) => { e.preventDefault(); openWickGuide() }
  for (const l of document.querySelectorAll('.gripLink')) l.onclick = (e) => { e.preventDefault(); openGripGuide() }
}

function renderGuide() {
  const dg = design()
  if (isCnc() && !printOnly(dg) && !dg.dowel && !dg.acro && !dg.tsword && !dg.taxe) return renderCutGuide()
  if (dg.tsword || dg.taxe) {
    $('guide').innerHTML = `<h2>${dg.tsword ? 'Building a tube fire sword' : 'Building a tube fire axe'}</h2><ol>
      <li><b>Buy:</b> ${dg.tsword ? 'aluminium tube for the blade and the guard (or stainless for the toughest)' : 'aluminium tube for the bits and the spike'}, 50 mm (2") Kevlar wick tape, Kevlar thread or stainless lock wire for tying off, M5 stainless bolts with all-metal lock nuts, an M8 stud and steel washers for the ${dg.tsword ? 'pommel' : 'counterweight ball'}. Never nylon-insert nuts, cotton or paracord near the flame.</li>
      <li><b>The block:</b> have it machined from the STL (and the sizes sheet), or print it in PETG or nylon for a practice prop that never sees fire.</li>
      <li><b>Bending:</b> fill the tube with dry sand, cap both ends, and bend it slowly round a former (a wheel, a pipe, a piece of plywood cut to the curve). Heating the sand first (in an old pan, about 150 °C) and bending while warm makes aluminium tube easier still. Pour the sand out after.</li>
      <li><b>Fitting:</b> push each tube home in its socket, drill through the block's hole and through the tube, and bolt it. Every socket bolted: nothing can fly off.</li>
      <li><b>Wicking:</b> start the tape at the end of the bare section with a few turns of wire, wind it in a tight spiral, each turn half over the last, over the tip and back, and wire it off. Tight wicks burn longer and do not unravel.</li>
      <li><b>Balance:</b> ${dg.tsword ? 'stack the steel discs on the pommel stud, check the balance point on one finger, add or take off a disc, then wind the Kevlar ball round them' : 'make the matched ball for the other end of the staff and weigh both ends: within 10 g'}.</li>
      <li><b>Fire:</b> soak, spin off the extra fuel well away from the flame, light, and keep a fire blanket and a safety person by you. Check every bolt before each burn.</li></ol>`
    return
  }
  if (design().dowel) {
    $('guide').innerHTML = `<h2>Locking dowels</h2><ul>
      <li><b>What it is:</b> a short metal dowel for the pole end. The spigot goes inside the pole, the lip sits on the pole end, and the stub that sticks out is the same size as the pole, so a hub slides onto it like onto the pole.</li>
      <li><b>Why:</b> a push-on hub holds by grip alone. Locked to a dowel it cannot fly off however hard it is thrown, dropped or wrapped.</li>
      <li><b>The hub:</b> open the hub you want, tick <b>Lock onto a metal dowel</b> under its settings, pick the same lock, and it tells you the two numbers to set here (Stub and Lock from the flange). Off by default: every hub stays a normal push-on hub unless you choose this.</li>
      <li><b>Three locks:</b> grub screw (quick, adjustable, any angle), cross pin (the most positive, an M5 bolt or a clevis pin), end bolt (one allen key does the dowel and the hub at once).</li>
      <li><b>Carbon poles:</b> the expanding spigot presses evenly on the inside of the tube and the lip holds the end from outside: nothing crushes it. Do not overtighten: firm with the short end of the key.</li></ul>`
    return
  }
  if (design().acro) {
    $('guide').innerHTML = `<h2>Acro staff ends</h2><ul>
      <li><b>Why the coin:</b> the end of a pole is a thin ring, and it cuts into soft TPU or rubber a little more with every drop. A coin or steel washer at the bottom of the socket, at least as wide as the pole, takes that ring instead and spreads the hit over the whole end. A plug inside the pole keeps the end centred and the tube round, but the coin is what stops the cutting.</li>
      <li><b>Coin size:</b> measure it with calipers and set Coin width and thickness. If it is no more than about 2 mm wider than the socket, push it down the socket after printing; wider coins drop in at the pause and are locked in for good.</li>
      <li><b>Weight:</b> the chamber is sized to the steel shot you ask for, so it packs full and cannot rattle. Pause where the forge says, pour, tap level, carry on. Coins add weight right at the very end too.</li>
      <li><b>Balance:</b> both ends must weigh the same. Weigh them on kitchen scales; add a coin or a little shot to the light one.</li>
      <li><b>Shape:</b> round tips roll; a flat on the tip (Balance Foot) stands on a hand or the floor; faces stop it rolling away when you put the staff down. Circumference is what your hand feels: 150–190 mm suits most people.</li>
      <li><b>Fit:</b> print the fit-test ring first. It should push on firmly by hand and not twist.</li></ul>`
    return
  }
  if (design().bubblePoi) {
    $('guide').innerHTML = `<h2>Bubble poi</h2><ul>
      <li><b>Mix:</b> 1 litre of water, about 150 ml of plain washing-up liquid, 1 tablespoon of glycerine (or 2 of sugar). Stir gently, no froth. Left overnight it makes bigger, stronger bubbles.</li>
      <li><b>Dip</b> in a wide tray so every loop goes under. Lift slowly so the film forms, then spin. Slow spins make big bubbles; fast spins make clouds of small ones.</li>
      <li><b>String loops:</b> 100% cotton yarn, wound tight about 3 mm apart, both ends tied through the tie holes. Rinse in fresh water after use and let it dry, or it goes mouldy.</li>
      <li><b>Linking:</b> the small eye under the big circle takes a small swivel: chain a second head, a weight or a ribbon tail below for more spin and more bubbles.</li>
      <li>Outside, away from faces: the mix stings eyes.</li></ul>`
    return
  }
  if (design().joint) {
    const p = params(), j = current?.hub?.hoop?.joint, st = design().joint
    $('guide').innerHTML = `<h2>Making a collapsible hoop</h2>
      <p><b>Materials:</b> hoop tubing (polypro 5/8" or 3/4" for travel hoops; HDPE is heavier and kinks less when coiled); ${st === 'button' || st === 'double' ? `stainless V-spring push buttons with a ${p.btnD} mm button (sold for collapsible hoops and tent poles: the small ones for 5/8" tubing, the bigger for 3/4")` : st === 'clip' ? '3 mm stainless clevis pins with R-clips, or hairpin (cotter) clips' : 'nothing metal: the button is printed'}; 3.2 mm aluminium pop rivets and a rivet gun${st === 'double' ? ' (not needed for this one)' : ''}; PETG or nylon filament for the connectors; a pipe cutter, a drill with ${st === 'clip' ? '3.2' : p.btnD} mm and 3.3 mm bits, and some fine sandpaper. Optional: hoop tape, grip tape.</p><ol>
      <li><b>Cut</b> the tube into ${p.sections} equal pieces of ${j ? (j.seg / 25.4).toFixed(2) + '" (' + (j.seg / 10).toFixed(1) + ' cm)' : 'the length shown'}, square, and sand off the burr inside and out.</li>
      <li><b>Print</b> ${p.sections} connectors and the drill guide.</li>
      ${st === 'double' ? '' : `<li><b>Fix one half:</b> soften a tube end in just-boiled water for a minute, push the barbed half of a connector in up to the centre ring, slide the drill guide over (lip against the tube end) and drill the 3.3 mm hole through its rivet guide, into the connector. Pop a rivet in. Do the same at one end of every section.</li>`}
      <li><b>Mark the button:</b> push the next section onto the connector up to the ring, slide the drill guide over its end and drill through the ${st === 'clip' ? '3.2 mm' : 'button'} guide hole, through the tube and the connector wall${st === 'flex' ? ' (just the tube: the connector already has its button)' : ''}. Keep every hole on the inside of the hoop.</li>
      ${st === 'button' || st === 'double' ? '<li><b>Fit the button:</b> squeeze the V-spring, slide it into the open end of the connector core, and let the button pop out of its hole. Push the tube on; the button clicks out through the tube.</li>' : st === 'clip' ? '<li><b>Pin it:</b> push the pin through tube and connector and fit the clip.</li>' : '<li><b>Click it:</b> press the printed button in and slide the tube on until it clicks out through the hole.</li>'}
      <li><b>Taking it apart:</b> press the button${st === 'clip' ? ' (or pull the pin)' : ''} and pull the sections straight apart. Coil them in a figure-eight or pack them in a bag.</li>
      <li><b>Tape:</b> tape over the joints last, leaving the buttons clear.</li></ol>`
    return
  }
  if (design().hoop) {
    const p = params()
    $('guide').innerHTML = `<h2>Making the hoop</h2><ol>
      <li><b>Mark</b> the cut length on the tube with a pen and tape. Measure twice: along the outside of the coil.</li>
      <li><b>Cut square</b> with a pipe cutter (a saw works: then sand the end flat and take off the burr).</li>
      <li><b>Soften</b> the ends: hold each one in just-boiled water for about a minute.</li>
      <li><b>Join:</b> push one end onto the connector up to the notch in the middle, then the other end, curving the way the tube was coiled, until the ends butt together.</li>
      <li><b>Fix it:</b> a small self-tapping screw (or a rivet) through the tube into the connector 2–3 cm each side of the joint. Sand the heads flush.</li>
      <li><b>Tape it:</b> grip tape on the inside, decorative tape round the outside, finishing over the joint.</li></ol>
      <p><a href="#" class="hoopLink">Full hoop making guide</a>: which size for you, tubing, collapsible hoops, every cut length.</p>`
    for (const l of document.querySelectorAll('.hoopLink')) l.onclick = (e) => { e.preventDefault(); openHoopGuide() }
    void p
    return
  }
  if (design().mould) {
    const d = design(), p = params(), box = (p.method || '').startsWith('mould box')
    $('guide').innerHTML = box ? `<h2>Making the rubber mould</h2><ol>
      <li><b>Master:</b> print both halves, glue them on two short filament dowels, sand smooth and seal (primer or clear coat). The rubber copies every mark.</li>
      <li><b>First pour:</b> one frame on the table, the board on it, the master pressed into the board's cut-out${d.kind === 'dart' && p.attach === 'moulded eye' ? ' (the little plug goes in the eye hole)' : ''}, the second frame on top. Seal round the master with a thin roll of plasticine, spray release, pour rubber until it covers the master by 10 mm.</li>
      <li><b>Second pour:</b> when it has set, turn it over, lift off the board and the bottom frame, put the frame back on top, and <b>coat the rubber with release</b> (silicone sticks to silicone). Pour the second half.</li>
      <li><b>Open it:</b> peel the halves apart, take out the master. The keys line the halves up every time.</li>
      <li><b>Cast copies:</b> halves together between two boards with rubber bands, pour into the funnel.</li></ol>
      <p><a href="#" class="mouldLink">Full mould making guide</a>: rubbers, mixing, bubbles, what sticks to what.</p>`
      : `<h2>Casting it</h2><ol>
      <li><b>Print</b> both halves${d.kind !== 'dart' ? ' and the core pin' : ''} in PLA or PETG. Seal the cavity with clear coat and let it dry fully.</li>
      <li><b>Release:</b> spray or brush mould release (or a thin smear of petroleum jelly) on everything the rubber will touch${d.kind !== 'dart' ? ', the core pin too' : ''}.</li>
      ${d.kind === 'acro' && p.coin === 'yes' ? `<li><b>The coin${p.coinN > 1 ? 's' : ''}:</b> stick ${p.coinN > 1 ? 'the stack' : 'it'} flat on the end of the core pin with a small square of double-sided tape, centred. The rubber flows round and locks ${p.coinN > 1 ? 'them' : 'it'} in at the bottom of the socket.</li>` : ''}${d.kind === 'dart' && (p.attach || '').startsWith('rope cast in') ? '<li><b>The rope:</b> tie a fat stopper knot in the rope end (double overhand or figure-eight; a small monkey\'s fist holds best), close the mould with the rope running out through the channel in the top, and hang the knot in the middle of the cavity: tape the rope at the top so the knot cannot touch the walls. Pour slowly round it.</li>' : ''}${d.kind === 'dart' && (p.attach || '').startsWith('cast-in M8') ? '<li><b>The nut:</b> screw the M8 nut onto the bolt with the big washer on top of it; lay the bolt in one half so its head sits on the top of the mould.</li>' : ''}
      <li><b>Close it</b> on the keys, bolt or clamp it, ${d.kind !== 'dart' ? 'push in the core pin, ' : ''}stand it funnel up.</li>
      <li><b>Mix</b> the two parts by weight, scraping the sides; let bubbles rise (or degas). Pour slowly in a thin stream into the funnel until rubber comes up the vents.</li>
      <li><b>Wait</b> the full cure time, then open it, trim the pour and vent stubs flush with sharp scissors${(p.attach || '').startsWith('cast-in') ? ', unscrew the bolt and screw in a stainless swivel eye bolt with thread-locker' : ''}.</li></ol>
      <p><a href="#" class="mouldLink">Full mould making guide</a>: rubbers, mixing, bubbles, what sticks to what.</p>`
    for (const l of document.querySelectorAll('.mouldLink')) l.onclick = (e) => { e.preventDefault(); openMouldGuide() }
    return
  }
  if (design().spokeHub) {
    $('guide').innerHTML = spokeHowTo(design(), false)
    for (const l of document.querySelectorAll('.wickLink')) l.onclick = (e) => { e.preventDefault(); openWickGuide() }
    return
  }
  const m = MATERIALS[state.material]
  $('matNote').textContent = m.note
  const tpu = state.material.startsWith('tpu')
  $('guide').innerHTML = `<h2>Printing it tough</h2>
    <ul>
      ${design().spokeHub ? '<li><b>Practice spoke hub:</b> PETG or nylon, 100% infill, flat as shown. Push an M5 nut into each trap and thread the grub screws in from the face; they clamp the spokes and the pole. Never light spokes in a printed hub.</li>' : ''}
      <li><b>Flat on the bed</b>, as shown. Layer lines run round the disc, so a hit on the rim loads the strong direction.</li>
      <li><b>${tpu ? '100% infill, or 5+ walls with 40% gyroid.' : '6 walls, 50% gyroid.'}</b> In thin struts the walls carry the load.</li>
      ${tpu ? `<li><b>Slow: 20–35 mm/s</b>, direct drive, little retraction. Dry TPU first (50 °C, 6 h); wet TPU prints stringy and weak.</li>
      <li><b>Glowing lanterns:</b> clear or natural TPU at 100% infill glows evenly. Infill patterns show up as shadows when lit.</li>
      <li><b>Bed:</b> TPU welds to PEI. Use glue stick as a release layer on smooth PEI.</li>` : ''}
      ${state.material === 'pa' ? '<li><b>Nylon:</b> enclosure on, dry it hard (70 °C, 8 h), brim to stop the rim lifting.</li>' : ''}
      <li><b>Capsules:</b> push in through the top slot and they snap past the lips. Pick the mode first (or use the capsule remote) since the button ends up inside. Capsules sync over radio, so every lantern can run the same pattern.</li>
      ${current?.hub.ring?.snap ? `<li><b>Bubble ring (snap-on, no tools):</b> one TPU hoop, like the snap-on weight, with the loops standing on a shelf under it. Lay it loops-down on a table and push the hub into it, collar up: the rim cams the lip open and it clicks over. Peel it off the same way. The loops hang on the side away from your hand and stay inside the rim, so an edge-first drop lands on the hoop. Print it lip-down, loops up, in one piece; TPU 95A, 3+ walls, slow the outer walls for the standing loops. If it creeps when spun hard, set Snap stretch to -1.5. Rinse after use: dried mix gets sticky.</li>` : current?.hub.ring?.internal ? `<li><b>Bubble loops (internal):</b> they are part of the hub, so there is no ring to print or bolt. They stand up on the collar side just inside the rim, each fused into the rim and standing on a pad, so a drop on the edge lands on the rim. They print standing up: slow the outer walls and turn the fan up for them. A flat face-first drop can still hit the loop tops, but TPU loops bend rather than snap. Rinse after use: dried mix gets sticky.</li>` : current?.hub.ring?.face ? `<li><b>Bubble ring (flat face):</b> a flat plate with the loops standing on it. It bolts under the hub on the side away from the collar, so the loops point away from your hand and stay inside the rim: a drop lands on the smooth edge, not the loops. Print it plate-down, loops up; it ${current.hub.ring.segs > 1 ? `comes in ${current.hub.ring.segs} arc segments (<i>Split to objects</i> in the slicer)` : 'fits the bed in one piece'}. M3 bolts and nylock nuts up through plate and rim, heads on the plate side. Slow the outer walls for the standing loops. Rinse after use: dried mix gets sticky.</li>` : `<li><b>Bubble ring:</b> a tyre round the outside of the rim, its flange under the rim on the side away from the collar. Stretch it on, then M3 bolts and nylock nuts up through flange and rim. It is wider than the hub, so it prints in arc segments: in the slicer use <i>Split to objects</i> and arrange them. Edge-on loops print standing up; slow the outer walls down for them. Rinse after use: dried mix gets sticky.</li>`}
      ${current?.hub.snap?.led ? `<li><b>LED weight ring:</b> print block-down in natural TPU, 100% infill, 3+ perimeters. <b>Pause at ${current.hub.snap.led.pauseAt.toFixed(1)} mm</b>: the LED slot and wire groove are open there. Lay the strip (in clear heat-shrink, not glued) into the slot, LEDs facing out, wires in the groove, ends coiled into the pods, then resume; print the roof slowly with the fan on. Turn on supports for the two pod cavities only (their ceilings are a wide bridge). Pods open on the face away from the collar; the lids press in. Weigh both pods' contents and match them within 1 g. Wiring, parts from Thai shops and firmware: <a href="led-ring-plan.html" target="_blank">LED ring plan</a>.</li>` : ''}
      ${current?.hub.snap ? `<li><b>Snap-on weight:</b> one hoop per weight, printed block-down with no supports; the lip's top is chamfered, so it needs none either. To fit it, lay the hoop on a table, set the hub in at an angle so one side of the rim is under the lip, then push down round the edge like a bike tyre until it clicks over. Peel it off the same way to swap. If it creeps round the rim on hard spins, print it with a tighter stretch (-1.5 mm). Heavy = slower, longer, smoother spins; light = quicker tricks.</li>` : ''}
      <li><b>Fit:</b> if the test ring slides on the pole, lower bore clearance 0.1 mm at a time. If it will not go on, raise it.</li>
    </ul>`
}

function download(data, name, type = 'model/stl') {
  if (/model|stl|3mf|dxf|svg/i.test(type + name)) community.downloaded(design().id)
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// ------------------------------------------------------------------ chrome --
function toggle(id, initial, fn) {
  const b = $(id)
  let on = initial
  b.setAttribute('aria-pressed', on)
  b.onclick = () => { on = !on; b.setAttribute('aria-pressed', on); fn(on) }
  fn(on)
}
toggle('vDark', false, (on) => { view.dark = on; applyLook() })
toggle('vUV', false, (on) => {
  view.uv = on
  if (on && !view.dark) $('vDark').click()
  // a blacklight only shows anything on UV filament: switch to one if needed
  if (on && !isUV(state.color)) [...$('swatches').querySelectorAll('.swatch')].find((s) => s.title.startsWith('UV'))?.click()
  applyLook()
})
toggle('vSpin', false, (on) => (view.spin = on))
toggle('vTrails', false, (on) => (view.trails = on))
toggle('vStrobe', false, (on) => {
  view.strobe = on
  if (on) setMain(true)
})
toggle('vPip', true, (on) => ($('pip').hidden = !on))
// 360°: the angled view takes the stage and turns slowly; drag to look from anywhere
ctlAngle.autoRotateSpeed = 1.2
ctlAngle.addEventListener('start', () => (ctlAngle.autoRotate = false))
toggle('v360', false, (on) => {
  ctlAngle.autoRotate = on
  if (on) {
    setMain(false)
    status('360°: drag to turn · pinch or scroll to zoom')
  } else setMain(framedR >= 140)
  // back to straight face-on
  const dist = camFace.position.distanceTo(ctlFace.target)
  camFace.position.set(ctlFace.target.x, ctlFace.target.y, ctlFace.target.z + dist)
  camFace.up.set(0, 1, 0)
  ctlFace.update()
})
// fire spokes and their ends are bought, not cut or printed: hide them to see just the hub
toggle('vSpokes', true, (on) => {
  view.spokes = on
  for (const m of [rodMesh, kevMesh, pracMesh]) m.visible = on && !!m.geometry.attributes.position
})
// on a hoop that chip is "Connector": it swaps between the whole hoop and the connector close-up with its parts
$('vSpokes').addEventListener('click', (e) => {
  const d = design()
  if (!d.hoop) return
  e.stopImmediatePropagation() // not a show/hide here: it changes the view
  const p = params(), close = !(p.show || '').includes('close')
  p.show = close ? 'the connector close up' : 'the whole hoop'
  renderParams(); schedule(0)
  if (close && !view.anim) $('vAnim').click()
}, true)
toggle('vBubbles', false, (on) => {
  bubbles.enabled = on
  $('bubblePanel').hidden = !on
  if (on && !view.spin) $('vSpin').click()
})
$('dip').onclick = () => { const err = bubbles.dip(); $('bubbleMsg').textContent = err || '' }
$('refill').onclick = () => { bubbles.refill(); $('bubbleMsg').textContent = `Dish refilled to ${bubbles.dishSize} ml.` }
$('autoDip').onchange = (e) => (bubbles.autoDip = e.target.checked)
setInterval(() => {
  if (!bubbles.enabled || !bubbles.info) return
  const i = bubbles.info, s = bubbles.stats
  const speed = view.spin ? (view.rate * Math.PI * 2 * i.loopC) / 1000 : 0
  const pull = view.spin ? ((view.rate * Math.PI * 2) ** 2 * i.loopC) / 9810 : 0
  const perBubble = s.bubbles ? ((s.used - bubbles.onLoops() - bubbles.coat) / s.bubbles) : 0
  $('bubbleStats').innerHTML = `
    <div class="row"><span>In the dish</span><span>${bubbles.dish.toFixed(1)} ml</span></div>
    <div class="row"><span>On the loops</span><span>${bubbles.onLoops().toFixed(2)} ml</span></div>
    <div class="row"><span>Bubbles (this dip)</span><span>${s.bubbles} (${s.lastDip})</span></div>
    <div class="row"><span>Flung off</span><span>${s.flung.toFixed(2)} ml</span></div>
    <div class="row"><span>Mix per bubble, all in</span><span>${perBubble ? (perBubble * 1000).toFixed(0) + ' µl' : '–'}</span></div>
    <div class="row"><span>Loop speed / pull</span><span>${speed.toFixed(2)} m/s · ${pull.toFixed(1)} g</span></div>`
  let hint = ''
  if (i.dir === 'flat') hint = 'Flat loops: spinning moves them edgeways, so no air goes through. Set Loops face to edge-on to blow while spinning.'
  else if (!view.spin) hint = 'Spin it to blow bubbles.'
  else if (speed < 0.9) hint = `The loops move at ${speed.toFixed(2)} m/s; a film needs about 0.9 m/s of air to blow out. Spin faster.`
  else if (pull > 1.5) hint = `At ${pull.toFixed(1)} g most of the mix is flung off before it becomes bubbles. Slower spins give more bubbles per dip.`
  else if (bubbles.onLoops() < bubbles.capacity() * 0.5 && !bubbles.autoDip) hint = 'Loops are running dry: dip again.'
  if (!$('bubbleMsg').dataset.sticky) $('bubbleHint').textContent = hint
}, 200)
setMain(true)
toggle('vWeak', true, () => applyLook())
toggle('vPole', true, (on) => (pole.visible = on))
toggle('vAnim', false, (on) => (view.anim = on))
// cross section: cut away the front of the design to see inside. Two sliders: where the cut goes
// (front to back), and how far up from the bottom it starts, so you can cut out just a corner
const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)
const cutPlane2 = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e5) // off until moved
renderer.localClippingEnabled = true
const cutUI = document.createElement('div')
cutUI.className = 'xsec'
cutUI.hidden = true
cutUI.innerHTML = `<div class="ctl"><label for="xsA">Cut position</label><output id="xsAOut">middle</output><input type="range" id="xsA" min="-100" max="100" step="1" value="0"></div>
  <div class="ctl"><label for="xsB">Cut down to</label><output id="xsBOut">the bottom</output><input type="range" id="xsB" min="-100" max="100" step="1" value="-100"></div>
  <div class="hint">Drag the view as usual: these only move the cut.</div>`
const vpanels = document.createElement('div')
vpanels.className = 'vpanels'
$('gl').parentElement.append(vpanels)
vpanels.append(cutUI)
// layers: show or hide each part the design is made of, and an X-ray to see through the body
const LAYERS = [
  ['body', 'Body', () => frameMesh], ['glow', 'Glowing parts (colour B)', () => glowMesh], ['lids', 'Lids', () => lidMesh], ['ring', 'Weight ring', () => ringMesh], ['snap', 'Snap ring', () => snapMesh],
  ['metal', 'Metal hardware', () => rodMesh], ['kev', 'Kevlar', () => kevMesh], ['soft', 'Yarn, heads and cast parts', () => pracMesh], ['zone', 'Solid infill zone', () => zoneMesh], ['moving', 'Moving parts', () => animGroup],
]
view.hidden = new Set()
const layUI = document.createElement('div')
layUI.className = 'xsec'
layUI.hidden = true
vpanels.append(layUI)
function applyLayers() {
  for (const [key, , get] of LAYERS) if (view.hidden.has(key)) get().visible = false
  for (const m of animGroup.children) if (view.hidden.has('p:' + m.userData?.key)) m.visible = false
  const x = view.xray || 0
  if (x > 0) {
    frameMat.transparent = true; frameMat.opacity = 1 - (x / 100) * 0.85; frameMat.depthWrite = x < 30; frameMat.needsUpdate = true
    view.xrayOn = true
  } else if (view.xrayOn) { view.xrayOn = false; frameMat.depthWrite = true; applyLook() } // back to the material's own look
}
function renderLayers() {
  if (layUI.hidden) return
  const has = (o) => (o.isGroup ? o.children.length > 0 : !!o.geometry?.attributes?.position?.count)
  const rows = LAYERS.filter(([, , get]) => has(get()))
  const pretty = (key) => { const t = String(key).replace(/^(anim|cage)/, '').replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/(\d+)/, (n) => String(+n + 1)).trim(); return t ? t[0].toUpperCase() + t.slice(1) : 'Part' }
  const parts = animGroup.children.map((m) => m.userData?.key).filter(Boolean)
  layUI.innerHTML = `${rows.filter(([key]) => key !== 'moving' || !parts.length).map(([key, label]) => `<label class="check"><input type="checkbox" data-k="${key}"${view.hidden.has(key) ? '' : ' checked'}> ${label}</label>`).join('')}
    ${parts.length ? `<div class="hint">Parts</div>${parts.map((key) => `<label class="check"><input type="checkbox" data-p="${key}"${view.hidden.has('p:' + key) ? '' : ' checked'}> ${animGroup.children.find((m) => m.userData.key === key)?.userData.label || pretty(key)}</label>`).join('')}` : ''}
    <div class="ctl"><label for="xray">X-ray the body</label><output id="xrayOut">${view.xray || 0}%</output><input type="range" id="xray" min="0" max="100" step="5" value="${view.xray || 0}"></div>`
  for (const cb of layUI.querySelectorAll('input[data-p]')) cb.onchange = () => {
    const key = cb.dataset.p, m = animGroup.children.find((c) => c.userData.key === key)
    if (cb.checked) view.hidden.delete('p:' + key); else view.hidden.add('p:' + key)
    if (m) m.visible = cb.checked
  }
  for (const cb of layUI.querySelectorAll('input[data-k]')) cb.onchange = () => {
    const key = cb.dataset.k, o = LAYERS.find((l) => l[0] === key)[2]()
    if (cb.checked) { view.hidden.delete(key); if (current) show(current.hub, current.design, current.params, performance.now()) } else { view.hidden.add(key); o.visible = false }
  }
  $('xray').oninput = (e) => { view.xray = +e.target.value; $('xrayOut').textContent = view.xray + '%'; applyLayers() }
}
{
  const chip = document.createElement('button')
  chip.className = 'chip'; chip.id = 'vLayers'; chip.setAttribute('aria-pressed', 'false'); chip.textContent = 'Layers'
  chip.title = 'Show or hide each part of the design, and see through the body, to see how it is made inside'
  $('vCut').after(chip)
  chip.onclick = () => { layUI.hidden = !layUI.hidden; chip.setAttribute('aria-pressed', String(!layUI.hidden)); renderLayers() }
}
const cutSize = () => Math.max(20, current?.hub?.viewR || framedR || 140)
function placeCut() {
  const a = +$('xsA').value, b = +$('xsB').value, R = cutSize()
  cutPlane.constant = (a / 100) * R
  cutPlane2.constant = b <= -100 ? -1e5 : (b / 100) * R * 1.2 // 'the bottom': the whole front comes off
  $('xsAOut').textContent = a === 0 ? 'middle' : showLen((a / 100) * R)
  $('xsBOut').textContent = b <= -100 ? 'the bottom' : showLen(((b + 100) / 200) * 2.4 * R) + ' up'
}
$('xsA').oninput = placeCut
$('xsB').oninput = placeCut
toggle('vCut', false, (on) => {
  view.cut = on
  cutUI.hidden = !on
  placeCut()
  showZone()
  scene.traverse((o) => {
    if (!o.isMesh || !o.material || o === pole) return
    for (const m of [].concat(o.material)) { m.clippingPlanes = on ? [cutPlane, cutPlane2] : []; m.clipIntersection = true; m.side = on ? THREE.DoubleSide : m.userData.side ?? (m.userData.side = m.side, m.side); m.needsUpdate = true }
  })
})
$('vRef').onclick = () => { state.ref = REFS[(REFS.indexOf(state.ref) + 1) % REFS.length]; persist(); placeRef(); if (current) { frameView(Math.max(current.hub.viewR || 140, state.ref === 'person' ? state.refH * 10 * 0.6 : 0)); setMain(state.ref === 'off' && framedR >= 140 && !current.hub.tsword && !current.hub.taxe) } }
$('refH').value = state.refH
$('refHOut').textContent = state.refH + ' cm'
$('refH').oninput = (e) => { state.refH = Number(e.target.value); $('refHOut').textContent = state.refH + ' cm'; persist(); placeRef(); if (current) frameView(Math.max(current.hub.viewR || 140, state.refH * 6)) }
toggle('vBed', true, () => applyLook())
$('spinRate').oninput = (e) => { view.rate = Number(e.target.value); $('spinOut').textContent = `${view.rate} rev/s` }

function setMode(m, quiet) {
  state.mode = m
  if (!quiet) renderParams() // fire ends come and go with the material
  $('modePrint').setAttribute('aria-pressed', String(m === 'print'))
  $('modeCnc').setAttribute('aria-pressed', String(m === 'cnc'))
  document.body.classList.toggle('cncMode', m === 'cnc')
  $('vBed').hidden = m === 'cnc'
  if (quiet) return
  renderParams(); renderGuide(); renderGallery(); schedule(0); persist()
}
// My pole: type it once, every design that fits a pole follows it
state.pole = saved.pole && saved.pole.od ? saved.pole : { od: 22, id: 19 }
$('poleOut').value = state.pole.od
$('poleIn').value = state.pole.id
function applyPole() {
  const od = Number($('poleOut').value), id = Number($('poleIn').value)
  if (!(od >= 8 && od <= 40) || !(id >= 0 && id < od - 0.8)) return status('My pole: inside must be at least 1 mm smaller than outside.')
  state.pole = { od, id }
  const wall = id > 0 ? +((od - id) / 2).toFixed(2) : 0
  for (const d of DESIGNS) {
    const P = state.params[d.id]
    if (d.adaptor) { if (od < P.big) P.small = od; continue }
    if ('poleOD' in P) P.poleOD = od
    if ('poleWall' in P && wall > 0) P.poleWall = wall
  }
  if (id === 0) status('Solid pole: inserts and expanders need a hollow pole; clamps and bores still fit it.')
  renderParams(); schedule(0); persist()
}
$('poleOut').onchange = applyPole
$('poleIn').onchange = applyPole

$('modePrint').onclick = () => {
  state.autoCnc = false
  if (cncOnly(design())) state.design = DESIGNS.find((d) => !d.adaptor && !d.custom && !d.cncOnly).id // a spark cage can't be printed
  setMode('print')
}
$('modeCnc').onclick = () => { state.autoCnc = false; setMode('cnc') }
if (cncOnly(design())) state.mode = 'cnc'
setMode(state.mode, true)

const matSel = $('material')
for (const [k, m] of Object.entries(MATERIALS)) matSel.add(new Option(`${m.name}${m.verdict === 'avoid' ? ' (looks only)' : ''}`, k))
matSel.add(new Option('⚙️ Metal or Perspex: cut it on a CNC instead…', '__cnc'))
matSel.value = state.material
matSel.onchange = () => { if (matSel.value === '__cnc') { matSel.value = state.material; return setMode('cnc') } state.material = matSel.value; renderGuide(); schedule(0) }
const bedSel = $('bed')
bedSel.value = state.bed
bedSel.onchange = () => { state.bed = bedSel.value; drawBed(); schedule(0) }

function swatches(boxId, list, isOn, pick) {
  const box = $(boxId)
  for (const [name, hex] of list) {
    const b = document.createElement('button')
    b.className = 'swatch' + (hex === 'same' ? ' same' : '')
    if (hex !== 'same') b.style.background = hex
    b.title = name
    b.setAttribute('aria-label', name)
    b.setAttribute('aria-pressed', isOn(hex))
    b.onclick = () => {
      pick(hex)
      box.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-pressed', s === b))
      applyLook()
      persist()
    }
    box.append(b)
  }
}
swatches('swatches', FILAMENTS.map(([n, h, uv]) => [uv ? n + ' (glows under UV)' : n, h]), (h) => h === state.color, (h) => (state.color = h))
swatches('glowSwatches', GLOWS, (h) => h === state.glow, (h) => (state.glow = h))
swatches('glow2Swatches', GLOWS, (h) => h === state.glow2, (h) => (state.glow2 = h))
swatches('swatchesRing', [['Match the hub', 'same'], ...FILAMENTS.map(([n, h, uv]) => [uv ? n + ' (glows under UV)' : n, h])], (h) => (h === 'same' ? !state.colorRing : h === state.colorRing), (h) => (state.colorRing = h === 'same' ? null : h))
swatches('swatchesB', [['Same as A', 'same'], ...FILAMENTS.map(([n, h, uv]) => [uv ? n + ' (glows under UV)' : n, h])], (h) => h === state.colorB, (h) => (state.colorB = h === 'same' ? state.color : h))

// capsule modes, grouped like the capsule's own pages
const modeSel = $('ledMode')
for (const pg of [0, 1, 2, 3]) {
  const og = document.createElement('optgroup')
  og.label = PAGE_NAMES[pg]
  for (const m of LED_MODES.filter((x) => x.page === pg)) og.append(new Option(m.name, m.id))
  modeSel.append(og)
}
modeSel.value = view.led
const showStrobeCtl = () => {
  $('strobeCtl').hidden = !ledMode().strobe || ['beads', 'microdots'].includes(view.led)
  $('blinkCtl').hidden = !ledMode().blink
  $('gradCtl').hidden = !ledMode().gradient
}
modeSel.onchange = () => { view.led = modeSel.value; showStrobeCtl() }
$('strobeHz').oninput = (e) => { view.hz = Number(e.target.value); $('strobeHzOut').textContent = `${view.hz} Hz` }
$('blinkHz').oninput = (e) => { view.blinkHz = Number(e.target.value); $('blinkHzOut').textContent = `${view.blinkHz} per second` }
$('fadeSec').oninput = (e) => { view.fadeSec = Number(e.target.value); $('fadeSecOut').textContent = `${view.fadeSec} s` }
$('strobeDuty').oninput = (e) => { view.duty = Number(e.target.value) / 100; $('strobeDutyOut').textContent = `${e.target.value}%` }
showStrobeCtl()

// ------------------------------------------------------------------ ideas --
// Saved designs: on dream.sc (members) and in the portable/public copy they stay
// on the person's own device (this browser), with a backup file to keep or move
// them; run locally with server.mjs they go through api/ideas (shared on the Mac).
const DB = !!(window.dreamDB && window.dreamDB.available)
const LOCAL = DB || !!window.__PORTABLE
const localIdeas = {
  read: () => { try { const s = localStorage.getItem('dragonhub-ideas'); return s ? JSON.parse(s) : window.__SEED_IDEAS || [] } catch { return window.__SEED_IDEAS || [] } },
  write: (list) => { try { localStorage.setItem('dragonhub-ideas', JSON.stringify(list)) } catch {} },
}
const ideasApi = LOCAL
  ? {
      list: async () => localIdeas.read(),
      add: async (body) => localIdeas.write([...localIdeas.read(), { ...body, id: crypto.randomUUID(), time: new Date().toISOString(), votes: 0 }]),
      vote: async (idea) => localIdeas.write(localIdeas.read().map((x) => (x.id === idea.id ? { ...x, votes: (x.votes || 0) + 1 } : x))),
      remove: async (idea) => localIdeas.write(localIdeas.read().filter((x) => x.id !== idea.id)),
    }
  : {
      list: async () => (await fetch('api/ideas')).json(),
      add: async (body) => {
        const r = await fetch('api/ideas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        if (!r.ok) throw new Error(await r.text())
      },
      vote: (idea) => fetch(`api/ideas/${idea.id}/vote`, { method: 'POST' }),
      remove: (idea) => fetch(`api/ideas/${idea.id}`, { method: 'DELETE' }),
    }

const likes = createLikes({ db: DB, local: LOCAL })
likes.onChange(() => { renderGallery(); renderIdeaHearts() })
likes.ready.then(likes.refresh)
setInterval(likes.refresh, 20000)

/** Open a saved design or creation (creations open in Create, ready to remix). */
function openIdea(idea) {
  const d = DESIGNS.find((x) => x.id === idea.design)
  if (!d) return status('that saved design needs a newer forge')
  if (d.custom) return creator?.openCreation(idea)
  state.design = d.id
  state.params[d.id] = { ...defaults(d), ...idea.params }
  if (idea.material in MATERIALS) { state.material = idea.material; matSel.value = idea.material; renderGuide() }
  if (idea.color?.startsWith?.('glow:')) state.glow = idea.color.slice(5)
  if (idea.mode === 'cnc' && idea.cnc) state.cncp[d.id] = { ...cncDefaults(d), ...idea.cnc }
  if ((idea.mode || 'print') !== state.mode) setMode(idea.mode === 'cnc' ? 'cnc' : 'print', true)
  renderGallery(); renderParams(); schedule(0); fillThumbs()
}

/** Hearts on the saved list (right side) follow the same likes. */
function renderIdeaHearts() {
  for (const el of document.querySelectorAll('#ideas .idea')) {
    const b = el.querySelector('[data-a="vote"]'), idea = el._idea
    if (!b || !idea) continue
    const e = { key: 'i:' + idea.id, idea }
    const n = likeCount(e), on = likes.likedByMe(e.key), who = likes.names(e.key)
    b.textContent = `${on ? '♥' : '♡'} ${n || ''}`.trim()
    b.setAttribute('aria-pressed', on)
    b.title = who.length ? `Liked by ${who.join(', ')}` + (idea.votes ? ` and ${idea.votes} earlier` : '') : 'Like it'
  }
}

if (!DB && window.__PORTABLE && $('savedWhere')) $('savedWhere').textContent = 'Portable copy: designs save in this browser only. Starts with the designs saved so far.'
if (DB && $('savedWhere')) $('savedWhere').textContent = 'Saved on this device only (private to you). Open restores every setting. Back them up to a file to keep them safe or move them to another device.'
if (LOCAL && $('savedWhere')) {
  // backup / restore, since browser storage can be cleared
  const row = document.createElement('div')
  row.className = 'backupRow'
  row.innerHTML = '<button class="btn" type="button" id="ideasBackup">💾 Back up my designs</button><button class="btn" type="button" id="ideasRestore">📂 Load a backup</button>'
  $('savedWhere').after(row)
  $('ideasBackup').onclick = () => {
    const list = localIdeas.read()
    const url = URL.createObjectURL(new Blob([JSON.stringify({ app: 'dragon-hub-forge', saved: list }, null, 1)], { type: 'application/json' }))
    Object.assign(document.createElement('a'), { href: url, download: `my-dragon-hubs-${new Date().toISOString().slice(0, 10)}.json` }).click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
  $('ideasRestore').onclick = () => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' })
    inp.onchange = async () => {
      try {
        const data = JSON.parse(await inp.files[0].text())
        const incoming = Array.isArray(data) ? data : data.saved
        if (!Array.isArray(incoming)) throw new Error()
        const have = localIdeas.read(), ids = new Set(have.map((x) => x.id))
        const add = incoming.filter((x) => x && x.id && x.design && !ids.has(x.id))
        localIdeas.write([...have, ...add])
        status(`Loaded ${add.length} saved design${add.length === 1 ? '' : 's'} from the backup`)
        loadIdeas()
      } catch { status('That file is not a Dragon Hub Forge backup') }
    }
    inp.click()
  }
}

async function loadIdeas() {
  let list = []
  try {
    list = await ideasApi.list()
  } catch {
    $('ideas').innerHTML = '<div class="empty">Shortlist server not reachable.</div>'
    return
  }
  // re-draw the list only when something changed (this runs every 15 s)
  const sig = JSON.stringify(list.map((i) => [i.id, i.name, i.votes, i.thumb?.length]))
  if (sig !== ideaSig) { ideaSig = sig; ideaList = list; renderGallery() }
  const box = $('ideas')
  if (!list.length) {
    box.innerHTML = '<div class="empty">Nothing saved yet. Tune a hub you like, name it and press Save design.</div>'
    return
  }
  list = [...list].sort((a, b) => likeCount({ key: 'i:' + b.id, idea: b }) - likeCount({ key: 'i:' + a.id, idea: a }) || String(b.time || '').localeCompare(String(a.time || '')))
  box.innerHTML = ''
  for (const idea of list) {
    const d = DESIGNS.find((x) => x.id === idea.design)
    const el = document.createElement('div')
    el.className = 'idea'
    el.innerHTML = `<img alt=""><div><b></b><small></small></div>
      <div class="acts"><button data-a="load">Open</button><button data-a="vote">♡</button><button data-a="del">Delete</button></div>`
    if (idea.thumb) el.querySelector('img').src = idea.thumb
    el.querySelector('b').textContent = idea.name || 'Untitled'
    el.querySelector('small').textContent = `${d ? d.name : idea.design || '?'} · ${Number(idea.grams || 0).toFixed(0)} g${idea.note ? ' · ' + idea.note : ''}`
    el._idea = idea
    el.onclick = async (e) => {
      const a = e.target.dataset?.a
      if (a === 'load') openIdea(idea)
      else if (a === 'vote') tapHeart('i:' + idea.id)
      else if (a === 'del') {
        if (e.target.dataset.armed) { await ideasApi.remove(idea); loadIdeas() }
        else { e.target.dataset.armed = 1; e.target.textContent = 'Sure?' }
      }
    }
    box.append(el)
  }
  renderIdeaHearts()
}

$('headerSave').onclick = () => {
  $('savedSection').scrollIntoView({ behavior: 'smooth', block: 'start' })
  $('ideaName').focus()
}

$('saveIdea').onclick = async () => {
  if (!current) return
  const cv = document.createElement('canvas')
  cv.width = cv.height = 160
  drawThumb(cv, current.hub.polygons, current.hub.viewR || current.params.diameter / 2, glowColor())
  const body = {
    name: $('ideaName').value.trim() || `${current.design.name} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    note: $('ideaNote').value.trim(),
    design: current.design.id,
    params: current.params,
    material: state.material,
    mode: state.mode,
    cnc: isCnc() ? { ...cncp() } : undefined,
    color: 'glow:' + glowColor(),
    thumb: cv.toDataURL('image/png'),
    grams: current.hub.stats.gramsTotal,
  }
  try {
    await ideasApi.add(body)
    $('ideaName').value = ''
    $('ideaNote').value = ''
    status('saved')
    loadIdeas()
  } catch (e) {
    status('could not save: ' + (e.message || e))
  }
}

// ------------------------------------------------------------------- boot --
drawBed()
renderGallery()
renderParams()
renderGuide()
resize()
applyLook()
status('building…')
rebuild()
fillThumbs()
loadIdeas()
setInterval(loadIdeas, 15000)

initHelp()
creator = initCreate({
  params: () => state.params.custom,
  selectCustom: () => {
    if (state.design === 'custom') return
    state.design = 'custom'
    document.querySelectorAll('#gallery .design').forEach((n) => n.setAttribute('aria-pressed', n === DESIGNS.find((d) => d.custom)._btn))
    renderParams()
  },
  schedule: (ms) => { if (state.design === 'custom') schedule(ms) },
  renderParams: () => { if (state.design === 'custom') renderParams() },
  current: () => current,
  onBuilt: (fn) => builtHooks.push(fn),
  ideasApi,
  refreshIdeas: loadIdeas,
  material: () => state.material,
  loadParams: (p) => {
    const d = DESIGNS.find((x) => x.custom)
    state.params.custom = { ...defaults(d), ...p }
    state.design = 'custom'
    renderGallery(); renderParams(); schedule(0)
  },
  balance: async () => {
    if (state.design !== 'custom') return
    Object.assign(params(), await work('balance', { design: 'custom', params: params(), key: 'cw', material: state.material }))
    renderParams()
    schedule(0)
  },
  thumb: () => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 160
    drawThumb(cv, current.hub.polygons, current.hub.viewR || current.params.diameter / 2, glowColor())
    return cv.toDataURL('image/png')
  },
  download: (kind) => {
    if (!current || current.design.id !== 'custom') return status('still building…')
    const m = current.hub.meshes, name = 'my-creation-' + current.params.diameter + 'mm'
    if (kind === '3mf' && m.glow) download(to3MF([['frame (colour A)', m.frame], ['shapes (colour B)', m.glow]], 'My creation'), name + '-2colour.3mf', 'model/3mf')
    else download(toSTL(m.combined, 'My creation'), name + '.stl')
  },
})
