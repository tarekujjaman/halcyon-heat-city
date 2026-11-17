// Shared by shoot.mjs and playtest.mjs: a static server for game/, headless Chrome with software
// WebGL, and a tiny DevTools-protocol client over Node's built-in WebSocket. Standard library only.
import { createServer } from 'node:http';
import { createReadStream, statSync, mkdtempSync, rmSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const GAME = join(ROOT, 'game');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };

export function startServer() {
  return new Promise((resolveServer) => {
    const server = createServer((req, res) => {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
      } catch {
        res.writeHead(400).end();
        return;
      }
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = resolve(join(GAME, normalize(pathname)));
      if (file !== GAME && !file.startsWith(GAME + sep)) {
        res.writeHead(403).end();
        return;
      }
      let size;
      try {
        const st = statSync(file);
        if (!st.isFile()) throw new Error('dir');
        size = st.size;
      } catch {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': size, 'cache-control': 'no-store' });
      createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolveServer({ server, port: server.address().port, close: () => new Promise((r) => server.close(r)) }));
  });
}

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export async function launchChrome({ width = 1280, height = 800 } = {}) {
  const userDir = mkdtempSync(join(tmpdir(), 'halcyon-chrome-'));
  const port = 9222 + Math.floor(Math.random() * 1000);
  const args = [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--use-gl=angle',
    `--window-size=${width},${height}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    'about:blank',
  ];
  const proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d.toString(); });
  let version = null;
  for (let i = 0; i < 100 && !version; i += 1) {
    await new Promise((r) => setTimeout(r, 150));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      version = await res.json();
    } catch {
      /* not up yet */
    }
  }
  if (!version) {
    proc.kill();
    throw new Error(`Chrome did not start on port ${port}: ${stderr.slice(-800)}`);
  }
  const close = async () => {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
    await new Promise((r) => setTimeout(r, 300));
    try {
      rmSync(userDir, { recursive: true, force: true });
    } catch {
      /* temp dir may still be locked briefly */
    }
  };
  return { proc, port, version, close, userDir };
}

/** A minimal CDP session on the first page target. */
export async function connectPage(port, { width = 1280, height = 800 } = {}) {
  let targets = [];
  for (let i = 0; i < 50 && !targets.length; i += 1) {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    targets = (await res.json()).filter((t) => t.type === 'page');
    if (!targets.length) await new Promise((r) => setTimeout(r, 100));
  }
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    ws.addEventListener('open', resolveOpen, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolveMsg, rejectMsg } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rejectMsg(new Error(`${msg.error.message} (${msg.error.code})`));
      else resolveMsg(msg.result);
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) || []) fn(msg.params);
    }
  });
  const send = (method, params = {}) => new Promise((resolveMsg, rejectMsg) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, { resolveMsg, rejectMsg });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const on = (method, fn) => {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(fn);
  };
  on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails;
    errors.push(`exception: ${d.exception && d.exception.description ? d.exception.description : d.text} at ${d.url || ''}:${d.lineNumber || ''}`);
  });
  on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error' || p.type === 'assert') errors.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  });
  on('Log.entryAdded', (p) => {
    if (p.entry.level === 'error') errors.push(`log: ${p.entry.text} ${p.entry.url || ''}`);
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const evaluate = async (expression, { awaitPromise = true } = {}) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`evaluate failed: ${r.exceptionDetails.text} ${r.exceptionDetails.exception ? r.exceptionDetails.exception.description : ''}\n${expression.slice(0, 200)}`);
    return r.result.value;
  };
  const navigate = async (url) => {
    await send('Page.navigate', { url });
    for (let i = 0; i < 200; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
      const ready = await evaluate('document.readyState === "complete"').catch(() => false);
      if (ready) return;
    }
    throw new Error(`page did not load: ${url}`);
  };
  const waitFor = async (expression, timeoutMs = 120000, every = 250) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const v = await evaluate(expression).catch(() => false);
      if (v) return v;
      await new Promise((r) => setTimeout(r, every));
    }
    throw new Error(`timed out waiting for: ${expression}`);
  };
  const key = async (code, type) => {
    const keyName = code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : code === 'Space' ? ' ' : code;
    const vk = { Escape: 27, Enter: 13, Space: 32, ShiftLeft: 16, ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40 }[code] || (keyName.length === 1 ? keyName.toUpperCase().charCodeAt(0) : 0);
    await send('Input.dispatchKeyEvent', { type, code, key: keyName.length === 1 ? keyName.toLowerCase() : keyName, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  };
  const keyDown = (code) => key(code, 'keyDown');
  const keyUp = (code) => key(code, 'keyUp');
  const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });
  return { ws, send, on, errors, evaluate, navigate, waitFor, keyDown, keyUp, mouse, close: () => ws.close() };
}
