import React,{useState} from 'react';
import {PairSessionState,WindowsAdapterSnapshot} from '../../types/index.ts';
export function LegacyRecoveryRetirement({pair,adapters,busy,onRetire}:{pair:PairSessionState;adapters:WindowsAdapterSnapshot[];busy:boolean;onRetire:()=>void}){
 const [confirm,setConfirm]=useState(false);
 return <section aria-label="Legacy recovery review" className="space-y-3 rounded border border-amber-400 bg-amber-50 p-3 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
  <h3 className="font-bold">Older network recovery record</h3><p>{pair.message}</p>
  <p>Saved adapter: {pair.originalAdapter.interfaceAlias} (index {pair.originalAdapter.interfaceIndex}). Its identity is unverified; this is not a Restore target.</p>
  <h4 className="font-semibold">Current Windows adapters — informational only</h4>
  <p>These observations are not matched to the old record. Retirement accepts current Windows settings even if they differ from the saved settings.</p>
  {adapters.length?adapters.map(a=><div key={a.interfaceIndex}><strong>{a.interfaceAlias} • index {a.interfaceIndex}</strong><p>{a.ipv4Addresses.map(ip=>`${ip.address}/${ip.prefixLength}`).join(', ')||'No IPv4'} • DHCP {a.dhcpEnabled?'Enabled':'Disabled'}</p><p>Gateway: {a.defaultGateways.join(', ')||'None'} • DNS: {a.dnsAutomatic?'Automatic':a.dnsServers.join(', ')||'None'}</p></div>):<p>Current adapter information is unavailable. No Windows setting will be changed.</p>}
  {!confirm?<button type="button" disabled={busy} onClick={()=>setConfirm(true)} className="rounded bg-blue-700 px-3 py-2 text-white">Keep Current / Retire Legacy Recovery</button>:<div className="space-y-3"><p>I intentionally accept the current Windows network configuration and retire this unverifiable old recovery obligation. The record will be archived locally. Original settings will NOT be restored.</p><button type="button" disabled={busy} onClick={()=>setConfirm(false)} className="rounded border px-3 py-2">Cancel — keep recovery record</button><button type="button" disabled={busy} onClick={onRetire} className="ml-2 rounded bg-blue-700 px-3 py-2 text-white">Confirm retirement — keep current settings</button></div>}
 </section>;
}
