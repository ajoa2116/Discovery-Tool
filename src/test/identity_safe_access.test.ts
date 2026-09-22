import { readFileSync } from 'node:fs';
import { Device, BrowserPreference } from '../types/index.ts';
import { ConnectService, BrowserLauncher, WindowsBrowserLauncher } from '../core/connect/connect_service.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { Phase4IdentityReconciliation } from '../core/engine/phase4_reconcile.ts';

let passed=0,failed=0;const check=(v:unknown,n:string)=>{if(v){passed++;console.log('PASS: '+n)}else{failed++;console.error('FAIL: '+n)}};
const now=()=>new Date().toISOString();
const camera=(id='A',ip='192.168.1.100'):Device=>({id,anchor:{macAddress:id==='A'?'00:50:f9:63:fb:0f':'e4:30:22:cd:68:85',onvifEndpointUuid:'uuid-'+id,vendor:'Fixture'},network:{ipAddress:ip,subnetMask:'255.255.255.0',port:80,protocol:'ONVIF'},status:'ONLINE',sessionVerification:'VERIFIED',firstSeenAt:now(),lastSeenAt:now(),discoveredPhase:3,reachability:{subnetClassification:'LOCAL',wsDiscoveryRespondedAt:now()}});
const setup=(devices=[camera()])=>{const db=new SiteProjectDatabase();db.createNewProject('Access');devices.forEach(d=>db.upsertDevice(d));db.exportProjectJsonForSave();const launches:Array<{url:string;preference:BrowserPreference}>=[];const launcher:BrowserLauncher={available:async()=>['SYSTEM','EDGE','CHROME','EMBEDDED'],launch:async(url,preference)=>{launches.push({url,preference});return{used:preference,fallback:false}}};return{db,launches,service:new ConnectService(db,launcher)}};
const decision=(s:ReturnType<typeof setup>,id='A')=>(s.service.resolve(id) as any).accessDecision;
const blocked=async(s:ReturnType<typeof setup>,id='A',mode:BrowserPreference='SYSTEM')=>{try{await s.service.open(id,mode);return false}catch(error){return Boolean((error as any).accessDecision?.allowed===false)}};
async function run(){
 const single=setup();check(decision(single)?.code==='SAFE_TO_OPEN','T01 unique established identity allowed');
 for(const mode of ['SYSTEM','EDGE','CHROME','EMBEDDED'] as const){await single.service.open('A',mode);check(single.launches.at(-1)?.preference===mode,'T02 approved preference '+mode);}
 const duplicate=setup([camera(),camera('B')]);await Phase4IdentityReconciliation.execute(duplicate.db);duplicate.db.exportProjectJsonForSave();const before=JSON.stringify(duplicate.db.getSession());
 check(decision(duplicate)?.code==='AMBIGUOUS_COLLISION','T03 shared address blocked');
 check(await blocked(duplicate,'A'),'T04 row A blocked');check(await blocked(duplicate,'B'),'T05 row B blocked');
 for(const mode of ['EDGE','CHROME','EMBEDDED'] as const)check(await blocked(duplicate,'A',mode),'T08/T19 mode cannot bypass '+mode);
 check(duplicate.launches.length===0,'T20 no browser launch on block');check(JSON.stringify(duplicate.db.getSession())===before,'T21-T23 blocked access changes no identity, history, or dirty state');
 check(!duplicate.service.resolve('A').readiness.canOpenManually,'no Open Anyway readiness');
 check(duplicate.service.resolve('A').readiness.warning?.includes('wrong')||duplicate.service.resolve('A').readiness.warning?.includes('cannot safely'),'clear explanation of physical ambiguity');
 const a=duplicate.db.getDeviceById('A')!;a.network.ipAddress='192.168.1.168';await Phase4IdentityReconciliation.execute(duplicate.db,[{name:'Ethernet',ipAddress:'192.168.1.205',netmask:'255.255.255.0',isInternal:false,broadcast:'',mac:''}]);
 check(decision(duplicate)?.allowed&&duplicate.db.getCollisions()[0].resolved,'T10/T24 resolved lifecycle restores access');
 await duplicate.service.open('A','SYSTEM');check(duplicate.launches.at(-1)?.url==='http://192.168.1.168','T25 final scan state routes selected current address');
 check(decision(duplicate,'B')?.allowed,'T11 historical record does not block remaining unique camera');
 duplicate.db.getDeviceById('A')!.network.ipAddress='192.168.1.100';await Phase4IdentityReconciliation.execute(duplicate.db);check(await blocked(duplicate),'T12 reopened collision blocks again');
 const stale=setup();stale.db.getDeviceById('A')!.sessionVerification='NOT_FOUND';check(decision(stale)?.code==='STALE_ADDRESS'&&await blocked(stale),'T13 unverified old address is not opened');
 const loaded=setup();loaded.db.importProjectJson(loaded.db.exportProjectJson());check(await blocked(loaded),'saved project addresses require current verification');
 const conflict=setup();conflict.db.getDeviceById('A')!.identityConflicts=[{detectedAt:now(),reason:'Conflicting known identity'}];check(await blocked(conflict),'unresolved identity conflict blocks unique address');
 const unanchored=setup([{...camera(),anchor:{macAddress:null,vendor:'Fixture'}}]);check(decision(unanchored)?.code==='INSUFFICIENT_IDENTITY_EVIDENCE'&&await blocked(unanchored),'IP/name alone is not identity');
 for(const anchor of [{macAddress:camera().anchor.macAddress,vendor:'Fixture'},{macAddress:null,onvifEndpointUuid:'uuid-A',vendor:'Fixture'}]){const s=setup([{...camera(),anchor},camera('B')]);check(await blocked(s),'T15/T16 MAC or UUID does not implement physical browser routing');}
 const arp=setup([camera(),camera('B')]);arp.db.getDeviceById('A')!.reachability!.neighborObservations=[{ipAddress:'192.168.1.100',macAddress:camera().anchor.macAddress,interfaceIndex:8,state:'Reachable',observedAt:now(),result:'CONFIRMED'}];check(await blocked(arp),'T14 neighbor evidence cannot authorize shared-IP HTTP');
 const diag=setup([camera(),camera('B')]);diag.db.getDeviceById('A')!.diagnostics={checks:['PING','HTTP','HTTPS','TCP','ONVIF_WS_DISCOVERY'].map(type=>({type:type as any,targetIp:'192.168.1.100',success:true,port:443,timestamp:now()}))};check(await blocked(diag),'T17 positive diagnostics cannot override ambiguity');
 const record=setup();record.db.getCollisions().push({id:'active',ipAddress:'192.168.1.100',detectedAt:now(),collidingDevices:[],resolved:false,state:'AMBIGUOUS'});check(await blocked(record),'active collision record blocks even when another row is absent');
 const moved=setup();moved.db.getDeviceById('A')!.diagnostics={checks:[{type:'HTTPS',targetIp:'192.168.9.100',port:8443,success:true,timestamp:now()}]};check(!moved.service.resolve('A').endpoint.verified,'old-IP diagnostics cannot verify new endpoint');
 const ack=await single.service.open('A','SYSTEM');check((ack as any).accessDecision?.allowed&&single.db.getDeviceById('A')!.connectionHistory!.at(-1)!.result?.includes('requested'),'T18/T26 launch acknowledged only as request');
 const app=readFileSync('src/ui/App.tsx','utf8'),table=readFileSync('src/ui/components/MasterDeviceTable.tsx','utf8'),modal=readFileSync('src/ui/components/BrowserModal.tsx','utf8');
 check(table.includes("onOpenBrowser(dev, 'SYSTEM')")&&table.includes("onOpenBrowser(device, 'SYSTEM')"),'T06/T07 IP and Actions use same device callback');
 check(app.includes('/api/connect/${encodeURIComponent(dev.id)}/open'),'T09 project/current table uses stable ID service');
 check(modal.includes('accessDecision')&&modal.includes('decideCameraAccess'),'embedded and Open External share authoritative decision');
 for(const change of ['COLLISION','ADDRESS','IDENTITY'] as const){const s=setup();let dispatches=0;const launcher=new WindowsBrowserLauncher(async()=>{dispatches++});launcher.available=async()=>{await Promise.resolve();if(change==='COLLISION')s.db.upsertDevice(camera('B'));else if(change==='ADDRESS')s.db.getDeviceById('A')!.network.ipAddress='192.168.1.168';else s.db.getDeviceById('A')!.anchor=camera('B').anchor;return['SYSTEM']};const service=new ConnectService(s.db,launcher);let rejected=false;try{await service.open('A','SYSTEM')}catch{rejected=true}check(rejected&&dispatches===0,change+' change during browser detection prevents dispatch');}
 const real=setup();const dispatches:Array<{file:string;args:string[]}>=[];const windows=new WindowsBrowserLauncher(async(file,args)=>{dispatches.push({file,args})});windows.available=async()=>['SYSTEM','EDGE','EMBEDDED'];const service=new ConnectService(real.db,windows);await service.open('A','EDGE');const fallback=await service.open('A','CHROME');await service.open('A','EMBEDDED');check(dispatches.length===2&&dispatches[0].file==='msedge.exe'&&dispatches[1].file==='explorer.exe'&&fallback.browser.fallback,'real launcher preserves preference/fallback and embeds without process');check(dispatches.every(d=>d.args.length===1&&!d.args[0].includes('@')),'no MAC routing or certificate bypass flags sent to browser');
 const historic=setup();historic.db.getDeviceById('A')!.status='COLLISION';historic.db.getCollisions().push({id:'past',ipAddress:'192.168.1.100',detectedAt:now(),collidingDevices:[],resolved:true,state:'RESOLVED'});check(decision(historic)?.allowed,'resolved history and unique current identity override stale collision label');
 console.log(`Phase 6 access: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
}
run().catch(e=>{console.error(e);process.exitCode=1});
