import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { NATIVE_HOST_PATH } from '../core/connect/native_camera_proof.ts';

function run(args: string[], reply?: string, closeInput = false) {
  return new Promise<{ code: number | null; output: string; elapsed: number }>((resolve, reject) => {
    const start = Date.now(), child = spawn(NATIVE_HOST_PATH, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', replied = false;
    const deadline = setTimeout(() => { child.kill(); reject(Error('Native process did not honor its deadline')); }, 14_000);
    child.once('error', e => { clearTimeout(deadline); reject(e); });
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      if (!replied && output.includes('BROKER_READY')) { replied = true; if (reply) child.stdin.write(reply); if (closeInput) child.stdin.end(); }
    });
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    child.stdin.on('error', () => {});
    child.once('exit', code => { clearTimeout(deadline); resolve({ code, output, elapsed: Date.now() - start }); });
  });
}
test('native executable rejects independent arbitrary-IP launch arguments', async () => { const r = await run(['--host', 'http://192.0.2.100', '123']); assert.equal(r.code, 2); });
test('real broker rejects malformed secret-bearing bootstrap without echoing payload', async () => { const secret = 'cbh_' + 'X'.repeat(43), r = await run(['--broker'], `{"v":2,"type":"OFFER","token":"${secret}"}\n`); assert.equal(r.code, 3); assert.ok(!r.output.includes(secret)); });
test('real broker cleans up abandoned application channel', async () => { const r = await run(['--broker'], undefined, true); assert.equal(r.code, 3); assert.ok(r.elapsed < 5000); });
test('real broker input timeout is bounded even with a silent live parent', async () => { const r = await run(['--broker']); assert.equal(r.code, 3); assert.ok(r.elapsed >= 9000 && r.elapsed < 14000); });
