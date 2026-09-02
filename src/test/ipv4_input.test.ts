import { readFileSync } from 'node:fs';
import { AdvancedScanPlanner } from '../core/engine/advanced_scan.ts';
import { emptyAdvancedScanRequest } from '../shared/advanced_scan.ts';
import { acceptsOctet, canonicalIPv4, nextOctetForKey, parseIPv4Paste, shouldAdvanceOctet, splitIPv4 } from '../ui/components/IPv4Input.tsx';

let passed = 0;
let failed = 0;
function assert(value: unknown, name: string) {
  if (value) { console.log(`  PASS: ${name}`); passed++; }
  else { console.error(`  FAIL: ${name}`); failed++; }
}

assert(acceptsOctet('0') && acceptsOctet('255'), 'octets accept boundary values 0 and 255');
assert(!acceptsOctet('256') && !acceptsOctet('999') && !acceptsOctet('a'), 'octets reject values above 255 and non-numeric input');
assert(shouldAdvanceOctet('192') && shouldAdvanceOctet('26') && !shouldAdvanceOctet('25'), 'keyboard octet entry advances only when another digit cannot be valid');
assert(nextOctetForKey(1, '.', '168') === 2, 'period key navigates to the next octet');
assert(nextOctetForKey(2, 'Backspace', '') === 1 && nextOctetForKey(2, 'Backspace', '1') === 2, 'Backspace navigates backward only from an empty octet');

const pasted = parseIPv4Paste('192.168.145.45');
assert(pasted?.octets.join('|') === '192|168|145|45', 'complete IPv4 paste populates four octets');
const cidr = parseIPv4Paste('192.168.145.0/24');
assert(cidr?.octets.join('.') === '192.168.145.0' && cidr.prefix === '24', 'CIDR paste separates IPv4 octets and prefix');
assert(canonicalIPv4(['192', '168', '145', '045']) === '192.168.145.45', 'complete output is canonical IPv4');
assert(canonicalIPv4(['192', '168', '', '45']) === null, 'incomplete editing is retained without being treated as a complete address');

const assisted = splitIPv4('192.168.145.45');
const endAssistance = [assisted[0], assisted[1], assisted[2], ''] as const;
assert(endAssistance.join('.') === '192.168.145.' && canonicalIPv4([...endAssistance]) === null, 'End IP inherits only the Start IP prefix and never assumes the final octet');
assert(canonicalIPv4(['192', '168', '145', '45']) === '192.168.145.45' && canonicalIPv4(['192', '168', '145', '55']) === '192.168.145.55', 'range Start and End entry produce separate canonical addresses');

const request = emptyAdvancedScanRequest();
request.targets = [{ type: 'RANGE', start: '192.168.145.55', end: '192.168.145.45' }];
const plan = new AdvancedScanPlanner().plan(request, []);
assert(!plan.valid && plan.errors.some(error => error.includes('after')), 'authoritative planner retains canonical numeric range-order validation');
request.targets = [{ type: 'CIDR', cidr: '192.168.145.0/15' }];
assert(!new AdvancedScanPlanner().plan(request, []).valid, 'authoritative planner retains existing CIDR prefix policy');

const component = readFileSync('src/ui/components/IPv4Input.tsx', 'utf8');
const modal = readFileSync('src/ui/components/AdvancedScanModal.tsx', 'utf8');
assert(component.includes('onPaste={paste}') && component.includes("event.key") && component.includes("inputMode=\"numeric\""), 'reusable control wires paste, keyboard navigation, and numeric mobile input');
assert(modal.includes('assistFrom={row.first}') && modal.includes('incompleteTarget'), 'Advanced Scan uses Start-prefix assistance and blocks incomplete target submission without backend churn');

console.log(`\nIPv4 input summary: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
