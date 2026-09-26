import { readFileSync } from 'node:fs';
import { positionFloatingMenu } from '../ui/components/FloatingDeviceActionsMenu.tsx';

let passed = 0;
let failed = 0;
function assert(value: unknown, name: string) {
  if (value) { console.log(`  PASS: ${name}`); passed++; }
  else { console.error(`  FAIL: ${name}`); failed++; }
}
const anchor = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

const normal = positionFloatingMenu(anchor(1200, 200, 1232, 232), 192, 250, 1366, 768);
assert(normal.top === 236 && !normal.opensUpward, 'normal row menu opens below its Actions button');
const bottom = positionFloatingMenu(anchor(1200, 700, 1232, 732), 192, 250, 1366, 768);
assert(bottom.opensUpward && bottom.top === 446, 'bottom-row menu opens upward');
const right = positionFloatingMenu(anchor(1340, 200, 1364, 232), 192, 250, 1366, 768);
assert(right.left + 192 <= 1358 && right.left >= 8, 'right-edge menu aligns inward within viewport bounds');
const left = positionFloatingMenu(anchor(0, 200, 24, 232), 192, 250, 1366, 768);
assert(left.left === 8, 'left-edge menu remains inside viewport bounds');

const overlay = readFileSync('src/ui/components/FloatingDeviceActionsMenu.tsx', 'utf8');
const table = readFileSync('src/ui/components/MasterDeviceTable.tsx', 'utf8');
assert(overlay.includes('createPortal') && overlay.includes('document.body'), 'Actions menu renders outside the clipping table container');
assert(overlay.includes("className=\"fixed") && !table.includes('absolute right-3 top-10'), 'overlay is fixed and no longer participates in table layout');
assert(table.includes('{ device: dev, anchor: event.currentTarget.getBoundingClientRect() }'), 'opening captures the exact stable device and button anchor');
assert(overlay.includes('callback(device); onClose();'), 'action selection uses the captured device and closes the menu');
assert(overlay.includes("event.key === 'Escape'") && overlay.includes("document.addEventListener('mousedown', outside)"), 'Escape and outside click close the menu');
assert(overlay.includes("window.addEventListener('resize', invalidate)") && overlay.includes("window.addEventListener('scroll', invalidate, true)"), 'resize and any relevant scroll close safely');
assert(overlay.includes("return () => {") && overlay.includes("removeEventListener('keydown', key)"), 'overlay listeners are cleaned up on unmount');
assert(overlay.includes('canOfferPair(pairTarget)') && ['Open', 'Details', 'Diagnose', 'Device Configuration'].every(label => overlay.includes(label)), 'Pair uses topology eligibility while existing action content remains available');
assert(!overlay.includes('Rename Device') && !overlay.includes('Edit Notes') && !overlay.includes('onRename') && !overlay.includes('onNotes'), 'redundant editing commands and menu-only callbacks are absent');
assert(table.includes('<tr') && table.includes('<FloatingDeviceActionsMenu'), 'device row remains rendered behind the independent overlay');

console.log(`\nActions overlay summary: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
