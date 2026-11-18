// Help for Dragon Hub Forge: "What do you want to do?" cards, one short page per
// task with numbered steps and "Show me" buttons that point at the real control,
// a search over all of it, and an optional 60-second tour. Written for people who
// find busy screens hard: one idea per line, plain words, big targets, no walls
// of text, nothing forced. Opened with the "? Help" button or the ? key.

const $ = (id) => document.getElementById(id)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
// **bold** in step text = a button or label exactly as it reads on screen
const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')

// Where "Show me" points. A string is a CSS selector; {group} finds a settings
// group by its heading; {list} finds a heading in the design list.
const T = {
  create: '#createBtn', save: '#headerSave', donate: '.donateBtn', help: '#helpBtn',
  list: '#gallery', search: '#listQ', chips: '#listChips', sort: '#listSort', heart: '#gallery .heart',
  design: '#designParams', balance: '#designParams button.btn', common: '#commonParams',
  chipsView: '.toolbar', dark: '#vDark', uv: '#vUV', spin: '#vSpin', trails: '#vTrails', strobe: { sel: '#vStrobe', when: '**Zoetrope strobe** appears for moving-picture designs, like **Leaping Frogs** or **Galloping Hounds**.' },
  pip: '#vPip', bubbles: { sel: '#vBubbles', when: '**Bubbles** appears once **Bubble weight ring** is turned on.' }, weak: '#vWeak', pole: '#vPole', bed: '#vBed', spinRate: '#spinRate',
  led: { sel: '#ledMode', when: 'LED settings appear for lantern designs (like **Heart Lanterns**) or when **LED strip inside** is on.' },
  ledColour: '#glowSwatches',
  material: '#material', printer: '#bed', colA: '#swatches', colB: '#swatchesB', colRing: { sel: '#swatchesRing', when: 'Turn on a weight ring (**Snap-on weight ring** or **Bubble weight ring**) and this colour appears.' },
  verdict: '#verdict', saved: '#savedSection', ideaName: '#ideaName', saveIdea: '#saveIdea', ideas: '#ideas',
  exports: '#exports', exportNote: '#exportNote',
  cPad: '#cPad', cPick: '#cPick', cCopies: '#cCopies', cLevels: '#createPanel .levels', cSurprise: '#cSurprise',
  cBalance: '#cBalance', cChecks: '#cChecks', cName: '#cName', cSave: '#cSave', cStl: '#cStl', cClose: '#cClose',
}

