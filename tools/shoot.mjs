// Takes the screenshots in shots.json: starts a static server for game/, launches headless Chrome
// with software WebGL, opens each ?shot=... scene at 1280x800, waits for window.__shotReady,
// captures a JPEG under 256 KiB into screenshots/, and fails on any console error or exception.
// Usage: node tools/shoot.mjs [shot-name ...]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, launchChrome, connectPage, ROOT } from './chrome.mjs';

const MAX_BYTES = 256 * 1024;
const only = process.argv.slice(2);
// SHOTS_FILE and OUT_DIR point at another scene list and folder (art review renders kept out of screenshots/).
const listPath = process.env.SHOTS_FILE || join(ROOT, 'shots.json');
const custom = !!process.env.SHOTS_FILE || !!process.env.OUT_DIR;

async function main() {
  const shots = JSON.parse(readFileSync(listPath, 'utf8')).filter((s) => !only.length || only.some((o) => s.name.includes(o)));
  const outDir = process.env.OUT_DIR || join(ROOT, 'screenshots');
  mkdirSync(outDir, { recursive: true });
  const server = await startServer();
  const chrome = await launchChrome({ width: 1280, height: 800 });
  let failed = false;
  try {
    const page = await connectPage(chrome.port, { width: 1280, height: 800 });
    for (const shot of shots) {
      const t0 = Date.now();
      page.errors.length = 0;
      await page.navigate(`http://127.0.0.1:${server.port}/index.html${shot.query}`);
      await page.waitFor('window.__shotReady === true', 180000);
      let quality = 88;
      let bytes = null;
      for (;;) {
        const r = await page.send('Page.captureScreenshot', { format: 'jpeg', quality, captureBeyondViewport: false });
        bytes = Buffer.from(r.data, 'base64');
        if (bytes.length <= MAX_BYTES || quality <= 40) break;
        quality -= 8;
      }
      writeFileSync(join(outDir, shot.name), bytes);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`${shot.name}: ${bytes.length} bytes (quality ${quality}) in ${secs}s`);
      if (page.errors.length) {
        failed = true;
        console.error(`ERRORS in ${shot.name}:\n  ${page.errors.join('\n  ')}`);
      }
    }
    page.close();
  } finally {
    await chrome.close();
    await server.close();
  }
  if (!only.length && !custom) {
    const keep = new Set(shots.map((s) => s.name));
    for (const f of readdirSync(outDir)) if (!keep.has(f)) unlinkSync(join(outDir, f));
  }
  if (failed) {
    console.error('Screenshot run had page errors.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
