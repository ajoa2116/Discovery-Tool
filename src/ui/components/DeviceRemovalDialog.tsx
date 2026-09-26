import {ModalViewport} from './ModalViewport.tsx';
import {hasIdentity} from '../../shared/identity_policy.ts';
import React from 'react';
import { createPortal } from 'react-dom';
import { Device } from '../../types/index.ts';

interface Props { device: Device; scope: 'CURRENT' | 'PROJECT'; busy: boolean; onCancel: () => void; onConfirm: () => void }
export const DeviceRemovalDialog: React.FC<Props> = ({ device, scope, busy, onCancel, onConfirm }) => createPortal(
  <ModalViewport className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 p-4" role="presentation">
    <div role="alertdialog" aria-modal="true" aria-labelledby="remove-device-title" aria-describedby="remove-device-description" className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      <h2 id="remove-device-title" className="font-bold">{scope === 'PROJECT' ? 'Remove this device from the Project?' : 'Remove this device from the current list?'}</h2>
      <div className="modal-body"><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{scope === 'PROJECT' ? 'This removes the saved device from this Project.' : hasIdentity(device)?'Hide from Current List for this backend session. Project and Report Set membership stay unchanged. Choose Rediscover manually removed cameras to allow it to return.':'Hide this row only. Its identity is too weak for session suppression, so discovery may show it again. Project and Report Set membership stay unchanged.'}</p>
      <p id="remove-device-description" className="mt-1 text-sm text-slate-600 dark:text-slate-300">This does not change or delete the physical device.</p>
      <p className="mt-3 truncate font-mono text-xs text-slate-500">{device.id}</p>
      </div><div className="mt-5 flex justify-end gap-2"><button disabled={busy} onClick={onCancel} className="rounded border px-4 py-2 text-sm">Cancel</button><button disabled={busy} onClick={onConfirm} className="rounded bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-600 disabled:opacity-50">{scope === 'PROJECT' ? 'Remove from Project' : 'Remove Device'}</button></div>
    </div>
  </ModalViewport>, document.body,
);
