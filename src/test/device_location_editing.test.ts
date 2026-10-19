import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as inspector from '../ui/components/DeviceInspectorDrawer.tsx';
import {SiteProjectDatabase} from '../core/storage/project_db.ts';
import {LegacyConfigurationBoundary} from '../core/network/legacy_configuration_boundary.ts';
import {readFileSync} from 'node:fs';
import type {Device} from '../types/index.ts';
let passed=0,failed=0,sourcePassed=0,sourceFailed=0;
const check=(v:unknown,n:string)=>{if(v){passed++;console.log('PASS: '+n)}else{failed++;console.error('FAIL: '+n)}};
const sourceCheck=(v:unknown,n:string)=>{if(v){sourcePassed++;console.log('PASS (source only): '+n)}else{sourceFailed++;console.error('FAIL (source only): '+n)}};
const camera=(id='camera/A',location='Lobby'):Device=>({id,anchor:{macAddress:id==='camera/A'?'00:11:22:33:44:50':'00:11:22:33:44:52',onvifEndpointUuid:'uuid-'+id,serialNumber:'serial-'+id,vendor:'Fixture'},network:{ipAddress:'192.0.2.50',subnetMask:'255.255.255.0',port:80,protocol:'ONVIF',ipAddressHistory:['192.0.2.40','192.0.2.50']},technician:{name:'Entrance',location,notes:'Keep notes'},configuredState:{inferred:false,manualOverride:true},status:'CONFIGURED',sessionVerification:'VERIFIED',discoveredPhase:3,firstSeenAt:'now',lastSeenAt:'now'});
const props={isOpen:true,onClose:()=>{},onOpenConfigureModal:()=>{},onOpenBrowserModal:()=>{},onDiagnose:()=>{},onUpdateDeviceLocation:async()=>{}};
const deferred=()=>{let resolve!:()=>void,reject!:(e:Error)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no});return{resolve,reject,promise}};
async function run(){
 const row=camera(),before=JSON.stringify(row),markup=renderToStaticMarkup(React.createElement(inspector.DeviceInspectorDrawer,{...props,device:row}));
 check(markup.includes('Camera Location')&&markup.includes('Lobby'),'Details renders current local Camera Location');
 check(markup.includes('Edit Camera Location'),'Details offers local location editing');
 const empty=renderToStaticMarkup(React.createElement(inspector.DeviceInspectorDrawer,{...props,device:camera('camera/A','')}));
 check(empty.includes('Not set'),'empty location is explicitly displayed without invented data');
 check(JSON.stringify(row)===before&&markup.includes('Online'),'static render preserves device and prior status aliases');
 const Editor=(inspector as any).CameraLocationEdit;
 check(typeof Editor==='function','production location edit decisions are available for inert testing');
 if(Editor){
  const db=new SiteProjectDatabase();db.createNewProject('Location');db.upsertDevice(row);db.upsertDevice(camera('camera/B','Garage'));db.exportProjectJsonForSave();
  const boundary=new LegacyConfigurationBoundary(db),editor=new Editor();editor.sync(row.id,'Lobby',true);
  const unchanged=JSON.stringify(db.getProject());editor.begin();editor.change('Discarded');editor.cancel();
  check(editor.view().confirmed==='Lobby'&&!editor.view().editing&&JSON.stringify(db.getProject())===unchanged,'cancel discards draft without metadata or Project mutation');
  editor.begin();editor.change('Lobby');let calls=0;await editor.save(async()=>{calls++});
  check(calls===0&&!db.getSession().dirty,'unchanged location submits no metadata update');
  const beforeDevice=structuredClone(db.getDeviceById(row.id)!);editor.begin();editor.change('  North Door  ');
  const ack=deferred(),targets:Array<[string,string]>=[];
  const save=editor.save(async(id:string,value:string)=>{targets.push([id,value]);await ack.promise;boundary.updateLocalMetadata(id,{technician:{location:value}})});
  check(editor.view().saving&&editor.view().confirmed==='Lobby'&&db.getDeviceById(row.id)?.technician?.location==='Lobby','pending save does not claim confirmed success');
  ack.resolve();check(await save==='saved','acknowledged save completes');
  check(targets.length===1&&targets[0][0]===row.id&&targets[0][1]==='  North Door  ','save uses stable ID and preserves existing whitespace semantics');
  check(editor.view().confirmed==='  North Door  '&&!editor.view().editing&&!editor.view().saving,'acknowledgment updates confirmed display');
  const after=structuredClone(db.getDeviceById(row.id)!);after.technician!.location=beforeDevice.technician!.location;
  check(JSON.stringify(after)===JSON.stringify(beforeDevice),'location update preserves name, notes, status, identity, network history and configured override');
  check(db.getSession().dirty&&db.listProjectHistory('DEVICE',row.id).filter(e=>e.type==='LOCATION_CHANGED').length===1,'existing Project dirty/history contracts apply once');
  check(db.getDeviceById('camera/B')?.technician?.location==='Garage','same-IP other camera remains unchanged');
  db.exportProjectJsonForSave();editor.sync(row.id,'  North Door  ',true);editor.begin();editor.change('Failed');const history=JSON.stringify(db.getProject());
  check(await editor.save(async()=>{throw Error('Injected failure')})==='failed','failed acknowledgment is denied');
  check(editor.view().confirmed==='  North Door  '&&editor.view().error.includes('not saved')&&editor.view().error.includes('Try again')&&JSON.stringify(db.getProject())===history,'failed save preserves confirmed metadata and provides actionable error');
  editor.cancel();editor.begin();editor.change('');await editor.save(async(id:string,value:string)=>{boundary.updateLocalMetadata(id,{technician:{location:value}})});
  check(editor.view().confirmed===''&&db.getDeviceById(row.id)?.technician?.location==='','empty string clears location using existing boundary semantics');
  {
   const state=new Editor();state.sync('camera/A','Lobby',true);state.close();state.sync('camera/A','Lobby',true);state.begin();
   check(state.view().editing&&state.view().deviceId==='camera/A','effect cleanup/setup replay leaves the editor usable');
   state.change('Once');const ack=deferred();let calls=0;const saving=state.save(async()=>{calls++;await ack.promise});
   check(await state.save(async()=>{calls++})==='idle'&&calls===1,'duplicate save does not issue another metadata request');
   state.cancel();check(state.view().saving&&state.view().confirmed==='Lobby','an already submitted save is not falsely claimed cancelled');ack.resolve();await saving;
  }
  for(const order of ['old-first','new-first']){
   const state=new Editor();state.sync('camera/A','Lobby',true);state.begin();state.change('Old A');const a=deferred();const old=state.save(async()=>a.promise);
   state.sync('camera/B','Garage',true);state.begin();state.change('New B');const b=deferred();const latest=state.save(async()=>b.promise);
   if(order==='old-first'){a.resolve();check(await old==='stale'&&state.view().saving&&state.view().confirmed==='Garage','old-first A acknowledgment cannot change B or release B save');b.resolve();await latest;}
   else{b.resolve();await latest;a.reject(Error('Late A failure'));check(await old==='stale','new-first late A failure is stale');}
   check(state.view().deviceId==='camera/B'&&state.view().confirmed==='New B'&&!state.view().error&&!state.view().saving,order+' keeps B confirmed value and state');
  }
  {
   const state=new Editor();state.sync('camera/A','Lobby',true);state.begin();state.change('Old');const ack=deferred(),pending=state.save(async()=>ack.promise);
   state.sync('camera/B','Garage',true);state.sync('camera/A','Lobby',true);ack.resolve();check(await pending==='stale'&&state.view().confirmed==='Lobby','A to B to A does not revive obsolete edit session');
   state.begin();state.change('Closing');const closed=deferred(),saving=state.save(async()=>closed.promise);state.close();closed.resolve();check(await saving==='stale','close/unmount invalidates delayed acknowledgment');
  }
 }
 const app=readFileSync('src/ui/App.tsx','utf8');
 sourceCheck(app.includes("field:'name'|'notes'|'location'")&&app.includes('onUpdateDeviceLocation={handleUpdateDeviceLocation}'),'App wires location through existing stable-ID metadata callback');
 sourceCheck(app.includes('onUpdateDeviceName={handleUpdateDeviceName}')&&app.includes('onUpdateDeviceNotes={handleUpdateDeviceNotes}')&&app.includes("status!=='LOCAL_METADATA_UPDATED'"),'name/notes wiring and acknowledgment checks remain intact');
 console.log(`Location behavior/static rendering: ${passed} passed, ${failed} failed`);console.log(`Location source wiring: ${sourcePassed} passed, ${sourceFailed} failed`);if(failed||sourceFailed)process.exitCode=1;
}
run().catch(error=>{console.error(error);process.exitCode=1});