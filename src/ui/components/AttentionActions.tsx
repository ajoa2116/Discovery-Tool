import React,{useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useModalFocus} from '../use_modal_focus.ts';
import {activeCollisionChoices} from '../../shared/technician_attention.ts';
import {IPCollisionRecord} from '../../types/index.ts';

export function AttentionActions({kind,collisions,onCollision,onSave,onClose}:{kind:'COLLISIONS'|'SAVE'|null;collisions:IPCollisionRecord[];onCollision:(id:string)=>void;onSave:(saveAs:boolean)=>Promise<void>;onClose:()=>void}){
 const dialog=useRef<HTMLDivElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useModalFocus(Boolean(kind),busy,dialog,onClose);
 if(!kind)return null;
 const save=async(saveAs:boolean)=>{setBusy(true);setError('');try{await onSave(saveAs);onClose()}catch{setError('Project could not be saved. Your changes remain available; retry.')}finally{setBusy(false)}};
 const button='rounded border border-slate-300 px-3 py-2 text-blue-800 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50';
 return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 p-4"><div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={kind==='SAVE'?'Unsaved project changes':'Choose collision'} className="max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-xl border border-slate-300 bg-white p-5 text-sm text-slate-800 shadow-xl"><h2 className="font-bold">{kind==='SAVE'?'Unsaved project changes':'Choose collision'}</h2>{kind==='SAVE'?<><p>Save your persistent project changes using the existing project download.</p><div className="flex gap-2"><button className={button} disabled={busy} onClick={()=>void save(false)}>Save Project</button><button className={button} disabled={busy} onClick={()=>void save(true)}>Save As</button></div></>:<div className="space-y-2">{activeCollisionChoices(collisions).length?activeCollisionChoices(collisions).map(c=><button className={button+' block w-full text-left'} key={c.id} onClick={()=>onCollision(c.id)}>{c.ip} — {c.count} devices</button>):<p>No active collisions remain.</p>}</div>}{error&&<p role="alert">{error}</p>}<button className={button} disabled={busy} onClick={onClose}>Close</button></div></div>,document.body);
}
