import net from 'node:net';
import { ReceiveMatrix, MATRIX_STRATEGIES } from '../src/core/readiness/receive_matrix.ts';
import { PowerShellWindowsNetworkAdapterService } from '../src/core/network/windows_adapter_service.ts';
import { NodeOnvifWsDiscoveryTransport } from '../src/core/drivers/ws_discovery_transport.ts';
import { WsDiscoveryEvidence } from '../src/core/drivers/ws_discovery_evidence.ts';
import { readDiscoveryPortOwners } from '../src/core/readiness/udp_port_owners.ts';
// Standalone passive control only. Never sends test fixtures to the network.
const backendRunning=await new Promise<boolean>(resolve=>{const socket=net.connect({host:'127.0.0.1',port:3001});const done=(value:boolean)=>{socket.destroy();resolve(value);};socket.once('connect',()=>done(true));socket.once('error',()=>done(false));socket.setTimeout(500,()=>done(true));});
if(backendRunning){console.log(JSON.stringify({state:'CONFLICTING_PORT_OWNER',reason:'Backend is listening on port 3001. Use its matrix endpoint or stop it before standalone comparison.',owners:await readDiscoveryPortOwners()}));process.exitCode=2;}
else {
 const evidence=new WsDiscoveryEvidence(),adapters=new PowerShellWindowsNetworkAdapterService();
 const matrix=new ReceiveMatrix({busy:()=>false,pause:async()=>{},adapters:()=>adapters.inspectAdapters(),owners:readDiscoveryPortOwners,transport:new NodeOnvifWsDiscoveryTransport(),evidence});
 const id=matrix.start({interfaceIndex:Number(process.argv[2]),localAddress:process.argv[3],durationMs:20000,sendProbe:false,strategies:[...MATRIX_STRATEGIES]});
 const stop=()=>matrix.stop(id);process.once('SIGINT',stop);
 while(matrix.isActive())await new Promise(r=>setTimeout(r,250));
 process.off('SIGINT',stop);console.log(JSON.stringify({matrix:matrix.snapshot(),wsDiscoveryTransport:evidence.snapshot()},null,2));
 if(matrix.snapshot().state!=='COMPLETED')process.exitCode=1;
}
