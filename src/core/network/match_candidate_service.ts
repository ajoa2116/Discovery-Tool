import type {Device,WindowsAdapterSnapshot} from '../../types/index.ts';
import type {MatchCandidatePreview,MatchApplyPlan} from '../../shared/match_candidate_preview.ts';
import {SiteProjectDatabase} from '../storage/project_db.ts';
import {PowerShellWindowsNetworkAdapterService,WindowsNetworkAdapterService} from './windows_adapter_service.ts';
import {ConservativeCandidateAddressChecker,subnetMaskToPrefix} from './pair_service.ts';
import type {CandidateAddressChecker} from './pair_service.ts';
import {WindowsNeighborProvider} from '../engine/device_enrichment.ts';
import {WindowsPingProvider,NodeTcpDiagnosticProvider} from '../engine/diagnostic_engine.ts';
import {ipv4Number,addressRelationship} from '../../shared/address_validation.ts';
import {hasIdentity,canonicalAnchor,sharesAnchor} from '../../shared/identity_policy.ts';
import {pairTargetBlock} from '../../shared/network_relationship.ts';
import {isActiveCollision} from '../../shared/collision_state.ts';

const toIp=(value:number)=>[24,16,8,0].map(shift=>(value>>>shift)&255).join('.');
const identity=(d:Device)=>JSON.stringify([d.id,canonicalAnchor(d.anchor),d.network.ipAddress,d.network.subnetMask]);
const topology=(a:WindowsAdapterSnapshot[])=>JSON.stringify(a.map(n=>[n.interfaceIndex,n.interfaceGuid,n.eligible,n.operationalStatus,n.ipv4Addresses]));
/** Reuses Pair's multi-signal checker, but scopes neighbors/TCP to a verified on-link adapter.
 * Provider failures/refusals cannot be converted into negative availability evidence. */
export function matchCandidateChecker(adapter:WindowsAdapterSnapshot,localAddress:string,providers={neighbors:new WindowsNeighborProvider(),ping:new WindowsPingProvider(),tcp:new NodeTcpDiagnosticProvider()}):CandidateAddressChecker {
  const {neighbors,ping,tcp}=providers;
  return new ConservativeCandidateAddressChecker({lookup:async(ip,options)=>{
    const entries=(await neighbors.list(options?.signal)).filter(e=>e.ipAddress===ip&&e.interfaceIndex===adapter.interfaceIndex);
    if(entries.length>1)throw Error('Ambiguous neighbor evidence');
    return entries[0]||null;
  }},{check:async(ip,options)=>{
    const result=await ping.check(ip,options);
    if(!result.success&&result.errorCategory!=='TIMEOUT')throw Error('Inconclusive ICMP check');return result;
  }},{check:async(ip,options)=>{
    const result=await tcp.check(ip,{...options,localAddress});
    if(result.errorCategory==='CONNECTION_REFUSED')return {...result,success:true};
    if(!result.success&&result.errorCategory!=='TIMEOUT')throw Error('Inconclusive TCP check');return result;
  }});
}

/** Preview only: owns no Pair session, mutation capability invocation, or recovery store. */
export class MatchCandidateService {
  private plans=new Map<string,MatchApplyPlan>();
  takePreview(id:string):MatchApplyPlan {const plan=this.plans.get(id);this.plans.delete(id);if(!plan||Date.now()-plan.createdAt>120000)throw Error('Candidate preview expired; search again.');return structuredClone(plan);}

