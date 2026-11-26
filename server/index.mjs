import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { attachRooms } from './rooms.mjs';

const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.woff2', 'font/woff2'],
  ['.wav', 'audio/wav']
]);

async function serveSite(request, response) {
  const rawPath = (request.url ?? '/').split('?')[0];
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end(); return; }
  if (rawPath === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"ok":true}');
    return;
  }

  const pathname = rawPath === '/' ? '/index.html' : rawPath;
  const type = types.get(extname(pathname));
  const allowed = pathname === '/index.html'
    || /^\/(?:assets|css|js)\/(?:[\w-]+\/)*[\w.-]+$/.test(pathname);
  if (!allowed || !type) { response.writeHead(404).end(); return; }

  const file = new URL(`..${pathname}`, import.meta.url);
  if (pathname === '/index.html') {
    const html = await readFile(file, 'utf8').catch(() => null);
    if (html === null) { response.writeHead(404).end(); return; }
    const page = html.replace(/name="pokerzone-online-url" content="[^"]*"/, 'name="pokerzone-online-url" content="/ws"');
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(page), 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : page);
    return;
  }
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size, 'X-Content-Type-Options': 'nosniff' });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).on('error', () => response.destroy()).pipe(response);
}

export function createPokerServer(options) {
  const server = createServer(serveSite);
  const closeRooms = attachRooms(server, options);
  return {
    server,
    close() {
      closeRooms();
      return new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections();
      });
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origins = (process.env.POKERZONE_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  const { server, close } = createPokerServer({ origins });
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? '127.0.0.1';
  server.listen(port, host, () => console.log(`PokerZone Online słucha na ${host}:${server.address().port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void close(); });
}
