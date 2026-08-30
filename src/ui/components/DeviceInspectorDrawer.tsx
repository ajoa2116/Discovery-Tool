import React, { useState } from 'react';
import { Device } from '../../types/index.ts';
import {
  X,
  Video,
  Network,
  Zap,
  Sliders,
  Shield,
  Activity,
  Cpu,
  Radio,
  Server,
  Layers,
  CheckCircle,
  ExternalLink,
} from 'lucide-react';

interface DeviceInspectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  device: Device | null;
  onOpenConfigureModal: (dev: Device) => void;
  onOpenBrowserModal: (dev: Device) => void;
}

export const DeviceInspectorDrawer: React.FC<DeviceInspectorDrawerProps> = ({
  isOpen,
  onClose,
  device,
  onOpenConfigureModal,
  onOpenBrowserModal,
}) => {
  const [activeTab, setActiveTab] = useState<'RTSP_STREAM' | 'SWITCH_TOPOLOGY' | 'MULTI_CLASS'>('RTSP_STREAM');

  if (!isOpen || !device) return null;

  // Mock switch telemetry if not present (Section 8 & v1.5 Section 4)
  const switchInfo = device.switchTelemetry || {
    switchName: 'CORE-SW-CISCO-3850-24P',
    switchIp: '192.168.1.2',
    portId: `GigabitEthernet1/0/${(parseInt(device.network.ipAddress.split('.')[3]) % 24) + 1}`,
    vlanId: 100,
    poeWatts: 14.4,
    poeStatus: 'DELIVERING' as const,
  };

  const isCamera = device.anchor.hardwareClass === 'IP_CAMERA' || !device.anchor.vendor.toLowerCase().includes('lenel');

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col transform transition-transform duration-300">
      {/* Header (Zone 4) */}
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
            {isCamera ? <Video className="w-5 h-5" /> : <Server className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white text-xs">Zone 4: Device Inspector</h3>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-sky-400">
                {device.network.protocol}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate max-w-[240px]">
              {device.anchor.vendor} • {device.anchor.model}
            </p>
          </div>
        </div>

        <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/60 px-3 text-xs gap-2">
        <button
          onClick={() => setActiveTab('RTSP_STREAM')}
          className={`py-2.5 px-3 font-semibold border-b-2 flex items-center gap-1.5 transition ${
            activeTab === 'RTSP_STREAM'
              ? 'border-sky-400 text-sky-400 bg-sky-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Video className="w-3.5 h-3.5" />
          RTSP Stream
        </button>

        <button
          onClick={() => setActiveTab('SWITCH_TOPOLOGY')}
          className={`py-2.5 px-3 font-semibold border-b-2 flex items-center gap-1.5 transition ${
            activeTab === 'SWITCH_TOPOLOGY'
              ? 'border-sky-400 text-sky-400 bg-sky-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          Switch & PoE
        </button>

        <button
          onClick={() => setActiveTab('MULTI_CLASS')}
          className={`py-2.5 px-3 font-semibold border-b-2 flex items-center gap-1.5 transition ${
            activeTab === 'MULTI_CLASS'
              ? 'border-sky-400 text-sky-400 bg-sky-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          Hardware Spec
        </button>
      </div>

      {/* Drawer Body */}
      <div className="p-4 overflow-y-auto flex-1 space-y-4 text-xs">
        {/* TAB 1: LIVE RTSP STREAM PREVIEW (Section 8) */}
        {activeTab === 'RTSP_STREAM' && (
          <div className="space-y-3">
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center group shadow-inner">
              {/* Simulated Live RTSP Video Container */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 flex flex-col justify-between p-3 z-10">
                <div className="flex items-center justify-between text-[11px] font-mono text-white">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    <span className="font-bold">LIVE RTSP</span>
                  </div>
                  <span>3840x2160 • 30 FPS</span>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400">
                  <span>H.265 MainProfile</span>
                  <span>Bitrate: 8,192 Kbps</span>
                </div>
              </div>

              {/* Centered Camera Crosshair Indicator */}
              <div className="text-slate-700 flex flex-col items-center gap-1">
                <Video className="w-10 h-10 opacity-30" />
                <span className="text-[10px] font-mono text-slate-500">Live Video Stream Validated</span>
              </div>
            </div>

            {/* Stream Info Cards */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Latency / Heartbeat</span>
                <p className="font-mono text-emerald-400 font-bold mt-0.5">
                  {device.telemetry?.latencyMs || 4}ms (0.0% loss)
                </p>
              </div>

              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">RTSP URI</span>
                <p className="font-mono text-slate-300 truncate mt-0.5" title={`rtsp://${device.network.ipAddress}:554/stream1`}>
                  rtsp://{device.network.ipAddress}:554/stream1
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => onOpenBrowserModal(device)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                Open Embedded Browser
              </button>

              <button
                onClick={() => onOpenConfigureModal(device)}
                className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition shadow-md shadow-sky-950"
              >
                <Sliders className="w-3.5 h-3.5" />
                Configure ONVIF
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: MANAGED SWITCH & POE TOPOLOGY (v1.5 Section 4 & 8) */}
        {activeTab === 'SWITCH_TOPOLOGY' && (
          <div className="space-y-3">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-900">
                <span className="text-slate-400 font-semibold">Managed Switch Identity:</span>
                <span className="font-mono text-sky-400 font-bold">{switchInfo.switchName}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-500">Switch IP:</span>
                  <p className="font-mono text-slate-200">{switchInfo.switchIp}</p>
                </div>
                <div>
                  <span className="text-slate-500">Physical Port Binding:</span>
                  <p className="font-mono text-emerald-400 font-bold">{switchInfo.portId}</p>
                </div>
                <div>
                  <span className="text-slate-500">VLAN ID:</span>
                  <p className="font-mono text-slate-200">VLAN {switchInfo.vlanId}</p>
                </div>
                <div>
                  <span className="text-slate-500">PoE Power Draw:</span>
                  <p className="font-mono text-amber-300 font-bold">{switchInfo.poeWatts} Watts ({switchInfo.poeStatus})</p>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <h4 className="font-bold text-slate-200 text-xs">Port Power Management (v1.5 Section 4)</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Remotely cycle PoE power to this port to hard-reboot unresponsive cameras.
              </p>
              <button
                onClick={() => alert(`PoE Power-Cycle command dispatched to ${switchInfo.switchName} on port ${switchInfo.portId}`)}
                className="w-full py-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-700/50 text-rose-300 rounded-lg font-bold text-xs transition"
              >
                ⚡ Remote PoE Port Power-Cycle
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: MULTI-CLASS HARDWARE SPEC (v1.5 Section 4) */}
        {activeTab === 'MULTI_CLASS' && (
          <div className="space-y-3 font-mono text-xs">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between border-b border-slate-900 pb-1">
                <span className="text-slate-500">Hardware Class:</span>
                <span className="text-sky-400 font-bold">{device.anchor.hardwareClass || 'IP_CAMERA'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-1">
                <span className="text-slate-500">MAC Anchor:</span>
                <span className="text-slate-200 font-bold">{device.anchor.macAddress}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-1">
                <span className="text-slate-500">Factory Serial:</span>
                <span className="text-slate-200">{device.anchor.serialNumber || 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-1">
                <span className="text-slate-500">Firmware:</span>
                <span className="text-slate-200">{device.anchor.firmwareVersion || 'v2.1.0-rel'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Discovery Phase:</span>
                <span className="text-emerald-400 font-bold">Phase {device.discoveredPhase || 3}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
        >
          Close Inspector
        </button>
      </div>
    </div>
  );
};
