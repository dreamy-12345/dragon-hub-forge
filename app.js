import * as THREE from 'three'
import { OrbitControls } from './vendor/OrbitControls.js'
import { DESIGNS, COMMON_PARAMS, MATERIALS, defaults, toSTL, toSVG, to3MF } from './hub.js'
import { LED_MODES, PAGE_NAMES } from './leds.js'
import { BubbleSim } from './bubbles.js'
import { initCreate } from './create.js'
import { createLikes } from './likes.js'
import { initHelp } from './help.js'
import { CNC_PARAMS, PROCESSES, cncDefaults, matOf, matKey, procKey, endsKey, ENDS, SPOKE_ENDS, toDXF, toCutSVG, spokeDrawingSVG } from './cnc.js'
import { dartDrawingSVG } from './darts.js'

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
const GROUPS = { Creations: 'Your creations', Adaptors: 'Pole adaptors', Glow: 'Glowing lanterns', Spin: 'Made for spinning', Creatures: 'Creatures', Organic: 'Organic', Classics: 'Classics', Claude: "Claude's own", Earth: 'Earth fractals', 'Fractal creatures': 'Fractal creatures', Thai: 'Myths and patterns', Fire: '⚙️ CNC cut: metal and fire', SpokeHubs: '⚙️ Machined metal: fire spoke hubs', PracticeSpokes: 'Practice spokes (fit the spoke hubs)', Sleeves: 'Pole inserts (stop clamps crushing the pole)', Grips: 'Hub to pole grips (no crushing)', Collapsible: 'Collapsible staff joints', Contact: 'Balls and fun ends', DartClassic: 'Classic', DartModern: 'Modern', SparkCages: '🔥 Spark cages (CNC only)', Dreamscape: 'Dreamscape', Dogs: 'Dogs', LoyalDog: 'The loyal dog', Signature: 'Signature', Melt: 'Melted' }

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
for (const d of DESIGNS) state.params[d.id] = { ...defaults(d), ...(saved.params?.[d.id] || {}) }
state.v = 3
// How it is made: 3D print (everything above) or CNC cut. CNC settings are per design
// and live apart from the print settings, so switching never changes a print design.
state.mode = saved.mode === 'cnc' ? 'cnc' : 'print'
state.cncp = {}
for (const d of DESIGNS) state.cncp[d.id] = { ...cncDefaults(d), ...(saved.cncp?.[d.id] || {}) }
const isCnc = () => state.mode === 'cnc'
const cncOnly = (d) => !!d.cncOnly // spark cages: steel, cut on a CNC, never printed
const printOnly = (d) => !!(d.adaptor || d.ballEnd || d.sleeve || d.practiceSpoke || d.novelty || d.grip) // always 3D printed, in either mode
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
function control(def, get, set) {
  const id = 'p_' + def.key
  const wrap = document.createElement('div')
  wrap.className = 'ctl'
  if (def.options) {
    wrap.innerHTML = `<label for="${id}">${def.label}</label><select id="${id}">${def.options.map((o) => `<option${o === get() ? ' selected' : ''}>${o}</option>`).join('')}</select>`
    wrap.querySelector('select').onchange = (e) => set(e.target.value)
  } else {
    const fmt = (v) => `${+(+v).toFixed(2)}${def.unit ? ' ' + def.unit : ''}`
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
        b.textContent = def.unit ? `${v} ${def.unit}` : String(v)
        b.setAttribute('aria-pressed', String(+get() === v))
        b.onclick = () => {
          input.value = v; out.textContent = fmt(v); set(v)
          for (const c of row.children) c.setAttribute('aria-pressed', String(c === b))
        }
        row.append(b)
      }
      input.addEventListener('input', () => { for (const c of row.children) c.setAttribute('aria-pressed', String(parseFloat(c.textContent) === +input.value)) })
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
    if (d.spokeHub && def.key === 'ends' && !fireSafe) {
      def = { ...def0, options: def0.options.filter((o) => !o.startsWith('fire')) }
      if (!def.options.includes(params().ends)) params().ends = SPOKE_ENDS.tpu
    }
    dp.append(control(def, () => params()[def.key], set(def.key)))
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
  const groups = d.adaptor || (isCnc() && !printOnly(d)) ? [] : d.sleeve || d.practiceSpoke || d.dart || d.cage || d.grip ? [] : d.spokeHub || d.ballEnd || d.novelty ? ['Fit'] : [...new Set(COMMON_PARAMS.map((p) => p.group))].filter((g) => g !== 'Glow' || d.pods)
  const label = { Fit: 'Pole size and fit', Glow: 'Lanterns and capsules', 'Weight ring': 'Bubble weight ring', 'Snap weight': 'Snap-on weight ring' }
  for (const g of groups) {
    const det = document.createElement('details')
    if (g === 'Levels' || g === 'Fit') det.open = true
    det.innerHTML = `<summary>${label[g] || g}</summary><div></div>`
    for (const def of COMMON_PARAMS.filter((p) => p.group === g)) det.lastChild.append(control(def, () => params()[def.key], set(def.key)))
    cp.append(det)
  }
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
    <input type="search" id="listQ" placeholder="Search designs" aria-label="Search designs" autocomplete="off">
    <div class="chips" id="listChips" role="group" aria-label="Show"></div>
    <label class="sortby">Sort <select id="listSort"><option value="groups">by group</option><option value="liked">most liked</option><option value="new">newest</option><option value="az">A to Z</option></select></label>
    <div class="who" id="whoBox" hidden><span>Your name, so hearts are yours:</span><input id="whoName" maxlength="40" placeholder="Name"><button class="btn primary" id="whoOk">OK</button></div>
  </div>`)
  $('listQ').value = listUI.q
  $('listQ').oninput = (e) => { listUI.q = e.target.value; keepList(); renderGallery() }
  $('listSort').value = listUI.sort
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
const SECTIONS = { hubs: 'Dragon staff hubs', fire: 'Fire and metal (CNC)', sparks: 'Spark cages (charcoal, CNC only)', rope: 'Rope dart heads', contact: 'Contact staff ends', fittings: 'Pole fittings' }
const SECTION_OF = {
  Fire: 'fire', SpokeHubs: 'fire', PracticeSpokes: 'fire',
  Contact: 'contact',
  DartClassic: 'rope', DartModern: 'rope',
  SparkCages: 'sparks',
  Adaptors: 'fittings', Sleeves: 'fittings', Grips: 'fittings', Collapsible: 'fittings',
}
for (const d of DESIGNS) if (!d.custom && d.group !== 'Creations' && !SECTION_OF[d.group]) SECTION_OF[d.group] = 'hubs'
// first time with folders: hub styles start folded, except the one you are on, so the list is short
if (!listUI.folders) {
  const cur = DESIGNS.find((d) => d.id === state.design)?.group
  listUI.collapsed = [...new Set([...listUI.collapsed, ...Object.keys(SECTION_OF).filter((g) => SECTION_OF[g] === 'hubs' && g !== cur)])]
  listUI.folders = 1
  keepList()
}

function renderGallery() {
  galleryTools()
  const g = $('gallery')
  g.querySelectorAll('.design, h3, .empty').forEach((n) => n.remove())
  for (const b of $('listChips').children) b.setAttribute('aria-pressed', b.dataset.f === listUI.filter)
  const { list, all, grouped, mine } = entries()
  // folders: every group sits in a big folder (Dragon staff hubs, Fire and metal, ...)
  const secOrder = isCnc() ? ['fire', 'sparks', 'hubs', 'rope', 'contact', 'fittings'] : ['hubs', 'fire', 'rope', 'contact', 'sparks', 'fittings'] // CNC mode: metal first
  const order0 = [...new Set(DESIGNS.map((d) => d.group))]
  const secRank = (g) => (SECTION_OF[g] ? 1 + secOrder.indexOf(SECTION_OF[g]) : 0)
  const order = [...order0].sort((a, b) => secRank(a) - secRank(b) || order0.indexOf(a) - order0.indexOf(b))
  const groupOf = (e) => e.group
  let rows = list
  if (grouped) {
    rows = [...list].sort((a, b) => order.indexOf(groupOf(a)) - order.indexOf(groupOf(b)))
    // pin what you like near the top of the full list
    if (listUI.filter === 'all' && mine.size) {
      const pinned = all.filter((e) => mine.has(e.key)).map((e) => ({ ...e, group: '__liked' }))
      rows = [...pinned, ...rows]
    }
  }
  if (!rows.length) {
    g.insertAdjacentHTML('beforeend', `<div class="empty">${listUI.filter === 'liked' ? 'No hearts yet. Tap ♡ on any design you love.' : listUI.filter === 'top' ? 'Nothing has a heart yet. Be the first!' : listUI.q ? 'Nothing matches. Try a shorter word.' : 'Nothing here yet.'}</div>`)
  }
  const counts = {}
  for (const e of rows) counts[e.group] = (counts[e.group] || 0) + 1
  let group = null, section = null
  const secCount = {}
  for (const e of rows) if (SECTION_OF[e.group]) secCount[SECTION_OF[e.group]] = (secCount[SECTION_OF[e.group]] || 0) + 1
  for (const e of rows) {
    const sec = grouped && e.group !== '__liked' ? SECTION_OF[e.group] || null : null
    if (grouped && sec !== section) {
      section = sec
      if (sec) {
        const key = 'sec:' + sec, closed = listUI.collapsed.includes(key)
        const h = document.createElement('h3')
        h.className = 'section'
        h.innerHTML = `<button class="grouphead" aria-expanded="${!closed}"><span>${closed ? '📁' : '📂'} ${SECTIONS[sec]}</span><small>${secCount[sec]}</small></button>`
        h.firstChild.onclick = () => {
          listUI.collapsed = closed ? listUI.collapsed.filter((x) => x !== key) : [...new Set([...listUI.collapsed, key])]
          keepList()
          renderGallery()
        }
        g.append(h)
      }
    }
    if (sec && listUI.collapsed.includes('sec:' + sec)) continue
    if (grouped && e.group !== group) {
      group = e.group
      const closed = listUI.collapsed.includes(group)
      const h = document.createElement('h3')
      if (sec) h.className = 'sub'
      h.innerHTML = `<button class="grouphead" aria-expanded="${!closed}"><span>${closed ? '▸' : '▾'} ${group === '__liked' ? '♥ Liked by me' : GROUPS[group] || group}</span><small>${counts[group]}</small></button>`
      const name = group // the loop moves on; the click needs this heading's group
      h.firstChild.onclick = () => {
        listUI.collapsed = closed ? listUI.collapsed.filter((x) => x !== name) : [...new Set([...listUI.collapsed, name])]
        keepList()
        renderGallery()
      }
      g.append(h)
    }
    if (grouped && listUI.collapsed.includes(e.group)) continue
    g.append(e.design ? designCard(e) : ideaCard(e))
  }
}

function designCard(e) {
  const d = e.design, g = $('gallery')
  const b = document.createElement('button')
  b.className = 'design'
  b.setAttribute('aria-pressed', d.id === state.design)
  const cm = d.cnc ? matOf(cncDefaults(d)) : null
  const tag = !cm ? '' : `<span class="cutTag ${cm.kind}">⚙️ ${d.spokeHub ? 'machined metal · fire spokes' : cm.kind === 'metal' ? `CNC · ${cm.name.split(' ')[0].toLowerCase()} · fire` : `CNC · ${cm.name.split(' ')[0]} · practice`}</span>`
  b.innerHTML = `<canvas width="128" height="128"></canvas><div><b>${d.name}</b>${tag}<small>${d.blurb.split('. ')[0].replace(/\.$/, '')}.</small></div>${heartHTML(e)}`
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
    if (cncOnly(d) && !isCnc()) return setMode('cnc') // spark cages are only ever cut in steel
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

async function fillThumbs() {
  for (const d of DESIGNS) {
    try {
      const p = { ...state.params[d.id] }
      const k = keyOf(d.id, p)
      if (!cache.has(k)) remember(k, await thumbWork('build', { design: d.id, params: p, material: state.material, bed: Number(state.bed) }))
      setThumb(d, cache.get(k).polygons, cache.get(k).viewR || p.diameter / 2)
      // someone is waiting on exactly this hub: show it now
      if (k === keyOf(state.design, params())) rebuild()
    } catch {}
  }
}

// ------------------------------------------------------------------ build --
let current = null
let timer = 0
let ticket = 0

// Built hubs, most recent last. The gallery thumbnails build every design in
// the background, so most clicks on a design are answered from here at once.
const cache = new Map()
const keyOf = (id, p, mode = 'print') => JSON.stringify([id, p, state.material, state.bed, mode === 'cnc' ? state.cncp[id] : 0])
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
      ? await work('cnc', { design: d.id, params: p, cnc: { ...cncp() } })
      : await work('build', { design: d.id, params: p, material: state.material, bed: Number(state.bed) })
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
  setGeo(glowMesh, m.glow)
  setGeo(lidMesh, m.lids)
  setGeo(ringMesh, m.ring)
  setGeo(snapMesh, m.snap)
  setGeo(rodMesh, m.rods)
  setGeo(kevMesh, m.kevlar)
  setGeo(pracMesh, m.practice)
  $('vSpokes').hidden = !(m.rods || m.kevlar || m.practice)
  $('vSpokes').textContent = hub.spoke ? 'Spokes' : 'Wicks / ends'
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
  pole.visible = !(hub.ball || hub.novelty || hub.dart || hub.cage || hub.sleeve || hub.practiceSpoke || hub.grip) && $('vPole').getAttribute('aria-pressed') === 'true' // a ball end sits on the pole's tip
  const poleD = hub.adaptor ? p.small : p.poleOD // an adaptor shows its thin pole running through it
  frameView(hub.viewR || p.diameter / 2)
  pole.scale.set(poleD / 22, 1, poleD / 22)
  if (!hub.cnc && !(hub.spoke && hub.spoke.mode === 'cnc')) setThumb(d, hub.polygons, hub.viewR || p.diameter / 2)
  applyLook()
  renderGuide()
  renderVerdict(hub, p)
  renderExports()
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
    <div class="row"><span>Rope eye</span><span>Ø${(2 * v.eyeR).toFixed(1)} mm for ${p.ropeD} mm rope</span></div>
    <div class="row"><span>Same shape in</span><span>TPU ${((v.vol / 1000) * 1.21).toFixed(0)} g · alu ${((v.vol / 1000) * 2.7).toFixed(0)} g · brass ${((v.vol / 1000) * 8.5).toFixed(0)} g</span></div>
    <div class="row"><span>${cnc ? 'Made on' : 'Prints'}</span><span>${cnc ? (v.turned ? 'a lathe (drawing below)' : '4-axis mill or metal 3D print') : 'eye-down, with a brim'}</span></div>
    ${!cnc && !state.material.startsWith('tpu') ? '<div class="warnline">A rope dart hits you: print it in TPU for practice.</div>' : ''}
    ${s.warns.map((w) => `<div class="warnline">${w}</div>`).join('')}`
}

