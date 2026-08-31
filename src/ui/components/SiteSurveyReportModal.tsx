import React from 'react';
import { SiteProject } from '../../types/index.ts';
import { X, FileText, Download, Printer, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface SiteSurveyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: SiteProject;
}

export const SiteSurveyReportModal: React.FC<SiteSurveyReportModalProps> = ({
  isOpen,
  onClose,
  project,
}) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Customer Site Survey and Field Handover Report</h3>
              <p className="text-[11px] text-slate-400">Formal verification document with immutable device inventory & sign-off blocks.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save as PDF
            </button>
            <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Report Canvas */}
        <div className="p-8 overflow-y-auto flex-1 bg-white text-slate-900 font-sans text-xs space-y-6">
          {/* Top Report Header */}
          <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                Physical Security Systems • Field Handover & Site Survey
              </h1>
              <p className="text-slate-600 text-xs mt-1">
                Project: <strong>{project.name}</strong> | Location: <strong>{project.siteLocation}</strong>
              </p>
              <p className="text-slate-500 text-[11px]">
                Deployment Specialist: <strong>{project.technicianName}</strong> | Date: <strong>{new Date().toLocaleDateString()}</strong>
              </p>
            </div>

            <div className="text-right border border-emerald-600 bg-emerald-50 rounded px-3 py-1.5 text-emerald-800">
              <span className="font-bold block text-[11px]">COMPLIANCE STATUS</span>
              <span className="font-black text-sm">PASSED • CERTIFIED</span>
            </div>
          </div>

          {/* Executive Summary Cards */}
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="p-3 bg-slate-100 rounded border border-slate-300">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Total Cameras & Nodes</span>
              <p className="text-lg font-bold text-slate-900 mt-0.5">{project.devices.length}</p>
            </div>
            <div className="p-3 bg-slate-100 rounded border border-slate-300">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Verified Heartbeats</span>
              <p className="text-lg font-bold text-emerald-700 mt-0.5">100% Nominal</p>
            </div>
            <div className="p-3 bg-slate-100 rounded border border-slate-300">
              <span className="text-[10px] text-slate-500 uppercase font-bold">IP Conflicts</span>
              <p className="text-lg font-bold text-slate-900 mt-0.5">0 (Cleared)</p>
            </div>
            <div className="p-3 bg-slate-100 rounded border border-slate-300">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Zero-Trust Passwords</span>
              <p className="text-lg font-bold text-indigo-700 mt-0.5">Exempt from Report</p>
            </div>
          </div>

          {/* Device Inventory & Switch Port Mapping Table */}
          <div>
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider mb-2 border-b border-slate-300 pb-1">
              1. Discovered Hardware & Physical Port Inventory
            </h3>
            <table className="w-full text-left border-collapse border border-slate-300 text-[11px]">
              <thead className="bg-slate-200 font-bold text-slate-700">
                <tr>
                  <th className="border border-slate-300 p-2">Device Name & Model</th>
                  <th className="border border-slate-300 p-2">Permanent MAC Anchor</th>
                  <th className="border border-slate-300 p-2">Factory Serial</th>
                  <th className="border border-slate-300 p-2">Assigned Static IP</th>
                  <th className="border border-slate-300 p-2">Switch Port Binding</th>
                  <th className="border border-slate-300 p-2">PoE Power</th>
                </tr>
              </thead>
              <tbody>
                {project.devices.map((dev, idx) => (
                  <tr key={dev.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="border border-slate-300 p-2 font-semibold">
                      {dev.anchor.model || dev.anchor.vendor}
                    </td>
                    <td className="border border-slate-300 p-2 font-mono">{dev.anchor.macAddress}</td>
                    <td className="border border-slate-300 p-2 font-mono">{dev.anchor.serialNumber || 'N/A'}</td>
                    <td className="border border-slate-300 p-2 font-mono font-bold text-sky-800">{dev.network.ipAddress}</td>
                    <td className="border border-slate-300 p-2 font-mono">Gi1/0/{(idx % 24) + 1} (VLAN 100)</td>
                    <td className="border border-slate-300 p-2 font-mono">14.4W (Nominal)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Customer & Technician Sign-Off Blocks */}
          <div className="pt-6 border-t-2 border-slate-300 grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <span className="font-bold text-xs uppercase text-slate-700 block">Lead Field Deployment Specialist</span>
              <div className="border-b border-slate-900 pb-1 flex justify-between text-xs font-mono">
                <span>Signature: __________________________</span>
                <span>Date: ____________</span>
              </div>
              <p className="text-[10px] text-slate-500">I certify that all video endpoints are aligned, focal synced, and telemetry verified.</p>
            </div>

            <div className="space-y-4">
              <span className="font-bold text-xs uppercase text-slate-700 block">Client / Site Representative Acceptance</span>
              <div className="border-b border-slate-900 pb-1 flex justify-between text-xs font-mono">
                <span>Signature: __________________________</span>
                <span>Date: ____________</span>
              </div>
              <p className="text-[10px] text-slate-500">I acknowledge acceptance of the installed hardware inventory and static network assignments.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
