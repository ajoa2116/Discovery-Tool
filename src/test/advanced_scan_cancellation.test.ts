import { AdvancedScanService } from '../core/engine/advanced_scan.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { emptyAdvancedScanRequest } from '../shared/advanced_scan.ts';
import { WindowsAdapterSnapshot } from '../types/index.ts';

let passed = 0;
let failed = 0;
function assert(value: unknown, name: string) {
  if (value) { console.log(`  PASS: ${name}`); passed++; }
  else { console.error(`  FAIL: ${name}`); failed++; }
}

async function run() {
  const adapter: WindowsAdapterSnapshot = {
    interfaceIndex: 7,
    interfaceAlias: 'Ethernet',
    mediaType: 'ETHERNET',
    operationalStatus: 'Up',
    eligible: true,
    dhcpEnabled: true,
    ipv4Addresses: [{ address: '192.168.50.10', prefixLength: 24 }],
    defaultGateways: ['192.168.50.1'],
    dnsAutomatic: true,
    dnsServers: [],
    capturedAt: 'now',
  };
  const db = new SiteProjectDatabase();
  db.startQuickWork();
  const adapters = { inspectAdapters: async () => [adapter] } as any;
  const ping = {
    check: async (ip: string, options: { signal?: AbortSignal }) => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return { type: 'PING', targetIp: ip, protocol: 'ICMP', success: true, transportReachable: true, timestamp: 'now', cancelled: options.signal?.aborted };
    },
  } as any;
  const tcp = { check: async () => { throw new Error('TCP should not run'); } } as any;
  const service = new AdvancedScanService(adapters, ping, tcp, db);
  const request = emptyAdvancedScanRequest();
  request.adapterIndexes = [7];
  request.targets = [{ type: 'RANGE', start: '192.168.50.1', end: '192.168.50.40' }];
  request.methods = ['PING'];
  request.performance = 'CONSERVATIVE';
  const plan = await service.validate(request);
  let completionCalls = 0;
  const execution = service.execute(plan, { onDevice: () => {}, onComplete: () => completionCalls++ });
  await new Promise(resolve => setTimeout(resolve, 35));
  assert(service.stop(), 'running Advanced Scan accepts cancellation');
  const status = await execution;
  assert(status.cancelled && !status.running, 'cancelled scan reaches a truthful terminal state');
  assert(status.completedTargets < status.targetCount, 'cancellation stops remaining bounded work');
  assert(completionCalls === 1 && db.getDevices().length > 0, 'completed findings are preserved and completion emits once');

  console.log(`\nAdvanced Scan cancellation summary: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

run().catch(error => { console.error(error); process.exit(1); });
