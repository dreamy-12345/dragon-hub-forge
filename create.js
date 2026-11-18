// Create: draw or drop in a picture, the forge traces it, fits it round the
// staff (designs-custom.js) and fixes it to print (hub.js). Three steps on one
// screen, live preview on every change, undo everywhere, state remembered.

// ------------------------------------------------------------ tracing --
/**
 * Outline every filled region of a W×H mask (1 = ink) by walking pixel edges.
 * Outer loops come out counter-clockwise and holes clockwise (y up): what the
 * hub's Positive fill wants.
 */
export function traceMask(mask, W, H) {
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x]
  const out = new Map() // vertex key -> list of [x2, y2]
  const key = (x, y) => y * (W + 1) + x
  const add = (x1, y1, x2, y2) => {
    const k = key(x1, y1)
    if (!out.has(k)) out.set(k, [])
    out.get(k).push([x2, y2])
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue
      if (!at(x, y - 1)) add(x, y, x + 1, y)
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1)
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1)
      if (!at(x - 1, y)) add(x, y + 1, x, y)
    }
  const loops = []
  for (const [k0, list] of out) {
    while (list.length) {
      let [x, y] = [k0 % (W + 1), Math.floor(k0 / (W + 1))]
      const pts = [[x, H - y]]
      let next = list.pop()
      for (let guard = 0; guard < 1e6; guard++) {
        ;[x, y] = next
        if (key(x, y) === k0) break
        pts.push([x, H - y])
        const l = out.get(key(x, y))
        if (!l || !l.length) break
        next = l.pop()
      }
      if (pts.length >= 4) loops.push(pts.reverse()) // y flipped, so reverse: outer CCW, holes CW
    }
  }
  return loops
}

function area(l) {
  let a = 0
  for (let i = 0, j = l.length - 1; i < l.length; j = i++) a += l[j][0] * l[i][1] - l[i][0] * l[j][1]
  return a / 2
}

/** Ramer–Douglas–Peucker on a closed loop. */
function simplify(l, tol) {
  if (l.length < 8) return l
  const rdp = (pts) => {
    const [a, b] = [pts[0], pts.at(-1)]
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
    let worst = -1, wi = 0
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / L
      if (d > worst) (worst = d), (wi = i)
    }
    return worst > tol ? [...rdp(pts.slice(0, wi + 1)).slice(0, -1), ...rdp(pts.slice(wi))] : [a, b]
  }
  const half = l.length >> 1
  const r = [...rdp(l.slice(0, half + 1)).slice(0, -1), ...rdp([...l.slice(half), l[0]]).slice(0, -1)]
  return r.length >= 3 ? r : l
}

/** Chaikin corner cutting: rounds the pixel staircase into soft curves. */
function smooth(l, n) {
  for (let k = 0; k < n; k++) {
    const o = []
    for (let i = 0; i < l.length; i++) {
      const a = l[i], b = l[(i + 1) % l.length]
      o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    l = o
  }
  return l
}

/**
 * Canvas pixels -> unit-box loops for the custom design.
 * threshold 0-255 (darker than it = ink); invert flips light/dark; soft 0-3.
 * Returns { loops, ink } where ink is the share of pixels that were ink.
 */
export function traceCanvas(src, { threshold = 128, invert = false, soft = 1, res = 220 } = {}) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = res
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, res, res)
  ctx.drawImage(src, 0, 0, res, res)
  const px = ctx.getImageData(0, 0, res, res).data
  const mask = new Uint8Array(res * res)
  let ink = 0
  for (let i = 0; i < res * res; i++) {
    const lum = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]
    const on = (lum < threshold) !== invert
    mask[i] = on ? 1 : 0
    ink += mask[i]
  }
  let loops = traceMask(mask, res, res)
  const minA = res * res * 0.0004 // specks under ~0.04% of the picture
  loops = loops.filter((l) => Math.abs(area(l)) >= minA)
  loops = loops.map((l) => smooth(simplify(l, 0.9), soft)).filter((l) => l.length >= 3)
  const outers = loops.filter((l) => area(l) > 0)
  if (!outers.length) return { loops: [], ink: ink / (res * res) }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const l of outers) for (const [x, y] of l) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  const s = 1 / Math.max(x1 - x0, y1 - y0, 1e-6), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const r4 = (v) => Math.round(v * 1e4) / 1e4
  return { loops: loops.map((l) => l.map(([x, y]) => [r4((x - cx) * s), r4((y - cy) * s)])), ink: ink / (res * res) }
}

