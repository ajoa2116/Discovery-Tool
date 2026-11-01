import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import dgram from 'node:dgram';
import type { SiteProjectDatabase } from '../core/storage/project_db.ts';
import type { OpenAdmissionInput, OpenAdmissionDisposition } from '../core/projects/project_open_admission_coordinator_prototype.ts';
import { ProjectReplacementGateProof, type ReplacementResult } from './support/project_replacement_gate.ts';

// Proof facade only. Raw production store calls are not made non-bypassable by this test.
let forbidden=0;
const originals={connect:net.Socket.prototype.connect,listen:net.Server.prototype.listen,udp:dgram.createSocket,fetch:globalThis.fetch};
const deny=():never=>{forbidden++;throw Error('Forbidden replacement proof transport');};
net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;dgram.createSocket=deny;globalThis.fetch=deny;
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
const payload=(id='gate-project-b')=>JSON.stringify({id,name:'Gate synthetic project',siteLocation:'Synthetic site',
  createdAt:'2026-10-31T12:00:00Z',updatedAt:'2026-10-31T12:00:00Z',totalDevices:1,collisions:[],rogueDhcpEvents:[],auditLogs:[],
  devices:[{id:'gate-camera',anchor:{macAddress:'00:11:22:33:44:50',onvifEndpointUuid:'gate-uuid',vendor:'Synthetic'},
    network:{ipAddress:'192.0.2.50',subnetMask:'255.255.255.0',port:80,protocol:'ONVIF',ipAddressHistory:['192.0.2.50']},
    technician:{name:'  Gate Name  ',location:'  Gate Location  ',notes:'Gate Notes\nSecond line'},status:'ONLINE',
    evidenceProvenance:'SYNTHETIC_TEST',discoveredPhase:3,firstSeenAt:'2026-10-31T12:00:00Z',lastSeenAt:'2026-10-31T12:00:00Z'}]});

