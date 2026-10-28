import { MetadataWriteConflictError } from '../../shared/metadata_write_context.ts';
import React, { useEffect, useRef, useState } from 'react';
import { DiagnosticPresentation } from '../../shared/technician_attention.ts';
import { Device, DiagnosticCheckEvidence } from '../../types/index.ts';
import { X, Video, Server, Activity, Fingerprint, ExternalLink, RefreshCw, AlertTriangle, History } from 'lucide-react';
import { ProjectHistoryList } from './ProjectHistory.tsx';
import { DIFFERENT_NETWORK_MESSAGE } from '../../shared/network_relationship.ts';

interface DeviceInspectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  device: Device | null;
  onOpenConfigureModal: (dev: Device) => void;
  onOpenBrowserModal: (dev: Device) => void;
  onDiagnose: (dev: Device) => void;
  onUpdateDeviceLocation?: (id:string,location:string) => Promise<void>;
  projectMode?: boolean;
  diagnosticsFocus?:number;
  diagnostic?:DiagnosticPresentation;
}

/** Acknowledgment is known, but the active Project has not reverified this value. */
export class CameraLocationRefreshError extends Error {
 constructor(readonly refreshState:'failed'|'stale'|'unverified'){
  const detail=refreshState==='failed'?'the active Project refresh failed':refreshState==='stale'?'the active Project refresh was superseded':'the refreshed Project did not confirm the submitted value';
  super(`The server acknowledged this Camera Location update, but ${detail}. The last confirmed Project value is shown; persistence has not been reverified. Try again to resend the update and refresh.`);
  this.name='CameraLocationRefreshError';
 }
}

/** Local edit state only; success requires the App callback's reconciled metadata. */
export class CameraLocationEdit {
 private state={deviceId:null as string|null,confirmed:'',draft:'',editing:false,saving:false,error:''};
 private observed='';
 private generation=0;
 private pending:object|null=null;
 view(){return {...this.state};}
 sync(id:string|undefined,location:string,open:boolean){
  if(!open||!id){this.close();return;}
  if(this.state.deviceId!==id){
   this.generation++;this.pending=null;this.observed=location;
   this.state={deviceId:id,confirmed:location,draft:location,editing:false,saving:false,error:''};
  }else if(this.observed!==location){
   this.observed=location;this.state.confirmed=location;
   if(!this.state.editing)this.state.draft=location;
  }
 }
 close(){
  if(this.state.deviceId!==null){this.generation++;this.pending=null;this.state={deviceId:null,confirmed:'',draft:'',editing:false,saving:false,error:''};}
 }
 begin(){if(this.state.deviceId&&!this.state.saving){this.state.draft=this.state.confirmed;this.state.editing=true;this.state.error='';}}
 change(value:string){if(this.state.editing&&!this.state.saving)this.state.draft=value;}
 cancel(){if(!this.state.saving){this.state.editing=false;this.state.draft=this.state.confirmed;this.state.error='';}}
 async save(update:(id:string,value:string)=>Promise<void>){
  if(!this.state.deviceId||!this.state.editing||this.state.saving)return 'idle';
  if(this.state.draft===this.state.confirmed){this.cancel();return 'unchanged';}
  const id=this.state.deviceId,value=this.state.draft,generation=this.generation,token={};
  this.pending=token;this.state.saving=true;this.state.error='';
  const current=()=>this.pending===token&&this.generation===generation&&this.state.deviceId===id;
  try{
   await update(id,value);
   if(!current())return 'stale';
   this.state.confirmed=value;this.state.editing=false;return 'saved';
  }catch(reason){
   if(!current())return 'stale';
   this.state.error=reason instanceof CameraLocationRefreshError||reason instanceof MetadataWriteConflictError?reason.message:'Camera Location was not saved. The last confirmed value is shown. Try again.';return 'failed';
  }finally{if(current()){this.pending=null;this.state.saving=false;}}
 }
}
// Presentation aliases match MasterDeviceTable; raw state and evidence remain unchanged.
const statusLabels:Record<Device['status'],string>={
  ONLINE:'Online',OFFLINE:'Offline',UNKNOWN:'Unknown',DIFFERENT_SUBNET:'Different Subnet',
  CONFIGURED:'Online',AUTHENTICATED:'Online',COLLISION:'Duplicate IP',ERROR:'Verification Required',
  UNRESPONSIVE:'Unreachable',UNREACHABLE:'Unreachable',PROVISIONING:'Working',DISCOVERED:'New Device',
};
const checkLabel = (check: DiagnosticCheckEvidence) => check.type === 'TCP' ? `TCP ${check.port}` : check.type.replaceAll('_', ' ');

