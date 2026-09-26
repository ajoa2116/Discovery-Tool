import { readFileSync } from 'node:fs';
import { ReportService, formatReportTimestamp } from '../core/reporting/report_service.ts';
import { saveProjectDownload } from '../ui/project_download.ts';
import { Device, SiteProject } from '../types/index.ts';

let passed = 0, failed = 0;
const assert = (value: unknown, name: string) => { if (value) { console.log(`  PASS: ${name}`); passed++; } else { console.error(`  FAIL: ${name}`); failed++; } };

const device = (index: number): Device => ({
  id: `device-${index}`, anchor: { macAddress: `00:40:8c:00:00:${index.toString(16).padStart(2, '0')}`, onvifEndpointUuid: `uuid-${index}`, serialNumber: `SERIAL-${index}`, model: 'Field Camera', vendor: 'Axis' },
  network: { ipAddress: `192.168.50.${index + 10}`, ipAddressHistory: [`192.168.50.${index + 10}`], subnetMask: '255.255.255.0', gateway: '192.168.50.1', port: 80, protocol: 'ONVIF' },
  status: 'ONLINE', discoveredPhase: 3, firstSeenAt: '2026-09-01T12:00:00Z', lastSeenAt: '2026-09-01T12:00:00Z', sessionVerification: 'VERIFIED', technician: { name: `Camera ${index}`, location: 'Lobby', notes: 'Verified note' }, configuredState: { inferred: true, manualOverride: false, updatedAt: '2026-09-01T12:00:00Z' },
});
const project = (devices: Device[]): SiteProject => ({ id: 'field', name: 'Field Test', description: '', siteLocation: 'Fort Myers', technicianName: 'Technician', createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z', totalDevices: devices.length, devices, collisions: [], rogueDhcpEvents: [], auditLogs: [] });

async function run() {
  const settings = readFileSync('src/ui/components/SettingsMenu.tsx', 'utf8');
  const manual = readFileSync('src/ui/components/LegacyOnboardModal.tsx', 'utf8');
  assert(settings.includes('!flex h-11') && settings.includes('ChevronRight') && settings.includes('flex-1 truncate'), 'Settings uses compact single-row navigation with aligned chevrons');
  assert(settings.includes('Back to Settings') && settings.includes("['LIGHT','DARK','SYSTEM']"), 'Appearance uses replace-in-place navigation and preserves themes');
  assert(settings.includes('Environment status') && settings.includes('Download Safe Support Bundle'), 'Diagnostics and safe support access remain available');
  assert(settings.includes('Version:') && settings.includes('Runtime:') && settings.includes('Environment status:'), 'About presents readable labeled information');
  assert(!/00:40:8C:55:66:77|AXIS 2100|Force MAC-Level|RTSP Stream Port|HTTP Port/.test(manual) && manual.includes('Unknown and Not Verified'), 'Manual Add safety correction remains intact');

  let fetches = 0, downloads: string[] = [];
  const savedAs = await saveProjectDownload({ saveAs: true, currentFilename: 'test_1.cctvproj', suggestedFilename: 'test_1.cctvproj', chooseFilename: () => 'field_test_copy', fetchContent: async () => { fetches++; return '{"safe":true}'; }, download: (_content, filename) => downloads.push(filename) });
  assert(savedAs === 'field_test_copy.cctvproj' && fetches === 1 && downloads.join() === savedAs, 'Save As performs exactly one serialization and intended download');
  downloads = []; fetches = 0;
  const subsequent = await saveProjectDownload({ saveAs: false, currentFilename: savedAs!, suggestedFilename: 'stale_name.cctvproj', chooseFilename: () => { throw Error('Save must not prompt'); }, fetchContent: async () => { fetches++; return '{}'; }, download: (_content, filename) => downloads.push(filename) });
  assert(subsequent === savedAs && downloads.join() === savedAs && fetches === 1, 'subsequent Save uses the active Save As filename');
  fetches = 0; downloads = [];
  const cancelled = await saveProjectDownload({ saveAs: true, currentFilename: 'test_1.cctvproj', suggestedFilename: 'test_1.cctvproj', chooseFilename: () => null, fetchContent: async () => { fetches++; return '{}'; }, download: (_content, filename) => downloads.push(filename) });
  assert(cancelled === null && fetches === 0 && downloads.length === 0, 'cancelled Save As has no serialization or stale download side effect');

  const service = new ReportService(), make = (count: number) => service.build({ mode: 'QUICK_WORK', project: project(Array.from({ length: count }, (_, i) => device(i + 1))), dirty: false }, [], { type: 'DEVICE_INVENTORY', scope: 'ALL', columns: ['NAME','IP','STATUS'], title: 'Device Inventory Report', generatedAt: '2026-09-02T00:21:15.508Z' });
  const zero = service.pdf(make(0)).toString('ascii'), ten = service.pdf(make(10)).toString('ascii'), fifty = service.pdf(make(50)).toString('ascii');
  assert(zero.includes('Devices: 0') && zero.includes('No devices are included in the selected report scope.'), 'zero-device PDF contains explicit count and field message');
  assert(/September|August|October/.test(formatReportTimestamp('2026-09-02T00:21:15.508Z')) && !formatReportTimestamp('2026-09-02T00:21:15.508Z').includes('T00:21'), 'report timestamp is local and human readable');
  assert(ten.includes('Camera Name') && ten.includes('IP') && ten.includes('Status') && ten.includes(' re ') && !ten.includes('Camera Name | Status'), '10-device PDF uses selected columns and drawing-based table layout');
  assert((fifty.match(/\/Type \/Page\b/g) || []).length === 3 && (fifty.match(/Camera Name/g) || []).length === 3, '50-device PDF paginates with repeated headers');
  assert(fifty.includes('Page 2 of 3') && fifty.includes('CCTV Network Assistant - Field Test'), 'multi-page PDF includes technician footer and page numbering');
  assert(!/(password|authorization|credential|token|cookie|secret)/i.test(zero + ten + fifty), 'generated PDFs contain no secret-like material');

  console.log(`\nField validation corrections summary: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
run().catch(error => { console.error(error); process.exit(1); });
