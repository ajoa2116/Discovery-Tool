import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserModal} from '../../ui/components/BrowserModal.tsx';
import {Device} from '../../types/index.ts';
import '../../ui/index.css';
const query=new URLSearchParams(location.search);
const device:Device={id:'guidance-fixture',anchor:{macAddress:null,vendor:query.get('vendor')||'Unknown',model:query.get('model')||'Unknown',firmwareVersion:query.get('firmware')||undefined},network:{ipAddress:'192.0.2.1',subnetMask:null,port:80,protocol:'ONVIF'},status:'UNKNOWN',discoveredPhase:3,firstSeenAt:'now',lastSeenAt:'now'};
(window as any).__guidanceDevice=device;
createRoot(document.getElementById('root')!).render(<BrowserModal isOpen device={device} onClose={()=>{}}/>);
