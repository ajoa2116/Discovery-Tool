import React, { useState, useEffect } from 'react';
import { Device } from '../../types/index.ts';
import { BulkReIpEngine, BulkReIpPlanItem } from '../../core/engine/bulk_reip.ts';
import { X, Network, Play, CheckCircle, AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';

interface BulkReIpModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDevices: Device[];
  onExecuteBatch: (plan: BulkReIpPlanItem[]) => Promise<void>;
}

export const BulkReIpModal: React.FC<BulkReIpModalProps> = ({
  isOpen,
  onClose,
  selectedDevices,
  onExecuteBatch,
}) => {
  const [startIp, setStartIp] = useState('192.168.1.101');
  const [subnetMask, setSubnetMask] = useState('255.255.255.0');
  const [gateway, setGateway] = useState('192.168.1.1');
  const [step, setStep] = useState(1);

  const [plan, setPlan] = useState<BulkReIpPlanItem[]>([]);
  const [conflictsCount, setConflictsCount] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    if (selectedDevices.length > 0) {
      const generated = BulkReIpEngine.generatePlan(
        selectedDevices.flatMap((d) => d.anchor.macAddress ? [d.anchor.macAddress] : []),
        startIp,
        subnetMask,
        gateway,
        step
      );
      setPlan(generated.plan);
      setConflictsCount(generated.conflictsCount);
    }
  }, [selectedDevices, startIp, subnetMask, gateway, step]);

  if (!isOpen || selectedDevices.length === 0) return null;

  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      await onExecuteBatch(plan);
      onClose();
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Section 5: Bulk IP Re-IP Subsystem</h3>
              <p className="text-[11px] text-slate-400">
                Sequential auto-fill and pre-flight ARP conflict audit for {selectedDevices.length} selected cameras.
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inputs */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          <div className="grid grid-cols-4 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Starting IP Address</label>
              <input
                type="text"
                value={startIp}
                onChange={(e) => setStartIp(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-emerald-400 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Subnet Mask</label>
              <input
                type="text"
                value={subnetMask}
                onChange={(e) => setSubnetMask(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-200 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Default Gateway</label>
              <input
                type="text"
                value={gateway}
                onChange={(e) => setGateway(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-200 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Step Increment</label>
              <input
                type="number"
                min="1"
                value={step}
                onChange={(e) => setStep(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-sky-400 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Pre-Flight Conflict Status Banner */}
          {conflictsCount > 0 ? (
            <div className="p-3 bg-amber-950/30 border border-amber-500/40 rounded-xl text-amber-200 flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <span>
                <strong>Pre-Flight Audit Warning:</strong> {conflictsCount} proposed IP(s) collide with currently active devices on this subnet. Adjust Starting IP or Step.
              </span>
            </div>
          ) : (
            <div className="p-2.5 bg-emerald-950/20 border border-emerald-500/30 rounded-xl text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Pre-Flight Conflict Audit Passed. 0 collisions detected across proposed range.</span>
            </div>
          )}

          {/* Planned Re-IP Mapping Table */}
          <div>
            <h4 className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] mb-1.5">
              Sequential Re-IP Execution Queue ({plan.length} Devices)
            </h4>
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 text-[10px]">
                  <tr>
                    <th className="py-2 px-3">MAC Anchor</th>
                    <th className="py-2 px-3">Current IP</th>
                    <th className="py-2 px-3">→ Target Static IP</th>
                    <th className="py-2 px-3 text-right">Conflict Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-[11px]">
                  {plan.map((item) => (
                    <tr key={item.macAddress} className="hover:bg-slate-900/50">
                      <td className="py-2 px-3 text-slate-300 font-bold">{item.macAddress}</td>
                      <td className="py-2 px-3 text-slate-400">{item.currentIp}</td>
                      <td className="py-2 px-3 text-sky-400 font-bold">{item.targetIp}</td>
                      <td className="py-2 px-3 text-right">
                        {item.isConflict ? (
                          <span className="text-amber-400 font-bold">COLLISION</span>
                        ) : (
                          <span className="text-emerald-400">CLEAR</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            onClick={handleExecute}
            disabled={isExecuting || conflictsCount > 0}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold text-white transition shadow-md ${
              isExecuting || conflictsCount > 0
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/50'
            }`}
          >
            {isExecuting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Executing 6-Phase Atomic Re-IP...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                Execute Atomic Batch Re-IP
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
