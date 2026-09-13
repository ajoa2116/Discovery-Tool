import { SupportTraceLease } from '../core/readiness/support_trace_lease.ts';
import { UdpPortOwner } from '../core/readiness/udp_port_owners.ts';
import { Router } from 'express';
import { ForegroundDiscovery } from '../core/engine/foreground_discovery.ts';
import { OnvifDiscoveryTransport } from '../core/drivers/ws_discovery_transport.ts';
import { WsDiscoveryEvidence } from '../core/drivers/ws_discovery_evidence.ts';
import { WindowsAdapterSnapshot, NICInfo } from '../types/index.ts';

export function createReceiveTraceRouter(d:{foreground:ForegroundDiscovery; support?:SupportTraceLease; yieldMonitoring:()=>Promise<void>; busy:()=>boolean; adapters:()=>Promise<WindowsAdapterSnapshot[]>; transport:OnvifDiscoveryTransport; evidence:WsDiscoveryEvidence;portOwners?:()=>Promise<UdpPortOwner[]>}) {
  const router=Router(), support=d.support ?? new SupportTraceLease();
  router.post('/stop',(req,res)=>res.status(support.stop(req.body?.sessionId)?202:409).json({support:support.snapshot()}));
  router.get('/',(_req,res)=>res.json({...d.evidence.snapshot(),support:support.snapshot()}));
  router.post('/',async(req,res)=>{
    const {interfaceIndex,localAddress,durationMs=20000,sendProbe=false,strategy='WILDCARD_SELECTED'}=req.body||{};
    if(!['WILDCARD_SELECTED','WILDCARD_ALL','ADAPTER_SPECIFIC'].includes(strategy)||!Number.isInteger(interfaceIndex)||interfaceIndex<1||!Number.isInteger(durationMs)||durationMs<15000||durationMs>20000||typeof sendProbe!=='boolean'||(localAddress!==undefined&&typeof localAddress!=='string'))return res.status(400).json({error:'Select an adapter index, optional IPv4 address, 15000-20000 ms duration and boolean sendProbe.'});
    if(d.foreground.isActive()||support.isActive()||d.busy())return res.status(409).json({error:'A technician discovery operation is already running.'});
    const {context,signal}=support.begin();
    try {
      await d.yieldMonitoring(); support.paused();
      if(signal.aborted)throw Error('Cancelled');
      const owners=await d.portOwners?.();
      if(owners?.some(owner=>owner.pid!==process.pid)){support.finish('FAILED','CONFLICTING_PORT_OWNER');return res.status(409).json({error:'Another process owns UDP 3702. Resolve the owner before comparing socket strategies.',owners});}
      const allAdapters=await d.adapters();
      const adapter=allAdapters.find(a=>a.interfaceIndex===interfaceIndex&&a.eligible);
      const addresses=adapter?.ipv4Addresses.filter(a=>localAddress===undefined||a.address===localAddress)||[];
      if(!adapter||addresses.length!==1){support.finish('FAILED','ADAPTER_UNAVAILABLE');return res.status(400).json({error:'Select one current eligible adapter IPv4 address.'});}
      if(signal.aborted)throw Error('Cancelled');
      const makeNic=(a:WindowsAdapterSnapshot,address:WindowsAdapterSnapshot['ipv4Addresses'][number]):NICInfo=>{
        const mask=address.prefixLength===0?0:(0xffffffff << (32-address.prefixLength))>>>0;
        const octets=(value:number)=>[24,16,8,0].map(shift=>(value>>>shift)&255).join('.');
        const ip=address.address.split('.').reduce((value,part)=>(value<<8)|Number(part),0)>>>0;
        return {name:a.interfaceAlias,interfaceIndex:a.interfaceIndex,ipAddress:address.address,netmask:octets(mask),broadcast:octets(ip|~mask),mac:'',isInternal:false};
      };
      const selected=strategy==='WILDCARD_ALL'?allAdapters.filter(a=>a.eligible).flatMap(a=>a.ipv4Addresses.map(ip=>makeNic(a,ip))):[makeNic(adapter,addresses[0])];
      support.scanning();
      res.status(202).json({support:support.snapshot(),purpose:'RECEIVE_TRACE_ONLY',durationMs,sendProbe,strategy});
      void (async()=>{
        let windowId:string|undefined;
        try {const result=await d.transport.discover(selected,{awaitSocketClose:true,onTraceSession:id=>{windowId=id;},strategy,provenance:'SUPPORT_DIAGNOSTIC',context,signal,timeoutMs:durationMs,announcementOnly:!sendProbe,purpose:'RECEIVE_TRACE_ONLY',evidence:d.evidence});support.finish(result.interfaceErrors.length?'FAILED':'COMPLETED',result.interfaceErrors.length?'SOCKET_SETUP_OR_RECEIVE_FAILED':undefined,d.evidence,windowId);}
        catch(error) {support.finish('FAILED',(error as Error).message==='SOCKET_CLOSE_NOT_CONFIRMED'?'SOCKET_CLOSE_NOT_CONFIRMED':'DIAGNOSTIC_UNAVAILABLE',d.evidence,windowId);}
      })();
    } catch {support.finish('FAILED',signal.aborted?'CANCELLED':'DIAGNOSTIC_UNAVAILABLE');res.status(signal.aborted?409:500).json({error:signal.aborted?'Receive trace cancelled.':'Receive trace could not start.'});}
  });
  return router;
}
