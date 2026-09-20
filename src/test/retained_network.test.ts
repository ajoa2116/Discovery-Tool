import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskManager } from '../core/tasks/task_manager.ts';
import { OperationTasks } from '../core/tasks/operation_tasks.ts';
import { readFileSync } from 'node:fs';
import { PairService, PairRecoveryStore, JsonPairRecoveryStore } from '../core/network/pair_service.ts';
import { WindowsNetworkAdapterService } from '../core/network/windows_adapter_service.ts';
import { WindowsAdapterSnapshot, PairSessionState } from '../types/index.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { recoveryRequiresReview, ShutdownCoordinator } from '../core/readiness/field_readiness.ts';

let passed=0,failed=0;
const check=(ok:unknown,name:string)=>{if(ok){passed++;console.log(`PASS: ${name}`)}else{failed++;console.error(`FAIL: ${name}`)}};
const rejects=async(fn:()=>unknown)=>{try{await fn();return false}catch{return true}};
const A:WindowsAdapterSnapshot={interfaceIndex:8,interfaceAlias:'Ethernet',interfaceGuid:'11111111-2222-3333-4444-555555555555',mediaType:'ETHERNET',operationalStatus:'Up',eligible:true,dhcpEnabled:false,ipv4Addresses:[{address:'192.168.0.124',prefixLength:24}],defaultGateways:['192.168.0.1'],dnsAutomatic:false,dnsServers:['192.168.0.53'],capturedAt:new Date().toISOString()} as WindowsAdapterSnapshot;
const B={...structuredClone(A),ipv4Addresses:[{address:'192.168.1.137',prefixLength:24}],defaultGateways:[]};
const saved=():PairSessionState=>({id:'retained',purpose:'NETWORK_MATCH',state:'PAIRED',deviceId:'',cameraIp:'',cameraSubnetMask:'255.255.255.0',adapter:structuredClone(B),originalAdapter:structuredClone(A),selectedCandidate:{ipAddress:'192.168.1.137',prefixLength:24,confidence:'AVAILABLE',evidence:[]},candidates:[],adapterConfigurationVerified:true,recoveryAvailable:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
class Store implements PairRecoveryStore {
  clears=0;saves=0;constructor(public value:any=saved()){}
  async load(){return structuredClone(this.value)}
  async save(value:PairSessionState){this.saves++;this.value=structuredClone(value)}
  async clear(){this.clears++;this.value=null}
}
class Adapters implements WindowsNetworkAdapterService {
  writes=0;restored?:WindowsAdapterSnapshot;bad=false;
  constructor(public rows:WindowsAdapterSnapshot[]=[structuredClone(B)]){}
  async inspectAdapters(){return structuredClone(this.rows)}
  async isAdministrator(){return true}
  async applyTemporary(index:number,ip:string,prefix:number){this.writes++;this.rows=[{...this.rows[0],dhcpEnabled:false,ipv4Addresses:[{address:ip,prefixLength:prefix}],defaultGateways:[]}];return structuredClone(this.rows[0])}
  async restore(snapshot:WindowsAdapterSnapshot){this.writes++;this.restored=structuredClone(snapshot);this.rows=[this.bad?{...snapshot,dnsServers:[]}:structuredClone(snapshot)];return structuredClone(this.rows[0])}
}
const setup=(rows?:WindowsAdapterSnapshot[],store=new Store())=>{const adapters=new Adapters(rows);const db=new SiteProjectDatabase();db.createNewProject('retention');const service=new PairService(adapters,{async check(){return{availability:'AVAILABLE',evidence:[]}}},undefined,store,db);return{service,adapters,store,db}};
async function run(){
  const x=setup();let state:any=await x.service.initializeRecovery();
  check(state?.state==='PAIRED'&&state.recoveryDisposition==='HEALTHY_RETAINED','T12 healthy restart is PAIRED, healthy retained');
  check(state?.adapterMutationActive===false,'stable retained is machine-readable, not active mutation');
  const tasks=new TaskManager();new OperationTasks(tasks).pair(state);check(tasks.snapshot().attention===0&&tasks.snapshot().active===0,'healthy retained Tasks entry is completed, not attention');
  check(!recoveryRequiresReview(true,state),'healthy retention is not a readiness error');
  check(x.adapters.writes===0&&x.store.clears===0&&JSON.stringify(x.store.value.originalAdapter)===JSON.stringify(A),'restart preserves A without mutation');
  check(typeof (x.service as any).keepCurrent==='function','explicit Keep Current operation exists');
  if(typeof (x.service as any).keepCurrent==='function')await (x.service as any).keepCurrent();
  x.service.cancelPreparation();
  check(x.adapters.writes===0&&x.store.clears===0,'T13 Keep Current and preparation dismissal are no-ops');
  check(await rejects(()=>x.service.prepareNetwork({interfaceIndex:8,ipAddress:'192.168.2.137',prefixLength:24})),'nested Match cannot replace original A');
  check(await rejects(()=>x.service.prepare('camera',8)),'nested Pair cannot replace original A');
  for(let i=0;i<3;i++){const restart=setup([B],x.store);state=await restart.service.initializeRecovery();check(state?.state==='PAIRED'&&restart.adapters.writes===0&&JSON.stringify(x.store.value.originalAdapter)===JSON.stringify(A),`restart ${i+1} idempotent`)}
  state=await x.service.restore();check(state.state==='RESTORED'&&x.adapters.writes===1&&x.store.clears===1,'T14 explicit restore verified before clearing');
  check(JSON.stringify(x.adapters.restored)===JSON.stringify(A),'T14 exact original IPv4/DHCP/gateway/DNS and adapter restored');
  const ext=setup([A]);state=await ext.service.initializeRecovery();check(state?.state==='RESTORED'&&state.recoveryDisposition==='ALREADY_RESTORED'&&ext.adapters.writes===0&&ext.store.clears===1,'external restoration recognized without write');
  const changed=setup([{...B,ipv4Addresses:[{address:'192.168.3.12',prefixLength:24}]}]);state=await changed.service.initializeRecovery();check(state?.recoveryDisposition==='ATTENTION_REQUIRED'&&state.state==='ROLLBACK_REQUIRED'&&changed.adapters.writes===0&&changed.store.clears===0,'C differs from A and B: attention, evidence preserved');
  await changed.service.restore();check(changed.adapters.writes===1,'C restoration requires explicit technician action');
  for(const rows of [[],[{...B,interfaceGuid:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'} as WindowsAdapterSnapshot]]){const z=setup(rows);state=await z.service.initializeRecovery();check(state?.recoveryDisposition==='ATTENTION_REQUIRED'&&z.store.clears===0,'missing or mismatched physical adapter requires attention');check(await rejects(()=>z.service.restore())&&z.adapters.writes===0,'never restore another physical adapter')}
  const renumber=setup([{...B,interfaceIndex:18}]);await renumber.service.initializeRecovery();await renumber.service.restore();check(renumber.adapters.restored?.interfaceIndex===18&&JSON.stringify(renumber.store.value)===JSON.stringify(null),'stable GUID resolves changed index');
  for(const value of [{}, {...saved(),originalAdapter:{...A,dnsServers:undefined}}, {...saved(),originalAdapter:{...A,interfaceGuid:undefined}}]){const z=setup([B],new Store(value));state=await z.service.initializeRecovery();check(state?.recoveryDisposition==='ATTENTION_REQUIRED'&&z.store.clears===0,'malformed/incomplete/legacy snapshot is attention');check(await rejects(()=>z.service.restore())&&z.adapters.writes===0,'invalid recovery cannot mutate')}
  const interrupted=setup([B],new Store({...saved(),state:'APPLYING',adapterConfigurationVerified:false}));state=await interrupted.service.initializeRecovery();check(state?.state==='ROLLBACK_REQUIRED'&&state.recoveryDisposition==='ATTENTION_REQUIRED'&&interrupted.adapters.writes===0,'interrupted APPLYING retains genuine attention');
  const bad=setup();await bad.service.initializeRecovery();bad.adapters.bad=true;check(await rejects(()=>bad.service.restore())&&bad.store.clears===0&&bad.service.getStatus()?.state==='ROLLBACK_REQUIRED','failed restore retains recovery truthfully');
  const live=setup([A],new Store(null));const preview=await live.service.prepareNetwork({interfaceIndex:8,ipAddress:'192.168.1.137',prefixLength:24});state=await live.service.confirmAndApply(preview.id,true);check(live.adapters.writes===1&&state.recoveryDisposition==='HEALTHY_RETAINED'&&state.adapterMutationActive===false,'T13 Pair completion makes only explicitly confirmed write');
  live.db.exportProjectJson();live.db.createNewProject('changed project');await new ShutdownCoordinator({stopDiscovery:()=>true},{},[],async()=>{},async()=>{}).shutdown();check(live.adapters.writes===1&&live.store.value!==null,'project save/change and shutdown leave adapter and recovery intact');
  const pairUi=readFileSync(new URL('../ui/components/PairNetworkModal.tsx',import.meta.url),'utf8'),networkUi=readFileSync(new URL('../ui/components/NetworkAdapterModal.tsx',import.meta.url),'utf8');
  check(pairUi.includes('Keep Current')&&networkUi.includes('Keep Current'),'both retained workflows expose Keep Current');
  check(pairUi.includes('onClick={onClose}')&&networkUi.includes('onClose'),'modal dismissal remains independent of Restore');
  const server=readFileSync(new URL('../server/index.ts',import.meta.url),'utf8');
  check((server.match(/pairService\.restore\(/g)||[]).length===1&&server.includes("app.post('/api/pair/restore'"),'T13 scan/save/save-as/project/exit have no implicit restore call');
  const root=await mkdtemp(join(tmpdir(),'cctv-retained-'));
  try {
    await live.db.saveProject(join(root,'save.cctvproj'));await live.db.saveAs(join(root,'saveas.cctvproj'));live.db.startQuickWork();
    check(live.adapters.writes===1&&live.store.value.originalAdapter.ipv4Addresses[0].address===A.ipv4Addresses[0].address,'T13 actual Save/Save As/close leave original A and Windows intact');
    check(!(await readFile(join(root,'save.cctvproj'),'utf8')).includes('originalAdapter'),'recovery never enters project files');
    const path=join(root,'recovery.json'),disk=new JsonPairRecoveryStore(path);await disk.save(saved());
    const diskSetup=setup([B],disk as any);await diskSetup.service.initializeRecovery();await (diskSetup.service as any).keepCurrent();
    check(JSON.stringify((await disk.load())?.originalAdapter)===JSON.stringify(A)&&diskSetup.adapters.writes===0,'real atomic disk roundtrip preserves original A');
    await writeFile(path,'{ malformed');const malformed=setup([B],disk as any);state=await malformed.service.initializeRecovery();
    check(state.recoveryDisposition==='ATTENTION_REQUIRED'&&await rejects(()=>malformed.service.restore())&&(await readFile(path,'utf8'))==='{ malformed','malformed JSON exposes attention and preserves bytes');
  } finally {await rm(root,{recursive:true,force:true})}
  const duplicate=setup([B,B]);await duplicate.service.initializeRecovery();check(await rejects(()=>duplicate.service.restore())&&duplicate.adapters.writes===0,'ambiguous physical GUID cannot restore');
  const extra=setup([{...A,ipv4Addresses:[...A.ipv4Addresses,{address:'192.168.9.8',prefixLength:24}]}]);state=await extra.service.initializeRecovery();check(state.recoveryDisposition==='ATTENTION_REQUIRED'&&extra.store.clears===0,'subset of original addresses is not already restored');
  const dhcpA={...A,dhcpEnabled:true,dnsAutomatic:true};const dhcp=setup([{...B,dnsAutomatic:true}],new Store({...saved(),originalAdapter:dhcpA,adapter:{...B,dnsAutomatic:true}}));await dhcp.service.initializeRecovery();await dhcp.service.restore();check(dhcp.adapters.restored?.dhcpEnabled&&dhcp.adapters.restored?.dnsAutomatic,'explicit restore reinstates DHCP and automatic DNS');
  let release!:()=>void;const concurrent=setup();await concurrent.service.initializeRecovery();concurrent.adapters.inspectAdapters=()=>new Promise(resolve=>{release=()=>resolve([B])});const pending=concurrent.service.restore();
  check(await rejects(()=>concurrent.service.restore()),'concurrent restore blocked before asynchronous inspection');release();await pending;check(concurrent.adapters.writes===1,'concurrent restore causes one write only');
  let load!:()=>void;const startup=setup();startup.store.load=()=>new Promise(resolve=>{load=()=>resolve(saved())});const recovering=startup.service.initializeRecovery();
  check(await rejects(()=>startup.service.prepareNetwork({interfaceIndex:8,ipAddress:'192.168.2.137',prefixLength:24}))&&await rejects(()=>startup.service.prepare('camera',8)),'startup inspection blocks baseline replacement race');load();await recovering;
  check(startup.adapters.writes===0&&startup.store.value.originalAdapter.ipv4Addresses[0].address===A.ipv4Addresses[0].address,'startup race preserves A without mutation');
  console.log(`Retained network summary: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
}
run().catch(error=>{console.error(error);process.exitCode=1});
