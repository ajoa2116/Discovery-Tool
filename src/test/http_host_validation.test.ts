import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import cors from 'cors';
import { httpHostAllowed, validateHttpHost } from '../server/http_host_validation.ts';
import { productionAssets } from '../server/production_assets.ts';

test('exact single Host authority; forwarded headers do not grant authority', () => {
  for (const host of ['localhost:3001', '127.0.0.1:3001']) {
    assert.equal(httpHostAllowed(['hOsT', host]), true);
    assert.equal(httpHostAllowed(['Host', host, 'X-Forwarded-Host', 'evil.example']), true);
  }
  for (const host of ['', 'evil.example:3001', 'localhost.evil.example:3001', 'localhost',
    'localhost:3002', '127.0.0.2:3001', '[::1]:3001', 'LOCALHOST:3001',
    'localhost:03001', 'localhost:3001,127.0.0.1:3001', 'user@localhost:3001',
    'http://localhost:3001', 'localhost:3001/', ' localhost:3001']) {
    assert.equal(httpHostAllowed(['Host', host, 'X-Forwarded-Host', 'localhost:3001',
      'Forwarded', 'host=localhost:3001']), false, host);
  }
  assert.equal(httpHostAllowed([]), false);
  assert.equal(httpHostAllowed(['X-Forwarded-Host', 'localhost:3001']), false);
  assert.equal(httpHostAllowed(['Host', 'localhost:3001', 'HOST', 'localhost:3001']), false);
  assert.equal(httpHostAllowed(['Host', 'evil.example', 'Host', 'localhost:3001']), false);
});

test('wire requests are rejected before downstream middleware; API and assets remain compatible', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cctv-host-test-'));
  await writeFile(join(root, 'index.html'), '<html>fixture UI</html>');
  await writeFile(join(root, 'asset.js'), 'fixture asset');
  const app = express();
  let entered = 0;
  app.use(validateHttpHost);
  app.use((_req, _res, next) => { entered++; next(); });
  app.use(cors({ exposedHeaders: ['X-CCTV-Report-Renderer', 'Content-Disposition'] }));
  app.use(express.json());
  app.post('/api/fixture', (req, res) => res.json({ received: req.body }));
  app.use(productionAssets(root));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const request = (headers: string[], path = '/api/fixture', body = '{broken', method = 'POST') =>
    new Promise<string>((resolve, reject) => {
      const socket = connect(address.port, '127.0.0.1');
      let response = '';
      socket.setTimeout(3000, () => socket.destroy(new Error('Fixture request timeout')));
      socket.on('error', reject);
      socket.on('data', data => { response += data.toString(); });
      socket.on('end', () => resolve(response));
      socket.on('connect', () => socket.write(`${method} ${path} HTTP/1.1\r\n${headers.join('\r\n')}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`));
    });
  try {
    for (const headers of [[], ['Host: evil.example:3001'], ['Host: localhost:3002'],
      ['Host: localhost:3001', 'Host: localhost:3001'],
      ['Host: evil.example', 'hOsT: localhost:3001'], ['Host: localhost:3001,evil.example'],
      ['Host: evil.example', 'X-Forwarded-Host: localhost:3001', 'Forwarded: host=localhost:3001']]) {
      const response = await request(headers);
      assert.match(response, /^HTTP\/1\.1 400/);
      assert.equal(entered, 0);
      assert.doesNotMatch(response, /Access-Control-Allow-Origin/i);
    }
    for (const host of ['localhost:3001', '127.0.0.1:3001']) {
      const response = await request([`Host: ${host}`, 'Origin: http://localhost:5173',
        'X-Forwarded-Host: evil.example'], '/api/fixture', '{"fixture":true}');
      assert.match(response, /^HTTP\/1\.1 200/);
      assert.match(response, /"received":\{"fixture":true\}/);
      assert.match(await request([`Host: ${host}`], '/', '', 'GET'), /fixture UI/);
      assert.match(await request([`Host: ${host}`], '/asset.js', '', 'GET'), /fixture asset/);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('production registration precedes all other Express middleware and Vite API proxy rewrites Host', async () => {
  const source = await readFile(new URL('../server/index.ts', import.meta.url), 'utf8');
  assert.match(source, /const app = express\(\);\s*app\.use\(validateHttpHost\);/);
  const vite = await readFile(new URL('../../vite.config.ts', import.meta.url), 'utf8');
  assert.match(vite, /'\/api':\s*\{\s*target: 'http:\/\/localhost:3001',\s*changeOrigin: true/);
});
