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
  Activity,
  Network,
  Info,
} from 'lucide-react';
import { FloatingDeviceActionsMenu } from './FloatingDeviceActionsMenu.tsx';

interface MasterDeviceTableProps {
  devices: Device[];
  hasCompletedScan?: boolean;
  selectedDeviceIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onUpdateDeviceName: (id: string, newName: string) => void;
  onUpdateDeviceNotes: (id: string, notes: string) => void;
  onOpenDuplicateAssistant: (device: Device) => void;
  onConfigureDevice: (dev: Device) => void;
  onInspectDevice: (dev: Device) => void;
  onOpenBrowser: (dev: Device, mode: 'EMBEDDED' | 'EDGE' | 'CHROME' | 'SYSTEM') => void;
  onDiagnose: (dev: Device) => void;
  onPair: (dev: Device) => void;
}

export const MasterDeviceTable: React.FC<MasterDeviceTableProps> = ({
  devices,
  hasCompletedScan = false,
  selectedDeviceIds,
  onToggleSelect,
  onToggleSelectAll,
  onUpdateDeviceName,
  onUpdateDeviceNotes,
  onOpenDuplicateAssistant,
  onConfigureDevice,
  onInspectDevice,
  onOpenBrowser,
  onDiagnose,
  onPair,
}) => {
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [tempName, setTempName] = useState<string>('');

  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState<string>('');

  const [openActionMenu, setOpenActionMenu] = useState<{ device: Device; anchor: DOMRect } | null>(null);

  const startEditName = (dev: Device, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingNameId(dev.id);
    setTempName(dev.technician?.name || dev.anchor.model || dev.anchor.vendor);
  };

  const saveEditName = (devId: string) => {
    if (tempName.trim()) {
      onUpdateDeviceName(devId, tempName.trim());
    }
    setEditingNameId(null);
  };

  const startEditNotes = (dev: Device, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingNotesId(dev.id);
    setTempNotes(dev.technician?.notes || '');
  };

  const saveEditNotes = (devId: string) => {
    onUpdateDeviceNotes(devId, tempNotes.trim());
    setEditingNotesId(null);
  };

  const getStatusBadge = (status: DeviceStatus, dev: Device) => {
    switch (status) {
      case 'ONLINE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">
            Online
          </span>
        );
      case 'DIFFERENT_SUBNET':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            Different Subnet
          </span>
        );
      case 'UNKNOWN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400">
            Unknown
          </span>
        );
      case 'COLLISION':
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenDuplicateAssistant(dev);
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
            Online
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
      case 'UNREACHABLE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400">
            Unreachable
          </span>
        );
      case 'OFFLINE':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/50 text-rose-300 border border-rose-800">Offline</span>;
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
  const lastSix = (device: Device) => { const value = device.anchor.macAddress?.replace(/[^0-9a-f]/gi, '').toUpperCase(); return value && value.length === 12 ? value.slice(-6) : null; };
  const configured = (device: Device) => device.configuredState?.manualOverride ?? device.configuredState?.inferred ?? null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          {/* Table Header per Section 5 */}
          <thead className="bg-slate-100 dark:bg-slate-950/90 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-semibold uppercase tracking-wider">
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
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3">IP</th>
              <th className="py-2 px-3"><span className="inline-flex items-center gap-1"><span>MAC <span className="block text-[9px] font-medium normal-case tracking-normal">(Last 6)</span></span><span title="MAC (Last 6): Shows the last 6 characters of the device MAC address for quick identification. The full MAC address is shown in Device Details."><Info aria-label="MAC column information" className="w-3.5 h-3.5"/></span></span></th>
              <th className="py-2 px-3"><span className="inline-flex items-center gap-1">Config <span title="Shows the camera's current configured state. This is separate from Online/Offline status. Technician override may change this value."><Info aria-label="Config column information" className="w-3.5 h-3.5"/></span></span></th>
              <th className="py-3 px-3">Serial</th>
              <th className="py-3 px-3">Notes</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/60">
            {devices.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-500">
                  <span className="block font-medium text-slate-700 dark:text-slate-300">{hasCompletedScan ? 'No devices found.' : 'No devices discovered.'}</span><span className="mt-1 block">{hasCompletedScan ? 'Select Scan to scan again.' : 'Select Scan to begin discovery.'}</span>
                </td>
              </tr>
            ) : (
              devices.map((dev) => {
                const isSelected = selectedDeviceIds.has(dev.id);
                const isEditingName = editingNameId === dev.id;
                const isEditingNotes = editingNotesId === dev.id;
                const isActionOpen = openActionMenu?.device.id === dev.id;

                return (
                  <tr
                    key={dev.id}
                    onClick={() => onInspectDevice(dev)}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-850/80 transition cursor-pointer ${
                      isSelected ? 'bg-blue-50 dark:bg-sky-950/25' : dev.status === 'COLLISION' ? 'bg-amber-50 dark:bg-amber-950/15' : ''
                    }`}
                  >
                    {/* 1. Select Checkbox */}
                    <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(dev.id)}
                        className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500 w-4 h-4 cursor-pointer"
                      />
                    </td>

                    {/* 2. Name (Inline Editable per Section 6) */}
                    <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-100">
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
                          <span>{dev.technician?.name || dev.anchor.model || dev.anchor.vendor}</span>
                          <Edit2 className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition" />
                        </div>
                      )}
                    </td>

                    {/* Status remains separate from configured state. */}
                    <td className="py-2 px-3">{getStatusBadge(dev.status, dev)}</td>

                    {/* IP opens the existing secure Connect workflow. */}
                    <td className="py-3 px-3 font-mono" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onOpenBrowser(dev, 'SYSTEM')}
                        className="text-sky-400 hover:text-sky-300 font-semibold underline underline-offset-2 flex items-center gap-1"
                        title="Click to connect and open camera web interface"
                      >
                        {dev.network.ipAddress}
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </button>
                    </td>

                    <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-300">{lastSix(dev) || 'Unknown'}</td>
                    <td className="py-2 px-3">{configured(dev)===true?<span className="text-emerald-700 dark:text-emerald-400">✓ Yes{dev.configuredState?.manualOverride!==undefined?' · Manual':''}</span>:configured(dev)===false?<span className="text-slate-600 dark:text-slate-400">No{dev.configuredState?.manualOverride!==undefined?' · Manual':''}</span>:<span className="text-slate-500">Unknown</span>}</td>
                    <td className="py-2 px-3 font-mono text-slate-500">{dev.anchor.serialNumber || 'Unknown'}</td>

                    {/* 9. Notes (Inline Editable per Section 5) */}
                    <td className="py-2 px-3 text-slate-500">
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
                          <span>{dev.technician?.notes || <span className="italic text-slate-600">Add note</span>}</span>
                        </div>
                      )}
                    </td>

                    {/* 10. Actions (Section 31) */}
                    <td className="py-2 px-3 text-right relative" onClick={(e) => e.stopPropagation()}>
                      <button aria-label={`Actions for ${dev.technician?.name||dev.anchor.vendor}`} aria-haspopup="menu" aria-expanded={isActionOpen} onClick={(event) => setOpenActionMenu(isActionOpen ? null : { device: dev, anchor: event.currentTarget.getBoundingClientRect() })} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><MoreVertical className="w-4 h-4" /></button>

                      {/* Dropdown Action Menu (Section 31) */}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {openActionMenu && <FloatingDeviceActionsMenu device={openActionMenu.device} anchor={openActionMenu.anchor} onClose={() => setOpenActionMenu(null)} onOpen={device => onOpenBrowser(device, 'SYSTEM')} onDetails={onInspectDevice} onDiagnose={onDiagnose} onPair={onPair} onRename={device => startEditName(device)} onNotes={device => startEditNotes(device)} onConfigure={onConfigureDevice}/>}
    </div>
  );
};
