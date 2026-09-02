import React, { useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Download, Info, Palette, Settings2, Stethoscope } from 'lucide-react';
import { ThemePreference } from '../theme.ts';

export interface UiPreflight {
  overall: 'READY' | 'WARNING' | 'UNAVAILABLE';
  version: string;
  runtime: string;
  platform?: string;
  checks?: Array<{ id: string; label: string; state: 'READY' | 'WARNING' | 'UNAVAILABLE'; detail: string; critical: boolean }>;
}

interface Props { theme: ThemePreference; onTheme: (theme: ThemePreference) => void; preflight: UiPreflight | null; onClose: () => void }
type View = 'ROOT' | 'GENERAL' | 'APPEARANCE' | 'DIAGNOSTICS' | 'ABOUT';
const title = (state: string) => state[0] + state.slice(1).toLowerCase();

export const SettingsMenu: React.FC<Props> = ({ theme, onTheme, preflight, onClose }) => {
  const [view, setView] = useState<View>('ROOT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const support = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('http://localhost:3001/api/system/support-bundle');
      if (!response.ok) throw Error('Support bundle is unavailable.');
      const url = URL.createObjectURL(await response.blob()), anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'CCTV_Safe_Support_Bundle.json'; anchor.click(); URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Support bundle is unavailable.'); }
    finally { setBusy(false); }
  };

  const nav = (next: View, label: string, Icon: React.ComponentType<{ className?: string }>) => <button onClick={() => setView(next)} className="!flex h-11 w-full items-center gap-2.5 px-3 py-0"><Icon className="h-4 w-4 shrink-0 text-slate-500"/><span className="flex-1 truncate text-left">{label}</span><ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400"/></button>;
  const panelHeader = (label: string) => <div className="flex h-10 items-center border-b border-slate-200 px-1 dark:border-slate-700"><button aria-label="Back to Settings" onClick={() => setView('ROOT')} className="!flex !w-auto items-center gap-1 !px-2 !py-1.5"><ArrowLeft className="h-3.5 w-3.5"/>Settings</button><span className="ml-auto pr-2 text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</span></div>;

  return <div role="menu" aria-label="Settings" className="ui-menu w-72 overflow-hidden p-0 sm:w-80">
    {view === 'ROOT' && <div className="p-1">{nav('GENERAL', 'General', Settings2)}{nav('APPEARANCE', 'Appearance', Palette)}{nav('DIAGNOSTICS', 'Diagnostics & Support', Stethoscope)}{nav('ABOUT', 'About', Info)}</div>}
    {view === 'GENERAL' && <>{panelHeader('General')}<div className="p-3 text-xs"><p className="text-slate-500">No additional general preferences are currently available.</p></div></>}
    {view === 'APPEARANCE' && <>{panelHeader('Appearance')}<div className="p-1">{(['LIGHT','DARK','SYSTEM'] as ThemePreference[]).map(option => <button key={option} role="menuitemradio" aria-checked={theme === option} onClick={() => { onTheme(option); onClose(); }} className="!flex h-10 items-center gap-2 px-3 py-0"><span className="w-4">{theme === option && <Check className="h-4 w-4 text-blue-600"/>}</span><span>{title(option)}</span></button>)}</div></>}
    {view === 'DIAGNOSTICS' && <>{panelHeader('Diagnostics & Support')}<div className="max-h-80 overflow-y-auto p-3 text-xs"><div className="flex items-center justify-between"><strong>Environment status</strong><span className={`rounded px-2 py-0.5 text-[10px] font-bold ${preflight?.overall === 'READY' ? 'bg-emerald-100 text-emerald-700' : preflight?.overall === 'WARNING' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{preflight ? title(preflight.overall) : 'Checking'}</span></div><p className="mt-1 text-slate-500">Readiness checks explain unavailable Windows capabilities without changing the system.</p><div className="mt-2 space-y-2">{preflight?.checks?.map(check => <div key={check.id} className="rounded border border-slate-200 p-2 dark:border-slate-700"><div className="flex justify-between gap-2 font-semibold"><span>{check.label}</span><span>{title(check.state)}</span></div><p className="mt-0.5 text-[10px] text-slate-500">{check.detail}</p></div>)}</div><button disabled={busy} onClick={support} className="mt-3 !flex w-full items-center justify-center gap-2 rounded bg-blue-600 px-3 py-2 font-bold text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500"><Download className="h-3.5 w-3.5"/>{busy ? 'Preparing…' : 'Download Safe Support Bundle'}</button><p className="mt-2 text-[10px] text-slate-500">Excludes credentials, authorization material, project notes, cookies, and security audit entries.</p>{error && <p className="mt-2 text-rose-600">{error}</p>}</div></>}
    {view === 'ABOUT' && <>{panelHeader('About')}<div className="space-y-2 p-3 text-xs"><div><strong>CCTV Network Assistant</strong><div className="text-slate-500">Version: {preflight?.version || '1.6.0'}</div></div><div><strong>Environment status: {preflight ? title(preflight.overall) : 'Checking'}</strong><div className="text-slate-500">Runtime: {preflight?.runtime || 'Pending'}{preflight?.platform ? ` on ${preflight.platform}` : ''}</div></div>{preflight?.checks?.filter(check => check.state !== 'READY').map(check => <p key={check.id} className="rounded bg-amber-50 p-2 text-[10px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{check.label}: {check.detail}</p>)}</div></>}
  </div>;
};