const TOPICS = [
  {
    id: 'pick', icon: '🐉', title: 'Pick a design',
    steps: [
      ['The list on the left holds every design.', T.list],
      ['Tap any picture to load it in the middle.', T.list],
      ['Type in **Search designs** to find one by name.', T.search],
      ['Tap a heading (like **Organic**) to fold that group away.', T.list],
      ['Tap ♡ on a design you love. It goes to **♥ Liked by me** at the top.', T.heart],
    ],
    tip: 'On a phone the list scrolls sideways.',
  },
  {
    id: 'look', icon: '🎚️', title: 'Change how it looks',
    steps: [
      ['Under **Design** (right side) are this design’s own sliders. Drag one and watch the middle.', T.design],
      ['Below that are the shared settings, in folding groups: **Size**, **Levels**, **Pole size and fit** and more.', T.common],
      ['**Size** sets how wide the hub is (280 mm is standard) and the rim.', { group: 'Size' }],
      ['**Levels** sets how tall the raised shapes stand (10 mm is standard).', { group: 'Levels' }],
      ['Changed too much? **Reset … to defaults** is at the bottom of those groups.', T.common],
    ],
    tip: 'Every change rebuilds in a second or two. Nothing is saved until you press **Save design**.',
  },
  {
    id: 'colour', icon: '🎨', title: 'Colours and filament',
    steps: [
      ['**Colour A** is the frame, rim and collar.', T.colA],
      ['**Colour B** is the raised shapes and lanterns. Pick **Same as A** for one colour.', T.colB],
      ['**Weight ring** colour shows when a weight ring is on.', T.colRing],
      ['**Filament** picks the plastic. TPU 95A is the tough, bendy one we recommend.', T.material],
      ['**Printer bed** is your printer’s size, so the forge can warn if it won’t fit.', T.printer],
    ],
  },
  {
    id: 'check', icon: '✅', title: 'Check it’s strong and balanced',
    steps: [
      ['The box with the big weight number is the report card. Green means good.', T.verdict],
      ['**Balance on the staff**: green “balanced” means it won’t wobble. If not, try **Auto-balance on the staff** (under Design, when there is one).', T.verdict],
      ['**Thin spots**: places that could snap. **Weak spots** in the view shows them in red.', T.weak],
      ['**Fits … mm bed**: green means it fits your printer.', T.verdict],
      ['**Grip on Ø… pole**: how tightly it squeezes the pole. “loose” means it will slide.', T.verdict],
      ['The big number is the weight. **Filament** shows how much plastic one hub and a pair use.', T.verdict],
    ],
  },
  {
    id: 'create', icon: '✏️', title: 'Make my own (Create)',
    steps: [
      ['Press **✏️ Create your own** at the top.', T.create],
      ['Step 1: draw on the white pad, or press **🖼️ Add a picture** (you can also drop or paste one).', T.cPad],
      ['Step 2: **Copies** repeats it round the staff. More copies = better balance.', T.cCopies],
      ['Pick how it prints: **Raised**, **Flat**, **Outline** or **Both**. Or press **🎲 Surprise me**.', T.cLevels],
      ['Watch the ticks. When it says it’s ready to print, you get a little celebration.', T.cChecks],
      ['Step 3: give it a name and press **💾 Save to Your creations**, or download **⬇️ STL**.', T.cSave],
    ],
    tip: 'The forge fixes things for you: it fits your shape to the hub, joins loose bits, thickens thin bits and balances it. **Back to designs** leaves Create.',
  },
  {
    id: 'see', icon: '✨', title: 'See it spin and glow',
    steps: [
      ['The round buttons over the picture change the view. Tap again to turn one off.', T.chipsView],
      ['**Spin it** spins it. The **Spin** slider sets the speed.', T.spin],
      ['**Lights off** shows the glow. **Light trails** paints the light as it spins.', T.dark],
      ['**Blacklight** shows how UV filament would glow.', T.uv],
      ['**LED mode** and **LED colour** pick what the lights do.', T.led],
      ['**Zoetrope strobe** (some designs) makes the pictures move when spun.', T.strobe],
    ],
    tip: '**Second view** shows a small angled view; tap it to swap. **Staff** and **Print bed** hide or show the pole and bed.',
  },
  {
    id: 'pole', icon: '📏', title: 'Fit my pole (sizes and adaptors)',
    steps: [
      ['Open **Pole size and fit** on the right.', { group: 'Pole size and fit' }],
      ['Tap **22 mm**, **16 mm** or **13 mm** for the pole you have.', { group: 'Pole size and fit' }],
      ['Already have a 22 mm hub and a thinner pole? Pick a design under **Pole adaptors** in the list.', { list: 'Pole adaptors' }],
      ['Download the **Fit-test ring** and print it first. It takes minutes.', T.exports],
      ['Too loose on the pole? Lower **Bore clearance** a little. Too tight? Raise it.', { group: 'Pole size and fit' }],
    ],
  },
  {
    id: 'extras', icon: '🫧', title: 'Add weight, bubbles or LEDs',
    steps: [
      ['**Snap-on weight ring**: a ring that stretches over the rim, no tools. More weight = longer spins.', { group: 'Snap-on weight ring' }],
      ['Choose **light**, **medium** or **heavy**. You can print all three and swap them.', { group: 'Snap-on weight ring' }],
      ['**LED strip inside** turns that ring into a light-up ring.', { group: 'Snap-on weight ring' }],
      ['**Bubble weight ring**: loops that blow bubbles. **snap ring** clips on with no tools.', { group: 'Bubble weight ring' }],
      ['Turn on **Bubbles** in the view and press **Dip in mix** to try it.', T.bubbles],
      ['Lantern designs hold Flowtoys capsules: see **Lanterns and capsules**.', { group: 'Lanterns and capsules', when: '**Lanterns and capsules** appears for lantern designs, like **Heart Lanterns**.' }],
    ],
  },
  {
    id: 'save', icon: '♥', title: 'Save, like and find designs',
    steps: [
      ['Type a name under **Saved designs** and press **Save design**.', T.ideaName],
      ['Your saved designs are listed below it. **Open** brings every setting back.', T.ideas],
      ['Tap ♡ on any design to like it. Each person gets one heart per design.', T.heart],
      ['The chips at the top of the list filter: **All**, **♥ Mine**, **Most liked**, **Creations**, **Saved**, **New**.', T.chips],
      ['**Sort** puts them by group, most liked, newest or A to Z.', T.sort],
    ],
  },
  {
    id: 'print', icon: '🖨️', title: 'Get it printed',
    steps: [
      ['First download the **Fit-test ring** and print it. Push it on your real pole.', T.exports],
      ['One colour: download **One-colour STL**.', T.exports],
      ['Two colours: download **Two-colour 3MF** (one file, two parts).', T.exports],
      ['No printer? Send the file to a friend, a makerspace or a print service. See below.', null],
    ],
    page: 'print',
  },
  {
    id: 'support', icon: '💛', title: 'Support Dreamscape',
    steps: [
      ['The forge is free. You never have to pay.', null],
      ['If it helped you, **♥ Support Dreamscape** opens a donation page.', T.donate],
      ['500 baht is suggested (about US$15). Any amount helps.', T.donate],
    ],
  },
]

