import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ProjectOpenAdmissionCoordinatorPrototype as Coordinator,
  type ActivationResult, type OpenAdmissionInput,
} from '../core/projects/project_open_admission_coordinator_prototype.ts';

// Pure synthetic state and controlled promises only: no storage, files, workers or transports.
const identity=(attemptId='attempt-a',epoch='epoch-a')=>({epoch,attemptId});
const input=(attemptId='attempt-a',originatingGeneration='generation-0',payload='synthetic-A'):OpenAdmissionInput=>
  ({...identity(attemptId),originatingGeneration,payload});
function deferred<T>(){
  let resolve!:(value:T|PromiseLike<T>)=>void;
  const promise=new Promise<T>(done=>{resolve=done;});
  return {promise,resolve};
}
function fixture(options:{capacity?:number;maxPayloadCharacters?:number;activation?:(request:Readonly<OpenAdmissionInput>)=>ActivationResult|Promise<ActivationResult>}={}){
  let generation='generation-0',calls=0;
  const coordinator=new Coordinator({epoch:'epoch-a',capacity:options.capacity??8,maxPayloadCharacters:options.maxPayloadCharacters,
    currentGeneration:()=>generation,activate:request=>{
      calls++;
      if(options.activation)return options.activation(request);
      generation='generation-'+calls;
      return {status:'ADMITTED',projectId:'project-'+calls,activatedGeneration:generation};
    }});
  return {coordinator,calls:()=>calls,generation:()=>generation,setGeneration:(value:string)=>{generation=value;}};
}

