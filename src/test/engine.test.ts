import { appStateDb } from '../core/storage/app_db.ts';
import { projectDb } from '../core/storage/project_db.ts';
import { osVault } from '../core/storage/vault.ts';
import { OnvifDriver } from '../core/drivers/onvif.ts';
import { HanwhaSunapiDriver } from '../core/drivers/hanwha.ts';
import { HikvisionIsapiDriver } from '../core/drivers/hikvision.ts';
import { DahuaDriver } from '../core/drivers/dahua.ts';
import { BoschRcpDriver } from '../core/drivers/bosch.ts';
import { PelcoSarixDriver } from '../core/drivers/pelco.ts';
import { pipelineEngine } from '../core/engine/pipeline.ts';
import { DuplicateAssistantDrawer } from '../core/edge_cases/duplicate_drawer.ts';
import { RogueDHCPAuditor } from '../core/edge_cases/rogue_dhcp.ts';
import { LegacyHardwareOnboarding } from '../core/edge_cases/legacy_hardware.ts';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 CCTV DISCOVERY TOOL v1.6 - EXTENDED TEST SUITE');
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

  const hanwhaVendor = appStateDb.resolveVendor('00:16:6c:99:88:77');
  assert(hanwhaVendor === 'Hanwha Vision', `Resolved Hanwha MAC prefix correctly (got: ${hanwhaVendor})`);

  const hikVendor = appStateDb.resolveVendor('00:24:b2:44:55:66');
  assert(hikVendor === 'Hikvision Digital Technology', `Resolved Hikvision MAC prefix correctly (got: ${hikVendor})`);

  const dahuaVendor = appStateDb.resolveVendor('3c:ef:8c:11:22:33');
  assert(dahuaVendor === 'Dahua Technology', `Resolved Dahua MAC prefix correctly (got: ${dahuaVendor})`);

  const boschVendor = appStateDb.resolveVendor('00:07:5f:11:22:33');
  assert(boschVendor === 'Bosch Security', `Resolved Bosch MAC prefix correctly (got: ${boschVendor})`);

  const pelcoVendor = appStateDb.resolveVendor('00:04:7d:11:22:33');
  assert(pelcoVendor === 'Pelco', `Resolved Pelco MAC prefix correctly (got: ${pelcoVendor})`);

  // 2. OS Credential Vault (Section 13.4)
  console.log('\n[Test Suite 2: OS Credential Vault & Lockout Guard (Section 13.4)]');
  const axisCred = osVault.getCredential('cred-axis-default');
  assert(axisCred !== undefined && axisCred.username === 'root', 'Loaded Axis master credential from OS vault');

  osVault.reportAuthFailure('cred-axis-default');
  osVault.reportAuthFailure('cred-axis-default');
  osVault.reportAuthFailure('cred-axis-default');
  const lockoutState = osVault.checkLockoutStatus('cred-axis-default');
  assert(lockoutState.isLocked && lockoutState.waitSeconds > 0, `Lockout backoff triggered on repeated failures (${lockoutState.waitSeconds}s remaining)`);

  osVault.flushTokens();
  const flushedState = osVault.checkLockoutStatus('cred-axis-default');
  assert(!flushedState.isLocked, 'Flush tokens successfully restored vault state');

  // 3. ONVIF WS-Discovery & Profile S/T SOAP Generator
  console.log('\n[Test Suite 3: ONVIF WS-Discovery & Profile S/T Generator]');
  const probeXml = OnvifDriver.createProbeEnvelope();
  assert(probeXml.includes('NetworkVideoTransmitter') && probeXml.includes('Probe'), 'Generated valid WS-Discovery SOAP envelope');

  const defaultOnvif = OnvifDriver.createDefaultOnvifConfig('192.168.1.100');
  const setEncXml = OnvifDriver.createSetVideoEncoderEnvelope(defaultOnvif.videoProfiles[0]);
  assert(setEncXml.includes('SetVideoEncoderConfiguration') && setEncXml.includes('H.265'), 'Generated SetVideoEncoderConfiguration SOAP XML');

  const ptzXml = OnvifDriver.createPtzContinuousMoveEnvelope(1, 0, 0);
  assert(ptzXml.includes('ContinuousMove') && ptzXml.includes('PanTilt'), 'Generated PTZ ContinuousMove SOAP XML');

  // 4. Manufacturer Drivers (Hanwha, Hikvision, Dahua, Bosch, Pelco)
  console.log('\n[Test Suite 4: Manufacturer Protocol Drivers (Sections 5-11)]');
  const hanwhaDev = await HanwhaSunapiDriver.querySunapiDevice('192.168.1.140');
  assert(hanwhaDev.manufacturerParams?.driverName === 'Hanwha SUNAPI 2.5', 'Hanwha SUNAPI driver decoded Wisenet parameters');

  const hikDev = await HikvisionIsapiDriver.queryIsapiDevice('192.168.1.165');
  assert(hikDev.manufacturerParams?.driverName === 'Hikvision ISAPI v2.6', 'Hikvision ISAPI driver decoded AcuSense & DarkFighter parameters');

  const dahuaDev = await DahuaDriver.queryDahuaDevice('192.168.1.180');
  assert(dahuaDev.manufacturerParams?.driverName === 'Dahua DHIP / ConfigManager CGI', 'Dahua driver decoded WizMind parameters');

  const boschDev = await BoschRcpDriver.queryBoschDevice('192.168.1.190');
  assert(boschDev.manufacturerParams?.driverName === 'Bosch RCP+ v5.2', 'Bosch driver decoded RCP+ parameters');

  const pelcoDev = await PelcoSarixDriver.queryPelcoDevice('192.168.1.195');
  assert(pelcoDev.manufacturerParams?.driverName === 'Pelco Sarix VideoXpert REST Driver', 'Pelco driver decoded Sarix parameters');

  // 5. 6-Phase Pipeline Execution
  console.log('\n[Test Suite 5: 6-Phase Batch Execution Sequence (Section 4)]');
  await pipelineEngine.runFullPipeline();
  const phases = pipelineEngine.getStates();
  assert(phases.every(p => p.status === 'COMPLETED'), 'All 6 execution phases ran and completed successfully');
  
  const devices = projectDb.getDevices();
  assert(devices.length >= 8, `Discovered and indexed ${devices.length} physical hardware anchors`);

  // 6. Section 13.2 Duplicate Assistant Drawer
  console.log('\n[Test Suite 6: Duplicate IP Collision Resolver (Section 13.2)]');
  const collisions = projectDb.getCollisions();
  assert(collisions.length > 0, `Detected ${collisions.length} IP collision state(s) in Phase 4 reconciliation`);

  // 7. Section 13.3 Rogue DHCP Auditor
  console.log('\n[Test Suite 7: Rogue DHCP Auditor (Section 13.3)]');
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

  // 8. Section 13.1 Legacy Hardware Manual Onboarding
  console.log('\n[Test Suite 8: Legacy Hardware Manual Onboarding (Section 13.1)]');
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
  assert(legacyDev.anchor.macAddress === '00:40:8c:99:99:99', 'Legacy device manually bound to static IP and direct MAC anchor');

  console.log('\n====================================================');
  console.log(`📊 SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
