import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { APPLICATION_COMPANION_PATH, startApplicationCompanion, type CompanionFixtureMode } from '../server/application_companion_supervisor.ts';
import { CompanionBootstrapAuthority } from '../server/companion_bootstrap_authority.ts';
import { ApplicationSecret, ApplicationSessionAuthority } from '../server/application_session_authority.ts';
import { PrivateBootstrapTransport } from '../server/private_bootstrap_transport.ts';

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const fixturePids = () => {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Process -Name ApplicationCompanion -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
  assert.ok(result.status === 0 || result.status === 1); assert.equal(result.error, undefined);
  return result.stdout.trim().split(/\s+/).filter(Boolean).map(Number);
};
const baseline = new Set(fixturePids());
const browserPids = () => {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name = 'msedgewebview2.exe'\" | Where-Object { $_.CommandLine -like '*CCTVApplicationCompanion*' } | Select-Object -ExpandProperty ProcessId"], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(result.status, 0); assert.equal(result.error, undefined);
  return result.stdout.trim().split(/\s+/).filter(Boolean).map(Number);
};
const browserBaseline = new Set(browserPids());
after(async () => {
  // Startup rejection may precede bounded asynchronous cleanup.
  const deadline = Date.now() + 6000;
  while (fixturePids().some(pid => !baseline.has(pid)) && Date.now() < deadline) await new Promise(done => setTimeout(done, 100));
  assert.deepEqual(fixturePids().filter(pid => !baseline.has(pid)), [], 'no owned broker/fixture survives any failure');
  const browserDeadline = Date.now() + 6000;
  while (browserPids().some(pid => !browserBaseline.has(pid)) && Date.now() < browserDeadline) await new Promise(done => setTimeout(done, 100));
  assert.deepEqual(browserPids().filter(pid => !browserBaseline.has(pid)), [], 'no owned fixture WebView2 process remains');
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
  const deadline = setTimeout(() => broker.kill(), 16000);
  try {
    broker.stdin.write('{"v":1,"type":"START"}\n'); const pid = await ready; assert.ok(alive(pid));
    broker.stdin.end(); await exited; assert.equal(alive(pid), false);
  } finally { clearTimeout(deadline); broker.kill(); await exited; }
});
test('native document policy rejects foreign sources, stale generations, duplicate keys and exact-deadline responses', () => {
  const result = spawnSync(APPLICATION_COMPANION_PATH, ['--document-self-test'], { encoding: 'utf8', timeout: 8000 });
  assert.equal(result.status, 0); const proof = JSON.parse(result.stdout);
  assert.equal(proof.type, 'DOCUMENT_TEST_OK'); assert.ok(proof.count >= 70);
});
const rejectionCases: [CompanionFixtureMode, string][] = [
  ...(['bad-nonce', 'bad-generation', 'bad-navigation-id', 'extra-field', 'malformed-message', 'oversized-message', 'early-message'] as CompanionFixtureMode[]).map(mode => [mode, 'MESSAGE_REJECTED'] as [CompanionFixtureMode, string]),
  ['challenge-timeout', 'READINESS_TIMEOUT'], ['late-response', 'READINESS_TIMEOUT'],
  ['unapproved-navigation', 'NAVIGATION_REJECTED'], ['redirect', 'NAVIGATION_REJECTED'], ['same-url-redirect', 'NAVIGATION_REJECTED'],
  ['popup', 'POPUP_REJECTED'], ['frame', 'FRAME_REJECTED'],
];
for (const [mode, code] of rejectionCases) test(`actual WebView2 ${mode} is rejected by ${code}`, async () => {
  await assert.rejects(startApplicationCompanion({ mode }), error => error instanceof Error && (error as Error & { code: string }).code === code);
});
for (const [mode, code] of [['replay', 'MESSAGE_REJECTED'], ['post-ready-navigation', 'NAVIGATION_REJECTED'], ['reload', 'NAVIGATION_REJECTED'], ['fragment', 'NAVIGATION_REJECTED'], ['renderer-loss', 'RENDERER_LOST']] as [CompanionFixtureMode, string][])
  test(`actual WebView2 ${mode} irreversibly invalidates document lifetime`, async () => {
    let instance: Awaited<ReturnType<typeof startApplicationCompanion>>;
    try { instance = await startApplicationCompanion({ mode }); }
    catch (error) { assert.equal((error as { code: string }).code, code); return; }
    try {
      assert.equal(await instance.lost, 'failed'); assert.equal(await instance.failureCode, code);
      assert.equal(await instance.closed, true); assert.equal(alive(instance.pid), false);
    } finally { await instance.shutdown(); }
  });
