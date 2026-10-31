import assert from 'node:assert/strict';
import test from 'node:test';
import { getEventListeners } from 'node:events';
import { createServer, request } from 'node:http';
import type { Socket } from 'node:net';
import express, { type Request, type Response } from 'express';
import { ProductionAuthenticationBoundary } from '../server/production_authentication_boundary.ts';
import { CompanionBootstrapAuthority } from '../server/companion_bootstrap_authority.ts';
import type { AuthorityReceipt } from '../server/application_session_authority.ts';
import type { CompanionLifetime, CompanionLoss } from '../server/application_companion_supervisor.ts';
import { validateHttpHost } from '../server/http_host_validation.ts';
import { SiteProjectDatabase, ProjectValidationError } from '../core/storage/project_db.ts';
import { ProjectOpenAdmissionCoordinatorPrototype as Coordinator,
  type OpenAdmissionInput, type OpenAdmissionDisposition } from '../core/projects/project_open_admission_coordinator_prototype.ts';
import { activateProjectImportOnce } from './support/project_open_import_adapter.ts';

// Fixture-local routes only. No production backend composition, UI, Save, WS or files.
// Same documented trusted private-channel model as local_metadata_authenticated_http.test.ts.
async function activeFixtureOwner(){
  let bootstrap='',token='',alive=true;
  let lose!:(reason:CompanionLoss)=>void;
  const lost=new Promise<CompanionLoss>(resolve=>{lose=resolve;});
  const transport:CompanionLifetime={
    pid:1,brokerPid:2,generation:1,get alive(){return alive;},lost,
    closed:lost.then(()=>true),failureCode:lost.then(()=>undefined),
    async deliverBootstrap(value){bootstrap=JSON.parse(value).token;},async activateBootstrap(){},
    async requestBootstrapRedemption(){return bootstrap;},async deliverSession(value){token=value;},
    async activateSession(){},async logoutSession(){},
    async shutdown(){alive=false;bootstrap='';token='';lose('closed');},
  };
  const owner=Reflect.construct(CompanionBootstrapAuthority,[transport,Date.now,()=>0]) as CompanionBootstrapAuthority;
  try{await owner.issueBootstrap();await owner.deliverSession();}catch(error){await owner.dispose();throw error;}
  return {owner,token:()=>token,alive:()=>alive};
}
function deferred(){
  let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};
}
const entered=(gate:{entered:ReturnType<typeof deferred>},pending:Promise<Reply>)=>Promise.race([
  gate.entered.promise,pending.then(()=>{throw Error('Request ended before controlled activation gate');}),
]);
const synthetic=(id='http-project-b')=>JSON.stringify({id,name:'Synthetic HTTP project',siteLocation:'Synthetic site',
  createdAt:'2026-10-31T12:00:00Z',updatedAt:'2026-10-31T12:00:00Z',totalDevices:1,
  collisions:[],rogueDhcpEvents:[],auditLogs:[],devices:[{
    id:'shared-synthetic-camera',anchor:{macAddress:'00:11:22:33:44:50',onvifEndpointUuid:'http-synthetic-uuid',vendor:'Synthetic'},
    network:{ipAddress:'192.0.2.50',subnetMask:'255.255.255.0',port:80,protocol:'ONVIF',ipAddressHistory:['192.0.2.50']},
    technician:{name:'Synthetic Name',location:'  Synthetic Location  ',notes:'Synthetic Notes'},
    status:'ONLINE',sessionVerification:'VERIFIED',reachability:{lastSuccessfulResponseAt:'2026-10-31T12:00:00Z'},
    diagnostics:{checks:[]},telemetry:{},evidenceProvenance:'SYNTHETIC_TEST',discoveredPhase:3,
    firstSeenAt:'2026-10-31T12:00:00Z',lastSeenAt:'2026-10-31T12:00:00Z',
  }]});
