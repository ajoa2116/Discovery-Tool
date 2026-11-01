import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer,request} from 'node:http';
import type {Socket} from 'node:net';
import {promises as fs} from 'node:fs';
import express from 'express';
import {ProductionAuthenticationBoundary} from '../server/production_authentication_boundary.ts';
import {CompanionBootstrapAuthority} from '../server/companion_bootstrap_authority.ts';
import type {CompanionLifetime,CompanionLoss} from '../server/application_companion_supervisor.ts';
import {validateHttpHost} from '../server/http_host_validation.ts';
import {registerProjectExportRoutes} from '../server/project_export_routes.ts';
import {createProtectedProjectStore,claimProjectReplacementAuthority,ProjectValidationError} from '../core/storage/project_db.ts';
// Genuine authority-issued receipts, using the documented private-channel fixture.
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
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};}
const paths=['/api/project/save-content','/api/project/save','/api/project/export'];
const synthetic=JSON.stringify({id:'export-project-a',name:'Synthetic A',siteLocation:'Synthetic',createdAt:'fixture',updatedAt:'fixture',devices:[],totalDevices:0,collisions:[],rogueDhcpEvents:[],auditLogs:[]});
const summaries:Array<{requests:number;sockets:number;work:number;closed:boolean}>=[];
async function fixture(){
  const store=createProtectedProjectStore('ISOLATED_TEST'),authority=claimProjectReplacementAuthority(store);
  authority.importProjectJson(synthetic);store.appendHistory({type:'PROJECT_CREATED',title:'Synthetic edit',summary:'Synthetic dirty state'});
  const auth=await activeFixtureOwner(),foreign=await activeFixtureOwner();
  const boundary=new ProductionAuthenticationBoundary({owner:auth.owner}),app=express(),sockets=new Set<Socket>();
  const observed:string[]=[],planned:string[]=[],work=new Set<Promise<unknown>>();let closing=false;
  app.use(validateHttpHost);app.use('/api',boundary.http);app.use(express.json({limit:16384}));
  // Mount the actual production route implementation, not a copy or auth bypass.
  registerProjectExportRoutes(app,authority,()=>{});
  const server=createServer((req,res)=>{const signature=req.method+' '+req.url;
    assert.equal(closing,false);assert.equal(req.socket.remoteAddress,'127.0.0.1');
    assert.equal(signature,planned[observed.length]);observed.push(signature);app(req,res);
  });
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  server.on('upgrade',(_req,socket)=>{socket.destroy();assert.fail('Unexpected upgrade');});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const port=address.port;
  async function send(path:string,context:unknown,credentials:'active'|'none'|'foreign'='active'){
    assert.ok(paths.includes(path));assert.ok(planned.length<100);
    const method=path.endsWith('/export')?'GET':'POST',body=method==='GET'?'':JSON.stringify({metadataWriteContext:context,...(path.endsWith('/save')?{filePath:'synthetic-output.cctvproj'}:{})});
    planned.push(method+' '+path);
    const token=credentials==='active'?auth.token():credentials==='foreign'?foreign.token():undefined;
    const pending=new Promise<{status:number;body:any;attachment:boolean} >((resolve,reject)=>{
      const req=request({host:'127.0.0.1',port,method,path,agent:false,timeout:3000,
        headers:{Host:'localhost:3001',Origin:'http://localhost:3001',Connection:'close','Content-Type':'application/json','Content-Length':Buffer.byteLength(body),
          ...(token?{Authorization:'Bearer '+token}:{}),...(method==='GET'&&context!==undefined?{'X-Project-Context':JSON.stringify(context)}:{})}},res=>{
        let output='';res.on('data',chunk=>{output+=chunk;assert.ok(Buffer.byteLength(output)<65536);});
        res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode!,body:JSON.parse(output),attachment:res.headers['content-disposition']!==undefined}));
      });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Controlled request timeout')));req.end(body);
    });work.add(pending);void pending.then(()=>work.delete(pending),()=>work.delete(pending));return pending;
  }
  return {store,authority,send,async close(){closing=true;authority.retire();boundary.dispose();
    await Promise.allSettled([...work]);const done=new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
    const closes=[...sockets].map(s=>new Promise<void>(resolve=>s.once('close',()=>resolve())));server.closeAllConnections();await Promise.all([done,...closes]);
    await auth.owner.dispose();await foreign.owner.dispose();
    assert.equal(auth.alive(),false);assert.equal(foreign.alive(),false);
    assert.equal(sockets.size,0);assert.equal(work.size,0);assert.equal(authority.state().drain,'COMPLETE');assert.equal(server.address(),null);assert.deepEqual(observed,planned);
    summaries.push({requests:observed.length,sockets:sockets.size,work:work.size,closed:true});
  }};
}

