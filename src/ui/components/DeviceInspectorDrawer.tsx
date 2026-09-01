import React, { useState } from 'react';
import { Device, DiagnosticCheckEvidence } from '../../types/index.ts';
import { X, Video, Server, Activity, Fingerprint, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';

interface DeviceInspectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  device: Device | null;
  onOpenConfigureModal: (dev: Device) => void;
  onOpenBrowserModal: (dev: Device) => void;
  onDiagnose: (dev: Device) => void;
}

const checkLabel = (check: DiagnosticCheckEvidence) => check.type === 'TCP' ? `TCP ${check.port}` : check.type.replaceAll('_', ' ');

export const DeviceInspectorDrawer: React.FC<DeviceInspectorDrawerProps> = ({ isOpen, onClose, device, onOpenConfigureModal, onOpenBrowserModal, onDiagnose }) => {
  const [activeTab, setActiveTab] = useState<'DIAGNOSTICS' | 'IDENTITY'>('DIAGNOSTICS');
  if (!isOpen || !device) return null;
  const checks = [...(device.diagnostics?.checks || [])].reverse();
  const adapter = device.reachability?.discoveryInterface;
  const isCamera = device.anchor.hardwareClass === 'IP_CAMERA' || !device.anchor.vendor.toLowerCase().includes('lenel');

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col">
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">{isCamera ? <Video className="w-5 h-5" /> : <Server className="w-5 h-5" />}</div>
          <div>
            <h3 className="font-bold text-white text-xs">Device Inspector</h3>
            <p className="text-[11px] text-slate-400">{device.technician?.name || `${device.anchor.vendor} ${device.anchor.model || ''}`}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex border-b border-slate-800 bg-slate-950/60 px-3 text-xs gap-2">
        <button onClick={() => setActiveTab('DIAGNOSTICS')} className={`py-2.5 px-3 font-semibold border-b-2 flex items-center gap-1.5 ${activeTab === 'DIAGNOSTICS' ? 'border-sky-400 text-sky-400' : 'border-transparent text-slate-400'}`}><Activity className="w-3.5 h-3.5" />Diagnostics</button>
        <button onClick={() => setActiveTab('IDENTITY')} className={`py-2.5 px-3 font-semibold border-b-2 flex items-center gap-1.5 ${activeTab === 'IDENTITY' ? 'border-sky-400 text-sky-400' : 'border-transparent text-slate-400'}`}><Fingerprint className="w-3.5 h-3.5" />Identity & Network</button>
      </div>

      <div className="p-4 overflow-y-auto flex-1 space-y-3 text-xs">
        {activeTab === 'DIAGNOSTICS' && <>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800"><span className="text-slate-500">Current status</span><p className="font-bold text-sky-300 mt-1">{device.status.replaceAll('_', ' ')}</p></div>
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800"><span className="text-slate-500">Last successful contact</span><p className="font-mono text-slate-300 mt-1 text-[10px]">{device.diagnostics?.lastSuccessfulContactAt || device.reachability?.lastSuccessfulResponseAt || 'Unknown'}</p></div>
          </div>
          {device.status === 'COLLISION' && <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/30 text-amber-300 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />Network responses on this shared IP may be identity-ambiguous.</div>}
          <button onClick={() => onDiagnose(device)} className="w-full py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-white font-bold flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" />Diagnose Now</button>
          <div className="space-y-2">
            {checks.length === 0 && <div className="p-4 text-center text-slate-500 border border-dashed border-slate-700 rounded-lg">No diagnostic checks have run in this session.</div>}
            {checks.map((check, index) => <div key={`${check.timestamp}-${index}`} className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <div className="flex justify-between"><span className="font-semibold text-slate-200">{checkLabel(check)}</span><span className={check.success ? 'text-emerald-400' : 'text-slate-500'}>{check.success ? 'Responded' : check.errorCategory || 'No response'}</span></div>
              <div className="mt-1 text-[10px] text-slate-500 font-mono flex flex-wrap gap-x-3">
                {check.httpStatus !== undefined && <span>HTTP {check.httpStatus}</span>}
                {check.responseTimeMs !== undefined && <span>{check.responseTimeMs} ms</span>}
                {check.certificateTrusted === false && <span className="text-amber-400">TLS: {check.certificateWarning || 'Untrusted certificate'}</span>}
                {check.ambiguousIdentity && <span className="text-amber-400">Identity ambiguous</span>}
                <span>{check.timestamp}</span>
              </div>
            </div>)}
          </div>
        </>}

        {activeTab === 'IDENTITY' && <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 font-mono">
          <div><span className="text-slate-500">Device IP</span><p className="text-sky-300">{device.network.ipAddress}:{device.network.port}</p></div>
          <div><span className="text-slate-500">MAC</span><p className="text-slate-200">{device.anchor.macAddress || 'Unknown'}</p></div>
          <div><span className="text-slate-500">ONVIF UUID</span><p className="text-slate-200 break-all">{device.anchor.onvifEndpointUuid || 'Unknown'}</p></div>
          <div><span className="text-slate-500">Serial</span><p className="text-slate-200">{device.anchor.serialNumber || 'Unknown'}</p></div>
          <div><span className="text-slate-500">Manufacturer / model</span><p className="text-slate-200">{device.anchor.vendor}{device.anchor.model ? ` — ${device.anchor.model}` : ''}</p></div>
          <div><span className="text-slate-500">Firmware</span><p className="text-slate-200">{device.anchor.firmwareVersion || 'Unknown'}</p></div>
          <div><span className="text-slate-500">Active driver</span><p className="text-slate-200">{String(device.manufacturerParams?.activeDriver || 'ONVIF / not yet verified')}</p></div>
          <div><span className="text-slate-500">Subnet relationship</span><p className="text-slate-200">{device.reachability?.subnetClassification || 'UNKNOWN'}</p></div>
          <div><span className="text-slate-500">Originating adapter</span><p className="text-slate-200">{adapter ? `${adapter.name} — ${adapter.ipAddress} / ${adapter.netmask}` : 'Unknown'}</p></div>
          <div><span className="text-slate-500">ONVIF discovery response</span><p className="text-slate-200">{device.reachability?.wsDiscoveryRespondedAt || 'Not observed'}</p></div>
        </div>}
      </div>

      <div className="p-3 bg-slate-950 border-t border-slate-800 flex gap-2">
        <button onClick={() => onOpenBrowserModal(device)} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center gap-1.5"><ExternalLink className="w-3.5 h-3.5 text-sky-400" />Open Camera</button>
        <button onClick={() => onOpenConfigureModal(device)} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg">Device Configuration</button>
        <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg">Close</button>
      </div>
    </div>
  );
};
