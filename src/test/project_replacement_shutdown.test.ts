import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import dgram from 'node:dgram';
import { isolatedReplacementLifecycle } from './support/project_replacement_lifecycle.ts';
import type { ProjectReplacementGateProof } from './support/project_replacement_gate.ts';

let forbidden=0;
const originals={connect:net.Socket.prototype.connect,listen:net.Server.prototype.listen,udp:dgram.createSocket,fetch:globalThis.fetch};
const deny=():never=>{forbidden++;throw Error('Forbidden shutdown proof transport');};
net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;dgram.createSocket=deny;globalThis.fetch=deny;
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
const payload=JSON.stringify({id:'shutdown-project',name:'Synthetic shutdown project',siteLocation:'Synthetic',
  createdAt:'2026-11-01T12:00:00Z',updatedAt:'2026-11-01T12:00:00Z',devices:[],totalDevices:0,collisions:[],rogueDhcpEvents:[],auditLogs:[]});

/** Test-local composition only: no backend, process, timers or external resources.
 * Cleanup completion and owned-operation draining are deliberately separate.
 */
function shutdownFixture(owner:ProjectReplacementGateProof){
  const cleanup=deferred(),entered=deferred(),events:string[]=[];
  let cleanupComplete=false;
  const status=()=>Object.freeze({cleanupComplete,authority:owner.retirementState()});
  let closing:Promise<ReturnType<typeof status>>|undefined;
  function shutdown(){
    if(closing)return closing;
    owner.retire(); // Must revoke in this call stack, before scheduling cleanup.
    events.push('retired');
    closing=Promise.resolve().then(async()=>{
      events.push('cleanup-start');entered.resolve();
      await cleanup.promise;
      cleanupComplete=true;events.push('cleanup-complete');
      return status();
    });
    return closing;
  }
  return {shutdown,status,events,entered:entered.promise,release:cleanup.resolve};
}

