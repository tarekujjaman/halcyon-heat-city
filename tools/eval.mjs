// Debug helper: open the game (any query) in headless Chrome and print the result of a JavaScript
// expression evaluated once the scene is ready. Usage:
//   node tools/eval.mjs "?shot=downtown&seed=1" "__game.fleet.vehicles.length"
import { startServer, launchChrome, connectPage } from './chrome.mjs';

import { readFileSync } from 'node:fs';

const query = process.argv[2] || '?test=1';
const arg = process.argv[3] || '1';
// "@file.js" reads the expression from a file.
const expression = arg.startsWith('@') ? readFileSync(arg.slice(1), 'utf8') : arg;

async function main() {
  const server = await startServer();
  const chrome = await launchChrome();
  try {
    const page = await connectPage(chrome.port);
    await page.navigate(`http://127.0.0.1:${server.port}/index.html${query}`);
    if (query.includes('shot=')) await page.waitFor('window.__shotReady === true', 120000);
    else await page.waitFor('window.__game && window.__game.state !== "loading"', 60000);
    const value = await page.evaluate(expression);
    console.log(JSON.stringify(value, null, 2));
    if (page.errors.length) console.error('page errors:\n  ' + page.errors.join('\n  '));
    page.close();
  } finally {
    await chrome.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
