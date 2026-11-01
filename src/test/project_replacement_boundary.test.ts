import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import dgram from 'node:dgram';
import type { SiteProjectDatabase, ProjectReplacementOperation, IsolatedProjectReplacementCheck } from '../core/storage/project_db.ts';
import { isolatedReplacementPermissions } from './support/project_replacement_permissions.ts';
import { ProjectReplacementGateProof } from './support/project_replacement_gate.ts';

let forbidden=0;
const originals={connect:net.Socket.prototype.connect,listen:net.Server.prototype.listen,udp:dgram.createSocket,fetch:globalThis.fetch};
const deny=():never=>{forbidden++;throw Error('Forbidden boundary proof transport');};
net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;dgram.createSocket=deny;globalThis.fetch=deny;
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
const payload=(id='boundary-b')=>JSON.stringify({id,name:'Synthetic boundary project',siteLocation:'Synthetic site',
  createdAt:'2026-11-01T12:00:00Z',updatedAt:'2026-11-01T12:00:00Z',totalDevices:1,collisions:[],rogueDhcpEvents:[],auditLogs:[],
  devices:[{id:'boundary-camera',anchor:{macAddress:'00:11:22:33:44:50',vendor:'Synthetic'},
    network:{ipAddress:'192.0.2.50',subnetMask:'255.255.255.0',port:80,protocol:'ONVIF'},
    technician:{name:'Exact Name',location:'  Exact Location  ',notes:'Exact Notes'},status:'ONLINE',
    evidenceProvenance:'SYNTHETIC_TEST',discoveredPhase:3,firstSeenAt:'fixture',lastSeenAt:'fixture'}]});
const operations:ProjectReplacementOperation[]=['startQuickWork','createNewProject','createProjectFromCurrentResults','importProjectJson'];
function args(operation:ProjectReplacementOperation):string[]{
  return operation==='startQuickWork'?[]:operation==='createNewProject'?['Boundary New','Boundary site','Description']
    :operation==='createProjectFromCurrentResults'?['Boundary From','Description']:[payload()];
}
function invoke(store:SiteProjectDatabase,operation:ProjectReplacementOperation,permission?:unknown){
  const values=args(operation);
  switch(operation){
    case 'startQuickWork':return store.startQuickWork(permission);
    case 'createNewProject':return store.createNewProject(values[0],values[1],values[2],permission);
    case 'createProjectFromCurrentResults':return store.createProjectFromCurrentResults(values[0],values[1],permission);
    case 'importProjectJson':return store.importProjectJson(values[0],permission);
  }
}

