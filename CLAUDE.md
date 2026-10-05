# CYBER SMASH II — project rules

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
package.json        dev-only: playwright for the tests
tests/smoke.mjs     headless smoke test (serves the folder, drives the game, screenshots)
tests/specials.mjs  freezes every special mid-move, screenshots it, checks 3x punch damage
tests/record.mjs    deterministic GIF recorder (pauses + steps the sim) -> screenshots/cybersmash.gif
tests/shot.mjs      ad-hoc screenshot helper for development
screenshots/        screenshots/GIF referenced from the README (screenshots/tmp/ is git-ignored)
.nojekyll           serve the repo as-is on GitHub Pages
```

Debug hooks live on `window.CS` (`CS.info()`, `CS.debug.*`: pause/step, bot, quickFight, hitTruck,
cam, lineup, sfx...). They are inert unless called and exist for the tests.

### Sections inside `index.html` (keep this order, clearly commented)
1. CONFIG — tunables (resolution, timings, damage, palette)
2. UTILS — math helpers, pixel font, canvas texture helpers, geometry merge
3. RENDERER — WebGLRenderer, low-res render target, nearest-neighbor upscale pass, resize/letterbox
4. STAGE — harbor arena, sky, water, crates, crane, ships, crowd, seagulls, salesman
5. TRUCK — Cyberchunk model, health, damage stages, detachable panels
6. FIGHTERS — chibi rig, per-character builders, animations, specials
7. COMBAT — hit detection, damage, knockback, scoring
8. FX / JUICE — particle pools (InstancedMesh), shake, hit-stop, punch-zoom, comic hit text
9. HUD — 2D canvas overlay with pixel lettering, speech bubbles, 3D-rendered portraits
10. AUDIO — Web Audio API synthesized SFX and jingles
11. STATES — title → select → vs → fight → results state machine, main loop

## Workflow (every PR)
1. Branch from the latest `main` (`git checkout main && git pull && git checkout -b feat/...`).
2. Implement only that PR's scope, with clear commits.
3. Test: `npm test` (= `npm run smoke` + `npm run specials`). The smoke test serves the folder, opens the game in headless Chromium
   (`--use-angle=swiftshader --enable-unsafe-swiftshader`), fails on any console error,
   WebGL error or uncaught exception, and saves screenshots to `screenshots/tmp/`
   while checking the canvas is not blank. Fix everything before continuing.
   When chaining test commands in a shell, use `set -o pipefail` (piping into `tail`/`grep` hides failures).
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
- Cap `devicePixelRatio` at 2. Render the 3D scene at low resolution (640×360) and upscale; the HUD is laid
  out in 480×270 units on a 2× canvas.
- Pre-compile shader variants at load (`prewarm()`), so the first special / fighter doesn't hitch.
