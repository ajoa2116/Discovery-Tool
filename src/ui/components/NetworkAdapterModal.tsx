import React,{useEffect,useState,useRef} from 'react';
import {createPortal} from 'react-dom';
import {requestJson} from '../bounded_request.ts';
import {useModalFocus} from '../use_modal_focus.ts';
import {operationFeedback} from '../operation_feedback.ts';
import {isAdapterCollection} from '../../shared/advanced_scan_contract.ts';
import { PairSessionState,WindowsAdapterSnapshot } from '../../types/index.ts';
import { networkMatchError } from '../../shared/network_match.ts';
interface Props {open:boolean;pair:PairSessionState|null;onClose:()=>void;onUpdated:(pair:PairSessionState)=>void}
export function NetworkAdapterModal({open,pair,onClose,onUpdated}:Props){
 const [adapters,setAdapters]=useState<WindowsAdapterSnapshot[]>([]),[index,setIndex]=useState(0),[ip,setIp]=useState(''),[prefix,setPrefix]=useState('24'),[gateway,setGateway]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const dialog=useRef<HTMLElement>(null),inFlight=useRef(false);
 const [loading,setLoading]=useState(false),[reload,setReload]=useState(0);
 useModalFocus(open,false,dialog,onClose);
 useEffect(()=>{
  if(!open)return;const controller=new AbortController();setError('');setAdapters([]);setLoading(true);
  void requestJson('http://localhost:3001/api/pair/adapters',{signal:controller.signal},fetch,10000).then(({response,body})=>{
   if(!response.ok||!isAdapterCollection(body))throw Error(operationFeedback(body,'Windows adapter information is unavailable. Reload adapters to try again.'));
   if(!controller.signal.aborted){setAdapters(body);setIndex(current=>body.some(a=>a.interfaceIndex===current)?current:body.length===1?body[0].interfaceIndex:0);}
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason.name==='TimeoutError'?'Adapter inspection timed out. Reload adapters to try again.':reason.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return()=>controller.abort();
 },[open,pair?.state,reload]);
 if(!open)return null;
 const current=adapters.find(a=>a.interfaceIndex===index),match=pair?.purpose==='NETWORK_MATCH'?pair:null,ready=match?.state==='READY_FOR_CONFIRMATION',active=Boolean(match?.recoveryAvailable);
 const act=async(path:string,body:unknown={})=>{
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
  try{
   const result=await requestJson('http://localhost:3001'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},fetch,60000);
   if(!result.response.ok)throw Error(operationFeedback(result.body,'The adapter operation could not complete.'));
   if(!result.body||typeof result.body!=='object'||!('state' in result.body))throw Error('Adapter result is unavailable. Check Tasks and recovery state before retrying.');
   onUpdated(result.body as PairSessionState);
  }catch(reason){
   setError(reason instanceof Error&&reason.name!=='TimeoutError'?reason.message:'The operation outcome is not yet confirmed. Check Tasks and recovery state before retrying.');
   try{const result=await requestJson('http://localhost:3001/api/pair/status',{},fetch,5000);if(result.response.ok&&result.body&&typeof result.body==='object'&&'state' in result.body)onUpdated(result.body as PairSessionState);}catch{/* Preserve the original error; a failed read is not a new mutation. */}
  }finally{inFlight.current=false;setBusy(false)}
 };
 const summary=(adapter:WindowsAdapterSnapshot)=><div><strong>{adapter.interfaceAlias}</strong><p>{adapter.operationalStatus} • DHCP {adapter.dhcpEnabled?'Enabled':'Disabled'}</p><p>{adapter.ipv4Addresses.map(ip=>`${ip.address}/${ip.prefixLength}`).join(', ')||'No IPv4'}</p><p>Gateway: {adapter.defaultGateways.join(', ')||'None'}</p><p>DNS: {adapter.dnsAutomatic?'Automatic':adapter.dnsServers.join(', ')||'None'}</p></div>;
 const input={interfaceIndex:index,ipAddress:ip.trim(),prefixLength:Number(prefix),gateway:gateway.trim()||undefined};
 return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Network Adapter" className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl bg-white p-5 text-sm text-slate-800 shadow-xl dark:bg-slate-900 dark:text-slate-100"><div className="flex justify-between"><h2 className="font-bold">Network Adapter</h2><button aria-label="Close Network Adapter" onClick={onClose}>Close</button></div><p className="my-3">Temporarily configure one PC adapter without a camera row. Camera addresses and DNS settings are not changed. Scan starts only when you choose it.</p>{busy&&<p role="status" className="my-2">Waiting for authoritative adapter state…</p>}{loading&&<p role="status">Inspecting Windows adapters…</p>}{!loading&&!adapters.length&&<p>No eligible adapter information is available.</p>}{!busy&&<button onClick={()=>setReload(n=>n+1)} className="my-2 underline">Reload Adapters</button>}{error&&<p role="alert" className="my-2 text-red-700 dark:text-red-300">{error}</p>}
 {active&&match?<div className="space-y-3"><strong>{match.state==='PAIRED'?'Temporary network active':match.state.replaceAll('_',' ')}</strong><p>{match.message}</p>{summary(match.adapter)}<p>Preserved original configuration</p>{summary(match.originalAdapter)}<button disabled={busy||['APPLYING','VERIFYING','RESTORING'].includes(match.state)} onClick={()=>act('/api/pair/restore')} className="rounded bg-amber-600 px-3 py-2 text-white disabled:opacity-50">Restore Original Network Configuration</button></div>:ready&&match?<div className="space-y-3"><h3 className="font-semibold">Current / preserved configuration</h3>{summary(match.originalAdapter)}<h3 className="font-semibold">Temporary configuration</h3><p>{match.selectedCandidate?.ipAddress}/{match.selectedCandidate?.prefixLength}</p><p>Gateway: {match.temporaryGateway||'None'} • DNS unchanged</p><p>Confirming may interrupt traffic on {match.adapter.interfaceAlias}. Original settings are saved for Restore.</p><div className="flex gap-3"><button disabled={busy} onClick={()=>act('/api/pair/cancel')}>Cancel — make no change</button><button disabled={busy} onClick={()=>act('/api/pair/confirm',{sessionId:match.id,confirmed:true})} className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50">Apply Temporary Configuration</button></div></div>:<div className="space-y-3"><label className="block">Windows adapter<select aria-label="Windows adapter" value={index} onChange={e=>setIndex(Number(e.target.value))} className="ml-2 rounded border bg-transparent p-2"><option value={0}>Select adapter</option>{adapters.map(a=><option key={a.interfaceIndex} value={a.interfaceIndex}>{a.interfaceAlias} • {a.ipv4Addresses.map(ip=>`${ip.address}/${ip.prefixLength}`).join(', ')}</option>)}</select></label>{current&&summary(current)}<label className="block">Temporary IPv4<input aria-label="Temporary IPv4" value={ip} onChange={e=>setIp(e.target.value)} className="ml-2 rounded border bg-transparent p-2"/></label><label className="block">Prefix length<input aria-label="Prefix length" value={prefix} onChange={e=>setPrefix(e.target.value)} className="ml-2 w-16 rounded border bg-transparent p-2"/></label><label className="block">Gateway (optional)<input aria-label="Gateway (optional)" value={gateway} onChange={e=>setGateway(e.target.value)} className="ml-2 rounded border bg-transparent p-2"/></label><button disabled={busy||loading||!adapters.length} onClick={()=>{const invalid=networkMatchError(input);if(invalid)setError(invalid);else void act('/api/network-match/prepare',input)}} className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50">Preview Temporary Configuration</button></div>}</section></div>,document.body);
}
