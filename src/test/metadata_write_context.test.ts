import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import ts from 'typescript';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { registerLocalMetadataRoute, type LocalMetadataRouteDependencies } from '../server/local_metadata_route.ts';
import { LegacyConfigurationBoundary } from '../core/network/legacy_configuration_boundary.ts';
import { MetadataWriteConflictError } from '../shared/metadata_write_context.ts';
import { ReportService } from '../core/reporting/report_service.ts';
import { SupportBundleBuilder } from '../core/readiness/support_bundle.ts';
import type { Device } from '../types/index.ts';

// Pure in-memory stores and the actual shared synchronous route registration.
// No server composition, listener, providers, filesystem output or network calls.
let passed=0;
function check(name:string,run:()=>void){run();passed++;console.log('PASS '+name);}
const db=new SiteProjectDatabase('ISOLATED_TEST');
const boundary=new LegacyConfigurationBoundary(db);
const camera=(id:string,mac:string):Device=>({id,anchor:{macAddress:mac,vendor:'Synthetic'},
  network:{ipAddress:'192.0.2.50',subnetMask:'255.255.255.0',port:80,protocol:'ONVIF',ipAddressHistory:[]},
  technician:{name:'Original',location:'Lobby',notes:'Original notes'},status:'UNKNOWN',sessionVerification:'NOT_VERIFIED',
  evidenceProvenance:'SYNTHETIC_TEST',discoveredPhase:3,firstSeenAt:'fixture',lastSeenAt:'fixture'});
function seed(){db.upsertDevice(camera('shared','00:11:22:33:44:50'));db.upsertDevice(camera('neighbor','00:11:22:33:44:52'));}
db.createNewProject('A');seed();
const current=()=>db.getMetadataWriteContext();
const snapshot=()=>JSON.stringify(db.getSession());
const payload=(context:unknown,value='Changed')=>({metadataWriteContext:context,technician:{location:value}});
let lookups=0,audits=0,broadcasts=0;
const trace:string[]=[],auditEntries:unknown[]=[],broadcastEvents:unknown[]=[];
const lookup=db.getDeviceByIdentifier.bind(db);
db.getDeviceByIdentifier=(id:string)=>{lookups++;return lookup(id);};

const source=readFileSync('src/server/backend_application.ts','utf8');
const routeSource=readFileSync('src/server/local_metadata_route.ts','utf8');
const tree=ts.createSourceFile('route.ts',routeSource,ts.ScriptTarget.Latest,true);
let callback:ts.Expression|undefined;
function visit(node:ts.Node){
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)
    &&node.expression.expression.getText(tree)==='app'&&node.expression.name.text==='post'
    &&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='/api/device/:identifier/config')callback=node.arguments[1];
  ts.forEachChild(node,visit);
}
visit(tree);assert.ok(callback&&ts.isArrowFunction(callback)&&!callback.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword));
const code=callback.getText(tree);
function capture(dependencies:LocalMetadataRouteDependencies){
  const registrations:Array<{path:string;handler:RequestHandler}>=[];
  const app={post(path:string,handler:RequestHandler){registrations.push({path,handler});return this;}};
  registerLocalMetadataRoute(app as unknown as Pick<Express,'post'>,dependencies);
  assert.equal(registrations.length,1);assert.equal(registrations[0].path,'/api/device/:identifier/config');
  return registrations[0].handler;
}
const handler=capture({projectDb:db,legacyConfigurationBoundary:{updateLocalMetadata(id,body){trace.push('boundary');return boundary.updateLocalMetadata(id,body);}},
  logAudit(entry){trace.push('audit');audits++;auditEntries.push(entry);},
  broadcast(event){trace.push('broadcast');broadcasts++;broadcastEvents.push(event);}});
function request(body:unknown,id='shared'){
  const response={statusCode:200,body:null as any,status(code:number){this.statusCode=code;return this;},json(value:unknown){trace.push('response');this.body=value;return this;}};
  handler({params:{identifier:id},body} as unknown as Parameters<RequestHandler>[0],response as unknown as Parameters<RequestHandler>[1],()=>{throw Error('Unexpected next');});return response;
}
function denied(name:string,body:unknown){check(name,()=>{
  const before=snapshot(),counts=[lookups,audits,broadcasts];
  const response=request(body,'does-not-exist');
  assert.equal(response.statusCode,409);assert.equal(response.body.code,'METADATA_PROJECT_CONFLICT');
  assert.equal(response.body.status,'CONFLICT');assert.match(response.body.error,/Refresh.*review/);
  assert.equal(snapshot(),before);assert.deepEqual([lookups,audits,broadcasts],counts);
});}

