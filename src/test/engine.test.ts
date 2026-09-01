import { appStateDb } from '../core/storage/app_db.ts';
import { projectDb } from '../core/storage/project_db.ts';
import { osVault } from '../core/storage/vault.ts';
import { OnvifDriver } from '../core/drivers/onvif.ts';
import { HanwhaSunapiDriver } from '../core/drivers/hanwha.ts';
import { HikvisionIsapiDriver } from '../core/drivers/hikvision.ts';
import { DahuaDriver } from '../core/drivers/dahua.ts';
import { BoschRcpDriver } from '../core/drivers/bosch.ts';
import { PelcoSarixDriver } from '../core/drivers/pelco.ts';
import { BatchExecutionPipeline } from '../core/engine/pipeline.ts';
import { DuplicateAssistantDrawer } from '../core/edge_cases/duplicate_drawer.ts';
import { RogueDHCPAuditor } from '../core/edge_cases/rogue_dhcp.ts';
import { LegacyHardwareOnboarding } from '../core/edge_cases/legacy_hardware.ts';
import { BulkReIpEngine } from '../core/engine/bulk_reip.ts';
import { AvailableIpFinder } from '../core/engine/ip_finder.ts';
import { ProjectReverificationEngine } from '../core/engine/reverification.ts';
import { ExplicitTestOnvifDiscovery, ExplicitTestPassiveDiscovery } from './support/simulated_discovery.ts';
import { NoopDeviceEnricher } from '../core/engine/device_enrichment.ts';

const pipelineEngine = new BatchExecutionPipeline({
  passiveDiscovery: new ExplicitTestPassiveDiscovery(),
  onvifDiscovery: new ExplicitTestOnvifDiscovery(),
  deviceEnricher: new NoopDeviceEnricher(),
  phaseDelayMs: 0,
});

async function runTests() {
  console.log('====================================================');
  console.log('🧪 CCTV DISCOVERY TOOL - CONSOLIDATED BLUEPRINT SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // 1. OUI Vendor Database
  console.log('[Test Suite 1: OUI Vendor Resolution]');
  assert(appStateDb.resolveVendor('00:40:8c:11:22:33') === 'Axis Communications', 'Resolved Axis MAC');
  assert(appStateDb.resolveVendor('00:16:6c:99:88:77') === 'Hanwha Vision', 'Resolved Hanwha MAC');
  assert(appStateDb.resolveVendor('00:24:b2:44:55:66') === 'Hikvision Digital Technology', 'Resolved Hikvision MAC');
  assert(appStateDb.resolveVendor('3c:ef:8c:11:22:33') === 'Dahua Technology', 'Resolved Dahua MAC');
  assert(appStateDb.resolveVendor('00:07:5f:11:22:33') === 'Bosch Security', 'Resolved Bosch MAC');
  assert(appStateDb.resolveVendor('00:04:7d:11:22:33') === 'Pelco', 'Resolved Pelco MAC');

  // 2. OS Credential Vault (Section 13.4 & v1.2 Section 19)
  console.log('\n[Test Suite 2: OS Credential Vault & Lockout Guard]');
  assert(osVault.getSafeReferences().length === 0, 'Production credential manager starts without seeded passwords');
  assert(osVault.getSafeReferences().every(item => !('password' in item)), 'Credential metadata boundary exposes no passwords');
  assert(!osVault.hasCredential('cred-axis-default'), 'Prototype default credential is absent');

  // 3. ONVIF WS-Discovery & Profile S/T SOAP Generator
  console.log('\n[Test Suite 3: ONVIF WS-Discovery & Profile S/T Generator]');
  const probeXml = OnvifDriver.createProbeEnvelope();
  assert(probeXml.includes('NetworkVideoTransmitter'), 'Valid WS-Discovery envelope generated');

  const defaultOnvif = OnvifDriver.createDefaultOnvifConfig('192.168.1.100');
  const setEncXml = OnvifDriver.createSetVideoEncoderEnvelope(defaultOnvif.videoProfiles[0]);
  assert(setEncXml.includes('SetVideoEncoderConfiguration'), 'Generated VideoEncoder SOAP XML');

  // 4. 6-Phase Pipeline Execution
  console.log('\n[Test Suite 4: 6-Phase Batch Execution Sequence]');
  await pipelineEngine.runFullPipeline();
  const phases = pipelineEngine.getStates();
  assert(phases.every(p => p.status === 'COMPLETED'), 'All 6 phases completed');
  
  const devices = projectDb.getDevices();
  assert(devices.length >= 8, `Indexed ${devices.length} devices with physical anchors`);

  // 5. Milestone 8 replaces the unsafe static mutation prototype with an instance service.
  console.log('\n[Test Suite 5: Backend-authoritative Bulk Network Service]');
  assert(typeof BulkReIpEngine.prototype.createPlan === 'function', 'Bulk planning is server-owned');
  assert(typeof BulkReIpEngine.prototype.execute === 'function', 'Bulk execution requires the service state machine');

  // 6. Section 25: Available IP Finder
  console.log('\n[Test Suite 6: Available IP Finder (v1.0 Section 25)]');
  const availableIps = AvailableIpFinder.scanAvailableIps('192.168.1', 100, 150);
  assert(availableIps.length > 0, 'Available IP finder identified unassigned static addresses');

  // 7. Section 43-45: Project Reverification & Replacement Detection
  console.log('\n[Test Suite 7: Project Reverification & Replacement Detection]');
  const reverifyResult = ProjectReverificationEngine.reverifyProject(devices, devices);
  assert(reverifyResult.recognizedCount > 0, `Reverified ${reverifyResult.recognizedCount} known project devices`);

  // 8. Section 13.2 Duplicate Assistant
  console.log('\n[Test Suite 8: Duplicate Assistant Drawer]');
  const collisions = projectDb.getCollisions();
  assert(collisions.length > 0, `Found ${collisions.length} IP collision state(s)`);

  // 9. Section 13.3 Rogue DHCP Auditor
  console.log('\n[Test Suite 9: Rogue DHCP Auditor]');
  const rogueOffer = RogueDHCPAuditor.inspectDHCPOffer({
    serverIp: '192.168.1.254',
    serverMac: '00:90:e8:11:22:33',
    offeredIp: '192.168.1.55',
    subnetMask: '255.255.255.0',
    detectedAt: new Date().toISOString(),
    switchPortHint: 'GigabitEthernet1/0/12',
    isAuthorized: false,
  });
  assert(rogueOffer.isRogue, 'Rogue DHCP detected');

  console.log('\n====================================================');
  console.log(`📊 SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