test('native bootstrap state denies partial delivery, stale generation, expiry and replay', () => {
  const result = spawnSync(APPLICATION_COMPANION_PATH, ['--bootstrap-self-test'], { encoding: 'utf8', timeout: 8000 });
  assert.equal(result.status, 0); const proof = JSON.parse(result.stdout); assert.equal(proof.type, 'BOOTSTRAP_TEST_OK'); assert.ok(proof.count >= 50);
});
test('real READY companion receives, activates and redeems bootstrap exactly once', async () => {
  const owner = await CompanionBootstrapAuthority.start();
  try {
    const receipt = await owner.issueBootstrap(); assert.ok(receipt.expiresAt > Date.now());
    const session = await owner.redeemBootstrap(); assert.equal(owner.validateSession(session.secret.expose()).id, session.receipt.id);
    await assert.rejects(owner.redeemBootstrap()); assert.ok(owner.companion.alive);
    await owner.dispose(); assert.throws(() => owner.validateSession(session.secret.expose()));
  } finally { await owner.dispose(); }
});
test('transport completion precedes activation; redemption is refused while authority is pending', async () => {
  const companion = await startApplicationCompanion(); let token = '';
  let authority!: ApplicationSessionAuthority;
  const transport = new PrivateBootstrapTransport('normal', companion);
  authority = new ApplicationSessionAuthority({ async deliver(secret, receipt, signal) {
    token = secret.expose(); assert.throws(() => authority.redeemBootstrap(token));
    await transport.deliver(secret, receipt, signal); assert.throws(() => authority.redeemBootstrap(token));
  } });
  try {
    const receipt = await authority.issueBootstrap(); await companion.activateBootstrap(receipt.id);
    const native = await companion.requestBootstrapRedemption(receipt.id); assert.equal(native, token);
    const session = authority.redeemBootstrap(native); assert.throws(() => authority.redeemBootstrap(native)); assert.ok(authority.validateSession(session.secret.expose()));
  } finally { authority.dispose(); await companion.shutdown(); }
});
for (const mode of ['delivery-wrong-ack', 'delivery-duplicate-ack', 'delivery-timeout', 'delivery-navigation', 'delivery-stale-generation', 'delivery-exit', 'delivery-partial-done', 'delivery-replay', 'activation-navigation'] as CompanionFixtureMode[])
  test(`actual ${mode} cannot authorize a partially delivered bootstrap`, async () => {
    const owner = await CompanionBootstrapAuthority.start({ mode });
    try { await assert.rejects(owner.issueBootstrap()); await assert.rejects(owner.redeemBootstrap()); await owner.companion.closed; assert.equal(owner.companion.alive, false); }
    finally { await owner.dispose(); }
  });