await test('isolated Project Open admission coordinator prototype',{timeout:10000},async t=>{
  await t.test('normal activation records the correlated terminal generation',async()=>{
    const f=fixture(),result=await f.coordinator.admit(input());
    assert.deepEqual(result,{...identity(),status:'ADMITTED',projectId:'project-1',activatedGeneration:'generation-1'});
    assert.deepEqual(f.coordinator.status(identity()),result);assert.equal(f.calls(),1);
  });
  await t.test('known pre-activation validation rejection leaves the generation unchanged',async()=>{
    const f=fixture({activation:()=>({status:'REJECTED_BEFORE_ACTIVATION',reason:'VALIDATION_REJECTED'})});
    assert.deepEqual(await f.coordinator.admit(input()),{...identity(),status:'REJECTED_BEFORE_ACTIVATION',reason:'VALIDATION_REJECTED'});
    assert.equal(f.generation(),'generation-0');assert.equal(f.calls(),1);
  });
  await t.test('characterization: deliberately contract-violating adapter activates after terminal rejection',async()=>{
    const release=deferred<void>();let lateWrite:Promise<void>=Promise.resolve(),writes=0;
    const f=fixture({activation:()=>{
      // Deliberately hidden from the returned result: this violates the adapter contract.
      lateWrite=release.promise.then(()=>{writes++;f.setGeneration('hidden-late-generation');});
      return {status:'REJECTED_BEFORE_ACTIVATION',reason:'VALIDATION_REJECTED'};
    }});
    try{
      const rejected=await f.coordinator.admit(input());
      assert.deepEqual(rejected,{...identity(),status:'REJECTED_BEFORE_ACTIVATION',reason:'VALIDATION_REJECTED'});
      assert.deepEqual(await f.coordinator.settle(identity()),rejected);
      assert.equal(f.generation(),'generation-0');assert.equal(writes,0);
      release.resolve();await lateWrite;
      assert.equal(f.generation(),'hidden-late-generation');assert.equal(writes,1);
      // Characterize the trusted-adapter limit; do not weaken or rewrite terminal semantics.
      assert.deepEqual(f.coordinator.status(identity()),rejected);
      assert.deepEqual(await f.coordinator.admit(input()),rejected);
      assert.deepEqual(await f.coordinator.settle(identity()),rejected);assert.equal(f.calls(),1);
    }finally{release.resolve();await lateWrite;}
  });
  await t.test('identical pending and terminal replay share one activation',async()=>{
    const release=deferred<ActivationResult>(),entered=deferred<void>();
    const f=fixture({activation:()=>{entered.resolve();return release.promise;}});
    const first=f.coordinator.admit(input()),duplicate=f.coordinator.admit(input());
    assert.equal(first,duplicate);assert.equal(f.coordinator.status(identity()).status,'PENDING');
    await entered.promise;f.setGeneration('generation-1');release.resolve({status:'ADMITTED',projectId:'project-1',activatedGeneration:'generation-1'});
    assert.deepEqual(await duplicate,await first);assert.deepEqual(await f.coordinator.admit(input()),await first);assert.equal(f.calls(),1);
  });
  await t.test('conflicting payload is refused while the original activation is pending',async()=>{
    const release=deferred<ActivationResult>(),entered=deferred<void>();
    const f=fixture({activation:()=>{entered.resolve();return release.promise;}});
    const first=f.coordinator.admit(input());await entered.promise;
    assert.deepEqual(await f.coordinator.admit(input('attempt-a','generation-0','synthetic-B')),{...identity(),status:'UNKNOWN',reason:'IDENTITY_CONFLICT'});
    assert.equal(f.coordinator.status(identity()).status,'PENDING');assert.equal(f.calls(),1);
    f.setGeneration('generation-1');release.resolve({status:'ADMITTED',projectId:'project-1',activatedGeneration:'generation-1'});await first;
  });
  await t.test('reusing an identity with a different originating generation cannot erase its terminal result',async()=>{
    const f=fixture(),original=await f.coordinator.admit(input());
    assert.equal((await f.coordinator.admit(input('attempt-a','generation-1'))).status,'UNKNOWN');
    assert.deepEqual(f.coordinator.status(identity()),original);assert.equal(f.calls(),1);
  });
  await t.test('settlement before delayed admission reserves a permanent rejection tombstone',async()=>{
    const f=fixture(),settlement=f.coordinator.settle(identity()),late=f.coordinator.admit(input());
    assert.equal(f.coordinator.status(identity()).status,'PENDING');
    const expected={...identity(),status:'REJECTED_BEFORE_ACTIVATION',reason:'SETTLED_BEFORE_ARRIVAL'};
    assert.deepEqual(await settlement,expected);assert.deepEqual(await late,expected);
    assert.deepEqual(await f.coordinator.admit(input('attempt-a','generation-0','different synthetic payload')),expected);
    assert.deepEqual(await f.coordinator.settle(identity()),expected);assert.equal(f.calls(),0);
  });
  await t.test('settlement after completed admission reports admission without rollback',async()=>{
    const f=fixture(),admitted=await f.coordinator.admit(input());
    assert.deepEqual(await f.coordinator.settle(identity()),admitted);assert.equal(f.generation(),'generation-1');assert.equal(f.calls(),1);
  });
  await t.test('settlement cannot claim rejection while its earlier activation is outstanding',async()=>{
    const release=deferred<ActivationResult>(),entered=deferred<void>();
    const f=fixture({activation:()=>{entered.resolve();return release.promise;}});
    const admission=f.coordinator.admit(input());await entered.promise;
    const settlement=f.coordinator.settle(identity());let settled=false;void settlement.then(()=>{settled=true;});
    await Promise.resolve();assert.equal(settled,false);assert.equal(f.coordinator.status(identity()).status,'PENDING');
    f.setGeneration('generation-1');release.resolve({status:'ADMITTED',projectId:'project-1',activatedGeneration:'generation-1'});
    assert.deepEqual(await settlement,await admission);assert.equal(f.calls(),1);
  });
  await t.test('overlapping attempts from one generation admit only the first serialized attempt',async()=>{
    const release=deferred<ActivationResult>(),entered=deferred<void>();
    const f=fixture({activation:()=>{entered.resolve();return release.promise;}});
    const first=f.coordinator.admit(input()),second=f.coordinator.admit(input('attempt-b'));
    await entered.promise;assert.equal(f.calls(),1);assert.equal(f.coordinator.status(identity('attempt-b')).status,'PENDING');
    f.setGeneration('generation-1');release.resolve({status:'ADMITTED',projectId:'project-1',activatedGeneration:'generation-1'});
    assert.equal((await first).status,'ADMITTED');
    assert.deepEqual(await second,{...identity('attempt-b'),status:'REJECTED_BEFORE_ACTIVATION',reason:'STALE_GENERATION'});
    assert.equal(f.calls(),1);
  });
  await t.test('an already stale generation is rejected without activation',async()=>{
    const f=fixture();
    assert.deepEqual(await f.coordinator.admit(input('attempt-a','old-generation')),{...identity(),status:'REJECTED_BEFORE_ACTIVATION',reason:'STALE_GENERATION'});
    assert.equal(f.calls(),0);assert.equal(f.generation(),'generation-0');
  });
  await t.test('capacity exhaustion cannot evict tombstones or pretend to settle an unrecorded ID',async()=>{
    const f=fixture({capacity:2});
    const a=await f.coordinator.settle(identity()),b=await f.coordinator.settle(identity('attempt-b'));
    assert.deepEqual(await f.coordinator.admit(input('attempt-c')),{...identity('attempt-c'),status:'UNKNOWN',reason:'CAPACITY_EXHAUSTED'});
    assert.deepEqual(await f.coordinator.settle(identity('attempt-c')),{...identity('attempt-c'),status:'UNKNOWN',reason:'CAPACITY_EXHAUSTED'});
    assert.deepEqual(await f.coordinator.admit(input()),a);assert.deepEqual(f.coordinator.status(identity('attempt-b')),b);
    assert.deepEqual(f.coordinator.status(identity('attempt-c')),{...identity('attempt-c'),status:'UNKNOWN',reason:'NOT_FOUND'});
    assert.equal(f.calls(),0);
  });
  await t.test('an ambiguous failure following activation remains UNKNOWN and blocks further activations',async()=>{
    const f=fixture({activation:()=>{f.setGeneration('possibly-activated');throw Error('Synthetic sensitive adapter detail');}});
    const outcome=await f.coordinator.admit(input());
    assert.deepEqual(outcome,{...identity(),status:'UNKNOWN',reason:'ACTIVATION_UNCERTAIN'});
    assert.deepEqual(await f.coordinator.settle(identity()),outcome);
    assert.deepEqual(await f.coordinator.admit(input('attempt-b','possibly-activated')),{...identity('attempt-b'),status:'REJECTED_BEFORE_ACTIVATION',reason:'AUTHORITY_UNCERTAIN'});
    assert.equal(f.calls(),1);assert.ok(!JSON.stringify(outcome).includes('sensitive'));
  });
  await t.test('a thrown failure without a changed generation is still not proof of rejection',async()=>{
    const f=fixture({activation:()=>{throw Error('Synthetic failure');}});
    assert.equal((await f.coordinator.admit(input())).status,'UNKNOWN');assert.equal(f.generation(),'generation-0');
    assert.equal((await f.coordinator.settle(identity())).status,'UNKNOWN');assert.equal(f.calls(),1);
  });
  await t.test('a rejection claim after generation mutation is treated as ambiguous',async()=>{
    const f=fixture({activation:()=>{f.setGeneration('unexpected-generation');return {status:'REJECTED_BEFORE_ACTIVATION',reason:'VALIDATION_REJECTED'};}});
    assert.deepEqual(await f.coordinator.admit(input()),{...identity(),status:'UNKNOWN',reason:'ACTIVATION_UNCERTAIN'});
    assert.equal((await f.coordinator.settle(identity())).status,'UNKNOWN');
  });
  await t.test('an inconsistent admitted generation cannot produce false terminal success',async()=>{
    const f=fixture({activation:()=>({status:'ADMITTED',projectId:'project-1',activatedGeneration:'not-the-current-generation'})});
    assert.equal((await f.coordinator.admit(input())).status,'UNKNOWN');
    assert.equal((await f.coordinator.admit(input('attempt-b'))).status,'REJECTED_BEFORE_ACTIVATION');assert.equal(f.calls(),1);
  });
  await t.test('status of an unknown attempt does not reserve capacity or establish rejection',async()=>{
    const f=fixture({capacity:1});
    assert.deepEqual(f.coordinator.status(identity()),{...identity(),status:'UNKNOWN',reason:'NOT_FOUND'});
    assert.equal((await f.coordinator.admit(input('attempt-b'))).status,'ADMITTED');assert.equal(f.calls(),1);
  });
  await t.test('stale epoch admission, status and settlement do not touch the current registry',async()=>{
    const f=fixture({capacity:1}),old={...input(),epoch:'old-epoch'};
    const unknown={...identity('attempt-a','old-epoch'),status:'UNKNOWN',reason:'EPOCH_MISMATCH'};
    assert.deepEqual(await f.coordinator.admit(old),unknown);assert.deepEqual(f.coordinator.status(old),unknown);
    assert.deepEqual(await f.coordinator.settle(old),unknown);
    assert.equal((await f.coordinator.settle(identity())).status,'REJECTED_BEFORE_ACTIVATION');assert.equal(f.calls(),0);
  });
  await t.test('settlement reservations serialize behind another activation and block a delayed admission',async()=>{
    const release=deferred<ActivationResult>(),entered=deferred<void>();
    const f=fixture({activation:()=>{entered.resolve();return release.promise;}});
    const first=f.coordinator.admit(input());await entered.promise;
    const settlement=f.coordinator.settle(identity('attempt-b')),late=f.coordinator.admit(input('attempt-b'));
    assert.equal(f.coordinator.status(identity('attempt-b')).status,'PENDING');assert.equal(f.calls(),1);
    f.setGeneration('generation-1');release.resolve({status:'ADMITTED',projectId:'project-1',activatedGeneration:'generation-1'});
    await first;assert.equal((await settlement).status,'REJECTED_BEFORE_ACTIVATION');assert.deepEqual(await late,await settlement);assert.equal(f.calls(),1);
  });
  await t.test('queued input and public observations cannot be mutated by the caller',async()=>{
    const release=deferred<ActivationResult>(),entered=deferred<void>();
    const f=fixture({activation:request=>{assert.ok(Object.isFrozen(request));entered.resolve();return release.promise;}});
    const first=f.coordinator.admit(input());await entered.promise;
    const mutable={...input('attempt-b')},second=f.coordinator.admit(mutable);
    mutable.originatingGeneration='generation-1';mutable.payload='changed after submission';mutable.attemptId='attempt-c';
    assert.ok(Object.isFrozen(f.coordinator.status(identity('attempt-b'))));
    f.setGeneration('generation-1');release.resolve({status:'ADMITTED',projectId:'project-1',activatedGeneration:'generation-1'});
    await first;const result=await second;
    assert.deepEqual(result,{...identity('attempt-b'),status:'REJECTED_BEFORE_ACTIVATION',reason:'STALE_GENERATION'});
    assert.ok(Object.isFrozen(result));assert.equal(f.calls(),1);
  });
  await t.test('a new epoch does not prove the previous authority was retired',async()=>{
    const release=deferred<ActivationResult>(),entered=deferred<void>();
    const old=fixture({activation:()=>{entered.resolve();return release.promise;}});
    const pending=old.coordinator.admit(input());await entered.promise;
    const fresh=new Coordinator({epoch:'epoch-b',capacity:1,currentGeneration:()=> 'fresh-generation',
      activate:()=>{throw Error('Fresh coordinator must not activate an old-epoch request');}});
    assert.equal((await fresh.admit(input())).status,'UNKNOWN');assert.equal(fresh.status({...identity(),epoch:'epoch-b'}).status,'UNKNOWN');
    old.setGeneration('generation-1');release.resolve({status:'ADMITTED',projectId:'project-1',activatedGeneration:'generation-1'});
    assert.equal((await pending).status,'ADMITTED','Old authority remains independently capable of activation');
  });
  await t.test('invalid bounds and oversized inputs fail without activation or unsafe settlement',async()=>{
    assert.throws(()=>fixture({capacity:0}));assert.throws(()=>fixture({capacity:Infinity}));
    const f=fixture({capacity:1,maxPayloadCharacters:4});
    assert.deepEqual(await f.coordinator.admit(input()),{...identity(),status:'UNKNOWN',reason:'INVALID_INPUT'});
    assert.equal((await f.coordinator.settle(identity(''))).status,'UNKNOWN');
    assert.equal((await f.coordinator.settle(identity())).status,'REJECTED_BEFORE_ACTIVATION');assert.equal(f.calls(),0);
  });
});