check('shared registration installs exactly one POST handler and returns no authority',()=>{
  let calls=0;
  const app={post(path:string,registered:RequestHandler){calls++;assert.equal(path,'/api/device/:identifier/config');assert.equal(typeof registered,'function');return this;}};
  const result=registerLocalMetadataRoute(app as unknown as Pick<Express,'post'>,{projectDb:db,legacyConfigurationBoundary:boundary,logAudit(){},broadcast(){}});
  assert.equal(calls,1);assert.equal(result,undefined);
});
check('moved callback matches pre-extraction handler AST with only audit collaborator renamed',()=>{
  const normalized=ts.createPrinter({newLine:ts.NewLineKind.LineFeed}).printFile(ts.createSourceFile('handler.ts',code,ts.ScriptTarget.Latest,true));
  // Captured from committed 27d6127 before extraction, after appStateDb.logAudit -> logAudit.
  assert.equal(createHash('sha256').update(normalized).digest('hex'),'8d9bf79f0bd7fb27377e7858fd8bc1b221739204c285bd7acbbc751dbdfa3f4f');
});
denied('absent request body retains typed conflict',undefined);

check('versioned context is a detached, stable runtime projection',()=>{
  const one=current();assert.deepEqual(db.getSession().metadataWriteContext,one);
  one.projectId='forged';assert.notEqual(current().projectId,'forged');assert.deepEqual(current(),db.getSession().metadataWriteContext);
});
const malformed:unknown[]=[undefined,null,[],{}, {...current(),version:2},{...current(),extra:true},
  {...current(),projectId:'wrong'},{...current(),mode:'QUICK_WORK'}, {...current(),generation:'forged'},
  {...current(),generation:'00000000-0000-4000-8000-000000000000'}];
