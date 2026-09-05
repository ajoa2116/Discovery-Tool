import { readFileSync } from 'node:fs';
import { LegacyConfigurationBoundary } from '../core/network/legacy_configuration_boundary.ts';
import { CameraConfigurationError, CameraConfigurationProvider, CameraConfigurationService } from '../core/network/camera_configuration_service.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { InMemoryCredentialStore, OSCredentialVault } from '../core/storage/vault.ts';
import { CameraCapability, CameraConfigurationOperation, CameraConfigurationProposal } from '../shared/camera_configuration.ts';
import { Device } from '../types/index.ts';

let passed=0,failed=0;const assert=(value:unknown,name:string)=>{if(value){console.log(`  PASS: ${name}`);passed++}else{console.error(`  FAIL: ${name}`);failed++}};
const device=(id='camera',ip='192.168.1.20',mac='00:11:22:33:44:55'):Device=>({id,anchor:{macAddress:mac,vendor:'Fixture',model:'Evidence Camera'},network:{ipAddress:ip,subnetMask:'255.255.255.0',port:80,protocol:'ONVIF',xAddr:`http://${ip}/onvif/device_service`},status:'ONLINE',discoveredPhase:3,firstSeenAt:'2026-01-01T00:00:00.000Z',lastSeenAt:'2026-01-01T00:00:00.000Z'});
class EvidenceProvider implements CameraConfigurationProvider{
  readonly kind='FIXTURE';seen='';constructor(private capabilities:CameraCapability[]=[{operation:'NTP',state:'SUPPORTED',detail:'Fixture response',editable:true}]){}
  async inspect(d:Device){this.seen=d.id;return{capabilities:this.capabilities,values:{deviceName:'Real Fixture Name',ntp:{fromDhcp:false,servers:['10.0.0.10']},timeZone:'UTC-05:00'}}}
  async apply(_d:Device,_c:{username:string;password:string},_o:CameraConfigurationOperation,_p:CameraConfigurationProposal){} async verify(){return true}
}
const rejects=async(fn:()=>Promise<unknown>|unknown,part:string)=>{try{await fn();return false}catch(error){return(error as Error).message.includes(part)}};

