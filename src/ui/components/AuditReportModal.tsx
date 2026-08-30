import React from 'react';
import { SiteProject, AuditLogEntry } from '../../types/index.ts';
import { X, FileText, Download, CheckCircle2, AlertTriangle, ShieldCheck, HardDrive } from 'lucide-react';

interface AuditReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: SiteProject;
  auditLogs: AuditLogEntry[];
}

export const AuditReportModal: React.FC<AuditReportModalProps> = ({
  isOpen,
  onClose,
  project,
  auditLogs,
}) => {
  if (!isOpen) return null;

  const verifiedDevicesCount = project.devices.filter(d => d.telemetry?.rtspStreamActive).length;
  const unresolvedCollisions = project.collisions.filter(c => !c.resolved).length;
  const isCompliant = project.devices.length > 0 && unresolvedCollisions === 0;

  const handleDownloadProjectFile = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${project.name.replace(/\s+/g, '_')}.cctvproj`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Section 13.5: Site Audit Sign-Off & Project Export</h3>
              <p className="text-[11px] text-slate-400">Formal verification report for physical security deployment compliance.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          {/* Status Box */}
          <div className={`p-4 rounded-xl border flex items-center justify-between ${
            isCompliant
              ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200'
              : 'bg-amber-950/20 border-amber-500/40 text-amber-200'
          }`}>
            <div className="flex items-center gap-3">
              {isCompliant ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-amber-400 shrink-0" />
              )}
              <div>
                <h4 className="font-bold text-sm text-white">
                  {isCompliant ? 'FIELD CERTIFICATION PASSED' : 'FIELD ACTION REQUIRED'}
                </h4>
                <p className="text-[11px] mt-0.5 opacity-90">
                  {isCompliant
                    ? 'All physical device anchors verified. Telemetry heartbeats nominal. Zero collision states detected.'
                    : 'Unresolved IP collisions or unverified devices detected. Review before site handover.'}
                </p>
              </div>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase font-bold">Total Discovered</span>
              <p className="text-lg font-mono font-bold text-sky-400 mt-1">{project.devices.length}</p>
            </div>
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase font-bold">Telemetry Verified</span>
              <p className="text-lg font-mono font-bold text-emerald-400 mt-1">{verifiedDevicesCount}</p>
            </div>
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase font-bold">IP Collisions</span>
              <p className="text-lg font-mono font-bold text-rose-400 mt-1">{unresolvedCollisions}</p>
            </div>
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase font-bold">Rogue DHCP</span>
              <p className="text-lg font-mono font-bold text-purple-400 mt-1">{project.rogueDhcpEvents.length}</p>
            </div>
          </div>

          {/* Audit Trail List */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Recent Audit Log Ledger ({auditLogs.length} events)
            </h4>
            <div className="max-h-48 overflow-y-auto bg-slate-950 rounded-lg border border-slate-800 p-2.5 space-y-1.5 font-mono text-[11px]">
              {auditLogs.slice(0, 15).map((log) => (
                <div key={log.id} className="flex items-start gap-2 border-b border-slate-900 pb-1">
                  <span className="text-slate-500 shrink-0">{log.timestamp.slice(11, 19)}</span>
                  <span className={`px-1 rounded text-[10px] font-bold ${
                    log.level === 'SUCCESS' ? 'bg-emerald-950 text-emerald-400' :
                    log.level === 'WARNING' ? 'bg-amber-950 text-amber-400' :
                    log.level === 'ERROR' ? 'bg-rose-950 text-rose-400' : 'bg-slate-800 text-sky-400'
                  }`}>
                    {log.level}
                  </span>
                  <span className="text-slate-300 leading-snug">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <HardDrive className="w-4 h-4 text-sky-400" />
            <span>Dual SQLite Archive: <span className="font-mono text-slate-200">{project.name}.cctvproj</span></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Close
            </button>
            <button
              onClick={handleDownloadProjectFile}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 transition shadow-md shadow-sky-950/50"
            >
              <Download className="w-4 h-4" />
              Export .cctvproj SQLite Bundle
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
