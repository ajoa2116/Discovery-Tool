import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { BootstrapAckDecoder } from '../server/bootstrap_ack_decoder.ts';
import { superviseBootstrap, type BootstrapSupervisorOptions } from '../server/bootstrap_async_supervisor.ts';

const expected = { id: 'fixture-identity', nonce: 'fixture-nonce', digest: 'a'.repeat(64) };
const frame = JSON.stringify({ v: 1, type: 'DELIVERED', ...expected }) + '\n';
const options = (script: string, extra: Partial<BootstrapSupervisorOptions> = {}): BootstrapSupervisorOptions => ({
  executable: process.execPath, args: ['-e', script], environment: { SystemRoot: process.env.SystemRoot },
  input: 'fixture input', expected, timeoutMs: 3000, cleanupMs: 500, ...extra,
});
const output = (text: string) => `process.stdout.write(${JSON.stringify(text)});`;
const runStub = (body: string) => `process.stdin.resume();process.stdin.on('end',()=>{${body}});`;

test('decoder accepts fragmented UTF-8 and native CRLF acknowledgment', () => {
  const unicode = { ...expected, id: 'fixture-é-🔒' };
  const bytes = Buffer.from(JSON.stringify({ v: 1, type: 'DELIVERED', ...unicode }) + '\r\n');
  const decoder = new BootstrapAckDecoder(unicode);
  for (const byte of bytes) decoder.push(Buffer.from([byte]));
  assert.deepEqual(decoder.finish(), { v: 1, type: 'DELIVERED', ...unicode });
});

test('decoder rejects malformed shapes, duplicates including escaped keys, mismatched receipts and extra output', () => {
  for (const text of ['{broken\n', frame.replace('"v":1', '"v":2'), frame.replace('"v":1', '"v":1,"v":1'),
    frame.replace('"id":', '"\\u0069d":"fixture-identity","id":'),
    frame.replace('"nonce":"fixture-nonce"', '"nonce":"wrong"'),
    frame.replace('"digest":', '"extra":true,"digest":'),
    frame.replace('"id":"fixture-identity"', '"id":{}'), frame + frame, frame + ' ', '\ufeff' + frame,
    frame.replace('"v":1', '"v":01'), frame.replace('"v":1', '"v":true'), '{}\n']) {
    const decoder = new BootstrapAckDecoder(expected);
    assert.throws(() => decoder.push(Buffer.from(text)));
    assert.throws(() => decoder.finish());
    assert.throws(() => decoder.push(Buffer.from(frame)));
  }
});

test('decoder enforces byte limit, strict UTF-8, completeness and one frame across chunks', () => {
  for (const bytes of [Buffer.concat([Buffer.from([0xc3, 0x28]), Buffer.from('\n')]), Buffer.alloc(4097, 120)]) {
    const decoder = new BootstrapAckDecoder(expected);
    assert.throws(() => decoder.push(bytes));
  }
  const truncated = new BootstrapAckDecoder(expected);
  truncated.push(Buffer.from(frame.slice(0, -1))); assert.throws(() => truncated.finish());
  const extra = new BootstrapAckDecoder(expected);
  extra.push(Buffer.from(frame)); assert.throws(() => extra.push(Buffer.from('\n')));
  const bounded = new BootstrapAckDecoder(expected);
  bounded.push(Buffer.alloc(4096, 32)); assert.throws(() => bounded.push(Buffer.from('x')));
});

test('decoder snapshots expected receipt and accepts exactly the byte bound', () => {
  const binding = { ...expected }, decoder = new BootstrapAckDecoder(binding);
  binding.nonce = 'changed';
  const boundedFrame = frame.slice(0, -1) + ' '.repeat(4096 - Buffer.byteLength(frame)) + '\n';
  assert.equal(Buffer.byteLength(boundedFrame), 4096);
  decoder.push(Buffer.from(boundedFrame));
  assert.equal(decoder.finish().nonce, expected.nonce);
});

test('real async child delivery leaves event loop responsive and waits for clean close', async () => {
  let ticks = 0, done = false;
  const interval = setInterval(() => { ticks++; }, 5);
  try {
    const delivery = superviseBootstrap(options(runStub(`${output(frame)}setTimeout(()=>process.exit(0),150);`))).then(() => { done = true; });
    await new Promise<void>(resolve => setTimeout(resolve, 30));
    assert.equal(done, false);
    await delivery; assert.ok(ticks >= 3);
  } finally { clearInterval(interval); }
});

for (const [name, body] of [
  ['ack then nonzero exit', `${output(frame)}process.exitCode=2;`],
  ['exit before acknowledgment', 'process.exit(0);'],
  ['stderr despite valid acknowledgment', `${output(frame)}process.stderr.write('fixture failure');`],
  ['duplicate acknowledgment', output(frame + frame)],
  ['partial acknowledgment', output(frame.slice(0, -1))],
  ['invalid UTF-8', 'process.stdout.write(Buffer.from([0xff,10]));'],
  ['oversized output', "process.stdout.write('x'.repeat(4097));"],
]) {
  test(`supervisor rejects ${name}`, async () => {
    await assert.rejects(superviseBootstrap(options(runStub(body))), { message: 'Bootstrap helper unavailable.' });
  });
}

test('spawn failure and pre-abort are generic and never grant success', async () => {
  await assert.rejects(superviseBootstrap(options('', { executable: 'C:/missing-bootstrap-fixture.exe' })));
  let spawned = false;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(superviseBootstrap(options('', { signal: controller.signal }), () => { spawned = true; throw Error(); }));
  assert.equal(spawned, false);
});

test('timeout and mid-flight abort kill and reap the actual owned child', async () => {
  for (const ending of ['timeout', 'abort']) {
    const controller = new AbortController(); let pid = 0;
    const { spawn } = await import('node:child_process');
    const delivery = superviseBootstrap(options(runStub('setInterval(()=>{},1000);'), {
      timeoutMs: ending === 'timeout' ? 500 : 3000, signal: controller.signal,
    }), opts => {
      const child = spawn(opts.executable, [...opts.args], { env: opts.environment, windowsHide: true, shell: false, stdio: 'pipe' });
      child.on('spawn', () => { pid = child.pid!; }); return child;
    });
    const rejection = assert.rejects(delivery);
    if (ending === 'abort') setTimeout(() => controller.abort(), 100);
    await rejection;
    assert.ok(pid > 0);
    assert.throws(() => process.kill(pid, 0));
  }
});

function fakeChild() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    kills: 0, unrefs: 0,
    kill() { this.kills++; return false; }, unref() { this.unrefs++; },
  });
  return child;
}

test('abort dominates late acknowledgment/close and stuck cleanup is bounded', async () => {
  const child = fakeChild(), controller = new AbortController();
  const delivery = superviseBootstrap(options('', { signal: controller.signal, cleanupMs: 20 }), () => child as unknown as ChildProcessWithoutNullStreams);
  const rejection = assert.rejects(delivery);
  controller.abort();
  child.stdout.write(frame); await rejection;
  assert.equal(child.kills, 2); assert.equal(child.unrefs, 1);
  child.emit('close', 0, null); child.emit('error', new Error('late'));
});

test('close, stream errors and acknowledgment races settle only once', async () => {
  const child = fakeChild();
  const delivery = superviseBootstrap(options(''), () => child as unknown as ChildProcessWithoutNullStreams);
  child.stdout.write(frame);
  child.stdin.emit('error', new Error('broken input'));
  child.emit('close', 0, null);
  await assert.rejects(delivery);
  child.emit('close', 0, null); child.stdout.emit('error', new Error('late'));
  assert.equal(child.kills, 1);
});