async function run(){
  const db=new SiteProjectDatabase();db.createNewProject('Truth');db.upsertDevice(device());db.exportProjectJsonForSave();const boundary=new LegacyConfigurationBoundary(db);
  const none=boundary.read('camera');assert(none.status==='NOT_VERIFIED'&&!('onvifConfig'in none)&&!('manufacturerParams'in none),'A no evidence returns Not Verified without generated camera state');
  const store=new InMemoryCredentialStore(),vault=new OSCredentialVault(store);const ref=await vault.saveCredential({label:'Fixture',username:'tech',password:'fixture-secret',deviceIdentity:'camera'});const provider=new EvidenceProvider(),service=new CameraConfigurationService(db,vault,provider);
  const snapshot=await service.inspect('camera',ref.id);assert(snapshot.values.deviceName==='Real Fixture Name'&&snapshot.values.ntp?.servers[0]==='10.0.0.10','B modern authenticated read returns exact fixture-backed values');
  const unsupportedProvider=new EvidenceProvider([{operation:'ONVIF_ENABLE',state:'UNSUPPORTED',detail:'Not supported',editable:false}]);const unsupported=await new CameraConfigurationService(db,vault,unsupportedProvider).inspect('camera',ref.id);assert(unsupported.capabilities[0].state==='UNSUPPORTED'&&!('onvifConfig'in unsupported),'C unsupported capability has no generated fallback');
  assert(await rejects(()=>service.inspect('camera',''),'saved credential'),'D missing credential reference requires authentication without defaults');
  db.getDeviceById('camera')!.status='UNREACHABLE';const unreachable=boundary.read('camera');assert(unreachable.status==='UNREACHABLE'&&!('values'in unreachable),'E unreachable legacy read returns no fabricated fields');db.getDeviceById('camera')!.status='ONLINE';
  db.upsertDevice(device('other','192.168.1.20','aa:bb:cc:dd:ee:ff'));const ambiguous=boundary.read('camera');assert(ambiguous.status==='NEEDS_ATTENTION'&&ambiguous.message.includes('Duplicate Assistant'),'F duplicated IP returns explicit ambiguous identity state');
  assert(await rejects(()=>service.inspect('camera',ref.id),'Duplicate IP'),'P modern configuration preserves Duplicate Assistant protection');
  db.removeDeviceFromProject('other');await service.inspect('camera',ref.id);assert(provider.seen==='camera','G authenticated configuration resolves the requested stable ID');
  const server=readFileSync('src/server/index.ts','utf8'),onvif=readFileSync('src/core/drivers/onvif.ts','utf8');assert(onvif.includes('createDefaultOnvifConfig')&&!server.includes('createDefaultOnvifConfig'),'H default helper remains internal and is never served as current state');
  const before=JSON.stringify(db.getDeviceById('camera'));assert(await rejects(()=>boundary.updateLocalMetadata('camera',{onvifConfig:{},manufacturerParams:{}}),'cannot change physical camera'),'I legacy write cannot locally simulate a camera write');assert(JSON.stringify(db.getDeviceById('camera'))===before,'I rejected legacy physical write leaves device unchanged');
  const updated=boundary.updateLocalMetadata('camera',{technician:{name:'Lobby',location:'North',notes:'Local only'}});assert(updated.technician?.name==='Lobby'&&updated.technician.notes==='Local only','J local technician Name/Location/Notes editing remains functional');
  const project=JSON.parse(db.exportProjectJson());assert(!project.project.devices[0].onvifConfig&&!JSON.stringify(project).includes('pool.ntp.org'),'K Project save contains no synthetic camera configuration');
  const report=readFileSync('src/core/reporting/report_service.ts','utf8');assert(!report.includes('createDefaultOnvifConfig')&&!report.includes('.onvifConfig'),'L reports do not consume fabricated legacy configuration');
  assert(server.includes("'/api/device/:identifier/configuration/capabilities'")&&server.includes("'/api/device/:identifier/configuration/preview'")&&server.includes("'/api/device/:identifier/configuration/apply'"),'M modern single-camera configuration routes remain authoritative');
  assert(server.includes("'/api/bulk/configuration/plan'")&&server.includes("'/api/bulk/configuration/:batchId/apply'"),'N bulk configuration routes remain unchanged');
  assert(!JSON.stringify(snapshot).includes('fixture-secret')&&!db.exportProjectJson().includes('fixture-secret'),'O credential secret does not cross API/Project boundaries');
  const app=readFileSync('src/ui/App.tsx','utf8'),network=readFileSync('src/ui/components/NetworkConfigModal.tsx','utf8'),panel=readFileSync('src/ui/components/DeviceConfigurationPanel.tsx','utf8'),pipeline=readFileSync('src/core/engine/pipeline.ts','utf8');assert(!app.includes('handleSaveDeviceConfig')&&panel.includes('/configuration/capabilities')&&panel.includes('Choose a saved credential first.')&&!panel.includes("setTimeZone(s.values.timeZone||'UTC')"),'UI uses authenticated reads, blank unknown values, and no fabricated-save handler');
  assert(pipeline.includes('runDiscoveryScan')&&server.includes("'/api/discovery/start'")&&server.includes("'/api/discovery/advanced/start'")&&server.includes('incrementalMonitor'),'Q Quick, Advanced, and monitoring discovery architecture is unaffected');
  const production=readFileSync('src/core/drivers/bosch.ts','utf8')+readFileSync('src/core/drivers/pelco.ts','utf8');assert(production.includes('BOSCH-DINION')&&production.includes('PELCO-SARIX')&&!server.includes('BoschRcpDriver')&&!server.includes('PelcoSarixDriver'),'Bosch/Pelco example query classes remain non-production-reachable');
  console.log(`\nTruthful configuration boundary summary: ${passed} passed, ${failed} failed`);if(failed)process.exit(1)
}run().catch(error=>{console.error(error);process.exit(1)});
