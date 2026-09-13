import { DiscoveryContext } from '../../shared/discovery_session.ts';
import { NICInfo } from '../../types/index.ts';
export const TRACE_LIMITS = { sessions:20, datagrams:50, parserEvents:50, eventsPerSession:128, socketsPerSession:32, adaptersPerSession:32 };
export interface TransportSession {
  windowId:string; sessionId:string; origin:string; purpose:string; openedAt:string; closedAt?:string; durationMs?:number; closeReason?:string;
  timeoutMs:number; multicastGroup:string; multicastPort:number; adapters:Array<{alias:string;interfaceIndex?:number;ipv4:string}>;
  firstSelfProbeAt?:string; firstExternalDatagramAt?:string; firstHelloAt?:string;
  counters:{candidatesCreated:number;inventoryReconciliations:number;inventoryVisibleObservations:number;datagramsReceived:number;selfDatagrams:number;externalDatagrams:number;helloCount:number;probeMatchCount:number;rejectedCount:number;parseErrorCount:number;socketErrorCount:number};
  sockets:Array<Record<string,unknown>>; events:Array<Record<string,unknown>>; droppedEvents:number; lastStage:string; lastSuccessfulStage:string;
}
export class WsDiscoveryEvidence {
  private sessions:TransportSession[]=[];
  private datagrams:Array<Record<string,unknown>&{windowId:string}>=[];
  private parserEvents:Array<Record<string,unknown>&{windowId:string}>=[];
  private previousClosedAt?:string;
  begin(context:DiscoveryContext|undefined, adapters:NICInfo[], timeoutMs:number, purpose='DISCOVERY') {
    const windowId=crypto.randomUUID(),openedAt=new Date().toISOString();
    const session:TransportSession={windowId,sessionId:context?.sessionId||windowId,origin:context?.origin||'INTERNAL',purpose,openedAt,timeoutMs,multicastGroup:'239.255.255.250',multicastPort:3702,adapters:adapters.slice(0,32).map(n=>({alias:n.name.slice(0,80),interfaceIndex:n.interfaceIndex,ipv4:n.ipAddress})),counters:{candidatesCreated:0,inventoryReconciliations:0,inventoryVisibleObservations:0,datagramsReceived:0,selfDatagrams:0,externalDatagrams:0,helloCount:0,probeMatchCount:0,rejectedCount:0,parseErrorCount:0,socketErrorCount:0},sockets:[],events:[],droppedEvents:0,lastStage:'SESSION_START',lastSuccessfulStage:'SESSION_START'};
    this.sessions.push(session);if(this.sessions.length>20)this.sessions.shift();
    this.event(windowId,'SESSION_START',{previousClosedAt:this.previousClosedAt,gapSincePreviousSessionMs:this.previousClosedAt?Date.parse(openedAt)-Date.parse(this.previousClosedAt):undefined});
    return session;
  }
  event(windowId:string,stage:string,details:Record<string,unknown>={}) {
    const session=this.sessions.find(s=>s.windowId===windowId);if(!session)return;
    if(!/FAILED|ERROR|REJECTED|UNAVAILABLE|SESSION_END|SOCKET_CLOSE/.test(stage))session.lastSuccessfulStage=stage;
    session.lastStage=stage;if(stage==='UDP_DATAGRAM_RECEIVED')return;const event={timestamp:new Date().toISOString(),stage,...details};
    if(session.events.length===128){session.events.shift();session.droppedEvents++;}session.events.push(event);
  }
  datagram(windowId:string,details:Record<string,unknown>){this.datagrams.push({windowId,timestamp:new Date().toISOString(),...details});if(this.datagrams.length>50)this.datagrams.shift();}
  parser(windowId:string,stage:string,details:Record<string,unknown>={}){this.parserEvents.push({windowId,timestamp:new Date().toISOString(),stage,...details});if(this.parserEvents.length>50)this.parserEvents.shift();const session=this.sessions.find(s=>s.windowId===windowId);if(session){session.lastStage=stage;if(!/REJECTED|NOT_VISIBLE/.test(stage))session.lastSuccessfulStage=stage;if(stage==='CANDIDATE_CREATED')session.counters.candidatesCreated++;if(stage==='RECONCILED')session.counters.inventoryReconciliations++;if(stage==='INVENTORY_PROMOTION')session.counters.inventoryVisibleObservations++;}}
  end(windowId:string,reason:string){const s=this.sessions.find(s=>s.windowId===windowId);if(!s)return;s.closedAt=new Date().toISOString();s.durationMs=Date.parse(s.closedAt)-Date.parse(s.openedAt);s.closeReason=reason;this.previousClosedAt=s.closedAt;this.event(windowId,'SESSION_END',{reason});}
  snapshot(){return structuredClone({schemaVersion:1,limits:TRACE_LIMITS,sessions:[...this.sessions].reverse().map(s=>({...s,recentDatagrams:this.datagrams.filter(d=>d.windowId===s.windowId),recentParserEvents:this.parserEvents.filter(d=>d.windowId===s.windowId)}))});}
}
export const wsDiscoveryEvidence = new WsDiscoveryEvidence();
export const safeSocketCode=(error:unknown)=>{const code=(error as {code?:string})?.code;return code&&['EACCES','EPERM','EADDRINUSE','EADDRNOTAVAIL','ENETUNREACH','ENOBUFS','EINVAL','ERR_SOCKET_DGRAM_NOT_RUNNING'].includes(code)?code:'SOCKET_ERROR';};
