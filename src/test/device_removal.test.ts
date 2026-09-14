import { readFileSync } from 'node:fs';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { Device } from '../types/index.ts';

let passed=0,failed=0;const assert=(value:unknown,name:string)=>{if(value){console.log(`  PASS: ${name}`);passed++}else{console.error(`  FAIL: ${name}`);failed++}};
const device=(id:string,ip:string,protocol:Device['network']['protocol']='ONVIF',status:Device['status']='ONLINE',mac:string|null=null):Device=>({id,anchor:{macAddress:mac,vendor:protocol==='MANUAL'?'Unknown':'Axis'},network:{ipAddress:ip,ipAddressHistory:[ip],subnetMask:'255.255.255.0',port:80,protocol},status,sessionVerification:protocol==='MANUAL'?'NOT_VERIFIED':'VERIFIED',discoveredPhase:protocol==='MANUAL'?1:3,firstSeenAt:'now',lastSeenAt:'now',technician:{name:id,location:'',notes:''},configuredState:{inferred:null}});

const quick=new SiteProjectDatabase();quick.startQuickWork();
const manual=device('manual:one','192.168.1.100','MANUAL','UNKNOWN');const discovered=device('mac:one','192.168.1.50','ONVIF','ONLINE','00:11:22:33:44:55');const unknown=device('advanced:51','192.168.1.51','PASSIVE_SNIFF','UNKNOWN');const verified=device('mac:two','192.168.1.52','ONVIF','ONLINE','00:11:22:33:44:66');
[manual,discovered,unknown,verified].forEach(value=>quick.upsertDevice(value));
quick.removeDeviceFromCurrentList(manual.id);
assert(!quick.getProject().devices.some(value=>value.id===manual.id),'manually added device disappears from current list');
assert(quick.getDevices().some(value=>value.id===manual.id),'session removal does not delete the underlying record or create a blacklist');
assert(quick.getProject().devices.length===3,'removing one stable ID leaves every other device untouched');
assert(!quick.getProject().devices.some(value=>value.id===manual.id),'removed manual entry stays gone without genuine discovery evidence');
quick.removeDeviceFromCurrentList(unknown.id);quick.removeDeviceFromCurrentList(verified.id);
assert(!quick.getProject().devices.some(value=>value.id===unknown.id||value.id===verified.id),'Unknown and verified devices are removable');
quick.removeDeviceFromCurrentList(discovered.id);
assert(quick.getProject().devices.length===0,'removing the final visible device produces an empty current list');
const rediscovered=quick.upsertDevice({...discovered,lastSeenAt:'later'});quick.restoreDiscoveredDevice(rediscovered);
assert(quick.getProject().devices[0]?.id===discovered.id,'genuine rediscovery restores the same stable identity');

const duplicates=new SiteProjectDatabase();duplicates.startQuickWork();const dupA=device('mac:a','10.0.0.20','ONVIF','ONLINE','00:00:00:00:00:01'),dupB=device('mac:b','10.0.0.20','ONVIF','ONLINE','00:00:00:00:00:02');duplicates.upsertDevice(dupA);duplicates.upsertDevice(dupB);duplicates.removeDeviceFromCurrentList(dupA.id);
assert(duplicates.getProject().devices.length===1&&duplicates.getProject().devices[0].id===dupB.id,'duplicate-IP identities remain independently targetable by stable ID');

const project=new SiteProjectDatabase();project.createNewProject('Removal Test');const projectA=device('mac:project','10.1.1.20','ONVIF','ONLINE','00:10:20:30:40:50'),projectB=device('mac:other','10.1.1.21','ONVIF','ONLINE','00:10:20:30:40:51');project.upsertDevice(projectA);project.upsertDevice(projectB);project.exportProjectJsonForSave();
project.removeDeviceFromCurrentList(projectA.id);
assert(!project.getSession().dirty&&JSON.parse(project.exportProjectJson()).project.devices.some((value:Device)=>value.id===projectA.id),'current-list removal preserves Project membership and saved state');
project.restoreDiscoveredDevice(projectA);project.removeDeviceFromProject(projectA.id);
assert(project.getSession().dirty&&!project.getDevices().some(value=>value.id===projectA.id),'Remove from Project explicitly removes membership and marks Unsaved');
assert(project.getDevices().length===1&&project.getDevices()[0].id===projectB.id,'Project removal does not alter unrelated devices');
const currentOnly=project.upsertDevice({...projectA,lastSeenAt:'rediscovered'});project.restoreDiscoveredDevice(currentOnly);
assert(project.getProject().devices.some(value=>value.id===projectA.id),'physically rediscovered Project-removed device may return to current results');
assert(!JSON.parse(project.exportProjectJson()).project.devices.some((value:Device)=>value.id===projectA.id),'rediscovery does not silently re-add removed Project membership');

const server=readFileSync('src/server/index.ts','utf8'),dialog=readFileSync('src/ui/components/DeviceRemovalDialog.tsx','utf8'),menu=readFileSync('src/ui/components/FloatingDeviceActionsMenu.tsx','utf8');
assert(server.includes('removeDeviceFromCurrentList')&&server.includes('removeDeviceFromProject'),'server exposes distinct current-list and Project removal paths');
assert(!server.match(/remove-(?:current|project)[\s\S]{0,500}(?:cameraNetwork|osVault|applyTemporary|configure)/),'removal routes perform no camera, adapter, credential, or network mutation');
assert(dialog.includes('This does not change or delete the physical device.')&&dialog.includes('role="alertdialog"'),'confirmation truthfully distinguishes list removal from physical deletion');
assert(dialog.includes('Cancel')&&dialog.includes('bg-rose-700'),'confirmation supports cancellation and restrained destructive styling');
assert(menu.lastIndexOf('Remove from Project')>menu.lastIndexOf('Device Configuration')&&menu.includes('border-t border-slate-200 dark:border-slate-700'),'removal actions are separated at the bottom of the floating menu');
assert(menu.includes('callback(device); onClose();'),'removal selection closes the overlay while preserving stable device target');

console.log(`\nDevice removal summary: ${passed} passed, ${failed} failed`);if(failed)process.exit(1);
