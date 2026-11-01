import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import dgram from 'node:dgram';
import { promises as fs } from 'node:fs';
import type { SiteProjectDatabase, ProjectReplacementOperation } from '../core/storage/project_db.ts';

let forbidden=0;
const originals={connect:net.Socket.prototype.connect,listen:net.Server.prototype.listen,udp:dgram.createSocket,fetch:globalThis.fetch};
const deny=():never=>{forbidden++;throw Error('Forbidden production authority proof transport');};
net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;dgram.createSocket=deny;globalThis.fetch=deny;
function deferred(){let resolve!:(value:string)=>void;const promise=new Promise<string>(done=>{resolve=done;});return {promise,resolve};}
const payload=JSON.stringify({id:'production-proof-project',name:'Synthetic protected project',siteLocation:'Exact site',
  createdAt:'2026-11-01T12:00:00Z',updatedAt:'2026-11-01T12:00:00Z',devices:[],totalDevices:0,collisions:[],rogueDhcpEvents:[],auditLogs:[]});
const methods:ProjectReplacementOperation[]=['startQuickWork','createNewProject','createProjectFromCurrentResults','importProjectJson'];
function direct(store:SiteProjectDatabase,operation:ProjectReplacementOperation,permission?:unknown){
  switch(operation){
    case 'startQuickWork':return store.startQuickWork(permission);
    case 'createNewProject':return store.createNewProject('New','Site','Description',permission);
    case 'createProjectFromCurrentResults':return store.createProjectFromCurrentResults('From','Description',permission);
    case 'importProjectJson':return store.importProjectJson(payload,permission);
  }
}

