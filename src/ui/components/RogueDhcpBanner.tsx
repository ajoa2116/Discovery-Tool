import React from 'react';
import { RogueDHCPOffer } from '../../types/index.ts';
import { ShieldAlert, AlertOctagon, Terminal } from 'lucide-react';

interface RogueDhcpBannerProps {
  rogueEvents: RogueDHCPOffer[];
  onDismiss?: () => void;
}

export const RogueDhcpBanner: React.FC<RogueDhcpBannerProps> = ({ rogueEvents }) => {
  if (!rogueEvents || rogueEvents.length === 0) return null;

  const latest = rogueEvents[rogueEvents.length - 1];

  return (
    <div className="bg-rose-950/40 border border-rose-500/50 rounded-xl p-4 shadow-lg text-rose-100 flex items-start gap-3.5 animate-pulse">
      <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
        <AlertOctagon className="w-6 h-6" />
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500 text-white">
            Section 13.3 Critical Security Alert
          </span>
          <h3 className="font-bold text-sm text-white">Rogue DHCP Server Detected on Camera VLAN</h3>
        </div>

        <p className="text-xs text-rose-200/90 mt-1 leading-relaxed">
          Unauthorized DHCP server broadcasting offers: Server IP <span className="font-mono font-bold text-white">{latest.serverIp}</span> (MAC: <span className="font-mono text-white">{latest.serverMac}</span>).
          Offering lease <span className="font-mono text-white">{latest.offeredIp}</span>. Immediate switch port isolation recommended.
        </p>
      </div>
    </div>
  );
};
