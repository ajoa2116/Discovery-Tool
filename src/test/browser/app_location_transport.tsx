import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../../ui/App.tsx';

const root=createRoot(document.getElementById('root')!);
(window as any).__appTransport.unmount=()=>root.unmount();
root.render(<React.StrictMode><App/></React.StrictMode>);
