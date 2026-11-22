# Dragon Hub Forge

A browser designer for 3D-printed **dragon staff hubs**: pick a design (or make
your own), tune it, check strength and balance, and export print-ready STL / 3MF.
Made at [Dreamscape](https://dream.sc).

**Try it:** https://dreamy-12345.github.io/dragon-hub-forge/ (runs fully in your
browser; saved designs stay in that browser).

## What it does
- 90+ parametric hub designs: glowing capsule lanterns, creatures, organic veins,
  spin illusions (zoetropes, moiré, hidden rings), fractals, melted punk and more.
- Real solid geometry with [manifold-3d](https://github.com/elalish/manifold):
  two print levels (low frame + raised shapes) for two-colour prints, crush-rib
  bore, collar, rim weight.
- Pole sizes 22 / 16 / 13 mm, plus pole adaptors (13→22, 16→22, collet).
- Snap-on weight rings (no tools), bubble loops, LED ring variant, capsule lanterns
  for LED capsules.
- Live checks: balance on the staff, thin spots, weight and filament use, bed fit.
- **CNC mode**: any design as a flat plate for a laser, waterjet, plasma or CNC
  router, in aluminium, stainless, steel, Perspex, polycarbonate, HDPE or POM. It
  fixes the design to what the cutter can do and exports DXF / SVG. Fire ends on
  metal (Kevlar tape on bolt-on tabs, or a laced Kevlar rope ring) or TPU practice
  bumpers weighted like a wet wick.
- **Fire spoke hubs**: machined hubs for 8 mm fire spokes, with a drawing for the
  machine shop, a printable practice version, practice ends and a step-by-step guide.
- **Contact staff ends**: push-on balls in three flat parts (weight them with steel shot)
  and fun ends (trident, heart, mace), balanced over the pole.
- **Battle axe ends**: double axe, war axe, halberd, moon axe and great axe, each with a
  matched steel-shot counterweight or contact ball for the other end so the staff balances.
- **Rope dart heads**: classic (with a lathe drawing for metal), modern, round, detailed
  patterns, and nature (leaf bud, acorn, garden gnome).
- **Poi**: printable poi heads, and classic bubble poi (stacked circles and a big one, swivel eyes top and bottom).
- **Silicone and rubber moulds** for contact balls, rope darts and poi: a printed two-part
  mould to cast the end, or a mould box to make a rubber mould and cast copies. With a guide.
- **Hoops**: the exact tubing length to cut for any hoop size, a printable curved
  connector, and a hoop making guide.
- **Fire contact swords** (CNC, metal only): four blades cut from one plate with Kevlar
  wound the full length of the blade (or on edges, tabs or a laced rope), an eye at the
  end of the hilt, balance point and pommel weight worked out.
- **Tube fire swords and axes**: a machined hilt connector on your 19/22 mm staff pole,
  Kevlar-wound blade and guard tubes, a burning Kevlar pommel ball sized to balance it;
  Viking and anime axe heads bent from tube, with a matched Kevlar ball for the other end.
- **Acro staff ends**: printed (dome, ball, balance foot, grip, hex, mushroom, pine cones)
  with a coin at the socket bottom so the pole edge can't cut in, a steel-shot chamber
  sized to the weight you want, every size and shape adjustable; turned metal ends
  (grub-screw socket, or plug-in with an allen-key expander and a lip); acro end moulds.
- **Locking dowels**: a metal dowel for the pole end that every hub can lock onto
  (grub screw, cross pin or end bolt): tick the box in any hub.
- **Collapsible hoops**: push-button, flex-button, double-button and clip-pin joints,
  a drill guide, section lengths and a materials list; a cut table beside every hoop.
- **Pine cones**: rope darts, poi, staff ends and three hubs.
- A size reference (a person of any height, or a lighter) next to any design, a cross-section
  view, and How it works animations for connectors.
- **Finish**: your own text or logo, raised or engraved, on any design.
- **Knots and Wicking 101**, monkey's fist heads, meteor cages, tube and solid fire axes, a
  fire mace, the hilt connector with pole inserts, eyeball balls, mushrooms, NZ nature hubs.
- **Pole fittings**: pole inserts, an internal End Expander and a Clamp Collar so
  rigid hubs grip without crushing carbon, and collapsible staff joints (screw,
  twist-lock, snap-button). Type your pole's inside and outside size once.
- A wicking and knots guide (Kevlar tape, monkey's fist, Turk's head, cobra).
- Previews: spinning, light trails, strobe/zoetrope, blacklight, bubbles.

Standard hub: 280 mm wide, 15 mm rim, 10 mm raised shapes, for 22 mm poles.

## Run it
Static files, no build step:

```sh
node server.mjs 9560      # then open http://localhost:9560
```

`server.mjs` only serves the files and a shared saved-designs list (`ideas.json`).
Any static server works too (saved designs then use the browser).

- `node tools/build-all.mjs [outdir]` builds every design headless and prints stats.
- `npm i && node tools/build-portable.mjs` makes `dist/Dragon Hub Forge.html`, one
  file that runs offline (this is what the GitHub Pages link serves).

## Code map
- `designs*.js` the designs (2D drawing per design: frame strokes, relief, lanterns)
- `geom.js` 2D helpers · `hub.js` design → solids, checks, STL/3MF/SVG
- `worker.js` geometry off the main thread · `app.js` + `index.html` the UI
- `cnc.js` CNC plates, fire/practice ends, spoke hubs, DXF · `balls.js` contact ball ends
- `bubbles.js` bubble-loop simulator · `leds.js` capsule light modes for the preview
- `vendor/` three.js and manifold-3d, so it works offline

## Licence
MIT, see `LICENSE`. Bundled: three.js (MIT), manifold-3d (Apache-2.0).
Print, remix and share; a credit back to Dreamscape is appreciated.
