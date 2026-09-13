import { ForegroundSnapshot, isForegroundSnapshot } from '../../shared/discovery_session.ts';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { requestJson } from '../bounded_request.ts';
import { useModalFocus } from '../use_modal_focus.ts';
import { Plus, Search, Trash2, X } from 'lucide-react';
import { AdvancedScanMethod, AdvancedScanPlan, AdvancedScanRequest, emptyAdvancedScanRequest } from '../../shared/advanced_scan.ts';
import { assessAdvancedDraft, isAdapterCollection, isAdvancedPlan, isRecord } from '../../shared/advanced_scan_contract.ts';
import { loadAdvancedAdapters, validateAdvancedRequest } from '../advanced_scan_client.ts';
import { WindowsAdapterSnapshot } from '../../types/index.ts';
import { canonicalIPv4, IPv4Input, splitIPv4 } from './IPv4Input.tsx';

interface Props { open: boolean; onClose: () => void; onStarted: (quickFallback: boolean, foreground: ForegroundSnapshot) => void }
interface TargetRow { type: 'CIDR' | 'RANGE'; first: string; second: string; prefix: string; prefixSource: 'BLANK' | 'SUGGESTED' | 'EDITED' }

const methodLabels: Record<AdvancedScanMethod, string> = { ONVIF: 'ONVIF / WS-Discovery', NEIGHBOR: 'Windows Neighbor / ARP evidence', PING: 'ICMP / Ping', TCP: 'TCP Port Check' };
const completeIp = (value: string) => canonicalIPv4(splitIPv4(value));
const toggle = <T,>(items: T[], item: T) => items.includes(item) ? items.filter(value => value !== item) : [...items, item];
export const selectedAdapterPrefix = (adapters: WindowsAdapterSnapshot[], indexes: number[]): string => {
  if (!isAdapterCollection(adapters) || indexes.length !== 1) return '';
  const adapter = adapters.find(value => value.interfaceIndex === indexes[0] && value.eligible);
  if (!adapter) return '';
  const prefixes = [...new Set(adapter.ipv4Addresses.map(value => value.prefixLength).filter(value => value >= 16 && value <= 32))];
  return prefixes.length === 1 ? String(prefixes[0]) : '';
};
export const hasAdvancedScanIntent = (request: AdvancedScanRequest, targetCount: number, customPorts: string): boolean => Boolean(
  targetCount || request.adapterIndexes.length || request.methods.length || request.portPresets.length || customPorts.trim()
  || request.filters.macPrefix || request.filters.manufacturer || request.filters.onlyLikelyCameras || !request.filters.includeUnknownDevices
  || request.performance !== 'NORMAL',
);

