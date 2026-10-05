// Ad-hoc screenshot helper for development.
//   node tests/shot.mjs <out.png> "<js to run in the page>" [waitMs] ["<js before shot>"]
// The page is served from the repo root; errors are printed.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [out = 'screenshots/tmp/shot.png', js = '', wait = '1500', js2 = ''] = process.argv.slice(2);
const PORT = 9000 + Math.floor(Math.random() * 900);
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(100); }
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text()); });
  page.on('pageerror', (e) => console.log('[uncaught]', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForFunction(() => window.CS && window.CS.ready);
  if (js) console.log('eval:', await page.evaluate(js));
  await sleep(+wait);
  if (js2) console.log('eval2:', await page.evaluate(js2));
  await page.screenshot({ path: path.resolve(ROOT, out) });
  console.log('info:', JSON.stringify(await page.evaluate(() => window.CS.info())));
  await browser.close();
} finally { server.kill(); }
