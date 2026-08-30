import React from 'react';
import { Device } from '../../types/index.ts';
import { Camera, Server, KeyRound, AlertTriangle, CheckCircle, Activity, ExternalLink, Shield } from 'lucide-react';

interface DeviceGridProps {
  devices: Device[];
  onOpenDuplicateDrawer: () => void;
}

export const DeviceGrid: React.FC<DeviceGridProps> = ({ devices, onOpenDuplicateDrawer }) => {
  const getVendorIcon = (vendor: string) => {
    if (vendor.toLowerCase().includes('lenel')) return <Server className="w-4 h-4 text-purple-400" />;
    if (vendor.toLowerCase().includes('axis')) return <Camera className="w-4 h-4 text-amber-400" />;
    if (vendor.toLowerCase().includes('illustra')) return <Camera className="w-4 h-4 text-sky-400" />;
    return <Camera className="w-4 h-4 text-emerald-400" />;
  };

  const getStatusBadge = (dev: Device) => {
    switch (dev.status) {
      case 'COLLISION':
        return (
          <button
            onClick={onOpenDuplicateDrawer}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/50 hover:bg-rose-500/30 transition animate-pulse"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            IP Collision (Resolve)
          </button>
        );
      case 'CONFIGURED':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <CheckCircle className="w-3.5 h-3.5" />
            Provisioned & Verified
          </span>
        );
      case 'AUTHENTICATED':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/40">
            <Shield className="w-3.5 h-3.5" />
            Authenticated
          </span>
        );
      case 'PROVISIONING':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/40">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping" />
            Provisioning...
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300">
            {dev.status}
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            Discovered Hardware Inventory
            <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
              {devices.length} Anchors Bound
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Physical MAC address and hardware serial anchors prevent state corruption during lease changes.</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold">
            <tr>
              <th className="py-3 px-4">Physical Anchor (MAC & Serial)</th>
              <th className="py-3 px-4">Manufacturer & Model</th>
              <th className="py-3 px-4">Network Endpoint</th>
              <th className="py-3 px-4">Protocol</th>
              <th className="py-3 px-4">Telemetry / Heartbeat</th>
              <th className="py-3 px-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {devices.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  No devices discovered yet. Click "Run Full 6-Phase Pipeline" above to scan the network.
                </td>
              </tr>
            ) : (
              devices.map((dev) => (
                <tr
                  key={dev.anchor.macAddress}
                  className={`hover:bg-slate-850/60 transition ${
                    dev.status === 'COLLISION' ? 'bg-rose-950/20' : ''
                  }`}
                >
                  {/* Physical Anchor */}
                  <td className="py-3 px-4">
                    <div className="font-mono font-bold text-white tracking-wide">
                      {dev.anchor.macAddress}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                      SN: {dev.anchor.serialNumber || 'N/A'}
                    </div>
                  </td>

                  {/* Vendor & Model */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2 font-medium text-slate-200">
                      {getVendorIcon(dev.anchor.vendor)}
                      <span>{dev.anchor.vendor}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{dev.anchor.model}</div>
                  </td>

                  {/* Network */}
                  <td className="py-3 px-4">
                    <div className="font-mono text-sky-400 font-semibold">{dev.network.ipAddress}</div>
                    <div className="text-[11px] font-mono text-slate-500">Mask: {dev.network.subnetMask}</div>
                  </td>

                  {/* Protocol */}
                  <td className="py-3 px-4">
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {dev.network.protocol}
                    </span>
                  </td>

                  {/* Telemetry */}
                  <td className="py-3 px-4">
                    {dev.telemetry ? (
                      <div className="flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300 font-mono text-[11px]">
                          {dev.telemetry.latencyMs}ms | Loss: {dev.telemetry.packetLossPct}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-500 italic">Pending Phase 6</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="py-3 px-4 text-right">{getStatusBadge(dev)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
