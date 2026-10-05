// Record the README GIF deterministically: the simulation is paused and stepped in fixed ticks
// (the in-page bot plays), each step is captured at the native 480x270, then ffmpeg builds the GIF.
//   node tests/record.mjs            -> screenshots/cybersmash.gif
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'screenshots/tmp/gif');
const OUT = path.join(ROOT, 'screenshots/cybersmash.gif');
const PORT = 9000 + Math.floor(Math.random() * 900);
const TICKS = 5;                        // 60 Hz / 5 = 12 fps
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
let n = 0, browser;
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(100); }
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  page.on('pageerror', (e) => { throw e; });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForFunction(() => window.CS && window.CS.ready);
  const frame = async () => {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: path.join(TMP, `f${String(n++).padStart(4, '0')}.png`) });
  };
  const run = async (count, before) => { for (let i = 0; i < count; i++) { if (before) await page.evaluate(before); await page.evaluate((k) => CS.debug.step(k), TICKS); await frame(); } };

  // Tromp vs. a pre-softened truck so the clip shows punches, the stamp special and the finisher.
  await page.evaluate(() => { CS.debug.pause(true); CS.debug.quickFight(0); });
  await page.evaluate(() => { for (let i = 0; i < 22; i++) CS.debug.hitTruck(25, 0.4); CS.debug.clearComicText(); });
  await run(27);                                                            // SALE 1... HAGGLE!
  await page.evaluate(() => { CS.debug.placeFighter(-3.2); CS.debug.bot(true); });
  for (let i = 0; i < 260; i++) {                                           // fight until the wreck + PERFECT
    await run(1);
    const s = await page.evaluate(() => CS.info());
    if (s.phase === 'end' && s.phaseT > 2.6) break;
  }
  await browser.close();
  console.log(`captured ${n} frames`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(60 / TICKS), '-i', path.join(TMP, 'f%04d.png'),
    '-vf', 'split[a][b];[a]palettegen=max_colors=160:stats_mode=full[p];[b][p]paletteuse=dither=none', '-loop', '0', OUT]);
  console.log('wrote', path.relative(ROOT, OUT));
} finally { await browser?.close().catch(() => {}); server.kill(); }
