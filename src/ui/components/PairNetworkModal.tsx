import React, { useEffect, useState } from 'react';
import { Device, PairSessionState, WindowsAdapterSnapshot } from '../../types/index.ts';
import { AlertTriangle, CheckCircle, Info, Network, RefreshCw, RotateCcw, X } from 'lucide-react';

interface Props { isOpen: boolean; device: Device | null; pair: PairSessionState | null; onClose: () => void; onPairUpdated: (pair: PairSessionState) => void; }

export const PairNetworkModal: React.FC<Props> = ({ isOpen, device, pair, onClose, onPairUpdated }) => {
  const [adapters, setAdapters] = useState<WindowsAdapterSnapshot[]>([]);
  const [interfaceIndex, setInterfaceIndex] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    fetch('http://localhost:3001/api/pair/adapters').then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error); return data as WindowsAdapterSnapshot[];
    }).then(data => { setAdapters(data); setInterfaceIndex(device?.reachability?.pairEligibility?.adapterIndexes[0] ?? (data.length === 1 ? data[0].interfaceIndex : '')); }).catch(err => setError(err.message));
  }, [isOpen, device?.id]);
  if (!isOpen) return null;

  const action = async (path: string, body: Record<string, unknown> = {}) => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`http://localhost:3001${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Pair operation failed.'); onPairUpdated(data); if(path==='/api/pair/keep')onClose();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  const currentPair = pair?.deviceId === device?.id || pair?.recoveryAvailable || (!device&&pair?.purpose!=='NETWORK_MATCH') ? pair : null;
  const ready = currentPair?.state === 'READY_FOR_CONFIRMATION';
  const selected = currentPair?.selectedCandidate;

  return <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-5">
    <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between">
        <div><h2 className="font-bold flex items-center gap-2"><Network className="w-5 h-5 text-sky-400" />Pair PC to Camera Network</h2><p className="text-xs text-slate-400 mt-1">Temporarily changes only the adapter you select. The camera IP is never changed.</p></div>
        <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
      </div>
      <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
        <div className="p-3 rounded-lg bg-sky-950/30 border border-sky-700/40 text-sky-200 flex gap-2"><Info className="w-4 h-4 shrink-0" />Pair temporarily assigns a compatible IPv4 address to the selected PC adapter. Your original DHCP/static, gateway, and DNS state is captured for explicit restoration.</div>
        {error && <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-700 text-rose-300 flex gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}

        {currentPair?.recoveryAvailable && ['PAIRED', 'ROLLBACK_REQUIRED', 'RESTORING'].includes(currentPair.state) ? <>
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="flex justify-between"><span>Pair state</span><strong className={currentPair.recoveryDisposition==='HEALTHY_RETAINED'?'text-sky-300':'text-amber-300'}>{currentPair.recoveryDisposition==='HEALTHY_RETAINED'?'Configuration retained':currentPair.state}</strong></div>
            <div className="flex justify-between"><span>Adapter</span><strong>{currentPair.originalAdapter.interfaceAlias}</strong></div>
            <div className="flex justify-between"><span>Temporary IP</span><strong className="font-mono">{currentPair.adapter.ipv4Addresses.map(ip=>`${ip.address}/${ip.prefixLength}`).join(', ')}</strong></div>
            <div className="flex justify-between"><span>Adapter verified</span><strong>{currentPair.adapterConfigurationVerified ? 'Yes' : 'No / uncertain'}</strong></div>
            <div className="flex justify-between"><span>Camera responded</span><strong>{currentPair.cameraReachabilityVerified ? 'Yes' : 'Not verified'}</strong></div>
            <p className="text-slate-400">{currentPair.message}</p>
          </div>
          {currentPair.recoveryDisposition==='HEALTHY_RETAINED'&&<><p className="text-slate-300">Configuration previously applied by CCTV Network Assistant. Original configuration safely retained.</p><button disabled={busy} onClick={()=>action('/api/pair/keep')} className="w-full py-2 rounded bg-sky-800">Keep Current</button></>}
          <button disabled={currentPair.errorCode==='INVALID_RECOVERY'||busy||currentPair.state==='RESTORING'} onClick={() => action('/api/pair/restore')} className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold flex items-center justify-center gap-2 disabled:opacity-50"><RotateCcw className="w-4 h-4" />Restore Original Network Configuration</button>
        </> : <>
          {!ready && <div className="space-y-3">
            <div><label className="block text-slate-400 mb-1">Camera</label><div className="p-2 bg-slate-950 border border-slate-800 rounded font-mono">{device ? `${device.technician?.name || device.anchor.vendor} — ${device.network.ipAddress} / ${device.network.subnetMask || 'unknown mask'}` : 'Select a camera'}</div></div>
            <div><label className="block text-slate-400 mb-1">Windows adapter to temporarily change</label><select value={interfaceIndex} onChange={event => setInterfaceIndex(Number(event.target.value))} className="w-full p-2 bg-slate-950 border border-slate-700 rounded"><option value="">Choose an eligible adapter…</option>{adapters.map(adapter => <option key={adapter.interfaceIndex} value={adapter.interfaceIndex}>{adapter.interfaceAlias} — {adapter.mediaType} — {adapter.ipv4Addresses.map(ip => ip.address).join(', ') || 'No IPv4'}</option>)}</select></div>
            <button disabled={busy || !device || interfaceIndex === ''} onClick={() => action('/api/pair/prepare', { deviceId: device!.id, interfaceIndex })} className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 rounded-lg font-bold disabled:opacity-50">Check Addresses and Prepare Preview</button>
            {busy && <button onClick={() => fetch('http://localhost:3001/api/pair/cancel', { method: 'POST' }).then(() => setBusy(false))} className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-lg">Cancel Address Checking</button>}
          </div>}

          {ready && selected && <div className="space-y-3">
            <h3 className="font-bold text-sm">Confirmation preview</h3>
            {currentPair.subnetSource === 'ADAPTER_PREFIX_PROPOSAL' && <p className="rounded border border-amber-700/50 bg-amber-950/30 p-3 text-amber-200">Camera subnet mask is unknown. The temporary /{selected.prefixLength} subnet is proposed from the selected adapter's current prefix; it is not a verified camera setting. Review it before confirming. Camera addressing, credentials, and ONVIF settings will not change.</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1"><strong className="text-slate-300">Before — preserved</strong><p>Adapter: {currentPair.originalAdapter.interfaceAlias}</p><p>DHCP: {currentPair.originalAdapter.dhcpEnabled ? 'Enabled' : 'Disabled'}</p><p>IPv4: {currentPair.originalAdapter.ipv4Addresses.map(ip => `${ip.address}/${ip.prefixLength}`).join(', ') || 'None'}</p><p>Gateway: {currentPair.originalAdapter.defaultGateways.join(', ') || 'None'}</p><p>DNS: {currentPair.originalAdapter.dnsAutomatic ? 'Automatic' : currentPair.originalAdapter.dnsServers.join(', ') || 'None'}</p></div>
              <div className="p-3 bg-sky-950/30 border border-sky-700/40 rounded-xl space-y-1"><strong className="text-sky-300">Temporary Pair</strong><p>IPv4: {selected.ipAddress}/{selected.prefixLength}</p><p>Subnet: {currentPair.cameraSubnetMask}</p><p>Gateway: None added</p><p>DNS: No new DNS configured</p><p>Camera: {currentPair.cameraIp}</p></div>
            </div>
            <div><label className="block text-slate-400 mb-1">Verified candidate</label><select value={selected.ipAddress} onChange={event => action('/api/pair/candidate', { ipAddress: event.target.value })} className="w-full p-2 bg-slate-950 border border-slate-700 rounded">{currentPair.candidates.map(candidate => <option key={candidate.ipAddress}>{candidate.ipAddress}</option>)}</select><ul className="mt-2 text-[11px] text-slate-500 list-disc ml-5">{selected.evidence.map(item => <li key={item}>{item}</li>)}</ul></div>
            <div className="p-3 border border-amber-700/50 bg-amber-950/30 rounded text-amber-200">Confirming may temporarily interrupt traffic on <strong>{currentPair.originalAdapter.interfaceAlias}</strong>. Unrelated adapters are not changed. Restore remains available even if the camera does not respond.</div>
            <div className="flex gap-2"><button disabled={busy} onClick={() => action('/api/pair/cancel')} className="flex-1 py-2 bg-slate-800 rounded">Cancel — make no change</button><button disabled={busy} onClick={() => action('/api/pair/confirm', { sessionId: currentPair.id, confirmed: true })} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 rounded font-bold flex justify-center gap-2">{busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}Confirm and Pair</button></div>
          </div>}
        </>}
      </div>
    </div>
  </div>;
};
