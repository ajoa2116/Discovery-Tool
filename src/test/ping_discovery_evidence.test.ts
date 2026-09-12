import strict from 'node:assert/strict';
let passed = 0;
const assert = { equal(actual: unknown, expected: unknown, message?: string) { strict.equal(actual, expected, message); passed++; }, ok(value: unknown) { strict.ok(value); passed++; } };
import { execFile } from 'node:child_process';
import { WindowsPingProvider } from '../core/engine/diagnostic_engine.ts';
import { AdvancedScanService } from '../core/engine/advanced_scan.ts';
import { emptyAdvancedScanRequest } from '../shared/advanced_scan.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';

const target = '192.168.1.20';
const provider = (output: string, error: Error | null = null) => new WindowsPingProvider(((_file: unknown, _args: unknown, _options: unknown, callback: Function) => {
  callback(error, output, '');
}) as unknown as typeof execFile);

async function run() {
  const rejected = [
    `Reply from 192.168.0.124: Destination host unreachable.\nPackets: Sent = 1, Received = 1, Lost = 0 (0% loss)`,
    `Reply from ${target}: Destination host unreachable.`,
    `Reply from ${target}: TTL expired in transit.`,
    `Pinging ${target} with 32 bytes of data:\nReply from 192.168.1.200: bytes=32 time<1ms TTL=64`,
    `Pinging ${target} with 32 bytes of data:\nRequest timed out.`,
    '',
  ];
  for (const output of rejected) {
    const ping = provider(output);
    const result = await ping.check(target, { timeoutMs: 700 });
    assert.equal(result.success, false, output);
    assert.ok(!result.transportReachable);
    const db = new SiteProjectDatabase();
    db.startQuickWork();
    const service = new AdvancedScanService({ inspectAdapters: async () => [] } as any, ping, undefined, db);
    const request = emptyAdvancedScanRequest();
    request.targets = [{ type: 'RANGE', start: target, end: target }];
    request.methods = ['PING'];
    let emitted = 0;
    const status = await service.execute(await service.validate(request), { onDevice: () => emitted++, onComplete: () => {} });
    assert.equal(status.completedTargets, 1);
    assert.equal(status.findings, 0);
    assert.equal(emitted, 0);
    assert.equal(db.getDevices().length, 0);
  }
  for (const output of [
    `Reply from ${target}: bytes=32 time<1ms TTL=64`,
    `Reply from ${target}: bytes=32 time=12ms TTL=128`,
    `Respuesta desde ${target}: bytes=32 tiempo<1ms TTL=64`,
  ]) assert.equal((await provider(output).check(target, { timeoutMs: 700 })).success, true);
  const controller = new AbortController();
  controller.abort();
  const reply = `Reply from ${target}: bytes=32 time=1ms TTL=64`;
  assert.equal((await provider(reply).check(target, { timeoutMs: 700, signal: controller.signal })).errorCategory, 'CANCELLED');
  assert.equal((await provider(reply, new Error('failed')).check(target, { timeoutMs: 700 })).success, false);
  console.log(`Ping discovery evidence summary: ${passed} passed, 0 failed, 0 skipped`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
