/**
 * LED capsule modes, emulated for the preview.
 *
 * The real modes are byte tables run through the fluxFX engine
 * (the capsule firmware sources, C0-1.TXT and
 * patterns/src/patterns.cpp). A capsule lights its whole lantern, so what
 * matters here is its colour over time: spin the hub with trails on and that
 * timeline is painted round the circle, the way it looks on a real staff.
 * Mode names and pages follow the firmware's own list (patterns.cpp header).
 * Strobe copies the firmware's on/off duty cycle (handleEffects case 11).
 *
 * mode.fn(t, base, o) → [r, g, b] in 0..1. `t` is seconds, `base` the chosen colour,
 * `o` the live controls (strobe hz/duty, blink rate, gradient second colour + fade time).
 */

const hsv = (h, s, v) => {
  h = ((h % 1) + 1) % 1
  const i = Math.floor(h * 6), f = h * 6 - i
  const p = v * (1 - s), q = v * (1 - f * s), u = v * (1 - (1 - f) * s)
  return [[v, u, p], [q, v, p], [p, v, u], [p, q, v], [u, p, v], [v, p, q]][i % 6]
}
// smooth value noise in 0..1
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
const noise = (t) => { const i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f); return hash(i) * (1 - s) + hash(i + 1) * s }
const mix = (a, b, f) => a.map((x, i) => x + (b[i] - x) * f)
const scale = (c, v) => c.map((x) => x * v)
const pal = (list, x) => { // cycle through a palette, blending
  const n = list.length, y = ((x % 1) + 1) % 1 * n, i = Math.floor(y)
  return mix(list[i % n], list[(i + 1) % n], y - i)
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
const C = (h) => hex(h)

/** On for `duty` of each period, as the firmware's strobe counter does. */
const strobe = (t, hz, duty) => ((t * hz) % 1) < duty

export const LED_MODES = [
  // ---------------------------------------------------- simple
  { id: 'blink', page: 0, name: 'Blink', blink: true, fn: (t, base, o) => (strobe(t, o.blinkHz, 0.5) ? base : [0, 0, 0]) },
  { id: 'gradient', page: 0, name: 'Colour gradient', gradient: true, fn: (t, base, o) => mix(base, o.base2, 0.5 - 0.5 * Math.cos((t / o.fadeSec) * Math.PI)) },
  // ---------------------------------------------------- page 1 (classic)
  { id: 'rainbow', page: 1, name: 'Rainbow', fn: (t) => hsv(t * 0.35, 1, 1) },
  { id: 'drops', page: 1, name: 'Rainbow drops', fn: (t) => scale(hsv(t * 0.35, 1, 1), noise(t * 9) > 0.35 ? 1 : 0.08) },
  { id: 'bold', page: 1, name: 'Bold', fn: (t) => hsv(Math.floor(t * 3) / 6, 1, 1) },
  { id: 'lantern', page: 1, name: 'Lantern', fn: (t) => scale(C('#ffb03a'), 0.75 + 0.25 * noise(t * 6)) },
  { id: 'fire', page: 1, name: 'Fire', fn: (t) => { const n = noise(t * 14); return scale(pal([C('#ff1a00'), C('#ff6a00'), C('#ffc400'), C('#ff3300')], n), 0.45 + 0.55 * noise(t * 23 + 5)) } },
  { id: 'water', page: 1, name: 'Water', fn: (t) => pal([C('#0033ff'), C('#00b4ff'), C('#00ffd0'), C('#0066ff')], t * 0.25 + noise(t * 2) * 0.3) },
  { id: 'earth', page: 1, name: 'Earth', fn: (t) => pal([C('#1f8f1f'), C('#7a5a12'), C('#3ccf3c'), C('#a0721a')], t * 0.2 + noise(t * 1.5) * 0.3) },
  { id: 'air', page: 1, name: 'Air', fn: (t) => pal([C('#cfefff'), C('#9ad7ff'), C('#e6d4ff'), C('#ffffff')], t * 0.3) },
  { id: 'spirit', page: 1, name: 'Spirit', fn: (t) => scale(pal([C('#8a2bff'), C('#ff2bd5'), C('#3b1bff')], t * 0.4), 0.55 + 0.45 * noise(t * 18)) },
  { id: 'strobe', page: 1, name: 'Strobe', strobe: true, fn: (t, base, o) => (strobe(t, o.hz, o.duty) ? base : [0, 0, 0]) },
  // ---------------------------------------------------- page 2
  { id: 'candy', page: 2, name: 'Candy', fn: (t) => pal([C('#ff4fb8'), C('#41f2ff')], Math.floor(t * 8) / 2) },
  { id: 'petals', page: 2, name: 'Petals', fn: (t) => mix(C('#ff6fae'), C('#ffffff'), Math.max(0, Math.sin(t * 7)) ** 3) },
  { id: 'love', page: 2, name: 'Love', fn: (t) => { const b = t % 1.1; const pulse = Math.exp(-(((b - 0.1) / 0.06) ** 2)) + 0.8 * Math.exp(-(((b - 0.32) / 0.06) ** 2)); return mix(scale(C('#ff0a3c'), 0.25), C('#ff5c8a'), Math.min(1, pulse)) } },
  { id: 'watermelon', page: 2, name: 'Watermelon', fn: (t) => (Math.floor(t * 6) % 2 ? C('#ff2d6f') : C('#22e05a')) },
  { id: 'freedom', page: 2, name: 'Freedom', fn: (t) => [C('#ff1a1a'), C('#ffffff'), C('#1a3cff')][Math.floor(t * 5) % 3] },
  { id: 'beads', page: 2, name: 'Beads', strobe: true, fn: (t) => (strobe(t, 9, 0.45) ? hsv(Math.floor(t * 9) * 0.13, 1, 1) : [0, 0, 0]) },
  { id: 'microdots', page: 2, name: 'Micro dots', strobe: true, fn: (t) => (strobe(t, 26, 0.18) ? hsv(hash(Math.floor(t * 26)), 0.9, 1) : [0, 0, 0]) },
  { id: 'unicorn', page: 2, name: 'Unicorn', fn: (t) => hsv(t * 0.3, 0.45, 1) },
  { id: 'solarflare', page: 2, name: 'Solar flare', fn: (t) => { const f = noise(t * 3); return mix(C('#ff4a00'), C('#fff1a0'), f > 0.7 ? (f - 0.7) / 0.3 : 0) } },
  { id: 'flareup', page: 2, name: 'Flare up', fn: (t) => { const b = (t % 2.4) / 2.4; return b < 0.85 ? scale(C('#ff7a1a'), 0.15 + b) : C('#fff6e0') } },
  // ---------------------------------------------------- strobe family
  { id: 'rbstrobe', page: 3, name: 'Rainbow strobe', strobe: true, fn: (t, base, o) => (strobe(t, o.hz, o.duty) ? hsv(Math.floor(t * o.hz) / 7, 1, 1) : [0, 0, 0]) },
  { id: 'dashes', page: 3, name: 'Rainbow dashes', strobe: true, fn: (t, base, o) => (strobe(t, o.hz, 0.5) ? hsv(t * 0.5, 1, 1) : [0, 0, 0]) },
  { id: 'solid', page: 3, name: 'Solid colour', fn: (t, base) => base },
]

export const PAGE_NAMES = { 0: 'Simple', 1: 'Page 1', 2: 'Page 2', 3: 'Strobes and solid' }
