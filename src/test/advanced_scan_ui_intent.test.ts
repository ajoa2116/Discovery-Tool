import { readFileSync } from 'node:fs';
import { emptyAdvancedScanRequest } from '../shared/advanced_scan.ts';
import { hasAdvancedScanIntent, selectedAdapterPrefix } from '../ui/components/AdvancedScanModal.tsx';
import { WindowsAdapterSnapshot } from '../types/index.ts';
import { AdvancedScanPlanner } from '../core/engine/advanced_scan.ts';

let passed = 0;
let failed = 0;
function assert(value: unknown, name: string) {
  if (value) { console.log(`  PASS: ${name}`); passed++; }
  else { console.error(`  FAIL: ${name}`); failed++; }
}

const adapter = (index: number, prefixLength: number, eligible = true): WindowsAdapterSnapshot => ({
  interfaceIndex: index, interfaceAlias: `Adapter ${index}`, mediaType: 'WIFI', operationalStatus: 'Up', eligible,
  dhcpEnabled: true, ipv4Addresses: [{ address: index === 10 ? '192.168.145.49' : '10.0.0.5', prefixLength }],
  defaultGateways: [], dnsAutomatic: true, dnsServers: [], capturedAt: 'now',
});
const adapters = [adapter(10, 19), adapter(11, 24)];

assert(selectedAdapterPrefix(adapters, [10]) === '19', 'one eligible selected adapter offers its real /19 prefix');
assert(selectedAdapterPrefix(adapters, [10, 11]) === '', 'multiple selected adapters do not silently choose a prefix');
assert(selectedAdapterPrefix([adapter(10, 19, false)], [10]) === '', 'ineligible selected adapter does not provide assistance');

const empty = emptyAdvancedScanRequest();
assert(!hasAdvancedScanIntent(empty, 0, ''), 'truly empty configuration retains Start Quick Scan intent');
assert(hasAdvancedScanIntent(empty, 1, ''), 'an incomplete target row establishes Advanced Scan intent');
const selected = emptyAdvancedScanRequest(); selected.adapterIndexes = [10];
assert(hasAdvancedScanIntent(selected, 0, ''), 'selected adapter establishes Advanced Scan intent');
const method = emptyAdvancedScanRequest(); method.methods = ['PING'];
assert(hasAdvancedScanIntent(method, 0, ''), 'selected discovery method establishes Advanced Scan intent');
const performance = emptyAdvancedScanRequest(); performance.performance = 'FAST';
assert(hasAdvancedScanIntent(performance, 0, ''), 'explicit non-default performance establishes Advanced Scan intent');

const modal = readFileSync('src/ui/components/AdvancedScanModal.tsx', 'utf8');
assert(modal.includes("prefixSource: 'EDITED'") && modal.includes("row.prefixSource === 'EDITED'"), 'technician-edited or cleared prefix is never overwritten by later assistance');
assert(modal.includes("prefixSource === 'SUGGESTED'") && modal.includes("prefix: ''"), 'ambiguous adapter selection clears only an untouched suggestion');
assert(modal.includes("advancedIntent ? 'Start Advanced Scan' : 'Start Quick Scan'"), 'button label follows configured intent rather than current plan validity');
assert(modal.includes('disabled={busy || incompleteTarget || plan?.valid === false}'), 'incomplete or invalid Advanced Scan remains disabled');

const planner = new AdvancedScanPlanner();
for (const [start, end, count] of [
  ['192.168.145.45', '192.168.145.55', 11],
  ['192.168.145.45', '192.168.145.45', 1],
  ['192.168.145.9', '192.168.145.10', 2],
  ['192.168.145.99', '192.168.145.100', 2],
  ['10.0.0.250', '10.0.1.5', 12],
] as const) {
  const rangeRequest = emptyAdvancedScanRequest();
  rangeRequest.targets = [{ type: 'RANGE', start, end }];
  assert(planner.plan(rangeRequest, []).estimatedTargetCount === count, `${start} through ${end} remains ${count} addresses`);
}
const differentSubnet = emptyAdvancedScanRequest();
differentSubnet.adapterIndexes = [10];
differentSubnet.targets = [{ type: 'CIDR', cidr: '10.1.10.0/24' }];
const differentPlan = planner.plan(differentSubnet, adapters);
assert(differentPlan.valid && differentPlan.routeSummary.every(route => route.classification === 'NO_KNOWN_ROUTE'), 'CIDR may deliberately target another subnet without weakening route warnings');

console.log(`\nAdvanced Scan UI intent summary: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
