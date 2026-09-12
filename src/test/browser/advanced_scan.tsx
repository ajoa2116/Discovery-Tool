import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdvancedScanModal } from '../../ui/components/AdvancedScanModal.tsx';
import '../../ui/index.css';
import App from '../../ui/App.tsx';
function Harness() {
 const [open,setOpen]=useState(false);
 return <><button onClick={()=>setOpen(true)}>Open Advanced Scan</button><button id="background" onClick={()=>{document.body.dataset.backgroundClicked='true'}}>Background action</button><AdvancedScanModal open={open} onClose={()=>setOpen(false)} onStarted={()=>{document.body.dataset.started='true'}}/></>;
}
const root = createRoot(document.getElementById('root')!);
document.addEventListener('unmount-test', () => root.unmount(), { once: true });
root.render(<React.StrictMode>{location.search.includes('app') ? <App/> : <Harness/>}</React.StrictMode>);
