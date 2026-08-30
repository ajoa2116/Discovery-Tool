import React from 'react';
import { Device } from '../../types/index.ts';
import { X, Globe, ExternalLink, RefreshCw, Shield, Lock } from 'lucide-react';

interface BrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: Device | null;
}

export const BrowserModal: React.FC<BrowserModalProps> = ({ isOpen, onClose, device }) => {
  if (!isOpen || !device) return null;

  const recentChecks = [...(device.diagnostics?.checks || [])].reverse();
  const protocol = recentChecks.some(check => check.type === 'HTTPS' && check.success) ? 'https' : 'http';
  const port = protocol === 'https' ? 443 : device.network.port || 80;
  const url = `${protocol}://${device.network.ipAddress}:${port}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl h-[85vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Browser Top Navigation Bar */}
        <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5 pl-1">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
            </div>
            <span className="text-xs font-bold text-slate-200 ml-2">{device.anchor.vendor} Web Interface</span>
          </div>

          {/* Address Bar */}
          <div className="flex-1 max-w-xl bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs font-mono text-slate-300">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span className="truncate">{url}</span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs flex items-center gap-1 transition"
              title="Open in external browser"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              External
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Embedded Frame Workspace (Section 28) */}
        <div className="flex-1 bg-slate-950 relative flex items-center justify-center">
          <iframe
            src={url}
            title={`${device.anchor.vendor} Interface`}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-same-origin allow-scripts allow-forms"
          />
        </div>
      </div>
    </div>
  );
};