export const AdvancedScanModal: React.FC<Props> = ({ open, onClose, onStarted }) => {
  const [adapters, setAdapters] = useState<WindowsAdapterSnapshot[]>([]);
  const [request, setRequest] = useState<AdvancedScanRequest>(emptyAdvancedScanRequest());
  const [ranges, setRanges] = useState<TargetRow[]>([]);
  const [customPorts, setCustomPorts] = useState('');
  const [validation, setValidation] = useState<{ key: string; state: 'IDLE' | 'VALIDATING' | 'VALID' | 'INVALID' | 'FAILED'; plan: AdvancedScanPlan | null; message: string }>({ key: '', state: 'IDLE', plan: null, message: '' });
  const [adapterState, setAdapterState] = useState<'LOADING'|'READY'|'FAILED'>('LOADING');
  const [reload, setReload] = useState(0);
  const [retryValidation, setRetryValidation] = useState(0);
  const [busy, setBusy] = useState(false);
  const startPending = useRef(false);
  const startController = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  useModalFocus(open, busy, dialogRef, onClose);
  useEffect(() => () => { startController.current?.abort(); }, []);
  const [error, setError] = useState('');
  useEffect(() => { if (error || validation.message || busy) feedbackRef.current?.scrollIntoView({ block: 'nearest' }); }, [error, validation.message, busy]);
  const suggestedPrefix = selectedAdapterPrefix(adapters, request.adapterIndexes);
  const advancedIntent = hasAdvancedScanIntent(request, ranges.length, customPorts);

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

  const draft = assessAdvancedDraft(payload, ranges, customPorts, adapters, advancedIntent);
  const validationKey = JSON.stringify({ payload, ranges, customPorts, reload, retryValidation });
  const plan = validation.key === validationKey ? validation.plan : null;
  const canStart = open && adapterState === 'READY' && draft.state === 'READY' && validation.state === 'VALID' && plan?.valid === true;
  useEffect(() => {
    if (!open) { setAdapterState('LOADING'); setValidation({ key: '', state: 'IDLE', plan: null, message: '' }); startController.current?.abort(); startController.current = null; startPending.current = false; setBusy(false); return; }
    const controller = new AbortController(); let active = true;
    setAdapterState('LOADING'); setValidation({ key: '', state: 'IDLE', plan: null, message: '' });
    loadAdvancedAdapters(fetch, controller.signal).then(result => {
      if (!active) return;
      if (result.ok) setAdapters(result.adapters); setAdapterState(result.ok ? 'READY' : 'FAILED'); setError(result.message);
    });
    return () => { active = false; controller.abort(); };
  }, [open, reload]);
  useEffect(() => {
    if (adapterState !== 'READY') return;
    setRanges(current => current.map(row => {
      if (row.type !== 'CIDR' || row.prefixSource === 'EDITED') return row;
      if (suggestedPrefix) return { ...row, prefix: suggestedPrefix, prefixSource: 'SUGGESTED' };
      return row.prefixSource === 'SUGGESTED' ? { ...row, prefix: '', prefixSource: 'BLANK' } : row;
    }));
  }, [suggestedPrefix, adapterState]);
  useEffect(() => {
    setValidation({ key: '', state: 'IDLE', plan: null, message: '' });
    if (!open || adapterState !== 'READY' || draft.state !== 'READY') return;
    const controller = new AbortController(); let active = true;
    setValidation({ key: validationKey, state: 'VALIDATING', plan: null, message: '' });
    const timer = setTimeout(async () => {
      const result = await validateAdvancedRequest(payload, fetch, controller.signal);
      if (active) setValidation({ key: validationKey, state: result.plan?.valid ? 'VALID' : result.plan ? 'INVALID' : 'FAILED', plan: result.plan, message: result.message });
    }, 300);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [open, adapterState, draft.state, validationKey]);
  if (!open) return null;

  const updateRow = (index: number, patch: Partial<TargetRow>) => setRanges(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const start = async () => {
    if (!canStart || busy || startPending.current) return;
    startPending.current = true;
    setBusy(true); setError('');
    const controller = new AbortController(); startController.current = controller;
    try {
      const { response, body: data } = await requestJson('http://localhost:3001/api/discovery/advanced/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal }, fetch, 30000);
      if (controller.signal.aborted) return;
      if (!response.ok || !isRecord(data) || !isAdvancedPlan(data.plan) || !data.plan.valid || !isForegroundSnapshot(data.foreground)) throw Error('Advanced Scan could not start. Retry validation or inspect Diagnostics/Support.');
      onStarted(data.plan.mode === 'QUICK_FALLBACK', data.foreground); onClose();
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof DOMException && reason.name === 'TimeoutError'
        ? 'Preparation timed out. The scan may still start on the backend. Close this dialog and check scan status before retrying.'
        : 'Advanced Scan could not be confirmed. Check scan status before retrying, or inspect Diagnostics/Support.');
    } finally { if (startController.current === controller) { startPending.current = false; if (!controller.signal.aborted) setBusy(false); startController.current = null; } }

  };

  const content = <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3"><div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Advanced Scan" className="flex max-h-[calc(100dvh-1.5rem)] min-h-0 w-full min-w-0 max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
    <header className="flex shrink-0 items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700"><div><h2 className="flex items-center gap-2 font-bold"><Search className="h-4 w-4 text-blue-600"/>Advanced Scan</h2><p className="text-xs text-slate-500">Choose where and how you want to search.</p></div><button aria-label="Close Advanced Scan" disabled={busy} onClick={onClose}><X className="h-5 w-5"/></button></header>
    <div data-testid="advanced-scan-body" className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4"><fieldset disabled={busy} className="min-w-0"><div className="grid min-w-0 gap-4 md:grid-cols-2"><section className="min-w-0">
      <h3 className="text-xs font-bold uppercase text-slate-500">Network Adapters</h3><div className="mt-2 space-y-2">{adapterState === 'LOADING' && <p role="status">Loading network adapters...</p>}{adapterState !== 'LOADING' && !adapters.some(adapter => adapter.eligible) && <p role="status">Unable to load eligible network adapters. Retry or check Diagnostics/Support.</p>}<button onClick={() => setReload(value => value + 1)} disabled={adapterState === 'LOADING'} className="rounded border px-2 py-1 text-xs">Reload Adapters</button>{adapters.map(adapter => <label key={adapter.interfaceIndex} className={`flex gap-2 rounded border p-2 text-xs ${adapter.eligible ? 'border-slate-200 dark:border-slate-700' : 'opacity-55'}`}><input type="checkbox" disabled={!adapter.eligible} checked={request.adapterIndexes.includes(adapter.interfaceIndex)} onChange={() => setRequest(value => ({ ...value, adapterIndexes: toggle(value.adapterIndexes, adapter.interfaceIndex) }))}/><span><strong>{adapter.interfaceAlias}</strong><span className="block text-slate-500">{adapter.ipv4Addresses.map(ip => `${ip.address} /${ip.prefixLength}`).join(', ') || 'No usable IPv4 address'} · {adapter.eligible ? 'Active' : adapter.eligibilityReason}</span></span></label>)}</div>
      <h3 className="mt-4 text-xs font-bold uppercase text-slate-500">IP Targets</h3><div className="mt-2 space-y-3">{ranges.map((row, index) => <div key={index} className="rounded border border-slate-200 p-2 dark:border-slate-700"><div className="mb-2 flex items-center justify-between"><select aria-label={`Target ${index + 1} type`} value={row.type} onChange={event => updateRow(index, { type: event.target.value as TargetRow['type'], prefix: event.target.value === 'CIDR' ? suggestedPrefix : row.prefix, prefixSource: event.target.value === 'CIDR' && suggestedPrefix ? 'SUGGESTED' : row.prefixSource })} className="rounded border bg-transparent p-1 text-xs"><option value="CIDR">CIDR</option><option value="RANGE">Range</option></select><button aria-label={`Remove target ${index + 1}`} onClick={() => setRanges(value => value.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="h-4 w-4"/></button></div><div className="flex flex-wrap gap-2">{row.type === 'CIDR'
        ? <IPv4Input label="CIDR address" value={row.first} prefix={row.prefix} prefixMin={16} prefixMax={32} onChange={first => updateRow(index, { first })} onPrefixChange={prefix => updateRow(index, { prefix, prefixSource: 'EDITED' })}/>
        : <><IPv4Input label="Start IP" value={row.first} onChange={first => updateRow(index, { first })}/><IPv4Input label="End IP" value={row.second} assistFrom={row.first} onChange={second => updateRow(index, { second })}/></>
      }</div></div>)}<button onClick={() => setRanges(value => [...value, { type: 'CIDR', first: '', second: '', prefix: suggestedPrefix, prefixSource: suggestedPrefix ? 'SUGGESTED' : 'BLANK' }])} className="!flex items-center gap-1 rounded border px-2 py-1.5 text-xs"><Plus className="h-3.5 w-3.5"/>Add Range</button></div>
    </section><section className="min-w-0">
      <h3 className="text-xs font-bold uppercase text-slate-500">Discovery Methods</h3><div className="mt-2 grid grid-cols-2 gap-2">{(Object.keys(methodLabels) as AdvancedScanMethod[]).map(method => <label key={method} className="flex gap-2 text-xs"><input type="checkbox" checked={request.methods.includes(method)} onChange={() => setRequest(value => ({ ...value, methods: toggle(value.methods, method) }))}/>{methodLabels[method]}</label>)}</div><p className="mt-2 text-[10px] text-slate-500">Adapter selection scopes ONVIF/neighbor discovery; Ping and TCP use Windows routing. ONVIF multicast and MAC evidence are local-segment only. Ping failure does not exclude a device. TCP success proves only that a port accepted a connection.</p>
      <h3 className="mt-4 text-xs font-bold uppercase text-slate-500">Ports</h3><div className="mt-2 flex flex-wrap gap-3">{([['CAMERA_COMMON', 'Camera Common'], ['WEB', 'Web'], ['RTSP', 'RTSP']] as const).map(([key, label]) => <label key={key} className="text-xs"><input type="checkbox" checked={request.portPresets.includes(key)} onChange={() => setRequest(value => ({ ...value, portPresets: toggle(value.portPresets, key) }))}/> {label}</label>)}</div><input aria-label="Custom ports" value={customPorts} onChange={event => setCustomPorts(event.target.value)} placeholder="Custom ports: 80, 443, 554" className="mt-2 w-full rounded border bg-transparent p-2 text-xs"/>
      <h3 className="mt-4 text-xs font-bold uppercase text-slate-500">Optional Filters</h3><div className="mt-2 grid gap-2"><input aria-label="MAC starts with" value={request.filters.macPrefix || ''} onChange={event => setRequest(value => ({ ...value, filters: { ...value.filters, macPrefix: event.target.value } }))} placeholder="MAC starts with: AA:BB:CC" className="rounded border bg-transparent p-2 text-xs"/><select aria-label="Manufacturer filter" value={request.filters.manufacturer || ''} onChange={event => setRequest(value => ({ ...value, filters: { ...value.filters, manufacturer: event.target.value } }))} className="rounded border bg-transparent p-2 text-xs"><option value="">Any manufacturer</option>{['Hikvision', 'Dahua', 'Hanwha', 'Axis', 'Bosch', 'Pelco', 'Illustra'].map(value => <option key={value}>{value}</option>)}</select><label className="text-xs"><input type="checkbox" checked={request.filters.onlyLikelyCameras} onChange={event => setRequest(value => ({ ...value, filters: { ...value.filters, onlyLikelyCameras: event.target.checked } }))}/> Only show likely cameras</label><label className="text-xs"><input type="checkbox" checked={request.filters.includeUnknownDevices} onChange={event => setRequest(value => ({ ...value, filters: { ...value.filters, includeUnknownDevices: event.target.checked } }))}/> Include unknown network devices</label></div>
      <h3 className="mt-4 text-xs font-bold uppercase text-slate-500">Performance</h3><select aria-label="Performance" value={request.performance} onChange={event => setRequest(value => ({ ...value, performance: event.target.value as AdvancedScanRequest['performance'] }))} className="mt-2 rounded border bg-transparent p-2 text-xs"><option value="CONSERVATIVE">Conservative</option><option value="NORMAL">Normal</option><option value="FAST">Fast</option></select>
      <div className="mt-4 rounded border border-blue-200 bg-blue-50 p-3 text-xs dark:border-blue-900 dark:bg-blue-950/30"><strong>Workload Summary</strong>{draft.state !== 'READY' ? <p className="mt-1 text-amber-700">{draft.message}</p> : plan?.mode === 'QUICK_FALLBACK' ? <p className="mt-1">No advanced options selected. Standard Quick Scan will be used.</p> : <p className="mt-1">{plan?.adapterIndexes.length || 0} adapters · {payload.targets.length} ranges · {plan?.estimatedTargetCount || 0} unique addresses · {plan?.ports.length || 0} TCP ports<br/>Maximum targeted TCP checks: {plan?.maximumTcpChecks || 0}</p>}{plan?.warnings.map(warning => <p key={warning} className="mt-1 text-amber-700">{warning}</p>)}</div>
    </section></div></fieldset>
    <div ref={feedbackRef} className="mt-3">{busy && <p role="status" aria-live="polite" className="px-4 pb-2 text-xs text-blue-600">Preparing scan... Background discovery yields while this scan runs and resumes afterward. Checking adapters and scan preflight.</p>}
    {validation.key === validationKey && validation.message && <p role="status" className="px-4 text-xs text-amber-700">{validation.message}<button className="ml-2 underline" disabled={busy} onClick={() => setRetryValidation(value => value + 1)}>Retry Validation</button></p>}{validation.key === validationKey && validation.state === 'VALIDATING' && <p role="status" className="px-4 text-xs">Validating configuration...</p>}{error && <p className="px-4 pb-2 text-xs text-rose-600">{error}</p>}</div></div><footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-700"><button disabled={busy} onClick={onClose} className="rounded border px-4 py-2 text-xs">Cancel</button><button disabled={busy || !canStart} onClick={start} className="rounded bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-400">{busy ? 'Preparing scan...' : <>{advancedIntent ? 'Start Advanced Scan' : 'Start Quick Scan'}</>}</button></footer>
  </div></div>;
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
};
