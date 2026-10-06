import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, type IncomingMessage } from 'node:http';
import { connect } from 'node:net';
import { readFile } from 'node:fs/promises';
import { WebSocket, WebSocketServer } from 'ws';
import { httpHostAllowed } from '../server/http_host_validation.ts';

test('WebSocket handshake rejects invalid authorities before connection', async () => {
  const server = createServer();
  const wss = new WebSocketServer({ server, path: '/ws', verifyClient: (info: { req: IncomingMessage }) => httpHostAllowed(info.req.rawHeaders) });
  let connections = 0;
  wss.on('connection', () => { connections++; });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const handshake = (headers: string[]) => new Promise<string>((resolve, reject) => {
    const socket = connect(address.port, '127.0.0.1');
    let response = '';
    socket.setTimeout(3000, () => socket.destroy(new Error('Handshake timeout')));
    socket.on('error', reject);
    socket.on('data', data => { response += data.toString(); });
    socket.on('end', () => resolve(response));
    socket.on('connect', () => socket.write(`GET /ws HTTP/1.1\r\n${headers.join('\r\n')}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`));
  });
  try {
    for (const headers of [[], ['Host: evil.example:3001'], ['Host: localhost.evil.example:3001'],
      ['Host: localhost:3002'], ['Host: localhost'], ['Host: [::1]:3001'],
      ['Host: user@localhost:3001'], ['Host: localhost:3001/'],
      ['Host: localhost:3001,127.0.0.1:3001'],
      ['Host: localhost:3001', 'hOsT: localhost:3001'],
      ['Host: evil.example', 'Host: localhost:3001'],
      ['X-Forwarded-Host: localhost:3001'],
      ['Host: evil.example', 'X-Forwarded-Host: localhost:3001', 'Forwarded: host=localhost:3001']]) {
      const response = await handshake(headers);
      assert.match(response, /^HTTP\/1\.1 (400|401) /);
      assert.doesNotMatch(response, /101 Switching Protocols/);
      assert.equal(connections, 0);
      assert.equal(wss.clients.size, 0);
    }
  } finally {
    await new Promise<void>(resolve => wss.close(() => resolve()));
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('both local Hosts preserve connections and messages without changing Origin/authentication policy', async () => {
  const server = createServer();
  const wss = new WebSocketServer({ server, path: '/ws', verifyClient: (info: { req: IncomingMessage }) => httpHostAllowed(info.req.rawHeaders) });
  wss.on('connection', socket => socket.on('message', data => socket.send(data.toString())));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    for (const host of ['localhost:3001', '127.0.0.1:3001']) {
      for (const origin of [undefined, 'http://localhost:5173', 'http://untrusted.example']) {
        const client = new WebSocket(`ws://127.0.0.1:${address.port}/ws`, {
          headers: { Host: host, 'X-Forwarded-Host': 'evil.example', ...(origin ? { Origin: origin } : {}) },
          handshakeTimeout: 3000,
        });
        try {
          const message = await new Promise<string>((resolve, reject) => {
            client.on('error', reject);
            client.on('open', () => client.send('fixture message'));
            client.on('message', data => resolve(data.toString()));
          });
          assert.equal(message, 'fixture message');
          await new Promise<void>(resolve => { client.once('close', () => resolve()); client.close(); });
        } finally { client.terminate(); }
      }
    }
  } finally {
    for (const client of wss.clients) client.terminate();
    await new Promise<void>(resolve => wss.close(() => resolve()));
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('production WebSocket upgrade uses the existing HTTP Host policy', async () => {
  const source = await readFile(new URL('../server/index.ts', import.meta.url), 'utf8');
  assert.match(source, /new WebSocketServer\(\{ server, path: '\/ws', verifyClient: \(info: \{ req: IncomingMessage \}\) => httpHostAllowed\(info\.req\.rawHeaders\) \}\)/);
});
