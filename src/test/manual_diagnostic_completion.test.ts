import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import net from 'node:net';
import dgram from 'node:dgram';
import ts from 'typescript';
import type { Device } from '../types/index.ts';

// Source-selected callback unit tests, not HTTP/authentication integration.
// Never import/construct/start backend_application or expose a listener.
let forbidden=0;
const originals={connect:net.Socket.prototype.connect,listen:net.Server.prototype.listen,udp:dgram.createSocket,fetch:globalThis.fetch};
const deny=():never=>{forbidden++;throw Error('Forbidden diagnostic handler test network operation');};
net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;dgram.createSocket=deny;globalThis.fetch=deny;

await test('manual Diagnose accepts results before reporting completion', {timeout:10000}, async t=>{
 try {
  const {SiteProjectDatabase}=await import('../core/storage/project_db.ts');
  const {TaskManager}=await import('../core/tasks/task_manager.ts');
  const {appStateDb}=await import('../core/storage/app_db.ts');
  const {applyNetworkRelationship}=await import('../shared/network_relationship.ts');
  const {technicianErrorResponse}=await import('../shared/error_presentation.ts');
  const {diagnosticPresentation}=await import('../shared/technician_attention.ts');
  const source=readFileSync(new URL('../server/backend_application.ts',import.meta.url),'utf8');
  const tree=ts.createSourceFile('backend_application.ts',source,ts.ScriptTarget.Latest,true);
  assert.equal((tree as ts.SourceFile&{parseDiagnostics:unknown[]}).parseDiagnostics.length,0);
  const routes:ts.ArrowFunction[]=[],taskConstructors:ts.NewExpression[]=[];
  function visit(node:ts.Node){
   if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(tree)==='app'
     &&node.expression.name.text==='post'&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='/api/diagnostics/run'){
    assert.ok(ts.isArrowFunction(node.arguments[1]));routes.push(node.arguments[1]);
   }
   if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='tasks'&&node.initializer&&ts.isNewExpression(node.initializer)
     &&node.initializer.expression.getText(tree)==='TaskManager')taskConstructors.push(node.initializer);
   ts.forEachChild(node,visit);
  }
  visit(tree);assert.equal(routes.length,1);assert.equal(taskConstructors.length,1);
  function evaluate(expression:ts.Node,bindings:Record<string,unknown>):any{
   const transformed=ts.transpileModule('const captured = ('+expression.getText(tree)+');',{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,
   });
   assert.equal(transformed.diagnostics?.length??0,0);
   return compileFunction(transformed.outputText+'\nreturn captured;',Object.keys(bindings),{filename:'isolated-manual-diagnostic-source-test.js'})(...Object.values(bindings));
  }
  const stamp='2026-10-29T12:00:00.000Z';
  async function fixture(ids=['camera']){
   const db=new SiteProjectDatabase('ISOLATED_TEST');db.createNewProject('Synthetic completion');
   for(const [index,id] of ids.entries())db.upsertDevice({id,anchor:{macAddress:'00:11:22:33:44:'+String(50+index),onvifEndpointUuid:'uuid-'+id,vendor:'Synthetic'},
    network:{ipAddress:'192.0.2.'+(50+index),subnetMask:'255.255.255.0',port:80,protocol:'ONVIF',ipAddressHistory:['192.0.2.'+(40+index)]},
    technician:{name:'  Camera  ',location:'  Door  ',notes:'  Preserve notes  '},status:'ONLINE',sessionVerification:'VERIFIED',
    evidenceProvenance:'SYNTHETIC_TEST',discoveredPhase:3,firstSeenAt:stamp,lastSeenAt:stamp});
   db.exportProjectJsonForSave();
   const tasks=evaluate(taskConstructors[0],{TaskManager,appStateDb}) as InstanceType<typeof TaskManager>;
   const events:any[]=[],trace:string[]=[],calls:Array<{device:Device;options:any;resolve:(device:Device)=>void;reject:(error:Error)=>void}>=[];
   const controllers=new Map<string,AbortController>();let applyCalls=0;
   const apply=db.applyDiagnosticRefresh.bind(db);
   db.applyDiagnosticRefresh=(...args:Parameters<typeof apply>)=>{applyCalls++;trace.push('apply');return apply(...args);};
   let terminalResolve!:(task:NonNullable<ReturnType<typeof tasks.get>>)=>void;
   const terminal=new Promise<NonNullable<ReturnType<typeof tasks.get>>>(resolve=>{terminalResolve=resolve;});
   const update=tasks.update.bind(tasks),result=tasks.diagnosticResult.bind(tasks);
   tasks.diagnosticResult=(...args:Parameters<typeof result>)=>{trace.push(args[1]+':'+args[2]);result(...args);};
   tasks.update=(...args:Parameters<typeof update>)=>{
    update(...args);const task=tasks.get(args[0])!;
    if(['COMPLETED','FAILED','CANCELLED'].includes(task.state)){trace.push('terminal:'+task.state);terminalResolve(task);}
   };
   const handler=evaluate(routes[0],{projectDb:db,tasks,diagnosticControllers:controllers,applyNetworkRelationship,technicianErrorResponse,
    advancedScanService:{async listAdapters(){return[{interfaceIndex:7,interfaceAlias:'Synthetic Ethernet',mediaType:'ETHERNET',operationalStatus:'Up',eligible:true,
      dhcpEnabled:false,ipv4Addresses:[{address:'192.0.2.10',prefixLength:24}],defaultGateways:[],dnsAutomatic:true,dnsServers:[],capturedAt:stamp}];}},
    diagnosticEngine:{diagnose(device:Device,options:any){return new Promise<Device>((resolve,reject)=>{calls.push({device,options,resolve,reject});});}},
    broadcast(event:unknown){events.push(structuredClone(event));trace.push('broadcast:'+(event as {type:string}).type);},
   });
   const response:{statusCode?:number;body?:any;status:(code:number)=>any;json:(body:unknown)=>void}={status(code){this.statusCode=code;return this;},json(body){this.body=body;}};
   await handler({body:{deviceIds:ids}},response);assert.equal(response.statusCode,202);assert.equal(calls.length,ids.length);
   function outcome(index=0,status:Device['status']='UNREACHABLE'):Device{
    return{...structuredClone(calls[index].device),status,sessionVerification:'VERIFIED',diagnostics:{lastRunStartedAt:stamp,lastRunCompletedAt:stamp,
     previouslyReachableThisSession:true,checks:[{type:'HTTP',targetIp:calls[index].device.network.ipAddress,success:false,errorCategory:'TIMEOUT',timestamp:stamp},
      {type:'HTTPS',targetIp:calls[index].device.network.ipAddress,success:false,errorCategory:'TIMEOUT',timestamp:stamp}]}};
   }
   function noAcceptanceMutation(before:string,auditBefore:ReturnType<typeof appStateDb.getAuditLogs>,state='FAILED'){
    assert.equal(JSON.stringify(db.getSession()),before);
    // Production TaskManager already logs terminal SYSTEM transitions. Preserve
    // that expected audit, while proving no additional rejected-result audit.
    const audits=appStateDb.getAuditLogs();assert.equal(audits.length,auditBefore.length+1);assert.deepEqual(audits.slice(1),auditBefore);
    assert.equal(audits[0].category,'SYSTEM');assert.equal(audits[0].details?.state,state);
   }
   return{db,tasks,events,trace,calls,controllers,terminal,response,outcome,noAcceptanceMutation,get applyCalls(){return applyCalls;}};
  }
  for(const removal of [false,true])await t.test(removal?'removed record fails without accepting evidence':'changed IP fails without accepting evidence',async()=>{
   const f=await fixture();
   if(removal)f.db.removeDeviceFromProject('camera');else f.db.upsertDevice({...structuredClone(f.db.getDevices()[0]),network:{...f.db.getDevices()[0].network,ipAddress:'192.0.2.99'}});
   const before=JSON.stringify(f.db.getSession()),auditBefore=structuredClone(appStateDb.getAuditLogs());
   f.calls[0].resolve(f.outcome());const task=await f.terminal;
   assert.equal(task.state,'FAILED');assert.deepEqual(task.progress,{completed:1,total:1});assert.equal(task.diagnosticDevices?.[0].state,'FAILED');
   assert.equal(task.diagnosticDevices?.[0].reason,'DIAGNOSTIC_RESULT_STALE');
   assert.deepEqual(f.trace.filter(s=>s==='camera:COMPLETED'||s==='camera:CANCELLED'),[]);
   assert.equal(f.events.filter(e=>e.type==='DEVICE_DIAGNOSTICS_UPDATED').length,0);
   assert.equal(f.events.length,1);assert.equal(f.events[0].type,'DIAGNOSTIC_FAILED');assert.equal(f.events[0].data.code,'OPERATION_FAILED');
   assert.equal(f.events[0].data.presentation.title,'Diagnostic result no longer applies');
   assert.match(f.events[0].data.presentation.message,/record or IP address changed/);assert.match(f.events[0].data.presentation.action,/Run Diagnose again/);
   f.noAcceptanceMutation(before,auditBefore);assert.equal(f.applyCalls,1);assert.equal(f.controllers.size,0);
   assert.equal(f.trace.at(-1),'terminal:FAILED');
  });
  for(const status of ['ONLINE','UNREACHABLE'] as const)await t.test('accepted '+status+' remains Completed with authoritative stored device',async()=>{
   const f=await fixture(), expected=f.outcome(0,status);
   f.db.updateDeviceTechnicianFields('camera',{notes:'Newer technician notes'});
   f.calls[0].resolve(expected);const task=await f.terminal;
   assert.equal(task.state,'COMPLETED');assert.equal(task.diagnosticDevices?.[0].state,'COMPLETED');assert.deepEqual(task.progress,{completed:1,total:1});
   assert.equal(task.diagnosticDevices?.[0].reason,undefined);
   assert.equal(f.events.length,1);assert.equal(f.events[0].type,'DEVICE_DIAGNOSTICS_UPDATED');
   assert.deepEqual(f.events[0].data.device,f.db.getDevices()[0]);assert.equal(f.events[0].data.device.status,status);
   assert.equal(f.events[0].data.device.technician.notes,'Newer technician notes');assert.equal(f.applyCalls,1);
   assert.equal(diagnosticPresentation(f.db.getDevices()[0],f.tasks.snapshot(),{taskId:task.id}).state,'Completed');
   assert.equal(f.trace.at(-1),'terminal:COMPLETED');assert.equal(f.controllers.size,0);
  });
  await t.test('explicit cancellation wins over a now-stale result without calling storage',async()=>{
   const f=await fixture();await f.tasks.cancel(f.response.body.taskId);assert.equal(f.calls[0].options.signal.aborted,true);
   f.db.removeDeviceFromProject('camera');const before=JSON.stringify(f.db.getSession()),auditBefore=structuredClone(appStateDb.getAuditLogs());
   f.calls[0].resolve(f.outcome());const task=await f.terminal;
   assert.equal(task.state,'CANCELLED');assert.equal(task.diagnosticDevices?.[0].state,'CANCELLED');assert.equal(f.applyCalls,0);assert.deepEqual(f.events,[]);
   assert.equal(task.diagnosticDevices?.[0].reason,undefined);
   f.noAcceptanceMutation(before,auditBefore,'CANCELLED');assert.equal(f.controllers.size,0);
  });
  await t.test('provider exception remains Failed rather than stale or cancelled',async()=>{
   const f=await fixture();const before=JSON.stringify(f.db.getSession()),auditBefore=structuredClone(appStateDb.getAuditLogs());
   f.calls[0].reject(Error('Synthetic diagnostic provider failure'));const task=await f.terminal;
   assert.equal(task.state,'FAILED');assert.equal(task.diagnosticDevices?.[0].state,'FAILED');assert.equal(f.applyCalls,0);
   assert.equal(task.diagnosticDevices?.[0].reason,undefined);
   assert.equal(f.events.length,1);assert.equal(f.events[0].type,'DIAGNOSTIC_FAILED');
   assert.notEqual(f.events[0].data.presentation.title,'Diagnostic result no longer applies');f.noAcceptanceMutation(before,auditBefore);
  });
  await t.test('mixed batch settles every device and ends Failed after one rejected result',async()=>{
   const f=await fixture(['camera','peer']);f.db.removeDeviceFromProject('camera');
   f.calls[0].resolve(f.outcome());for(let i=0;i<10;i++)await Promise.resolve();
   let task=f.tasks.get(f.response.body.taskId)!;assert.equal(task.state,'RUNNING');assert.deepEqual(task.progress,{completed:1,total:2});
   assert.deepEqual(task.diagnosticDevices?.map(d=>d.state),['FAILED','RUNNING']);
   f.calls[1].resolve(f.outcome(1));task=await f.terminal;
   assert.equal(task.state,'FAILED');assert.deepEqual(task.progress,{completed:2,total:2});
   assert.deepEqual(task.diagnosticDevices?.map(d=>d.state),['FAILED','COMPLETED']);
   assert.deepEqual(task.diagnosticDevices?.map(d=>d.reason),['DIAGNOSTIC_RESULT_STALE',undefined]);
   assert.deepEqual(f.events.map(e=>e.type),['DIAGNOSTIC_FAILED','DEVICE_DIAGNOSTICS_UPDATED']);assert.equal(f.events[1].data.device.id,'peer');
   assert.equal(f.trace.filter(s=>s.startsWith('terminal:')).length,1);assert.equal(f.controllers.size,0);
  });
  await t.test('no network attempts or backend activation',()=>assert.equal(forbidden,0));
 } finally {
  net.Socket.prototype.connect=originals.connect;net.Server.prototype.listen=originals.listen;dgram.createSocket=originals.udp;globalThis.fetch=originals.fetch;
 }
});
