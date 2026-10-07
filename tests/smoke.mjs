// CYBER SMASH II — headless smoke test.
//
// Serves the repo root with `python3 -m http.server`, opens index.html in headless Chromium
// (SwiftShader so WebGL works without a GPU), drives the game through its states with the
// keyboard, and fails if there is any console error, WebGL error, failed request or uncaught
// exception. Every step saves a screenshot to screenshots/tmp/ and checks it is not blank.
//
// Usage:
//   node tests/smoke.mjs                 # test the local folder
//   node tests/smoke.mjs --url <url>     # test a deployed URL (e.g. GitHub Pages)
//   node tests/smoke.mjs --out <dir>     # screenshot directory (default screenshots/tmp)

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, unlinkSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argVal = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const OUT = path.resolve(ROOT, argVal('--out', 'screenshots/tmp'));
const PORT = 8000 + Math.floor(Math.random() * 900);
let URL = argVal('--url', null);
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (/^\d\d-.*\.png$/.test(f)) unlinkSync(path.join(OUT, f)); // stale shots

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
let server = null;

async function startServer() {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  URL = `http://127.0.0.1:${PORT}/index.html`;
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(URL); if (r.ok) return; } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('static server did not start');
}

// Decide whether a screenshot is a real rendered frame (not blank / single colour).
async function analyse(page, png) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 160; c.height = 90;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 160, 90);
    const d = g.getImageData(0, 0, 160, 90).data;
    let sum = 0, sum2 = 0, nonBlack = 0;
    const colours = new Set();
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      sum += l; sum2 += l * l;
      if (l > 12) nonBlack++;
      colours.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4));
    }
    const n = d.length / 4, mean = sum / n;
    return { mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), nonBlack: nonBlack / n, colours: colours.size };
  }, png.toString('base64'));
}

