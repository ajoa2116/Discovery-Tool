import { appStateDb } from '../core/storage/app_db.ts';
import { projectDb } from '../core/storage/project_db.ts';
import { osVault } from '../core/storage/vault.ts';
import { OnvifDriver } from '../core/drivers/onvif.ts';
import { pipelineEngine } from '../core/engine/pipeline.ts';
import { DuplicateAssistantDrawer } from '../core/edge_cases/duplicate_drawer.ts';
import { RogueDHCPAuditor } from '../core/edge_cases/rogue_dhcp.ts';
import { LegacyHardwareOnboarding } from '../core/edge_cases/legacy_hardware.ts';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 CCTV DISCOVERY TOOL v1.6 - CORE TEST SUITE');
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
  const axisVendor = appStateDb.resolveVendor('00:40:8c:11:22:33');
  assert(axisVendor === 'Axis Communications', `Resolved Axis MAC prefix correctly (got: ${axisVendor})`);

  const illustraVendor = appStateDb.resolveVendor('00:1a:e8:99:88:77');
  assert(illustraVendor === 'Illustra / Tyco', `Resolved Illustra MAC prefix correctly (got: ${illustraVendor})`);

  const lenelVendor = appStateDb.resolveVendor('00:02:b3:44:55:66');
  assert(lenelVendor === 'Lenel Access Control', `Resolved Lenel MAC prefix correctly (got: ${lenelVendor})`);

  // 2. OS Credential Vault (Section 13.4)
  console.log('\n[Test Suite 2: OS Credential Vault & Lockout Guard (Section 13.4)]');
  const axisCred = osVault.getCredential('cred-axis-default');
  assert(axisCred !== undefined && axisCred.username === 'root', 'Loaded Axis master credential from OS vault');

  // Trigger lockout
  osVault.reportAuthFailure('cred-axis-default');
  osVault.reportAuthFailure('cred-axis-default');
  osVault.reportAuthFailure('cred-axis-default');
  const lockoutState = osVault.checkLockoutStatus('cred-axis-default');
  assert(lockoutState.isLocked && lockoutState.waitSeconds > 0, `Lockout backoff triggered on repeated failures (${lockoutState.waitSeconds}s remaining)`);

  osVault.flushTokens();
  const flushedState = osVault.checkLockoutStatus('cred-axis-default');
  assert(!flushedState.isLocked, 'Flush tokens successfully restored vault state');

  // 3. ONVIF WS-Discovery Probe Envelope
  console.log('\n[Test Suite 3: ONVIF WS-Discovery SOAP Generator]');
  const probeXml = OnvifDriver.createProbeEnvelope();
  assert(probeXml.includes('NetworkVideoTransmitter') && probeXml.includes('http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe'), 'Generated valid WS-Discovery SOAP envelope');

  // 4. 6-Phase Pipeline Execution
  console.log('\n[Test Suite 4: 6-Phase Batch Execution Sequence (Section 4)]');
  await pipelineEngine.runFullPipeline();
  const phases = pipelineEngine.getStates();
  assert(phases.every(p => p.status === 'COMPLETED'), 'All 6 execution phases ran and completed successfully');
  
  const devices = projectDb.getDevices();
  assert(devices.length >= 7, `Discovered and indexed ${devices.length} physical hardware anchors`);

  // 5. Section 13.2 Duplicate Assistant Drawer
  console.log('\n[Test Suite 5: Duplicate IP Collision Resolver (Section 13.2)]');
  const collisions = projectDb.getCollisions();
  assert(collisions.length > 0, `Detected ${collisions.length} IP collision state(s) in Phase 4 reconciliation`);

  const activeCollision = collisions[0];
  const resolutionResult = DuplicateAssistantDrawer.resolveCollision(activeCollision.ipAddress, [
    {
      macAddress: activeCollision.collidingDevices[0].anchor.macAddress,
      newIp: '192.168.1.105',
      newSubnet: '255.255.255.0',
      newGateway: '192.168.1.1',
    },
    {
      macAddress: activeCollision.collidingDevices[1].anchor.macAddress,
      newIp: '192.168.1.205',
      newSubnet: '255.255.255.0',
      newGateway: '192.168.1.1',
    },
  ]);
  assert(resolutionResult.success, 'Duplicate Assistant successfully severed collision and reassigned static IPs');

  // 6. Section 13.3 Rogue DHCP Auditor
  console.log('\n[Test Suite 6: Rogue DHCP Auditor (Section 13.3)]');
  const rogueOffer = RogueDHCPAuditor.inspectDHCPOffer({
    serverIp: '192.168.1.254',
    serverMac: '00:90:e8:11:22:33',
    offeredIp: '192.168.1.55',
    subnetMask: '255.255.255.0',
    detectedAt: new Date().toISOString(),
    switchPortHint: 'GigabitEthernet1/0/12',
    isAuthorized: false,
  });
  assert(rogueOffer.isRogue, 'Rogue DHCP offer successfully flagged on camera network');

  // 7. Section 13.1 Legacy Hardware Manual Onboarding
  console.log('\n[Test Suite 7: Legacy Hardware Manual Onboarding (Section 13.1)]');
  const legacyDev = LegacyHardwareOnboarding.onboardLegacyDevice({
    macAddress: '00:40:8c:99:99:99',
    vendor: 'Axis Communications',
    model: 'AXIS 207 Network Camera (Legacy)',
    staticIp: '192.168.1.210',
    subnetMask: '255.255.255.0',
    gateway: '192.168.1.1',
    httpPort: 80,
    rtspPort: 554,
  });
  assert(legacyDev.anchor.macAddress === '00:40:8c:99:99:99' && legacyDev.network.ipAddress === '192.168.1.210', 'Legacy device manually bound to static IP and direct MAC anchor');

  console.log('\n====================================================');
  console.log(`📊 SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
