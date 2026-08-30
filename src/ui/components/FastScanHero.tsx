import React, { useState } from 'react';
import {
  Zap,
  Radio,
  Network,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Server,
  Camera,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';
import { NICInfo, SiteProject } from '../../types/index.ts';

interface FastScanHeroProps {
  onRunFastScan: () => void;
  isScanning: boolean;
  project: SiteProject | null;
  interfaces: NICInfo[];
  selectedNic: string;
  onSelectNic: (nicName: string) => void;
  vendorFilter: string;
  onSelectVendorFilter: (vendor: string) => void;
}

export const FastScanHero: React.FC<FastScanHeroProps> = ({
  onRunFastScan,
  isScanning,
  project,
  interfaces,
  selectedNic,
  onSelectNic,
  vendorFilter,
  onSelectVendorFilter,
}) => {
  const devices = project?.devices || [];
  const collisionsCount = project?.collisions.filter((c) => !c.resolved).length || 0;
  const verifiedCount = devices.filter((d) => d.status === 'CONFIGURED').length;
  const unprovisionedCount = devices.filter((d) => d.status === 'DISCOVERED' || d.status === 'AUTHENTICATED').length;

  const currentNic = interfaces.find((i) => i.name === selectedNic) || interfaces[0];

  const vendorList = ['ALL', 'Axis Communications', 'Illustra / Tyco', 'Hanwha Vision', 'Hikvision Digital Technology', 'Dahua Technology', 'Lenel Access Control', 'Bosch Security', 'Pelco'];

  return (
    <div className="space-y-4">
      {/* Hero Banner with Fast Scan Button */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-850 to-slate-950 border border-slate-700/70 rounded-2xl p-6 shadow-2xl">
        {/* Subtle Background Radar Grid */}
        <div className="absolute right-0 top-0 bottom-0 w-96 opacity-10 pointer-events-none flex items-center justify-center">
          <div className="w-80 h-80 rounded-full border border-sky-400 animate-ping" />
          <div className="w-56 h-56 rounded-full border border-sky-300 absolute" />
          <div className="w-32 h-32 rounded-full border border-sky-200 absolute" />
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-semibold">
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Section 12 SOP • Field Staging & Rapid Discovery</span>
            </div>

            <h2 className="text-2xl font-black text-white tracking-tight">
              Rapid CCTV Network Discovery
            </h2>

            <p className="text-xs text-slate-300 leading-relaxed">
              Instant non-destructive broadcast scan using ONVIF WS-Discovery and multi-vendor packet sniffers. Detects Axis, Illustra, Hanwha, Hikvision, Dahua, and Lenel access hardware in seconds.
            </p>

            {/* Adapter Selector & Subnet Info */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-1.5 text-xs">
                <Network className="w-4 h-4 text-sky-400" />
                <span className="text-slate-400">Adapter:</span>
                <select
                  value={selectedNic}
                  onChange={(e) => onSelectNic(e.target.value)}
                  className="bg-transparent text-slate-100 font-semibold focus:outline-none cursor-pointer"
                >
                  {interfaces.map((nic) => (
                    <option key={nic.name} value={nic.name} className="bg-slate-900 text-white">
                      {nic.name} ({nic.ipAddress})
                    </option>
                  ))}
                </select>
              </div>

              {currentNic && (
                <span className="text-[11px] font-mono text-slate-400 bg-slate-900/60 px-2.5 py-1.5 rounded border border-slate-800">
                  Broadcast: <span className="text-sky-400 font-bold">{currentNic.broadcast}</span>
                </span>
              )}
            </div>
          </div>

          {/* Primary Fast Scan Action Button */}
          <div className="flex flex-col items-center lg:items-end gap-3 shrink-0">
            <button
              onClick={onRunFastScan}
              disabled={isScanning}
              className={`group relative flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-bold text-base transition-all shadow-xl ${
                isScanning
                  ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
                  : 'bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-sky-900/40 hover:scale-[1.02] active:scale-[0.98]'
              }`}
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin text-sky-400" />
                  <span>Scanning Network Subnets...</span>
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 fill-current text-amber-300 group-hover:animate-bounce" />
                  <span>START FAST SCAN</span>
                </>
              )}
            </button>
            <span className="text-[11px] text-slate-400">
              {isScanning ? 'Passive sniffer & active UDP 3702 probes active' : '⚡ 3-second rapid discovery cycle'}
            </span>
          </div>
        </div>
      </div>

      {/* Quick KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5 shadow-md">
          <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Discovered Devices</span>
            <div className="text-xl font-mono font-black text-white">{devices.length}</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5 shadow-md">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Unprovisioned Staged</span>
            <div className="text-xl font-mono font-black text-amber-300">{unprovisionedCount}</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5 shadow-md">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Verified & Nominal</span>
            <div className="text-xl font-mono font-black text-emerald-400">{verifiedCount}</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5 shadow-md">
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">IP Collisions (13.2)</span>
            <div className="text-xl font-mono font-black text-rose-400">{collisionsCount}</div>
          </div>
        </div>
      </div>

      {/* Quick Vendor Filter Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filter Brand:
        </span>
        {vendorList.map((vendor) => (
          <button
            key={vendor}
            onClick={() => onSelectVendorFilter(vendor)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition border ${
              vendorFilter === vendor
                ? 'bg-sky-500 text-white border-sky-400 shadow-md shadow-sky-950'
                : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800 hover:bg-slate-800'
            }`}
          >
            {vendor}
          </button>
        ))}
      </div>
    </div>
  );
};
