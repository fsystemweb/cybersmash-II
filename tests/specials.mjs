// Screenshot every character's special move mid-animation and check it deals 3x punch damage.
//   node tests/specials.mjs      (screenshots in screenshots/tmp/special-*.png)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9000 + Math.floor(Math.random() * 900);
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the special's own clock (game seconds) at which the move looks most telling
const MOMENT = { tromp: 0.82, muskrat: 0.8, zuck: 0.6, hassabyte: 0.25, hwatt: 0.9, oldman: 1.15 };
const problems = [];
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(100); }
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push('uncaught: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForFunction(() => window.CS && window.CS.ready);
  const ids = await page.evaluate(() => ['tromp', 'muskrat', 'zuck', 'hassabyte', 'hwatt', 'oldman']);
  for (let i = 0; i < ids.length; i++) {
    await page.evaluate((i) => CS.debug.quickFight(i), i);
    await page.waitForFunction(() => CS.info().phase === 'play', null, { timeout: 15000 });
    await page.evaluate(() => CS.debug.placeFighter(-1.6));
    await sleep(300);
    const hp0 = (await page.evaluate(() => CS.info())).truckHP;
    await page.keyboard.press('KeyL');
    // freeze the sim when the special reaches its money shot, capture, resume
    await page.waitForFunction((t) => { const i = CS.info(); if (i.fighterMode === 'special' && i.modeT >= t) { CS.debug.pause(true); return true; } return false; }, MOMENT[ids[i]], { timeout: 15000, polling: 16 });
    await sleep(150);
    await page.screenshot({ path: path.join(ROOT, `screenshots/tmp/special-${ids[i]}.png`) });
    await page.evaluate(() => CS.debug.pause(false));
    await page.waitForFunction(() => CS.info().fighterMode === 'idle', null, { timeout: 15000 });
    await sleep(200);
    const hp1 = (await page.evaluate(() => CS.info())).truckHP;
    const dealt = hp0 - hp1;
    console.log(`  ${ids[i].padEnd(10)} special dealt ${dealt}`);
    if (Math.abs(dealt - 30) > 1) problems.push(`${ids[i]} special dealt ${dealt}, expected 30`);
  }
  await browser.close();
} finally { server.kill(); }
if (problems.length) { console.error('SPECIALS FAILED:\n  - ' + problems.join('\n  - ')); process.exit(1); }
console.log('SPECIALS OK');