try{
  await test('isolated per-store replacement gate proof',{timeout:10000},async t=>{
    const {SiteProjectDatabase,ProjectValidationError}=await import('../core/storage/project_db.ts');
    function fixture(beforeOpenActivation?:(input:Readonly<OpenAdmissionInput>)=>Promise<void>){
      const store=new SiteProjectDatabase('ISOLATED_TEST');store.importProjectJson(payload('gate-project-a'));
      store.appendHistory({type:'NOTES_UPDATED',title:'Synthetic retained history',summary:'Synthetic prior technician edit',deviceId:'gate-camera',source:'SYNTHETIC_TEST'});
      const original={quick:store.startQuickWork,new:store.createNewProject,from:store.createProjectFromCurrentResults,import:store.importProjectJson};
      const calls={quick:0,new:0,from:0,import:0};
      store.startQuickWork=function(){calls.quick++;return original.quick.call(this);};
      store.createNewProject=function(...args){calls.new++;return original.new.apply(this,args);};
      store.createProjectFromCurrentResults=function(...args){calls.from++;return original.from.apply(this,args);};
      store.importProjectJson=function(text){calls.import++;return original.import.call(this,text);};
      const gate=new ProjectReplacementGateProof(store,ProjectValidationError,{epoch:'gate-epoch',beforeOpenActivation});
      return {store,gate,calls,input:(id='open-a',text=payload()):OpenAdmissionInput=>({
        epoch:'gate-epoch',attemptId:id,payload:text,originatingGeneration:gate.generation(),
      }),restore:()=>{
        store.startQuickWork=original.quick;store.createNewProject=original.new;
        store.createProjectFromCurrentResults=original.from;store.importProjectJson=original.import;
      }};
    }
    function blocked(f:ReturnType<typeof fixture>,reason:'OPEN_PENDING'|'ACTIVATION_UNRESOLVED'){
      const expected=f.gate.generation();
      for(const result of [f.gate.startQuickWork(expected),f.gate.createNewProject(expected,'Blocked new'),
        f.gate.createProjectFromCurrentResults(expected,'Blocked from current')])
        assert.deepEqual(result,{status:'BLOCKED',reason});
    }
    for(const kind of ['quick','new','from','import'] as const)
    await t.test(kind+' participates exactly once and preserves its existing data/history/dirty semantics',async t=>{
      const f=fixture();t.after(f.restore);
      const before=f.store.getSession(),identity=f.store.getSessionGeneration(),generation=f.gate.generation();
      const result=kind==='quick'?f.gate.startQuickWork(generation):kind==='new'?f.gate.createNewProject(generation,'New project','New site','Description')
        :kind==='from'?f.gate.createProjectFromCurrentResults(generation,'From current','Description'):await f.gate.importProjectJson(f.input());
      assert.equal(result instanceof Promise,false);assert.equal(result.status,kind==='import'?'ADMITTED':'COMMITTED');
      assert.notEqual(f.store.getSessionGeneration(),identity);assert.notEqual(f.gate.generation(),generation);
      const expectedCalls={quick:0,new:0,from:0,import:0};expectedCalls[kind]=1;assert.deepEqual(f.calls,expectedCalls);
      const session=f.store.getSession(),history=f.store.listProjectHistory();
      if(kind==='quick'){
        assert.equal(session.mode,'QUICK_WORK');assert.equal(session.dirty,false);assert.equal(session.project.name,'Quick Work');assert.equal(session.project.devices.length,0);assert.equal(history.length,0);
      }else if(kind==='new'){
        assert.equal(session.mode,'PROJECT');assert.equal(session.dirty,true);assert.equal(session.project.name,'New project');assert.equal(session.project.siteLocation,'New site');
        assert.equal(session.project.devices.length,0);assert.deepEqual(history.map(event=>event.type),['PROJECT_CREATED']);
      }else if(kind==='from'){
        assert.equal(session.mode,'PROJECT');assert.equal(session.dirty,true);assert.deepEqual(session.project.devices,before.project.devices);
        assert.equal(session.project.siteLocation,before.project.siteLocation);assert.deepEqual(history.map(event=>event.type).sort(),['DEVICE_ADDED','NOTES_UPDATED','PROJECT_CREATED']);
        assert.deepEqual(session.project.auditLogs.find(entry=>entry.id===before.project.auditLogs[0].id),before.project.auditLogs[0]);
      }else{
        assert.equal(session.project.id,'gate-project-b');assert.equal(session.dirty,false);assert.equal(history.length,0);
        assert.deepEqual(session.project.devices[0].technician,before.project.devices[0].technician);
        assert.equal(session.project.devices[0].status,'UNKNOWN');assert.equal(session.project.devices[0].sessionVerification,'NOT_VERIFIED');
        assert.equal(session.project.devices[0].savedStatusSnapshot,'ONLINE');
      }
      await Promise.resolve();await Promise.resolve();
      // Source has no deferred mutation mechanism; this is only bounded post-return observation.
      assert.deepEqual(f.store.getSession(),session);assert.deepEqual(f.calls,expectedCalls);
      assert.deepEqual(f.gate.state(),{pendingOpen:0,unresolved:false,executing:false});
    });
    await t.test('pending Open blocks all other replacements and a conflicting replay cannot release it',async t=>{
      const release=deferred(),entered=deferred(),f=fixture(async()=>{entered.resolve();await release.promise;});t.after(f.restore);
      const before=f.store.getSession(),input=f.input(),first=f.gate.importProjectJson(input);
      let second:ReturnType<typeof f.gate.importProjectJson>|undefined;
      try{
        await entered.promise;blocked(f,'OPEN_PENDING');
        const conflict=await f.gate.importProjectJson({...input,payload:payload('conflict')});
        assert.equal(conflict.status,'UNKNOWN');assert.equal(f.gate.state().pendingOpen,1);blocked(f,'OPEN_PENDING');
        second=f.gate.importProjectJson({...input,attemptId:'open-b',payload:payload('second')});
        assert.equal(f.gate.status({epoch:'gate-epoch',attemptId:'open-b'}).status,'PENDING');
        assert.deepEqual(f.store.getSession(),before);assert.deepEqual(f.calls,{quick:0,new:0,from:0,import:0});
        release.resolve();assert.equal((await first).status,'ADMITTED');
        assert.equal((await second).status,'REJECTED_BEFORE_ACTIVATION');assert.equal(f.calls.import,1);
        assert.equal(f.gate.state().pendingOpen,0);
      }finally{release.resolve();await first;await second;}
    });
    await t.test('UNKNOWN Open stays unresolved through settlement and cannot be bypassed',async t=>{
      const f=fixture();t.after(f.restore);const view=f.store.getProject,identity=f.store.getSessionGeneration(),input=f.input();
      f.store.getProject=function(){if(this.getSessionGeneration()!==identity)throw new ProjectValidationError('Injected post-commit failure');return view.call(this);};
      try{
        const outcome=await f.gate.importProjectJson(input);assert.equal(outcome.status,'UNKNOWN');
        f.store.getProject=view;const committed=f.store.getSession();assert.equal(committed.project.id,'gate-project-b');
        blocked(f,'ACTIVATION_UNRESOLVED');assert.deepEqual(await f.gate.settle(input),outcome);
        assert.equal((await f.gate.importProjectJson(f.input('open-b'))).status,'REJECTED_BEFORE_ACTIVATION');
        assert.deepEqual(f.store.getSession(),committed);assert.deepEqual(f.calls,{quick:0,new:0,from:0,import:1});
        assert.equal(f.gate.state().unresolved,true);
      }finally{f.store.getProject=view;}
    });
    await t.test('known terminal Open releases permission for later generation-ordered work',async t=>{
      const f=fixture();t.after(f.restore);
      assert.equal((await f.gate.importProjectJson(f.input())).status,'ADMITTED');
      assert.equal(f.gate.createNewProject(f.gate.generation(),'Later project').status,'COMMITTED');
      assert.equal(f.gate.startQuickWork(f.gate.generation()).status,'COMMITTED');
      assert.equal(f.gate.createProjectFromCurrentResults(f.gate.generation(),'Later from current').status,'COMMITTED');
      assert.deepEqual(f.calls,{quick:1,new:1,from:1,import:1});assert.equal(f.gate.state().unresolved,false);
    });
    await t.test('terminal import validation rejection preserves the original and permits later work',async t=>{
      const f=fixture();t.after(f.restore);const before=f.store.getSession(),generation=f.gate.generation(),identity=f.store.getSessionGeneration();
      const result=await f.gate.importProjectJson(f.input('invalid','{'));
      assert.equal(result.status,'REJECTED_BEFORE_ACTIVATION');assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),identity);
      assert.equal(f.gate.createNewProject(generation,'After rejection').status,'COMMITTED');assert.equal(f.gate.state().unresolved,false);
    });
    await t.test('settlement-before-arrival prevents import and leaves replacement permission usable',async t=>{
      const f=fixture();t.after(f.restore);const input=f.input(),before=f.store.getSession();
      const settled=await f.gate.settle(input);assert.equal(settled.status,'REJECTED_BEFORE_ACTIVATION');
      assert.deepEqual(await f.gate.importProjectJson(input),settled);assert.deepEqual(f.store.getSession(),before);assert.equal(f.calls.import,0);
      assert.equal(f.gate.startQuickWork(f.gate.generation()).status,'COMMITTED');
    });
    for(const operation of ['new','open'] as const)
    await t.test('delayed '+operation+' preparation outside the gate cannot overwrite a newer generation',async t=>{
      const f=fixture();t.after(f.restore);const prepared=deferred(),generation=f.gate.generation(),input=f.input();
      const later=prepared.promise.then<ReplacementResult|Readonly<OpenAdmissionDisposition>>(()=>operation==='new'?f.gate.createNewProject(generation,'Obsolete prepared project'):f.gate.importProjectJson(input));
      try{
        assert.equal(f.gate.createNewProject(generation,'Current project').status,'COMMITTED');const current=f.store.getSession(),identity=f.store.getSessionGeneration();
        prepared.resolve();const result=await later;assert.equal(result.status,'REJECTED_BEFORE_ACTIVATION');
        assert.deepEqual(f.store.getSession(),current);assert.equal(f.store.getSessionGeneration(),identity);
        assert.deepEqual(f.calls,{quick:0,new:1,from:0,import:0});
      }finally{prepared.resolve();await later;}
    });
    await t.test('separate staging stores are independent and a second facade cannot claim the same store',async t=>{
      const release=deferred(),entered=deferred(),active=fixture(async()=>{entered.resolve();await release.promise;}),staging=fixture();
      t.after(active.restore);t.after(staging.restore);const pending=active.gate.importProjectJson(active.input());
      try{
        await entered.promise;
        assert.throws(()=>new ProjectReplacementGateProof(active.store,ProjectValidationError,{epoch:'other-epoch'}),/already owns/);
        assert.equal(staging.gate.startQuickWork(staging.gate.generation()).status,'COMMITTED');assert.equal(staging.calls.quick,1);
        blocked(active,'OPEN_PENDING');assert.equal(active.calls.quick,0);
        release.resolve();assert.equal((await pending).status,'ADMITTED');
      }finally{release.resolve();await pending;}
    });
    await t.test('post-commit New Project history failure is UNKNOWN without rollback or early unlock',t=>{
      const f=fixture();t.after(f.restore);const append=f.store.appendHistory,identity=f.store.getSessionGeneration();
      f.store.appendHistory=()=>{throw new ProjectValidationError('Injected post-commit history failure');};
      try{
        const result=f.gate.createNewProject(f.gate.generation(),'Committed before failure');
        assert.equal(result.status,'UNKNOWN');assert.notEqual(f.store.getSessionGeneration(),identity);
        assert.equal(f.store.getSession().project.name,'Committed before failure');blocked(f,'ACTIVATION_UNRESOLVED');
        assert.deepEqual(f.calls,{quick:0,new:1,from:0,import:0});
      }finally{f.store.appendHistory=append;}
    });
    await t.test('reentrant replacement does not enter the synchronous mutation body',t=>{
      const f=fixture();t.after(f.restore);const create=f.store.createNewProject;let inner:unknown;
      f.store.createNewProject=function(...args){inner=f.gate.startQuickWork(f.gate.generation());return create.apply(this,args);};
      assert.equal(f.gate.createNewProject(f.gate.generation(),'Outer project').status,'COMMITTED');
      assert.deepEqual(inner,{status:'BLOCKED',reason:'REPLACEMENT_ACTIVE'});assert.deepEqual(f.calls,{quick:0,new:1,from:0,import:0});
    });
    await t.test('pre-activation New Project validation rejection preserves data and releases permission',t=>{
      const f=fixture();t.after(f.restore);const before=f.store.getSession(),identity=f.store.getSessionGeneration(),generation=f.gate.generation();
      assert.deepEqual(f.gate.createNewProject(generation,'  '),{status:'REJECTED_BEFORE_ACTIVATION',reason:'VALIDATION_REJECTED'});
      assert.deepEqual(f.store.getSession(),before);assert.equal(f.store.getSessionGeneration(),identity);
      assert.equal(f.gate.startQuickWork(generation).status,'COMMITTED');assert.equal(f.gate.state().unresolved,false);
    });
    assert.equal(forbidden,0);
  });
}finally{
  net.Socket.prototype.connect=originals.connect;net.Server.prototype.listen=originals.listen;
  dgram.createSocket=originals.udp;globalThis.fetch=originals.fetch;
}
