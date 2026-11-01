import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import dgram from 'node:dgram';
import { isolatedReplacementLifecycle } from './support/project_replacement_lifecycle.ts';
import { ProjectReplacementGateProof } from './support/project_replacement_gate.ts';

let forbidden=0;
const originals={connect:net.Socket.prototype.connect,listen:net.Server.prototype.listen,udp:dgram.createSocket,fetch:globalThis.fetch};
const deny=():never=>{forbidden++;throw Error('Forbidden retirement proof transport');};
net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;dgram.createSocket=deny;globalThis.fetch=deny;
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
const payload=JSON.stringify({id:'retirement-project',name:'Synthetic retirement project',siteLocation:'Synthetic',
  createdAt:'2026-11-01T12:00:00Z',updatedAt:'2026-11-01T12:00:00Z',devices:[],totalDevices:0,collisions:[],rogueDhcpEvents:[],auditLogs:[]});

try{
  await test('isolated replacement lifecycle retirement',{timeout:10000},async t=>{
    const {SiteProjectDatabase,ProjectValidationError}=await import('../core/storage/project_db.ts');
    function fresh(beforeOpenActivation?:()=>Promise<void>){
      const protectedStore=isolatedReplacementLifecycle(SiteProjectDatabase,ProjectValidationError);
      const owner=protectedStore.claim({epoch:'retirement-epoch',beforeOpenActivation});
      const input={epoch:'retirement-epoch',attemptId:'open',originatingGeneration:owner.generation(),payload};
      return {protectedStore,store:protectedStore.store,owner,input};
    }
    await t.test('fresh protected store has one permanent lifecycle claim',()=>{
      const f=fresh();assert.equal(f.owner.startQuickWork(f.owner.generation()).status,'COMMITTED');
      assert.throws(()=>f.protectedStore.claim({epoch:'second'}),/already claimed/);
      assert.throws(()=>new ProjectReplacementGateProof(f.store,ProjectValidationError,{epoch:'bypass'}),/already owns/);
      f.owner.retire();assert.throws(()=>f.protectedStore.claim({epoch:'after-retirement'}),/already claimed/);
    });
    for(const operation of ['startQuickWork','createNewProject','createProjectFromCurrentResults','importProjectJson'] as const)
    await t.test('retired direct '+operation+' is denied before mutation',()=>{
      const f=fresh();f.owner.createNewProject(f.owner.generation(),'Prior','Site','Notes');
      const before=f.store.getSession(),generation=f.store.getSessionGeneration();f.owner.retire();
      assert.throws(()=>{
        switch(operation){
          case 'startQuickWork':return f.store.startQuickWork();
          case 'createNewProject':return f.store.createNewProject('Next');
          case 'createProjectFromCurrentResults':return f.store.createProjectFromCurrentResults('Next');
          case 'importProjectJson':return f.store.importProjectJson(payload);
        }
      },/permission denied/);
      assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),generation);
      assert.deepEqual(f.owner.startQuickWork(f.owner.generation()),{status:'BLOCKED',reason:'AUTHORITY_RETIRED'});
    });
    await t.test('retirement invalidates a previously issued grant even inside its live synchronous scope',()=>{
      const f=fresh(),original=f.store.startQuickWork,before=f.store.getSession(),generation=f.store.getSessionGeneration();
      let captured:unknown;
      f.store.startQuickWork=function(permission){
        captured=permission;assert.ok(permission);f.owner.retire();
        assert.throws(()=>original.call(this,permission),/permission denied/);
        return original.call(this,permission);
      };
      try{
        assert.equal(f.owner.startQuickWork(f.owner.generation()).status,'REJECTED_BEFORE_ACTIVATION');
        assert.throws(()=>original.call(f.store,captured),/permission denied/);
        assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),generation);
      }finally{f.store.startQuickWork=original;}
    });
    await t.test('held Open cannot activate after synchronous retirement and drains only after release',async()=>{
      const entered=deferred(),release=deferred(),f=fresh(async()=>{entered.resolve();await release.promise;});
      const before=f.store.getSession(),generation=f.store.getSessionGeneration(),pending=f.owner.importProjectJson(f.input);
      try{
        await entered.promise;
        const first=f.owner.retire();assert.equal(first.retired,true);assert.equal(first.drain,'UNRESOLVED');assert.equal(first.pendingContinuations,1);
        assert.deepEqual(f.owner.retire(),first);
        assert.throws(()=>f.protectedStore.claim({epoch:'new-owner'}),/already claimed/);
        // No timer or timeout proves settlement. Arbitrarily held work stays unresolved.
        for(let i=0;i<8;i++)await Promise.resolve();
        assert.equal(f.owner.retirementState().drain,'UNRESOLVED');
        assert.equal(f.owner.status(f.input).status,'PENDING');
        release.resolve();assert.equal((await pending).status,'UNKNOWN');
        assert.equal(f.owner.retirementState().drain,'COMPLETE');
        assert.equal(f.owner.retirementState().unresolvedActivation,true);
        assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),generation);
      }finally{release.resolve();await pending;}
    });
    await t.test('never-settling preparation cannot report successful draining or release queued work',async()=>{
      const never=new Promise<void>(()=>{}),entered=deferred(),cleanupRelease=deferred();
      // The preparation itself never settles. A test-owned escape releases its
      // waiting wrapper only during cleanup, without timers or external resources.
      const f=fresh(async()=>{entered.resolve();await Promise.race([never,cleanupRelease.promise]);});
      const before=f.store.getSession(),generation=f.store.getSessionGeneration();
      const first=f.owner.importProjectJson(f.input);
      const second=f.owner.importProjectJson({...f.input,attemptId:'queued'});
      try{
        await entered.promise;assert.equal(f.owner.retire().pendingContinuations,2);
        for(let i=0;i<8;i++)await Promise.resolve();
        assert.equal(f.owner.retirementState().drain,'UNRESOLVED');
        assert.equal(f.owner.retirementState().pendingContinuations,2);
        assert.throws(()=>f.protectedStore.claim({epoch:'bypass-unresolved'}),/already claimed/);
        assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),generation);
      }finally{cleanupRelease.resolve();await Promise.all([first,second]);}
      assert.equal(f.owner.retirementState().drain,'COMPLETE');
      assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),generation);
    });
    await t.test('retirement preserves admitted records and does not start new admissions',async()=>{
      const f=fresh(),admitted=await f.owner.importProjectJson(f.input);assert.equal(admitted.status,'ADMITTED');
      const before=f.store.getSession(),generation=f.store.getSessionGeneration();
      assert.equal(f.owner.retire().drain,'COMPLETE');
      assert.deepEqual(f.owner.status(f.input),admitted);assert.deepEqual(await f.owner.settle(f.input),admitted);
      assert.deepEqual(await f.owner.importProjectJson(f.input),admitted);
      const absent={...f.input,attemptId:'after-retirement',originatingGeneration:f.owner.generation()};
      assert.deepEqual(await f.owner.importProjectJson(absent),{epoch:absent.epoch,attemptId:absent.attemptId,status:'UNKNOWN',reason:'NOT_FOUND'});
      assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),generation);
    });
    await t.test('post-commit UNKNOWN remains unresolved after completed draining and repeated retirement',async()=>{
      const f=fresh(),view=f.store.getProject,identity=f.store.getSessionGeneration();
      f.store.getProject=function(){if(this.getSessionGeneration()!==identity)throw new ProjectValidationError('Synthetic post-commit view failure');return view.call(this);};
      let result;
      try{result=await f.owner.importProjectJson(f.input);}finally{f.store.getProject=view;}
      assert.equal(result.status,'UNKNOWN');assert.equal(f.store.getSession().project.id,'retirement-project');
      const before=f.store.getSession(),generation=f.store.getSessionGeneration(),retired=f.owner.retire();
      assert.equal(retired.drain,'COMPLETE');assert.equal(retired.unresolvedActivation,true);
      assert.deepEqual(f.owner.retire(),retired);assert.deepEqual(await f.owner.settle(f.input),result);
      assert.throws(()=>f.protectedStore.claim({epoch:'new'}),/already claimed/);
      assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),generation);
    });
    await t.test('retirement with no owned work is synchronous and idempotent',()=>{
      const f=fresh(),result=f.owner.retire();assert.equal(result instanceof Promise,false);
      assert.deepEqual(result,{retired:true,drain:'COMPLETE',pendingContinuations:0,unresolvedActivation:false});
      assert.deepEqual(f.owner.retire(),result);
    });
    await t.test('unprotected technician stores retain ordinary replacement behavior',()=>{
      const store=new SiteProjectDatabase();assert.equal(store.startQuickWork().name,'Quick Work');
      assert.equal(store.createNewProject('Normal').name,'Normal');assert.equal(store.createProjectFromCurrentResults('From').name,'From');
      assert.equal(store.importProjectJson(payload).id,'retirement-project');
    });
    assert.equal(forbidden,0);
  });
}finally{
  net.Socket.prototype.connect=originals.connect;net.Server.prototype.listen=originals.listen;
  dgram.createSocket=originals.udp;globalThis.fetch=originals.fetch;
}
