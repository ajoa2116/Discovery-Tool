// Read-only probe of an already-running local application; never owns a backend process.
const WebSocket = require('ws');
function validDiscovery(value) {
  const f = value?.foreground, s = f?.session;
  return typeof value?.running === 'boolean' && typeof f?.epoch === 'string' && f.epoch.length > 0 &&
    Number.isInteger(f.revision) && f.revision >= 0 && (s === null || (s && typeof s.sessionId === 'string' &&
    ['MANUAL', 'ADVANCED'].includes(s.origin) && ['PREPARING', 'SCANNING', 'STOPPING', 'COMPLETED', 'CANCELLED', 'FAILED'].includes(s.state)));
}
async function smoke({baseUrl='http://localhost:3001',timeoutMs=5000}={}) {
  const base=new URL(baseUrl);
  if(base.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(base.hostname)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('Use an HTTP loopback origin, normally http://localhost:3001.');
  if(!Number.isInteger(timeoutMs)||timeoutMs<10||timeoutMs>60000)throw Error('Timeout must be 10 through 60000 milliseconds.');
  const checks=[];
  for(const [path,label,validate] of [['/','Production HTTP',null],['/api/discovery/status','Discovery API',validDiscovery]]) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const response=await fetch(new URL(path,base),{signal:controller.signal,redirect:'error'});
      if(!response.ok)throw Error();
      const reader=response.body.getReader();let size=0,chunks=[];
      while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1024*1024){await reader.cancel();throw Error();}chunks.push(Buffer.from(part.value));}
      const text=Buffer.concat(chunks).toString('utf8');
      if(validate?!validate(JSON.parse(text)):!text.includes('id="root"'))throw Error();
      checks.push(label+' PASS');
    }catch{throw Error(label+' failed or timed out. Start the production build, check port 3001 and retry.');}
    finally{clearTimeout(timer);}
  }
  await new Promise((resolve,reject)=>{
    const url=new URL('/ws',base);url.protocol='ws:';
    const socket=new WebSocket(url),timer=setTimeout(()=>finish(Error('WebSocket open/close timed out. Check /ws on the running backend.')),timeoutMs);
    let opened=false,finished=false;
    function finish(error){if(finished)return;finished=true;clearTimeout(timer);if(socket.readyState!==WebSocket.CLOSED)socket.terminate();error?reject(error):resolve();}
    socket.once('open',()=>{opened=true;socket.close(1000,'production smoke');});
    socket.once('close',code=>finish(opened&&code===1000?undefined:Error('WebSocket did not open and close cleanly. Check the running backend.')));
    socket.on('error',()=>finish(Error('WebSocket connection failed. Check /ws and port 3001.')));
  });
  checks.push('WebSocket open and clean close PASS');return checks;
}
module.exports={smoke,validDiscovery};
if(require.main===module)smoke({baseUrl:process.argv[2]||'http://localhost:3001'}).then(checks=>{checks.forEach(check=>console.log(check));console.log('PRODUCTION SMOKE PASS');}).catch(error=>{console.error('PRODUCTION SMOKE FAIL: '+error.message);process.exitCode=1;});
