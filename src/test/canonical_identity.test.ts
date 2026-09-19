import { Device } from '../types/index.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { ProjectReverificationEngine, ProjectReverificationWorkflow } from '../core/engine/reverification.ts';
import { Phase4IdentityReconciliation } from '../core/engine/phase4_reconcile.ts';
import { mergeDiscoveredDevice } from '../core/drivers/ws_discovery_transport.ts';
import { AddToExistingProjectService } from '../core/storage/add_to_existing_project.ts';
import { OnvifDriver } from '../core/drivers/onvif.ts';

let passed=0,failed=0;
const check=(value:unknown,label:string)=>{if(value){passed++;console.log('PASS: '+label)}else{failed++;console.error('FAIL: '+label)}};
const a='00:50:f9:63:fb:0f', b='e4:30:22:cd:68:85';
const camera=(id:string,mac:string|null,uuid?:string,ip='192.168.1.100',serial?:string):Device=>({id,anchor:{macAddress:mac,onvifEndpointUuid:uuid,serialNumber:serial,vendor:'Same manufacturer',model:'Same model'},network:{ipAddress:ip,subnetMask:null,port:80,protocol:'ONVIF'},technician:{name:'Same name',notes:'Keep notes',location:'Lobby'},status:'ONLINE',discoveredPhase:3,firstSeenAt:'now',lastSeenAt:'now'});
const dbFor=(devices:Device[])=>{const db=new SiteProjectDatabase();db.createNewProject('Identity');devices.forEach(d=>db.upsertDevice(structuredClone(d)));return db};
async function run(){
 const db=dbFor([camera('A',a,'uuid-a','192.168.1.168'),camera('B',b,'uuid-b')]);
 db.upsertDevice(camera('incoming',a,'uuid-a'));
 check(db.getDevices().length===2&&db.getDeviceById('A')?.network.ipAddressHistory?.includes('192.168.1.168')&&db.getDeviceById('B')?.anchor.macAddress===b,'T03 occupied-IP move retains both identities/history');
 await Phase4IdentityReconciliation.execute(db);
 check(db.getDevices().length===2&&db.getCollisions().length===1&&db.getCollisions()[0].deviceIds?.length===2,'T01 exactly two identities and one collision');
 check(db.getDevices().every(d=>d.technician?.name==='Same name'&&d.anchor.model==='Same model')&&db.getDevices().length===2,'T02 identical descriptive metadata does not merge');
 for(const reverse of [false,true]){
  const rows=[camera('A',a,'uuid-a',undefined,'shared'),camera('B',b,'uuid-b',undefined,'shared')];if(reverse)rows.reverse();
  const d=dbFor(rows);d.upsertDevice(camera('weak',null,undefined,'192.168.1.200','shared'));
  check(d.getDeviceById('A')?.network.ipAddress==='192.168.1.100'&&d.getDeviceById('B')?.network.ipAddress==='192.168.1.100'&&d.getDevices().length===3,'T04 ambiguous serial leaves both records intact order='+reverse);
  const transport=structuredClone(rows);mergeDiscoveredDevice(transport,camera('weak',null,undefined,'192.168.1.200','shared'));
  check(transport.length===3&&transport.filter(d=>d.network.ipAddress==='192.168.1.100').length===2,'T04 transport ambiguity order='+reverse);
 }
 const conflict=dbFor([camera('A',a,'uuid-a',undefined,'shared')]);conflict.upsertDevice(camera('other',b,'uuid-a',undefined,'shared'));
 check(conflict.getDevices().length===2,'conflicting MAC with shared UUID/serial stays separate');
 const uuidConflict=dbFor([camera('A',a,'uuid-a')]);uuidConflict.upsertDevice(camera('other',a,'uuid-b'));
 check(uuidConflict.getDevices().length===2,'conflicting UUID stays separate even with equal MAC');
 for(const value of ['uuid-a',a]){
  const result=ProjectReverificationEngine.plan([camera('saved',a,'uuid-a')],[camera('incoming',null,undefined,undefined,value)]);
  check(result.recognizedCount===0&&result.newDevicesCount===1,'typed serial cannot match '+value);
 }
 for(const mac of ['00:50:F9:63:FB:0F','00-50-F9-63-FB-0F','0050F963FB0F']){
  const d=dbFor([camera('saved',a,'uuid-a')]);d.upsertDevice(camera('new',mac,'uuid-a'));
  check(d.getDevices().length===1&&d.getDeviceById('saved')?.anchor.macAddress===a,'T07 storage '+mac);
  const bundle=JSON.parse(d.exportProjectJson());bundle.project.devices=[camera('saved',mac,'uuid-a')];const loaded=new SiteProjectDatabase();loaded.importProjectJson(JSON.stringify(bundle));
  check(loaded.getDeviceById('saved')?.anchor.macAddress===a,'T07 import '+mac);
  const plan=ProjectReverificationEngine.plan([camera('saved',a,'uuid-a')],[camera('live',mac,'uuid-a')]);
  check(plan.recognizedCount===1&&plan.projectDevices[0].anchor.macAddress===a,'T07 Reverify '+mac);
  const service=new AddToExistingProjectService(),preview=service.preview(d.exportProjectJson(),[camera('live',mac,'uuid-a','192.168.1.101')]);
  check(preview.items[0].outcome==='WILL_UPDATE_EVIDENCE','T07 Add to Project '+mac);
  const transport=[camera('saved',a,'uuid-a')];mergeDiscoveredDevice(transport,camera('live',mac,'uuid-a'));
  check(transport.length===1&&transport[0].id==='saved'&&transport[0].anchor.macAddress===a,'T07 transport '+mac);
 }
 const saved=camera('original',a,'uuid-a',undefined,'serial-a'),partial=camera('live',null,'uuid-a');partial.technician=undefined;
 const plan=ProjectReverificationEngine.plan([saved],[partial]);
 check(plan.projectDevices[0].anchor.macAddress===a&&plan.projectDevices[0].anchor.serialNumber==='serial-a','T08 null rediscovery preserves stronger anchors');
 check(plan.projectDevices[0].id==='original'&&plan.projectDevices[0].technician?.notes==='Keep notes','Reverify preserves ID and technician metadata');
 const transport=[camera('original',null,'uuid-a')];mergeDiscoveredDevice(transport,camera('new',a,'uuid-a'));
 check(transport.length===1&&transport[0].id==='original','transport strengthening preserves original ID');
 const strong=dbFor([camera('original',null,'uuid-a')]);strong.upsertDevice(camera('new',a,'uuid-a'));
 check(strong.getDevices().length===1&&strong.getDeviceById('original')?.anchor.macAddress===a,'database strengthening preserves original ID');
 const metadata=dbFor([saved]);const renamed=camera('incoming',a,'uuid-a');renamed.technician={name:'Discovery name',notes:''};metadata.upsertDevice(renamed);
 check(metadata.getDeviceById('original')?.technician?.notes==='Keep notes'&&metadata.getDeviceById('original')?.technician?.name==='Same name','discovery cannot overwrite technician metadata');
 const serialConflict=dbFor([camera('a',a,undefined,undefined,'serial')]);serialConflict.upsertDevice(camera('b',b,undefined,undefined,'serial'));
 check(serialConflict.getDevices().length===2,'same serial with conflicting MACs and no UUID stays separate');
 serialConflict.upsertDevice(camera('incoming-a',a,undefined,'192.168.1.101','serial'));
 check(serialConflict.getDevices().length===2&&serialConflict.getDeviceById('a')?.network.ipAddress==='192.168.1.101','established MAC disambiguates reused serial on rediscovery');
 for(const reverse of [false,true]){
  const rows=[camera('a',a,'uuid-a',undefined,'shared'),camera('b',b,'uuid-b',undefined,'shared')];if(reverse)rows.reverse();
  const weak=camera('weak',null,undefined,undefined,'shared');
  const result=ProjectReverificationEngine.plan(rows,[weak]);
  check(result.recognizedCount===0&&result.newDevicesCount===1,'Reverify cannot bind one weak identity to multiple saved rows order='+reverse);
  const source=dbFor(rows),service=new AddToExistingProjectService();
  check(service.preview(source.exportProjectJson(),[weak]).items[0].outcome==='NEEDS_ATTENTION','Add to Project exposes ambiguity order='+reverse);
 }
 const uuidOnly=dbFor([camera('original',null,'uuid-only')]);uuidOnly.upsertDevice(camera('new',null,'uuid-only','192.168.1.101'));
 check(uuidOnly.getDevices().length===1&&uuidOnly.getDeviceById('original')?.network.ipAddress==='192.168.1.101','UUID-only discovery retains stable ID');
 const replacementDb=dbFor([camera('saved',null,'old-uuid')]);
 const workflow=new ProjectReverificationWorkflow(replacementDb,async staging=>{staging.upsertDevice(camera('replacement',null,'new-uuid'));return 'COMPLETED'});
 const replacementPlan=await workflow.run();let replacementConfirmed=false;
 try{replacementConfirmed=workflow.decide(replacementPlan.possibleReplacements[0].candidateId!,'CONFIRMED').device?.anchor.onvifEndpointUuid==='new-uuid'}catch{}
 check(replacementConfirmed,'explicit UUID-only replacement review remains functional');
 for(const mac of ['00:50:F9:63:FB:0F','00-50-F9-63-FB-0F','0050F963FB0F']){
  const xml=`<Envelope><ProbeMatch><EndpointReference><Address>urn:uuid:11111111-2222-3333-4444-555555555555</Address></EndpointReference><XAddrs>http://192.168.1.100/onvif/device_service</XAddrs><Scopes>onvif://www.onvif.org/MAC/${mac}</Scopes></ProbeMatch></Envelope>`;
  check(OnvifDriver.parseProbeMatch(xml,'192.168.1.100')?.anchor?.macAddress===a,'discovery canonicalizes '+mac);
 }
 for(const mac of ['00:00:00:00:00:00','ff:ff:ff:ff:ff:ff','01:00:5e:00:00:01','bad']){
  const d=dbFor([camera('invalid',mac,'uuid-a')]);check(d.getDevices()[0].anchor.macAddress===null,'invalid storage anchor '+mac);
  const xml=`<Envelope><ProbeMatch><EndpointReference><Address>urn:uuid:11111111-2222-3333-4444-555555555555</Address></EndpointReference><XAddrs>http://192.168.1.100/onvif/device_service</XAddrs><Scopes>onvif://www.onvif.org/MAC/${mac}</Scopes></ProbeMatch></Envelope>`;
  check(OnvifDriver.parseProbeMatch(xml,'192.168.1.100')?.anchor?.macAddress===null,'invalid discovery anchor '+mac);
 }
 console.log(`Canonical identity: ${passed} passed, ${failed} failed, 0 skipped`);if(failed)process.exitCode=1;
}
run().catch(error=>{console.error(error);process.exitCode=1});
