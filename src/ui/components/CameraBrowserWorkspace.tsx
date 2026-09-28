import {createPortal} from 'react-dom';
import {useModalFocus} from '../use_modal_focus.ts';
import React,{useEffect,useRef,useState} from 'react';
import {Device,IPCollisionRecord,CameraAccessEndpoint} from '../../types/index.ts';
import {decideCameraAccess,CameraAccessDecision} from '../../shared/camera_access.ts';
import {requestJson} from '../bounded_request.ts';
import {BrowserModal} from './BrowserModal.tsx';
import {NativeCameraRenderer,nativeWorkspaceText} from '../../shared/camera_renderer.ts';
import {useCameraRenderer} from '../use_camera_renderer.ts';

interface Props {device:Device;devices:Device[];collisions:IPCollisionRecord[];onClose:()=>void;onInspect:(device:Device)=>void;onConfigure:(device:Device)=>void;onDuplicate:(device:Device,ip?:string)=>void}
const control='rounded border border-slate-400 bg-white px-3 py-1.5 text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';
/** Camera renderer control plane. Access approval remains bound to current physical-device evidence. */
export function CameraBrowserWorkspace({device,devices,collisions,onClose,onInspect,onConfigure,onDuplicate}:Props){
 const workspace=useRef<HTMLElement>(null);
 const local=decideCameraAccess(device.id,devices,collisions);
 const identity=JSON.stringify([device.id,device.network.ipAddress,device.anchor,device.sessionVerification,device.identityConflicts,local.code]);
 const owner=useRef(identity);owner.current=identity;
 const [approved,setApproved]=useState<{identity:string;decision:CameraAccessDecision;endpoint:CameraAccessEndpoint}|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[tools,setTools]=useState(false),[credentials,setCredentials]=useState(false);
 useModalFocus(true,false,workspace,()=>credentials?setCredentials(false):onClose());
 const active=useRef<AbortController|null>(null),pending=useRef(false);
 const safe=local.allowed&&approved?.identity===identity&&approved.decision.allowed&&approved.decision.deviceId===device.id&&approved.decision.ipAddress===device.network.ipAddress;
 const endpoint=safe?approved!.endpoint:null;
 const addressValid=(()=>{try{const u=new URL(endpoint?.url||'');return ['http:','https:'].includes(u.protocol)&&u.hostname===device.network.ipAddress&&!u.username&&!u.password;}catch{return false}})();
 const frameEligible=Boolean(safe&&addressValid&&!endpoint?.certificateWarning&&!(location.protocol==='https:'&&endpoint?.scheme==='http'));
 const {renderer:cameraRenderer,current:rendererCurrent,notice,act}=useCameraRenderer(device.id,safe&&addressValid?new URL(endpoint!.url).origin:null,identity);
 const native=cameraRenderer instanceof NativeCameraRenderer;
 const renderer=cameraRenderer.state,revision=cameraRenderer.revision;
 const frameAllowed=(native||frameEligible)&&safe&&addressValid&&rendererCurrent&&Boolean(cameraRenderer.session)&&renderer!=='BLOCKED'&&renderer!=='CLOSED'&&(!native||renderer!=='FAILED');
 const load=async(signal:AbortSignal,key:string)=>{
  const {response,body}=await requestJson(`http://localhost:3001/api/connect/${encodeURIComponent(device.id)}`,{signal},fetch,5000);
  if(owner.current!==key||signal.aborted)return;
  const data=body as {accessDecision?:CameraAccessDecision;endpoint?:CameraAccessEndpoint;error?:string};
  if(!response.ok||!data.accessDecision||!data.endpoint)throw Error('Camera access evidence is unavailable. Recheck when the backend is available.');
  setApproved({identity:key,decision:data.accessDecision,endpoint:data.endpoint});
 };
 useEffect(()=>{owner.current=identity;const c=new AbortController();active.current?.abort();active.current=c;setApproved(null);setLoading(true);setBusy(false);pending.current=false;setMessage('');setCredentials(false);setTools(false);
  if(local.allowed)void load(c.signal,identity).catch(e=>{if(!c.signal.aborted&&owner.current===identity)setMessage(e.message)}).finally(()=>{if(!c.signal.aborted&&owner.current===identity)setLoading(false)});else setLoading(false);
  return()=>{c.abort();if(owner.current===identity)owner.current='closed'};
 },[identity]);
 // Cross-origin onload cannot prove rendering (including X-Frame-Options failures).
 // Keep an unconfirmed attempt bounded; the technician may explicitly keep a visible page.
 useEffect(()=>{if(native||!frameAllowed||renderer!=='LOADING')return;const timer=setTimeout(()=>act('fail'),12000);return()=>clearTimeout(timer)},[native,frameAllowed,renderer,revision,identity]);
 const recheck=async()=>{if(!local.allowed||(approved?.identity===identity&&!approved.decision.allowed)||pending.current)return;pending.current=true;setBusy(true);setMessage('Rechecking read-only reachability and access evidence…');const key=identity,c=new AbortController();active.current?.abort();active.current=c;
  try{const result=await requestJson(`http://localhost:3001/api/connect/${encodeURIComponent(device.id)}/recheck`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:c.signal},fetch,15000);if(!result.response.ok)throw Error('Recheck could not complete. Review device evidence and try again.');await load(c.signal,key);if(owner.current===key&&!c.signal.aborted)setMessage('Recheck completed using current-session evidence. No login was attempted.');}
  catch(e){if(owner.current===key&&!c.signal.aborted){setApproved(null);setMessage(e instanceof Error?e.message:'Recheck unavailable.')}}finally{if(owner.current===key&&!c.signal.aborted){setBusy(false);pending.current=false}}
 };
 const external=async()=>{if(!safe||pending.current)return;pending.current=true;setBusy(true);const key=identity,c=new AbortController();active.current?.abort();active.current=c;
  try{const {response,body}=await requestJson(`http://localhost:3001/api/connect/${encodeURIComponent(device.id)}/open`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preference:'SYSTEM'}),signal:c.signal},fetch,10000);if(owner.current!==key||c.signal.aborted)return;
   const data=body as {accessDecision?:CameraAccessDecision};if(!response.ok){setApproved(null);if(data.accessDecision?.code==='AMBIGUOUS_COLLISION')onDuplicate(device,data.accessDecision.ipAddress);throw Error('Camera launch was not accepted. Review current access evidence.');}setMessage('External browser launch requested. Page and device response are not verified; login is not confirmed.');
  }catch(e){if(owner.current===key&&!c.signal.aborted)setMessage(e instanceof Error?e.message:'External launch unavailable.')}finally{if(owner.current===key&&!c.signal.aborted){setBusy(false);pending.current=false}}
 };
 const blocked=!local.allowed?local:approved?.identity===identity&&!approved.decision.allowed?approved.decision:null;
 const failed=safe&&(!frameEligible||(rendererCurrent&&(renderer==='FAILED'||renderer==='BLOCKED')));
 return createPortal(<div><section ref={workspace} tabIndex={-1} aria-label="Camera Browser" className="fixed inset-0 z-40 flex min-h-0 flex-col bg-slate-50 text-slate-900">
  <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-white px-4 py-2"><div><h2 className="font-semibold">Camera Browser — {device.technician?.name||device.anchor.vendor}</h2><p className="text-xs">{device.anchor.model||'Unknown model'} • {device.network.ipAddress} • MAC Last 6: {device.anchor.macAddress?.replace(/[^a-f0-9]/gi,'').slice(-6).toUpperCase()||'Unknown'} • Observed status: {device.status}</p></div><button className={control} onClick={onClose}>Close Camera Browser</button></header>
  <nav aria-label="Camera navigation" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-4 py-2">
   <button className={control} disabled={!frameAllowed||!cameraRenderer.canGoBack} onClick={()=>act('goBack')} title="Navigation history is unavailable in this renderer">Back</button><button className={control} disabled={!frameAllowed||!cameraRenderer.canGoForward} onClick={()=>act('goForward')} title="Navigation history is unavailable in this renderer">Forward</button>
   <button className={control} disabled={!frameAllowed||busy||(native&&(cameraRenderer as NativeCameraRenderer).code==='PREPARING')} onClick={()=>act('refresh')}>Refresh</button><span className="min-w-0 flex-1 break-all text-xs">{loading?'Checking access…':endpoint?.url||device.network.ipAddress}</span>
   <button className={control+' font-semibold'} disabled={!safe||busy} onClick={()=>void external()}>Open External</button><button className={control} disabled={Boolean(blocked)||busy||loading} onClick={()=>void recheck()}>{busy?'Working…':'Recheck'}</button>
   <button className={control} aria-expanded={tools} onClick={()=>setTools(!tools)}>More / technician tools</button>
  </nav>
  {tools&&<div className="flex shrink-0 flex-wrap gap-2 border-b border-slate-300 bg-white px-4 py-2"><button className={control} onClick={()=>{setCredentials(true);setTools(false)}}>Credential Assistance</button><button className={control} onClick={()=>onInspect(device)}>Device Inspector</button><button className={control} onClick={()=>onConfigure(device)}>Device Configuration</button></div>}
  {notice&&<p role="status" className="shrink-0 px-4 py-2 text-sm text-blue-900">{nativeWorkspaceText[notice]} {notice==='GATED'?'Iframe compatibility mode remains available below.':''}</p>}
  {message&&<p role="status" className="shrink-0 px-4 py-2 text-sm text-blue-900">{message}</p>}
  {safe&&rendererCurrent&&renderer==='BLOCKED'&&<p role="status" className="shrink-0 px-4 py-2 text-sm text-blue-900">The browser session expired or is no longer authorized. Close and reopen Camera Browser to check current evidence. Open External performs its own access check.</p>}
  <main aria-label="Camera content" className="relative flex min-h-0 flex-1 flex-col overflow-auto">
   {blocked?<div role="alert" className="m-4 max-w-2xl rounded border border-amber-400 bg-amber-50 p-4"><p>{blocked.message}</p>{blocked.code==='AMBIGUOUS_COLLISION'&&<button className={control+' mt-3'} onClick={()=>onDuplicate(device,blocked.ipAddress)}>Open Duplicate Assistant</button>}</div>:loading?<p className="p-4">Checking current device access. Camera navigation has not started.</p>:native?<div role="status" className="m-4 max-w-2xl rounded border border-slate-300 bg-white p-4"><h3 className="font-semibold">{nativeWorkspaceText[(cameraRenderer as NativeCameraRenderer).code]}</h3><p className="mt-2 text-sm">Camera content is shown in a separate window. Opening a page does not confirm identity ownership or login.</p></div>:failed?<div role="alert" className="m-4 max-w-2xl rounded border border-slate-300 bg-white p-4"><h3 className="font-semibold">The embedded camera page could not be confirmed.</h3><p>{endpoint?.verified?`A web response was observed at ${device.network.ipAddress}.`:`Camera address: ${device.network.ipAddress}. Current reachability is not confirmed.`} Embedded compatibility is separate from network reachability.</p><p>{endpoint?.certificateWarning?'Certificate trust warning: use the external browser to review it.':'Some camera interfaces cannot display in this renderer.'}</p><button className={control+' mt-3 font-semibold'} disabled={!safe||busy} onClick={()=>void external()}>Open in External Browser</button></div>:frameAllowed?<>
    {renderer==='LOADING'&&<div className="flex shrink-0 flex-wrap items-center gap-2 bg-blue-50 px-4 py-2 text-xs"><span>Trying the embedded page. If it is visible, choose Keep open within 12 seconds; otherwise an external-browser fallback will appear. Rendering cannot be verified automatically.</span><button className={control} onClick={()=>act('displayed')}>Page visible — keep open</button><button className={control} onClick={()=>act('fail')}>Page not displaying</button></div>}
    <iframe key={identity+revision} src={cameraRenderer.session!.origin} title="Camera webpage" className="min-h-0 w-full flex-1 border-0 bg-white" sandbox="allow-same-origin allow-scripts allow-forms" onError={()=>act('fail')}/>
   </>:<p className="p-4">Access is not approved. Recheck current evidence before opening the camera.</p>}
  </main>
  {credentials&&<BrowserModal isOpen onClose={()=>setCredentials(false)} device={device} devices={devices} collisions={collisions} onOpenDuplicateAssistant={onDuplicate}/>}
 </section></div>,document.body);
}