await test('authenticated generation-bound project exports',{timeout:20000},async t=>{
  const original={readFile:fs.readFile,mkdir:fs.mkdir,writeFile:fs.writeFile,rename:fs.rename,rm:fs.rm};
  const events:string[]=[];let heldWrite:ReturnType<typeof deferred<void>>|undefined,writeEntered:ReturnType<typeof deferred<void>>|undefined;
  // Synthetic filesystem only. No project files/directories are read or written.
  fs.readFile=(async()=>{events.push('read');throw Object.assign(Error('Synthetic absent file'),{code:'ENOENT'});}) as typeof fs.readFile;
  fs.mkdir=(async()=>{events.push('mkdir');}) as typeof fs.mkdir;
  fs.writeFile=(async(_path:unknown,data:unknown)=>{events.push('write:'+String(data));writeEntered?.resolve();if(heldWrite)await heldWrite.promise;}) as typeof fs.writeFile;
  fs.rename=async()=>{events.push('rename');};fs.rm=async()=>{events.push('remove');};
  try{
    for(const path of paths)await t.test(path+' rejects missing/stale/foreign contexts and missing/foreign authentication',async()=>{
      const f=await fixture(),observed=f.store as unknown as {toBundle:()=>unknown},serialize=observed.toBundle;let serializations=0;
      try{
        observed.toBundle=()=>{serializations++;return serialize.call(f.store);};
        const a=f.store.getMetadataWriteContext();f.authority.createNewProject('Synthetic B');const b=f.store.getMetadataWriteContext(),before=f.store.getSession();events.length=0;
        for(const context of [undefined,a,{...b,projectId:'other'},{...b,mode:'QUICK_WORK'},{...b,generation:a.generation},{}]){
          const result=await f.send(path,context);assert.equal(result.status,409);assert.deepEqual(Object.keys(result.body),['error']);assert.equal(result.attachment,false);
          assert.deepEqual(f.store.getSession(),before);assert.deepEqual(events,[]);
        }
        for(const credentials of ['none','foreign'] as const){assert.equal((await f.send(path,b,credentials)).status,401);assert.deepEqual(f.store.getSession(),before);assert.deepEqual(events,[]);}
        assert.equal(serializations,0);
      }finally{observed.toBundle=serialize;await f.close();}
    });
    for(const path of paths)await t.test(path+' permits matching-generation operations only',async()=>{
      const f=await fixture();try{
        events.length=0;const context=f.store.getMetadataWriteContext(),result=await f.send(path,context);
        assert.equal(result.status,200);
        if(path.endsWith('/export')){assert.equal(result.body.project.id,'export-project-a');assert.equal(f.store.getSession().dirty,true);assert.equal(result.attachment,true);}
        else if(path.endsWith('/save-content')){const saved=JSON.parse(result.body.content).project,current=f.store.getSession();assert.equal(saved.id,'export-project-a');assert.equal(current.dirty,false);assert.deepEqual(events,[]);assert.equal(saved.lastSavedAt,current.project.lastSavedAt);assert.equal(saved.updatedAt,current.project.updatedAt);}
        else{assert.equal(result.body.session.metadataWriteContext.generation,context.generation);const saved=JSON.parse(events.find(v=>v.startsWith('write:'))!.slice('write:'.length)).project;assert.equal(f.store.getSession().dirty,false);assert.equal(saved.lastSavedAt,result.body.session.project.lastSavedAt);assert.equal(saved.updatedAt,result.body.session.project.updatedAt);}
      }finally{await f.close();}
    });
    for(const state of ['pending','retired','unknown'])await t.test('all alternate routes deny '+state+' replacement authority',async()=>{
      const f=await fixture(),read=fs.readFile,gate=deferred<string>();let pending:Promise<unknown>|undefined;
      try{
        if(state==='pending'){fs.readFile=(()=>gate.promise) as unknown as typeof fs.readFile;pending=f.store.openProject('synthetic-held.cctvproj');await Promise.resolve();}
        if(state==='retired')f.authority.retire();
        if(state==='unknown'){
          const view=f.store.getProject,identity=f.store.getSessionGeneration();f.store.getProject=function(){if(this.getSessionGeneration()!==identity)throw new ProjectValidationError('Synthetic view error');return view.call(this);};
          try{assert.throws(()=>f.authority.importProjectJson(synthetic),{disposition:'UNKNOWN'});}finally{f.store.getProject=view;}
        }
        events.length=0;const before=f.store.getSession(),context=f.store.getMetadataWriteContext();
        for(const path of paths){assert.equal((await f.send(path,context)).status,409);assert.deepEqual(f.store.getSession(),before);assert.deepEqual(events,[]);}
      }finally{gate.resolve(synthetic);await pending;fs.readFile=read;await f.close();}
    });
    await t.test('executing replacement rejects reentrant exports before serialization',async()=>{
      const f=await fixture(),replace=f.store.createNewProject;
      try{const context=f.store.getMetadataWriteContext();f.store.createNewProject=function(...args){
        assert.throws(()=>f.authority.exportJson(context),{code:'REPLACEMENT_PENDING'});
        assert.throws(()=>f.authority.exportForSave(context),{code:'REPLACEMENT_PENDING'});
        assert.throws(()=>f.authority.saveFile(context,'synthetic-output.cctvproj'),{code:'REPLACEMENT_PENDING'});
        return replace.apply(this,args);
      };f.authority.createNewProject('Synthetic next');}finally{f.store.createNewProject=replace;await f.close();}
    });
    await t.test('held file Save excludes replacement and all other clients until actual settlement',async()=>{
      const f=await fixture();heldWrite=deferred<void>();writeEntered=deferred<void>();let saving:ReturnType<typeof f.send>|undefined;
      try{
        const a=f.store.getMetadataWriteContext();saving=f.send('/api/project/save',a);await writeEntered.promise;
        assert.equal(f.authority.state().drain,'UNRESOLVED');assert.throws(()=>f.authority.createNewProject('Cannot replace'),{code:'REPLACEMENT_PENDING'});
        for(const path of paths)assert.equal((await f.send(path,a)).status,409);
        heldWrite.resolve();const result=await saving;assert.equal(result.status,200);assert.equal(result.body.session.metadataWriteContext.generation,a.generation);
        f.authority.createNewProject('Synthetic B');const b=f.store.getMetadataWriteContext();
        assert.equal((await f.send('/api/project/export',a)).status,409);assert.equal((await f.send('/api/project/export',b)).status,200);
      }finally{heldWrite.resolve();await saving;heldWrite=undefined;writeEntered=undefined;await f.close();}
    });
    await t.test('raw protected-store export and file Save cannot bypass the authority',async()=>{
      const f=await fixture();try{
        const before=f.store.getSession();events.length=0;
        assert.throws(()=>f.store.exportProjectJson());assert.throws(()=>f.store.exportProjectJsonForSave());await assert.rejects(f.store.saveProject('synthetic-output.cctvproj'));await assert.rejects(f.store.saveAs('synthetic-output.cctvproj'));
        assert.deepEqual(events,[]);assert.deepEqual(f.store.getSession(),before);
      }finally{await f.close();}
    });
    for(const path of ['/api/project/save-content','/api/project/save'])for(const priorSavedAt of [false,true])for(const failure of ['projection','validation','serialization'] as const)await t.test(path+' '+failure+' failure restores '+(priorSavedAt?'existing':'absent')+' Save timestamps',async()=>{
      const f=await fixture(),observed=f.store as unknown as {toBundle:()=>unknown},project=observed.toBundle;let calls=0;
      try{
        const payload=JSON.parse(synthetic);
        payload.devices=[{id:'synthetic-camera',anchor:{macAddress:'00:11:22:33:44:50',vendor:'Synthetic'},
          network:{ipAddress:'192.0.2.50'},technician:{name:'Earlier Name',location:'Earlier Location',notes:'Earlier Notes'},
          status:'UNKNOWN',sessionVerification:'NOT_VERIFIED',evidenceProvenance:'SYNTHETIC_TEST'}];
        payload.totalDevices=1;f.authority.importProjectJson(JSON.stringify(payload));
        if(priorSavedAt){payload.lastSavedAt='2026-10-01T12:00:00.000Z';f.authority.importProjectJson(JSON.stringify(payload));}
        const context=f.store.getMetadataWriteContext();f.store.requireMetadataWriteContext(context);
        f.store.updateDeviceTechnicianFields('synthetic-camera',{name:'Accepted Name',location:'Accepted Location',notes:'Accepted Notes'});
        const before=f.store.getSession();assert.equal(before.dirty,true);events.length=0;
        observed.toBundle=()=>{
          calls++;
          if(failure==='projection')throw Error('PRIVATE_PROJECTION_FAILURE');
          if(failure==='validation')throw new ProjectValidationError('Synthetic project validation failure.');
          return {...project.call(f.store) as object,syntheticUnserializableValue:1n};
        };
        const result=await f.send(path,context);
        assert.equal(result.status,failure==='validation'?400:500);
        assert.deepEqual(result.body,{error:failure==='validation'?'Synthetic project validation failure.':'Project export outcome unavailable. Verify the file before trying again.'});
        assert.equal(result.attachment,false);assert.equal(calls,1);assert.deepEqual(events,path.endsWith('/save')?['read']:[]);
        const after=f.store.getSession();assert.equal(after.dirty,true);
        assert.deepEqual(after.project.devices,before.project.devices);assert.deepEqual(after.project.auditLogs,before.project.auditLogs);
        assert.deepEqual(after.metadataWriteContext,context);assert.equal(after.filePath,before.filePath);
        assert.deepEqual(after,before);
        assert.equal(Object.prototype.hasOwnProperty.call(after.project,'lastSavedAt'),priorSavedAt);
        assert.equal(f.authority.state().drain,'COMPLETE');
        observed.toBundle=project;
        assert.equal(f.authority.createNewProject('After failed serialization').name,'After failed serialization');
        assert.equal(calls,1);assert.deepEqual(events,path.endsWith('/save')?['read']:[]);
      }finally{observed.toBundle=project;await f.close();}
    });
    for(const field of ['name','location','notes'] as const)await t.test('file Save preserves newer '+field+' edits after snapshot capture',async()=>{
      const f=await fixture();heldWrite=deferred<void>();writeEntered=deferred<void>();let saving:ReturnType<typeof f.send>|undefined;
      try{
        const project=JSON.parse(synthetic);
        project.devices=[{id:'synthetic-camera',anchor:{macAddress:'00:11:22:33:44:50',vendor:'Synthetic'},
          network:{ipAddress:'192.0.2.50'},technician:{name:'Earlier Name',location:'Earlier Location',notes:'Earlier Notes'},
          status:'UNKNOWN',sessionVerification:'NOT_VERIFIED',evidenceProvenance:'SYNTHETIC_TEST'}];
        project.totalDevices=1;f.authority.importProjectJson(JSON.stringify(project));
        events.length=0;const context=f.store.getMetadataWriteContext();saving=f.send('/api/project/save',context);await writeEntered.promise;
        const writes=events.filter(v=>v.startsWith('write:'));assert.equal(writes.length,1);
        const written=JSON.parse(writes[0].slice('write:'.length));
        assert.equal(written.project.devices[0].technician[field],project.devices[0].technician[field]);
        f.store.requireMetadataWriteContext(context);
        f.store.updateDeviceTechnicianFields('synthetic-camera',{[field]:'Newer '+field});
        assert.equal(f.store.getSession().dirty,true);
        assert.throws(()=>f.authority.createNewProject('Cannot replace'),{code:'REPLACEMENT_PENDING'});
        heldWrite.resolve();const result=await saving;
        assert.equal(result.status,200);assert.equal(result.body.session.dirty,true);
        assert.equal(result.body.session.project.devices[0].technician[field],'Newer '+field);
        assert.equal(f.store.getSession().project.devices[0].technician?.[field],'Newer '+field);
        assert.deepEqual(f.store.getMetadataWriteContext(),context);
        assert.deepEqual(events.filter(v=>v.startsWith('write:')),writes);
        assert.equal(events.filter(v=>v==='rename').length,1);assert.equal(events.includes('remove'),false);
        assert.equal(f.authority.state().drain,'COMPLETE');
      }finally{heldWrite.resolve();await saving;heldWrite=undefined;writeEntered=undefined;await f.close();}
    });
    await t.test('successful file Save stays dirty when settlement projection cannot be confirmed',async()=>{
      const f=await fixture(),observed=f.store as unknown as {toBundle:()=>unknown},project=observed.toBundle;
      heldWrite=deferred<void>();writeEntered=deferred<void>();let saving:ReturnType<typeof f.send>|undefined;
      try{
        events.length=0;saving=f.send('/api/project/save',f.store.getMetadataWriteContext());await writeEntered.promise;
        observed.toBundle=()=>{throw new ProjectValidationError('Synthetic settlement projection failure');};
        heldWrite.resolve();const result=await saving;
        assert.equal(result.status,200);assert.equal(result.body.session.dirty,true);assert.equal(f.store.getSession().dirty,true);
        assert.equal(events.filter(v=>v.startsWith('write:')).length,1);assert.equal(events.filter(v=>v==='rename').length,1);
        assert.equal(f.authority.state().drain,'COMPLETE');
      }finally{heldWrite.resolve();await saving;observed.toBundle=project;heldWrite=undefined;writeEntered=undefined;await f.close();}
    });
    const failurePayload=(priorSavedAt=false)=>JSON.stringify({...JSON.parse(synthetic),
      ...(priorSavedAt?{lastSavedAt:'2026-10-01T12:00:00.000Z'}:{}),totalDevices:1,
      devices:[{id:'synthetic-camera',anchor:{macAddress:'00:11:22:33:44:50',vendor:'Synthetic'},
        network:{ipAddress:'192.0.2.50'},technician:{name:'Earlier Name',location:'Earlier Location',notes:'Earlier Notes'},
        status:'UNKNOWN',sessionVerification:'NOT_VERIFIED',evidenceProvenance:'SYNTHETIC_TEST'}]});
    for(const stage of ['mkdir','writeFile'] as const)for(const priorSavedAt of [false,true])for(const dirty of [false,true])await t.test(stage+' failure restores '+(priorSavedAt?'existing':'absent')+' timestamps; dirty='+dirty,async()=>{
      const f=await fixture(),operation=fs[stage];let calls=0;
      try{
        f.authority.importProjectJson(failurePayload(priorSavedAt));
        if(dirty)f.store.updateDeviceTechnicianFields('synthetic-camera',{notes:'Accepted Notes'});
        const before=f.store.getSession();events.length=0;
        Object.assign(fs,{[stage]:async()=>{calls++;throw Error('Synthetic pre-rename failure');}});
        const result=await f.send('/api/project/save',before.metadataWriteContext);
        assert.equal(result.status,500);assert.deepEqual(Object.keys(result.body),['error']);assert.equal(result.attachment,false);
        assert.deepEqual(f.store.getSession(),before);
        assert.equal(Object.prototype.hasOwnProperty.call(f.store.getSession().project,'lastSavedAt'),priorSavedAt);
        assert.equal(calls,1);assert.equal(events.filter(v=>v==='remove').length,1);assert.equal(events.includes('rename'),false);
        assert.equal(events.some(v=>v.startsWith('write:')),false);assert.equal(f.authority.state().drain,'COMPLETE');
        assert.equal(f.authority.createNewProject('After pre-rename failure').name,'After pre-rename failure');assert.equal(calls,1);
      }finally{Object.assign(fs,{[stage]:operation});await f.close();}
    });
    for(const stage of ['mkdir','writeFile'] as const)for(const field of ['name','location','notes'] as const)await t.test('held '+stage+' failure preserves newer '+field+' and timestamps',async()=>{
      const f=await fixture(),operation=fs[stage],entered=deferred<void>(),release=deferred<void>();let calls=0,saving:ReturnType<typeof f.send>|undefined;
      try{
        f.authority.importProjectJson(failurePayload());events.length=0;
        Object.assign(fs,{[stage]:async()=>{calls++;entered.resolve();await release.promise;throw Error('Synthetic held failure');}});
        saving=f.send('/api/project/save',f.store.getMetadataWriteContext());await entered.promise;
        f.store.updateDeviceTechnicianFields('synthetic-camera',{[field]:'Newer '+field});
        const newer=f.store.getSession();assert.equal(newer.dirty,true);
        assert.throws(()=>f.authority.startQuickWork(),{code:'REPLACEMENT_PENDING'});
        release.resolve();const result=await saving;assert.equal(result.status,500);
        assert.deepEqual(f.store.getSession(),newer);assert.equal(f.store.getSession().project.devices[0].technician?.[field],'Newer '+field);
        assert.equal(calls,1);assert.equal(events.filter(v=>v==='remove').length,1);assert.equal(events.includes('rename'),false);
        assert.equal(f.authority.state().drain,'COMPLETE');
      }finally{release.resolve();await saving;Object.assign(fs,{[stage]:operation});await f.close();}
    });
    for(const stage of ['mkdir','writeFile'] as const)await t.test(stage+' failure preserves state when snapshot comparison fails',async()=>{
      const f=await fixture(),operation=fs[stage],entered=deferred<void>(),release=deferred<void>();
      const observed=f.store as unknown as {toBundle:()=>unknown},projection=observed.toBundle;
      let saving:ReturnType<typeof f.send>|undefined,calls=0,comparisons=0;
      try{
        events.length=0;Object.assign(fs,{[stage]:async()=>{calls++;entered.resolve();await release.promise;throw Error('Synthetic I/O failure');}});
        saving=f.send('/api/project/save',f.store.getMetadataWriteContext());await entered.promise;
        const attempted=f.store.getSession();observed.toBundle=()=>{comparisons++;throw Error('Synthetic unavailable comparison');};
        release.resolve();assert.equal((await saving).status,500);assert.deepEqual(f.store.getSession(),attempted);
        assert.equal(calls,1);assert.equal(comparisons,1);assert.equal(events.filter(v=>v==='remove').length,1);
        assert.equal(events.includes('rename'),false);assert.equal(f.authority.state().drain,'COMPLETE');
      }finally{release.resolve();await saving;observed.toBundle=projection;Object.assign(fs,{[stage]:operation});await f.close();}
    });
    for(const syntheticReplacement of [false,true])await t.test('rename rejection remains uncertain; synthetic replacement='+syntheticReplacement,async()=>{
      const f=await fixture(),rename=fs.rename;let calls=0,replaced=false;
      try{
        events.length=0;const before=f.store.getSession();
        fs.rename=async()=>{calls++;replaced=syntheticReplacement;throw Error('Synthetic rename acknowledgment failure');};
        const result=await f.send('/api/project/save',before.metadataWriteContext);
        assert.equal(result.status,500);assert.deepEqual(result.body,{error:'Project export outcome unavailable. Verify the file before trying again.'});
        const written=JSON.parse(events.find(v=>v.startsWith('write:'))!.slice('write:'.length)).project,current=f.store.getSession();
        assert.equal(current.project.lastSavedAt,written.lastSavedAt);assert.equal(current.project.updatedAt,written.updatedAt);
        assert.notEqual(current.project.lastSavedAt,before.project.lastSavedAt);assert.equal(current.dirty,before.dirty);
        assert.equal(current.filePath,before.filePath);assert.equal(replaced,syntheticReplacement);assert.equal(calls,1);
        assert.equal(events.filter(v=>v==='remove').length,1);assert.equal(f.authority.state().drain,'COMPLETE');
      }finally{fs.rename=rename;await f.close();}
    });
    await t.test('failed asynchronous file work releases exclusion only on settlement',async()=>{
      const f=await fixture(),write=fs.writeFile;heldWrite=deferred<void>();writeEntered=deferred<void>();let saving:ReturnType<typeof f.send>|undefined;
      fs.writeFile=(async()=>{writeEntered!.resolve();await heldWrite!.promise;throw Error('Synthetic file failure');}) as typeof fs.writeFile;
      try{
        events.length=0;saving=f.send('/api/project/save',f.store.getMetadataWriteContext());await writeEntered.promise;
        f.store.appendHistory({type:'NOTES_UPDATED',title:'Newer accepted edit',summary:'Synthetic edit during failed Save'});
        const newerHistory=f.store.getSession().project.auditLogs;
        assert.throws(()=>f.authority.startQuickWork(),{code:'REPLACEMENT_PENDING'});
        heldWrite.resolve();assert.equal((await saving).status,500);
        assert.equal(f.store.getSession().dirty,true);assert.deepEqual(f.store.getSession().project.auditLogs,newerHistory);
        assert.equal(events.filter(v=>v==='remove').length,1);assert.equal(events.includes('rename'),false);
        assert.equal(f.authority.state().drain,'COMPLETE');assert.equal(f.authority.createNewProject('After failure').name,'After failure');
      }finally{heldWrite.resolve();await saving;heldWrite=undefined;writeEntered=undefined;fs.writeFile=write;await f.close();}
    });
    await t.test('post-write response view failure is unavailable, never pre-output rejection',async()=>{
      const f=await fixture(),view=f.store.getProject,rename=fs.rename;let committed=false;
      fs.rename=async()=>{committed=true;};
      f.store.getProject=function(){if(committed)throw new ProjectValidationError('PRIVATE_VIEW_FAILURE');return view.call(this);};
      try{
        events.length=0;const context=f.store.getMetadataWriteContext(),result=await f.send('/api/project/save',context);
        assert.equal(result.status,500);assert.equal(result.body.error,'Project export outcome unavailable. Verify the file before trying again.');
        assert.equal(committed,true);assert.equal(events.filter(v=>v.startsWith('write:')).length,1);
      }finally{f.store.getProject=view;fs.rename=rename;const session=f.store.getSession(),written=JSON.parse(events.find(v=>v.startsWith('write:'))!.slice('write:'.length)).project;assert.equal(session.filePath,'synthetic-output.cctvproj');assert.equal(session.project.lastSavedAt,written.lastSavedAt);assert.equal(session.project.updatedAt,written.updatedAt);await f.close();}
    });
  }finally{Object.assign(fs,original);}
  assert.ok(summaries.every(s=>s.closed&&s.sockets===0&&s.work===0));console.log(JSON.stringify({fixtures:summaries.length,requests:summaries.reduce((n,s)=>n+s.requests,0),retainedSockets:0,retainedOperations:0}));
});
