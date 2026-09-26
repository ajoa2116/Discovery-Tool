import {ModalViewport} from './ModalViewport.tsx';
import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {TaskSnapshot,TechnicianTask} from '../../shared/tasks.ts';
import {requestJson} from '../bounded_request.ts';
import {useModalFocus} from '../use_modal_focus.ts';

interface Snapshot extends TaskSnapshot {monitoring?:{enabled?:boolean;status?:string}}
export function Tasks({onResult,navigation,onSnapshot,onOpen,onDiagnostic}:{onResult:(result:NonNullable<TechnicianTask['result']>,correlationId:string)=>void;navigation?:{open:boolean;revision:number;taskId?:string};onSnapshot?:(snapshot:TaskSnapshot&{unavailable?:boolean})=>void;onOpen?:()=>void;onDiagnostic?:(deviceId:string,taskId:string)=>void}){
  const [snapshot,setSnapshot]=useState<Snapshot>({tasks:[],active:0,attention:0});
  const [open,setOpen]=useState(false),[selected,setSelected]=useState(''),[unavailable,setUnavailable]=useState(false),[message,setMessage]=useState(''),[pending,setPending]=useState('');
  const dialog=useRef<HTMLDivElement>(null),revision=useRef(0),cancelController=useRef<AbortController|null>(null);
  const detail=useRef<HTMLElement>(null),[selectionRevision,setSelectionRevision]=useState(0);
  const close=()=>setOpen(false);
  useEffect(()=>{if(navigation){setOpen(navigation.open);if(navigation.taskId)setSelected(navigation.taskId);}},[navigation]);
  useEffect(()=>{onSnapshot?.({...snapshot,unavailable});},[snapshot,unavailable,onSnapshot]);
  useModalFocus(open,false,dialog,close);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      const generation=revision.current;
      try{const {response,body}=await requestJson('http://localhost:3001/api/tasks',{signal:controller.signal},fetch,5000);const data=body as Snapshot;
        if(!response.ok||!Array.isArray(data?.tasks)||!Number.isInteger(data.active)||!Number.isInteger(data.attention))throw Error();
        if(!controller.signal.aborted&&generation===revision.current){setSnapshot(data);setUnavailable(false);}
      }catch{if(!controller.signal.aborted)setUnavailable(true);}
      if(!controller.signal.aborted)timer=setTimeout(poll,1500);
    };void poll();return()=>{controller.abort();cancelController.current?.abort();clearTimeout(timer);};
  },[]);
  const cancel=async(task:TechnicianTask)=>{
    setPending(task.id);setMessage('');revision.current++;const controller=new AbortController();cancelController.current=controller;
    try{const {response,body}=await requestJson(`http://localhost:3001/api/tasks/${encodeURIComponent(task.id)}/cancel`,{method:'POST',signal:controller.signal},fetch,5000);
      if(controller.signal.aborted)return;
      const value=body as TaskSnapshot&{accepted?:boolean};
      if(Array.isArray(value.tasks))setSnapshot(old=>({...old,...value}));
      setMessage(response.ok&&value.accepted?'Cancellation requested. Active work may need to finish safely.':'Cancellation was not accepted. The task may have changed phase.');
    }catch{if(!controller.signal.aborted)setMessage('Cancellation outcome is unavailable. Task status will reconcile when the connection returns.');}
    finally{if(!controller.signal.aborted)setPending('');revision.current++;}
  };
  const task=snapshot.tasks.find(t=>t.id===selected);
  useEffect(()=>{if(open&&task){detail.current?.scrollIntoView({block:'nearest'});detail.current?.focus({preventScroll:true});}},[open,selected,task?.id,selectionRevision]);
  const background=snapshot.monitoring?.enabled===false?'Paused':snapshot.monitoring?.status==='DEFERRED'?'Paused for technician work':snapshot.monitoring?.enabled===true?'Active':'Unavailable';
  return <><button className="ui-header-button" onClick={()=>{onOpen?.();setOpen(true)}} aria-haspopup="dialog" aria-label={`Tasks${unavailable?' • status unavailable':snapshot.active?` • ${snapshot.active} active`:''}${snapshot.attention?` • ${snapshot.attention} need attention`:''}`}>Tasks{!unavailable&&snapshot.active>0&&<span>{snapshot.active} active</span>}{snapshot.attention>0&&<span className="text-amber-700 dark:text-amber-300">{snapshot.attention} need attention</span>}{unavailable&&<span className="text-slate-500">?</span>}</button>
  {open&&createPortal(<ModalViewport className="fixed inset-0 z-[100] flex justify-end bg-black/40 p-2"><div ref={dialog} role="dialog" aria-modal="true" aria-label="Tasks" tabIndex={-1} className="flex h-full w-full max-w-xl flex-col rounded-lg bg-white p-4 text-slate-800 shadow-xl dark:bg-slate-900 dark:text-slate-100">
    <header className="flex items-center justify-between"><h2 className="text-lg font-semibold">Tasks</h2><button onClick={close} className="rounded border px-3 py-1 focus-visible:outline focus-visible:outline-blue-600">Close Tasks</button></header>
    {unavailable&&<p role="status" className="my-2 text-amber-800 dark:text-amber-200">Task status unavailable. Showing the last known state.</p>}
    {message&&<p role="status" className="my-2">{message}</p>}
    <div className="modal-body min-h-0 flex-1 overflow-auto py-3">
    {snapshot.tasks.length===0?<p>No recent technician tasks.</p>:<ul className="space-y-2" aria-label="Recent tasks">{snapshot.tasks.map(t=><li key={t.id}><button onClick={()=>{setSelected(t.id);setSelectionRevision(value=>value+1)}} aria-pressed={selected===t.id} className="w-full rounded border border-slate-300 p-3 text-left hover:bg-slate-100 focus-visible:outline focus-visible:outline-blue-600 dark:border-slate-600 dark:hover:bg-slate-800"><strong>{t.title}</strong>{' '}<span className="ml-2 text-sm">{t.state.replaceAll('_',' ')}</span><p className="text-sm">{t.phase}</p>{t.progress&&<p>{t.progress.completed} / {t.progress.total} completed</p>}</button></li>)}</ul>}
    {task&&<section ref={detail} tabIndex={-1} aria-label="Task details" className="mt-4 space-y-2 rounded border border-slate-300 p-3 dark:border-slate-600"><h3 className="font-semibold">{task.title}</h3><p>{task.state.replaceAll('_',' ')} — {task.phase}</p>{task.target&&<p>{task.target}</p>}{task.reportGeneration&&<p>Report generated: {task.reportGeneration.displayTimestamp} ({task.reportGeneration.timeZone})</p>}<p>Started: {new Date(task.startedAt).toLocaleString()}</p><p>{task.endedAt?`Ended: ${new Date(task.endedAt).toLocaleString()}`:`Elapsed: ${Math.max(0,Math.floor((Date.now()-Date.parse(task.startedAt))/1000))} seconds`}</p>{task.progress&&<progress aria-label="Task progress" value={task.progress.completed} max={task.progress.total}/>}<p className="break-all text-xs">Correlation: {task.correlationId}</p>{task.reference&&<p>Reference: {task.reference}</p>}{task.cancellable&&!unavailable&&<button disabled={Boolean(pending)} onClick={()=>void cancel(task)} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50">Cancel Task</button>}{onDiagnostic&&task.diagnosticDevices&&<div className="space-y-1"><p>Device diagnostic results</p>{task.diagnosticDevices.map(d=><button key={d.deviceId} className="block rounded border px-3 py-2 text-left text-blue-700 focus-visible:outline focus-visible:outline-blue-600" onClick={()=>{close();onDiagnostic(d.deviceId,task.id)}}>Inspect {d.deviceId} — {d.state.replaceAll('_',' ')}</button>)}</div>}{task.result&&<button onClick={()=>{close();onResult(task.result!,task.correlationId)}} className="ml-2 rounded border px-3 py-2">{task.result==='NETWORK_RECOVERY'?'View Network Recovery':task.result==='REPORTS'?'Open Reports':'Open Project History'}</button>}</section>}
    </div><footer className="border-t border-slate-200 pt-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">Background monitoring: {unavailable?'Unavailable':background}. Monitoring cycles do not create tasks.</footer>
  </div></ModalViewport>,document.body)}</>;
}
