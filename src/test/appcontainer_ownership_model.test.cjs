'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),crypto=require('node:crypto'),Module=require('node:module'),cp=require('node:child_process'),vm=require('node:vm'),net=require('node:net'),dgram=require('node:dgram'),http=require('node:http'),https=require('node:https');
const model=require('./support/appcontainer_ownership_model.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function fresh(){const world=model.createOwnershipWorld(true),owner=world.newRun();return {world,owner,id:owner.snapshot().runId};}
function populate(owner,count=model.KINDS.length){for(const kind of model.KINDS.slice(0,count)){owner.intent(kind);owner.create(kind);}}
function finish(owner){for(const step of model.STEPS.slice(owner.snapshot().cleanupIndex))owner.cleanupStep(step);}
function ready(){const f=fresh();populate(f.owner);f.owner.attest();return f;}
test('inert AppContainer ownership and recovery contract',async t=>{
 const paths=['src/test/support/appcontainer_ownership_model.cjs','src/test/appcontainer_ownership_model.test.cjs','native/ApplicationCompanion/OwnedChild.cs','native/ApplicationCompanion/WindowsBoundary.cs'];
 const inputs=paths.map(p=>({p,hash:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}));
 const source=fs.readFileSync(paths[0],'utf8'),environment={...process.env},cache=Object.keys(require.cache).sort(),patches=[];let forbidden=0;
 const deny=()=>{forbidden++;throw Error('Forbidden OS/process/network/evaluation operation');};
 const patch=(owner,key)=>{if(typeof owner[key]==='function'){patches.push({owner,key,original:owner[key]});owner[key]=deny;}};
 for(const key of ['openSync','readFileSync','readSync','writeFileSync','appendFileSync','mkdirSync','mkdtempSync','rmSync','rmdirSync','unlinkSync','renameSync','chmodSync','chownSync','createWriteStream','copyFileSync','linkSync','symlinkSync'])patch(fs,key);
 for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])patch(cp,key);
 for(const key of ['registerHooks','register'])patch(Module,key);
 for(const key of ['Script','SourceTextModule','SyntheticModule','compileFunction','runInThisContext','runInNewContext','runInContext'])patch(vm,key);
 patch(net.Socket.prototype,'connect');patch(net.Server.prototype,'listen');patch(dgram,'createSocket');patch(globalThis,'fetch');
 for(const owner of [http,https])for(const key of ['get','request'])patch(owner,key);
 const originalLoad=Module._load;Module._load=function(request,...args){if(!Module.isBuiltin(request))return deny();return originalLoad.call(this,request,...args);};
 try{
  await t.test('explicit opt-in, no resume mechanism or native API surface',()=>{
   for(const value of [undefined,false,'true',1,{}])assert.throws(()=>model.createOwnershipWorld(value),/opt-in/);
   assert.doesNotMatch(source,/ResumeThread|CreateProcessW|CreateAppContainerProfile|process\.binding|child_process|\.resume\s*\(/);
   const {owner}=fresh();assert.deepEqual(Object.keys(owner),['intent','create','attest','beginCleanup','cleanupStep','snapshot','assess']);
  });
  await t.test('unique run reservations and exclusive recovery records',()=>{
   const world=model.createOwnershipWorld(true),a=world.newRun(),b=world.newRun();assert.notEqual(a.snapshot().runId,b.snapshot().runId);
   assert.notEqual(a.snapshot().recoveryRecord.receipt,b.snapshot().recoveryRecord.receipt);assert.throws(()=>world.newRun(true),/collision/);
   assert.equal(world.newRun().snapshot().state,'IntentRecorded');
  });
  await t.test('fixed policy is represented without actual OS authority',()=>{
   assert.deepEqual(model.POLICY,{activeProcessLimit:1,processMemoryBytes:128*1024*1024,jobMemoryBytes:128*1024*1024,cpuHardCapPercent:10,externalDeadlineMs:5000});
   assert.ok(Object.isFrozen(model.POLICY));const {owner}=fresh();for(const flag of model.FLAGS)assert.equal(owner.snapshot()[flag],false);
  });
  for(const point of ['before-effect','after-effect','after-commit'])await t.test('recovery-record creation interruption '+point,()=>{
   const world=model.createOwnershipWorld(true);let interrupted;
   try{world.newRun(false,point);}catch(error){interrupted=error;}
   assert.equal(interrupted.code,'MODEL_INTERRUPTED');const recovered=world.restart(interrupted.runId);
   if(point==='after-commit'){assert.ok(recovered.snapshot().recoveryRecord.receipt);finish(recovered);assert.equal(recovered.snapshot().state,'Released');}
   else{assert.equal(recovered.snapshot().recoveryRecord,null);assert.equal(recovered.snapshot().manualRecoveryRequired,true);assert.throws(()=>recovered.cleanupStep('terminate'),/manual/);}
  });
  await t.test('intent is durable model data, not a creation receipt',()=>{
   const {owner,world,id}=fresh();owner.intent('profile');assert.equal(owner.snapshot().state,'IntentRecorded');assert.equal(owner.snapshot().receipts.profile,undefined);
   assert.equal(world.audit().filter(e=>e.operation==='create').length,0);const restarted=world.restart(id);assert.equal(restarted.snapshot().denied,true);finish(restarted);assert.equal(restarted.snapshot().state,'Released');
  });
  await t.test('Created and Attested commit explicit receipts and suspended ownership',()=>{
   const {owner}=ready(),e=owner.snapshot();assert.equal(e.state,'Attested');assert.equal(Object.keys(e.receipts).length,7);
   const p=e.receipts.process.details;assert.equal(p.jobIdentity,e.receipts.job.identity);assert.equal(p.sid,e.receipts.profile.details.sid);assert.deepEqual(p.capabilities,[]);assert.equal(p.suspended,true);assert.equal(p.childRestricted,true);
   assert.ok(p.processHandle&&p.threadHandle&&e.receipts.job.details.jobHandle);assert.ok(e.receipts.inputAcl.details.originalDescriptor);
   assert.deepEqual(e.handles,{process:'retained',thread:'retained',job:'retained'});
   assert.equal(e.receipts.inputAcl.details.targetIdentity,e.receipts.inputDirectory.identity);
  });
  await t.test('teardown terminates, confirms exit, closes handles, restores ACLs and releases profile last',()=>{
   const {world,owner}=ready();owner.beginCleanup();assert.equal(owner.snapshot().denied,true);
   assert.throws(()=>owner.create('process'),/terminal/);finish(owner);const e=owner.snapshot();assert.equal(e.state,'Released');assert.equal(e.recoveryRecord.closed,true);assert.equal(e.pendingOperation,null);
   const operations=world.audit().filter(x=>!['create','simulated-interruption'].includes(x.operation)).map(x=>x.operation);
   assert.deepEqual(e.handles,{process:'closed',thread:'closed',job:'closed'});assert.equal(e.releasedResources.length,7);
   assert.deepEqual(operations,['terminate','confirmExit','closeThread','closeProcess','closeJob','restoreOutputAcl','restoreInputAcl','removeOutputDirectory','removeInputDirectory','deleteProfile','complete']);
   assert.equal(owner.assess(e).status,'BLOCKED');
  });
  for(const operation of ['missing intent kind','repeat attestation','early attestation'])await t.test('invalid transition '+operation,()=>{
   const f=operation==='early attestation'?fresh():ready();
   assert.throws(()=>operation==='missing intent kind'?f.owner.intent():f.owner.attest(),/order|creation/);assert.equal(f.owner.snapshot().denied,true);
  });
  for(let count=0;count<model.KINDS.length;count++)await t.test('known partial initialization cleans only '+count+' created resources',()=>{
   const {world,owner}=fresh();populate(owner,count);owner.beginCleanup('partial failure');finish(owner);assert.equal(owner.snapshot().state,'Released');assert.equal(owner.snapshot().primaryError,'partial failure');
   const deletes=world.audit().filter(x=>['deleteProfile','removeInputDirectory','removeOutputDirectory'].includes(x.operation)&&!x.skipped);for(const row of deletes)assert.ok(model.KINDS.slice(0,count).includes(row.kind));
  });
  for(const kind of model.KINDS)await t.test('collision rejects and never adopts '+kind,()=>{
   const {world,owner,id}=fresh(),index=model.KINDS.indexOf(kind);populate(owner,index);owner.intent(kind);world.collide(id,kind);
   assert.throws(()=>owner.create(kind),/collision/);assert.equal(owner.snapshot().receipts[kind],undefined);assert.equal(owner.snapshot().denied,true);
   finish(owner);assert.equal(world.audit().some(e=>e.kind===kind&&e.operation==='create'),false);
  });
  for(const point of ['before-commit','after-commit'])await t.test('interrupted IntentRecorded '+point,()=>{
   const {world,owner,id}=fresh();assert.throws(()=>owner.intent('profile',point),{code:'MODEL_INTERRUPTED'});
   assert.equal(!!owner.snapshot().committedIntent,point==='after-commit');assert.equal(owner.snapshot().receipts.profile,undefined);
   const restarted=world.restart(id);assert.throws(()=>owner.intent('profile'),/stale/);finish(restarted);assert.equal(restarted.snapshot().state,'Released');
  });
  for(const kind of model.KINDS)for(const point of ['before-effect','after-effect','after-commit'])await t.test('interrupted Created '+kind+' '+point,()=>{
   const {world,owner,id}=fresh();populate(owner,model.KINDS.indexOf(kind));owner.intent(kind);assert.throws(()=>owner.create(kind,point),{code:'MODEL_INTERRUPTED'});
   const restarted=world.restart(id);assert.throws(()=>owner.create(kind),/stale/);
   if(point==='after-commit'){assert.ok(restarted.snapshot().receipts[kind]);finish(restarted);assert.equal(restarted.snapshot().state,'Released');}
   else{assert.equal(restarted.snapshot().receipts[kind],undefined);assert.equal(restarted.snapshot().manualRecoveryRequired,true);assert.throws(()=>restarted.cleanupStep('terminate'),/manual/);assert.equal(world.audit().some(e=>e.operation==='deleteProfile'),false);}
  });
  for(const stage of ['Attested','CleanupPending'])for(const point of ['before-commit','after-commit'])await t.test('interrupted '+stage+' '+point,()=>{
   const f=fresh();populate(f.owner);if(stage==='CleanupPending')f.owner.attest();
   assert.throws(()=>stage==='Attested'?f.owner.attest(point):f.owner.beginCleanup('primary',point),{code:'MODEL_INTERRUPTED'});
   const recovered=f.world.restart(f.id);assert.equal(recovered.snapshot().denied,true);finish(recovered);assert.equal(recovered.snapshot().state,'Released');
  });
  for(const step of model.STEPS)for(const point of ['before-effect','after-effect','after-commit'])await t.test('interrupted cleanup/Released '+step+' '+point,()=>{
   const {world,owner,id}=ready();owner.beginCleanup();for(const prior of model.STEPS.slice(0,model.STEPS.indexOf(step)))owner.cleanupStep(prior);
   assert.throws(()=>owner.cleanupStep(step,point),{code:'MODEL_INTERRUPTED'});const recovered=world.restart(id);
   if(point==='after-commit'){if(recovered.snapshot().state!=='Released')finish(recovered);assert.equal(recovered.snapshot().state,'Released');}
   else{assert.equal(recovered.snapshot().state,'CleanupPending');assert.equal(recovered.snapshot().manualRecoveryRequired,true);assert.throws(()=>recovered.cleanupStep(step),/manual/);}
  });
  for(const kind of ['recoveryRecord',...model.KINDS])await t.test('identity substitution blocks all release for '+kind,()=>{
   const {world,owner,id}=ready();owner.beginCleanup();world.replaceIdentity(id,kind);const n=world.audit().length;
   assert.throws(()=>owner.cleanupStep('terminate'),/identity/);assert.equal(world.audit().length,n);assert.equal(owner.snapshot().state,'CleanupPending');assert.equal(owner.snapshot().cleanupErrors.length,1);
  });
  for(const [step,kind]of [['closeThread','process'],['removeOutputDirectory','outputDirectory'],['deleteProfile','profile']])await t.test('identity is rechecked immediately before '+step,()=>{
   const {world,owner,id}=ready();owner.beginCleanup();for(const prior of model.STEPS.slice(0,model.STEPS.indexOf(step)))owner.cleanupStep(prior);
   world.replaceIdentity(id,kind);const n=world.audit().length;assert.throws(()=>owner.cleanupStep(step),/identity/);assert.equal(world.audit().length,n);assert.equal(owner.snapshot().manualRecoveryRequired,true);
  });
  for(const step of model.STEPS.slice(1))await t.test('invalid early teardown '+step,()=>{
   const {owner,world}=ready();const n=world.audit().length;assert.throws(()=>owner.cleanupStep(step),/denial/);owner.beginCleanup();assert.throws(()=>owner.cleanupStep(step),/order/);assert.equal(world.audit().length,n);
  });
  for(const [name,termination,exit,active]of [['termination','unknown','unknown',1],['exit','confirmed','unknown',0],['active Job process','confirmed','signaled',1]])await t.test('uncertain '+name+' prevents handle or profile release',()=>{
   const {world,owner,id}=ready();owner.beginCleanup('primary failure');world.observations(id,termination,exit,active);
   if(termination==='confirmed')owner.cleanupStep('terminate');assert.throws(()=>owner.cleanupStep(termination==='confirmed'?'confirmExit':'terminate'),/uncertain/);
   assert.equal(owner.snapshot().primaryError,'primary failure');assert.equal(owner.snapshot().cleanupErrors.length,1);assert.throws(()=>owner.cleanupStep('closeProcess'),/order/);
   world.observations(id,'confirmed','signaled',0);finish(owner);assert.equal(owner.snapshot().state,'Released');
  });
  const lateReports=[
   ['active Job process','confirmed','signaled',1],['uncertain exit','confirmed','unknown',0],
   ['uncertain termination','unknown','signaled',0],['missing termination',undefined,'signaled',0],
   ['stale termination','stale','signaled',0],['missing exit','confirmed',undefined,0],['missing Job count','confirmed','signaled',undefined],
  ];
  for(const step of model.STEPS.slice(2))for(const [name,termination,exit,active]of lateReports)await t.test('late '+name+' blocks '+step+' permanently, including restart',()=>{
   const {world,owner,id}=ready();owner.beginCleanup('original primary failure');
   for(const prior of model.STEPS.slice(0,model.STEPS.indexOf(step)))owner.cleanupStep(prior);
   const before=owner.snapshot(),auditCount=world.audit().length;
   assert.equal(before.completionEvidence.exitConfirmed,true);
   assert.throws(()=>world.observations(id,termination,exit,active),/completion observation invalid/);
   const denied=owner.snapshot();assert.equal(denied.state,'CleanupPending');assert.equal(denied.manualRecoveryRequired,true);
   assert.equal(denied.completionEvidence.exitConfirmed,false);assert.equal(denied.completionEvidence.confirmationRevision,null);assert.equal(denied.completionEvidence.invalidated,true);
   assert.equal(denied.primaryError,'original primary failure');assert.equal(denied.cleanupErrors.at(-1).step,'observations');
   assert.throws(()=>owner.cleanupStep(step),/manual/);assert.equal(world.audit().length,auditCount);
   assert.deepEqual(owner.snapshot().handles,before.handles);assert.deepEqual(owner.snapshot().releasedResources,before.releasedResources);assert.equal(owner.snapshot().cleanupIndex,before.cleanupIndex);
   assert.equal(owner.snapshot().recoveryRecord.closed,false);
   assert.throws(()=>world.observations(id,'confirmed','signaled',0),/permanently invalidated/);
   const recovered=world.restart(id);assert.throws(()=>owner.cleanupStep(step),/stale owner/);assert.throws(()=>recovered.cleanupStep(step),/manual/);
   assert.throws(()=>world.observations(id,'confirmed','signaled',0),/permanently invalidated/);
   const forged=recovered.snapshot();forged.state='Released';assert.throws(()=>recovered.assess(forged),/evidence/);
   assert.equal(recovered.snapshot().cleanupIndex,before.cleanupIndex);assert.equal(recovered.snapshot().state,'CleanupPending');assert.equal(world.audit().length,auditCount);
  });
  await t.test('previous false-Released sequence rejects immediately after confirmExit',()=>{
   const {world,owner,id}=ready();owner.beginCleanup();owner.cleanupStep('terminate');owner.cleanupStep('confirmExit');
   assert.throws(()=>world.observations(id,'confirmed','signaled',1),/completion observation invalid/);
   assert.throws(()=>finish(owner),/manual/);assert.equal(owner.snapshot().state,'CleanupPending');assert.equal(owner.snapshot().handles.thread,'retained');
   assert.equal(world.audit().some(e=>e.operation==='deleteProfile'||e.operation==='complete'),false);
  });
  await t.test('new contradiction after restart invalidates previously committed confirmation',()=>{
   const {world,owner,id}=ready();owner.beginCleanup();owner.cleanupStep('terminate');owner.cleanupStep('confirmExit');
   const recovered=world.restart(id);assert.equal(recovered.snapshot().completionEvidence.exitConfirmed,true);
   assert.throws(()=>world.observations(id,'confirmed','unknown',0),/completion observation invalid/);
   assert.throws(()=>recovered.cleanupStep('closeThread'),/manual/);assert.equal(recovered.snapshot().state,'CleanupPending');
  });
  await t.test('complete positive reports preserve current evidence before each valid release',()=>{
   const {world,owner,id}=ready();owner.beginCleanup();owner.cleanupStep('terminate');owner.cleanupStep('confirmExit');
   for(const step of model.STEPS.slice(2)){
    const previous=owner.snapshot().completionEvidence.observationRevision;world.observations(id,'confirmed','signaled',0);
    const proof=owner.snapshot().completionEvidence;assert.equal(proof.exitConfirmed,true);assert.equal(proof.observationRevision,previous+1);assert.equal(proof.confirmationRevision,proof.observationRevision);
    owner.cleanupStep(step);
   }
   assert.equal(owner.snapshot().state,'Released');assert.throws(()=>world.observations(id,'confirmed','unknown',1),/after release/);assert.equal(owner.snapshot().state,'Released');
  });
  await t.test('empty owned Job also requires current zero-active-process evidence',()=>{
   const {world,owner,id}=fresh();populate(owner,model.KINDS.length-1);owner.beginCleanup();owner.cleanupStep('terminate');owner.cleanupStep('confirmExit');
   assert.throws(()=>world.observations(id,'confirmed','signaled',1),/completion observation invalid/);assert.throws(()=>finish(owner),/manual/);assert.equal(owner.snapshot().handles.job,'retained');
  });
  await t.test('positive observation refresh does not reset exhausted release retries',()=>{
   const {world,owner,id}=ready();owner.beginCleanup();owner.cleanupStep('terminate');owner.cleanupStep('confirmExit');world.failCleanup(id,'closeThread',3);
   for(let i=0;i<3;i++)assert.throws(()=>owner.cleanupStep('closeThread'),/injected/);
   world.observations(id,'confirmed','signaled',0);assert.throws(()=>owner.cleanupStep('closeThread'),/bound/);assert.equal(owner.snapshot().attempts.closeThread,3);assert.equal(owner.snapshot().handles.thread,'retained');
  });
  for(const step of model.STEPS)await t.test('cleanup failure retains owner and retries '+step,()=>{
   const {world,owner,id}=ready();owner.beginCleanup('primary');for(const prior of model.STEPS.slice(0,model.STEPS.indexOf(step)))owner.cleanupStep(prior);
   world.failCleanup(id,step);assert.throws(()=>owner.cleanupStep(step),/injected/);assert.equal(owner.snapshot().primaryError,'primary');assert.equal(owner.snapshot().state,'CleanupPending');
   assert.equal(owner.snapshot().cleanupErrors.at(-1).step,step);finish(owner);assert.equal(owner.snapshot().state,'Released');assert.equal(owner.snapshot().attempts[step],2);
  });
  await t.test('bounded retry does not reset after simulated restart',()=>{
   const {world,owner,id}=ready();owner.beginCleanup('primary');world.failCleanup(id,'terminate',3);
   for(let i=0;i<3;i++)assert.throws(()=>owner.cleanupStep('terminate'),/injected/);assert.throws(()=>owner.cleanupStep('terminate'),/bound/);
   const recovered=world.restart(id);assert.throws(()=>recovered.cleanupStep('terminate'),/bound/);assert.equal(recovered.snapshot().attempts.terminate,3);assert.equal(recovered.snapshot().cleanupErrors.length,3);
   assert.equal(recovered.snapshot().manualRecoveryRequired,true);
  });
  await t.test('names, SIDs, PIDs and copied snapshots grant no creation/restart authority',()=>{
   const {world,owner,id}=ready(),e=owner.snapshot(),forged=clone(e);forged.receipts.process={pid:e.receipts.process.details.pid};assert.throws(()=>owner.assess(forged),/evidence/);
   const recovered=world.restart(id);assert.throws(()=>owner.beginCleanup(),/stale/);e.state='Released';assert.throws(()=>recovered.assess(e),/evidence/);assert.throws(()=>world.restart('foreign-run'),/unknown/);
  });
  for(const flag of [...model.FLAGS,'state','remainingCallerObligations','policy'])await t.test('reject false evidence '+flag,()=>{
   const {owner}=ready(),e=owner.snapshot();if(flag==='state')e.state='Released';else if(flag==='remainingCallerObligations')e[flag]=0;else if(flag==='policy')e.policy.activeProcessLimit=2;else e[flag]=true;
   assert.throws(()=>owner.assess(e),/evidence/);assert.equal(owner.snapshot().status,'BLOCKED');for(const key of model.FLAGS)assert.equal(owner.snapshot()[key],false);
  });
  await t.test('evidence getters and proxies do not execute callbacks',()=>{
   const {owner}=ready();let calls=0;const e=owner.snapshot();Object.defineProperty(e,'state',{get(){calls++;return 'Released';}});assert.throws(()=>owner.assess(e),/accessor/);
   assert.throws(()=>owner.assess(new Proxy({},{getPrototypeOf(){calls++;return Object.prototype;}})),/non-data/);assert.equal(calls,0);
  });
  await t.test('recorded simulated durability is not real Windows evidence',()=>{
   const {owner}=ready();assert.match(owner.snapshot().durability,/no disk or crash-durability proof/);assert.match(owner.snapshot().identityMeaning,/synthetic/);assert.equal(owner.assess(owner.snapshot()).status,'BLOCKED');
  });
  await t.test('zero filesystem writes, native calls, child launches, network, registration or evaluation requests',()=>assert.equal(forbidden,0));
 }finally{Module._load=originalLoad;for(const p of patches.reverse())p.owner[p.key]=p.original;}
 await t.test('input preservation, instrumentation, environment and module cache restoration',()=>{
  for(const {owner,key,original}of patches)assert.equal(owner[key],original);assert.equal(Module._load,originalLoad);
  for(const {p,hash}of inputs)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),hash);
  assert.deepEqual({...process.env},environment);assert.deepEqual(Object.keys(require.cache).sort(),cache);
 });
});