type Reply={kind:'response';status:number;body:Record<string,any>}|{kind:'transport-error'};
const epoch='http-fixture-epoch';
const summaries:Array<{requests:number;imports:number;operations:number;sockets:number;closed:boolean}>=[];
function httpStatus(value:Readonly<OpenAdmissionDisposition>):number{
  if(value.status==='ADMITTED')return 200;
  if(value.status==='PENDING')return 202;
  if(value.status==='REJECTED_BEFORE_ACTIVATION')return value.reason==='VALIDATION_REJECTED'?400:409;
  return {NOT_FOUND:404,EPOCH_MISMATCH:409,INVALID_INPUT:400,CAPACITY_EXHAUSTED:503,IDENTITY_CONFLICT:409,ACTIVATION_UNCERTAIN:503}[value.reason];
}
function response(reply:Reply,status:number){
  assert.equal(reply.kind,'response');assert.ok(reply.kind==='response');
  assert.equal(reply.status,status);return reply.body;
}

async function fixture(options:{capacity?:number;viewFailure?:boolean}={}){
  // This instance never escapes; all identity-changing writes after seeding use the adapter.
  const store=new SiteProjectDatabase('ISOLATED_TEST');store.importProjectJson(synthetic('http-project-a'));
  const originalImport=store.importProjectJson,originalView=store.getProject,initialIdentity=store.getSessionGeneration();
  let imports=0,closing=false,closed=false,viewFailure=Boolean(options.viewFailure);
  store.importProjectJson=function(text){imports++;return originalImport.call(this,text);};
  store.getProject=function(){
    if(viewFailure&&this.getSessionGeneration()!==initialIdentity)throw new ProjectValidationError('Synthetic post-commit view failure');
    return originalView.call(this);
  };
  const authorized=await activeFixtureOwner();
  let foreign:Awaited<ReturnType<typeof activeFixtureOwner>>|undefined;
  const authentication=new ProductionAuthenticationBoundary({owner:authorized.owner});
  const gates=new Map<string,{entered:ReturnType<typeof deferred>;release:ReturnType<typeof deferred>}>();
  const receipts=new Map<string,AuthorityReceipt>(),registered=new Set<string>(),registrations=new Map<string,ReturnType<typeof deferred>>();
  const drops=new Set<string>(),work=new Set<Promise<unknown>>(),handlers=new Set<Promise<unknown>>(),clients=new Set<Promise<Reply>>();
  const planned:string[]=[],observed:string[]=[],unexpected:string[]=[],sockets=new Set<Socket>();
  let requests=0;
  function track<T>(set:Set<Promise<unknown>>,promise:Promise<T>):Promise<T>{
    set.add(promise);void promise.then(()=>set.delete(promise),()=>set.delete(promise));return promise;
  }
  const coordinator=new Coordinator({epoch,capacity:options.capacity??4,currentGeneration:()=>store.getMetadataWriteContext().generation,
    activate:async input=>{
      // Controlled test ordering is BEFORE the proven synchronous adapter, not a hidden write.
      const gate=gates.get(input.attemptId);
      if(gate){gate.entered.resolve();await gate.release.promise;}
      if(closing)throw Error('Fixture activation unavailable.');
      const receipt=receipts.get(input.attemptId);if(!receipt)throw Error('Fixture activation unavailable.');
      CompanionBootstrapAuthority.prototype.authorizeFixtureReceipt.call(authorized.owner,receipt);
      return activateProjectImportOnce(store,input,ProjectValidationError);
    }});
  function receipt(req:Request){
    if(closing)throw Error('Fixture closing.');
    const header=req.headers.authorization;
    if(typeof header!=='string'||!header.startsWith('Bearer '))throw Error('Fixture authorization unavailable.');
    const value=CompanionBootstrapAuthority.prototype.validateSession.call(authorized.owner,header.slice(7));
    CompanionBootstrapAuthority.prototype.authorizeFixtureReceipt.call(authorized.owner,value);return value;
  }
  function route(action:(req:Request,res:Response)=>Promise<void>){
    return (req:Request,res:Response)=>{
      const pending=action(req,res).catch(()=>{
        unexpected.push('fixture handler failure');if(!res.destroyed&&!closing)res.status(500).json({error:'Fixture contract unavailable.'});
      });
      track(handlers,pending);
    };
  }
  function send(res:Response,value:Readonly<OpenAdmissionDisposition>,drop=false){
    if(drop){res.destroy();return;}
    if(!closing&&!res.destroyed)res.status(httpStatus(value)).json(value);
  }
  const app=express();
  app.use(validateHttpHost);app.use('/api',authentication.http);
  app.use(express.json({limit:32768}));
  app.post('/api/project/open',route(async(req,res)=>{
    const authority=receipt(req),body=req.body;
    assert.ok(body&&typeof body.epoch==='string'&&typeof body.attemptId==='string'
      &&typeof body.originatingGeneration==='string'&&typeof body.payload==='string');
    if(!receipts.has(body.attemptId))receipts.set(body.attemptId,authority);
    const pending=track(work,coordinator.admit(body));registered.add(body.attemptId);registrations.get(body.attemptId)?.resolve();
    send(res,await pending,drops.has(body.attemptId));
  }));
  app.get('/api/project/open-attempts/:id',route(async(req,res)=>{
    receipt(req);assert.equal(typeof req.query.epoch,'string');
    send(res,coordinator.status({epoch:String(req.query.epoch),attemptId:req.params.id}));
  }));
  app.post('/api/project/open-attempts/:id/settle',route(async(req,res)=>{
    receipt(req);assert.equal(typeof req.body?.epoch,'string');
    send(res,await track(work,coordinator.settle({epoch:req.body.epoch,attemptId:req.params.id})));
  }));
  app.use((_req,res)=>{unexpected.push('unmatched route');res.sendStatus(404);});
  const server=createServer((req,res)=>{
    const signature=req.method+' '+req.url;
    if(closing||req.socket.remoteAddress!=='127.0.0.1'||signature!==planned[observed.length]){
      unexpected.push('unplanned request');req.socket.destroy();return;
    }
    observed.push(signature);app(req,res);
  });
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  server.on('upgrade',(_req,socket)=>{unexpected.push('upgrade');socket.destroy();});
  server.on('clientError',(_error,socket)=>{unexpected.push('protocol error');socket.destroy();});
  async function close(){
    if(closed)return;
    closing=true;authentication.dispose();
    const listenerClosed=server.listening?new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())):Promise.resolve();
    // All gates are controlled and always released; closure is not cancellation proof.
    for(const gate of gates.values())gate.release.resolve();
    await Promise.allSettled([...work,...handlers]);
    const socketClosures=[...sockets].map(socket=>new Promise<void>(resolve=>socket.once('close',()=>resolve())));
    for(const socket of sockets)socket.destroy();
    await Promise.all([listenerClosed,...socketClosures]);await Promise.allSettled([...clients]);
    await authorized.owner.dispose();await foreign?.owner.dispose();
    await new Promise<void>(resolve=>setImmediate(resolve));
    store.importProjectJson=originalImport;store.getProject=originalView;
    assert.equal(work.size,0);assert.equal(handlers.size,0);assert.equal(clients.size,0);assert.equal(sockets.size,0);
    assert.equal(server.listening,false);assert.equal(server.address(),null);
    assert.equal(authorized.alive(),false);assert.ok(!foreign||!foreign.alive());
    assert.equal(getEventListeners(authorized.owner.boundaryEnded,'abort').length,0);
    assert.deepEqual(unexpected,[]);assert.deepEqual(observed,planned);closed=true;
    summaries.push({requests,imports,operations:work.size+handlers.size,sockets:sockets.size,closed});
  }
  try{await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});}
  catch(error){await close();throw error;}
  const address=server.address();assert.ok(address&&typeof address!=='string');assert.equal(address.address,'127.0.0.1');
  const port=address.port;
  async function exchange(method:'GET'|'POST',path:string,body:unknown,credentials:'active'|'none'|'foreign'='active'):Promise<Reply>{
    assert.ok(!closing);assert.ok(++requests<=100);assert.match(path,/^\/api\/project\/(open$|open-attempts\/[-A-Za-z0-9_]+(?:\?epoch=[-A-Za-z0-9_]+|\/settle)$)/);
    if(credentials==='foreign'&&!foreign)foreign=await activeFixtureOwner();
    const text=body===undefined?'':JSON.stringify(body);assert.ok(Buffer.byteLength(text)<=16384);
    const token=credentials==='active'?authorized.token():credentials==='foreign'?foreign!.token():undefined;
    planned.push(method+' '+path);
    const pending=new Promise<Reply>(resolve=>{
      const req=request({host:'127.0.0.1',port,method,path,agent:false,timeout:2000,
        headers:{Host:'localhost:3001',Origin:'http://localhost:3001',Connection:'close','Content-Type':'application/json',
          'Content-Length':Buffer.byteLength(text),...(token?{Authorization:'Bearer '+token}:{})}},res=>{
        let output='';
        res.on('error',()=>resolve({kind:'transport-error'}));res.on('aborted',()=>resolve({kind:'transport-error'}));
        res.on('data',chunk=>{output+=String(chunk);if(Buffer.byteLength(output)>65536){unexpected.push('response bound');res.destroy();}});
        res.on('end',()=>{
          try{assert.equal(res.headers['cache-control'],'no-store');assert.match(String(res.headers['content-type']),/application\/json/);
            resolve({kind:'response',status:res.statusCode!,body:JSON.parse(output)});}
          catch{unexpected.push('invalid response');resolve({kind:'transport-error'});}
        });
      });
      req.on('error',()=>resolve({kind:'transport-error'}));req.on('timeout',()=>{unexpected.push('HTTP timeout');req.destroy();});req.end(text);
    });
    clients.add(pending);void pending.then(()=>clients.delete(pending));return pending;
  }
  return {
    input:(id='attempt-a',payload=synthetic()):OpenAdmissionInput=>({epoch,attemptId:id,payload,originatingGeneration:store.getMetadataWriteContext().generation}),
    admit:(input:OpenAdmissionInput,auth:'active'|'none'|'foreign'='active')=>exchange('POST','/api/project/open',input,auth),
    status:(id:string,value=epoch,auth:'active'|'none'|'foreign'='active')=>exchange('GET','/api/project/open-attempts/'+id+'?epoch='+value,undefined,auth),
    settle:(id:string,value=epoch,auth:'active'|'none'|'foreign'='active')=>exchange('POST','/api/project/open-attempts/'+id+'/settle',{epoch:value},auth),
    snapshot:()=>structuredClone(store.getSession()),imports:()=>imports,requests:()=>requests,
    peek:(id:string)=>coordinator.status({epoch,attemptId:id}),
    gate:(id:string)=>{assert.ok(!gates.has(id));const gate={entered:deferred(),release:deferred()};gates.set(id,gate);return gate;},
    registered:(id:string)=>{if(registered.has(id))return Promise.resolve();let signal=registrations.get(id);if(!signal){signal=deferred();registrations.set(id,signal);}return signal.promise;},
    dropResponse:(id:string)=>drops.add(id),clearViewFailure:()=>{viewFailure=false;},
    loseAuthority:()=>authorized.owner.dispose(),
    drain:()=>Promise.allSettled([...work,...handlers]),
    close,isClosed:()=>closed,
  };
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function isolated(run:(f:Fixture)=>Promise<void>,options:Parameters<typeof fixture>[0]={}){
  const f=await fixture(options);try{await run(f);}finally{await f.close();}
}

