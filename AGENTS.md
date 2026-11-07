# AGENTS.md

CYBER SMASH II: a 3D browser parody of the 90s "destroy the car" bonus stage, one `index.html` using three.js, published on GitHub Pages.

## Commands
- Install (dev tooling only): `npm install` (Playwright; lockfile is `package-lock.json`)
- Serve locally: `npm run serve` (`python3 -m http.server 8080`)
- Test: `npm test` (runs the smoke test, then the specials test)
- Single tests: `npm run smoke`, `npm run specials`
- Build and lint: none (no build step)

## Conventions
- Stack: vanilla JS in inline ES modules; three.js 0.160.0 is the only dependency, loaded through an import map from the pinned jsDelivr URL (addons must come from the same version under the examples/jsm folder).
- Structure:
  - `index.html`: the whole game
  - `tests/smoke.mjs`, `tests/specials.mjs`: headless Playwright tests; `tests/record.mjs`: GIF recorder; `tests/shot.mjs`: screenshot helper
  - `screenshots/`: README images (`screenshots/tmp/` is git-ignored)
  - `.nojekyll`: serve the repo as-is on GitHub Pages
- Must work from GitHub Pages and any static server. Playwright is never loaded by the game.
- Debug hooks live on `window.CS` and exist for the tests; keep them inert unless called.
- Keep the section order in `index.html`: CONFIG, UTILS, RENDERER, STAGE, TRUCK, FIGHTERS, COMBAT, FX / JUICE, HUD, AUDIO, STATES.
- No external images, models, textures, fonts or audio; build everything at runtime. Original work only: no copied characters, sprites, music or announcer lines; parody names, never mean-spirited.
- Performance: 60 fps target, under 150 draw calls per frame, `InstancedMesh` for particles and debris, `dispose()` removed objects, cap `devicePixelRatio` at 2, render at 640x360 and upscale.
- The smoke test fails on any console error, WebGL error or uncaught exception. When chaining test commands in a shell, use `set -o pipefail`.
- Workflow per PR: branch from latest `main`, implement only that PR's scope, run `npm test`, open the PR with `gh pr create` (what changed and how to test), then squash-merge.

## Boundaries
- Always: run `npm test` and add or update tests with every behavior change.
- Ask first: adding a dependency, changing the three.js version, adding any asset file.
- Never: commit secrets or read .env files; copy existing games' art, names or music.
