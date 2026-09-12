import React from 'react';
import { Radio, X, Plus, Eye, EyeOff } from 'lucide-react';

interface NewDeviceNotificationProps {
  deviceIp: string;
  vendor: string;
  evidence?: string;
  sourceAdapter?: string;
  onView: () => void;
  onAdd: () => void;
  onIgnore: () => void;
}

export const NewDeviceNotification: React.FC<NewDeviceNotificationProps> = ({
  deviceIp,
  vendor,
  evidence = 'Device discovery evidence received.',
  sourceAdapter,
  onView,
  onAdd,
  onIgnore,
}) => {
  return (
    <div className="bg-gradient-to-r from-sky-950/90 to-blue-950/90 border border-sky-500/50 rounded-xl p-3.5 shadow-xl flex items-center justify-between gap-4 text-xs animate-slide-in">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400">
          <Radio className="w-4 h-4 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-white uppercase tracking-wider text-[10px] bg-sky-500/30 px-2 py-0.5 rounded text-sky-300">
              New Device Detected
            </span>
            <span className="font-bold text-slate-200">{vendor}</span>
          </div>
          <p className="text-slate-300 font-mono text-[11px] mt-0.5">
            IP: <span className="text-sky-300 font-bold">{deviceIp}</span> - {evidence}{sourceAdapter && ` Adapter: ${sourceAdapter}.`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onView}
          className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition flex items-center gap-1"
        >
          <Eye className="w-3.5 h-3.5" />
          View
        </button>
        <button
          onClick={onAdd}
          className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold transition flex items-center gap-1 shadow-md shadow-sky-950"
        >
          <Plus className="w-3.5 h-3.5" />
          Add to Staging
        </button>
        <button
          onClick={onIgnore}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Ignore device"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
