import { NICInfo, WindowsAdapterSnapshot } from '../../types/index.ts';
import { OnvifDiscoveryTransport, WsDiscoveryOptions } from '../drivers/ws_discovery_transport.ts';
import { WsDiscoveryEvidence } from '../drivers/ws_discovery_evidence.ts';
import { UdpPortOwner } from './udp_port_owners.ts';
export const MATRIX_STRATEGIES=['WILDCARD_SELECTED','ADAPTER_SPECIFIC','WILDCARD_EXCLUSIVE','SINGLE_MEMBERSHIP'] as const;
type Strategy=typeof MATRIX_STRATEGIES[number];
export interface MatrixInput {interfaceIndex:number;localAddress:string;durationMs:number;sendProbe:boolean;strategies:Strategy[]}
interface Dependencies {busy:()=>boolean;pause:()=>Promise<void>;adapters:()=>Promise<WindowsAdapterSnapshot[]>;owners:()=>Promise<UdpPortOwner[]>;transport:OnvifDiscoveryTransport;evidence:WsDiscoveryEvidence;changed?:()=>void;}
export class ReceiveMatrix {
 private active=false;private controller?:AbortController;private state:any=null;
 constructor(private readonly d:Dependencies){}
 isActive(){return this.active;}
 snapshot(){if(!this.state)return null;const result=structuredClone(this.state);for(const strategy of result.results){const session=this.d.evidence.snapshot().sessions.find(s=>s.windowId===strategy.windowId);if(session){strategy.windowOpenedAt=session.sockets[0]?.openedAt;strategy.windowClosedAt=session.sockets[0]?.closedAt;strategy.listenerAcquiredAt=strategy.windowOpenedAt;strategy.listenerReleasedAt=strategy.windowClosedAt;strategy.counters=session.counters;strategy.externalSourceIPs=session.externalSourceIPs;strategy.sockets=session.sockets;}}result.listenerAcquiredAt=result.results.find((r:any)=>r.listenerAcquiredAt)?.listenerAcquiredAt;result.listenerReleasedAt=result.results.at(-1)?.listenerReleasedAt;return result;}
 start(input:MatrixInput){
  if(!Number.isInteger(input.interfaceIndex)||!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(input.localAddress)||!Number.isInteger(input.durationMs)||input.durationMs<15000||input.durationMs>20000||typeof input.sendProbe!=='boolean'||!Array.isArray(input.strategies)||!input.strategies.length||input.strategies.length>4||new Set(input.strategies).size!==input.strategies.length||input.strategies.some(s=>!MATRIX_STRATEGIES.includes(s)))throw Error('INVALID_MATRIX');
  if(this.active||this.d.busy())throw Error('DISCOVERY_BUSY');
  input={interfaceIndex:input.interfaceIndex,localAddress:input.localAddress,durationMs:input.durationMs,sendProbe:input.sendProbe,strategies:[...input.strategies]};
  this.active=true;this.controller=new AbortController();const sessionId=crypto.randomUUID();
  this.state={sessionId,purpose:'RECEIVE_TRACE_ONLY',provenance:'SUPPORT_DIAGNOSTIC',state:'PREPARING',processId:process.pid,executablePath:process.execPath,runtime:process.version,input:structuredClone(input),pauseRequestedAt:new Date().toISOString(),results:[]};this.d.changed?.();
  void this.run(input,this.controller.signal);return sessionId;
 }
 stop(id:unknown){if(!this.active||id!==this.state?.sessionId)return false;this.controller?.abort();return true;}
 private async run(input:MatrixInput,signal:AbortSignal){
  try {
   await this.d.pause();this.state.monitoringPausedAt=new Date().toISOString();if(signal.aborted)throw Error('CANCELLED');
   const adapter=(await this.d.adapters()).find(a=>a.eligible&&a.mediaType==='ETHERNET'&&a.interfaceIndex===input.interfaceIndex);
   const address=adapter?.ipv4Addresses.find(a=>a.address===input.localAddress);if(!adapter||!address)throw Error('ETHERNET_ADAPTER_UNAVAILABLE');
   const mask=address.prefixLength===0?0:(0xffffffff<<(32-address.prefixLength))>>>0;
   const octets=(v:number)=>[24,16,8,0].map(s=>(v>>>s)&255).join('.');
   const nic:NICInfo={name:adapter.interfaceAlias,interfaceIndex:adapter.interfaceIndex,ipAddress:address.address,netmask:octets(mask),broadcast:'',mac:'',isInternal:false};
   for(const strategy of input.strategies){
    if(signal.aborted)throw Error('CANCELLED');
    const result:any={strategy,state:'CHECKING_PORT',ownershipCheckedAt:new Date().toISOString()};this.state.results.push(result);
    // Require all prior handles, including this backend's monitoring handles, to drain.
    let owners=await this.d.owners();
    for(let attempt=0;owners.length&&owners.every(o=>o.pid===process.pid)&&attempt<5&&!signal.aborted;attempt++){await new Promise(r=>setTimeout(r,100));owners=await this.d.owners();}
    result.owners=owners.map(owner=>({...owner,expectedBackend:owner.pid===process.pid}));
    if(owners.length){result.state='FAILED';result.cause=owners.some(o=>o.pid!==process.pid)?'CONFLICTING_PORT_OWNER':'LISTENER_HANDOFF_INCOMPLETE';throw Error(result.cause);}
    if(signal.aborted)throw Error('CANCELLED');
    this.state.state='LISTENING';result.state='LISTENING';this.d.changed?.();
    const options:WsDiscoveryOptions={context:{origin:'INTERNAL',sessionId:this.state.sessionId},strategy,timeoutMs:input.durationMs,announcementOnly:!input.sendProbe,purpose:'RECEIVE_TRACE_ONLY',provenance:'SUPPORT_DIAGNOSTIC',awaitSocketClose:true,signal,evidence:this.d.evidence,onTraceSession:id=>{result.windowId=id;}};
    const received=await this.d.transport.discover([nic],options);
    result.state=signal.aborted?'CANCELLED':received.interfaceErrors.length?'FAILED':'COMPLETED';
    if(received.interfaceErrors.length)result.cause='SOCKET_SETUP_OR_RECEIVE_FAILED';
    // Persist bounded counters/socket details before the global trace rotates.
    Object.assign(result,this.snapshot().results.at(-1));
    if(signal.aborted)throw Error('CANCELLED');
   }
   this.state.state=this.state.results.some((r:any)=>r.state==='FAILED')?'FAILED':'COMPLETED';
  }catch(error){const allowed=['CANCELLED','ETHERNET_ADAPTER_UNAVAILABLE','CONFLICTING_PORT_OWNER','LISTENER_HANDOFF_INCOMPLETE','SOCKET_CLOSE_NOT_CONFIRMED'];const code=(error as Error).message;this.state.state=signal.aborted?'CANCELLED':'FAILED';this.state.cause=allowed.includes(code)?code:'DIAGNOSTIC_UNAVAILABLE';const last=this.state.results.at(-1);if(last&&last.state!=='COMPLETED'){last.state=this.state.state;last.cause ||= this.state.cause;}}
  finally{
   if(this.state.cause==='SOCKET_CLOSE_NOT_CONFIRMED'){
    this.state.cleanupPending=true;
    const checkClosed=()=>{const latest=this.snapshot();if(latest.results.every((r:any)=>!r.windowId||r.sockets?.every((s:any)=>s.closedAt))){this.state.cleanupPending=false;this.release();}else{const timer=setTimeout(checkClosed,250);timer.unref?.();}};checkClosed();
   }else this.release();
  }
 }
 private release(){this.active=false;this.state.monitoringResumedAt=new Date().toISOString();this.d.changed?.();}
}
