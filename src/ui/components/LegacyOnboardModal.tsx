import React, { useState } from 'react';
import { X, Wrench, Shield, Check } from 'lucide-react';

interface LegacyOnboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    macAddress: string;
    vendor: string;
    model: string;
    staticIp: string;
    subnetMask: string;
    gateway: string;
    httpPort: number;
    rtspPort: number;
  }) => Promise<void>;
}

export const LegacyOnboardModal: React.FC<LegacyOnboardModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [macAddress, setMacAddress] = useState('00:40:8c:55:66:77');
  const [vendor, setVendor] = useState('Axis Communications');
  const [model, setModel] = useState('AXIS 2100 Legacy Video Server');
  const [staticIp, setStaticIp] = useState('192.168.1.199');
  const [subnetMask, setSubnetMask] = useState('255.255.255.0');
  const [gateway, setGateway] = useState('192.168.1.1');
  const [httpPort, setHttpPort] = useState(80);
  const [rtspPort, setRtspPort] = useState(554);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({
        macAddress,
        vendor,
        model,
        staticIp,
        subnetMask,
        gateway,
        httpPort,
        rtspPort,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Add Device Manually</h3>
              <p className="text-[11px] text-slate-400">Bypass automated scan limits using static profile templates & MAC-direct routing.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Physical MAC Address</label>
              <input
                type="text"
                required
                value={macAddress}
                onChange={(e) => setMacAddress(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-sky-400 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Manufacturer</label>
              <select
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:border-sky-500 focus:outline-none"
              >
                <option value="Axis Communications">Axis Communications</option>
                <option value="Illustra / Tyco">Illustra / Tyco</option>
                <option value="Lenel Access Control">Lenel Access Control</option>
                <option value="Pelco Legacy">Pelco Legacy</option>
                <option value="Generic RTSP/HTTP">Generic RTSP/HTTP</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">Model / Hardware Identifier</label>
            <input
              type="text"
              required
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Static IP</label>
              <input
                type="text"
                required
                value={staticIp}
                onChange={(e) => setStaticIp(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-emerald-400 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Subnet Mask</label>
              <input
                type="text"
                required
                value={subnetMask}
                onChange={(e) => setSubnetMask(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-300 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Gateway</label>
              <input
                type="text"
                required
                value={gateway}
                onChange={(e) => setGateway(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-300 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">HTTP Port</label>
              <input
                type="number"
                value={httpPort}
                onChange={(e) => setHttpPort(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-300"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">RTSP Stream Port</label>
              <input
                type="number"
                value={rtspPort}
                onChange={(e) => setRtspPort(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-300"
              />
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-bold text-white bg-sky-600 hover:bg-sky-500 transition shadow-md shadow-sky-950/50"
            >
              <Check className="w-4 h-4" />
              Force MAC-Level Onboarding
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
