import React, {useLayoutEffect, useRef} from 'react';

import {lockModalScroll} from '../modal_scroll_lock.ts';
/** Shared containment only; individual dialogs retain their actions and focus handling. */
export function ModalViewport({className='',children,...props}:React.HTMLAttributes<HTMLDivElement>){
 const overlay=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const release=lockModalScroll();
  const element=overlay.current;
  const wheel=(event:WheelEvent)=>{
   if(event.ctrlKey)return; // Preserve browser zoom gestures.
   let node=event.target instanceof Element?event.target:null;
   while(node&&node!==element){const style=getComputedStyle(node);if((event.deltaY&&/auto|scroll/.test(style.overflowY)&&node.scrollHeight>node.clientHeight)||(event.deltaX&&/auto|scroll/.test(style.overflowX)&&node.scrollWidth>node.clientWidth))return;node=node.parentElement;}
   event.preventDefault();
  };
  element?.addEventListener('wheel',wheel,{passive:false});
  return()=>{element?.removeEventListener('wheel',wheel);release();};
 },[]);
 return <div {...props} ref={overlay} className={`modal-viewport ${className}`}>{children}</div>;
}
