import React,{useEffect,useRef,useState} from 'react';
interface Props {
 count:number;removing:boolean;onDiagnose:()=>void;onNetwork:()=>void;onDevice:()=>void;onReport:()=>void;onRemove:()=>void;
 onAddReport:()=>void;onRemoveReport:()=>void;onDeselect:()=>void;onAddProject?:()=>void;
}
const button='rounded border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';
export function SelectedDeviceActions(p:Props){
 const[open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();const outside=(e:MouseEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};document.addEventListener('mousedown',outside);return()=>document.removeEventListener('mousedown',outside)},[open]);
 return <section aria-label="Selected devices" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
  <div className="flex flex-wrap items-center justify-between gap-3"><strong>{p.count} device(s) selected</strong><div className="flex flex-wrap gap-2">
   <button className={button} onClick={p.onDiagnose}>Diagnose</button>
   <div ref={root} className="relative" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setOpen(false);trigger.current?.focus();}if(open&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);const index=items.indexOf(document.activeElement as HTMLButtonElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowUp'?-1:1)+items.length)%items.length]?.focus();}}}>
    <button ref={trigger} className={button} aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(!open)} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setOpen(true)}}}>Configure</button>
    {open&&<div ref={menu} role="menu" aria-label="Configure selected devices" className="absolute right-0 z-30 mt-1 w-60 rounded-md border border-slate-300 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
     <button role="menuitem" disabled={p.count<2} className={button+' block w-full text-left'} onClick={()=>{setOpen(false);p.onNetwork()}}>Network Configuration</button>
     <button role="menuitem" disabled={p.count<2} className={button+' mt-1 block w-full text-left'} onClick={()=>{setOpen(false);p.onDevice()}}>Device Configuration</button>
     {p.count<2&&<p className="p-2 text-slate-600 dark:text-slate-300">Select at least two devices for bulk configuration.</p>}
    </div>}
   </div>
   <button className={button} onClick={p.onReport}>Create Report</button>
   <button className={button} disabled={p.removing} onClick={p.onRemove}>Remove</button>
  </div></div>
  <div className="mt-2 flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
   {p.onAddProject&&<button className="rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" onClick={p.onAddProject}>Add to Existing Project</button>}
   <button className="rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" onClick={p.onAddReport}>Add to Report</button>
   <button className="rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" onClick={p.onRemoveReport}>Remove from Report</button>
   <button className="ml-auto rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" onClick={p.onDeselect}>Deselect All</button>
  </div>
 </section>;
}
