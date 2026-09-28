import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNativeCapability } from '../core/connect/native_camera_capability.ts';

test('non-Windows does not execute a native capability probe', async () => {
  const result = await checkNativeCapability({ platform: 'linux', probe: async () => { throw Error('must not execute'); } });
  assert.equal(result.code, 'UNSUPPORTED_PLATFORM');
});
test('Windows alone never establishes native availability', async () => {
  assert.equal((await checkNativeCapability({ platform: 'win32', probe: async () => { throw Error(); } })).available, false);
});
test('compatible unelevated host with runtime is available', async () => {
  const result = await checkNativeCapability({ platform: 'win32', probe: async () => ({ v: 1, type: 'CAPABILITY', elevated: false, runtime: '153.0.4234.48' }) });
  assert.deepEqual(result, { available: true, code: 'AVAILABLE' });
});
for (const value of [null, {}, { v: 2, type: 'CAPABILITY', elevated: false, runtime: '153.0.4234.48' }, { v: 1, type: 'CAPABILITY', elevated: true, runtime: '153.0.4234.48' }, { v: 1, type: 'CAPABILITY', elevated: false, runtime: '' }, { v: 1, type: 'CAPABILITY', elevated: false, runtime: 'secret', target: 'http://arbitrary' }]) {
  test(`invalid capability fails closed: ${JSON.stringify(value)}`, async () => {
    const result = await checkNativeCapability({ platform: 'win32', probe: async () => value });
    assert.equal(result.available, false);
    assert.ok(!JSON.stringify(result).includes('secret'));
  });
}
test('elevated-parent refusal produces specific truthful guidance category', async () => {
  assert.equal((await checkNativeCapability({ platform: 'win32', probe: async () => ({ v: 1, type: 'BROKER_FAILED', code: 'UNELEVATED_REQUIRED' }) })).code, 'UNELEVATED_REQUIRED');
});
test('runtime absence produces unavailable category', async () => {
  assert.equal((await checkNativeCapability({ platform: 'win32', probe: async () => ({ v: 1, type: 'CAPABILITY', elevated: false, runtime: '' }) })).code, 'RUNTIME_UNAVAILABLE');
});
