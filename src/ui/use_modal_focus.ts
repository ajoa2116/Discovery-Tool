import {lockModalScroll} from './modal_scroll_lock.ts';
import { RefObject, useEffect, useRef } from 'react';

/** Portal siblings are inert; focus and wheel stay inside the visible dialog. */
export function useModalFocus(open: boolean, busy: boolean, dialog: RefObject<HTMLElement>, onClose: () => void) {
  const latest = useRef({ busy, onClose }); latest.current = { busy, onClose };
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const previous = document.activeElement as HTMLElement | null;
    const overlay = element.parentElement;
    const siblings = Array.from(document.body.children).filter(node => node !== overlay && node instanceof HTMLElement) as HTMLElement[];
    const inert = siblings.map(node => node.inert);
    siblings.forEach(node => { node.inert = true; });
    const releaseScroll = lockModalScroll();
    const controls = () => Array.from(element.querySelectorAll<HTMLElement>('button,input,select,textarea,[tabindex]')).filter(node => !node.matches(':disabled') && node.tabIndex >= 0 && node.getClientRects().length > 0);
    const focus = () => (controls()[0] || element).focus();
    focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!latest.current.busy) latest.current.onClose(); }
      if (event.key !== 'Tab') return;
      const items = controls(), first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); element.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first.focus(); }
    };
    const focusin = (event: FocusEvent) => { if (!element.contains(event.target as Node)) focus(); };
    document.addEventListener('keydown', keydown, true); document.addEventListener('focusin', focusin);
    return () => {
      document.removeEventListener('keydown', keydown, true); document.removeEventListener('focusin', focusin);
      siblings.forEach((node, index) => { node.inert = inert[index]; });
      releaseScroll();
      if (previous?.isConnected) previous.focus();
    };
  }, [open, dialog]);
}