async function main() {
  if (!URL) await startServer();
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const helper = await browser.newPage();

  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') problems.push(`console.error: ${t}`);
    else if (/webgl|GL_INVALID|GL ERROR|shader|THREE\./i.test(t) && m.type() === 'warning') problems.push(`console.warning: ${t}`);
  });
  page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));

  const state = () => page.evaluate(() => window.CS && window.CS.state);
  const waitState = async (name, timeout = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { if ((await state()) === name) return; await sleep(50); }
    throw new Error(`timed out waiting for state "${name}" (current: ${await state()})`);
  };
  const waitFor = async (fn, timeout = 15000, label = 'condition') => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { if (await page.evaluate(fn)) return; await sleep(50); }
    throw new Error(`timed out waiting for ${label}`);
  };
  const press = (k) => page.keyboard.press(k);
  let shotN = 0;
  const shot = async (name) => {
    const file = path.join(OUT, `${String(++shotN).padStart(2, '0')}-${name}.png`);
    const png = await page.screenshot({ path: file });
    const a = await analyse(helper, png);
    const info = await page.evaluate(() => window.CS && window.CS.info && window.CS.info());
    console.log(`  shot ${path.relative(ROOT, file)}  std=${a.std.toFixed(1)} colours=${a.colours} lit=${(a.nonBlack * 100).toFixed(0)}%`, info ? JSON.stringify(info) : '');
    if (a.std < 8 || a.colours < 8 || a.nonBlack < 0.2) problems.push(`screenshot "${name}" looks blank (std ${a.std.toFixed(1)}, colours ${a.colours})`);
    return a;
  };

  console.log(`smoke: ${URL}`);
  await page.goto(URL, { waitUntil: 'load' });
  await waitFor(() => window.CS && window.CS.ready, 20000, 'game ready');

  // ---- title ----
  await waitState('title');
  await sleep(1200);
  await shot('title');

  // Letterboxing: a square-ish window must still give a 16:9 stage.
  await page.setViewportSize({ width: 900, height: 900 });
  await sleep(200);
  const box = await page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { w: r.width, h: r.height }; });
  if (Math.abs(box.w / box.h - 16 / 9) > 0.02) problems.push(`stage is not 16:9 after resize: ${box.w}x${box.h}`);
  await page.setViewportSize({ width: 1280, height: 720 });
  await sleep(200);

  // ---- select ----
  await press('Enter');
  await waitState('select');
  // audio starts on the first key press; M toggles mute and back
  const a0 = await page.evaluate(() => CS.info());
  if (a0.audio !== 'running') problems.push(`AudioContext not running after first input (state: ${a0.audio})`);
  await press('KeyM');
  await sleep(150);
  if (!(await page.evaluate(() => CS.info().muted))) problems.push('M did not mute');
  await shot('muted');
  await press('KeyM');
  await sleep(150);
  if (await page.evaluate(() => CS.info().muted)) problems.push('M did not unmute');
  // every Sound.play('name') in the source, and each fighter's special stinger, must exist
  const src = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const used = new Set([...src.matchAll(/Sound\.play\('([A-Za-z]+)'(?!\s*\+)/g)].map((m) => m[1]));
  for (const id of [...src.matchAll(/\{ id: '([a-z]+)',/g)].map((m) => m[1])) used.add('sp' + id[0].toUpperCase() + id.slice(1));
  const known = new Set(await page.evaluate(() => CS.debug.sfxNames()));
  for (const n of used) if (!known.has(n)) problems.push(`Sound.play("${n}") has no effect defined`);
  for (const name of ['punch', 'metal', 'glass', 'crash', 'jingle', 'trombone']) {
    const lvl = await page.evaluate((n) => CS.debug.sfx(n), name);
    if (!(lvl > 0.01)) problems.push(`sound "${name}" produced no signal (peak ${lvl})`);
  }
  await sleep(1500);
  await press('ArrowRight');
  await sleep(500);
  await shot('select');

  // ---- vs ----
  await press('Enter');
  await waitState('vs');
  await sleep(1200);
  await shot('vs');

  // ---- fight ----
  await waitState('fight', 10000);
  await sleep(1500);
  await shot('fight');

  // Real input: walk to the truck, punch and kick it.
  if (await page.evaluate(() => CS.info().fighterX !== null && CS.info().fighterX !== undefined)) {
    await waitFor(() => CS.info().phase === 'play', 15000, 'play phase');
    const x0 = (await page.evaluate(() => CS.info())).fighterX;
    await page.keyboard.down('ArrowRight'); await sleep(1600); await page.keyboard.up('ArrowRight');
    const x1 = (await page.evaluate(() => CS.info())).fighterX;
    if (!(x1 > x0 + 1)) problems.push(`fighter did not walk right (${x0} -> ${x1})`);
    for (let i = 0; i < 6; i++) { await press('KeyJ'); await sleep(200); }
    await press('KeyK'); await sleep(260);
    await shot('combat-kick');
    for (let i = 0; i < 3; i++) { await press('KeyK'); await sleep(450); }
    const info = await page.evaluate(() => CS.info());
    if (!(info.hits >= 4 && info.truckHP < 800)) problems.push(`attacks did not land (hits ${info.hits}, truck ${info.truckHP})`);
    // walking away and punching must whiff (range check)
    await page.keyboard.down('ArrowLeft'); await sleep(1200); await page.keyboard.up('ArrowLeft');
    const before = (await page.evaluate(() => CS.info())).hits;
    for (let i = 0; i < 3; i++) { await press('KeyJ'); await sleep(250); }
    const after = (await page.evaluate(() => CS.info())).hits;
    if (after !== before) problems.push(`out-of-range punches registered (${before} -> ${after})`);
    // crouch (hold down): low jab + sweep must land (walk long enough to reach the truck's nose)
    await page.keyboard.down('ArrowRight'); await sleep(2600); await page.keyboard.up('ArrowRight');
    await page.keyboard.down('KeyS'); await sleep(250);
    if (!(await page.evaluate(() => CS.info().crouching))) problems.push('holding down did not crouch');
    const lowBefore = (await page.evaluate(() => CS.info())).hits;
    await press('KeyJ'); await sleep(350); await press('KeyK'); await sleep(300);
    await shot('crouch-sweep');
    await sleep(300);
    await page.keyboard.up('KeyS'); await sleep(150);
    const lowAfter = (await page.evaluate(() => CS.info())).hits;
    if (!(lowAfter >= lowBefore + 2)) problems.push(`crouching attacks did not land (${lowBefore} -> ${lowAfter})`);
    // jump (up) with a flying kick near the apex, then land
    await page.keyboard.down('ArrowUp'); await sleep(60); await page.keyboard.up('ArrowUp');
    await sleep(180);
    const air = await page.evaluate(() => CS.info());
    if (!(air.air && air.fighterY > 0.4)) problems.push(`jump did not leave the ground (y ${air.fighterY})`);
    await press('KeyK'); await sleep(120);
    await shot('jump-kick');
    await sleep(900);
    const landed = await page.evaluate(() => CS.info());
    if (landed.air || landed.fighterY !== 0) problems.push(`fighter did not land (y ${landed.fighterY})`);
    if (!(landed.hits >= lowAfter + 1)) problems.push(`flying kick did not land (${lowAfter} -> ${landed.hits})`);
    await press('KeyH'); await sleep(300);
    await shot('hitbox-debug');
    await press('KeyH');
  }

  // Truck damage stages (debug hits, independent of the fighter).
  if (await page.evaluate(() => !!window.CS.debug.hitTruck)) {
    await page.evaluate(() => CS.debug.cam(0.5, 2.2, 11, 1.8, 1.2, 0));
    for (const stage of [1, 2, 3, 4]) {
      for (let i = 0; i < 80 && (await page.evaluate(() => CS.info().truckStage)) < stage; i++) {
        await page.evaluate(() => CS.debug.hitTruck(30));
        await sleep(60);
      }
      if ((await page.evaluate(() => CS.info().truckStage)) < stage) problems.push(`truck never reached damage stage ${stage}`);
      await sleep(stage === 4 ? 2000 : 700);
      await shot(`truck-stage${stage}`);
    }
    await page.evaluate(() => CS.debug.cam());
  }
  await page.evaluate(() => window.CS.debug && window.CS.debug.endFight && window.CS.debug.endFight());

  // ---- results ----
  await waitState('results', 20000);
  await sleep(1500);
  await shot('results');

  // Retry → a full match played by the in-page bot must end in PERFECT.
  await press('Enter');
  await waitFor(() => ['vs', 'fight'].includes(window.CS.state), 10000, 'retry');
  if (await page.evaluate(() => !!CS.debug.bot)) {
    const bestBefore = (await page.evaluate(() => CS.info())).best;
    await waitState('fight');
    await waitFor(() => CS.info().phase === 'announce' || CS.info().phase === 'play', 10000, 'announce');
    await sleep(500);
    await shot('announce');
    await page.evaluate(() => CS.debug.bot(true));
    await page.waitForFunction(() => { const i = CS.info(); if (i.phase === 'play' && i.hits >= 6) { CS.debug.pause(true); return true; } return false; }, null, { timeout: 60000, polling: 16 });
    await sleep(150);
    await shot('juice-midfight');
    await page.evaluate(() => CS.debug.pause(false));
    await page.waitForFunction(() => { const i = CS.info(); if (i.phase === 'finisher' && i.phaseT > 0.12) { CS.debug.pause(true); return true; } return i.phase === 'end'; }, null, { timeout: 90000, polling: 16 });
    await sleep(150);
    await shot('finisher');
    await page.evaluate(() => CS.debug.pause(false));
    await waitFor(() => CS.info().phase === 'end', 30000, 'bot to wreck the truck');
    await sleep(1600);
    await shot('perfect');
    await page.evaluate(() => CS.debug.bot(false));
    await waitState('results', 15000);
    const r = await page.evaluate(() => CS.info().result);
    console.log('  bot result:', JSON.stringify(r));
    if (!r.win || !(r.bonus > 0) || r.total !== r.score + r.bonus) problems.push(`bot match did not end in a valid PERFECT: ${JSON.stringify(r)}`);
    await sleep(1800);
    await shot('results-win');
    const best = (await page.evaluate(() => CS.info())).best;
    if (best !== Math.max(bestBefore, r.total)) problems.push(`session best ${best} != max(${bestBefore}, ${r.total})`);

    // Retry again and let the clock run out → SALE CANCELLED.
    await press('Enter');
    await waitState('fight');
    await waitFor(() => CS.info().phase === 'play', 10000, 'play');
    await page.evaluate(() => CS.debug.setTimer(1.5));
    await waitFor(() => CS.info().phase === 'end', 10000, 'time up');
    await sleep(2600);
    await shot('sale-cancelled');
    await waitState('results', 15000);
    const r2 = await page.evaluate(() => CS.info().result);
    if (r2.win || r2.bonus !== 0) problems.push(`time-out did not end in SALE CANCELLED: ${JSON.stringify(r2)}`);
    if ((await page.evaluate(() => CS.info())).best !== best) problems.push('session best changed after a worse round');
    await sleep(1200);
    await shot('results-lose');
    // Change fighter goes back to select
    await press('ArrowDown'); await press('Enter');
    await waitState('select');
  }

  const info = await page.evaluate(() => window.CS.info && window.CS.info());
  if (info && info.calls > 150) problems.push(`draw calls ${info.calls} > 150 budget`);

  // Mobile: touch buttons appear on a touch device and drive the menus.
  const mobile = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const mp = await mobile.newPage();
  mp.on('pageerror', (e) => problems.push(`mobile uncaught: ${e.message}`));
  mp.on('console', (m) => { if (m.type() === 'error') problems.push(`mobile console.error: ${m.text()}`); });
  await mp.goto(URL, { waitUntil: 'load' });
  await mp.waitForFunction(() => window.CS && window.CS.ready, null, { timeout: 20000 });
  if (await mp.evaluate(() => document.getElementById('touch').hidden)) problems.push('touch controls hidden on a touch device');
  // menus are tapped directly: the screen starts, a portrait picks, tapping it again fights
  const tapHud = async (x, y) => {
    const r = await mp.evaluate(() => { const b = document.getElementById('stage').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
    await mp.touchscreen.tap(r[0] + (x / 480) * r[2], r[1] + (y / 270) * r[3]);
  };
  await sleep(500);
  await tapHud(240, 140);
  await mp.waitForFunction(() => CS.state === 'select', null, { timeout: 10000 }).catch(() => problems.push('tapping the title did not open select'));
  await sleep(600);
  const portrait = (i) => [100 + i * 48 + 20, 220];
  await tapHud(...portrait(3));
  await sleep(400);
  if ((await mp.evaluate(() => CS.info().fighterIndex)) !== 3) problems.push('tapping a portrait did not pick that fighter');
  await sleep(800);
  await mp.screenshot({ path: path.join(OUT, `${String(++shotN).padStart(2, '0')}-mobile-select.png`) });
  await tapHud(...portrait(3));
  await mp.waitForFunction(() => CS.state === 'vs', null, { timeout: 10000 }).catch(() => problems.push('tapping the picked portrait again did not start'));
  // in the round the full pad shows, and its pause button freezes the clock
  await mp.evaluate(() => CS.debug.quickFight(3));
  await mp.waitForFunction(() => CS.info().phase === 'play', null, { timeout: 15000 }).catch(() => problems.push('mobile round did not reach play'));
  await sleep(300);
  if (!(await mp.isVisible('[data-a=punch]'))) problems.push('punch button not shown during the round');
  await mp.tap('[data-a=pause]');
  await sleep(300);
  const tp0 = await mp.evaluate(() => CS.info().timer);
  await sleep(700);
  if ((await mp.evaluate(() => CS.info().timer)) !== tp0) problems.push('pause button did not freeze the clock');
  await sleep(800);
  await mp.screenshot({ path: path.join(OUT, `${String(++shotN).padStart(2, '0')}-mobile.png`) });
  console.log('  shot mobile');
  await mobile.close();

  await browser.close();
}

let failed = false;
try { await main(); }
catch (e) { problems.push(`test error: ${e.stack || e.message}`); }
finally { if (server) server.kill(); }

if (problems.length) {
  failed = true;
  console.error('\nSMOKE FAILED:');
  for (const p of problems) console.error('  - ' + p);
} else {
  console.log('\nSMOKE OK: no console errors, no WebGL errors, no uncaught exceptions, screens render.');
}
process.exit(failed ? 1 : 0);
