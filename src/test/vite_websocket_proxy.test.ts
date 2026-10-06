import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, type IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { createServer as createViteServer, loadConfigFromFile } from 'vite';
import { httpHostAllowed } from '../server/http_host_validation.ts';

test('actual Vite WS proxy forwards approved Host and preserves Origin', async () => {
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' });
  assert.ok(loaded);
  const options = loaded.config.server?.proxy?.['/ws'];
  assert.ok(options && typeof options !== 'string');
  assert.equal(options.changeOrigin, true);
  assert.notEqual(options.rewriteWsOrigin, true);
  const observed: Array<{ host?: string; origin?: string }> = [];
  // A fixture only: never imports the application server, camera or adapter services.
  const backend = createServer();
  const wss = new WebSocketServer({ server: backend, path: '/ws', verifyClient: (info: { req: IncomingMessage }) => httpHostAllowed(info.req.rawHeaders) });
  wss.on('connection', (socket, req) => {
    observed.push({ host: req.headers.host, origin: req.headers.origin });
    socket.on('message', data => socket.send(data.toString()));
  });
  let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      backend.once('error', reject);
      backend.listen(3001, '127.0.0.1', resolve);
    });
    vite = await createViteServer({ configFile: false, plugins: [], logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, proxy: loaded.config.server!.proxy, watch: null },
    });
    await vite.listen();
    const address = vite.httpServer!.address();
    assert.ok(address && typeof address !== 'string');
    for (const name of ['localhost', '127.0.0.1']) {
      const origin = `http://${name}:5173`;
      const client = new WebSocket(`ws://127.0.0.1:${address.port}/ws`, {
        headers: { Host: `${name}:${address.port}`, Origin: origin }, handshakeTimeout: 3000,
      });
      try {
        const response = await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Fixture message timeout')), 3000);
          client.once('error', error => { clearTimeout(timer); reject(error); });
          client.once('open', () => client.send('proxy fixture'));
          client.once('message', data => { clearTimeout(timer); resolve(data.toString()); });
        });
        assert.equal(response, 'proxy fixture');
        assert.deepEqual(observed.at(-1), { host: 'localhost:3001', origin });
        await new Promise<void>(resolve => { client.once('close', () => resolve()); client.close(); });
      } finally { client.terminate(); }
    }
    assert.equal(observed.length, 2);
  } finally {
    for (const client of wss.clients) client.terminate();
    await vite?.close();
    await new Promise<void>(resolve => wss.close(() => resolve()));
    if (backend.listening) await new Promise<void>((resolve, reject) => backend.close(error => error ? reject(error) : resolve()));
  }
});
