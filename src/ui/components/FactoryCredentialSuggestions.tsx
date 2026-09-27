import React from 'react';
import {factoryCredentialGuidance,FactoryCredentialHint} from '../../shared/factory_credentials.ts';
export function FactoryCredentialSuggestions({manufacturer,model,firmware,onUse}:{manufacturer:string;model?:string;firmware?:string;onUse:(hint:FactoryCredentialHint,includePassword:boolean)=>void}){
 const hints=factoryCredentialGuidance(manufacturer,model,firmware),generic=hints.some(h=>h.scope==='Generic legacy camera');
 return <details className="rounded border border-slate-300 bg-slate-50 p-2 text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"><summary className="cursor-pointer rounded font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">Factory credential suggestions</summary>
  <p className="mt-2">{manufacturer||'Unknown manufacturer'} • {model||'Unknown model'}</p>
  {generic&&<h3 className="mt-2 font-semibold">Common legacy camera credentials — generic historical references</h3>}
  {hints.map(hint=><article key={hint.id} aria-label={hint.id} className="mt-2 rounded border border-slate-300 bg-white p-2 dark:border-slate-600 dark:bg-slate-950">
   <p className="font-semibold">{hint.passwordState==='INITIAL_SETUP'?'First login: password creation required':hint.scope==='Generic legacy camera'?'Generic legacy camera reference':'Factory guidance'}</p>
   <p>Username: {hint.username||'Not documented'}</p><p>Password: {hint.passwordState==='INITIAL_SETUP'?'Initial setup/password creation required':hint.passwordState==='BLANK'?'Blank password':hint.passwordState==='VALUE'?hint.passwordValue:'Unknown — no password suggested'}</p>
   <p>{hint.notes}</p><p>Applicability: {hint.scope||(hint.confidence==='MODEL_SPECIFIC'?'Model-specific':'Manufacturer common')}. Evidence: {hint.confidence==='LOW'?'Low applicability to this device':hint.confidence==='MODEL_SPECIFIC'?'Exact model documentation / field evidence':hint.confidence==='FAMILY'?'Documented product generation':'Manufacturer documentation; model applicability unconfirmed'}. Not verified credentials.</p>
   {hint.source.url?<a href={hint.source.url} target="_blank" rel="noreferrer" className="underline">{hint.source.title}</a>:<p>Source: {hint.source.title} (no verified link available)</p>}
   <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={!hint.username} onClick={()=>onUse(hint,false)} className="rounded bg-slate-100 px-2 py-1 text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">Use Username</button>{['VALUE','BLANK'].includes(hint.passwordState)&&<button type="button" onClick={()=>onUse(hint,true)} className="rounded bg-slate-100 px-2 py-1 text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">Use Credentials</button>}</div>
  </article>)}
  {!hints.length&&<p>No reliable factory credential hint is available for this identity. Consult the model documentation; no password is assumed.</p>}
  <p className="mt-2">Suggestions are not guaranteed. Selection only fills these fields. Nothing is submitted, tried, or saved automatically. Saved Credential Manager entries remain separate.</p>
 </details>;
}