try{
  await test('isolated store-boundary replacement permission proof',{timeout:10000},async t=>{
    const {SiteProjectDatabase,ProjectValidationError}=await import('../core/storage/project_db.ts');
    function fresh(permissions=isolatedReplacementPermissions()){
      const store=new SiteProjectDatabase('ISOLATED_TEST',permissions.check),seed=payload('boundary-a');
      permissions.withPermission(store,store.getSessionGeneration(),'importProjectJson',[seed],p=>store.importProjectJson(seed,p));
      store.appendHistory({type:'NOTES_UPDATED',title:'Synthetic history',summary:'Prior synthetic edit',deviceId:'boundary-camera'});
      // Observe the actual generation-reset boundary without changing the production method.
      const observed=store as unknown as {resetTransientDeviceState:()=>void};
      const reset=observed.resetTransientDeviceState;let resets=0;
      observed.resetTransientDeviceState=function(){resets++;return reset.call(store);};
      return {store,permissions,resets:()=>resets,restore:()=>{observed.resetTransientDeviceState=reset;}};
    }
    const unchanged=(f:ReturnType<typeof fresh>,before:ReturnType<SiteProjectDatabase['getSession']>,identity:symbol,count=0)=>{
      assert.equal(f.store.getSessionGeneration(),identity);assert.deepEqual(f.store.getSession(),before);assert.equal(f.resets(),count);
    };
    for(const operation of operations)
    await t.test('direct '+operation+' without permission is denied before any mutation',t=>{
      const f=fresh();t.after(f.restore);const before=f.store.getSession(),identity=f.store.getSessionGeneration();
      assert.equal(before.dirty,true);
      for(const permission of [undefined,true,{},Object.freeze({})])
        assert.throws(()=>invoke(f.store,operation,permission),/permission denied/);
      unchanged(f,before,identity);
    });
    for(const operation of operations)
    await t.test('authorized direct '+operation+' executes once and consumes its permission',t=>{
      const f=fresh();t.after(f.restore);const before=f.store.getSessionGeneration();let captured:unknown;
      f.permissions.withPermission(f.store,before,operation,args(operation),permission=>{
        captured=permission;assert.equal(invoke(f.store,operation,permission) instanceof Promise,false);
        const committed=f.store.getSession(),identity=f.store.getSessionGeneration();
        assert.notEqual(identity,before);assert.equal(f.resets(),1);
        assert.throws(()=>invoke(f.store,operation,permission),/permission denied/);unchanged(f,committed,identity,1);
      });
      const after=f.store.getSession(),identity=f.store.getSessionGeneration();
      assert.throws(()=>invoke(f.store,operation,captured),/permission denied/);unchanged(f,after,identity,1);
      if(operation==='createNewProject'||operation==='createProjectFromCurrentResults')assert.equal(after.dirty,true);
      else assert.equal(after.dirty,false);
    });
    await t.test('permission for one operation cannot authorize another replacement',t=>{
      const f=fresh();t.after(f.restore);const before=f.store.getSession(),identity=f.store.getSessionGeneration();
      f.permissions.withPermission(f.store,identity,'startQuickWork',[],p=>{
        assert.throws(()=>invoke(f.store,'createNewProject',p),/permission denied/);
        assert.throws(()=>invoke(f.store,'startQuickWork',p),/permission denied/);
      });unchanged(f,before,identity);
    });
    await t.test('permission binds the exact arguments, not only the operation name',t=>{
      const f=fresh();t.after(f.restore);const before=f.store.getSession(),identity=f.store.getSessionGeneration();
      f.permissions.withPermission(f.store,identity,'createNewProject',args('createNewProject'),p=>{
        assert.throws(()=>f.store.createNewProject('Different name','Boundary site','Description',p),/permission denied/);
        assert.throws(()=>invoke(f.store,'createNewProject',p),/permission denied/);
      });unchanged(f,before,identity);
    });
    await t.test('cross-store use is denied even when stores share the same test issuer',t=>{
      const owner=isolatedReplacementPermissions(),a=fresh(owner),b=fresh(owner);t.after(a.restore);t.after(b.restore);
      const beforeA=a.store.getSession(),beforeB=b.store.getSession(),idA=a.store.getSessionGeneration(),idB=b.store.getSessionGeneration();
      owner.withPermission(a.store,idA,'startQuickWork',[],p=>assert.throws(()=>b.store.startQuickWork(p),/permission denied/));
      unchanged(a,beforeA,idA);unchanged(b,beforeB,idB);
    });
    await t.test('stale-generation permission is denied using the store boundary identity',t=>{
      const f=fresh();t.after(f.restore);const old=f.store.getSessionGeneration();
      f.permissions.withPermission(f.store,old,'createNewProject',args('createNewProject'),p=>invoke(f.store,'createNewProject',p));
      const before=f.store.getSession(),identity=f.store.getSessionGeneration();
      f.permissions.withPermission(f.store,old,'startQuickWork',[],p=>assert.throws(()=>f.store.startQuickWork(p),/permission denied/));
      unchanged(f,before,identity,1);
    });
    await t.test('an unused permission expires at scope exit and cannot be cloned',t=>{
      const f=fresh();t.after(f.restore);const before=f.store.getSession(),identity=f.store.getSessionGeneration();let captured:unknown;
      f.permissions.withPermission(f.store,identity,'startQuickWork',[],p=>{
        captured=p;assert.throws(()=>f.store.startQuickWork({...p as object}),/permission denied/);
      });
      assert.throws(()=>f.store.startQuickWork(captured),/permission denied/);unchanged(f,before,identity);
    });
    await t.test('validation failure consumes permission without changing the project',t=>{
      const f=fresh();t.after(f.restore);const before=f.store.getSession(),identity=f.store.getSessionGeneration();
      f.permissions.withPermission(f.store,identity,'createNewProject',['  ','',''],p=>{
        assert.throws(()=>f.store.createNewProject('  ','','',p),/Project name is required/);
        assert.throws(()=>f.store.createNewProject('  ','','',p),/permission denied/);
      });unchanged(f,before,identity);
    });
    await t.test('hooks cannot be enabled on technician stores and non-synchronous approval is denied',()=>{
      const permissions=isolatedReplacementPermissions();
      assert.throws(()=>new SiteProjectDatabase('TECHNICIAN',permissions.check),/fresh isolated test store/);
      assert.throws(()=>new SiteProjectDatabase(undefined,permissions.check),/fresh isolated test store/);
      const asyncCheck=(()=>Promise.resolve(true)) as unknown as IsolatedProjectReplacementCheck;
      const store=new SiteProjectDatabase('ISOLATED_TEST',asyncCheck),before=store.getSession(),identity=store.getSessionGeneration();
      assert.throws(()=>store.startQuickWork(),/permission denied/);assert.deepEqual(store.getSession(),before);assert.equal(store.getSessionGeneration(),identity);
    });
    await t.test('no-hook stores preserve all four existing direct replacement behaviors',()=>{
      for(const mode of ['TECHNICIAN','ISOLATED_TEST'] as const){
        const store=new SiteProjectDatabase(mode);
        assert.equal(store.startQuickWork().name,'Quick Work');
        assert.equal(store.createNewProject('Legacy New').name,'Legacy New');assert.equal(store.getSession().dirty,true);
        assert.equal(store.createProjectFromCurrentResults('Legacy From').name,'Legacy From');
        const text=payload('legacy-import'),data=JSON.parse(text);delete data.devices[0].evidenceProvenance;
        assert.equal(store.importProjectJson(JSON.stringify(data)).id,'legacy-import');assert.equal(store.getSession().dirty,false);
      }
    });
    await t.test('pending Open cannot be bypassed by raw calls or an out-of-gate grant',async t=>{
      const f=fresh();t.after(f.restore);const release=deferred(),entered=deferred();
      const gate=new ProjectReplacementGateProof(f.store,ProjectValidationError,{epoch:'boundary-epoch',permissions:f.permissions,
        beforeOpenActivation:async()=>{entered.resolve();await release.promise;}});
      const before=f.store.getSession(),identity=f.store.getSessionGeneration();
      const input={epoch:'boundary-epoch',attemptId:'pending-open',originatingGeneration:gate.generation(),payload:payload()};
      const pending=gate.importProjectJson(input);
      try{
        await entered.promise;
        assert.throws(()=>f.permissions.bindStore(f.store,()=>true),/already bound/);
        for(const operation of operations){
          assert.throws(()=>invoke(f.store,operation),/permission denied/);
          assert.throws(()=>f.permissions.withPermission(f.store,identity,operation,args(operation),p=>invoke(f.store,operation,p)),/scope denied/);
        }
        unchanged(f,before,identity);
        release.resolve();assert.equal((await pending).status,'ADMITTED');assert.equal(f.resets(),1);
        assert.equal(gate.startQuickWork(gate.generation()).status,'COMMITTED');assert.equal(f.resets(),2);
      }finally{release.resolve();await pending;}
    });
    await t.test('UNKNOWN Open keeps direct replacement permission closed after settlement',async t=>{
      const f=fresh();t.after(f.restore);const view=f.store.getProject,identity=f.store.getSessionGeneration();
      const gate=new ProjectReplacementGateProof(f.store,ProjectValidationError,{epoch:'boundary-epoch',permissions:f.permissions});
      f.store.getProject=function(){if(this.getSessionGeneration()!==identity)throw new ProjectValidationError('Injected post-commit view failure');return view.call(this);};
      const input={epoch:'boundary-epoch',attemptId:'unknown-open',originatingGeneration:gate.generation(),payload:payload()};
      try{
        const result=await gate.importProjectJson(input);assert.equal(result.status,'UNKNOWN');f.store.getProject=view;
        const current=f.store.getSession(),currentIdentity=f.store.getSessionGeneration();
        assert.deepEqual(await gate.settle(input),result);
        for(const operation of operations)assert.throws(()=>invoke(f.store,operation),/permission denied/);
        assert.equal(gate.startQuickWork(gate.generation()).status,'BLOCKED');assert.equal(gate.state().unresolved,true);
        unchanged(f,current,currentIdentity,1);
      }finally{f.store.getProject=view;}
    });
    await t.test('a controlled deferred direct call cannot reuse a permission after terminal return',async t=>{
      const f=fresh();t.after(f.restore);const release=deferred(),before=f.store.getSession(),identity=f.store.getSessionGeneration();
      let late:Promise<void>=Promise.resolve();
      f.permissions.withPermission(f.store,identity,'startQuickWork',[],p=>{
        late=release.promise.then(()=>{assert.throws(()=>f.store.startQuickWork(p),/permission denied/);});
      });
      try{unchanged(f,before,identity);release.resolve();await late;unchanged(f,before,identity);}
      finally{release.resolve();await late;}
    });
    assert.equal(forbidden,0);
  });
}finally{
  net.Socket.prototype.connect=originals.connect;net.Server.prototype.listen=originals.listen;
  dgram.createSocket=originals.udp;globalThis.fetch=originals.fetch;
}