function renderNoveltyVerdict(hub, p, mat) {
  const s = hub.stats, v = hub.novelty
  $('verdict').innerHTML = `
    <div class="big">${s.gramsTotal.toFixed(0)} g<small>${s.gShot ? 'with its steel shot' : 'at 100% infill'} · ${(s.gramsTotal * 2).toFixed(0)} g a pair</small></div>
    ${s.gShot ? `<div class="row"><span>Print · steel shot</span><span>${s.grams.toFixed(0)} g · ${s.gShot.toFixed(0)} g</span></div>
    <div class="row"><span>Pause the print at</span><span>${s.pauseAt.toFixed(1)} mm: fill the chambers with steel shot</span></div>` : ''}
    <div class="row"><span>Balance point</span><span>${s.comAbove.toFixed(0)} mm past the pole tip${s.gShot ? ` (${s.comPrinted.toFixed(0)} mm without shot)` : ''} · ${s.comOff < 0.3 ? pill('good', 'on the axis') : pill('warn', s.comOff.toFixed(1) + ' mm off')}</span></div>
    <div class="row"><span>Size</span><span>${v.width.toFixed(0)} wide × ${v.height.toFixed(0)} mm tall</span></div>
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
    <div class="row"><span>As heavy as it gets</span><span>${kg(s.gShell + b.fullShot)} packed with steel shot</span></div>
    <div class="row"><span>Chamber holds</span><span>${b.cavityCm3.toFixed(0)} cm³ · up to ${b.fullShot.toFixed(0)} g of steel shot</span></div>
    <div class="row"><span>Ball · socket</span><span>Ø${p.ballD} mm · ${b.depth.toFixed(0)} mm deep</span></div>
    <div class="row"><span>Grip on Ø${p.poleOD} pole</span><span>${b.squeeze > 0 ? b.squeeze.toFixed(2) + ' mm squeeze' : pill('bad', 'loose')}</span></div>
    <div class="row"><span>Prints as</span><span>3 parts, no supports</span></div>
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
  const s = hub.stats
  const mat = MATERIALS[state.material]
  if (hub.adaptor) return renderAdaptorVerdict(hub, p, mat)
  if (hub.cage) return renderCageVerdict(hub, p)
  if (hub.grip) return renderGripVerdict(hub, p, mat)
  if (hub.dart) return renderDartVerdict(hub, p, mat)
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
  const hub = hub0 && (hub0.cnc || hub0.spoke || hub0.cage || hub0.dart) ? hub0 : null // a print build still on screen does not count
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
    $('exportNote').innerHTML = `<b>Send the DXF</b> to a laser or waterjet shop: ${c.thick} mm ${matOf(c).name}. Layers: <b>CUT</b> outline, <b>HOLES</b> spark holes and fixings, <b>BEND</b> fold lines (not cut: ask them to fold on these, or fold it yourself in a vice, every fold 90° the same way). ${d.kind === 'diamond' ? 'Fold every BEND line to make the diamond, then stitch the open edges with 1 mm stainless wire through the small holes; leave one edge as the loading door, tied with a twist of wire.' : d.kind === 'tube' ? 'Roll the big rectangle into a tube round a pipe, overlap the seam and rivet it; fold the cap tabs down and bolt the caps in with M4 stainless bolts (one cap comes off to load).' : 'Fold the sides up, fold the tabs in and pop-rivet them (3.2 mm stainless rivets), then fold the lid over and bolt its tab to the front with an M5 bolt. ' + (d.kind === 'box' ? 'The floor bolts to a flange collar on the staff end.' : 'Each cube goes on a spoke tip: an 8 mm threaded spoke end through the floor hole, a nut and washer inside and out.')}`
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
  const d = design()
  const box = $('exports')
  const m = current && current.design === d ? current.hub.meshes : null
  if ((isCnc() && !printOnly(d)) || d.spokeHub) return renderCutExports(d)
  if (d.dart) {
    const p = params()
    exportButtons([
      ['STL (print eye-down)', 'primary', () => download(toSTL(m.printFlat, d.name), `rope-dart-${d.id}-${p.length}mm.stl`), !m?.printFlat],
      ...(m?.plugFlat ? [['Capsule plug STL', '', () => download(toSTL(m.plugFlat, d.name + ' plug'), `rope-dart-${d.id}-plug.stl`), false]] : []),
    ])
    $('exportNote').innerHTML = 'Print it standing on its eye as it comes, TPU 95A for practice (it will hit you), 100% infill for weight, with a brim. Thread the rope through the eye and tie it off with a stopper knot or a figure-eight loop. Want it heavier or for fire practice in metal? Switch to CNC: the classic shapes come with a lathe drawing.'
    return
  }
  if (d.novelty) {
    const p = params()
    exportButtons([
      ['STL', 'primary', () => download(toSTL(m.combined, d.name), `contact-end-${d.kind}-${p.poleOD}pole.stl`), !m],
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
      ['Fit-test ring', '', async () => download(toSTL(await work('fit', { params: params() }), 'fit test'), `fit-test-${params().poleOD}pole-${params().fit}clear.stl`)],
    ])
    $('exportNote').innerHTML = 'Print all three flat as they come, no supports, TPU 95A, 3+ walls. Print the fit-test ring first and push it on your pole. Press the joiner ring into the lower half, pour in any sand or steel shot, then press the upper half on. A drop of TPU-safe glue (or a hot soldering iron run round the seam) makes it permanent. Push the ball onto the staff end; the ribs grip it.'
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
  if (isCnc() && !printOnly(design())) return renderCutGuide()
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
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  donateNudge()
}

// After a download: a friendly, optional nudge to support Dreamscape. Never blocks
// anything, shows at most once a day, gone on its own after a few seconds.
function donateNudge() {
  const KEY = 'forge-donate-nudge', DAY = 24 * 3600 * 1000
  try { if (Date.now() - Number(localStorage.getItem(KEY) || 0) < DAY) return; localStorage.setItem(KEY, String(Date.now())) } catch {}
  document.getElementById('donateNudge')?.remove()
  const el = document.createElement('div')
  el.id = 'donateNudge'
  el.setAttribute('role', 'status')
  el.innerHTML = `<p><b>Your file is downloading. Happy printing! 🐉</b><br>The forge is free for everyone. If it helped, you can support Dreamscape, totally optional.</p>
    <div><a class="btn primary" href="https://dream.sc/donate?for=dragon-hub-forge" target="_blank" rel="noopener">♥ Support (optional)</a><button class="btn" type="button">Maybe later</button></div>`
  el.querySelector('button').onclick = () => el.remove()
  document.body.append(el)
  setTimeout(() => el.remove(), 15000)
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
toggle('vSpokes', true, (on) => { view.spokes = on; for (const m of [rodMesh, kevMesh, pracMesh]) m.visible = on && !!m.geometry.attributes.position })
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
  if (cncOnly(design())) state.design = DESIGNS.find((d) => !d.adaptor && !d.custom && !d.cncOnly).id // a spark cage can't be printed
  setMode('print')
}
$('modeCnc').onclick = () => setMode('cnc')
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
