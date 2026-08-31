import React, { useState } from 'react';
import { IPCollisionRecord } from '../../types/index.ts';
import { X, AlertTriangle, ShieldAlert, Check, RefreshCw, Cpu, Network } from 'lucide-react';

interface DuplicateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  collisions: IPCollisionRecord[];
  onResolve: (collidingIp: string, resolutions: Array<{ macAddress: string; newIp: string; newSubnet: string; newGateway: string }>) => Promise<void>;
}

export const DuplicateDrawer: React.FC<DuplicateDrawerProps> = ({
  isOpen,
  onClose,
  collisions,
  onResolve,
}) => {
  const activeCollisions = collisions.filter(c => !c.resolved);
  const currentCollision = activeCollisions[0];

  const [formValues, setFormValues] = useState<Record<string, { newIp: string; newSubnet: string; newGateway: string }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-fill form when collision is loaded
  React.useEffect(() => {
    if (currentCollision) {
      const initial: Record<string, { newIp: string; newSubnet: string; newGateway: string }> = {};
      const baseSubnet = currentCollision.ipAddress.split('.').slice(0, 3).join('.');
      
      currentCollision.collidingDevices.forEach((dev, idx) => {
        initial[dev.anchor.macAddress || dev.id] = {
          newIp: idx === 0 ? currentCollision.ipAddress : `${baseSubnet}.${200 + idx}`,
          newSubnet: '255.255.255.0',
          newGateway: `${baseSubnet}.1`,
        };
      });
      setFormValues(initial);
    }
  }, [currentCollision]);

  if (!isOpen || !currentCollision) return null;

  const handleInputChange = (mac: string, field: 'newIp' | 'newSubnet' | 'newGateway', val: string) => {
    setFormValues(prev => ({
      ...prev,
      [mac]: {
        ...prev[mac],
        [field]: val,
      },
    }));
  };

  const handleApplyResolution = async () => {
    setIsSubmitting(true);
    try {
      const resolutions = Object.entries(formValues).map(([macAddress, data]) => ({
        macAddress,
        newIp: data.newIp,
        newSubnet: data.newSubnet,
        newGateway: data.newGateway,
      }));

      await onResolve(currentCollision.ipAddress, resolutions);
      if (activeCollisions.length <= 1) {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-slate-900 border-l border-amber-500/30 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out">
      {/* Header */}
      <div className="p-5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Duplicate IP Assistant
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40">
                {activeCollisions.length} Active Collision{activeCollisions.length > 1 ? 's' : ''}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Isolating competing hardware on IP <span className="font-mono text-amber-300 font-bold">{currentCollision.ipAddress}</span> via permanent physical anchors.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="p-3.5 bg-amber-950/20 border border-amber-500/30 rounded-lg text-xs text-amber-200/90 leading-relaxed flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-300">State Corruption Safeguard:</span> Standard tools fail when two MAC addresses claim the same IP lease. This assistant uses immutable MAC & Serial anchors to cleanly sever the collision state and assign discrete static IPs.
          </div>
        </div>

        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 pt-2">
          Competing Hardware Anchors ({currentCollision.collidingDevices.length})
        </h3>

        <div className="space-y-3">
          {currentCollision.collidingDevices.map((dev, idx) => {
            const mac = dev.anchor.macAddress;
            const deviceKey = mac || dev.id;
            const values = formValues[deviceKey] || { newIp: '', newSubnet: '255.255.255.0', newGateway: '192.168.1.1' };

            return (
              <div key={deviceKey} className="p-4 bg-slate-950/90 border border-slate-800 rounded-xl space-y-3">
                {/* Device Anchor Tag */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-sky-400">
                      Anchor #{idx + 1}
                    </span>
                    <span className="text-xs font-bold text-white">{dev.anchor.vendor}</span>
                    <span className="text-xs text-slate-400 font-mono">({dev.anchor.model})</span>
                  </div>
                  <span className="text-[11px] font-mono text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/50">
                    {mac ? `MAC: ${mac}` : `ONVIF: ${dev.anchor.onvifEndpointUuid || dev.id}`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Hardware Serial:</span>
                    <p className="font-mono text-slate-300">{dev.anchor.serialNumber || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Protocol:</span>
                    <p className="font-mono text-slate-300">{dev.network.protocol}</p>
                  </div>
                </div>

                {/* Reassignment Inputs */}
                <div className="pt-2 border-t border-slate-800/80 grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Target Static IP</label>
                    <input
                      type="text"
                      value={values.newIp}
                      onChange={(e) => handleInputChange(deviceKey, 'newIp', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-emerald-400 font-mono focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Subnet Mask</label>
                    <input
                      type="text"
                      value={values.newSubnet}
                      onChange={(e) => handleInputChange(deviceKey, 'newSubnet', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-300 font-mono focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Gateway</label>
                    <input
                      type="text"
                      value={values.newGateway}
                      onChange={(e) => handleInputChange(deviceKey, 'newGateway', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-300 font-mono focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          Cancel
        </button>

        <button
          onClick={handleApplyResolution}
          disabled={isSubmitting}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-lg shadow-emerald-950/50"
        >
          {isSubmitting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Severing & Reassigning...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Sever Collision & Apply Static Parameters
            </>
          )}
        </button>
      </div>
    </div>
  );
};
