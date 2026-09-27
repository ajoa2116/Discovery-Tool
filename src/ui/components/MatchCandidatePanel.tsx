import React,{useEffect,useRef,useState} from 'react';
import type {Device} from '../../types/index.ts';
import type {MatchCandidatePreview} from '../../shared/match_candidate_preview.ts';
import {requestJson} from '../bounded_request.ts';
/** Read-only result intentionally never enters the Pair session/confirmation workflow. */
export function MatchCandidatePanel({device,interfaceIndex}:{device:Device;interfaceIndex:number|''}){
 const [result,setResult]=useState<MatchCandidatePreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const revision=useRef(0),abort=useRef<AbortController|null>(null);
 useEffect(()=>{revision.current++;abort.current?.abort();setBusy(false);setResult(null);setError('');return()=>{revision.current++;abort.current?.abort();};},[device.id,device.network.ipAddress,device.network.subnetMask,JSON.stringify(device.anchor),device.status,JSON.stringify(device.identityConflicts),interfaceIndex]);
 const preview=async()=>{const current=++revision.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;setBusy(true);setResult(null);setError('');
  try{const {response,body}=await requestJson('http://localhost:3001/api/network-match/candidates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId:device.id,interfaceIndex}),signal:controller.signal},fetch,10000);
   const value=body as MatchCandidatePreview;
   if(!response.ok||value?.deviceId!==device.id||!Array.isArray(value?.candidates))throw Error('Candidate preview is unavailable.');
   if(revision.current===current)setResult(value);
  }catch{if(revision.current===current)setError('Candidate preview is unavailable. No network change has been made.');}finally{if(revision.current===current)setBusy(false);}
 };
 return <section aria-label="Match Network candidates" className="rounded border border-slate-200 bg-slate-50 p-3 text-slate-800">
  <button type="button" disabled={busy||interfaceIndex===''} onClick={()=>void preview()} className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50">Find Match Network candidates (read-only)</button>
  <p>No network change is made by this preview.</p>{busy&&<p role="status">Checking up to 32 addresses, for at most 8 seconds…</p>}{error&&<p role="alert">{error}</p>}
  {result&&<div role="status"><p>Target: {result.deviceName} • {result.targetIp}</p><p>Target network: {result.network?`${result.network}/${result.prefixLength}`:'Not established'}</p><p>Ethernet: {result.adapter?`${result.adapter.name} (interface ${result.adapter.interfaceIndex})`:'Not established'}</p>
   {result.candidates.slice(0,2).map((candidate,i)=><p key={candidate.ipAddress}>{i===0?'Preferred':'Fallback'} technician-PC candidate: {candidate.ipAddress}/{candidate.prefixLength}</p>)}<p>{result.message}</p>
  </div>}
 </section>;
}
