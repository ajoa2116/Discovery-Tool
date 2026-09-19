import { Device } from '../types/index.ts';
import { WindowsDeviceEnricher } from '../core/engine/device_enrichment.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { Phase3ActiveProbing } from '../core/engine/phase3_probing.ts';
import { VendorCameraConfigurationProvider } from '../core/drivers/vendor_configuration_provider.ts';
import { CameraDriverResolver } from '../core/drivers/camera_driver.ts';
import { PairService } from '../core/network/pair_service.ts';
import { fieldEthernet, fieldNic } from './support/first_camera_field.ts';
import { EventEmitter } from 'node:events';
import { NodeOnvifWsDiscoveryTransport } from '../core/drivers/ws_discovery_transport.ts';

let passed=0,failed=0;
const check=(v:unknown,n:string)=>{if(v){passed++;console.log('PASS: '+n)}else{failed++;console.error('FAIL: '+n)}};
const ip='192.168.1.100',macA='00:50:f9:63:fb:0f',macB='e4:30:22:cd:68:85';
const camera=(id='A',mac:string|null=null):Device=>({id,anchor:{macAddress:mac,onvifEndpointUuid:id==='B'?'uuid-b':'uuid-a',vendor:'Hanwha Vision',model:'Same'},network:{ipAddress:ip,subnetMask:null,port:80,protocol:'ONVIF'},reachability:{discoveryInterface:fieldNic()},status:'ONLINE',discoveredPhase:3,firstSeenAt:'now',lastSeenAt:'now'});
const proof=(d:Device,mac=macB)=>({source:'WS_DISCOVERY',ipAddress:ip,interfaceIndex:8,observedAt:new Date().toISOString(),anchor:{...d.anchor,macAddress:mac}});
const bind=(d:Device,mac=macB)=>{(d.reachability as any).identityObservation=proof(d,mac);return d};
const neighbor=(mac=macB,state='Stale')=>({lookup:async()=>({ipAddress:ip,macAddress:mac,interfaceIndex:8,state})});
const reach={probe:async()=>[]};
async function run(){
 for(const reverse of [false,true])for(const timing of ['before','between','after'])for(const macOnly of [false,true]){
  const db=new SiteProjectDatabase(),a=camera(),b=camera('B',macOnly?macB:null);if(macOnly)delete b.anchor.onvifEndpointUuid;
  const rows=reverse?[b,a]:[a,b];let release!:()=>void;
  const pending=new Promise<void>(r=>release=r);
  const enricher=new WindowsDeviceEnricher({lookup:async()=>{if(timing==='after')await pending;return {ipAddress:ip,macAddress:macB,interfaceIndex:8,state:'Stale'}}},reach);
  const transport={discover:async(_n:unknown,options:any)=>{options.onDevice(rows[0],true);if(timing!=='after')await new Promise(r=>setTimeout(r,0));if(timing==='between')options.onDevice({...rows[0],anchor:{...rows[0].anchor}},false);options.onDevice(rows[1],true);release();return {devices:rows,interfaceErrors:[],cancelled:false}}};
  await Phase3ActiveProbing.execute([fieldNic()],transport,enricher,{context:{origin:'MONITORING',sessionId:'test'}},undefined,db);
  check(db.getDevices().length===2&&db.getDeviceById('A')?.anchor.macAddress===null&&(macOnly?db.getDeviceById('B')?.anchor.macAddress===macB:db.getDeviceById('B')?.anchor.macAddress===null),`${macOnly?'T06':'T05'} order=${reverse} neighbor=${timing}`);
 }
 const unproven=camera();await new WindowsDeviceEnricher(neighbor(),reach).enrich(unproven);check(unproven.anchor.macAddress===null,'single visible row alone does not establish ownership');
 const safe=bind(camera('B'));await new WindowsDeviceEnricher(neighbor(),reach).enrich(safe);check(safe.anchor.macAddress===macB,'single device with independent UUID/MAC observation safely enriches');
 const wrong=bind(camera());(wrong.reachability as any).identityObservation.anchor.onvifEndpointUuid='uuid-b';await new WindowsDeviceEnricher(neighbor(),reach).enrich(wrong);check(wrong.anchor.macAddress===null,'another UUID proof cannot authorize promotion');
 const expired=bind(camera());(expired.reachability as any).identityObservation.observedAt='2000-01-01T00:00:00Z';await new WindowsDeviceEnricher(neighbor(),reach).enrich(expired);check(expired.anchor.macAddress===null,'stale ownership observation cannot promote');
 const wrongNic=bind(camera());(wrongNic.reachability as any).identityObservation.interfaceIndex=99;await new WindowsDeviceEnricher(neighbor(),reach).enrich(wrongNic);check(wrongNic.anchor.macAddress===null,'ownership must match interface');
 for(const state of ['Stale','Incomplete','Reachable']){const d=camera('A',macA);await new WindowsDeviceEnricher(neighbor(macB,state),reach).enrich(d);check(d.anchor.macAddress===macA,'known MAC preserved with '+state);}
 const absent=camera('A',macA);await new WindowsDeviceEnricher({lookup:async()=>null},reach).enrich(absent);check(absent.anchor.macAddress===macA,'empty neighbor preserves known MAC');
 for(const mac of ['00:00:00:00:00:00','ff:ff:ff:ff:ff:ff','01:00:5e:00:00:01','bad']){const d=bind(camera(),mac);await new WindowsDeviceEnricher(neighbor(mac),reach).enrich(d);check(d.anchor.macAddress===null,'invalid neighbor rejected '+mac);}
 const driver=(identity:any)=>({id:'HANWHA_SUNAPI',label:'Hanwha',vendorTokens:['hanwha'],inspect:async()=>({identity,values:{}}),capabilities:()=>[],apply:async()=>{},verify:async()=>true} as any);
 for(const identity of [{manufacturer:'Hanwha',macAddress:macB,serial:'serial-a'},{manufacturer:'Hanwha',macAddress:macA,serial:'serial-b'},{manufacturer:'Hanwha',macAddress:'ff:ff:ff:ff:ff:ff',serial:'serial-a'},...['00:00:00:00:00:00','01:00:5e:00:00:01','bad'].map(macAddress=>({manufacturer:'Hanwha',macAddress,serial:'serial-a'}))]){
  const d=camera('A',macA);d.anchor.serialNumber='serial-a';const before=JSON.stringify(d.anchor);let code='';try{await new VendorCameraConfigurationProvider(new CameraDriverResolver([driver(identity)])).inspect(d,{username:'test',password:'test'})}catch(e){code=(e as any).code}
  check(Boolean(code)&&JSON.stringify(d.anchor)===before,'T11 conflicting/invalid vendor response cannot mutate '+JSON.stringify(identity));
 }
 const d=camera();let insufficient=false;try{await new VendorCameraConfigurationProvider(new CameraDriverResolver([driver({manufacturer:'Hanwha',model:'Same',macAddress:macB,serial:'new'})])).inspect(d,{username:'test',password:'test'})}catch{insufficient=true}check(insufficient&&d.anchor.macAddress===null&&!d.anchor.serialNumber,'manufacturer/model/authentication are not identity binding');
 const established=camera('A',macA);await new VendorCameraConfigurationProvider(new CameraDriverResolver([driver({manufacturer:'Hanwha',macAddress:macA,serial:'new-serial'})])).inspect(established,{username:'test',password:'test'});check(established.anchor.serialNumber==='new-serial','matching established MAC allows vendor strengthening');
 const serialBound=camera();serialBound.anchor.serialNumber='serial-a';await new VendorCameraConfigurationProvider(new CameraDriverResolver([driver({manufacturer:'Hanwha',serial:'serial-a',macAddress:macA})])).inspect(serialBound,{username:'test',password:'test'});check(serialBound.anchor.macAddress===macA,'matching established typed serial supports authenticated MAC strengthening');
 const conflictObservation=camera('A',macA);await new WindowsDeviceEnricher(neighbor(),reach).enrich(conflictObservation);check(conflictObservation.reachability?.neighborObservations?.[0]?.result==='CONFLICT','conflicting neighbor remains non-authoritative evidence');
 check(unproven.reachability?.neighborObservations?.every(o=>o.result==='UNBOUND'),'unproven observations remain explicitly unbound');
 const incomplete=bind(camera('B'));await new WindowsDeviceEnricher(neighbor(macB,'Incomplete'),reach).enrich(incomplete);check(incomplete.anchor.macAddress===null,'incomplete neighbor cannot promote even with proof');
 const wrongIp=bind(camera('B'));await new WindowsDeviceEnricher({lookup:async()=>({...await neighbor().lookup(),ipAddress:'192.168.1.101'})},reach).enrich(wrongIp);check(wrongIp.anchor.macAddress===null,'wrong neighbor IP cannot promote');
 const wrongSource=bind(camera('B'));(wrongSource.reachability!.identityObservation as any).source='ARP';await new WindowsDeviceEnricher(neighbor(),reach).enrich(wrongSource);check(wrongSource.anchor.macAddress===null,'ARP cannot certify its own provenance');
 const serialOnlyProof=bind(camera('B'));serialOnlyProof.anchor.serialNumber='shared';serialOnlyProof.reachability!.identityObservation!.anchor.serialNumber='shared';delete serialOnlyProof.reachability!.identityObservation!.anchor.onvifEndpointUuid;await new WindowsDeviceEnricher(neighbor(),reach).enrich(serialOnlyProof);check(serialOnlyProof.anchor.macAddress===null,'serial-only corroboration cannot bind a UUID-specific neighbor observation');
 const captured=new SiteProjectDatabase(),packet=camera('B',macB);
 await Phase3ActiveProbing.execute([fieldNic()],{discover:async(_n,o)=>{o?.onDevice?.(packet,true);return {devices:[packet],interfaceErrors:[],cancelled:false}}},new WindowsDeviceEnricher(neighbor(),reach),{},undefined,captured);
 check(!captured.getDeviceById('B')?.reachability?.identityObservation,'aggregated transport identity cannot fabricate single-packet proof');
 const uuid='5a524b4c-3656-344c-3330-303037395a00';
 const xml=`<Envelope><ProbeMatch><EndpointReference><Address>urn:uuid:${uuid}</Address></EndpointReference><XAddrs>http://${ip}/onvif/device_service</XAddrs><Scopes>onvif://www.onvif.org/MAC/${macB}</Scopes></ProbeMatch></Envelope>`;
 class Socket extends EventEmitter {bind(_o:any,cb:()=>void){cb()}setMulticastInterface(){}addMembership(){}send(_m:any,_p:any,_a:any,cb:()=>void){cb();queueMicrotask(()=>this.emit('message',Buffer.from(xml),{address:ip,port:3702,family:'IPv4',size:xml.length}))}close(cb?:()=>void){cb?.()}}
 const raw=await new NodeOnvifWsDiscoveryTransport().discover([fieldNic()],{socketFactory:()=>new Socket() as any,multicastSocketFactory:()=>new Socket() as any,timeoutMs:10});
 check(raw.devices[0]?.reachability?.identityObservation?.anchor.onvifEndpointUuid===uuid,'raw packet capture records independent UUID/MAC binding');
 const snapshot=JSON.stringify(raw.devices[0]?.reachability?.identityObservation);raw.devices[0].anchor.macAddress=macA;
 check(JSON.stringify(raw.devices[0].reachability?.identityObservation)===snapshot&&Boolean(raw.devices[0].reachability?.identityObservation),'captured proof does not alias mutable incoming anchor');
 let response:any={manufacturer:'Hanwha',macAddress:macA,serial:'serial-a'},writes=0;
 const changing=driver(response);changing.inspect=async()=>({identity:response,values:{}});changing.capabilities=()=>[{operation:'NTP',state:'SUPPORTED',detail:''}];changing.apply=async()=>{writes++};
 const guarded=new VendorCameraConfigurationProvider(new CameraDriverResolver([changing])),target=camera('A',macA);target.anchor.serialNumber='serial-a';
 await guarded.inspect(target,{username:'test',password:'test'});response={manufacturer:'Hanwha',macAddress:macB};try{await guarded.inspect(target,{username:'test',password:'test'})}catch{}
 let rejected=false;try{await guarded.apply(target,{username:'test',password:'test'},'NTP',{})}catch{rejected=true}check(rejected&&writes===0,'conflict invalidates earlier provider authorization');
 for(const bound of [false,true]){
  const db=new SiteProjectDatabase(),d=bound?bind(camera('B')):camera('B');d.status='DIFFERENT_SUBNET';db.upsertDevice(d);let adapter=fieldEthernet(),writes=0;
  const adapters={inspectAdapters:async()=>[adapter],isAdministrator:async()=>true,applyTemporary:async(_i:number,address:string,prefixLength:number)=>{writes++;adapter={...adapter,ipv4Addresses:[{address,prefixLength}]};return adapter},restore:async()=>adapter};
  const service=new PairService(adapters,{check:async()=>({availability:'AVAILABLE',evidence:[]})},{diagnose:async(x:Device)=>x} as any,{load:async()=>null,save:async()=>{},clear:async()=>{}},db,{neighbors:neighbor(),windowMs:10,settleMs:1});
  const preview=await service.prepare(d.id,8);const result=await service.confirmAndApply(preview.id,true);
  check(result.state==='PAIRED'&&writes===1&&db.getDeviceById(d.id)?.anchor.macAddress===(bound?macB:null),'Pair ownership policy bound='+bound);
 }
 console.log(`Safe identity enrichment: ${passed} passed, ${failed} failed, 0 skipped`);if(failed)process.exitCode=1;
}
run().catch(e=>{console.error(e);process.exitCode=1});
