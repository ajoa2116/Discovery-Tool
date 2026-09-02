import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2, X } from 'lucide-react';
import { AdvancedScanMethod, AdvancedScanPlan, AdvancedScanRequest, emptyAdvancedScanRequest } from '../../shared/advanced_scan.ts';
import { WindowsAdapterSnapshot } from '../../types/index.ts';
import { canonicalIPv4, IPv4Input, splitIPv4 } from './IPv4Input.tsx';

interface Props { open: boolean; onClose: () => void; onStarted: (quickFallback: boolean) => void }
interface TargetRow { type: 'CIDR' | 'RANGE'; first: string; second: string; prefix: string }

const methodLabels: Record<AdvancedScanMethod, string> = { ONVIF: 'ONVIF / WS-Discovery', NEIGHBOR: 'Windows Neighbor / ARP evidence', PING: 'ICMP / Ping', TCP: 'TCP Port Check' };
const completeIp = (value: string) => canonicalIPv4(splitIPv4(value));
const toggle = <T,>(items: T[], item: T) => items.includes(item) ? items.filter(value => value !== item) : [...items, item];

export const AdvancedScanModal: React.FC<Props> = ({ open, onClose, onStarted }) => {
  const [adapters, setAdapters] = useState<WindowsAdapterSnapshot[]>([]);
  const [request, setRequest] = useState<AdvancedScanRequest>(emptyAdvancedScanRequest());
  const [ranges, setRanges] = useState<TargetRow[]>([]);
  const [customPorts, setCustomPorts] = useState('');
  const [plan, setPlan] = useState<AdvancedScanPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const incompleteTarget = ranges.some(row => {
    const started = Boolean(row.first.replace(/\./g, ''));
    if (!started) return false;
    if (!completeIp(row.first)) return true;
    return row.type === 'CIDR' ? !(Number(row.prefix) >= 16 && Number(row.prefix) <= 32) : !completeIp(row.second);
  });
  const payload = useMemo<AdvancedScanRequest>(() => ({
    ...request,
    targets: ranges.reduce<AdvancedScanRequest['targets']>((targets, row) => {
      const first = completeIp(row.first);
      if (!first) return targets;
      if (row.type === 'CIDR') {
        if (Number(row.prefix) >= 16 && Number(row.prefix) <= 32) targets.push({ type: 'CIDR', cidr: `${first}/${Number(row.prefix)}` });
        return targets;
      }
      const second = completeIp(row.second);
      if (second) targets.push({ type: 'RANGE', start: first, end: second });
      return targets;
    }, []),
    customPorts: customPorts.split(/[\s,]+/).filter(Boolean).map(Number),
  }), [request, ranges, customPorts]);

  useEffect(() => {
    if (!open) return;
    fetch('http://localhost:3001/api/discovery/advanced/adapters').then(response => response.json()).then(setAdapters).catch(() => setError('Adapter inspection is unavailable.'));
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => fetch('http://localhost:3001/api/discovery/advanced/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(async response => {
      const data = await response.json(); setPlan(data); setError(response.ok ? '' : data.errors?.join(' ') || data.error);
    }).catch(() => setError('Advanced Scan validation is unavailable.')), 150);
    return () => clearTimeout(timer);
  }, [open, payload]);
  if (!open) return null;

  const updateRow = (index: number, patch: Partial<TargetRow>) => setRanges(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const start = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('http://localhost:3001/api/discovery/advanced/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw Error(data.errors?.join(' ') || data.error);
      onStarted(data.plan.mode === 'QUICK_FALLBACK'); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Advanced Scan could not start.'); }
    finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3"><div role="dialog" aria-modal="true" aria-label="Advanced Scan" className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
    <header className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700"><div><h2 className="flex items-center gap-2 font-bold"><Search className="h-4 w-4 text-blue-600"/>Advanced Scan</h2><p className="text-xs text-slate-500">Choose where and how you want to search.</p></div><button aria-label="Close Advanced Scan" onClick={onClose}><X className="h-5 w-5"/></button></header>
    <div className="grid flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-2"><section>
      <h3 className="text-xs font-bold uppercase text-slate-500">Network Adapters</h3><div className="mt-2 space-y-2">{adapters.map(adapter => <label key={adapter.interfaceIndex} className={`flex gap-2 rounded border p-2 text-xs ${adapter.eligible ? 'border-slate-200 dark:border-slate-700' : 'opacity-55'}`}><input type="checkbox" disabled={!adapter.eligible} checked={request.adapterIndexes.includes(adapter.interfaceIndex)} onChange={() => setRequest(value => ({ ...value, adapterIndexes: toggle(value.adapterIndexes, adapter.interfaceIndex) }))}/><span><strong>{adapter.interfaceAlias}</strong><span className="block text-slate-500">{adapter.ipv4Addresses.map(ip => `${ip.address} /${ip.prefixLength}`).join(', ') || 'No usable IPv4 address'} · {adapter.eligible ? 'Active' : adapter.eligibilityReason}</span></span></label>)}</div>
      <h3 className="mt-4 text-xs font-bold uppercase text-slate-500">IP Targets</h3><div className="mt-2 space-y-3">{ranges.map((row, index) => <div key={index} className="rounded border border-slate-200 p-2 dark:border-slate-700"><div className="mb-2 flex items-center justify-between"><select aria-label={`Target ${index + 1} type`} value={row.type} onChange={event => updateRow(index, { type: event.target.value as TargetRow['type'] })} className="rounded border bg-transparent p-1 text-xs"><option value="CIDR">CIDR</option><option value="RANGE">Range</option></select><button aria-label={`Remove target ${index + 1}`} onClick={() => setRanges(value => value.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="h-4 w-4"/></button></div><div className="flex flex-wrap gap-2">{row.type === 'CIDR'
        ? <IPv4Input label="CIDR address" value={row.first} prefix={row.prefix} prefixMin={16} prefixMax={32} onChange={first => updateRow(index, { first })} onPrefixChange={prefix => updateRow(index, { prefix })}/>
        : <><IPv4Input label="Start IP" value={row.first} onChange={first => updateRow(index, { first })}/><IPv4Input label="End IP" value={row.second} assistFrom={row.first} onChange={second => updateRow(index, { second })}/></>
      }</div></div>)}<button onClick={() => setRanges(value => [...value, { type: 'CIDR', first: '', second: '', prefix: '' }])} className="!flex items-center gap-1 rounded border px-2 py-1.5 text-xs"><Plus className="h-3.5 w-3.5"/>Add Range</button></div>
    </section><section>
      <h3 className="text-xs font-bold uppercase text-slate-500">Discovery Methods</h3><div className="mt-2 grid grid-cols-2 gap-2">{(Object.keys(methodLabels) as AdvancedScanMethod[]).map(method => <label key={method} className="flex gap-2 text-xs"><input type="checkbox" checked={request.methods.includes(method)} onChange={() => setRequest(value => ({ ...value, methods: toggle(value.methods, method) }))}/>{methodLabels[method]}</label>)}</div><p className="mt-2 text-[10px] text-slate-500">ONVIF multicast and MAC evidence are local-segment only. Ping failure does not exclude a device. TCP success proves only that a port accepted a connection.</p>
      <h3 className="mt-4 text-xs font-bold uppercase text-slate-500">Ports</h3><div className="mt-2 flex flex-wrap gap-3">{([['CAMERA_COMMON', 'Camera Common'], ['WEB', 'Web'], ['RTSP', 'RTSP']] as const).map(([key, label]) => <label key={key} className="text-xs"><input type="checkbox" checked={request.portPresets.includes(key)} onChange={() => setRequest(value => ({ ...value, portPresets: toggle(value.portPresets, key) }))}/> {label}</label>)}</div><input aria-label="Custom ports" value={customPorts} onChange={event => setCustomPorts(event.target.value)} placeholder="Custom ports: 80, 443, 554" className="mt-2 w-full rounded border bg-transparent p-2 text-xs"/>
      <h3 className="mt-4 text-xs font-bold uppercase text-slate-500">Optional Filters</h3><div className="mt-2 grid gap-2"><input aria-label="MAC starts with" value={request.filters.macPrefix || ''} onChange={event => setRequest(value => ({ ...value, filters: { ...value.filters, macPrefix: event.target.value } }))} placeholder="MAC starts with: AA:BB:CC" className="rounded border bg-transparent p-2 text-xs"/><select aria-label="Manufacturer filter" value={request.filters.manufacturer || ''} onChange={event => setRequest(value => ({ ...value, filters: { ...value.filters, manufacturer: event.target.value } }))} className="rounded border bg-transparent p-2 text-xs"><option value="">Any manufacturer</option>{['Hikvision', 'Dahua', 'Hanwha', 'Axis', 'Bosch', 'Pelco', 'Illustra'].map(value => <option key={value}>{value}</option>)}</select><label className="text-xs"><input type="checkbox" checked={request.filters.onlyLikelyCameras} onChange={event => setRequest(value => ({ ...value, filters: { ...value.filters, onlyLikelyCameras: event.target.checked } }))}/> Only show likely cameras</label><label className="text-xs"><input type="checkbox" checked={request.filters.includeUnknownDevices} onChange={event => setRequest(value => ({ ...value, filters: { ...value.filters, includeUnknownDevices: event.target.checked } }))}/> Include unknown network devices</label></div>
      <h3 className="mt-4 text-xs font-bold uppercase text-slate-500">Performance</h3><select value={request.performance} onChange={event => setRequest(value => ({ ...value, performance: event.target.value as AdvancedScanRequest['performance'] }))} className="mt-2 rounded border bg-transparent p-2 text-xs"><option value="CONSERVATIVE">Conservative</option><option value="NORMAL">Normal</option><option value="FAST">Fast</option></select>
      <div className="mt-4 rounded border border-blue-200 bg-blue-50 p-3 text-xs dark:border-blue-900 dark:bg-blue-950/30"><strong>Workload Summary</strong>{incompleteTarget ? <p className="mt-1 text-amber-700">Complete the IP target before starting.</p> : plan?.mode === 'QUICK_FALLBACK' ? <p className="mt-1">No advanced options selected. Standard Quick Scan will be used.</p> : <p className="mt-1">{plan?.adapterIndexes.length || 0} adapters · {payload.targets.length} ranges · {plan?.estimatedTargetCount || 0} unique addresses · {plan?.ports.length || 0} TCP ports<br/>Maximum targeted TCP checks: {plan?.maximumTcpChecks || 0}</p>}{plan?.warnings.map(warning => <p key={warning} className="mt-1 text-amber-700">{warning}</p>)}</div>
    </section></div>
    {error && <p className="px-4 pb-2 text-xs text-rose-600">{error}</p>}<footer className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-700"><button onClick={onClose} className="rounded border px-4 py-2 text-xs">Cancel</button><button disabled={busy || incompleteTarget || plan?.valid === false} onClick={start} className="rounded bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-400">{plan?.mode === 'QUICK_FALLBACK' ? 'Start Quick Scan' : 'Start Advanced Scan'}</button></footer>
  </div></div>;
};
