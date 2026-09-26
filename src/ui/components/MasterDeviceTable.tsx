import React, { useState, useRef } from 'react';
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
import { DeviceRemovalDialog } from './DeviceRemovalDialog.tsx';
import { TableColumnId } from '../preferences.ts';
import { DeviceSort, DeviceSortColumn, nextDeviceSort, sortDevices } from '../../shared/device_sort.ts';

interface MasterDeviceTableProps {
  devices: Device[];
  hasCompletedScan?: boolean;
  selectedDeviceIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onUpdateDeviceName: (id: string, newName: string) => Promise<void> | void;
  onUpdateDeviceNotes: (id: string, notes: string) => Promise<void> | void;
  onOpenDuplicateAssistant: (device: Device) => void;
  onConfigureDevice: (dev: Device) => void;
  onInspectDevice: (dev: Device) => void;
  onOpenBrowser: (dev: Device, mode: 'EMBEDDED' | 'EDGE' | 'CHROME' | 'SYSTEM') => void;
  onDiagnose: (dev: Device) => void;
  onPair: (dev: Device) => void;
  projectMode: boolean;
  reportDeviceIds?:string[];
  onReportMembership?:(device:Device,add:boolean)=>void;
  onRemoveCurrent: (deviceId: string) => Promise<void>;
  onRemoveProject: (deviceId: string) => Promise<void>;
  visibleColumns: TableColumnId[];
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
  projectMode,
  reportDeviceIds=[],
  onReportMembership,
  onRemoveCurrent,
  onRemoveProject,
  visibleColumns,
}) => {
  type EditField = 'name' | 'notes';
  const [editing,setEditing] = useState<{id:string;field:EditField}|null>(null);
  const [draft,setDraft] = useState('');
  const activeEdit = useRef<{id:string;field:EditField;label:string;original:string;value:string}|null>(null);
  const pendingEdits = useRef(new Set<string>());
  const [savingEdits,setSavingEdits] = useState(new Set<string>());
  const [editError,setEditError] = useState('');

  const [openActionMenu, setOpenActionMenu] = useState<{ device: Device; anchor: DOMRect } | null>(null);
  const [removal, setRemoval] = useState<{ device: Device; scope: 'CURRENT' | 'PROJECT' } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [sort, setSort] = useState<DeviceSort | null>(null);
  const sortedDevices = sortDevices(devices, sort);
  const actionDevice = devices.find(device => device.id === openActionMenu?.device.id);
  const sortHeader = (column: DeviceSortColumn, label: React.ReactNode) => <th className="py-3 px-3" aria-sort={sort?.column === column ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-sky-500" onClick={() => setSort(current => nextDeviceSort(current, column))}>{label}<span aria-hidden="true">{sort?.column === column ? sort.direction === 'asc' ? '↑' : '↓' : '↕'}</span></button></th>;

  const saveEdit = () => {
    const edit=activeEdit.current;
    if(!edit)return;
    // Clear synchronously so blur after a keyboard save/cancel cannot submit twice.
    activeEdit.current=null;setEditing(null);
    if(edit.value===edit.original)return;
    const value=edit.field==='name'?edit.value.trim():edit.value;
    if(value===edit.original)return;
    const limit=edit.field==='name'?100:1000,label=edit.field==='name'?'Name':'Notes';
    if(value.length>limit){setEditError(`${label} was not saved. Use ${limit} characters or fewer.`);return;}
    const key=`${edit.id}:${edit.field}`;
    pendingEdits.current.add(key);setSavingEdits(new Set(pendingEdits.current));
    void (async()=>{
      try{await (edit.field==='name'?onUpdateDeviceName:onUpdateDeviceNotes)(edit.id,value);}
      catch{setEditError(`${label} was not saved for ${edit.label}. The last confirmed value is shown. Try again.`);}
      finally{pendingEdits.current.delete(key);setSavingEdits(new Set(pendingEdits.current));}
    })();
  };
  const cancelEdit = () => {activeEdit.current=null;setEditing(null);};
  const changeDraft = (value:string) => {setDraft(value);if(activeEdit.current)activeEdit.current.value=value;};
  const startEdit = (dev:Device,field:EditField,e?:React.MouseEvent) => {
    e?.stopPropagation();
    if(activeEdit.current?.id===dev.id&&activeEdit.current.field===field)return;
    if(pendingEdits.current.has(`${dev.id}:${field}`))return;
    saveEdit();
    const label=dev.technician?.name || dev.anchor.model || dev.anchor.vendor;
    const value=field==='name'?label:dev.technician?.notes||'';
    activeEdit.current={id:dev.id,field,label,original:value,value};
    setEditing({id:dev.id,field});setDraft(value);setEditError('');
  };
  const startEditName = (dev:Device,e?:React.MouseEvent) => startEdit(dev,'name',e);
  const startEditNotes = (dev:Device,e?:React.MouseEvent) => startEdit(dev,'notes',e);

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
  const visible = (column: TableColumnId) => visibleColumns.includes(column);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      {editError&&<p role="alert" className="px-3 py-2 text-sm text-red-700">{editError}</p>}
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
              {visible('NAME')&&sortHeader('NAME', 'Name')}
              {visible('STATUS')&&sortHeader('STATUS', 'Status')}
              {visible('IP')&&sortHeader('IP', 'IP')}
              {visible('LAST_6')&&sortHeader('LAST_6', <span title="MAC (Last 6): Shows the last 6 characters of the device MAC address for quick identification. The full MAC address is shown in Device Details.">MAC <span className="block text-[9px] font-medium normal-case tracking-normal">(Last 6)</span></span>)}
              {visible('CONFIGURED')&&sortHeader('CONFIGURED', <span title="Shows the camera's current configured state. This is separate from Online/Offline status. Technician override may change this value.">Config <Info aria-label="Config column information" className="inline w-3.5 h-3.5"/></span>)}
              {visible('SERIAL')&&sortHeader('SERIAL', 'Serial')}
              {visible('NOTES')&&<th className="py-3 px-3">Notes</th>}
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/60">
            {devices.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length+2} className="py-12 text-center text-slate-500">
                  <span className="block font-medium text-slate-700 dark:text-slate-300">{hasCompletedScan ? 'No devices found.' : 'No devices discovered.'}</span><span className="mt-1 block">{hasCompletedScan ? 'Select Scan to scan again.' : 'Select Scan to begin discovery.'}</span>
                </td>
              </tr>
            ) : (
              sortedDevices.map((dev) => {
                const isSelected = selectedDeviceIds.has(dev.id);
                const isEditingName = editing?.id === dev.id && editing.field === 'name';
                const isEditingNotes = editing?.id === dev.id && editing.field === 'notes';
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
                    {visible('NAME')&&<td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-100">
                      {isEditingName ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={draft}
                            aria-label="Camera Name"
                            maxLength={100}
                            onChange={(e) => changeDraft(e.target.value)}
                            className="bg-slate-950 border border-sky-500 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                            autoFocus
                            onBlur={saveEdit}
                            onKeyDown={(e) => {
                              if(e.nativeEvent.isComposing)return;
                              if(e.key==='Enter'){e.preventDefault();saveEdit();}
                              if(e.key==='Escape'){e.preventDefault();cancelEdit();}
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          onMouseDown={e=>{if(e.button===0){e.preventDefault();startEditName(dev,e);}}}
                          onClick={(e) => startEditName(dev, e)}
                          className="group flex items-center gap-1.5 cursor-pointer hover:text-sky-300 transition"
                          role="button"
                          tabIndex={savingEdits.has(`${dev.id}:name`)?-1:0}
                          aria-disabled={savingEdits.has(`${dev.id}:name`)}
                          aria-label={`Edit name for ${dev.technician?.name || dev.anchor.model || dev.anchor.vendor}`}
                          onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();startEditName(dev);}}}
                          title="Click to rename inline"
                        >
                          <span>{dev.technician?.name || dev.anchor.model || dev.anchor.vendor}</span>{reportDeviceIds.includes(dev.id)&&<span title="Included in Report Set" className="ml-2 rounded bg-blue-50 px-1.5 text-[10px] text-blue-800">In Report</span>}
                          <Edit2 className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition" />
                        </div>
                      )}
                    </td>}

                    {/* Status remains separate from configured state. */}
                    {visible('STATUS')&&<td className="py-2 px-3">{getStatusBadge(dev.status, dev)}</td>}

                    {/* IP opens the existing secure Connect workflow. */}
                    {visible('IP')&&<td className="py-3 px-3 font-mono" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onOpenBrowser(dev, 'SYSTEM')}
                        className="text-sky-400 hover:text-sky-300 font-semibold underline underline-offset-2 flex items-center gap-1"
                        title="Click to connect and open camera web interface"
                      >
                        {dev.network.ipAddress}
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </button>
                    </td>}

                    {visible('LAST_6')&&<td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-300">{lastSix(dev) || 'Unknown'}</td>}
                    {visible('CONFIGURED')&&<td className="py-2 px-3">{configured(dev)===true?<span className="text-emerald-700 dark:text-emerald-400">✓ Yes{dev.configuredState?.manualOverride!==undefined?' · Manual':''}</span>:configured(dev)===false?<span className="text-slate-600 dark:text-slate-400">No{dev.configuredState?.manualOverride!==undefined?' · Manual':''}</span>:<span className="text-slate-500">Unknown</span>}</td>}
                    {visible('SERIAL')&&<td className="py-2 px-3 font-mono text-slate-500">{dev.anchor.serialNumber || 'Unknown'}</td>}

                    {/* 9. Notes (Inline Editable per Section 5) */}
                    {visible('NOTES')&&<td className="py-2 px-3 text-slate-500">
                      {isEditingNotes ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            aria-label="Camera Notes"
                            rows={3}
                            maxLength={1000}
                            value={draft}
                            onChange={(e) => changeDraft(e.target.value)}
                            placeholder="Add technician note..."
                            className="bg-slate-950 border border-sky-500 rounded px-2 py-1 text-xs text-white focus:outline-none w-64 max-w-full"
                            autoFocus
                            onBlur={saveEdit}
                            onKeyDown={(e) => {
                              if(e.nativeEvent.isComposing)return;
                              if(e.key==='Escape'){e.preventDefault();cancelEdit();}
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          onMouseDown={e=>{if(e.button===0){e.preventDefault();startEditNotes(dev,e);}}}
                          onClick={(e) => startEditNotes(dev, e)}
                          className="cursor-pointer hover:text-slate-200 transition text-[11px] truncate max-w-[120px] flex items-center gap-1"
                          role="button"
                          tabIndex={savingEdits.has(`${dev.id}:notes`)?-1:0}
                          aria-disabled={savingEdits.has(`${dev.id}:notes`)}
                          aria-label={`Edit notes for ${dev.technician?.name || dev.anchor.model || dev.anchor.vendor}`}
                          onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();startEditNotes(dev);}}}
                          title="Click to add/edit note"
                        >
                          <StickyNote className="w-3 h-3 shrink-0 text-slate-600" />
                          <span className="truncate">{dev.technician?.notes || <span className="italic text-slate-600">Add note</span>}</span>
                        </div>
                      )}
                    </td>}

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
      {openActionMenu && actionDevice && <FloatingDeviceActionsMenu device={actionDevice} anchor={openActionMenu.anchor} onClose={() => setOpenActionMenu(null)} onOpen={device => onOpenBrowser(device, 'SYSTEM')} inReport={reportDeviceIds.includes(actionDevice.id)} onReportMembership={onReportMembership} onDetails={onInspectDevice} onDuplicateAssistant={onOpenDuplicateAssistant} onDiagnose={onDiagnose} onPair={onPair} onConfigure={onConfigureDevice} projectMode={projectMode} onRemoveCurrent={device => setRemoval({ device, scope: 'CURRENT' })} onRemoveProject={device => setRemoval({ device, scope: 'PROJECT' })}/>}
      {removal && <DeviceRemovalDialog
        device={removal.device}
        scope={removal.scope}
        busy={removing}
        onCancel={() => setRemoval(null)}
        onConfirm={async () => {
          setRemoving(true);
          try {
            await (removal.scope === 'PROJECT' ? onRemoveProject(removal.device.id) : onRemoveCurrent(removal.device.id));
            setRemoval(null);
          } finally { setRemoving(false); }
        }}
      />}
    </div>
  );
};
