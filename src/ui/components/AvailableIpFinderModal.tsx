import React, { useState } from 'react';
import { AvailableIpFinder } from '../../core/engine/ip_finder.ts';
import { X, Search, Check, Network, Copy } from 'lucide-react';

interface AvailableIpFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectIp?: (ip: string) => void;
}

export const AvailableIpFinderModal: React.FC<AvailableIpFinderModalProps> = ({
  isOpen,
  onClose,
  onSelectIp,
}) => {
  const [subnetPrefix, setSubnetPrefix] = useState('192.168.1');
  const [startRange, setStartRange] = useState(100);
  const [endRange, setEndRange] = useState(240);
  const [availableIps, setAvailableIps] = useState<string[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleScan = () => {
    const list = AvailableIpFinder.scanAvailableIps(subnetPrefix, startRange, endRange);
    setAvailableIps(list);
    setHasScanned(true);
  };

  const handleCopy = (ip: string) => {
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
    if (onSelectIp) onSelectIp(ip);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Section 25: Available IP Finder</h3>
              <p className="text-[11px] text-slate-400">Find unassigned static IP addresses across your subnet.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Range Controls */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          <div className="grid grid-cols-3 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Subnet Prefix</label>
              <input
                type="text"
                value={subnetPrefix}
                onChange={(e) => setSubnetPrefix(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Start Range</label>
              <input
                type="number"
                value={startRange}
                onChange={(e) => setStartRange(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">End Range</label>
              <input
                type="number"
                value={endRange}
                onChange={(e) => setEndRange(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-200"
              />
            </div>
          </div>

          <button
            onClick={handleScan}
            className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-md shadow-sky-950"
          >
            <Search className="w-4 h-4" />
            Scan for Unassigned IPs
          </button>

          {/* Results Grid */}
          {hasScanned && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                  Unassigned Addresses Found ({availableIps.length})
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">Safe for Static Assignment</span>
              </div>

              <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto p-1 font-mono text-xs">
                {availableIps.slice(0, 36).map((ip) => (
                  <button
                    key={ip}
                    onClick={() => handleCopy(ip)}
                    className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-sky-500 hover:bg-sky-950/30 text-slate-200 flex items-center justify-between transition group"
                  >
                    <span className="text-emerald-400 font-bold">{ip}</span>
                    {copiedIp === ip ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3 text-slate-600 group-hover:text-slate-300" />
                    )}
                  </button>
                ))}
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
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