  constructor(private readonly db:SiteProjectDatabase,private readonly adapters:WindowsNetworkAdapterService=new PowerShellWindowsNetworkAdapterService(),private readonly checkerFactory=matchCandidateChecker,private readonly budgetMs=8000){}
  async preview(deviceId:string,interfaceIndex:number):Promise<MatchCandidatePreview>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    const device=this.db.getDeviceById(deviceId);
    const result:MatchCandidatePreview={deviceId,deviceName:device?.technician?.name||device?.anchor.vendor||'Unknown device',targetIp:device?.network.ipAddress||'',candidates:[],state:'BLOCKED',message:'A stable, unambiguous device is required.',examined:0};
    const work=async()=>{
      if(!device||!hasIdentity(device))return result;
      const original=identity(device),ip=ipv4Number(device.network.ipAddress),prefix=device.network.subnetMask?subnetMaskToPrefix(device.network.subnetMask):null;
      if(ip===null||prefix===null||prefix<1||prefix>30){result.message='A safe target network cannot be determined: trustworthy device IPv4 and subnet mask evidence are required. Adapter prefixes are not substituted.';return result;}
      const mask=(0xffffffff<<(32-prefix))>>>0,network=(ip&mask)>>>0,broadcast=(network|(~mask>>>0))>>>0;
      result.network=toIp(network);result.prefixLength=prefix;
      const all=await this.adapters.inspectAdapters(controller.signal),adapter=all.find(a=>a.interfaceIndex===interfaceIndex&&a.eligible&&a.mediaType==='ETHERNET'&&a.operationalStatus.toLowerCase()==='up');
      if(!adapter){result.message='Select an eligible active Ethernet adapter.';return result;}
      result.adapter={interfaceIndex,name:adapter.interfaceAlias};
      const blocked=()=>{const current=this.db.getDeviceById(deviceId);return !current||identity(current)!==original||pairTargetBlock(current,all,this.db.getDevices())||this.db.getDevices().some(other=>other.id!==current.id&&sharesAnchor(current,other))||this.db.getProject().collisions.some(c=>isActiveCollision(c)&&c.ipAddress===current.network.ipAddress);};
      if(ip===network||ip===broadcast||blocked()){result.message='Target identity or address is ambiguous, changed, or has active duplicate-IP evidence.';return result;}
      const local=adapter.ipv4Addresses.find(a=>Number.isInteger(a.prefixLength)&&a.prefixLength>=1&&a.prefixLength<=30&&addressRelationship(device.network.ipAddress,a.address,a.prefixLength)==='LOCAL');
      if(!local){result.message='No candidate can be established safely without an on-link path through the selected Ethernet adapter. Off-subnet failed probes are not availability evidence. No network change has been made.';return result;}
      const localMask=(0xffffffff<<(32-local.prefixLength))>>>0,localNetwork=(ipv4Number(local.address)!&localMask)>>>0,localBroadcast=(localNetwork|(~localMask>>>0))>>>0;
      const checker=this.checkerFactory(adapter,local.address),hostCount=broadcast-network-1,seen=new Set<string>();
      const exclusions=()=>new Set([device.network.ipAddress,...this.db.getDevices().map(d=>d.network.ipAddress),...all.flatMap(a=>[...a.ipv4Addresses.map(ip=>ip.address),...a.defaultGateways,...a.dnsServers]),...this.db.getDevices().flatMap(d=>d.network.gateway?[d.network.gateway]:[]),...this.db.getProject().collisions.filter(isActiveCollision).map(c=>c.ipAddress)]);
      // Same bounded host permutation as Pair; stop at two rather than Pair's three.
      for(let attempt=1;attempt<=Math.min(32,hostCount)&&result.candidates.length<2;attempt++){
        if(controller.signal.aborted)throw Error('Search deadline reached');
        const address=toIp(network+((ip-network+attempt*37-1)%hostCount)+1);
        if(seen.has(address))continue;seen.add(address);result.examined++;
        if(address===toIp(localNetwork)||address===toIp(localBroadcast)||addressRelationship(address,local.address,local.prefixLength)!=='LOCAL'||exclusions().has(address)||address===toIp(network)||address===toIp(broadcast))continue;
        const check=await checker.check(address,{signal:controller.signal});
        if(controller.signal.aborted)throw Error('Search deadline reached');
        if(check.availability==='AVAILABLE'&&!exclusions().has(address))result.candidates.push({ipAddress:address,prefixLength:prefix,confidence:'AVAILABLE',evidence:check.evidence});
      }
      if(blocked()||topology(all)!==topology(await this.adapters.inspectAdapters(controller.signal))){result.candidates=[];result.message='Device identity, target network, or adapter topology changed during checking. Preview again.';return result;}
      result.candidates=result.candidates.filter(c=>!exclusions().has(c.ipAddress));
      result.state=result.candidates.length?'READY':'BLOCKED';
      if(result.state==='READY'){result.previewId=crypto.randomUUID();result.currentAdapter=structuredClone(adapter);for(const [id,p] of this.plans)if(Date.now()-p.createdAt>120000)this.plans.delete(id);if(this.plans.size>=8)this.plans.delete(this.plans.keys().next().value!);this.plans.set(result.previewId,{preview:structuredClone(result),adapter:structuredClone(adapter),anchor:structuredClone(device.anchor),createdAt:Date.now()});}
      result.message=result.candidates.length?'Preferred and optional fallback candidates passed bounded occupancy checks. This is not a guarantee of vacancy. No network change has been made.':'No candidate passed the bounded occupancy checks; occupied or ambiguous addresses were excluded. No network change has been made.';
      return result;
    };
    try{return await Promise.race([work(),new Promise<MatchCandidatePreview>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Search deadline reached'));},this.budgetMs);})]);}
    catch {controller.abort();return {...result,candidates:[],state:'BLOCKED',message:'Candidate checking was unavailable or exceeded its time bound. No safe candidate is offered; no network change has been made.'};}
    finally {if(timer)clearTimeout(timer);}
  }
}
