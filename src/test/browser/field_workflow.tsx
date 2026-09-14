import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserModal} from '../../ui/components/BrowserModal.tsx';
import {Device} from '../../types/index.ts';
import '../../ui/index.css';
function Harness(){const [model,setModel]=useState('2120');const device:Device={id:model,anchor:{macAddress:null,vendor:model==='2120'?'Axis':'Unknown',model},network:{ipAddress:'192.0.2.1',subnetMask:null,protocol:'ONVIF',port:80},status:'UNKNOWN',discoveredPhase:3,firstSeenAt:'now',lastSeenAt:'now'};return <><button onClick={()=>setModel('QND-7082R')}>Use Hanwha fixture</button><BrowserModal isOpen device={device} onClose={()=>setModel('QND-7082R')}/></>};createRoot(document.getElementById('root')!).render(<Harness/>);
