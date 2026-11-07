import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const allowed = new Set(['/index.html', '/src/app.js', '/src/calculations.js', '/src/storage.js', '/src/styles.css']);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const target = path === '/' ? '/index.html' : path;
  if (!allowed.has(target)) { response.writeHead(404).end('Not found'); return; }
  try {
    const data = await readFile(fileURLToPath(new URL(`.${target}`, root)));
    const ext = target.slice(target.lastIndexOf('.'));
    response.writeHead(200, { 'Content-Type': `${types[ext]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(data);
  } catch { response.writeHead(500).end('Unable to read asset'); }
});
server.listen(Number(process.env.PORT || 5173), '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${server.address().port}`));
