import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DeviceInspectorDrawer} from '../../ui/components/DeviceInspectorDrawer.tsx';
import {SiteSurveyReportModal} from '../../ui/components/SiteSurveyReportModal.tsx';
import {MasterDeviceTable} from '../../ui/components/MasterDeviceTable.tsx';
import {toggleVisibleSelection} from '../../shared/device_selection.ts';
import type {Device,SiteProject} from '../../types/index.ts';
declare global{interface Window{__interaction:any;}}
const camera=(id:string,location:string):Device=>({id,anchor:{macAddress:id==='camera/A'?'00:11:22:33:44:50':'00:11:22:33:44:52',vendor:'Fixture',model:id},
  network:{ipAddress:'192.0.2.50',subnetMask:'255.255.255.0',port:80,protocol:'ONVIF',ipAddressHistory:['192.0.2.50']},
  technician:{name:id,location,notes:'Retained notes'},status:'UNKNOWN',sessionVerification:'NOT_FOUND',discoveredPhase:3,firstSeenAt:'fixture',lastSeenAt:'fixture'});
const devices=[camera('camera/A','Lobby'),camera('camera/B','Garage')];
const project:SiteProject={id:'fixture',name:'Fixture Project',siteLocation:'Fixture Site',technicianName:'Fixture Technician',
  createdAt:'2026-10-19T12:00:00Z',updatedAt:'2026-10-19T12:00:00Z',devices,collisions:[],rogueDhcpEvents:[],auditLogs:[],totalDevices:2};
const forbidden=()=>{window.__interaction.violations.push('unexpected-component-callback');throw Error('Unexpected component callback');};
function Harness(){
 const [pane,setPane]=useState(''),[open,setOpen]=useState(false),[deviceId,setDeviceId]=useState('camera/A');
 const [selected,setSelected]=useState(new Set(['camera/A'])),[filter,setFilter]=useState('all');
 const visible=devices.filter(d=>filter==='all'||d.id===filter);
 const updateLocation=(id:string,value:string)=>new Promise<void>((resolve,reject)=>{
   window.__interaction.locations.push({id,value,resolve,reject});
 });
 const show=(next:string)=>{setPane(next);setOpen(true);};
 return <>
  <nav aria-label="Fixture controls" style={{position:'fixed',top:0,left:0,zIndex:1000,background:'white',padding:4}}>
   <button onClick={()=>show('location')}>Fixture: Location</button>
   <button onClick={()=>{setDeviceId('camera/A');setOpen(true);}}>Fixture: A</button>
   <button onClick={()=>{setDeviceId('camera/B');setOpen(true);}}>Fixture: B</button>
   <button onClick={()=>setOpen(false)}>Fixture: Close</button>
   <button onClick={()=>show('report')}>Fixture: Reports</button>
   <button onClick={()=>setSelected(new Set(['camera/B']))}>Fixture: Select B</button>
   <button onClick={()=>show('table')}>Fixture: Table</button>
   <label>Fixture filter<select aria-label="Fixture filter" value={filter} onChange={e=>setFilter(e.target.value)}>
    <option value="all">All</option><option value="camera/A">A</option><option value="camera/B">B</option><option value="none">None</option>
   </select></label>
   <output data-testid="selection">{[...selected].sort().join(',')}</output>
  </nav>
  <main style={{paddingTop:70}}>
   {pane==='location'&&<DeviceInspectorDrawer isOpen={open} onClose={()=>setOpen(false)} device={devices.find(d=>d.id===deviceId)!}
     onDiagnose={forbidden} onOpenBrowserModal={forbidden} onOpenConfigureModal={forbidden} onUpdateDeviceLocation={updateLocation}/ >}
   {pane==='report'&&<SiteSurveyReportModal isOpen={open} onClose={()=>setOpen(false)} project={project} projectMode initialScope="SELECTED"
     selectedDeviceIds={[...selected]} filteredDeviceIds={visible.map(d=>d.id)}/ >}
   {pane==='table'&&<MasterDeviceTable devices={visible} selectedDeviceIds={selected} hasCompletedScan projectMode={false}
     onToggleSelect={id=>setSelected(old=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next;})}
     onToggleSelectAll={()=>setSelected(old=>toggleVisibleSelection(old,new Set(visible.map(d=>d.id))))}
     onUpdateDeviceName={forbidden} onUpdateDeviceNotes={forbidden} onOpenDuplicateAssistant={forbidden} onConfigureDevice={forbidden}
     onInspectDevice={forbidden} onOpenBrowser={forbidden} onDiagnose={forbidden} onPair={forbidden}
     onRemoveCurrent={async()=>forbidden()} onRemoveProject={async()=>forbidden()} visibleColumns={['NAME','IP']}/ >}
  </main>
 </>;
}
const root=createRoot(document.getElementById('root')!);
window.__interaction.unmount=()=>root.unmount();
root.render(<React.StrictMode><Harness/></React.StrictMode>);
