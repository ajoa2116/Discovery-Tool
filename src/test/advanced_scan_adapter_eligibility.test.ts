import { AdvancedScanPlanner } from '../core/engine/advanced_scan.ts';
import { classifyWindowsAdapter } from '../core/network/windows_adapter_service.ts';
import { emptyAdvancedScanRequest } from '../shared/advanced_scan.ts';
import { WindowsAdapterSnapshot } from '../types/index.ts';

let passed = 0;
let failed = 0;
function assert(value: unknown, name: string) {
  if (value) { console.log(`  PASS: ${name}`); passed++; }
  else { console.error(`  FAIL: ${name}`); failed++; }
}

function liveAdapter(overrides: Partial<WindowsAdapterSnapshot>): WindowsAdapterSnapshot {
  return {
    interfaceAlias: 'Wi-Fi',
    interfaceDescription: 'Intel(R) Wi-Fi 6 AX201 160MHz',
    interfaceIndex: 10,
    mediaType: 'OTHER',
    physicalMediaType: 'Native 802.11',
    hardwareInterface: true,
    operationalStatus: 'Up',
    eligible: false,
    dhcpEnabled: true,
    ipv4Addresses: [{ address: '192.168.145.49', prefixLength: 19 }],
    defaultGateways: ['192.168.128.1'],
    dnsAutomatic: true,
    dnsServers: [],
    capturedAt: 'now',
    ...overrides,
  };
}

const wifi = classifyWindowsAdapter(liveAdapter({}));
assert(wifi.eligible && wifi.mediaType === 'WIFI', 'live Intel Native 802.11 hardware Wi-Fi is eligible');
assert(wifi.ipv4Addresses[0].prefixLength === 19, 'live Wi-Fi prefix length /19 is preserved');

const ethernet = classifyWindowsAdapter(liveAdapter({
  interfaceAlias: 'Ethernet',
  interfaceDescription: 'Intel(R) Ethernet Connection (13) I219-LM',
  physicalMediaType: '802.3',
  operationalStatus: 'Disconnected',
  ipv4Addresses: [],
}));
assert(ethernet.mediaType === 'ETHERNET' && !ethernet.eligible && ethernet.eligibilityReason?.includes('disconnected'), 'disconnected physical 802.3 Ethernet remains visible but disabled');

const bluetooth = classifyWindowsAdapter(liveAdapter({
  interfaceAlias: 'Bluetooth Network Connection',
  interfaceDescription: 'Bluetooth Device (Personal Area Network)',
  physicalMediaType: 'BlueTooth',
  hardwareInterface: false,
  operationalStatus: 'Disconnected',
}));
assert(!bluetooth.eligible && bluetooth.mediaType === 'OTHER', 'Bluetooth PAN remains excluded');

const pangp = classifyWindowsAdapter(liveAdapter({
  interfaceAlias: 'Ethernet 2',
  interfaceDescription: 'PANGP Virtual Ethernet Adapter Secure',
  physicalMediaType: 'Unspecified',
  hardwareInterface: false,
  operationalStatus: 'Disabled',
  ipv4Addresses: [],
}));
assert(!pangp.eligible, 'PANGP virtual adapter remains excluded');

const misleadingName = classifyWindowsAdapter(liveAdapter({
  interfaceAlias: 'Wi-Fi',
  interfaceDescription: 'Example VPN Tunnel',
  physicalMediaType: 'Native 802.11',
  hardwareInterface: false,
}));
assert(!misleadingName.eligible, 'friendly Wi-Fi name cannot override non-hardware VPN evidence');

const request = emptyAdvancedScanRequest();
request.adapterIndexes = [10];
const plan = new AdvancedScanPlanner().plan(request, [wifi, ethernet, bluetooth, pangp]);
assert(plan.valid && plan.mode === 'ADVANCED' && plan.adapterIndexes[0] === 10 && plan.normalizedTargets.length === 0, 'adapter-only Advanced Scan accepts corrected Wi-Fi');

console.log(`\nAdvanced Scan adapter eligibility summary: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
