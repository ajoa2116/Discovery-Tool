// Isolated driver only: actual backend routes/listener, synthetic operational providers.
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { WebSocketServer } from 'ws';
import type { Duplex } from 'node:stream';
import { constructBackend, type BackendDependencies } from '../../server/backend_application.ts';
import { createBackendInstanceIdentity } from '../../server/backend_identity_handoff.ts';

type Bridge = { ended: AbortSignal; acquireTLS(): {cert:string;key:string};
  bind(server: object, ws: object, session: object, port: number): Promise<unknown>;
  assert(server: object, ws: object, session: object): void; revoke(): void };
export async function actualBackendTlsFixture(bridge: Bridge, mode: string, evidence: Record<string,unknown>) {
  const material=bridge.acquireTLS();
  let server: ReturnType<typeof createServer> | undefined, ws: WebSocketServer | undefined;
  let exact: [object,object,object] | undefined, reconcile=()=>{};
  const sockets=new Set<Duplex>();
  const signals: AbortSignal[]=[];
  let finishRecovery!: (value:null)=>void, finishCredentials!: ()=>void;
  const recovery=new Promise<null>(resolve=>{finishRecovery=resolve;});
  const credentials=new Promise<void>(resolve=>{finishCredentials=resolve;});
  const monitor=()=>({start(){},stop(){},cancelCurrent(){},getState:()=>({enabled:false,running:false,status:'OFF',intervalMs:30000,maxConcurrency:3}),
    setIntervalMs(){},refreshNow:async()=>{},yieldToTechnician:async()=>{},runNow:async()=>'SKIPPED'});
  const dependencies: BackendDependencies={
    createHttpServer(app) {
      server=createServer({...material,minVersion:'TLSv1.2',maxHeaderSize:4096,handshakeTimeout:1500},app);material.key='';
      evidence.serverCreated=true;
      server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
      const listen=server.listen.bind(server);
      // Ephemeral port is confined to this test module. Production retains 3001.
      server.listen=((port:number,host:string,callback:()=>void)=>{assert.equal(port,3001);assert.equal(host,'127.0.0.1');return listen(0,host,callback);}) as typeof server.listen;
      return server;
    },
    createWebSocketServer(options) {if(mode==='composition-ws-failure') {evidence.wsFailureInjected=true;throw Error('Synthetic WS construction failed.');}return ws=new WebSocketServer(options);},
    createDiagnosticMonitor:()=>monitor() as any,createDiscoveryMonitor:()=>monitor() as any,
    scheduleReconciliation(callback){reconcile=callback;return{cancel(){evidence.reconciliationCancelled=true;}};},
    initializeRecovery(_pair,signal){signals.push(signal);return recovery;},
    initializeCredentials(_vault,signal){signals.push(signal);return credentials;},
    nonAuthorizingBinding:{ended:bridge.ended,revoke:()=>bridge.revoke(),
      async bind(http,events,session,signal){
        assert.equal(session instanceof Object,true);signal.throwIfAborted();
        assert.equal(http,server);assert.equal(events,ws);
        const address=http.address();assert.ok(address&&typeof address!=='string');
        exact=[http,events,session];
        createBackendInstanceIdentity(http); // Process-local listener brand only, never an owner receipt.
        evidence.bindingAttempted=true;
        const pending=bridge.bind(http,events,session,mode==='composition-endpoint-swap'?address.port+1:address.port);
        pending.catch(()=>{});
        if(mode==='composition-bind-cancel')void backend.shutdown();
        await pending;signal.throwIfAborted();bridge.assert(...exact);
      }},
  };
  const backend=constructBackend(dependencies);
  const finishLate=async()=>{finishRecovery(null);finishCredentials();await backend.initialized();
    assert.equal(backend.status().state,'stopped');reconcile();evidence.lateCallbacksExercised=true;
    evidence.stopped=backend.status().state==='stopped';evidence.recoveryInspected=backend.status().recoveryInspected;
    evidence.initializationAborted=signals.every(s=>s.aborted);evidence.connections=sockets.size;};
  try {await backend.start();}
  catch {await backend.shutdown();await finishLate();assert.equal(server?.listening??false,false);assert.ok(signals.every(s=>s.aborted));throw Error('Actual backend fixture unavailable.');}
  assert.equal(backend.status().state,'running');assert.equal(backend.status().recoveryInspected,false);
  return {
    assertLive(){assert.ok(exact);bridge.assert(...exact);},
    substituteForTest(){bridge.assert({}, {}, {});},
    async close(){const closing=backend.shutdown();assert.equal(backend.shutdown(),closing);await closing;await finishLate();
      assert.equal(backend.status().state,'stopped');assert.equal(backend.status().recoveryInspected,false);assert.ok(signals.every(s=>s.aborted));},
    loseListenerForTest:()=>new Promise<void>(resolve=>{server!.close(()=>resolve());server!.closeAllConnections();}),
    loseWsForTest:()=>new Promise<void>(resolve=>ws!.close(()=>resolve())),
    snapshot:()=>({productionAuthority:false,completeClosure:false,listening:server?.listening??false,
      shutdownComplete:backend.status().state==='stopped',connections:sockets.size,pendingClients:ws?.clients.size??0,
      nativeOwnerAuthenticated:backend.status().state==='running'&&!bridge.ended.aborted,
      state:backend.status().state,recoveryInspected:backend.status().recoveryInspected,
      recoveryDiagnostic:backend.recoveryDiagnostic()}),
  };
}
