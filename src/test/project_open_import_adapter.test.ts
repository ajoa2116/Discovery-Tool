import assert from 'node:assert/strict';
import test from 'node:test';
import { activateProjectImportOnce } from './support/project_open_import_adapter.ts';
import net from 'node:net';
import dgram from 'node:dgram';
import {
  ProjectOpenAdmissionCoordinatorPrototype as Coordinator,
  type ActivationResult, type OpenAdmissionInput,
} from '../core/projects/project_open_admission_coordinator_prototype.ts';
import type { SiteProjectDatabase } from '../core/storage/project_db.ts';

// Test-only adapter proof. The real store is imported only after transport tripwires.
// No production singleton is used, and no file-based open/save method is invoked.
let forbidden=0;
const originals={connect:net.Socket.prototype.connect,listen:net.Server.prototype.listen,udp:dgram.createSocket,fetch:globalThis.fetch};
const deny=():never=>{forbidden++;throw Error('Forbidden isolated adapter transport');};
net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;dgram.createSocket=deny;globalThis.fetch=deny;

const payload=(id='synthetic-project')=>JSON.stringify({
  format:'CCTV_DISCOVERY_PROJECT',schemaVersion:1,applicationVersion:'1.6.0',
  project:{id,name:'Synthetic adapter project',siteLocation:'Synthetic site',technicianName:'Synthetic technician',
    createdAt:'2026-10-31T12:00:00Z',updatedAt:'2026-10-31T12:00:00Z',totalDevices:1,
    collisions:[],rogueDhcpEvents:[],auditLogs:[],devices:[{
      id:'synthetic-camera',anchor:{macAddress:'00:11:22:33:44:50',onvifEndpointUuid:'synthetic-uuid',serialNumber:'synthetic-serial',vendor:'Synthetic'},
      network:{ipAddress:'192.0.2.50',subnetMask:'255.255.255.0',port:80,protocol:'ONVIF',ipAddressHistory:['192.0.2.50']},
      technician:{name:'Synthetic Name',location:'  Synthetic Location  ',notes:'Synthetic Notes'},
      status:'ONLINE',sessionVerification:'VERIFIED',reachability:{lastSuccessfulResponseAt:'2026-10-31T12:00:00Z'},
      evidenceProvenance:'SYNTHETIC_TEST',discoveredPhase:3,firstSeenAt:'2026-10-31T12:00:00Z',lastSeenAt:'2026-10-31T12:00:00Z',
    }]},
});
const request=(store:SiteProjectDatabase,text=payload()):OpenAdmissionInput=>({
  epoch:'isolated-adapter-epoch',attemptId:'isolated-attempt',
  originatingGeneration:store.getMetadataWriteContext().generation,payload:text,
});

