import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {NetworkConfigModal} from '../../ui/components/NetworkConfigModal.tsx';
import {PairNetworkModal} from '../../ui/components/PairNetworkModal.tsx';
import {BrowserModal} from '../../ui/components/BrowserModal.tsx';
import {LegacyOnboardModal} from '../../ui/components/LegacyOnboardModal.tsx';
import {NetworkAdapterModal} from '../../ui/components/NetworkAdapterModal.tsx';
import {AddToExistingProjectModal} from '../../ui/components/AddToExistingProjectModal.tsx';
import {ModalViewport} from '../../ui/components/ModalViewport.tsx';
import '../../ui/index.css';
const device:any={id:'fixture',anchor:{macAddress:'00:50:f9:63:fb:0f',vendor:'Axis',model:'Fixture'},network:{ipAddress:'192.0.2.1',port:80,protocol:'ONVIF'},status:'UNKNOWN',discoveredPhase:3,firstSeenAt:'now',lastSeenAt:'now'};
function Harness(){const[kind,setKind]=useState(''),[nested,setNested]=useState(false);const close=()=>setKind('');return <><div style={{height:1800}}>{['Configuration','Pair','Credentials','Manual','Adapter','Project','Short'].map(k=><button key={k} onClick={()=>setKind(k)}>{k}</button>)}<p>Background</p></div>
{kind==='Configuration'&&<NetworkConfigModal isOpen device={device} onClose={close}/>}
{kind==='Pair'&&<PairNetworkModal isOpen device={device} pair={null} onClose={close} onPairUpdated={()=>{}}/>}
{kind==='Credentials'&&<BrowserModal isOpen device={device} onClose={close}/>}
{kind==='Manual'&&<LegacyOnboardModal isOpen onClose={close} onSubmit={async()=>{}}/>}
{kind==='Adapter'&&<NetworkAdapterModal open pair={null} onClose={close} onUpdated={()=>{}}/>}
{kind==='Project'&&<AddToExistingProjectModal preview={{projectName:'Fixture',items:Array.from({length:40},(_,i)=>({deviceId:String(i),name:'Camera '+i,outcome:'NEW_TO_PROJECT',message:'Safe fixture',ipAddress:'192.0.2.1'}))} as any} filename="fixture.cctvproj" onCancel={close} onConfirm={async()=>{}}/>}
{kind==='Short'&&<ModalViewport className="fixed inset-0 flex items-center justify-center p-4"><div className="w-80 rounded bg-white"><header>Short title</header><div className="modal-body p-3">Short content<button onClick={()=>setNested(true)}>Nested</button></div><footer><button onClick={close}>Close short</button></footer></div></ModalViewport>}
{nested&&<ModalViewport className="fixed inset-0 flex items-center justify-center p-4"><div className="bg-white p-4"><header>Nested title</header><div className="modal-body">Nested content</div><button onClick={()=>setNested(false)}>Close nested</button></div></ModalViewport>}
</>};createRoot(document.getElementById('root')!).render(<React.StrictMode><Harness/></React.StrictMode>);
