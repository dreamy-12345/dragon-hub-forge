import * as THREE from 'three'
import { OrbitControls } from './vendor/OrbitControls.js'
import { DESIGNS, COMMON_PARAMS, MATERIALS, defaults, toSTL, toSVG, to3MF } from './hub.js'
import { LED_MODES, PAGE_NAMES } from './leds.js'
import { BubbleSim } from './bubbles.js'
import { initCreate } from './create.js'

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
const GROUPS = { Creations: 'Your creations', Adaptors: 'Pole adaptors', Glow: 'Glowing lanterns', Spin: 'Made for spinning', Creatures: 'Creatures', Organic: 'Organic', Classics: 'Classics', Claude: "Claude's own", Earth: 'Earth fractals', 'Fractal creatures': 'Fractal creatures', Thai: 'Thai mythology', Maori: 'Māori-inspired (moko & whakairo)', Dreamscape: 'Dreamscape', Dogs: 'Dogs', LoyalDog: 'The loyal dog', Signature: 'Signature', Melt: 'Melted' }

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
ctlFace.enableRotate = false // face-on stays face-on: zoom and pan only
ctlFace.target.set(0, 0, 8)
const ctlAngle = new OrbitControls(camAngle, canvas)
ctlAngle.enableDamping = true
ctlAngle.target.set(0, 0, 8)
// cameras were placed for a ~140 mm radius hub; scale them for much smaller parts
let framedR = 140
function frameView(R) {
  const want = R < 60 ? R * 1.9 : 140 // a small part fills about the same share of the view as a hub
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
  pole.material.color.set(dark ? 0x050506 : 0x1b1b1f)
  bed.visible = !dark && $('vBed').getAttribute('aria-pressed') === 'true'
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
        b.textContent = `${v} mm`
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

function renderParams() {
  const d = design()
  const dp = $('designParams')
  dp.innerHTML = '<h2>Design</h2>'
  const set = (key) => (v) => { params()[key] = v; schedule() }
  for (const def of d.params) dp.append(control(def, () => params()[def.key], set(def.key)))
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
  const groups = d.adaptor ? [] : [...new Set(COMMON_PARAMS.map((p) => p.group))].filter((g) => g !== 'Glow' || d.pods)
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
  reset.onclick = () => { state.params[d.id] = defaults(d); renderParams(); schedule() }
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

function renderGallery() {
  const g = $('gallery')
  g.querySelectorAll('.design, h3').forEach((n) => n.remove())
  let group = null
  const order = [...new Set(DESIGNS.map((d) => d.group))] // each group once, in first-seen order
  for (const d of [...DESIGNS].sort((x, y) => order.indexOf(x.group) - order.indexOf(y.group))) {
    if (d.group !== group) {
      group = d.group
      g.insertAdjacentHTML('beforeend', `<h3>${GROUPS[group] || group}</h3>`)
    }
    const b = document.createElement('button')
    b.className = 'design'
    b.setAttribute('aria-pressed', d.id === state.design)
    b.innerHTML = `<canvas width="128" height="128"></canvas><div><b>${d.name}</b><small>${d.blurb.split('. ')[0].replace(/\.$/, '')}.</small></div>`
    b.onclick = () => {
      state.design = d.id
      g.querySelectorAll('.design').forEach((n) => n.setAttribute('aria-pressed', n === b))
      if (d.colors) {
        // designs that only work in particular colours set them
        state.color = d.colors.A
        state.colorB = d.colors.B
        for (const [box, hex] of [['swatches', d.colors.A], ['swatchesB', d.colors.B]])
          $(box).querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-pressed', s.style.background && new THREE.Color(s.style.background).getHexString() === hex.slice(1)))
      }
      renderParams()
      applyLook()
      schedule(0)
    }
    g.append(b)
    d._btn = b
    d._thumb = b.querySelector('canvas')
  }
  renderCreationButtons()
}

// saved creations sit right under "My creation" in the list; a click opens them in Create
const builtHooks = []
let creationList = [], creator = null
function renderCreationButtons() {
  const anchor = DESIGNS.find((d) => d.custom)?._btn
  if (!anchor) return
  document.querySelectorAll('.design.creation').forEach((n) => n.remove())
  let after = anchor
  for (const idea of creationList) {
    const b = document.createElement('button')
    b.className = 'design creation'
    b.innerHTML = `<img alt="" width="64" height="64" style="width:64px;height:64px"><div><b></b><small></small></div>`
    if (idea.thumb) b.querySelector('img').src = idea.thumb
    b.querySelector('b').textContent = idea.name || 'Untitled'
    b.querySelector('small').textContent = [idea.note, `${Number(idea.grams || 0).toFixed(0)} g`].filter(Boolean).join(' · ')
    b.onclick = () => creator?.openCreation(idea)
    after.after(b)
    after = b
  }
}

async function fillThumbs() {
  for (const d of DESIGNS) {
    try {
      const p = { ...state.params[d.id] }
      const k = keyOf(d.id, p)
      if (!cache.has(k)) remember(k, await thumbWork('build', { design: d.id, params: p, material: state.material, bed: Number(state.bed) }))
      drawThumb(d._thumb, cache.get(k).polygons, cache.get(k).viewR || p.diameter / 2, d.glow)
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
const keyOf = (id, p) => JSON.stringify([id, p, state.material, state.bed])
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
  const k = keyOf(d.id, p)
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
    hub = await work('build', { design: d.id, params: p, material: state.material, bed: Number(state.bed) })
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
  $('ringColourRow').hidden = !(m.ring || m.snap)
  $('glowRow').hidden = $('ledRow').hidden = !hasLeds() // the LED ring can switch them on for any design
  weakGroup.clear()
  for (const poly of hub.polygons.weak) {
    const w = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)))), weakMat)
    w.position.z = p.frameH + 0.3
    weakGroup.add(w)
  }
  drawHalo(hub, p)
  const poleD = hub.adaptor ? p.small : p.poleOD // an adaptor shows its thin pole running through it
  frameView(hub.viewR || p.diameter / 2)
  pole.scale.set(poleD / 22, 1, poleD / 22)
  if (d._thumb) drawThumb(d._thumb, hub.polygons, hub.viewR || p.diameter / 2, d.glow)
  applyLook()
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

