# CYBER SMASH — project rules

A comedic 3D browser parody of the early-90s arcade "destroy the car" bonus stage.
A shady harbor salesman pays anyone who can wreck his angular electric pickup,
the **CYBERCHUNK**, with their bare hands in under 40 seconds.

## Tech stack
- **One file:** `index.html` holds all HTML, CSS and JavaScript (inline ES modules).
- **Only dependency:** three.js, loaded through an import map from a **pinned** CDN version:
  `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`
  (addons, if ever needed, must come from the same pinned version under `three@0.160.0/examples/jsm/`).
- No other libraries, no bundler, no build step. The page must work from GitHub Pages
  and from any simple static server (`python3 -m http.server`, `npx http-server`).
- Dev tooling (Playwright smoke test) lives in `package.json` / `tests/` and is never loaded by the game.

## File layout
```
index.html          the entire game
README.md           player-facing docs, controls, screenshots
CLAUDE.md           these rules
package.json        dev-only: playwright for the smoke test
tests/smoke.mjs     headless smoke test (serves the folder, drives the game, screenshots)
screenshots/        screenshots/GIF referenced from the README
```

### Sections inside `index.html` (keep this order, clearly commented)
1. CONFIG — tunables (resolution, timings, damage, palette)
2. UTILS — math helpers, pixel font, canvas texture helpers, geometry merge
3. RENDERER — WebGLRenderer, low-res render target, nearest-neighbor upscale pass, resize/letterbox
4. STAGE — harbor arena, sky, water, crates, crane, ships, crowd, seagulls, salesman
5. TRUCK — Cyberchunk model, health, damage stages, detachable panels
6. FIGHTERS — chibi rig, per-character builders, animations, specials
7. COMBAT — hit detection, damage, knockback, scoring
8. FX / JUICE — shake, hit-stop, debris (InstancedMesh), hit text, slow-mo
9. HUD — 2D canvas overlay with pixel lettering
10. AUDIO — Web Audio API synthesized SFX and jingles
11. STATES — title → select → vs → fight → results state machine, main loop

## Workflow (every PR)
1. Branch from the latest `main` (`git checkout main && git pull && git checkout -b feat/...`).
2. Implement only that PR's scope, with clear commits.
3. Test: `npm run smoke` serves the folder, opens the game in headless Chromium
   (`--use-angle=swiftshader --enable-unsafe-swiftshader`), fails on any console error,
   WebGL error or uncaught exception, and saves screenshots to `screenshots/tmp/`
   while checking the canvas is not blank. Fix everything before continuing.
4. Push, open a PR with `gh pr create` (what changed + how to test).
5. `gh pr merge --squash --delete-branch`, then `git checkout main && git pull`.

## Art / IP rules
- Everything is built at runtime: models from three.js primitives (Box/Cylinder/Sphere/Extrude/custom
  BufferGeometry); textures (glass cracks, logos, signs, text) from `CanvasTexture`; audio from Web Audio.
- **No external images, models, textures, fonts or audio files.** Lettering uses our own pixel font.
- Original work only: take the general feel of the era (side-view fights, chunky HUD, VS screen,
  bonus-stage concept) but never copy any existing game's characters, sprites, stage layouts,
  fonts, logos, music, sound effects or announcer lines.
- Parody characters are affectionate caricatures with parody names — funny, never mean-spirited.

## Performance budget
- Steady 60 fps on a mid-range laptop; **< 150 draw calls** per frame.
- Use `InstancedMesh` for debris, particles, crowds; merge static scenery into few meshes.
- Reuse geometries and materials; `dispose()` anything removed from the scene.
- Cap `devicePixelRatio` at 2. Render the 3D scene at low resolution (480×270) and upscale.