await test('fixture-local authenticated Project Open admission/status/settlement',{timeout:20000},async t=>{
  await t.test('admission reports actual generation and reopens historical evidence as unverified',()=>isolated(async f=>{
    const input=f.input(),result=response(await f.admit(input),200),session=f.snapshot(),device=session.project.devices[0];
    assert.equal(result.status,'ADMITTED');assert.equal(result.projectId,session.project.id);
    assert.equal(result.activatedGeneration,session.metadataWriteContext?.generation);assert.notEqual(result.activatedGeneration,input.originatingGeneration);
    assert.equal(f.imports(),1);assert.equal(session.dirty,false);assert.equal(device.status,'UNKNOWN');assert.equal(device.sessionVerification,'NOT_VERIFIED');
    assert.equal(device.savedStatusSnapshot,'ONLINE');assert.equal(device.reachability,undefined);assert.equal(device.diagnostics,undefined);assert.equal(device.telemetry,undefined);
    assert.equal(device.technician?.location,'  Synthetic Location  ');assert.equal(device.technician?.notes,'Synthetic Notes');
  }));
  await t.test('validation rejection preserves the prior store',()=>isolated(async f=>{
    const before=f.snapshot(),input=f.input('attempt-a','{'),result=response(await f.admit(input),400);
    assert.equal(result.status,'REJECTED_BEFORE_ACTIVATION');assert.equal(result.reason,'VALIDATION_REJECTED');
    assert.deepEqual(f.snapshot(),before);assert.equal(f.imports(),1);
  }));
  await t.test('identical replay and settlement preserve one admitted activation',()=>isolated(async f=>{
    const input=f.input(),first=response(await f.admit(input),200),state=f.snapshot();
    assert.deepEqual(response(await f.admit(input),200),first);assert.deepEqual(response(await f.status(input.attemptId),200),first);
    assert.deepEqual(response(await f.settle(input.attemptId),200),first);assert.equal(f.imports(),1);assert.deepEqual(f.snapshot(),state);
  }));
  await t.test('conflicting identity payload does not replace the original record',()=>isolated(async f=>{
    const input=f.input(),first=response(await f.admit(input),200),before=f.snapshot();
    const conflict=response(await f.admit({...input,payload:synthetic('different-project')}),409);
    assert.equal(conflict.status,'UNKNOWN');assert.equal(conflict.reason,'IDENTITY_CONFLICT');
    assert.deepEqual(response(await f.status(input.attemptId),200),first);assert.equal(f.imports(),1);assert.deepEqual(f.snapshot(),before);
  }));
  await t.test('overlapping attempts expose PENDING and respect generation ordering',()=>isolated(async f=>{
    const a=f.input(),b=f.input('attempt-b',synthetic('project-c')),gate=f.gate(a.attemptId);
    const first=f.admit(a);await entered(gate,first);
    const second=f.admit(b);await Promise.race([f.registered(b.attemptId),second.then(()=>{throw Error('Second request ended before registration');})]);
    assert.equal(response(await f.status(a.attemptId),202).status,'PENDING');assert.equal(response(await f.status(b.attemptId),202).status,'PENDING');
    assert.equal(f.imports(),0);gate.release.resolve();assert.equal(response(await first,200).status,'ADMITTED');
    const stale=response(await second,409);assert.equal(stale.status,'REJECTED_BEFORE_ACTIVATION');assert.equal(stale.reason,'STALE_GENERATION');assert.equal(f.imports(),1);
  }));
  await t.test('settlement before delayed admission creates a protective tombstone',()=>isolated(async f=>{
    const input=f.input(),before=f.snapshot(),settled=response(await f.settle(input.attemptId),409);
    assert.equal(settled.status,'REJECTED_BEFORE_ACTIVATION');assert.equal(settled.reason,'SETTLED_BEFORE_ARRIVAL');
    assert.deepEqual(response(await f.admit(input),409),settled);assert.equal(f.imports(),0);assert.deepEqual(f.snapshot(),before);
  }));
  await t.test('unknown identity is not terminal rejection',()=>isolated(async f=>{
    const before=f.snapshot(),unknown=response(await f.status('absent-attempt'),404);
    assert.equal(unknown.status,'UNKNOWN');assert.equal(unknown.reason,'NOT_FOUND');assert.equal(f.imports(),0);assert.deepEqual(f.snapshot(),before);
  }));
  await t.test('stale epoch admission and settlement cannot reserve or activate',()=>isolated(async f=>{
    const input=f.input(),before=f.snapshot();
    for(const result of [response(await f.admit({...input,epoch:'old-epoch'}),409),response(await f.settle(input.attemptId,'old-epoch'),409)])
      {assert.equal(result.status,'UNKNOWN');assert.equal(result.reason,'EPOCH_MISMATCH');}
    assert.equal(response(await f.status(input.attemptId),404).reason,'NOT_FOUND');assert.equal(f.imports(),0);assert.deepEqual(f.snapshot(),before);
  }));
  await t.test('capacity exhaustion retains the existing rejection tombstone',()=>isolated(async f=>{
    const first=response(await f.settle('attempt-a'),409),before=f.snapshot();
    for(const result of [response(await f.admit(f.input('attempt-b')),503),response(await f.settle('attempt-b'),503)])
      {assert.equal(result.status,'UNKNOWN');assert.equal(result.reason,'CAPACITY_EXHAUSTED');}
    assert.deepEqual(response(await f.status('attempt-a'),409),first);assert.deepEqual(response(await f.admit(f.input()),409),first);
    assert.equal(f.imports(),0);assert.deepEqual(f.snapshot(),before);
  },{capacity:1}));
  await t.test('post-commit view failure remains UNKNOWN',()=>isolated(async f=>{
    const result=response(await f.admit(f.input()),503);assert.equal(result.status,'UNKNOWN');assert.equal(result.reason,'ACTIVATION_UNCERTAIN');
    f.clearViewFailure();assert.equal(f.snapshot().project.id,'http-project-b');assert.equal(f.imports(),1);
    assert.equal(response(await f.settle('attempt-a'),503).status,'UNKNOWN');
  },{viewFailure:true}));
  await t.test('missing and foreign authentication deny admission, status and settlement independently',()=>isolated(async f=>{
    const before=f.snapshot(),input=f.input();
    for(const auth of ['none','foreign'] as const){
      for(const result of [response(await f.admit(input,auth),401),response(await f.status(input.attemptId,epoch,auth),401),response(await f.settle(input.attemptId,epoch,auth),401)])
        assert.deepEqual(result,{error:'Application authentication unavailable.'});
    }
    assert.equal(f.peek(input.attemptId).status,'UNKNOWN');assert.equal(f.imports(),0);assert.deepEqual(f.snapshot(),before);
  }));
  await t.test('authority loss before queued activation prevents actual import',()=>isolated(async f=>{
    const input=f.input(),before=f.snapshot(),gate=f.gate(input.attemptId),pending=f.admit(input);
    await entered(gate,pending);await f.loseAuthority();gate.release.resolve();await f.drain();
    assert.equal((await pending).kind,'transport-error');assert.equal(f.peek(input.attemptId).status,'UNKNOWN');
    assert.equal(f.imports(),0);assert.deepEqual(f.snapshot(),before);
  }));
  await t.test('lost response is resolved through status and settlement without admission replay',()=>isolated(async f=>{
    const input=f.input();f.dropResponse(input.attemptId);
    assert.equal((await f.admit(input)).kind,'transport-error');
    const result=response(await f.status(input.attemptId),200);assert.equal(result.status,'ADMITTED');
    assert.deepEqual(response(await f.settle(input.attemptId),200),result);assert.equal(f.imports(),1);assert.equal(f.requests(),3);
  }));
  await t.test('teardown drains controlled pending work before releasing fixture ownership',async()=>{
    const f=await fixture(),before=f.snapshot(),input=f.input(),gate=f.gate(input.attemptId),pending=f.admit(input);
    try{
      await entered(gate,pending);await f.close();assert.equal((await pending).kind,'transport-error');
      assert.equal(f.imports(),0);assert.deepEqual(f.snapshot(),before);assert.equal(f.isClosed(),true);
      assert.equal(f.peek(input.attemptId).status,'UNKNOWN');
    }finally{await f.close();}
  });
  assert.equal(summaries.length,14);assert.ok(summaries.every(s=>s.closed&&s.operations===0&&s.sockets===0));
  console.log(JSON.stringify({fixtures:summaries.length,requests:summaries.reduce((sum,s)=>sum+s.requests,0),
    allOwnedActivityClosed:true,listenersRemaining:0,socketsRemaining:0,operationsRemaining:0,temporaryRoots:0,projectFiles:0}));
});