function renderVerdict(hub, p) {
  const s = hub.stats
  const mat = MATERIALS[state.material]
  if (hub.adaptor) return renderAdaptorVerdict(hub, p, mat)
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

function renderExports() {
  const d = design()
  const box = $('exports')
  const m = current && current.design === d ? current.hub.meshes : null
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

function renderGuide() {
  const m = MATERIALS[state.material]
  $('matNote').textContent = m.note
  const tpu = state.material.startsWith('tpu')
  $('guide').innerHTML = `<h2>Printing it tough</h2>
    <ul>
      <li><b>Flat on the bed</b>, as shown. Layer lines run round the disc, so a hit on the rim loads the strong direction.</li>
      <li><b>${tpu ? '100% infill, or 5+ walls with 40% gyroid.' : '6 walls, 50% gyroid.'}</b> In thin struts the walls carry the load.</li>
      <li><b>Flowforge's filament:</b> "flexible polyurethane", which is TPU. They do not give the hardness; 95A is the common, safe choice. Their UV colours are green, pink, yellow and orange. For UV, buy TPU sold as fluorescent or UV-reactive and check it under a UV torch.</li>
      ${tpu ? `<li><b>Slow: 20–35 mm/s</b>, direct drive, little retraction. Dry TPU first (50 °C, 6 h); wet TPU prints stringy and weak.</li>
      <li><b>Glowing lanterns:</b> clear or natural TPU at 100% infill glows evenly. Infill patterns show up as shadows when lit.</li>
      <li><b>Bed:</b> TPU welds to PEI. Use glue stick as a release layer on smooth PEI.</li>` : ''}
      ${state.material === 'pa' ? '<li><b>Nylon:</b> enclosure on, dry it hard (70 °C, 8 h), brim to stop the rim lifting.</li>' : ''}
      <li><b>Capsules:</b> push in through the top slot and they snap past the lips. Pick the mode first (or use the Flowtoys remote) since the button ends up inside. Capsules sync over radio, so every lantern can run the same pattern.</li>
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

const matSel = $('material')
for (const [k, m] of Object.entries(MATERIALS)) matSel.add(new Option(`${m.name}${m.verdict === 'avoid' ? ' (looks only)' : ''}`, k))
matSel.value = state.material
matSel.onchange = () => { state.material = matSel.value; renderGuide(); schedule(0) }
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
// Saved designs: on dream.sc they live in the project's dreamDB (one key per
// design); run locally with server.mjs they go through api/ideas; the portable
// single-file build keeps them in this browser, seeded with the designs saved so far.
const DB = !!(window.dreamDB && window.dreamDB.available)
const LOCAL = !DB && !!window.__PORTABLE
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
  : DB
  ? {
      list: async () => (await dreamDB.list('ideas/')).map((r) => r.value),
      add: async (body) => {
        const idea = { ...body, id: crypto.randomUUID(), time: new Date().toISOString(), votes: 0 }
        await dreamDB.set('ideas/' + idea.id, idea)
      },
      vote: async (idea) => {
        const cur = (await dreamDB.get('ideas/' + idea.id)) || idea
        await dreamDB.set('ideas/' + idea.id, { ...cur, votes: (cur.votes || 0) + 1 })
      },
      remove: (idea) => dreamDB.remove('ideas/' + idea.id),
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

if (LOCAL && $('savedWhere')) $('savedWhere').textContent = 'Portable copy: designs save in this browser only. Starts with the designs saved so far.'
if (DB && $('savedWhere')) $('savedWhere').textContent = 'Shared with everyone who can open this project. Open restores every setting.'

async function loadIdeas() {
  let list = []
  try {
    list = await ideasApi.list()
  } catch {
    $('ideas').innerHTML = '<div class="empty">Shortlist server not reachable.</div>'
    return
  }
  creationList = list.filter((x) => x.design === 'custom').sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')))
  renderCreationButtons()
  const box = $('ideas')
  if (!list.length) {
    box.innerHTML = '<div class="empty">Nothing saved yet. Tune a hub you like, name it and press Save design.</div>'
    return
  }
  list.sort((a, b) => (b.votes || 0) - (a.votes || 0) || String(b.time || '').localeCompare(String(a.time || '')))
  box.innerHTML = ''
  for (const idea of list) {
    const d = DESIGNS.find((x) => x.id === idea.design)
    const el = document.createElement('div')
    el.className = 'idea'
    el.innerHTML = `<img alt=""><div><b></b><small></small></div>
      <div class="acts"><button data-a="load">Open</button><button data-a="vote">+1 · ${idea.votes || 0}</button><button data-a="del">Delete</button></div>`
    if (idea.thumb) el.querySelector('img').src = idea.thumb
    el.querySelector('b').textContent = idea.name || 'Untitled'
    el.querySelector('small').textContent = `${d ? d.name : idea.design || '?'} · ${Number(idea.grams || 0).toFixed(0)} g${idea.note ? ' · ' + idea.note : ''}`
    el.onclick = async (e) => {
      const a = e.target.dataset?.a
      if (a === 'load' && d?.custom) creator?.openCreation(idea)
      else if (a === 'load' && d) {
        state.design = d.id
        state.params[d.id] = { ...defaults(d), ...idea.params }
        if (idea.material in MATERIALS) { state.material = idea.material; matSel.value = idea.material; renderGuide() }
        if (idea.color?.startsWith?.('glow:')) state.glow = idea.color.slice(5)
        renderGallery(); renderParams(); schedule(0); fillThumbs()
      } else if (a === 'vote') {
        await ideasApi.vote(idea); loadIdeas()
      } else if (a === 'del') {
        if (e.target.dataset.armed) { await ideasApi.remove(idea); loadIdeas() }
        else { e.target.dataset.armed = 1; e.target.textContent = 'Sure?' }
      }
    }
    box.append(el)
  }
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
