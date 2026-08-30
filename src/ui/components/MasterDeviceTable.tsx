import React, { useState } from 'react';
import { Device, DeviceStatus } from '../../types/index.ts';
import {
  ExternalLink,
  Edit2,
  Check,
  X,
  MoreVertical,
  Sliders,
  Globe,
  Shield,
  AlertTriangle,
  StickyNote,
  Video,
} from 'lucide-react';

interface MasterDeviceTableProps {
  devices: Device[];
  selectedDeviceIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onUpdateDeviceName: (id: string, newName: string) => void;
  onUpdateDeviceNotes: (id: string, notes: string) => void;
  onOpenDuplicateAssistant: () => void;
  onConfigureDevice: (dev: Device) => void;
  onInspectDevice: (dev: Device) => void;
  onOpenBrowser: (dev: Device, mode: 'EMBEDDED' | 'EDGE' | 'CHROME' | 'SYSTEM') => void;
}

export const MasterDeviceTable: React.FC<MasterDeviceTableProps> = ({
  devices,
  selectedDeviceIds,
  onToggleSelect,
  onToggleSelectAll,
  onUpdateDeviceName,
  onUpdateDeviceNotes,
  onOpenDuplicateAssistant,
  onConfigureDevice,
  onInspectDevice,
  onOpenBrowser,
}) => {
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [tempName, setTempName] = useState<string>('');

  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState<string>('');

  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  const startEditName = (dev: Device, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingNameId(dev.id);
    setTempName(dev.anchor.model || dev.anchor.vendor);
  };

  const saveEditName = (devId: string) => {
    if (tempName.trim()) {
      onUpdateDeviceName(devId, tempName.trim());
    }
    setEditingNameId(null);
  };

  const startEditNotes = (dev: Device, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingNotesId(dev.id);
    setTempNotes(dev.statusMessage || '');
  };

  const saveEditNotes = (devId: string) => {
    onUpdateDeviceNotes(devId, tempNotes.trim());
    setEditingNotesId(null);
  };

  const getStatusBadge = (status: DeviceStatus) => {
    switch (status) {
      case 'COLLISION':
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenDuplicateAssistant();
            }}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition animate-pulse"
          >
            <AlertTriangle className="w-3 h-3" />
            Duplicate IP
          </button>
        );
      case 'CONFIGURED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Online (Verified)
          </span>
        );
      case 'AUTHENTICATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">
            Online
          </span>
        );
      case 'PROVISIONING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            Working
          </span>
        );
      case 'UNRESPONSIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400">
            Different Network
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            Verification Required
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300">
            New Device
          </span>
        );
    }
  };

  const isAllSelected = devices.length > 0 && selectedDeviceIds.size === devices.length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          {/* Table Header per Section 5 */}
          <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider">
            <tr>
              <th className="py-3 px-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={onToggleSelectAll}
                  className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500 w-4 h-4 cursor-pointer"
                />
              </th>
              <th className="py-3 px-3">Name</th>
              <th className="py-3 px-3">IP Address</th>
              <th className="py-3 px-3">MAC</th>
              <th className="py-3 px-3">Model</th>
              <th className="py-3 px-3">Serial</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3">Network</th>
              <th className="py-3 px-3">Notes</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/60">
            {devices.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-500">
                  No devices discovered. Click <strong className="text-slate-300">SCAN NETWORK</strong> above to begin discovery.
                </td>
              </tr>
            ) : (
              devices.map((dev) => {
                const isSelected = selectedDeviceIds.has(dev.id);
                const isEditingName = editingNameId === dev.id;
                const isEditingNotes = editingNotesId === dev.id;
                const isActionOpen = openActionMenuId === dev.id;

                return (
                  <tr
                    key={dev.id}
                    onClick={() => onInspectDevice(dev)}
                    className={`hover:bg-slate-850/80 transition cursor-pointer ${
                      isSelected ? 'bg-sky-950/25' : dev.status === 'COLLISION' ? 'bg-amber-950/15' : ''
                    }`}
                  >
                    {/* 1. Select Checkbox */}
                    <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(dev.id)}
                        className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500 w-4 h-4 cursor-pointer"
                      />
                    </td>

                    {/* 2. Name (Inline Editable per Section 6) */}
                    <td className="py-3 px-3 font-medium text-slate-100">
                      {isEditingName ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            className="bg-slate-950 border border-sky-500 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && saveEditName(dev.id)}
                          />
                          <button
                            onClick={() => saveEditName(dev.id)}
                            className="p-1 hover:bg-slate-800 rounded text-emerald-400"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingNameId(null)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-400"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={(e) => startEditName(dev, e)}
                          className="group flex items-center gap-1.5 cursor-pointer hover:text-sky-300 transition"
                          title="Click to rename inline"
                        >
                          <span>{dev.anchor.model || dev.anchor.vendor}</span>
                          <Edit2 className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition" />
                        </div>
                      )}
                    </td>

                    {/* 3. IP Address (Hyperlink per Section 13) */}
                    <td className="py-3 px-3 font-mono" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onOpenBrowser(dev, 'EMBEDDED')}
                        className="text-sky-400 hover:text-sky-300 font-semibold underline underline-offset-2 flex items-center gap-1"
                        title="Click to connect and open camera web interface"
                      >
                        {dev.network.ipAddress}
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </button>
                    </td>

                    {/* 4. MAC */}
                    <td className="py-3 px-3 font-mono text-slate-300">
                      {dev.anchor.macAddress}
                    </td>

                    {/* 5. Model */}
                    <td className="py-3 px-3 text-slate-300">
                      <div className="truncate max-w-[140px]" title={dev.anchor.model}>
                        {dev.anchor.model || 'Generic Camera'}
                      </div>
                    </td>

                    {/* 6. Serial */}
                    <td className="py-3 px-3 font-mono text-slate-400">
                      {dev.anchor.serialNumber || 'N/A'}
                    </td>

                    {/* 7. Status (Section 18) */}
                    <td className="py-3 px-3">
                      {getStatusBadge(dev.status)}
                    </td>

                    {/* 8. Network */}
                    <td className="py-3 px-3 font-mono text-slate-400 text-[11px]">
                      {dev.network.subnetMask}
                    </td>

                    {/* 9. Notes (Inline Editable per Section 5) */}
                    <td className="py-3 px-3 text-slate-400">
                      {isEditingNotes ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={tempNotes}
                            onChange={(e) => setTempNotes(e.target.value)}
                            placeholder="Add technician note..."
                            className="bg-slate-950 border border-sky-500 rounded px-2 py-0.5 text-xs text-white focus:outline-none w-32"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && saveEditNotes(dev.id)}
                          />
                          <button
                            onClick={() => saveEditNotes(dev.id)}
                            className="p-1 hover:bg-slate-800 rounded text-emerald-400"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={(e) => startEditNotes(dev, e)}
                          className="cursor-pointer hover:text-slate-200 transition text-[11px] truncate max-w-[120px] flex items-center gap-1"
                          title="Click to add/edit note"
                        >
                          <StickyNote className="w-3 h-3 text-slate-600" />
                          <span>{dev.statusMessage || <span className="italic text-slate-600">Add note</span>}</span>
                        </div>
                      )}
                    </td>

                    {/* 10. Actions (Section 31) */}
                    <td className="py-3 px-3 text-right relative" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onInspectDevice(dev)}
                          title="Inspect Live RTSP & Switch PoE Telemetry"
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white transition font-medium text-[11px] flex items-center gap-1"
                        >
                          <Video className="w-3 h-3 text-sky-400" />
                          Inspect
                        </button>

                        <button
                          onClick={() => setOpenActionMenuId(isActionOpen ? null : dev.id)}
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Dropdown Action Menu (Section 31) */}
                      {isActionOpen && (
                        <div className="absolute right-3 top-10 z-30 w-48 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl p-1.5 text-left text-xs space-y-1">
                          <button
                            onClick={() => {
                              onOpenBrowser(dev, 'EMBEDDED');
                              setOpenActionMenuId(null);
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                          >
                            <Globe className="w-3.5 h-3.5 text-sky-400" />
                            Open in Embedded Browser
                          </button>

                          <button
                            onClick={() => {
                              onOpenBrowser(dev, 'EDGE');
                              setOpenActionMenuId(null);
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                            Open in Microsoft Edge
                          </button>

                          <div className="border-t border-slate-800 my-1" />

                          <button
                            onClick={(e) => {
                              startEditName(dev, e);
                              setOpenActionMenuId(null);
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                            Rename Device
                          </button>

                          <button
                            onClick={(e) => {
                              startEditNotes(dev, e);
                              setOpenActionMenuId(null);
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                          >
                            <StickyNote className="w-3.5 h-3.5 text-slate-400" />
                            Edit Notes
                          </button>

                          <div className="border-t border-slate-800 my-1" />

                          <button
                            onClick={() => {
                              onConfigureDevice(dev);
                              setOpenActionMenuId(null);
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                          >
                            <Shield className="w-3.5 h-3.5 text-purple-400" />
                            Credentials & Parameters
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