export const DeviceInspectorDrawer: React.FC<DeviceInspectorDrawerProps> = ({ isOpen, onClose, device, onOpenConfigureModal, onOpenBrowserModal, onDiagnose, onUpdateDeviceLocation, projectMode, diagnosticsFocus, diagnostic }) => {
  const [activeTab, setActiveTab] = useState<'DIAGNOSTICS' | 'IDENTITY' | 'HISTORY'>('DIAGNOSTICS');
  const diagnosticsTab=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(isOpen&&diagnosticsFocus){setActiveTab('DIAGNOSTICS');diagnosticsTab.current?.focus();}},[isOpen,device?.id,diagnosticsFocus]);
  const locationEdit=useRef(new CameraLocationEdit()).current;
  const [,renderLocation]=useState(0);
  const refreshLocation=()=>renderLocation(value=>value+1);
  locationEdit.sync(device?.id,device?.technician?.location||'',isOpen);
  useEffect(()=>{
    // Rebind after effect setup as well as render, including StrictMode cleanup/setup replay.
    locationEdit.sync(device?.id,device?.technician?.location||'',isOpen);
    return ()=>locationEdit.close();
  },[locationEdit,isOpen,device?.id]);
  const location=locationEdit.view();
  const saveLocation=()=>{
    if(!onUpdateDeviceLocation)return;
    const saving=locationEdit.save(onUpdateDeviceLocation);refreshLocation();
    void saving.then(result=>{if(result!=='stale')refreshLocation();});
  };
  if (!isOpen || !device) return null;
  const checks = [...(diagnostic?.checks||device.diagnostics?.checks||[])].filter(c=>c.targetIp===device.network.ipAddress).reverse();
  const adapter = checks[0]?.originatingAdapter||device.reachability?.relationshipAdapter||device.reachability?.discoveryInterface;
  const isCamera = device.anchor.hardwareClass === 'IP_CAMERA' || !device.anchor.vendor.toLowerCase().includes('lenel');

  return (
    <div role="dialog" aria-label="Device Inspector" className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-white border-l border-slate-300 shadow-2xl flex flex-col">
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-700">{isCamera ? <Video className="w-5 h-5" /> : <Server className="w-5 h-5" />}</div>
          <div>
            <h3 className="font-bold text-slate-900 text-xs">Device Inspector</h3>
            <p className="text-[11px] text-slate-600">{device.technician?.name || `${device.anchor.vendor} ${device.anchor.model || ''}`}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-slate-600 hover:text-slate-900"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex border-b border-slate-200 bg-slate-50 px-3 text-xs gap-2">
        <button ref={diagnosticsTab} aria-pressed={activeTab==='DIAGNOSTICS'} onClick={() => setActiveTab('DIAGNOSTICS')} className={`py-2.5 px-3 font-semibold border-b-2 flex items-center gap-1.5 ${activeTab === 'DIAGNOSTICS' ? 'border-sky-400 text-sky-700' : 'border-transparent text-slate-600'}`}><Activity className="w-3.5 h-3.5" />Diagnostics</button>
        <button onClick={() => setActiveTab('IDENTITY')} className={`py-2.5 px-3 font-semibold border-b-2 flex items-center gap-1.5 ${activeTab === 'IDENTITY' ? 'border-sky-400 text-sky-700' : 'border-transparent text-slate-600'}`}><Fingerprint className="w-3.5 h-3.5" />Identity & Network</button>
        {projectMode&&<button onClick={() => setActiveTab('HISTORY')} className={`py-2.5 px-3 font-semibold border-b-2 flex items-center gap-1.5 ${activeTab === 'HISTORY' ? 'border-sky-400 text-sky-700' : 'border-transparent text-slate-600'}`}><History className="w-3.5 h-3.5" />History</button>}
      </div>

      <div className="p-4 overflow-y-auto flex-1 space-y-3 text-xs">
        <section aria-label="Local Camera Location" className="rounded border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2"><strong>Camera Location</strong>{onUpdateDeviceLocation&&!location.editing&&<button type="button" onClick={()=>{locationEdit.begin();refreshLocation();}} className="text-sky-700 underline">Edit Camera Location</button>}</div>
          <p className="whitespace-pre-wrap break-words text-slate-800">{location.confirmed||'Not set'}</p>
          <p className="text-[10px] text-slate-500">Local technician information only; this does not change the camera.</p>
          {location.editing&&<form onSubmit={event=>{event.preventDefault();saveLocation();}} className="space-y-2">
            <label className="block">Camera Location<input aria-label="Camera Location" value={location.draft} disabled={location.saving} onChange={event=>{locationEdit.change(event.target.value);refreshLocation();}} onKeyDown={event=>{if(event.key==='Escape'&&!event.nativeEvent.isComposing){event.preventDefault();locationEdit.cancel();refreshLocation();}}} className="mt-1 block w-full rounded border border-slate-300 bg-white p-2"/></label>
            <div className="flex gap-2"><button type="submit" disabled={location.saving} className="rounded bg-sky-600 px-3 py-1 text-white disabled:opacity-50">{location.saving?'Saving…':'Save Location'}</button><button type="button" disabled={location.saving} onClick={()=>{locationEdit.cancel();refreshLocation();}} className="rounded border border-slate-300 px-3 py-1">Cancel</button></div>
          </form>}
          {location.error&&<p role="alert" className="text-rose-700">{location.error}</p>}
        </section>
        {activeTab === 'DIAGNOSTICS' && <>
          {diagnostic&&<div role="status" className="rounded border border-slate-300 bg-slate-50 p-3 text-slate-800"><strong>Diagnostics: {diagnostic.state}</strong><p>{diagnostic.message}</p></div>}
          <p className="text-slate-700">Current IP: {device.network.ipAddress} · Subnet: {device.reachability?.subnetClassification||'Unknown'}</p>
          <p className="text-slate-600">Adapter: {adapter?`${adapter.name} • ${adapter.ipAddress}`:'Not available'}</p>
          <p className="text-slate-600">Network reachability does not establish browser, login, or selected-camera ownership.</p>
          {device.reachability?.subnetClassification === 'DIFFERENT_SUBNET' && <p className="rounded border border-purple-700/40 bg-purple-50 p-3 text-purple-900">{DIFFERENT_NETWORK_MESSAGE} Verification: {device.sessionVerification === 'VERIFIED' ? 'Verified evidence recorded' : 'Not Verified'}.</p>}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200"><span className="text-slate-500">Current status</span><p className="font-bold text-sky-800 mt-1">{statusLabels[device.status]}</p></div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200"><span className="text-slate-500">Last successful contact</span><p className="font-mono text-slate-700 mt-1 text-[10px]">{device.diagnostics?.lastSuccessfulContactAt || device.reachability?.lastSuccessfulResponseAt || 'Unknown'}</p></div>
          </div>
          {device.status === 'COLLISION' && <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-50 text-amber-900 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />Network responses on this shared IP may be identity-ambiguous.</div>}
          <button disabled={diagnostic?.state==='Running'} onClick={() => onDiagnose(device)} className="w-full py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-white font-bold flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" />Diagnose Now</button>
          <div className="space-y-2">
            {checks.length === 0 && <div className="p-4 text-center text-slate-500 border border-dashed border-slate-300 rounded-lg">No diagnostic checks have run in this session.</div>}
            {checks.map((check, index) => <div key={`${check.timestamp}-${index}`} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex justify-between"><span className="font-semibold text-slate-800">{checkLabel(check)}</span><span className={check.success ? 'text-emerald-700' : 'text-slate-500'}>{check.success ? 'Responded' : check.errorCategory || 'No response'}</span></div>
              <div className="mt-1 text-[10px] text-slate-500 font-mono flex flex-wrap gap-x-3">
                {check.httpStatus !== undefined && <span>HTTP {check.httpStatus}</span>}
                {check.responseTimeMs !== undefined && <span>{check.responseTimeMs} ms</span>}
                {check.certificateTrusted === false && <span className="text-amber-800">TLS: {check.certificateWarning || 'Untrusted certificate'}</span>}
                {check.ambiguousIdentity && <span className="text-amber-800">Identity ambiguous</span>}
                <span>{check.timestamp}</span>
              </div>
            </div>)}
          </div>
        </>}

        {activeTab === 'IDENTITY' && <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 font-mono">
          <div><span className="text-slate-500">Device IP</span><p className="text-sky-800">{device.network.ipAddress}:{device.network.port}</p></div>
          <div><span className="text-slate-500">MAC</span><p className="text-slate-800">{device.anchor.macAddress || 'Unknown'}</p></div>
          <div><span className="text-slate-500">ONVIF UUID</span><p className="text-slate-800 break-all">{device.anchor.onvifEndpointUuid || 'Unknown'}</p></div>
          <div><span className="text-slate-500">Serial</span><p className="text-slate-800">{device.anchor.serialNumber || 'Unknown'}</p></div>
          <div><span className="text-slate-500">Manufacturer / model</span><p className="text-slate-800">{device.anchor.vendor}{device.anchor.model ? ` — ${device.anchor.model}` : ''}</p></div>
          <div><span className="text-slate-500">Firmware</span><p className="text-slate-800">{device.anchor.firmwareVersion || 'Unknown'}</p></div>
          <div><span className="text-slate-500">Active driver</span><p className="text-slate-800">{String(device.manufacturerParams?.activeDriver || 'ONVIF / not yet verified')}</p></div>
          <div><span className="text-slate-500">Subnet relationship</span><p className="text-slate-800">{device.reachability?.subnetClassification || 'UNKNOWN'}</p></div>
          <div><span className="text-slate-500">Originating adapter</span><p className="text-slate-800">{adapter ? `${adapter.name} — ${adapter.ipAddress} / ${adapter.netmask}` : 'Unknown'}</p></div>
          <div><span className="text-slate-500">ONVIF discovery response</span><p className="text-slate-800">{device.reachability?.wsDiscoveryRespondedAt || 'Not observed'}</p></div>
        </div>}
        {activeTab === 'HISTORY' && projectMode && <ProjectHistoryList deviceId={device.id}/>}
      </div>

      <div className="p-3 bg-slate-50 border-t border-slate-200 flex gap-2">
        <button onClick={() => onOpenBrowserModal(device)} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center gap-1.5"><ExternalLink className="w-3.5 h-3.5 text-sky-700" />Open Camera</button>
        <button onClick={() => onOpenConfigureModal(device)} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg">Device Configuration</button>
        <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg">Close</button>
      </div>
    </div>
  );
};
