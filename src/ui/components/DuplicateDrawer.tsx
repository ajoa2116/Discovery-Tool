import React, { useEffect, useRef, useState } from 'react';
import { Device, IPCollisionRecord } from '../../types/index.ts';
import { duplicateAssistantView } from '../../shared/duplicate_assistant.ts';
import { requestJson } from '../bounded_request.ts';
import { X } from 'lucide-react';

interface Props {
  isOpen:boolean; onClose:()=>void; collisions:IPCollisionRecord[]; devices:Device[];
  selectedCollisionId?:string|null; onChanged:()=>Promise<void>;
  onDetails:(device:Device)=>void; onDiagnose:(device:Device)=>Promise<void>; onOpen:(device:Device)=>void;
}
const button='rounded border border-slate-300 bg-white px-3 py-2 text-slate-800 hover:bg-slate-100 disabled:opacity-50';
const available=(value?:string|null)=>value||'Not available';
const timestamp=(value?:string)=>value?new Date(value).toLocaleString():'Not available';

export const DuplicateDrawer:React.FC<Props>=({isOpen,onClose,collisions,devices,selectedCollisionId,onChanged,onDetails,onDiagnose,onOpen})=>{
  const view=duplicateAssistantView(collisions,devices,selectedCollisionId||'');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const controller=useRef<AbortController|null>(null),owner=useRef('');
  const key=JSON.stringify([isOpen,selectedCollisionId]);owner.current=key;
  useEffect(()=>{setBusy(false);setMessage('');return()=>controller.current?.abort();},[key]);
  if(!isOpen)return null;
  const run=async(action:()=>Promise<string>)=>{
    const started=key;setBusy(true);setMessage('');
    try{const result=await action();if(owner.current===started)setMessage(result);}
    catch(error){if(owner.current===started)setMessage(error instanceof Error&&error.name==='TimeoutError'?'The check timed out. Current evidence remains unchanged until discovery completes.':error instanceof Error?error.message:'The action could not complete.');}
    finally{if(owner.current===started)setBusy(false);}
  };
  const refresh=()=>run(async()=>{
    if(!view)return 'This collision is no longer available.';
    controller.current?.abort();const current=new AbortController();controller.current=current;
    const {response,body}=await requestJson(`http://localhost:3001/api/edge/collisions/${encodeURIComponent(view.id)}/recheck`,{method:'POST',signal:current.signal},fetch,45000);
    if(!response.ok)throw Error('Collision recheck could not complete. Refresh the current project and retry.');
    if(current.signal.aborted)return '';
    await onChanged();
    const result=body as {outcome:string;reason?:string};
    return result.outcome==='COMPLETED'?'Discovery check completed. The state below reflects current identity evidence.':result.outcome==='SKIPPED'?`Check deferred: ${result.reason||'another operation is active'}. Retry when it finishes.`:'Discovery check failed. Existing collision evidence is retained; retry when discovery is available.';
  });
  const copy=(value:string,label:string)=>run(async()=>{await navigator.clipboard.writeText(value);return `${label} copied.`;});
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-3 sm:p-6">
    <section role="dialog" aria-modal="true" aria-label="Duplicate IP Assistant" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white text-sm text-slate-800 shadow-xl">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div><h2 className="text-lg font-bold">Duplicate IP Assistant</h2>{view&&<p><span className="font-mono">{view.ip}</span> · {view.active?`${view.currentAtSharedIp} devices currently share this address`:'Collision resolved'}</p>}</div>
        <button className={button} aria-label="Close Duplicate Assistant" onClick={onClose}><X className="h-4 w-4"/></button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {!view?<p>This collision is no longer available in the current project. Close this window and select a current device.</p>:<>
          <div role="status" className={`rounded-lg border p-3 ${view.active?'border-amber-300 bg-amber-50 text-amber-950':'border-emerald-300 bg-emerald-50 text-emerald-950'}`}>
            <strong>{view.active?'Active collision — access is ambiguous':'Collision resolved'}</strong>
            <p className="mt-1">{view.active?'These devices have separate physical identities but currently share the same IP address. Browser and configuration access cannot safely select a participant.':'Current identity evidence no longer places these participants at one shared address. Historical collision evidence is retained.'}</p>
          </div>
          <p>Identify the physical camera using its label and established identity. Correct its address using an appropriate external, vendor, or direct method, then choose Refresh / Recheck. This assistant does not change camera or adapter settings.</p>
          <p className="text-xs text-slate-600">MAC and ONVIF UUID are identity anchors; serial is supporting identity evidence. An IP, neighbor observation, or successful diagnostic is contextual evidence. Knowing a MAC or UUID does not make HTTP routing identity-bound.</p>
          {view.participants.map(p=>{const current=devices.find(d=>d.id===p.id);return <article key={p.id} aria-label={`Participant ${p.name}`} className="space-y-3 rounded-lg border border-slate-300 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold">{p.name}</h3><p className="text-slate-600">{available(p.manufacturer)} · {available(p.model)}</p></div><span className="rounded bg-slate-100 px-2 py-1 text-xs">{p.status}</span></div>
            <div className="flex flex-wrap justify-between gap-3"><div>Current IP <strong className="block font-mono">{available(p.ip)}</strong></div><div>MAC Last 6 <strong className="block font-mono text-xl tracking-wider">{available(p.macLastSix)}</strong></div></div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 break-all text-xs"><dt>Full MAC</dt><dd className="font-mono">{available(p.mac)}</dd><dt>Serial</dt><dd>{available(p.serial)}</dd><dt>ONVIF UUID</dt><dd className="font-mono">{available(p.uuid)}</dd><dt>Stable ID</dt><dd className="font-mono">{p.id}</dd><dt>Adapter</dt><dd>{available(p.adapter)}</dd><dt>Last seen</dt><dd>{timestamp(p.lastSeen)}</dd></dl>
            {!p.current&&<p className="text-amber-900">Historical participant; not in the current inventory. Current actions are unavailable.</p>}
            <details className="text-xs text-slate-600"><summary className="cursor-pointer py-1">Discovery and contextual evidence</summary><p>Discovery response: {timestamp(p.discoveryAt)}</p>{p.diagnostics.length?p.diagnostics.map((c,i)=><p key={i}>{c.type}: {c.success?'Response observed':'No response confirmed'} · {timestamp(c.at)}{c.ambiguous?' · Shared-IP evidence':''}</p>):<p>Diagnostics: Not available</p>}{p.neighbors.length?p.neighbors.map((n,i)=><p key={i}>Neighbor observation: {available(n.mac)} · {n.result} · {timestamp(n.at)}</p>):<p>Neighbor observations: Not available</p>}<p>These observations do not independently prove which camera a shared-IP request reaches.</p></details>
            <div className="flex flex-wrap gap-2"><button className={button} disabled={!current||busy} onClick={()=>current&&onDetails(current)}>Details</button><button className={button} disabled={!current||busy} onClick={()=>current&&void run(async()=>{await onDiagnose(current);return 'Diagnostics requested. Shared-IP results remain contextual evidence.';})}>Diagnose</button><button className={button} disabled={!p.mac||busy} onClick={()=>p.mac&&void copy(p.mac,'MAC')}>Copy MAC</button><button className={button} disabled={!p.serial||busy} onClick={()=>p.serial&&void copy(p.serial,'Serial')}>Copy Serial</button><button className={button} disabled={busy} onClick={()=>void copy(p.id,'Stable ID')}>Copy ID</button><button className={button} disabled={!current||!p.access.allowed||busy} onClick={()=>current&&p.access.allowed&&onOpen(current)}>Open</button></div>
            {!p.access.allowed&&<p className="text-xs text-amber-900">{p.access.message}</p>}
          </article>})}
        </>}
      </div>
      <footer className="shrink-0 space-y-2 border-t border-slate-200 bg-slate-50 p-4"><button className={button} disabled={busy||!view} onClick={()=>void refresh()}>{busy?'Checking…':'Refresh / Recheck'}</button><p role="status" className="text-xs text-slate-700">{message||'Read-only discovery; missing responses alone do not resolve a collision.'}</p></footer>
    </section>
  </div>;
};