// ----------------------------------------------------------------- UI --
const LS = 'dragonhub-create'
const load = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') } catch { return {} } }
const keep = (o) => { try { localStorage.setItem(LS, JSON.stringify(o)) } catch {} }

const LEVEL_LABELS = { raised: 'Raised', flat: 'Flat', outline: 'Outline', 'outline on flat': 'Both' }

/**
 * api (from app.js): params(), selectCustom(), schedule(ms), renderParams(),
 * current(), onBuilt(fn), ideasApi, refreshIdeas(), balance(), download(kind),
 * thumb(), material(), status(text)
 */
export function initCreate(api) {
  const $ = (id) => document.getElementById(id)
  const panel = $('createPanel')
  const S = Object.assign({ open: false, threshold: 128, invert: false, soft: 1, brush: 14, tool: 'brush', author: '' }, load())
  const save = () => keep(S)

  // --------------------------------------------------------- drawing pad
  const pad = $('cPad')
  const pctx = pad.getContext('2d', { willReadFrequently: true })
  const W = pad.width, H = pad.height
  const undo = [], redo = []
  const snap = () => pctx.getImageData(0, 0, W, H)
  const pushUndo = () => { undo.push(snap()); if (undo.length > 40) undo.shift(); redo.length = 0; syncUndo() }
  const blank = () => { pctx.fillStyle = '#fff'; pctx.fillRect(0, 0, W, H) }
  blank()
  const syncUndo = () => { $('cUndo').disabled = !undo.length; $('cRedo').disabled = !redo.length }
  let drawn = false
  const empty = () => {
    const d = pctx.getImageData(0, 0, W, H).data
    for (let i = 0; i < d.length; i += 16) if (d[i] < 200) return false
    return true
  }
  const storeDrawing = debounce(() => { S.drawing = pad.toDataURL('image/png'); save() }, 400)

  if (S.drawing) {
    const img = new Image()
    img.onload = () => { pctx.drawImage(img, 0, 0, W, H); drawn = !empty(); retrace() }
    img.src = S.drawing
  }

  let last = null
  const pos = (e) => {
    const r = pad.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]
  }
  const stroke = (a, b) => {
    pctx.strokeStyle = pctx.fillStyle = S.tool === 'eraser' ? '#fff' : '#111'
    pctx.lineWidth = S.brush * (S.tool === 'eraser' ? 1.6 : 1)
    pctx.lineCap = pctx.lineJoin = 'round'
    pctx.beginPath(); pctx.moveTo(a[0], a[1]); pctx.lineTo(b[0], b[1]); pctx.stroke()
  }
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    pad.setPointerCapture(e.pointerId)
    pushUndo()
    last = pos(e)
    stroke(last, [last[0] + 0.01, last[1]])
  })
  pad.addEventListener('pointermove', (e) => {
    if (!last) return
    const p = pos(e)
    stroke(last, p)
    last = p
    retraceSoon()
  })
  const end = () => { if (!last) return; last = null; drawn = true; retrace(); storeDrawing() }
  pad.addEventListener('pointerup', end)
  pad.addEventListener('pointercancel', end)

  const setTool = (t) => {
    S.tool = t; save()
    $('cBrush').setAttribute('aria-pressed', t === 'brush')
    $('cEraser').setAttribute('aria-pressed', t === 'eraser')
  }
  $('cBrush').onclick = () => setTool('brush')
  $('cEraser').onclick = () => setTool('eraser')
  setTool(S.tool)
  for (const b of panel.querySelectorAll('[data-size]')) {
    b.onclick = () => { S.brush = Number(b.dataset.size); save(); syncSize() }
  }
  const syncSize = () => panel.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.size) === S.brush))
  syncSize()
  $('cUndo').onclick = () => { if (!undo.length) return; redo.push(snap()); pctx.putImageData(undo.pop(), 0, 0); syncUndo(); afterEdit() }
  $('cRedo').onclick = () => { if (!redo.length) return; undo.push(snap()); pctx.putImageData(redo.pop(), 0, 0); syncUndo(); afterEdit() }
  $('cClear').onclick = () => { pushUndo(); blank(); afterEdit() }
  const afterEdit = () => { drawn = !empty(); retrace(); storeDrawing() }
  syncUndo()

  // ------------------------------------------------------------ pictures
  const placeImage = (img) => {
    pushUndo()
    blank()
    const m = 0.08 * W, s = Math.min((W - 2 * m) / img.width, (H - 2 * m) / img.height)
    const w = img.width * s, h = img.height * s
    pctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
    // light picture on a dark background: swap so the subject is the ink
    const d = pctx.getImageData(0, 0, W, H).data
    let dark = 0, n = 0
    for (let x = 0; x < W; x += 4) for (const y of [2, H - 3]) { const i = (y * W + x) * 4; dark += d[i] + d[i + 1] + d[i + 2] < 3 * 110 ? 1 : 0; n++ }
    for (let y = 0; y < H; y += 4) for (const x of [2, W - 3]) { const i = (y * W + x) * 4; dark += d[i] + d[i + 1] + d[i + 2] < 3 * 110 ? 1 : 0; n++ }
    S.invert = dark / n > 0.6
    $('cInvert').checked = S.invert
    afterEdit()
    say('Got it! The forge traced your picture. Tweak it in step 2.', 'good')
  }
  const readFile = (f) => {
    if (!f) return
    if (!/^image\//.test(f.type) && !/\.svg$/i.test(f.name)) return say('That file is not a picture. Try a PNG, JPG or SVG.', 'bad')
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => { placeImage(img); URL.revokeObjectURL(url) }
    img.onerror = () => say('Could not open that picture. Try saving it as PNG first.', 'bad')
    img.src = url
  }
  $('cFile').onchange = (e) => { readFile(e.target.files[0]); e.target.value = '' }
  $('cPick').onclick = () => $('cFile').click()
  for (const el of [pad, panel]) {
    el.addEventListener('dragover', (e) => { e.preventDefault(); panel.classList.add('drop') })
    el.addEventListener('dragleave', () => panel.classList.remove('drop'))
    el.addEventListener('drop', (e) => { e.preventDefault(); panel.classList.remove('drop'); readFile(e.dataTransfer.files[0]) })
  }
  window.addEventListener('paste', (e) => {
    if (!S.open) return
    const f = [...(e.clipboardData?.files || [])][0]
    if (f) readFile(f)
  })

  // ------------------------------------------------------------- tracing
  let traceTimer = 0
  const retraceSoon = () => { clearTimeout(traceTimer); traceTimer = setTimeout(retrace, 250) }
  function retrace() {
    clearTimeout(traceTimer)
    const p = api.params()
    if (!drawn) {
      p.shape = null
      say('Draw something or drop a picture in. The star is just a stand-in.', '')
    } else {
      const { loops, ink } = traceCanvas(pad, { threshold: S.threshold, invert: S.invert, soft: S.soft })
      if (!loops.length) {
        p.shape = null
        return say(ink > 0.9 ? 'It is all ink. Tick "Swap dark and light" in Fine-tune.' : 'Nothing dark enough to trace. Draw thicker, or raise "Darkness" in Fine-tune.', 'bad'), api.schedule(150)
      }
      p.shape = loops
    }
    api.selectCustom()
    api.schedule(150)
  }

  // ------------------------------------------------------- step 2 controls
  const hist = [], fwd = []
  const SETTINGS = ['copies', 'size', 'turn', 'push', 'level', 'mirror', 'lineW']
  const shot = () => Object.fromEntries(SETTINGS.map((k) => [k, api.params()[k]]))
  const change = (fn) => {
    hist.push(shot()); if (hist.length > 60) hist.shift(); fwd.length = 0
    fn(api.params())
    syncControls()
    api.renderParams()
    api.schedule(120)
  }
  $('cSetUndo').onclick = () => { if (!hist.length) return; fwd.push(shot()); Object.assign(api.params(), hist.pop()); syncControls(); api.renderParams(); api.schedule(0) }
  $('cSetRedo').onclick = () => { if (!fwd.length) return; hist.push(shot()); Object.assign(api.params(), fwd.pop()); syncControls(); api.renderParams(); api.schedule(0) }

  const bindRange = (id, key, fmt) => {
    const el = $(id)
    el.addEventListener('pointerdown', () => { hist.push(shot()); fwd.length = 0 })
    el.addEventListener('keydown', () => { hist.push(shot()); fwd.length = 0 })
    el.oninput = () => { api.params()[key] = Number(el.value); $(id + 'Out').textContent = fmt(el.value); api.renderParams(); api.schedule(120) }
  }
  bindRange('cCopies', 'copies', (v) => (v === '1' ? '1 (with counterweight)' : `${v} round the staff`))
  bindRange('cSize', 'size', (v) => `${v}%`)
  bindRange('cTurn', 'turn', (v) => `${v}°`)
  bindRange('cPush', 'push', (v) => (v == 0 ? 'middle' : v < 0 ? 'towards staff' : 'towards rim'))
  bindRange('cLine', 'lineW', (v) => `${v} mm`)
  for (const b of panel.querySelectorAll('[data-level]')) b.onclick = () => change((p) => (p.level = b.dataset.level))
  $('cMirror').onchange = (e) => change((p) => (p.mirror = e.target.checked ? 'on' : 'off'))
  $('cDark').oninput = (e) => { S.threshold = Number(e.target.value); $('cDarkOut').textContent = e.target.value; save(); retraceSoon() }
  $('cInvert').onchange = (e) => { S.invert = e.target.checked; save(); retrace() }
  $('cSoft').oninput = (e) => { S.soft = Number(e.target.value); $('cSoftOut').textContent = ['sharp', 'soft', 'softer', 'softest'][S.soft]; save(); retraceSoon() }
  $('cSurprise').onclick = () => change((p) => {
    const pick = (a) => a[Math.floor(Math.random() * a.length)]
    p.copies = pick([3, 4, 5, 6, 6, 7, 8, 9, 12])
    p.level = pick(['raised', 'raised', 'outline', 'outline on flat', 'flat'])
    p.mirror = Math.random() < 0.35 && p.copies % 2 === 0 ? 'on' : 'off'
    p.turn = pick([0, 0, 0, 15, -15, 30, -30, 45, 90, 180])
    p.size = 70 + Math.floor(Math.random() * 31)
    p.push = pick([0, 0, -40, 40])
  })

  function syncControls() {
    const p = api.params()
    const set = (id, v, txt) => { $(id).value = v; $(id + 'Out').textContent = txt }
    set('cCopies', p.copies, p.copies === 1 ? '1 (with counterweight)' : `${p.copies} round the staff`)
    set('cSize', p.size, `${p.size}%`)
    set('cTurn', p.turn, `${p.turn}°`)
    set('cPush', p.push, p.push == 0 ? 'middle' : p.push < 0 ? 'towards staff' : 'towards rim')
    set('cLine', p.lineW, `${p.lineW} mm`)
    panel.querySelectorAll('[data-level]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.level === p.level))
    $('cMirror').checked = p.mirror === 'on'
    $('cDark').value = S.threshold; $('cDarkOut').textContent = S.threshold
    $('cInvert').checked = S.invert
    $('cSoft').value = S.soft; $('cSoftOut').textContent = ['sharp', 'soft', 'softer', 'softest'][S.soft]
    $('cSetUndo').disabled = !hist.length
    $('cSetRedo').disabled = !fwd.length
  }

  // ---------------------------------------------------- feedback + party
  function say(text, kind) {
    const m = $('cMsg')
    m.textContent = text
    m.className = 'cmsg ' + (kind || '')
  }
  let wasReady = false, balancing = false
  api.onBuilt(async (hub, d) => {
    if (d.id !== 'custom' || !S.open) return
    const s = hub.stats
    const p = api.params()
    // one copy: let the forge tune the counterweight until it spins true
    if (p.copies === 1 && s.centroidOffset > 0.1 && !balancing && p.cw > 0) {
      balancing = true
      say('Balancing the counterweight…', '')
      try { await api.balance() } finally { setTimeout(() => (balancing = false), 1500) }
      return
    }
    const list = $('cFixes')
    list.innerHTML = ''
    for (const f of s.fixes || []) list.insertAdjacentHTML('beforeend', `<li>✓ ${f}</li>`)
    if (s.dropped) list.insertAdjacentHTML('beforeend', `<li>✓ left out ${s.dropped} loose bit${s.dropped > 1 ? 's' : ''} it could not join</li>`)
    const bed = Number(document.getElementById('bed')?.value || 300)
    const checks = [
      ['One piece', s.parts === 1],
      ['Spins balanced', s.centroidOffset < 0.5],
      ['Strong enough', s.weakArea < 150],
      ['Fits the printer', p.diameter <= bed - 2],
    ]
    $('cChecks').innerHTML = checks.map(([t, ok]) => `<span class="pill ${ok ? 'good' : 'warn'}">${ok ? '✓' : '!'} ${t}</span>`).join(' ')
    const ready = checks.every((c) => c[1])
    $('cWeight').textContent = `${s.gramsTotal.toFixed(0)} g`
    if (ready && !wasReady) party()
    if (ready) say(drawn ? 'Ready to print! Save it or grab the file in step 3.' : 'This is the stand-in star. Draw your own in step 1!', 'good')
    else if (s.weakArea >= 150) say('Some parts are thin (shown red). Try "Raised" or a bigger Size.', 'bad')
    else if (s.centroidOffset >= 0.5) say('A bit off-balance. Use 2 or more copies, or press Balance it.', 'bad')
    else say('Almost there. Check the red marks on the hub.', 'bad')
    wasReady = ready
  })
  function party() {
    const box = $('cParty')
    box.innerHTML = ''
    const colours = ['#f0a23b', '#6cd39a', '#ff6070', '#7fb2ff', '#f2c94c', '#d58cff']
    for (let i = 0; i < 28; i++) {
      const s = document.createElement('i')
      s.style.setProperty('--x', `${(Math.random() - 0.5) * 320}px`)
      s.style.setProperty('--y', `${-80 - Math.random() * 160}px`)
      s.style.setProperty('--r', `${Math.random() * 720 - 360}deg`)
      s.style.background = colours[i % colours.length]
      s.style.animationDelay = `${Math.random() * 120}ms`
      box.append(s)
    }
    setTimeout(() => (box.innerHTML = ''), 1600)
  }
  $('cBalance').onclick = () => api.balance()

  // --------------------------------------------------------------- step 3
  $('cAuthor').value = S.author || ''
  $('cAuthor').oninput = (e) => { S.author = e.target.value; save() }
  $('cSave').onclick = async () => {
    const cur = api.current()
    if (!cur || cur.design.id !== 'custom') return say('Wait a second for the hub to finish building, then save.', '')
    if (!drawn) return say('Draw or add a picture first: the star is not yours yet!', 'bad')
    const name = $('cName').value.trim() || `Creation ${new Date().toLocaleDateString([], { day: 'numeric', month: 'short' })}`
    const who = $('cAuthor').value.trim()
    try {
      await api.ideasApi.add({
        name, note: who ? `by ${who}` : '', design: 'custom', params: cur.params, material: api.material(),
        color: '', thumb: api.thumb(), grams: cur.hub.stats.gramsTotal,
      })
      $('cName').value = ''
      say(`Saved "${name}"! It is in Your creations.`, 'good')
      party()
      api.refreshIdeas()
      listCreations()
    } catch (e) {
      say('Could not save: ' + (e.message || e) + '. Try again in a moment.', 'bad')
    }
  }
  $('cStl').onclick = () => api.download('stl')
  $('c3mf').onclick = () => api.download('3mf')

  // ------------------------------------------------------- my creations
  async function listCreations() {
    let list = []
    try { list = (await api.ideasApi.list()).filter((x) => x.design === 'custom') } catch {}
    const box = $('cList')
    box.innerHTML = list.length ? '' : '<div class="empty">Nothing saved yet. Your first one goes here.</div>'
    list.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')))
    for (const idea of list) {
      const el = document.createElement('div')
      el.className = 'idea'
      el.innerHTML = `<img alt=""><div><b></b><small></small></div><div class="acts"><button data-a="open">Remix</button><button data-a="del">Delete</button></div>`
      if (idea.thumb) el.querySelector('img').src = idea.thumb
      el.querySelector('b').textContent = idea.name || 'Untitled'
      el.querySelector('small').textContent = [idea.note, `${Number(idea.grams || 0).toFixed(0)} g`].filter(Boolean).join(' · ')
      el.onclick = async (e) => {
        const a = e.target.dataset?.a
        if (a === 'open') openCreation(idea)
        else if (a === 'del') {
          if (e.target.dataset.armed) { await api.ideasApi.remove(idea); listCreations(); api.refreshIdeas() }
          else { e.target.dataset.armed = 1; e.target.textContent = 'Sure?' }
        }
      }
      box.append(el)
    }
    return list
  }

  /** Load a saved creation and paint its shape back onto the pad so it can be redrawn. */
  function openCreation(idea) {
    api.loadParams(idea.params)
    open(true)
    const shape = idea.params?.shape
    if (shape?.length) {
      pushUndo()
      blank()
      pctx.fillStyle = '#111'
      pctx.beginPath()
      const m = 0.1 * W, s = W - 2 * m
      for (const l of shape) l.forEach(([x, y], i) => (i ? pctx.lineTo : pctx.moveTo).call(pctx, W / 2 + x * s, H / 2 - y * s))
      pctx.fill('nonzero')
      drawn = true
      S.invert = false
      storeDrawing()
    }
    syncControls()
    say(`Remixing "${idea.name || 'Untitled'}". Draw on it or change the settings.`, 'good')
  }
  api.onOpenCreation?.(openCreation)

  // ---------------------------------------------------------- open/close
  function open(on) {
    S.open = on; save()
    document.body.classList.toggle('creating', on)
    panel.hidden = !on
    $('createBtn').setAttribute('aria-pressed', on)
    if (on) {
      api.selectCustom()
      syncControls()
      listCreations()
      api.schedule(0)
    }
  }
  $('createBtn').onclick = () => open(!S.open)
  $('cClose').onclick = () => open(false)

  // keyboard: B brush, E eraser, [ ] size, ⌘Z / ⇧⌘Z undo/redo (drawing first, then settings)
  window.addEventListener('keydown', (e) => {
    if (!S.open || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') && document.activeElement.type !== 'range') return
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      const drawUndo = e.shiftKey ? $('cRedo') : $('cUndo')
      ;(!drawUndo.disabled ? drawUndo : e.shiftKey ? $('cSetRedo') : $('cSetUndo')).click()
    } else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); $('cRedo').click() }
    else if (!mod && e.key === 'b') setTool('brush')
    else if (!mod && e.key === 'e') setTool('eraser')
    else if (!mod && (e.key === '[' || e.key === ']')) {
      const sizes = [6, 14, 28]
      const i = Math.max(0, Math.min(2, sizes.indexOf(S.brush) + (e.key === ']' ? 1 : -1)))
      S.brush = sizes[i]; save(); syncSize()
    }
  })

  if (S.open) open(true)
  return { open, listCreations, openCreation }
}

function debounce(fn, ms) {
  let t = 0
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) }
}
