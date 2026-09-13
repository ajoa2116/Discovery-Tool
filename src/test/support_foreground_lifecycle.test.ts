import { strict as assert } from 'node:assert';
import express from 'express';
import { ForegroundDiscovery } from '../core/engine/foreground_discovery.ts';
import { SupportTraceLease } from '../core/readiness/support_trace_lease.ts';
import { createReceiveTraceRouter } from '../server/ws_discovery_trace_routes.ts';
import { WsDiscoveryEvidence } from '../core/drivers/ws_discovery_evidence.ts';
import { IncrementalDiscoveryMonitor } from '../core/engine/incremental_discovery_monitor.ts';
import { foregroundFailed, reconcileForeground } from '../shared/discovery_session.ts';
import { fieldEthernet } from './support/first_camera_field.ts';
let passed=0;const check=(value:unknown,name:string)=>{assert.ok(value,name);passed++;console.log('PASS: '+name)};
const until=async(test:()=>boolean)=>{const end=Date.now()+2000;while(!test()){if(Date.now()>end)throw Error('timeout');await new Promise(r=>setTimeout(r,1));}};
async function run(){
 const foreground=new ForegroundDiscovery(),support=new SupportTraceLease(),initial=foreground.getState();
 let failMonitor=false,failTrace=false,hold=false,release:()=>void=()=>{},options:any,owners:any[]=[],adapterAvailable=true;
 const order:string[]=[];
 const monitor=new IncrementalDiscoveryMonitor({canRun:()=>({allowed:!support.isActive()&&!foreground.isActive()}),runCycle:async()=>{order.push('monitor');if(failMonitor)throw Error('private');}});monitor.start();
 check(await monitor.runNow()==='COMPLETED','background success');check(JSON.stringify(initial)===JSON.stringify(foreground.getState()),'background success leaves foreground Ready');
 failMonitor=true;check(await monitor.runNow()==='FAILED','background failure recorded');check(Boolean(monitor.getState().lastError)&&!foregroundFailed(foreground.getState()),'monitor failure is scoped');failMonitor=false;
 const app=express();app.use(express.json());app.use('/trace',createReceiveTraceRouter({foreground,support,evidence:new WsDiscoveryEvidence(),busy:()=>false,yieldMonitoring:async()=>{await monitor.yieldToTechnician();order.push('paused');},portOwners:async()=>owners,adapters:async()=>adapterAvailable?[fieldEthernet()]:[],transport:{discover:async(_nics,o)=>{options=o;order.push('trace');if(hold)await new Promise<void>(r=>{release=r;o?.signal?.addEventListener('abort',()=>r(),{once:true})});order.push('closed');if(failTrace)throw Error('private credentials');return {devices:[],interfaceErrors:[],cancelled:false};}}}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}/trace`;
 const post=(path='',body:any={interfaceIndex:8})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try {
  hold=true;const response=await post();const body=await response.json();
  check(response.status===202&&!body.foreground,'support HTTP never returns foreground');check(body.support.sessionClass==='SUPPORT_DIAGNOSTIC'&&body.support.visibility==='SUPPORT','support has explicit class and visibility');
  check(options.context.origin==='INTERNAL'&&options.awaitSocketClose===true,'support waits for actual socket close using internal context');
  check(support.isActive()&&await monitor.runNow()==='SKIPPED','support lease defers monitoring');check(JSON.stringify(initial)===JSON.stringify(foreground.getState()),'support listening leaves foreground Ready');
  check(!foreground.stop(body.support.sessionId)&&!options.signal.aborted,'foreground Stop cannot cancel support');check((await post('/stop',{sessionId:'stale'})).status===409,'stale support Stop rejected');
  release();await until(()=>!support.isActive());check(support.snapshot()!.state==='COMPLETED','support success recorded');
  check(Boolean(support.snapshot()!.releasedAt)&&Boolean(support.snapshot()!.monitoringPausedAt),'support ownership timestamps recorded');check(await monitor.runNow()==='COMPLETED','monitor resumes after release');check(order.slice(-4).join() === 'paused,trace,closed,monitor','pause run close resume order');
  hold=false;failTrace=true;await post();await until(()=>!support.isActive());check(support.snapshot()!.state==='FAILED'&&support.snapshot()!.error==='DIAGNOSTIC_UNAVAILABLE','support failure recorded safely');check(!JSON.stringify(support.snapshot()).includes('credentials'),'support failure does not expose raw error');check(JSON.stringify(initial)===JSON.stringify(foreground.getState()),'support failure leaves foreground unchanged');
  check(await monitor.runNow()==='COMPLETED','monitor resumes after support failure');failTrace=false;
  owners=[{pid:process.pid+1}];check((await post()).status===409&&support.snapshot()!.error==='CONFLICTING_PORT_OWNER','port conflict has truthful support HTTP error');owners=[];
  adapterAvailable=false;check((await post()).status===400&&!support.isActive(),'invalid adapter releases support');adapterAvailable=true;
  const user=foreground.begin('MANUAL');check((await post()).status===409,'active user scan rejects support');check(!foreground.stop('stale')&&!user.signal.aborted,'stale foreground Stop rejected');check(foreground.stop(user.context.sessionId)&&user.signal.aborted,'current foreground Stop targets its token');foreground.finish(user.context.sessionId,'COMPLETED');check(!foregroundFailed(foreground.getState()),'cancelled user scan has no failure');
  const failed=foreground.begin('MANUAL');foreground.finish(failed.context.sessionId,'FAILED');const failure=foreground.getState();check(foregroundFailed(failure),'genuine current user failure visible');
  const next=foreground.begin('MANUAL');check(!foregroundFailed(foreground.getState()),'new user session clears failure');foreground.finish(next.context.sessionId,'COMPLETED');const success=foreground.getState();check(!foregroundFailed(success),'success clears prior failure');check(reconcileForeground(success,failure,'WS')===success,'old session failure ignored');
  const ready={epoch:success.epoch,revision:success.revision+1,session:null};check(reconcileForeground(ready,failure,'WS')===ready,'old failure cannot overwrite Ready');
  const reboot={epoch:'restart',revision:0,session:null};check(reconcileForeground(success,reboot)===reboot,'HTTP adopts restarted backend Ready');check(reconcileForeground(reboot,failure,'WS')===reboot,'previous epoch failure ignored');check(reconcileForeground(reboot,failure,'HTTP',new Set([failure.epoch]))===reboot,'late HTTP from retired epoch ignored');
  for(const sessionClass of ['SUPPORT_DIAGNOSTIC','MONITORING'])check(reconcileForeground(ready,{...failure,revision:1000,session:{...failure.session,sessionClass}},'WS')===ready,sessionClass+' cannot impersonate MANUAL');
  const advanced=foreground.begin('ADVANCED');check(foreground.getState().session?.sessionClass==='ADVANCED_SCAN','Advanced has explicit visible class');foreground.finish(advanced.context.sessionId,'FAILED');check(foregroundFailed(foreground.getState()),'Advanced genuine failure preserved');
  hold=true;await post();const id=support.snapshot()!.sessionId;check((await post('/stop',{sessionId:id})).status===202,'support-specific Stop accepted');await until(()=>!support.isActive());check(support.snapshot()!.state==='CANCELLED','support cancellation scoped');check(foregroundFailed(foreground.getState()),'support completion does not hide genuine current user failure');
 }finally{monitor.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
 let closed=false;const delayed=new SupportTraceLease();delayed.begin();
 delayed.finish('FAILED','SOCKET_CLOSE_NOT_CONFIRMED',{snapshot:()=>({sessions:[{windowId:'delayed',sockets:[{closedAt:closed?'now':undefined}]}]})} as any,'delayed');
 check(delayed.isActive()&&delayed.snapshot()?.cleanupPending,'unconfirmed socket close retains support ownership');
 closed=true;await until(()=>!delayed.isActive());check(Boolean(delayed.snapshot()?.releasedAt),'actual late socket close releases support ownership');
 console.log(`Support foreground lifecycle: ${passed} passed, 0 failed, 0 skipped`);
}
run().catch(e=>{console.error(e);process.exitCode=1});