try{
  await test('production-source same-process project replacement authority',{timeout:15000},async t=>{
    const {SiteProjectDatabase,createProtectedProjectStore,claimProjectReplacementAuthority,projectDb,ProjectValidationError}=await import('../core/storage/project_db.ts');
    const {ProjectReplacementAuthorityError}=await import('../core/projects/project_replacement_authority.ts');
    const {constructBackend}=await import('../server/backend_application.ts');
    const {lifecycleFixture}=await import('./backend_lifecycle_fixture.ts');
    const fresh=()=>{const store=createProtectedProjectStore('ISOLATED_TEST');return {store,owner:claimProjectReplacementAuthority(store)};};
    await t.test('actual singleton is protected before claim and only one backend can ever claim it',async()=>{
      const before=projectDb.getSession(),generation=projectDb.getSessionGeneration();
      for(const method of methods)assert.throws(()=>direct(projectDb,method),/permission denied/);
      assert.deepEqual(projectDb.getSession(),before);assert.equal(projectDb.getSessionGeneration(),generation);
      const backend=constructBackend();
      try{
        assert.throws(()=>constructBackend(),{code:'STORE_ALREADY_CLAIMED'});
        assert.equal(backend.status().state,'constructed');
      }finally{await backend.shutdown();}
      assert.throws(()=>constructBackend(),{code:'STORE_ALREADY_CLAIMED'});
    });
    for(const method of methods)
    await t.test('protected direct '+method+' denied before and after retirement without mutation',()=>{
      const f=fresh(),before=f.store.getSession(),generation=f.store.getSessionGeneration();
      for(const retire of [false,true]){
        if(retire)f.owner.retire();
        for(const permission of [undefined,{},true])assert.throws(()=>direct(f.store,method,permission),/permission denied/);
        assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),generation);
      }
    });
    await t.test('authorized operations retain results, metadata, history and dirty behavior',()=>{
      const f=fresh(),counts=new Map<ProjectReplacementOperation,number>();
      const target=f.store as unknown as Record<ProjectReplacementOperation,(...args:unknown[])=>unknown>;
      const originals=methods.map(method=>({method,call:target[method]}));
      for(const {method,call} of originals)target[method]=(...args)=>{counts.set(method,(counts.get(method)??0)+1);return Reflect.apply(call,f.store,args);};
      try{
      assert.equal(f.owner.startQuickWork().name,'Quick Work');assert.equal(f.store.getSession().dirty,false);
      assert.equal(f.owner.createNewProject('New','Exact site','Description').name,'New');
      assert.equal(f.store.getSession().dirty,true);assert.equal(f.store.getSession().project.siteLocation,'Exact site');
      assert.equal(f.store.listProjectHistory().at(-1)?.type,'PROJECT_CREATED');
      assert.equal(f.owner.createProjectFromCurrentResults('From').siteLocation,'Exact site');assert.equal(f.store.getSession().dirty,true);
      assert.equal(f.owner.importProjectJson(payload).id,'production-proof-project');assert.equal(f.store.getSession().dirty,false);
      assert.equal(f.owner.state().unresolvedActivation,false);
      for(const method of methods)assert.equal(counts.get(method),1,method+' must execute exactly once');
      }finally{for(const {method,call} of originals)target[method]=call;}
    });
    await t.test('stale generation, replay and wrong-operation permissions are rejected',()=>{
      const f=fresh(),old=f.store.getSessionGeneration();f.owner.createNewProject('New');
      const before=f.store.getSession(),generation=f.store.getSessionGeneration();
      assert.throws(()=>f.owner.startQuickWork(old),{disposition:'REJECTED_BEFORE_ACTIVATION',code:'STALE_GENERATION'});
      assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),generation);
      const original=f.store.startQuickWork;let captured:unknown;
      f.store.startQuickWork=function(permission){
        captured=permission;
        const project=original.call(this,permission);
        assert.throws(()=>original.call(this,permission),/permission denied/);
        assert.throws(()=>this.createNewProject('Wrong','','',permission),/permission denied/);
        return project;
      };
      try{f.owner.startQuickWork();assert.throws(()=>original.call(f.store,captured),/permission denied/);}
      finally{f.store.startQuickWork=original;}
      const a=fresh(),b=fresh(),quick=a.store.startQuickWork;
      const beforeA=a.store.getSession(),beforeB=b.store.getSession();
      a.store.startQuickWork=function(permission){
        assert.throws(()=>b.store.startQuickWork(permission),/permission denied/); // Wrong store, still-unused grant.
        assert.throws(()=>this.importProjectJson(payload,permission),/permission denied/); // Wrong operation burns it.
        return quick.call(this,permission);
      };
      try{
        assert.throws(()=>a.owner.startQuickWork(),ProjectValidationError);
        assert.deepEqual(a.store.getSession(),beforeA);assert.deepEqual(b.store.getSession(),beforeB);
      }finally{a.store.startQuickWork=quick;}
    });
    await t.test('retirement revokes a grant before it reaches the store mutation body',()=>{
      const f=fresh(),original=f.store.startQuickWork,before=f.store.getSession(),generation=f.store.getSessionGeneration();
      f.store.startQuickWork=function(permission){f.owner.retire();return original.call(this,permission);};
      try{
        assert.throws(()=>f.owner.startQuickWork(),ProjectValidationError);
        assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),generation);
      }finally{f.store.startQuickWork=original;}
    });
    await t.test('a grant binds exact replacement arguments and cannot be reused after mismatch',()=>{
      const f=fresh(),original=f.store.createNewProject,before=f.store.getSession(),generation=f.store.getSessionGeneration();
      f.store.createNewProject=function(name,location,description,permission){
        assert.throws(()=>original.call(this,'Conflicting name',location,description,permission),/permission denied/);
        return original.call(this,name,location,description,permission);
      };
      try{
        assert.throws(()=>f.owner.createNewProject('New','Site','Description'),ProjectValidationError);
        assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),generation);
      }finally{f.store.createNewProject=original;}
    });
    await t.test('validation rejection is unchanged; post-commit view failure is UNKNOWN and latches closed',()=>{
      const f=fresh(),before=f.store.getSession(),identity=f.store.getSessionGeneration();
      assert.throws(()=>f.owner.importProjectJson('{'),ProjectValidationError);assert.deepEqual(f.store.getSession(),before);
      const view=f.store.getProject;
      f.store.getProject=function(){if(this.getSessionGeneration()!==identity)throw new ProjectValidationError('Synthetic private view error');return view.call(this);};
      try{assert.throws(()=>f.owner.importProjectJson(payload),{disposition:'UNKNOWN',code:'ACTIVATION_UNCERTAIN'});}
      finally{f.store.getProject=view;}
      assert.equal(f.store.getSession().project.id,'production-proof-project');assert.equal(f.owner.state().unresolvedActivation,true);
      assert.throws(()=>f.owner.startQuickWork(),ProjectReplacementAuthorityError);
      assert.equal(f.owner.retire().unresolvedActivation,true);
    });
    await t.test('protected file Open captures generation and assigns its path only inside a successful commit',async()=>{
      const f=fresh(),release=deferred(),read=fs.readFile;let reads=0;
      fs.readFile=((path:unknown)=>{assert.equal(path,'synthetic-held.cctvproj');reads++;return release.promise;}) as typeof fs.readFile;
      let pending:Promise<unknown>|undefined;
      try{
        pending=f.store.openProject('synthetic-held.cctvproj');await Promise.resolve();await Promise.resolve();
        assert.equal(reads,1);assert.throws(()=>f.owner.createNewProject('Bypass'),{code:'REPLACEMENT_PENDING'});
        release.resolve(payload);assert.equal((await pending as {id:string}).id,'production-proof-project');
        assert.equal(f.store.getSession().filePath,'synthetic-held.cctvproj');assert.equal(f.owner.state().drain,'COMPLETE');
      }finally{release.resolve(payload);await pending;fs.readFile=read;}
    });
    await t.test('held file preparation cannot activate or assign a path after retirement',async()=>{
      const f=fresh(),release=deferred(),read=fs.readFile,before=f.store.getSession(),identity=f.store.getSessionGeneration();
      fs.readFile=(()=>release.promise) as unknown as typeof fs.readFile;
      let pending:Promise<unknown>|undefined;
      try{
        pending=f.store.openProject('synthetic-retired.cctvproj');const rejected=assert.rejects(pending,{code:'AUTHORITY_RETIRED'});
        await Promise.resolve();await Promise.resolve();assert.equal(f.owner.retire().drain,'UNRESOLVED');
        release.resolve(payload);await rejected;
        assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),identity);
        assert.equal(f.owner.state().drain,'COMPLETE');assert.throws(()=>claimProjectReplacementAuthority(f.store),{code:'STORE_ALREADY_CLAIMED'});
      }finally{release.resolve(payload);await pending?.catch(()=>{});fs.readFile=read;}
    });
    await t.test('backend retirement precedes its asynchronous cleanup and second fixture cannot claim the store',async()=>{
      const store=createProtectedProjectStore(),fixture=lifecycleFixture({projectStore:store});
      assert.throws(()=>lifecycleFixture({projectStore:store}),{code:'STORE_ALREADY_CLAIMED'});
      const closing=fixture.backend.shutdown();
      assert.equal(fixture.backend.status().replacement.retired,true);assert.deepEqual(fixture.events,[]);
      assert.equal(fixture.backend.shutdown(),closing);
      for(const method of methods)assert.throws(()=>direct(store,method),/permission denied/);
      await closing;assert.equal(fixture.backend.status().state,'stopped');
      assert.throws(()=>lifecycleFixture({projectStore:store}),{code:'STORE_ALREADY_CLAIMED'});
    });
    await t.test('backend shutdown cannot report successful cleanup while protected file work remains held',async()=>{
      const store=createProtectedProjectStore(),fixture=lifecycleFixture({projectStore:store}),release=deferred(),read=fs.readFile;
      const before=store.getSession(),generation=store.getSessionGeneration();
      fs.readFile=(()=>release.promise) as unknown as typeof fs.readFile;
      const pending=store.openProject('synthetic-backend-held.cctvproj');
      const rejected=assert.rejects(pending,{code:'AUTHORITY_RETIRED'});
      try{
        await Promise.resolve();await Promise.resolve();
        const closing=fixture.backend.shutdown();assert.equal(fixture.backend.status().replacement.retired,true);
        await assert.rejects(closing,AggregateError);
        assert.equal(fixture.backend.status().replacement.drain,'UNRESOLVED');
        release.resolve(payload);await rejected;
        assert.equal(fixture.backend.status().replacement.drain,'COMPLETE');
        assert.deepEqual(store.getSession(),before);assert.equal(store.getSessionGeneration(),generation);
      }finally{release.resolve(payload);await rejected;fs.readFile=read;await fixture.backend.shutdown().catch(()=>{});}
    });
    for(const operation of methods)
    await t.test(operation+' reports a validation-shaped post-commit session failure as 500 without repeating activation',async()=>{
      const store=createProtectedProjectStore(),fixture=lifecycleFixture({projectStore:store});
      const path=operation==='startQuickWork'?'/api/project/quick-work':operation==='createNewProject'?'/api/project/new'
        :operation==='createProjectFromCurrentResults'?'/api/project/from-current':'/api/project/open';
      const handler=(fixture.backend.app as any)._router.stack.find((layer:any)=>layer.route?.path===path).route.stack[0].handle;
      const view=store.getSession,generation=store.getSessionGeneration();let reads=0,calls=0,resets=0;
      const target=store as unknown as Record<ProjectReplacementOperation,(...args:unknown[])=>unknown>,original=target[operation];
      const boundary=store as unknown as {resetTransientDeviceState:()=>void},reset=boundary.resetTransientDeviceState;
      target[operation]=(...args)=>{calls++;return Reflect.apply(original,store,args);};
      boundary.resetTransientDeviceState=()=>{resets++;reset.call(store);};
      // First read snapshots the prior session; second confirms the authority's
      // commit. The third is the handler's post-commit broadcast/session read.
      store.getSession=function(){if(++reads===3)throw new ProjectValidationError('PRIVATE_POST_COMMIT_DETAIL');return view.call(this);};
      try{
        let code=200,value:unknown;const response={status(n:number){code=n;return this;},json(data:unknown){value=data;return this;}};
        handler({body:{name:'Synthetic New',location:'Synthetic site',description:'Synthetic notes',jsonData:payload}},response);
        assert.equal(reads,3);assert.equal(code,500);
        assert.deepEqual(value,{error:'Project replacement outcome unavailable. The current project could not be confirmed.'});
        assert.equal(calls,1);assert.equal(resets,1);assert.notEqual(store.getSessionGeneration(),generation);
      }finally{
        store.getSession=view;target[operation]=original;boundary.resetTransientDeviceState=reset;
        await fixture.backend.shutdown();
      }
    });
    await t.test('actual existing handler functions preserve success payloads and remain behind default-deny HTTP',async()=>{
      const store=createProtectedProjectStore(),fixture=lifecycleFixture({projectStore:store});
      try{
        // Invoke registered handlers as unit functions, not authenticated HTTP execution.
        const routes=(fixture.backend.app as any)._router.stack;
        const invoke=(path:string,body:unknown)=>{
          const handler=routes.find((layer:any)=>layer.route?.path===path).route.stack[0].handle;
          let code=200,value:any;const response={status(n:number){code=n;return this;},json(data:unknown){value=data;return this;}};
          handler({body},response);return {code,value};
        };
        assert.equal(invoke('/api/project/quick-work',{}).value.name,'Quick Work');
        assert.equal(invoke('/api/project/new',{name:'New',location:'Site'}).code,201);
        assert.equal(invoke('/api/project/from-current',{name:'From'}).value.name,'From');
        assert.equal(invoke('/api/project/open',{jsonData:payload}).value.id,'production-proof-project');
        assert.equal(invoke('/api/project/open',{jsonData:'{'}).code,400);
        assert.equal(invoke('/api/project/new',{name:' '}).code,400);
        assert.equal(invoke('/api/project/from-current',{name:' '}).code,400);
        assert.equal((await fixture.request()).status,401);
        await fixture.backend.shutdown();
        assert.equal(invoke('/api/project/quick-work',{}).code,409);
      }finally{await fixture.backend.shutdown();}
    });
    await t.test('separate staging stores and existing isolated hooks remain independent',()=>{
      const store=new SiteProjectDatabase();store.startQuickWork();store.createNewProject('Staging');
      assert.equal(store.importProjectJson(payload).id,'production-proof-project');
      assert.throws(()=>claimProjectReplacementAuthority(store),{code:'UNPROTECTED_STORE'});
      const isolated=new SiteProjectDatabase('ISOLATED_TEST',()=>false);assert.throws(()=>isolated.startQuickWork(),/permission denied/);
    });
    assert.equal(forbidden,0);
  });
}finally{
  net.Socket.prototype.connect=originals.connect;net.Server.prototype.listen=originals.listen;
  dgram.createSocket=originals.udp;globalThis.fetch=originals.fetch;
}
