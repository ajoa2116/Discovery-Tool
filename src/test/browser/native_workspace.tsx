import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CameraBrowserWorkspace } from '../../ui/components/CameraBrowserWorkspace.tsx';
import { Device } from '../../types/index.ts';
import '../../ui/index.css';
function Harness() {
  const [open, setOpen] = useState(false);
  const device = (window as any).__nativeFixture as Device;
  return <><button onClick={() => setOpen(true)}>Open fixture</button>{open && <CameraBrowserWorkspace device={device} devices={[device]} collisions={[]} onClose={() => setOpen(false)} onInspect={() => setOpen(false)} onConfigure={() => setOpen(false)} onDuplicate={() => {}} />}</>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