for (const target of ['companion', 'broker'] as const) test(`verified ${target} loss revokes a redeemed session proof`, async () => {
  const owner = await CompanionBootstrapAuthority.start();
  try {
    await owner.issueBootstrap(); const session = await owner.redeemBootstrap();
    process.kill(target === 'companion' ? owner.companion.pid : owner.companion.brokerPid);
    await owner.companion.lost; assert.throws(() => owner.validateSession(session.secret.expose())); await owner.companion.closed;
  } finally { await owner.dispose(); }
});
test('cancellation during private delivery revokes pending authority and collects ownership', async () => {
  const owner = await CompanionBootstrapAuthority.start({ mode: 'delivery-timeout' }); const controller = new AbortController();
  try {
    const issued = owner.issueBootstrap(controller.signal); const rejected = assert.rejects(issued);
    await new Promise(done => setTimeout(done, 800)); controller.abort(); await rejected;
    await assert.rejects(owner.redeemBootstrap()); await owner.companion.closed; assert.equal(owner.companion.alive, false);
  } finally { await owner.dispose(); }
});
test('authority is never exposed for a document which fails READY', async () => {
  await assert.rejects(CompanionBootstrapAuthority.start({ mode: 'bad-nonce' }));
});
test('expired authority receipt never starts native delivery', async () => {
  const owner = await CompanionBootstrapAuthority.start({ clock: () => Date.now() - 31000 });
  try { await assert.rejects(owner.issueBootstrap()); await assert.rejects(owner.redeemBootstrap()); }
  finally { await owner.dispose(); }
});
test('authority expiry after delivery still rejects redemption', async () => {
  let now = Date.now(); const owner = await CompanionBootstrapAuthority.start({ clock: () => now });
  try { await owner.issueBootstrap(); now += 30000; await assert.rejects(owner.redeemBootstrap()); }
  finally { await owner.dispose(); }
});
test('concurrent owned authorities cannot redeem each other and independent close revokes only its owner', async () => {
  const first = await CompanionBootstrapAuthority.start(); const second = await CompanionBootstrapAuthority.start();
  try {
    await first.issueBootstrap(); await second.issueBootstrap(); const one = await first.redeemBootstrap(), two = await second.redeemBootstrap();
    assert.throws(() => first.validateSession(two.secret.expose())); await first.dispose(); assert.ok(second.validateSession(two.secret.expose())); assert.throws(() => first.validateSession(one.secret.expose()));
  } finally { await first.dispose(); await second.dispose(); }
});
test('second issuance fails closed instead of reusing the same native bootstrap target', async () => {
  const owner = await CompanionBootstrapAuthority.start();
  try { await owner.issueBootstrap(); await assert.rejects(owner.issueBootstrap()); await assert.rejects(owner.redeemBootstrap()); }
  finally { await owner.dispose(); }
});
test('low-level activation without delivery is refused for the verified companion', async () => {
  const companion = await startApplicationCompanion();
  try { await assert.rejects(companion.activateBootstrap('11111111-1111-1111-1111-111111111111')); assert.equal(companion.alive, false); }
  finally { await companion.shutdown(); }
});
test('expired direct transport input is refused before offering a credential', async () => {
  const companion = await startApplicationCompanion();
  try { await assert.rejects(new PrivateBootstrapTransport('normal', companion).deliver(new ApplicationSecret('bootstrap'), { id: '11111111-1111-1111-1111-111111111111', expiresAt: Date.now() - 1 })); }
  finally { await companion.shutdown(); }
});
test('navigation after verified redemption revokes the live session proof', async () => {
  const owner = await CompanionBootstrapAuthority.start({ mode: 'redeemed-navigation' });
  try {
    await owner.issueBootstrap(); const session = await owner.redeemBootstrap(); await owner.companion.lost;
    assert.throws(() => owner.validateSession(session.secret.expose())); await owner.companion.closed;
  } finally { await owner.dispose(); }
});
test('persistent target refuses activation while delivery is still pending', async () => {
  const companion = await startApplicationCompanion({ mode: 'delivery-timeout' }); const controller = new AbortController();
  const id = '11111111-1111-1111-1111-111111111111';
  try {
    const delivering = new PrivateBootstrapTransport('normal', companion).deliver(new ApplicationSecret('bootstrap'), { id, expiresAt: Date.now() + 30000 }, controller.signal);
    const denied = assert.rejects(delivering);
    await assert.rejects(companion.activateBootstrap(id)); await denied; assert.equal(companion.alive, false);
  } finally { controller.abort(); await companion.shutdown(); }
});
test('persistent target itself rejects a repeated native redemption and revokes its owner', async () => {
  const owner = await CompanionBootstrapAuthority.start();
  try {
    const receipt = await owner.issueBootstrap(); const session = await owner.redeemBootstrap();
    await assert.rejects(owner.companion.requestBootstrapRedemption(receipt.id));
    assert.throws(() => owner.validateSession(session.secret.expose()));
  } finally { await owner.dispose(); }
});