// The longer, practical printing guide, shown under "Get it printed".
const PRINT = [
  {
    h: 'If you have a printer',
    steps: [
      'Print the **Fit-test ring** first (about 10 minutes). Too loose or tight? Change **Bore clearance**.',
      'Open the file in your slicer: **Bambu Studio**, **OrcaSlicer**, **PrusaSlicer** or **Cura**.',
      'Lay it flat on the bed, as the forge shows it. No supports needed.',
      'TPU 95A: print slow, **20–35 mm/s**. Use 100% infill, or 5+ walls with 40% gyroid.',
      'Dry the TPU first (50 °C for about 6 hours). Wet TPU prints stringy and weak.',
      'Smooth PEI plate? Put glue stick down first so the TPU comes off.',
      'Check **Fits … mm bed** is green before you start.',
    ],
  },
  {
    h: 'Two colours',
    steps: [
      'Two-nozzle printer (like a Bambu H2D): load one colour in each. Use the **Two-colour 3MF**.',
      'Most filament changers (AMS) can’t feed TPU. Use the spool holder on the back instead.',
      'One nozzle only? Print the **One-colour STL** and add a filament change at the height shown under **Export**.',
    ],
  },
  {
    h: 'Sending it to the printer',
    steps: [
      'Bambu printers: press **Print** in Bambu Studio, or use the **Bambu Handy** app.',
      'OctoPrint or Klipper: upload the sliced file in the browser page for your printer.',
      'Any printer: save the sliced file (.gcode or .3mf) to the USB stick or SD card and pick it on the printer.',
    ],
  },
  {
    h: 'No printer?',
    steps: [
      'Ask a friend with a printer, or a local makerspace, school or library.',
      'Or search for “TPU 3D printing service near me”. Online print marketplaces work too.',
      'Send them the **STL** or **3MF** file.',
      'Tell them: **TPU 95A**, your colour(s), **100% infill** (or 5+ walls), and **2 hubs** (one for each end).',
      'Ask for the **Fit-test ring** too, so you can check the pole size first.',
    ],
  },
  {
    h: 'Quick checklist before printing',
    check: [
      'Balance says **balanced** (green)',
      'No big **thin spots** (red)',
      '**Fits … mm bed** is green',
      'Pole size matches your pole (and the fit-test ring fits)',
      'Two hubs: one for each end of the staff',
    ],
  },
]

const TOUR = [
  ['#gallery', 'Designs', 'Every hub design is here. Tap one to load it.'],
  ['.toolbar', 'The view', 'This is your hub. These buttons spin it, light it up and more.'],
  ['#verdict', 'Report card', 'Weight, balance, strength and printer fit. Green means good.'],
  ['#designParams', 'Make it yours', 'Sliders for this design. Drag one and watch it change.'],
  ['#commonParams', 'More settings', 'Size, pole fit, weight rings and lanterns, in folding groups.'],
  ['#exports', 'Download', 'When you’re happy, download the file to print.'],
  ['#createBtn', 'Make your own', 'Draw something or add a picture, and the forge turns it into a hub.'],
  ['#helpBtn', 'Help is here', 'Stuck? Press Help (or the ? key) any time.'],
]

const store = {
  get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch {} },
}
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

