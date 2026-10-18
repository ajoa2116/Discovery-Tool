import { readFileSync } from 'node:fs';
import { allVisibleSelected, toggleVisibleSelection } from '../shared/device_selection.ts';

let passed = 0, failed = 0, sourcePassed = 0, sourceFailed = 0;
const assert = (value: unknown, label: string) => {
  if (value) { passed++; console.log('PASS: ' + label); }
  else { failed++; console.error('FAIL: ' + label); }
};
const sourceAssert = (value: unknown, label: string) => {
  if (value) { sourcePassed++; console.log('PASS (source-only): ' + label); }
  else { sourceFailed++; console.error('FAIL (source-only): ' + label); }
};
const ids = (values: ReadonlySet<string>) => JSON.stringify([...values].sort());
const cases: Array<{ label: string; selected: string[]; visible: string[]; all: boolean; next: string[] }> = [
  { label: 'equal counts with different IDs', selected: ['hidden'], visible: ['visible'], all: false, next: ['hidden', 'visible'] },
  { label: 'partial visible selection plus hidden', selected: ['hidden', 'a'], visible: ['a', 'b'], all: false, next: ['hidden', 'a', 'b'] },
  { label: 'all visible selected plus hidden', selected: ['hidden', 'a', 'b'], visible: ['a', 'b'], all: true, next: ['hidden'] },
  { label: 'only visible selected', selected: ['a', 'b'], visible: ['a', 'b'], all: true, next: [] },
  { label: 'empty results preserve hidden selection', selected: ['hidden'], visible: [], all: false, next: ['hidden'] },
  { label: 'both sets empty', selected: [], visible: [], all: false, next: [] },
  { label: 'nothing selected', selected: [], visible: ['a', 'b'], all: false, next: ['a', 'b'] },
  { label: 'one visible already selected', selected: ['a'], visible: ['a', 'b', 'c'], all: false, next: ['a', 'b', 'c'] },
  { label: 'disjoint selections of different sizes', selected: ['hidden-a', 'hidden-b'], visible: ['a'], all: false, next: ['hidden-a', 'hidden-b', 'a'] },
  { label: 'single displayed selection toggles off', selected: ['a'], visible: ['a'], all: true, next: [] },
];
for (const item of cases) {
  const selected = new Set(item.selected), visible = new Set(item.visible);
  const selectedBefore = ids(selected), visibleBefore = ids(visible);
  assert(allVisibleSelected(selected, visible) === item.all, item.label + ': checked state uses displayed ID membership');
  const result = toggleVisibleSelection(selected, visible);
  assert(ids(result) === ids(new Set(item.next)), item.label + ': exact selection transition');
  assert(ids(selected) === selectedBefore && ids(visible) === visibleBefore && result !== selected && result !== visible, item.label + ': neither input set is mutated or returned as writable output');
}
const devices = [{ id: 'camera-a', ip: '192.0.2.10' }, { id: 'camera-b', ip: '192.0.2.10' }];
const visibleIds = new Set(devices.map(device => device.id)), selected = new Set(['hidden', 'camera-a']);
const reversedIds = new Set([...devices].reverse().map(device => device.id));
assert(ids(toggleVisibleSelection(selected, visibleIds)) === ids(toggleVisibleSelection(selected, reversedIds)), 'sorting does not alter selection membership');
const refreshedIds = new Set(devices.map(device => ({ ...device, ip: '192.0.2.20' })).map(device => device.id));
assert(ids(toggleVisibleSelection(selected, refreshedIds)) === ids(new Set(['hidden', 'camera-a', 'camera-b'])), 'refreshed objects and changed addresses preserve stable-ID selection');
assert(!allVisibleSelected(new Set(['camera-a']), visibleIds), 'same-IP cameras remain separate displayed selections');
assert(ids(toggleVisibleSelection(new Set(['camera-a']), visibleIds)) === ids(new Set(['camera-a', 'camera-b'])), 'selecting same-IP peers retains both stable IDs');
const first = toggleVisibleSelection(new Set(['hidden']), visibleIds), second = toggleVisibleSelection(first, visibleIds);
assert(ids(second) === ids(new Set(['hidden'])), 'visible selection round trip retains hidden selection');
const app = readFileSync('src/ui/App.tsx', 'utf8'), table = readFileSync('src/ui/components/MasterDeviceTable.tsx', 'utf8');
sourceAssert(app.includes('setSelectedDeviceIds(current => toggleVisibleSelection(current, new Set(filteredDevices.map(device => device.id))))'), 'App wires visible IDs through a functional selection update');
sourceAssert(table.includes('allVisibleSelected(selectedDeviceIds, new Set(devices.map(device => device.id)))'), 'header derives checked state using the same membership helper');
sourceAssert(app.includes('onDeselect={()=>setSelectedDeviceIds(new Set())}'), 'explicit global Deselect All still clears the full selection');
sourceAssert(app.includes('const selectedDevicesList = (project?.devices || []).filter((d) => selectedDeviceIds.has(d.id));'), 'downstream selected-device list still uses full stable-ID selection');
console.log(`Selection logic: ${passed} passed, ${failed} failed`);
console.log(`Selection source wiring: ${sourcePassed} passed, ${sourceFailed} failed`);
if (failed || sourceFailed) process.exitCode = 1;