test('native session state policy proof', () => {
  const result = spawnSync(APPLICATION_COMPANION_PATH, ['--session-self-test'], { encoding: 'utf8', timeout: 8000 });
  assert.equal(result.status, 0); const proof = JSON.parse(result.stdout); assert.equal(proof.type, 'SESSION_TEST_OK'); assert.ok(proof.count >= 60);
});
test('session delivery returns metadata only and logout revokes and closes the owner', async () => {
  const owner = await CompanionBootstrapAuthority.start();
  try {
    await owner.issueBootstrap(); const session = await owner.deliverSession();
    assert.deepEqual(Object.keys(session).sort(), ['expiresAt','id']); assert.ok(owner.companion.alive);
    assert.throws(() => owner.validateSession('session_' + 'a'.repeat(43)));
    await owner.logout(); assert.equal(owner.companion.alive, false); await assert.rejects(owner.deliverSession());
  } finally { await owner.dispose(); }
});
for (const mode of ['session-wrong-ack','session-late-ack','session-wrong-expiry','session-lost-activation','session-duplicate-ack','session-timeout','session-navigation','session-stale-generation','session-exit','session-partial-done','session-lost-done','session-replay','session-activation-loss'] as CompanionFixtureMode[]) {
  test('native session fails closed: ' + mode, async () => {
    const owner = await CompanionBootstrapAuthority.start({ mode });
    try { await owner.issueBootstrap(); await assert.rejects(owner.deliverSession()); assert.equal(owner.companion.alive, false); }
    finally { await owner.dispose(); }
  });
}
for (const mode of ['session-active-navigation','session-renderer-loss','session-channel-loss'] as CompanionFixtureMode[]) {
  test('active native session is revoked on ' + mode, async () => {
    const owner = await CompanionBootstrapAuthority.start({ mode });
    try { await owner.issueBootstrap(); await owner.deliverSession(); await owner.companion.lost; assert.equal(owner.companion.alive, false); await assert.rejects(owner.logout()); }
    finally { await owner.dispose(); }
  });
}
test('cancel session grant during delivery and deny late success', async () => {
  const owner = await CompanionBootstrapAuthority.start({ mode: 'session-timeout' }); const controller = new AbortController();
  try { await owner.issueBootstrap(); const result = owner.deliverSession(controller.signal); setTimeout(() => controller.abort(), 200); await assert.rejects(result); assert.equal(owner.companion.alive, false); }
  finally { controller.abort(); await owner.dispose(); }
});

test('short native session expires, clears authority and terminates owned processes', async () => {
  const owner = await CompanionBootstrapAuthority.start();
  try {
    const receipt = await owner.issueBootstrap(); await owner.companion.requestBootstrapRedemption(receipt.id);
    await owner.companion.deliverSession(new ApplicationSecret('session').expose(), { id: '11111111-1111-1111-1111-111111111111', expiresAt: Date.now() + 2500 });
    await owner.companion.activateSession(); await owner.companion.lost;
    assert.equal(await owner.companion.failureCode, 'SESSION_EXPIRED'); assert.equal(owner.companion.alive, false);
  } finally { await owner.dispose(); }
});
test('server session validation occurs only after native activation; process loss revokes it', async () => {
  const owner = await CompanionBootstrapAuthority.start();
  try {
    await owner.issueBootstrap(); const session = await owner.redeemBootstrap();
    assert.deepEqual(owner.validateSession(session.secret.expose()), session.receipt);
    process.kill(owner.companion.pid); await owner.companion.lost; assert.throws(() => owner.validateSession(session.secret.expose()));
  } finally { await owner.dispose(); }
});

test('cancellation after final session delivery prevents activation', async () => {
  const owner = await CompanionBootstrapAuthority.start(); const controller = new AbortController();
  try {
    const bootstrap = await owner.issueBootstrap(); await owner.companion.requestBootstrapRedemption(bootstrap.id);
    await owner.companion.deliverSession(new ApplicationSecret('session').expose(), { id: '11111111-1111-1111-1111-111111111111', expiresAt: Date.now() + 10000 });
    controller.abort(); await assert.rejects(owner.companion.activateSession(controller.signal)); assert.equal(owner.companion.alive, false);
  } finally { await owner.dispose(); }
});
test('pre-cancelled session issuance revokes the existing bootstrap owner', async () => {
  const owner = await CompanionBootstrapAuthority.start(); const controller = new AbortController();
  try { await owner.issueBootstrap(); controller.abort(); await assert.rejects(owner.deliverSession(controller.signal)); assert.equal(owner.companion.alive, false); }
  finally { await owner.dispose(); }
});
test('native session grant and activation cannot be replayed', async () => {
  for (const stage of ['offer','activation']) {
    const owner = await CompanionBootstrapAuthority.start();
    try {
      await owner.issueBootstrap(); const proof = await owner.redeemBootstrap();
      if (stage === 'offer') await assert.rejects(owner.companion.deliverSession(proof.secret.expose(), proof.receipt));
      else await assert.rejects(owner.companion.activateSession());
      assert.throws(() => owner.validateSession(proof.secret.expose()));
    } finally { await owner.dispose(); }
  }
});
