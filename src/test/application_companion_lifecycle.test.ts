import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { APPLICATION_COMPANION_PATH, startApplicationCompanion, type CompanionFixtureMode } from '../server/application_companion_supervisor.ts';

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const fixturePids = () => {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Process -Name ApplicationCompanion -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
  assert.ok(result.status === 0 || result.status === 1); assert.equal(result.error, undefined);
  return result.stdout.trim().split(/\s+/).filter(Boolean).map(Number);
};
const baseline = new Set(fixturePids());
after(async () => {
  // Startup rejection may precede bounded asynchronous cleanup.
  const deadline = Date.now() + 6000;
  while (fixturePids().some(pid => !baseline.has(pid)) && Date.now() < deadline) await new Promise(done => setTimeout(done, 100));
  assert.deepEqual(fixturePids().filter(pid => !baseline.has(pid)), [], 'no owned broker/fixture survives any failure');
});
test('Windows private application pipe ACL and first-instance rejection', () => {
  assert.equal(process.platform, 'win32');
  const result = spawnSync(APPLICATION_COMPANION_PATH, ['--self-test'], { encoding: 'utf8', timeout: 8000 });
  assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).type, 'SELF_TEST_OK');
});
test('readiness retains live companion and broker; shutdown observes both gone', async () => {
  const instance = await startApplicationCompanion();
  try {
    assert.ok(alive(instance.pid)); assert.ok(alive(instance.brokerPid));
    let lost = false; void instance.lost.then(() => { lost = true; });
    await new Promise(done => setTimeout(done, 1200)); assert.equal(lost, false);
    await instance.shutdown(); assert.equal(await instance.lost, 'closed');
    assert.equal(await instance.closed, true); assert.equal(alive(instance.pid), false); assert.equal(alive(instance.brokerPid), false);
    await instance.shutdown();
  } finally { await instance.shutdown(); }
});
test('concurrent fixture ownership is independent', async () => {
  const first = await startApplicationCompanion();
  let second: Awaited<ReturnType<typeof startApplicationCompanion>> | undefined;
  try {
    second = await startApplicationCompanion(); assert.notEqual(first.pid, second.pid);
    await first.shutdown(); assert.ok(alive(second.pid)); await second.shutdown();
  } finally { await first.shutdown(); await second?.shutdown(); }
});
for (const target of ['companion', 'broker'] as const) test(`actual ${target} death notifies loss and collects owned UI`, async () => {
  const instance = await startApplicationCompanion();
  try {
    process.kill(target === 'companion' ? instance.pid : instance.brokerPid);
    assert.equal(await instance.lost, 'failed'); assert.equal(await instance.closed, true);
    assert.equal(alive(instance.pid), false);
  } finally { await instance.shutdown(); }
});
test('cancellation after readiness notifies immediately and cleans up', async () => {
  const controller = new AbortController(); const instance = await startApplicationCompanion({ signal: controller.signal });
  controller.abort(); assert.equal(await instance.lost, 'cancelled'); assert.equal(await instance.closed, true);
  assert.equal(alive(instance.pid), false);
});
test('cancellation while initializing remains nonblocking', async () => {
  const controller = new AbortController(); let ticks = 0;
  const timer = setInterval(() => ticks++, 10);
  const pending = startApplicationCompanion({ signal: controller.signal, mode: 'timeout' });
  const rejected = assert.rejects(pending);
  try { await new Promise(done => setTimeout(done, 700)); controller.abort(); await rejected; assert.ok(ticks > 3); }
  finally { clearInterval(timer); controller.abort(); }
});
for (const mode of ['timeout', 'wrong-peer', 'assignment-failure'] as CompanionFixtureMode[]) test(`actual ${mode} rejects readiness within deadline`, async () => {
  const began = Date.now(); await assert.rejects(startApplicationCompanion({ mode })); assert.ok(Date.now() - began < 9000);
});
for (const mode of ['exit', 'disconnect'] as CompanionFixtureMode[]) test(`actual ${mode} never leaves successful lifetime active`, async () => {
  let instance: Awaited<ReturnType<typeof startApplicationCompanion>>;
  try { instance = await startApplicationCompanion({ mode }); } catch { return; }
  assert.equal(await instance.lost, 'failed'); assert.equal(await instance.closed, true); assert.equal(alive(instance.pid), false);
});
test('pre-cancelled launch does not create processes', async () => {
  const controller = new AbortController(); controller.abort(); await assert.rejects(startApplicationCompanion({ signal: controller.signal }));
});
test('parent input EOF revokes an already-ready native companion', async () => {
  const broker = spawn(APPLICATION_COMPANION_PATH, ['--broker', 'normal'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  const exited = new Promise<void>(done => broker.once('close', () => done()));
  const ready = new Promise<number>((resolve, reject) => {
    broker.once('error', reject); broker.once('close', () => reject(new Error('early close')));
    broker.stdout.on('data', chunk => { output += String(chunk); const frame = output.split('\n')[0]; if (output.includes('\n')) { try { resolve(JSON.parse(frame).pid); } catch (error) { reject(error); } } });
  });
  const deadline = setTimeout(() => broker.kill(), 8000);
  try {
    broker.stdin.write('{"v":1,"type":"START"}\n'); const pid = await ready; assert.ok(alive(pid));
    broker.stdin.end(); await exited; assert.equal(alive(pid), false);
  } finally { clearTimeout(deadline); broker.kill(); await exited; }
});
