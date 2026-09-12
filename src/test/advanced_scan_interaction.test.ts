import { strict as assert } from 'node:assert';
import { mock } from 'node:test';
import { requestJson } from '../ui/bounded_request.ts';
import { connectProgress } from '../ui/progress_connection.ts';
let passed=0; const check=(value:unknown,name:string)=>{assert.ok(value,name);console.log(`PASS: ${name}`);passed++};
async function run(){
 const never=(async()=>new Promise(()=>{})) as typeof fetch;
 let aborted=false;
 const hanging=(async(_url,init)=>{init?.signal?.addEventListener('abort',()=>{aborted=true});return new Promise(()=>{})}) as typeof fetch;
 await assert.rejects(requestJson('/test',{},hanging,5),{name:'TimeoutError'});check(aborted,'deadline aborts ignored fetch and settles');
 await assert.rejects(requestJson('/test',{},(async()=>({json:()=>new Promise(()=>{})})) as unknown as typeof fetch,5),{name:'TimeoutError'});check(true,'deadline includes stalled JSON body');
 const controller=new AbortController();const pending=requestJson('/test',{signal:controller.signal},never,1000);controller.abort();await assert.rejects(pending,{name:'AbortError'});check(true,'parent abort settles ignored fetch immediately');
 let calls=0;await assert.rejects(requestJson('/test',{signal:controller.signal},(async()=>{calls++;throw Error()}) as typeof fetch),{name:'AbortError'});check(calls===0,'already cancelled request never starts transport');
 await assert.rejects(requestJson('/test',{},(()=>{throw Error('injected')}) as typeof fetch));check(true,'synchronous transport exception rejects safely');
 await assert.rejects(requestJson('/test',{},(async()=>new Response('{')) as typeof fetch));check(true,'malformed JSON rejects safely');
 const value=await requestJson('/test',{},(async()=>new Response('{"ok":true}')) as typeof fetch);check((value.body as any).ok,'successful JSON returns response/body');
 mock.timers.enable({apis:['setTimeout']});
 try {
  const sockets:any[]=[],states:string[]=[],messages:string[]=[];
  const create=()=>{const socket={readyState:0,closed:0,onopen:null,onmessage:null,onerror:null,onclose:null,close(){this.closed++;this.readyState=3}};sockets.push(socket);return socket as unknown as WebSocket};
  const setup=()=>connectProgress(e=>messages.push(e.data),s=>states.push(s),create);
  let stop=setup();stop();mock.timers.tick(1);check(sockets.length===0,'StrictMode discarded effect never creates socket');
  stop=setup();mock.timers.tick(1);check(sockets.length===1,'live effect owns exactly one socket');
  const oldError=sockets[0].onerror;sockets[0].onerror();oldError();check(sockets[0].closed===1,'duplicate error callback closes socket only once');
  mock.timers.tick(999);check(sockets.length===1,'initial backoff waits one second');mock.timers.tick(1);check(sockets.length===2,'initial failure deterministically reconnects');
  sockets[1].onerror();mock.timers.tick(1999);check(sockets.length===2,'second failure backs off two seconds');mock.timers.tick(1);check(sockets.length===3,'second retry owns new socket');
  sockets[2].readyState=1;sockets[2].onopen();check(states.at(-1)==='CONNECTED','open transitions to connected');
  sockets[2].onmessage({data:'one'});check(messages.join()==='one','current socket delivers event');
  stop();check(sockets[2].closed===1&&sockets[2].onmessage===null,'unmount closes correct socket and detaches handlers');
  mock.timers.tick(60000);check(sockets.length===3,'cleanup leaves no orphan retry/handshake timers');
  stop=setup();mock.timers.tick(1);mock.timers.tick(10000);check(sockets[3].closed===1&&states.at(-1)==='RECONNECTING','stalled handshake is bounded');stop();
  let failures=0;stop=connectProgress(()=>{},()=>{},()=>{failures++;throw Error('construction failure')});mock.timers.tick(1);mock.timers.tick(1000);check(failures===2,'constructor failure is contained and retried');stop();
 }finally{mock.timers.reset()}
 console.log(`Advanced Scan interaction: ${passed} passed, 0 failed, 0 skipped`);
}
run().catch(error=>{console.error(error);process.exitCode=1});