try{
  await test('isolated synchronous import activation adapter',{timeout:10000},async t=>{
    const {SiteProjectDatabase,ProjectValidationError}=await import('../core/storage/project_db.ts');

    const activateOnce=(store:SiteProjectDatabase,input:Readonly<OpenAdmissionInput>):ActivationResult=>
      activateProjectImportOnce(store,input,ProjectValidationError);

    function counted(store:SiteProjectDatabase){
      const original=store.importProjectJson;let calls=0;
      store.importProjectJson=function(text){calls++;return original.call(this,text);};
      return {calls:()=>calls,restore:()=>{store.importProjectJson=original;}};
    }
    const coordinator=(store:SiteProjectDatabase)=>new Coordinator({
      epoch:'isolated-adapter-epoch',capacity:4,currentGeneration:()=>store.getMetadataWriteContext().generation,
      activate:input=>activateOnce(store,input),
    });

    await t.test('valid import is synchronous, activates once and reports actual session identity',async()=>{
      const store=new SiteProjectDatabase('ISOLATED_TEST'),before=store.getSessionGeneration(),input=request(store),spy=counted(store);
      try{
        const result=activateOnce(store,input);
        assert.equal(result instanceof Promise,false);
        assert.deepEqual(result,{status:'ADMITTED',projectId:'synthetic-project',activatedGeneration:store.getMetadataWriteContext().generation});
        assert.notEqual(store.getSessionGeneration(),before);assert.notEqual(store.getMetadataWriteContext().generation,input.originatingGeneration);assert.equal(spy.calls(),1);
        const session=store.getSession(),identity=store.getSessionGeneration();
        assert.equal(session.project.id,'synthetic-project');assert.equal(session.mode,'PROJECT');assert.equal(session.dirty,false);
        const device=session.project.devices[0];
        assert.equal(device.id,'synthetic-camera');assert.equal(device.technician?.location,'  Synthetic Location  ');
        assert.equal(device.status,'UNKNOWN');assert.equal(device.sessionVerification,'NOT_VERIFIED');assert.equal(device.savedStatusSnapshot,'ONLINE');
        assert.equal(device.reachability,undefined);
        // Bounded observation after completion; source inspection, not this drain alone,
        // establishes that this adapter has no deferred activation mechanism.
        await Promise.resolve();await Promise.resolve();
        assert.equal(store.getSessionGeneration(),identity);assert.deepEqual(store.getSession(),session);assert.equal(spy.calls(),1);
      }finally{spy.restore();}
    });
    for(const [label,text] of [['malformed JSON','{'],['unsupported schema',JSON.stringify({format:'CCTV_DISCOVERY_PROJECT',schemaVersion:99,project:{}})]])
    await t.test(label+' is rejected only after verifying the prior session is unchanged',()=>{
      const store=new SiteProjectDatabase('ISOLATED_TEST'),input=request(store,text),before=store.getSession(),identity=store.getSessionGeneration(),spy=counted(store);
      try{
        assert.deepEqual(activateOnce(store,input),{status:'REJECTED_BEFORE_ACTIVATION',reason:'VALIDATION_REJECTED'});
        assert.equal(spy.calls(),1);assert.equal(store.getSessionGeneration(),identity);assert.deepEqual(store.getSession(),before);
      }finally{spy.restore();}
    });
    await t.test('post-commit view failure is UNKNOWN despite a validation-error-shaped exception',async()=>{
      const store=new SiteProjectDatabase('ISOLATED_TEST'),input=request(store),before=store.getSessionGeneration(),spy=counted(store),view=store.getProject;
      store.getProject=function(){
        if(this.getSessionGeneration()!==before)throw new ProjectValidationError('Injected post-commit view failure');
        return view.call(this);
      };
      const admission=coordinator(store);
      try{
        assert.deepEqual(await admission.admit(input),{epoch:input.epoch,attemptId:input.attemptId,status:'UNKNOWN',reason:'ACTIVATION_UNCERTAIN'});
        assert.equal(spy.calls(),1);assert.notEqual(store.getSessionGeneration(),before);
        store.getProject=view;
        assert.equal(store.getSession().project.id,'synthetic-project');assert.equal(store.getSession().mode,'PROJECT');
        assert.notEqual(store.getMetadataWriteContext().generation,input.originatingGeneration);
        assert.equal((await admission.settle(input)).status,'UNKNOWN','Later observations do not rewrite the correlated outcome');
      }finally{store.getProject=view;spy.restore();}
    });
    await t.test('unexpected preparation failure remains UNKNOWN even with unchanged generation',async()=>{
      const store=new SiteProjectDatabase('ISOLATED_TEST'),bad=JSON.parse(payload());
      bad.project.devices[0].anchor.macAddress=42; // Real normalization failure, before assignment.
      const input=request(store,JSON.stringify(bad)),before=store.getSession(),identity=store.getSessionGeneration(),spy=counted(store);
      try{
        const result=await coordinator(store).admit(input);
        assert.equal(result.status,'UNKNOWN');assert.equal(spy.calls(),1);
        assert.equal(store.getSessionGeneration(),identity);assert.deepEqual(store.getSession(),before);
      }finally{spy.restore();}
    });
    await t.test('coordinator replay and settlement do not invoke the actual import twice',async()=>{
      const store=new SiteProjectDatabase('ISOLATED_TEST'),input=request(store),spy=counted(store),admission=coordinator(store);
      try{
        const first=admission.admit(input),duplicate=admission.admit(input);assert.equal(first,duplicate);
        const result=await first;assert.equal(result.status,'ADMITTED');
        const identity=store.getSessionGeneration(),session=store.getSession();
        assert.deepEqual(await duplicate,result);assert.deepEqual(await admission.admit(input),result);assert.deepEqual(await admission.settle(input),result);
        await Promise.resolve();assert.equal(spy.calls(),1);assert.equal(store.getSessionGeneration(),identity);assert.deepEqual(store.getSession(),session);
      }finally{spy.restore();}
    });
    await t.test('same-project import confirms a new generation rather than relying on project ID alone',()=>{
      const store=new SiteProjectDatabase('ISOLATED_TEST');store.importProjectJson(payload());
      const input=request(store),before=store.getSessionGeneration(),spy=counted(store);
      try{
        const result=activateOnce(store,input);assert.equal(result.status,'ADMITTED');assert.equal(spy.calls(),1);
        assert.notEqual(store.getSessionGeneration(),before);assert.notEqual(store.getMetadataWriteContext().generation,input.originatingGeneration);
        assert.equal(store.getSession().project.id,'synthetic-project');
      }finally{spy.restore();}
    });
    await t.test('adapter rechecks the originating generation immediately before any import',()=>{
      const store=new SiteProjectDatabase('ISOLATED_TEST'),input=request(store);store.startQuickWork();
      const before=store.getSession(),identity=store.getSessionGeneration(),spy=counted(store);
      try{
        assert.throws(()=>activateOnce(store,input),/Activation outcome unavailable/);assert.equal(spy.calls(),0);
        assert.equal(store.getSessionGeneration(),identity);assert.deepEqual(store.getSession(),before);
      }finally{spy.restore();}
    });
    assert.equal(forbidden,0,'No transport was attempted');
  });
}finally{
  net.Socket.prototype.connect=originals.connect;net.Server.prototype.listen=originals.listen;
  dgram.createSocket=originals.udp;globalThis.fetch=originals.fetch;
}