malformed.forEach((context,i)=>denied('missing/malformed/mismatched context '+i,payload(context)));
for(const [field,value] of [['name','  Exact Name  '],['location','  Exact Location  '],['notes','  Exact Notes  '],['location','']] as const){
  check('current context writes exact '+field+' '+JSON.stringify(value),()=>{
    const before=current(),neighbor=JSON.stringify(db.getDeviceById('neighbor'));
    const response=request({metadataWriteContext:before,technician:{[field]:value}});
    assert.equal(response.statusCode,200);assert.equal(response.body.status,'LOCAL_METADATA_UPDATED');
    assert.equal(db.getDeviceById('shared')?.technician?.[field],value);assert.equal(JSON.stringify(db.getDeviceById('neighbor')),neighbor);
    assert.deepEqual(current(),before);
  });
}
check('success retains audit/broadcast/acknowledgment contents and ordering',()=>{
  trace.length=0;const response=request(payload(current(),'Ordered update'));
  assert.deepEqual(trace,['boundary','audit','broadcast','response']);assert.equal(response.statusCode,200);
  const audit=auditEntries.at(-1) as any,event=broadcastEvents.at(-1) as any;
  assert.equal(audit.category,'SYSTEM');assert.equal(audit.level,'INFO');assert.equal(audit.message,'Local technician metadata updated.');assert.equal(audit.deviceId,'shared');
  assert.match(audit.id,/^[0-9a-f-]{36}$/);assert.ok(Number.isFinite(Date.parse(audit.timestamp)));
  assert.equal(event.type,'DEVICE_METADATA_UPDATED');assert.deepEqual(event.data.project,db.getProject());assert.deepEqual(event.data.device,response.body.device);
});
for(const failure of [Error('Fixture failure'),{untrusted:'not an Error'}])check('existing generic error response '+(failure instanceof Error?'message':'fallback'),()=>{
  const failedHandler=capture({projectDb:db,legacyConfigurationBoundary:{updateLocalMetadata(){throw failure;}},logAudit(){throw Error('Unexpected audit');},broadcast(){throw Error('Unexpected broadcast');}});
  const response={statusCode:200,body:null as any,status(code:number){this.statusCode=code;return this;},json(body:unknown){this.body=body;return this;}};
  const before=snapshot();failedHandler({params:{identifier:'shared'},body:payload(current())} as unknown as Parameters<RequestHandler>[0],response as unknown as Parameters<RequestHandler>[1],()=>{throw Error('Unexpected next');});
  assert.equal(response.statusCode,400);assert.equal(response.body.status,'UNAVAILABLE');
  assert.equal(response.body.error,failure instanceof Error?failure.message:'Local metadata could not be updated.');assert.equal(snapshot(),before);
});
check('physical configuration remains rejected with valid context',()=>{
  const before=snapshot(),counts=[audits,broadcasts];const response=request({...payload(current()),network:{}});
  assert.equal(response.statusCode,410);assert.equal(snapshot(),before);assert.deepEqual([audits,broadcasts],counts);
});
check('unknown identity still rejects with valid context',()=>{
  const before=snapshot();assert.equal(request(payload(current()),'unknown').statusCode,404);assert.equal(snapshot(),before);
});
check('non-string metadata remains rejected with valid context',()=>{
  const before=snapshot();assert.equal(request({metadataWriteContext:current(),technician:{location:123}}).statusCode,400);assert.equal(snapshot(),before);
});
check('polling and save-content do not rotate generation or persist context',()=>{
  const before=current();for(let i=0;i<3;i++)db.getSession();const saved=db.exportProjectJsonForSave();
  assert.deepEqual(current(),before);assert.ok(!saved.includes(before.generation)&&!saved.includes('metadataWriteContext'));
  assert.ok(!JSON.stringify(db.getProject().auditLogs).includes(before.generation));
  const reports=new ReportService(),model=reports.build(db.getSession(),[],{type:'DEVICE_INVENTORY',scope:'ALL'});
  for(const output of [reports.json(model),reports.csv(model),reports.pdf(model).toString('latin1')]){
    assert.ok(!output.includes(before.generation)&&!output.includes('metadataWriteContext'));
  }
  const support=new SupportBundleBuilder().build({application:{name:'Fixture',version:'fixture',runtime:'fixture',platform:'fixture'},
    readiness:{},network:[],monitoring:{},discovery:{},projectSession:db.getSession(),events:[],pair:null});
  assert.ok(!JSON.stringify(support).includes(before.generation)&&!JSON.stringify(support).includes('metadataWriteContext'));
});
const original=current(),savedA=db.exportProjectJson();
db.createNewProject('B');seed();denied('A request denied after B switch despite reused device ID',payload(original));
db.importProjectJson(savedA);denied('A-B-A does not restore original generation',payload(original));
let old=current();db.importProjectJson(savedA);denied('same-ID reopen invalidates context',payload(old));
old=current();db.startQuickWork();seed();denied('Project to Quick Work invalidates context',payload(old));
old=current();db.startQuickWork();seed();denied('Quick Work replacement invalidates context',payload(old));
old=current();db.createProjectFromCurrentResults('From current');denied('from-current replacement invalidates context',payload(old));
check('new store cannot accept a prior store context even for same saved project',()=>{
  const other=new SiteProjectDatabase('ISOLATED_TEST');other.importProjectJson(savedA);
  const issuer=new SiteProjectDatabase('ISOLATED_TEST');issuer.importProjectJson(savedA);const issued=issuer.getMetadataWriteContext();
  assert.equal(issued.projectId,other.getProject().id);assert.notEqual(issued.generation,other.getMetadataWriteContext().generation);
  assert.throws(()=>new LegacyConfigurationBoundary(other).updateLocalMetadata('shared',payload(issued)),MetadataWriteConflictError);
});
check('same-generation concurrent/repeated writes retain existing last-write semantics',()=>{
  const context=current();request(payload(context,'First'));request(payload(context,'Second'));
  assert.equal(db.getDeviceById('shared')?.technician?.location,'Second');assert.deepEqual(current(),context);
});
check('authentication remains before the handler; conflict exits before success effects',()=>{
  const mount='registerLocalMetadataRoute(app, {projectDb,legacyConfigurationBoundary,logAudit:entry=>appStateDb.logAudit(entry),broadcast});';
  assert.equal(source.split(mount).length-1,1);
  assert.ok(source.indexOf("app.use('/api', authentication.http)")<source.indexOf(mount));
  assert.ok(source.indexOf('app.use(express.json())')<source.indexOf(mount));
  assert.ok(source.indexOf("app.get('/api/device/:identifier/config'")<source.indexOf(mount));
  assert.ok(source.indexOf(mount)<source.indexOf("app.post('/api/device/:identifier/ptz'"));
  assert.ok(!source.includes("app.post('/api/device/:identifier/config',"));
  assert.ok(source.includes("import { registerLocalMetadataRoute } from './local_metadata_route.ts';"));
  assert.ok(source.includes('const authentication = new ProductionAuthenticationBoundary();'));
  assert.ok(!routeSource.includes('ProductionAuthenticationBoundary'));
  assert.ok(!code.includes('await '));assert.ok(!code.includes('saveProject'));
});
console.log(JSON.stringify({passed,failed:0,listeners:0,children:0,temporaryRoots:0}));