try{
  await test('isolated replacement shutdown composition',{timeout:10000},async t=>{
    const {SiteProjectDatabase,ProjectValidationError}=await import('../core/storage/project_db.ts');
    function fresh(beforeOpenActivation?:()=>Promise<void>){
      const protectedStore=isolatedReplacementLifecycle(SiteProjectDatabase,ProjectValidationError);
      const owner=protectedStore.claim({epoch:'shutdown-epoch',beforeOpenActivation});
      const input={epoch:'shutdown-epoch',attemptId:'open',originatingGeneration:owner.generation(),payload};
      return {store:protectedStore.store,owner,input};
    }
    await t.test('retirement is synchronous and all four direct replacements remain denied during held cleanup',async()=>{
      const f=fresh();assert.equal(f.owner.createNewProject(f.owner.generation(),'Prior project','Exact site','Exact description').status,'COMMITTED');
      const before=f.store.getSession(),generation=f.store.getSessionGeneration(),shutdown=shutdownFixture(f.owner);
      const closing=shutdown.shutdown();
      try{
        assert.equal(f.owner.retirementState().retired,true);
        assert.deepEqual(shutdown.events,['retired']); // No cleanup microtask has run.
        assert.equal(shutdown.shutdown(),closing);
        await shutdown.entered;
        assert.deepEqual(shutdown.events,['retired','cleanup-start']);assert.equal(shutdown.status().cleanupComplete,false);
        for(const action of [()=>f.store.startQuickWork(),()=>f.store.createNewProject('Next'),
          ()=>f.store.createProjectFromCurrentResults('Next'),()=>f.store.importProjectJson(payload)]){
          assert.throws(action,/permission denied/);
          assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),generation);
        }
        shutdown.release();const finished=await closing;
        assert.equal(finished.cleanupComplete,true);assert.equal(finished.authority.drain,'COMPLETE');
        assert.equal(shutdown.shutdown(),closing);
        assert.deepEqual(shutdown.events,['retired','cleanup-start','cleanup-complete']);
      }finally{shutdown.release();await closing;}
    });
    await t.test('shutdown revokes a grant already issued inside its synchronous commit scope',async()=>{
      const f=fresh(),shutdown=shutdownFixture(f.owner),original=f.store.startQuickWork;
      const before=f.store.getSession(),generation=f.store.getSessionGeneration();let captured:unknown;
      f.store.startQuickWork=function(permission){
        captured=permission;assert.ok(permission);shutdown.shutdown();
        assert.equal(f.owner.retirementState().retired,true);assert.deepEqual(shutdown.events,['retired']);
        return original.call(this,permission);
      };
      try{
        assert.equal(f.owner.startQuickWork(f.owner.generation()).status,'REJECTED_BEFORE_ACTIVATION');
        await shutdown.entered;
        assert.throws(()=>original.call(f.store,captured),/permission denied/);
        assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),generation);
      }finally{f.store.startQuickWork=original;shutdown.release();await shutdown.shutdown();}
    });
    await t.test('cleanup completion cannot claim draining while Open preparation remains held',async()=>{
      const preparation=deferred(),entered=deferred(),f=fresh(async()=>{entered.resolve();await preparation.promise;});
      const shutdown=shutdownFixture(f.owner),before=f.store.getSession(),generation=f.store.getSessionGeneration();
      const pending=f.owner.importProjectJson(f.input);
      try{
        await entered.promise;const closing=shutdown.shutdown();await shutdown.entered;
        assert.equal(shutdown.status().authority.drain,'UNRESOLVED');assert.equal(f.owner.status(f.input).status,'PENDING');
        assert.throws(()=>f.store.importProjectJson(payload),/permission denied/);
        shutdown.release();const cleaned=await closing;
        assert.equal(cleaned.cleanupComplete,true);assert.equal(cleaned.authority.drain,'UNRESOLVED');
        assert.equal(cleaned.authority.pendingContinuations,1);assert.equal(shutdown.shutdown(),closing);
        preparation.resolve();assert.equal((await pending).status,'UNKNOWN');
        assert.equal(shutdown.status().authority.drain,'COMPLETE');assert.equal(shutdown.status().authority.unresolvedActivation,true);
        assert.equal(cleaned.authority.drain,'UNRESOLVED'); // Original cleanup report never claimed otherwise.
        assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),generation);
      }finally{preparation.resolve();shutdown.release();await Promise.all([pending,shutdown.shutdown()]);}
    });
    await t.test('completed admission survives held cleanup and repeated shutdown without rollback',async()=>{
      const f=fresh(),admitted=await f.owner.importProjectJson(f.input);assert.equal(admitted.status,'ADMITTED');
      const before=f.store.getSession(),generation=f.store.getSessionGeneration(),shutdown=shutdownFixture(f.owner);
      const closing=shutdown.shutdown();
      try{
        await shutdown.entered;assert.deepEqual(f.owner.status(f.input),admitted);
        assert.deepEqual(await f.owner.settle(f.input),admitted);assert.equal(shutdown.shutdown(),closing);
        shutdown.release();assert.equal((await closing).authority.drain,'COMPLETE');
        assert.deepEqual(f.owner.status(f.input),admitted);
        assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),generation);
      }finally{shutdown.release();await closing;}
    });
    await t.test('completed cleanup and draining do not resolve post-commit UNKNOWN',async()=>{
      const f=fresh(),view=f.store.getProject,identity=f.store.getSessionGeneration();
      f.store.getProject=function(){if(this.getSessionGeneration()!==identity)throw new ProjectValidationError('Synthetic view failure');return view.call(this);};
      let unknown;
      try{unknown=await f.owner.importProjectJson(f.input);}finally{f.store.getProject=view;}
      assert.equal(unknown.status,'UNKNOWN');assert.equal(f.store.getSession().project.id,'shutdown-project');
      const before=f.store.getSession(),generation=f.store.getSessionGeneration(),shutdown=shutdownFixture(f.owner);
      const closing=shutdown.shutdown();
      try{
        await shutdown.entered;assert.equal(shutdown.status().authority.unresolvedActivation,true);
        assert.deepEqual(await f.owner.settle(f.input),unknown);
        shutdown.release();const finished=await closing;
        assert.equal(finished.cleanupComplete,true);assert.equal(finished.authority.drain,'COMPLETE');
        assert.equal(finished.authority.unresolvedActivation,true);assert.deepEqual(f.owner.status(f.input),unknown);
        assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),generation);
      }finally{shutdown.release();await closing;}
    });
    assert.equal(forbidden,0);
  });
}finally{
  net.Socket.prototype.connect=originals.connect;net.Server.prototype.listen=originals.listen;
  dgram.createSocket=originals.udp;globalThis.fetch=originals.fetch;
}
