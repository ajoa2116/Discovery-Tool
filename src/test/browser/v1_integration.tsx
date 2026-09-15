import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BulkReIpModal} from '../../ui/components/BulkReIpModal.tsx';
import {ProjectHistoryList} from '../../ui/components/ProjectHistory.tsx';
import {BrowserModal} from '../../ui/components/BrowserModal.tsx';
import {Device} from '../../types/index.ts';
import '../../ui/index.css';
const device=(id:string):Device=>({id,anchor:{vendor:'Unknown',macAddress:null,model:id},network:{ipAddress:'192.0.2.10',subnetMask:null,port:80,protocol:'ONVIF'},status:'UNKNOWN',firstSeenAt:'now',lastSeenAt:'now',discoveredPhase:3});
function Harness(){const [id,setId]=useState('old'),[open,setOpen]=useState(true);return location.search.includes('bulk')?<BulkReIpModal isOpen={open} onClose={()=>setOpen(false)} selectedDevices={[device('a'),device('b')]} onProjectChanged={async()=>{}}/>:location.search.includes('history')?<ProjectHistoryList/>:<><button style={{position:"fixed",zIndex:100,top:0}} onClick={()=>setId('new')}>Switch device</button><BrowserModal isOpen={open} device={device(id)} onClose={()=>setOpen(false)}/></>}
createRoot(document.getElementById('root')!).render(<Harness/>);
