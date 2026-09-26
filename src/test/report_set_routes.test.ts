import express from 'express';
import {createServer} from 'node:http';
import {ReportSet} from '../core/reporting/report_set.ts';
import {SiteProjectDatabase} from '../core/storage/project_db.ts';
import {createReportSetRouter} from '../server/report_set_routes.ts';
import {createReportRouter} from '../server/report_routes.ts';
import {taskHttpIntegration} from '../server/task_routes.ts';
import {TaskManager} from '../core/tasks/task_manager.ts';
import {Device} from '../types/index.ts';
let passed=0;const check=(v:unknown,n:string)=>{if(!v)throw Error(n);passed++;console.log('PASS: '+n)};
async function run(){const db=new SiteProjectDatabase(),set=new ReportSet(()=>db.getSession()),tasks=new TaskManager();db.startQuickWork();const d=(id:string):Device=>({id,anchor:{macAddress:null,onvifEndpointUuid:'uuid-'+id,vendor:'Camera',model:'Model'},network:{ipAddress:'192.168.1.100',port:80,protocol:'ONVIF',subnetMask:'255.255.255.0'},technician:{name:id,notes:'Installation'},status:'ONLINE',sessionVerification:'VERIFIED',discoveredPhase:3,firstSeenAt:'2026-09-01T12:00:00Z',lastSeenAt:'2026-09-01T12:00:00Z'});['A','B','excluded'].forEach(id=>db.upsertDevice(d(id)));
 const app=express();app.use(express.json());app.use(taskHttpIntegration(tasks,{refresh:()=>{},monitoring:()=>({}),bulk:()=>undefined,cancelBulk:()=>false,cancelReverify:()=>false}).middleware);app.use('/api/report-set',createReportSetRouter(set));app.use('/api/reports',createReportRouter({getSession:()=>db.getSession(),getAuditLogs:()=>[],reportSet:set}));const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number};const post=(path:string,body:unknown)=>fetch(`http://127.0.0.1:${address.port}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  check((await post('/api/report-set/add',{deviceIds:['A','B','A']})).ok,'T24 actual bulk add route');check((await post('/api/report-set/add',{deviceIds:['A','B']})).ok&&set.snapshot().members.length===2,'T25 route repeated request idempotent');check(tasks.snapshot().tasks.length===0,'T41 membership does not create Tasks');
  const before=JSON.stringify(db.getSession());const inspect=await fetch(`http://127.0.0.1:${address.port}/api/report-set`);check(inspect.ok&&JSON.stringify(db.getSession())===before,'T37 inspection has no inventory side effects');
  db.removeDeviceFromCurrentList('A');db.removeDeviceFromCurrentList('B');const request={type:'DEVICE_INVENTORY',scope:'REPORT_SET',columns:['NAME','STATUS','MAC','ONVIF_UUID','NOTES']};const preview=await post('/api/reports/preview',request),model=await preview.json() as any;
  check(preview.ok&&model.rows.length===2,'T31/T49 production preview retains removed cameras');check(model.rows.every((r:any)=>['A','B'].includes(r.values.NAME)),'T32 nonmembers never silently enter Report Set export');check(model.metadata.liveEvidence===false,'T30 retained report identified as snapshot');check(!JSON.stringify(model).includes('password'),'T50 safe generated model');
  check(tasks.snapshot().tasks.length===0,'preview/membership does not create report history Tasks');
  for(const format of ['pdf','csv','json']){const response=await post('/api/reports/export/'+format,request);const bytes=Buffer.from(await response.arrayBuffer());check(response.ok&&bytes.length>50,'T49 actual retained '+format+' export');}
  check(tasks.snapshot().tasks.length===3&&tasks.snapshot().tasks.every(t=>t.kind==='REPORT'&&t.state==='COMPLETED'),'T43 existing generated-report Task history preserved');
  const selected=await post('/api/reports/preview',{...request,scope:'SELECTED',deviceIds:['excluded']});check((await selected.json() as any).rows.length===1&&set.snapshot().members.length===2,'selection scope does not destroy accumulated membership');
  check((await post('/api/report-set/clear',{confirmed:false})).status===409&&set.snapshot().members.length===2,'T33 unconfirmed API clear blocked');
  const missingId=set.snapshot().members[0].id;check((await post('/api/report-set/remove',{memberIds:[missingId]})).ok&&set.snapshot().members.length===1,'T48 remove by retained member key');
  await post('/api/report-set/clear',{confirmed:true});check(set.snapshot().members.length===0&&db.getDevices().length===3,'T34 confirmed clear affects only membership');check((await post('/api/reports/preview',request)).status===400,'empty Report Set errors instead of exporting current nonmembers');
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
 console.log(`Report Set routes: ${passed} passed, 0 failed`);
}run().catch(e=>{console.error(e);process.exitCode=1});
