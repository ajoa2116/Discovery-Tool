// In-memory test double only. No filesystem, native, process or resume APIs.
'use strict';
const {types:{isProxy}}=require('node:util');
const POLICY=Object.freeze({activeProcessLimit:1,processMemoryBytes:134217728,jobMemoryBytes:134217728,cpuHardCapPercent:10,externalDeadlineMs:5000});
const FLAGS=Object.freeze(['executionAuthority','stagingAdmission','runtimeTrust','signingApproval','releaseAuthority','productionAuthority','productionReady','runtimeEquivalence','facadeRemovability','completeClosure']);
const KINDS=Object.freeze(['profile','inputDirectory','outputDirectory','inputAcl','outputAcl','job','process']);
const STEPS=Object.freeze(['terminate','confirmExit','closeThread','closeProcess','closeJob','restoreOutputAcl','restoreInputAcl','removeOutputDirectory','removeInputDirectory','deleteProfile','complete']);
const RETRIES=3;
let serial=0;
const deny=reason=>{throw Object.assign(Error('Ownership model denied: '+reason),{code:'MODEL_DENIED'});};
const copy=value=>JSON.parse(JSON.stringify(value)); // Internal plain records only.
function data(value,depth=0){
 if(depth>32)deny('evidence bound');
 if(value===null||['string','boolean','number'].includes(typeof value))return value;
 if(!value||typeof value!=='object'||isProxy(value))deny('non-data evidence');
 const array=Array.isArray(value),proto=Object.getPrototypeOf(value);
 if(proto!==(array?Array.prototype:Object.prototype))deny('evidence prototype');
 const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(value);
 if(keys.length>256)deny('evidence bound');
 const result=array?[]:{};
 for(const key of keys){
  if(typeof key!=='string'||key==='__proto__'||!Object.hasOwn(descriptors[key],'value'))deny('evidence accessor/key');
  if(array&&key==='length')continue;
  if(array&&!/^(0|[1-9][0-9]*)$/.test(key))deny('evidence array');
  result[key]=data(descriptors[key].value,depth+1);
 }
 if(array&&(result.length!==descriptors.length.value||Object.keys(result).length!==result.length))deny('sparse evidence');
 return result;
}
function createOwnershipWorld(optIn=false){
 if(optIn!==true||arguments.length!==1)deny('explicit inert opt-in');
 const runs=new Map(),objects=new Map();let objectSerial=0;
 const audit=[];
 function known(id){const run=runs.get(id);if(!run)deny('unknown run');return run;}
 function event(run,type,fields={}){run.journal.push({sequence:run.journal.length+1,type,...copy(fields)});}
 function fail(run,reason){run.denied=true;run.state='CleanupPending';if(run.primaryError===null)run.primaryError=reason;event(run,'Denied',{reason});deny(reason);}
 function crash(run,point){run.epoch++;run.crashed=true;audit.push({runId:run.id,operation:'simulated-interruption',point});throw Object.assign(Error('Simulated interruption: '+point),{code:'MODEL_INTERRUPTED',runId:run.id});}
 function checkpoint(run,state,point,action){
  if(point!==undefined&&!['before-commit','after-commit'].includes(point))deny('unknown interruption');
  if(point==='before-commit')crash(run,state+':before-commit');
  action();run.state=state;event(run,'DurableTransition',{state});
  if(point==='after-commit')crash(run,state+':after-commit');
 }
 function resource(run,kind){
  const receipt=kind==='recoveryRecord'?run.recoveryRecord:run.receipts[kind],object=objects.get(run.id+':'+kind);
  if(!receipt||!object||object.owner!==run.id||object.receipt!==receipt.receipt||object.identity!==receipt.identity||object.released){
   if(!run.uncertain.some(r=>r.operation==='identity-mismatch'&&r.kind===kind)){run.uncertain.push({operation:'identity-mismatch',kind});event(run,'IdentityUncertain',{kind});}
   deny('unverified ownership/identity '+kind);
  }
  return object;
 }
 function currentExitObservation(run){
  return run.terminationRequested&&run.observations.termination==='confirmed'&&run.observations.exit==='signaled'&&run.observations.activeProcesses===0;
 }
 function invalidateCompletion(run,reason,source){
  run.exitConfirmed=false;run.confirmationRevision=null;run.denied=true;run.state='CleanupPending';
  if(!run.completionInvalidated){
   run.completionInvalidated=true;run.uncertain.push({operation:'completion-evidence-invalidated',kind:'process',reason});
   event(run,'CompletionEvidenceInvalidated',{reason,source,observationRevision:run.observationRevision});
   if(source==='observations')run.cleanupErrors.push({step:'observations',error:reason,attempt:null});
  }
 }
 function requireCurrentCompletion(run){
  if(!run.receipts.process&&!run.receipts.job)return;
  if(run.completionInvalidated||!run.exitConfirmed||run.confirmationRevision!==run.observationRevision||!currentExitObservation(run)){
   invalidateCompletion(run,'missing, stale or contradictory completion evidence','release');deny('completion evidence invalid; manual recovery required');
  }
 }
 function snapshot(run){
  return copy({profile:'appcontainer-ownership-inert-v1',runId:run.id,state:run.state,denied:run.denied,
   recoveryRecord:run.recoveryRecord,plannedResources:run.planned,receipts:run.receipts,handles:run.handles,releasedResources:run.released,journal:run.journal,
   committedIntent:run.intent,pendingOperation:run.pending,uncertain:run.uncertain,cleanupIndex:run.cleanupIndex,attempts:run.attempts,
   primaryError:run.primaryError,cleanupErrors:run.cleanupErrors,policy:POLICY,
   completionEvidence:{observations:run.observations,observationRevision:run.observationRevision,confirmationRevision:run.confirmationRevision,
    terminationRequested:run.terminationRequested,exitConfirmed:run.exitConfirmed,everConfirmed:run.exitEverConfirmed,invalidated:run.completionInvalidated},
   durability:'simulated atomic commits in private memory; no disk or crash-durability proof',
   identityMeaning:'synthetic object identities plus private creation receipts; names/SIDs/PIDs alone never grant ownership',
   manualRecoveryRequired:run.uncertain.length>0||(run.state==='CleanupPending'&&(run.attempts[STEPS[run.cleanupIndex]]??0)>=RETRIES),status:'BLOCKED',remainingCallerObligations:29,authoritativeBaseline:825,ceiling:64,
   ...Object.fromEntries(FLAGS.map(f=>[f,false]))});
 }
 function session(run){
  const epoch=run.epoch;
  function active(){if(epoch!==run.epoch)deny('stale owner');if(run.state==='Released')deny('released owner');}
  function preparing(){active();if(run.denied||run.crashed)deny('terminal denied');}
  function intent(kind,point){
   preparing();const next=KINDS.find(k=>!run.receipts[k]);
   if(!KINDS.includes(kind)||run.state==='Attested'||kind!==next||run.intent!==null)fail(run,'creation order');
   checkpoint(run,'IntentRecorded',point,()=>{run.intent=kind;event(run,'Intent',{kind,name:run.planned[kind]});});
  }
  function create(kind,point){
   preparing();if(run.intent!==kind||!KINDS.includes(kind))fail(run,'missing committed intent');
   if(point!==undefined&&!['before-effect','after-effect','after-commit'].includes(point))deny('unknown interruption');
   if(objects.has(run.id+':'+kind))fail(run,'resource collision '+kind);
   run.pending={operation:'create',kind};event(run,'OperationStarted',run.pending);
   if(point==='before-effect')crash(run,'Created:before-effect');
   const number=++objectSerial,identity='object-'+number,receipt='receipt-'+run.id+'-'+number;
   const details=kind==='profile'?{sid:'synthetic-sid-'+number}:kind==='process'?{birthIdentity:identity,processHandle:'process-handle-'+number,threadHandle:'thread-handle-'+number,pid:number,
    jobIdentity:resource(run,'job').identity,sid:resource(run,'profile').details.sid,capabilities:[],suspended:true,childRestricted:true}:
    kind.endsWith('Acl')?{targetIdentity:resource(run,kind==='inputAcl'?'inputDirectory':'outputDirectory').identity,originalDescriptor:'owner-only',appliedDescriptor:'owner-and-unique-app-sid'}:
    kind==='job'?{jobHandle:'job-handle-'+number,limits:copy(POLICY)}:{volume:'synthetic-volume',fileIdentity:identity};
   const object={owner:run.id,identity,receipt,kind,released:false,details};objects.set(run.id+':'+kind,object);
   if(kind==='process'){run.observations={termination:'confirmed',exit:'unknown',activeProcesses:1};run.observationRevision++;}
   audit.push({runId:run.id,operation:'create',kind,identity});
   if(point==='after-effect')crash(run,'Created:after-effect');
   checkpoint(run,'Created',point===undefined?undefined:'after-commit',()=>{
    run.receipts[kind]={identity,receipt,details:copy(details)};run.intent=null;run.pending=null;
    if(kind==='job')run.handles.job='retained';if(kind==='process'){run.handles.process='retained';run.handles.thread='retained';}
   });
  }
  function attest(point){
   preparing();if(run.state!=='Created'||run.intent!==null||KINDS.some(k=>!run.receipts[k]))fail(run,'incomplete creation/attestation order');
   for(const kind of KINDS)resource(run,kind);
   const child=resource(run,'process'),job=resource(run,'job');
   if(child.details.jobIdentity!==job.identity||child.details.sid!==resource(run,'profile').details.sid||child.details.capabilities.length!==0||!child.details.suspended||!child.details.childRestricted||run.observations.activeProcesses!==1||JSON.stringify(job.details.limits)!==JSON.stringify(POLICY))fail(run,'attestation mismatch');
   checkpoint(run,'Attested',point,()=>{run.attested=true;});
  }
  function beginCleanup(primaryError='requested',point){
   active();if(typeof primaryError!=='string'||primaryError.length>128)deny('primary error data');
   if(run.state==='CleanupPending')deny('cleanup already entered');
   checkpoint(run,'CleanupPending',point,()=>{run.denied=true;if(run.primaryError===null&&primaryError!=='requested')run.primaryError=primaryError;if(!run.pending)run.intent=null;event(run,'TerminalDenied');});
  }
  const target={terminate:'job',confirmExit:'process',closeThread:'process',closeProcess:'process',closeJob:'job',restoreOutputAcl:'outputAcl',restoreInputAcl:'inputAcl',removeOutputDirectory:'outputDirectory',removeInputDirectory:'inputDirectory',deleteProfile:'profile'};
  function cleanupStep(step,point){
   active();if(run.state!=='CleanupPending'||!run.denied)deny('cleanup requires terminal denial');
   if(step!==STEPS[run.cleanupIndex])deny('teardown order');
   if(point!==undefined&&!['before-effect','after-effect','after-commit'].includes(point))deny('unknown interruption');
   if(run.uncertain.length)deny('manual recovery required');
   const attempts=run.attempts[step]??0;if(attempts>=RETRIES)deny('retry bound');run.attempts[step]=attempts+1;
   try{
    // Verify every still-owned object before any simulated release; no name-only fallback.
    resource(run,'recoveryRecord');
    for(const kind of KINDS)if(run.receipts[kind]&&!run.released.includes(kind))resource(run,kind);
    const kind=target[step],present=kind&&!!run.receipts[kind];
    if(run.failures[step]){run.failures[step]--;throw Error('injected cleanup failure');}
    if(step==='terminate'&&run.receipts.process&&run.observations.termination!=='confirmed')throw Error('termination uncertain');
    if(step==='confirmExit'&&(run.receipts.process||run.receipts.job)&&!currentExitObservation(run))throw Error('exit/job completion uncertain');
    if(STEPS.indexOf(step)>STEPS.indexOf('confirmExit'))requireCurrentCompletion(run);
    run.pending={operation:'cleanup',step,kind:kind??'recoveryRecord'};event(run,'OperationStarted',run.pending);
    if(point==='before-effect')crash(run,'CleanupPending:'+step+':before-effect');
    if(step==='terminate'){run.terminationRequested=true;if(!run.customObservations){run.observations={termination:'confirmed',exit:'signaled',activeProcesses:0};run.observationRevision++;}}
    if(step==='confirmExit'&&(run.receipts.process||run.receipts.job)){run.exitConfirmed=true;run.exitEverConfirmed=true;run.confirmationRevision=run.observationRevision;}
    if(present){
     const object=resource(run,kind);
     if(['restoreOutputAcl','restoreInputAcl','removeOutputDirectory','removeInputDirectory','deleteProfile','closeJob'].includes(step)){object.released=true;run.effectsReleased.push(kind);}
     if(step==='closeThread')object.details.threadClosed=true;
     if(step==='closeProcess'){object.details.processClosed=true;object.released=true;run.effectsReleased.push(kind);}
    }
    if(step==='complete'){
     requireCurrentCompletion(run);
     if(KINDS.some(k=>run.receipts[k]&&!run.released.includes(k))||run.receipts.process&&!run.exitConfirmed||Object.values(run.handles).includes('retained'))throw Error('false completion');
     resource(run,'recoveryRecord').released=true;
    }
    audit.push({runId:run.id,operation:step,kind:kind??'recoveryRecord',skipped:!!kind&&!present});
    if(point==='after-effect')crash(run,'CleanupPending:'+step+':after-effect');
    const final=step==='complete';
    checkpoint(run,final?'Released':'CleanupPending',point===undefined?undefined:'after-commit',()=>{
     if(final)requireCurrentCompletion(run);
     if(step==='closeProcess'&&present)run.released.push('process');
     if(present&&run.effectsReleased.includes(kind)&&!run.released.includes(kind))run.released.push(kind);
     if(present&&step==='closeThread')run.handles.thread='closed';
     if(present&&step==='closeProcess')run.handles.process='closed';
     if(present&&step==='closeJob')run.handles.job='closed';
     run.cleanupIndex++;run.pending=null;if(final)run.recoveryRecord.closed=true;
    });
   }catch(error){if(error.code==='MODEL_INTERRUPTED')throw error;run.cleanupErrors.push({step,error:error.message,attempt:run.attempts[step]});event(run,'CleanupFailure',{step});throw error;}
  }
  function assess(candidate){const value=data(candidate),expected=snapshot(run);if(JSON.stringify(value)!==JSON.stringify(expected))deny('false/substituted evidence');return {status:'BLOCKED',productionAuthority:false};}
  function guarded(operation){return (...args)=>{try{return operation(...args);}catch(error){
   if(error.code!=='MODEL_INTERRUPTED'&&epoch===run.epoch&&run.state!=='Released'){
    run.denied=true;run.state='CleanupPending';if(run.primaryError===null)run.primaryError=error.message;
    if(run.pending&&!run.uncertain.length)run.uncertain.push(copy(run.pending));
   }
   throw error;
  }};}
  return Object.freeze({intent:guarded(intent),create:guarded(create),attest:guarded(attest),beginCleanup:guarded(beginCleanup),cleanupStep,snapshot:()=>snapshot(run),assess});
 }
 function newRun(collision=false,point){
  if(typeof collision!=='boolean')deny('collision model data');
  if(point!==undefined&&!['before-effect','after-effect','after-commit'].includes(point))deny('unknown interruption');
  const id='inert-run-'+(++serial),recordIdentity='recovery-record-'+(++objectSerial);
  // A collision reserves the identity forever but never creates/adopts ownership.
  if(collision){audit.push({runId:id,operation:'recovery-record-collision'});deny('recovery record collision');}
  const run={id,epoch:1,state:'IntentRecorded',denied:false,crashed:false,attested:false,
   recoveryRecord:null,handles:{process:'absent',thread:'absent',job:'absent'},planned:Object.fromEntries(KINDS.map(k=>[k,'cctv-7t-model-'+id+'-'+k])),
   receipts:{},journal:[],intent:null,pending:null,uncertain:[],released:[],effectsReleased:[],cleanupIndex:0,attempts:{},primaryError:null,cleanupErrors:[],failures:{},
   observations:{termination:'confirmed',exit:'signaled',activeProcesses:0},customObservations:false,terminationRequested:false,exitConfirmed:false,
   observationRevision:0,confirmationRevision:null,exitEverConfirmed:false,completionInvalidated:false};
  runs.set(id,run);run.pending={operation:'create',kind:'recoveryRecord'};event(run,'RecoveryRecordCreationIntent');
  if(point==='before-effect')crash(run,'RecoveryRecord:before-effect');
  const recordReceipt='exclusive-'+id;
  objects.set(id+':recoveryRecord',{owner:id,identity:recordIdentity,receipt:recordReceipt,released:false,details:{}});
  if(point==='after-effect')crash(run,'RecoveryRecord:after-effect');
  run.recoveryRecord={identity:recordIdentity,receipt:recordReceipt,closed:false};run.pending=null;
  event(run,'ExclusiveRecoveryRecordCreated',{identity:recordIdentity});
  if(point==='after-commit')crash(run,'RecoveryRecord:after-commit');
  return session(run);
 }
 function restart(id){
  const run=known(id);run.epoch++;
  if(run.state==='Released')return session(run);
  if(run.pending)run.uncertain.push(copy(run.pending));
  else run.intent=null;
  run.denied=true;run.crashed=false;run.state='CleanupPending';if(run.primaryError===null)run.primaryError='simulated restart';event(run,'RestartDenied');return session(run);
 }
 function collide(id,kind){const run=known(id);if(!KINDS.includes(kind)||objects.has(id+':'+kind))deny('collision setup');objects.set(id+':'+kind,{owner:'foreign',identity:'foreign',receipt:'foreign'});return run.id;}
 function replaceIdentity(id,kind){const run=known(id),object=resource(run,kind);object.identity+='-replaced';}
 function failCleanup(id,step,count=1){const run=known(id);if(!STEPS.includes(step)||!Number.isInteger(count)||count<1||count>RETRIES)deny('failure model data');run.failures[step]=count;}
 function observations(id,termination,exit,activeProcesses){
  const run=known(id);
  if(run.state==='Released')deny('observations after release');
  if(run.completionInvalidated)deny('completion evidence permanently invalidated; manual recovery required');
  const valid=['confirmed','unknown'].includes(termination)&&['signaled','unknown'].includes(exit)&&[0,1].includes(activeProcesses);
  const hadConfirmation=run.exitConfirmed&&run.confirmationRevision===run.observationRevision;
  run.customObservations=true;run.observationRevision++;
  // Do not retain arbitrary caller values when a report is missing or malformed.
  run.observations=valid?{termination,exit,activeProcesses}:{termination:'unknown',exit:'unknown',activeProcesses:null};
  if(run.exitEverConfirmed&&(!valid||!hadConfirmation||!currentExitObservation(run))){
   invalidateCompletion(run,'contradictory, missing or stale completion observation','observations');deny('completion observation invalid; manual recovery required');
  }
  if(!valid){event(run,'ObservationRejected',{observationRevision:run.observationRevision});deny('observation data');}
  // A complete positive report can preserve an existing valid confirmation;
  // it can never create one or clear a prior invalidation.
  if(hadConfirmation)run.confirmationRevision=run.observationRevision;
  event(run,'ObservationRecorded',{observationRevision:run.observationRevision,confirmationPreserved:hadConfirmation});
 }
 return Object.freeze({newRun,restart,collide,replaceIdentity,failCleanup,observations,audit:()=>copy(audit)});
}
module.exports={createOwnershipWorld,POLICY,FLAGS,KINDS,STEPS,RETRIES};
