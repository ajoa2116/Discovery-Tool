import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Edit2, Globe, Network, Shield, StickyNote, Video } from 'lucide-react';
import { Device } from '../../types/index.ts';

export interface OverlayPosition { left: number; top: number; opensUpward: boolean }
export function positionFloatingMenu(anchor: DOMRect | Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>, menuWidth: number, menuHeight: number, viewportWidth: number, viewportHeight: number, margin = 8): OverlayPosition {
  const left = Math.max(margin, Math.min(anchor.right - menuWidth, viewportWidth - menuWidth - margin));
  const opensUpward = anchor.bottom + 4 + menuHeight > viewportHeight - margin && anchor.top - 4 - menuHeight >= margin;
  const desiredTop = opensUpward ? anchor.top - menuHeight - 4 : anchor.bottom + 4;
  const top = Math.max(margin, Math.min(desiredTop, viewportHeight - menuHeight - margin));
  return { left, top, opensUpward };
}

interface Props {
  device: Device;
  anchor: DOMRect;
  onClose: () => void;
  onOpen: (device: Device) => void;
  onDetails: (device: Device) => void;
  onDiagnose: (device: Device) => void;
  onPair: (device: Device) => void;
  onRename: (device: Device) => void;
  onNotes: (device: Device) => void;
  onConfigure: (device: Device) => void;
}

export const FloatingDeviceActionsMenu: React.FC<Props> = ({ device, anchor, onClose, onOpen, onDetails, onDiagnose, onPair, onRename, onNotes, onConfigure }) => {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<OverlayPosition>(() => positionFloatingMenu(anchor, 192, 260, window.innerWidth, window.innerHeight));
  useLayoutEffect(() => {
    const rect = menu.current?.getBoundingClientRect();
    if (rect) setPosition(positionFloatingMenu(anchor, rect.width, rect.height, window.innerWidth, window.innerHeight));
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [anchor]);
  useEffect(() => {
    const outside = (event: MouseEvent) => { if (!menu.current?.contains(event.target as Node)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const invalidate = () => onClose();
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', invalidate);
    window.addEventListener('scroll', invalidate, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('scroll', invalidate, true);
    };
  }, [onClose]);
  const action = (callback: (value: Device) => void) => () => { callback(device); onClose(); };
  const button = 'w-full rounded px-2.5 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2';
  return createPortal(<div ref={menu} role="menu" aria-label={`Actions for ${device.technician?.name || device.anchor.vendor}`} data-opens-upward={position.opensUpward} className="fixed z-[100] w-48 space-y-1 rounded-xl border border-slate-700 bg-slate-950 p-1.5 text-left text-xs shadow-2xl" style={{ left: position.left, top: position.top }}>
    <button role="menuitem" onClick={action(onOpen)} className={button}><Globe className="h-3.5 w-3.5 text-sky-400"/>Open</button>
    <button role="menuitem" onClick={action(onDetails)} className={button}><Video className="h-3.5 w-3.5 text-blue-400"/>Details</button>
    <button role="menuitem" onClick={action(onDiagnose)} className={button}><Activity className="h-3.5 w-3.5 text-emerald-400"/>Diagnose</button>
    {device.status === 'DIFFERENT_SUBNET' && <button role="menuitem" onClick={action(onPair)} className={button}><Network className="h-3.5 w-3.5 text-purple-400"/>Pair PC to Camera Network</button>}
    <div className="my-1 border-t border-slate-800"/>
    <button role="menuitem" onClick={action(onRename)} className={button}><Edit2 className="h-3.5 w-3.5 text-slate-400"/>Rename Device</button>
    <button role="menuitem" onClick={action(onNotes)} className={button}><StickyNote className="h-3.5 w-3.5 text-slate-400"/>Edit Notes</button>
    <div className="my-1 border-t border-slate-800"/>
    <button role="menuitem" onClick={action(onConfigure)} className={button}><Shield className="h-3.5 w-3.5 text-purple-400"/>Device Configuration</button>
  </div>, document.body);
};
