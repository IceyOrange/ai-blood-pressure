import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const chatHandler = require('./api/chat.js');
const port = Number(process.env.PORT || 4317);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

async function loadLocalEnvironment() {
  try {
    const content = await readFile(path.join(rootDirectory, '.env.local'), 'utf8');
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const separator = trimmed.indexOf('=');
      if (separator < 1) return;
      const name = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!process.env[name]) process.env[name] = value;
    });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function createApiResponse(response) {
  return {
    setHeader(name, value) {
      response.setHeader(name, value);
    },
    status(statusCode) {
      response.statusCode = statusCode;
      return this;
    },
    json(payload) {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(payload));
    }
  };
}

async function readJsonBody(request) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > 1024 * 1024) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function serveStatic(request, response, url) {
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const firstSegment = relativePath.split('/')[0];
  if (firstSegment.startsWith('.') || firstSegment === 'api' || ['dev-server.mjs', 'start-local.ps1'].includes(relativePath)) {
    response.statusCode = 404;
    response.end('Not found');
    return;
  }

  const absolutePath = path.resolve(rootDirectory, relativePath);
  const rootPrefix = `${path.resolve(rootDirectory)}${path.sep}`;
  if (absolutePath !== path.join(rootDirectory, 'index.html') && !absolutePath.startsWith(rootPrefix)) {
    response.statusCode = 403;
    response.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) throw new Error('Not a file');
    const content = await readFile(absolutePath);
    response.statusCode = 200;
    response.setHeader('Content-Type', contentTypes[path.extname(absolutePath).toLowerCase()] || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'HEAD') response.end();
    else response.end(content);
  } catch (error) {
    response.statusCode = 404;
    response.end('Not found');
  }
}

await loadLocalEnvironment();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/chat') {
      const body = request.method === 'POST' ? await readJsonBody(request) : {};
      await chatHandler({ method: request.method, body }, createApiResponse(response));
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method || '')) {
      response.statusCode = 405;
      response.end('Method not allowed');
      return;
    }
    await serveStatic(request, response, url);
  } catch (error) {
    console.error('Local server error:', error.message);
    if (!response.headersSent) response.statusCode = 500;
    if (!response.writableEnded) response.end('Local server error');
  }
});

server.listen(port, '127.0.0.1', () => {
  const keyStatus = process.env.GEMINI_API_KEY ? '已读取 GEMINI_API_KEY' : '未找到 .env.local 中的 GEMINI_API_KEY';
  console.log(`脉安本地服务：http://localhost:${port}`);
  console.log(`AI 状态：${keyStatus}`);
});