function findTarget(t) {
  if (!t) return null
  if (t.sel) return findTarget(t.sel)
  if (typeof t === 'string') {
    for (const sel of t.split(',')) {
      const els = [...document.querySelectorAll(sel.trim())]
      const vis = els.find((e) => e.offsetParent || e.getClientRects().length)
      if (vis) return vis
      if (els[0]) return els[0]
    }
    return null
  }
  if (t.group) {
    const s = [...document.querySelectorAll('#commonParams summary')].find((x) => x.textContent.trim() === t.group)
    if (s) { s.parentElement.open = true; return s.parentElement }
    return null
  }
  if (t.list) return [...document.querySelectorAll('#gallery .grouphead, #gallery h3')].find((x) => x.textContent.includes(t.list)) || null
  return null
}

export function initHelp() {
  if ($('helpBtn')) return
  // header button, before "Create your own"
  const btn = document.createElement('button')
  btn.className = 'btn helpBtn'
  btn.id = 'helpBtn'
  btn.setAttribute('aria-haspopup', 'dialog')
  btn.title = 'Help (press ?)'
  btn.textContent = '? Help'
  const createBtn = $('createBtn')
  createBtn ? createBtn.before(btn) : document.querySelector('header').append(btn)

  const wrap = document.createElement('div')
  wrap.className = 'help'
  wrap.id = 'helpPanel'
  wrap.hidden = true
  wrap.setAttribute('role', 'dialog')
  wrap.setAttribute('aria-modal', 'true')
  wrap.setAttribute('aria-labelledby', 'helpTitle')
  wrap.innerHTML = `<div class="helpCard">
      <div class="helpTop">
        <button class="btn helpBack" id="helpBack" hidden>← Back</button>
        <h2 id="helpTitle">What do you want to do?</h2>
        <button class="btn helpClose" id="helpClose" aria-label="Close help">✕ Close</button>
      </div>
      <input type="search" class="helpSearch" id="helpQ" placeholder="Search help (try “print”, “pole”, “glow”)" aria-label="Search help" autocomplete="off">
      <div class="helpBody" id="helpBody"></div>
    </div>`
  document.body.append(wrap)

  const back = document.createElement('button')
  back.className = 'btn primary helpReturn'
  back.id = 'helpReturn'
  back.hidden = true
  back.textContent = '← Back to help'
  document.body.append(back)

  const body = $('helpBody')
  let lastFocus = null
  let current = null // topic id or null (home)

  const home = () => {
    current = null
    $('helpTitle').textContent = 'What do you want to do?'
    $('helpBack').hidden = true
    body.innerHTML = `<div class="helpGrid">${TOPICS.map((t) => `<button class="helpTask" data-t="${t.id}"><span class="ic" aria-hidden="true">${t.icon}</span><span>${esc(t.title)}</span></button>`).join('')}</div>
      <div class="helpFoot"><button class="btn big" id="helpTour">▶ Take the 60-second tour</button><span>Tip: press <kbd>?</kbd> any time to open help, <kbd>Esc</kbd> to close.</span></div>`
    body.scrollTop = 0
  }

  const stepHtml = (steps) => `<ol class="helpSteps">${steps.map(([txt, tgt], i) => `<li><span class="n">${i + 1}</span><span class="txt">${fmt(txt)}</span>${tgt ? `<button class="btn showMe" data-show="${esc(JSON.stringify(tgt))}">👀 Show me</button>` : ''}</li>`).join('')}</ol>`

  const printGuide = () => PRINT.map((sec) => `<section class="helpSec"><h3>${esc(sec.h)}</h3>${sec.steps ? `<ol class="helpSteps">${sec.steps.map((s, i) => `<li><span class="n">${i + 1}</span><span class="txt">${fmt(s)}</span></li>`).join('')}</ol>` : ''}${sec.check ? `<ul class="helpCheck">${sec.check.map((c) => `<li><label><input type="checkbox"> <span>${fmt(c)}</span></label></li>`).join('')}</ul>` : ''}</section>`).join('')

  const topic = (id) => {
    const t = TOPICS.find((x) => x.id === id)
    if (!t) return home()
    current = id
    $('helpTitle').textContent = `${t.icon} ${t.title}`
    $('helpBack').hidden = false
    body.innerHTML = stepHtml(t.steps) + (t.tip ? `<p class="helpTip">💡 ${fmt(t.tip)}</p>` : '') + (t.page === 'print' ? printGuide() : '')
    body.scrollTop = 0
    $('helpBack').focus()
  }

  const search = (q) => {
    q = q.trim().toLowerCase()
    if (!q) return current ? topic(current) : home()
    const words = q.split(/\s+/)
    const hits = []
    const hit = (s) => words.every((w) => s.toLowerCase().includes(w))
    for (const t of TOPICS) {
      if (hit(t.title)) hits.push({ t, line: null })
      for (const [s] of t.steps) if (hit(s)) hits.push({ t, line: s })
      if (t.tip && hit(t.tip)) hits.push({ t, line: t.tip })
    }
    const print = TOPICS.find((x) => x.id === 'print')
    for (const sec of PRINT) for (const s of [...(sec.steps || []), ...(sec.check || [])]) if (hit(s) || hit(sec.h)) hits.push({ t: print, line: s })
    $('helpTitle').textContent = 'Search'
    $('helpBack').hidden = false
    body.innerHTML = hits.length
      ? `<ul class="helpHits">${hits.slice(0, 30).map((h) => `<li><button class="helpHit" data-t="${h.t.id}"><span class="ic" aria-hidden="true">${h.t.icon}</span><span><b>${esc(h.t.title)}</b>${h.line ? `<small>${fmt(h.line)}</small>` : ''}</span></button></li>`).join('')}</ul>`
      : `<p class="helpTip">Nothing found for “${esc(q)}”. Try one short word, like <b>print</b>, <b>pole</b> or <b>colour</b>. Or go <button class="linkish" id="helpHome">back to the start</button>.</p>`
  }

  const open = (id) => {
    if (!wrap.hidden) return id ? topic(id) : null
    lastFocus = document.activeElement
    back.hidden = true
    if ($('helpToast')) $('helpToast').hidden = true
    wrap.hidden = false
    document.body.classList.add('helpOpen')
    $('helpQ').value = ''
    id ? topic(id) : current ? topic(current) : home()
    setTimeout(() => (id || current ? $('helpBack') : wrap.querySelector('.helpTask'))?.focus(), 0)
  }
  const close = () => {
    wrap.hidden = true
    back.hidden = true
    document.body.classList.remove('helpOpen')
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus()
  }

  // "Show me": step out of the way, point at the real control, offer the way back
  const show = (tgt) => {
    // things that live in Create need Create open
    if (typeof tgt === 'string' && tgt.startsWith('#c') && tgt !== '#createBtn' && $('createPanel')?.hidden) $('createBtn')?.click()
    if (typeof tgt === 'string' && tgt.includes('#createPanel') && $('createPanel')?.hidden) $('createBtn')?.click()
    document.querySelectorAll('.helpPulse').forEach((x) => x.classList.remove('helpPulse')) // one thing at a time
    const el = findTarget(tgt)
    wrap.hidden = true
    document.body.classList.remove('helpOpen')
    back.hidden = false
    if (!el || !(el.offsetParent || el.getClientRects().length)) {
      toast(tgt.when || 'That part shows up only for some designs or settings. Try another design, then look again.')
      back.focus()
      return
    }
    el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center', inline: 'center' })
    el.classList.remove('helpPulse')
    void el.offsetWidth
    el.classList.add('helpPulse')
    setTimeout(() => el.classList.remove('helpPulse'), 4200)
    back.focus({ preventScroll: true })
  }

  let toastTimer = 0
  const toast = (msg, actions) => {
    let t = $('helpToast')
    if (!t) {
      t = document.createElement('div')
      t.className = 'helpToast'
      t.id = 'helpToast'
      t.setAttribute('role', 'status')
      t.setAttribute('aria-live', 'polite')
      document.body.append(t)
    }
    t.innerHTML = `<span>${fmt(msg)}</span>${actions || ''}`
    t.hidden = false
    clearTimeout(toastTimer)
    if (!actions) toastTimer = setTimeout(() => (t.hidden = true), 5000)
    return t
  }

  // ------------------------------------------------------------- tour --
  let tourI = -1
  const hole = document.createElement('div')
  hole.className = 'tourHole'
  hole.hidden = true
  const card = document.createElement('div')
  card.className = 'tourCard'
  card.hidden = true
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-live', 'polite')
  card.setAttribute('aria-label', 'Tour')
  document.body.append(hole, card)

  const placeTour = () => {
    if (tourI < 0) return
    const [sel, title, text] = TOUR[tourI]
    const el = findTarget(sel)
    const r = el && (el.offsetParent || el.getClientRects().length) ? el.getBoundingClientRect() : null
    if (r) Object.assign(hole.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` })
    hole.hidden = !r
    card.innerHTML = `<div class="tourStep">${tourI + 1} of ${TOUR.length}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>
      <div class="tourBtns"><button class="btn" id="tourSkip">Skip</button><span></span>${tourI ? '<button class="btn" id="tourPrev">← Back</button>' : ''}<button class="btn primary" id="tourNext">${tourI === TOUR.length - 1 ? 'Done ✓' : 'Next →'}</button></div>`
    card.hidden = false
    // put the card where it doesn't cover the highlighted part
    const cw = Math.min(340, innerWidth - 24), ch = card.offsetHeight || 170
    let x = 12, y = innerHeight - ch - 12
    if (r) {
      x = Math.min(Math.max(12, r.left), innerWidth - cw - 12)
      y = r.bottom + 14 + ch < innerHeight ? r.bottom + 14 : r.top - ch - 14 > 0 ? r.top - ch - 14 : innerHeight - ch - 12
      if (r.width > innerWidth * 0.6 && r.height > innerHeight * 0.5) { x = (innerWidth - cw) / 2; y = innerHeight - ch - 24 }
    }
    Object.assign(card.style, { left: `${x}px`, top: `${y}px`, width: `${cw}px` })
    $('tourNext').focus()
  }
  const tourGo = (i) => {
    if (i < 0) i = 0
    if (i >= TOUR.length) return tourEnd()
    tourI = i
    const el = findTarget(TOUR[i][0])
    el?.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' })
    requestAnimationFrame(placeTour)
  }
  const tourStart = () => { store.set('forge-tour-seen', '1'); close(); $('helpToast') && ($('helpToast').hidden = true); tourGo(0) }
  const tourEnd = () => { tourI = -1; hole.hidden = card.hidden = true; btn.focus() }
  card.addEventListener('click', (e) => {
    if (e.target.id === 'tourNext') tourGo(tourI + 1)
    else if (e.target.id === 'tourPrev') tourGo(tourI - 1)
    else if (e.target.id === 'tourSkip') tourEnd()
  })
  addEventListener('resize', () => tourI >= 0 && placeTour())
  addEventListener('scroll', () => tourI >= 0 && placeTour(), true)

  // --------------------------------------------------------- wiring --
  btn.onclick = () => open()
  back.onclick = () => open()
  $('helpClose').onclick = close
  $('helpBack').onclick = () => { $('helpQ').value = ''; home(); wrap.querySelector('.helpTask')?.focus() }
  $('helpQ').oninput = (e) => search(e.target.value)
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close() })
  body.addEventListener('click', (e) => {
    const task = e.target.closest('[data-t]')
    if (task) return topic(task.dataset.t)
    const sm = e.target.closest('.showMe')
    if (sm) return show(JSON.parse(sm.dataset.show))
    if (e.target.id === 'helpTour') return tourStart()
    if (e.target.id === 'helpHome') { $('helpQ').value = ''; return home() }
  })

  addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable
    if (e.key === 'Escape') {
      if (tourI >= 0) return tourEnd()
      if (!wrap.hidden) { e.preventDefault(); return close() }
      if (!back.hidden) back.hidden = true
      return
    }
    if (e.key === '?' && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); wrap.hidden ? open() : close(); return }
    if (tourI >= 0 && !typing) {
      if (e.key === 'ArrowRight') tourGo(tourI + 1)
      if (e.key === 'ArrowLeft') tourGo(tourI - 1)
    }
    // keep focus inside the help dialog while it is open
    if (e.key === 'Tab' && !wrap.hidden) {
      const f = [...wrap.querySelectorAll('button:not([hidden]), input, [href], [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent)
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  })

  // offer the tour once, gently, on a first visit
  if (!store.get('forge-tour-seen')) {
    setTimeout(() => {
      if (store.get('forge-tour-seen') || !wrap.hidden || tourI >= 0) return
      const t = toast('New here? A 60-second tour shows you around.', '<button class="btn primary" id="toastTour">Show me around</button><button class="btn" id="toastNo">No thanks</button>')
      t.querySelector('#toastTour').onclick = () => { t.hidden = true; tourStart() }
      t.querySelector('#toastNo').onclick = () => { t.hidden = true; store.set('forge-tour-seen', '1') }
    }, 4000)
  }

  return { open, close, tour: tourStart }
}

// tools/tests can reach it; the app calls initHelp() itself
if (typeof window !== 'undefined') window.forgeHelp = { TOPICS, PRINT, TOUR }
