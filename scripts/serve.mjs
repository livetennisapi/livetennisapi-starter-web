// A small static file server for local use: node scripts/serve.mjs [folder] [port]
// It listens on 127.0.0.1 only and serves files from one folder, nothing else.
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const folder = resolve(process.argv[2] ?? 'dist');
const realFolder = await realpath(folder);
const port = Number(process.argv[3] ?? process.env.PORT ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.map': 'application/json; charset=utf-8',
};

// Returns { file } to serve, { redirect } for a folder asked for without its
// trailing slash, or null. Symlinks are followed, and the real file must
// still be inside the served folder.
async function lookup(urlPath) {
  let path;
  try {
    path = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const target = resolve(folder, '.' + (path.endsWith('/') ? path + 'index.html' : path));
  try {
    const real = await realpath(target);
    if (real !== realFolder && !real.startsWith(realFolder + sep)) return null;
    const info = await stat(real);
    if (info.isDirectory()) return path.endsWith('/') ? null : { redirect: `${urlPath}/` };
    return info.isFile() ? { file: real } : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  const found = await lookup(pathname);
  if (found?.redirect) {
    response.writeHead(301, { Location: found.redirect }).end();
    return;
  }
  if (!found) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found\n');
    return;
  }
  const file = found.file;
  response.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  // A file deleted or locked between stat() and the read (for example during
  // a rebuild) ends this one response instead of crashing the server.
  createReadStream(file)
    .on('error', () => response.destroy())
    .pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${folder} at http://localhost:${port}/`);
});
