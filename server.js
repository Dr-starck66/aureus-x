import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import configHandler from './api/config.js';
import geocodeHandler from './api/geocode.js';
import healthHandler from './api/health.js';
import researchHandler from './api/research.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

const apiRoutes = new Map([
  ['/api/config', configHandler],
  ['/api/geocode', geocodeHandler],
  ['/api/health', healthHandler],
  ['/api/research', researchHandler],
]);

const staticTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function adaptResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
    return res;
  };
  return res;
}

async function serveStatic(urlPath, res) {
  const wanted = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.replace(/^\/+/, ''));
  const normalized = path.normalize(wanted).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(__dirname, normalized);
  if (!fullPath.startsWith(__dirname)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }
  try {
    const data = await readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', staticTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', ext === '.html' ? 'no-store' : 'public, max-age=300');
    return res.end(data);
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const api = apiRoutes.get(url.pathname);
    if (api) {
      if ((req.method || 'GET').toUpperCase() !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET');
        return res.end('Method Not Allowed');
      }
      req.query = Object.fromEntries(url.searchParams.entries());
      return await api(req, adaptResponse(res));
    }
    return await serveStatic(url.pathname, res);
  } catch (error) {
    console.error('AUREUS-X request failure', error);
    if (!res.headersSent) res.statusCode = 500;
    if (!res.writableEnded) res.end('Internal Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`AUREUS-X listening on ${PORT}`);
});
