# Dragon Hub Forge

A browser designer for 3D-printed **dragon staff hubs**: pick a design (or make
your own), tune it, check strength and balance, and export print-ready STL / 3MF.
Made at [Dreamscape](https://dream.sc).

**Try it:** https://dreamy-12345.github.io/dragon-hub-forge/ (runs fully in your
browser; saved designs stay in that browser).

## What it does
- 80+ parametric hub designs: glowing capsule lanterns, creatures, organic veins,
  spin illusions (zoetropes, moiré, hidden rings), fractals, melted punk and more.
- Real solid geometry with [manifold-3d](https://github.com/elalish/manifold):
  two print levels (low frame + raised shapes) for two-colour prints, crush-rib
  bore, collar, rim weight.
- Pole sizes 22 / 16 / 13 mm, plus pole adaptors (13→22, 16→22, collet).
- Snap-on weight rings (no tools), bubble loops, LED ring variant, capsule lanterns
  for Flowtoys capsules.
- Live checks: balance on the staff, thin spots, weight and filament use, bed fit.
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
- `bubbles.js` bubble-loop simulator · `leds.js` capsule light modes for the preview
- `vendor/` three.js and manifold-3d, so it works offline

## Licence
MIT, see `LICENSE`. Bundled: three.js (MIT), manifold-3d (Apache-2.0).
Print, remix and share; a credit back to Dreamscape is appreciated.
