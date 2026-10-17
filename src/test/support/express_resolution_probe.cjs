// Library-only cold-process fixture. No backend entrypoint or socket is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {registerHooks,syncBuiltinESMExports}=require('node:module');
const {fileURLToPath}=require('node:url');
const [configPath,mode]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configPath,'utf8'));
const root=fs.realpathSync(__dirname),{buildPackageAdmission,installPackageAdmissionHooks}=require(path.join(path.dirname(configPath),'review.cjs'));
assert.equal(root,config.stage);assert.ok(['core','computed','missing','unexpected'].includes(mode));
assert.equal(process.permission.has('fs.write'),false);assert.equal(process.permission.has('child'),false);
assert.equal(process.permission.has('addons'),false);assert.equal(process.permission.has('worker'),false);
for(const key of ['NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH','DEBUG','DEBUG_MIME'])assert.equal(process.env[key],undefined);
const resolutions=[],loads=[],checks=[],violations=[],phases=[],behavior={};let phase='import',terminal=false;
const fail=reason=>{terminal=true;violations.push({phase,reason});throw Object.assign(Error(reason),{code:'EXPRESS_FIXTURE_DENIED',reason});};
const block=(object,keys)=>{for(const key of keys)object[key]=()=>fail('operation:'+key);};
block(require('node:child_process'),['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']);
const net=require('node:net');block(net,['connect','createConnection','createServer']);block(net.Socket.prototype,['connect']);block(net.Server.prototype,['listen']);
for(const name of ['http','https'])block(require('node:'+name),['createServer','request','get']);
block(require('node:tls'),['connect','createServer']);block(require('node:dgram'),['createSocket']);
block(require('node:os'),['networkInterfaces']);
block(require('node:timers'),['setTimeout','setInterval','setImmediate']);
block(require('node:timers/promises'),['setTimeout','setInterval','setImmediate']);
block(globalThis,['setTimeout','setInterval','setImmediate','fetch','WebSocket','EventSource']);syncBuiltinESMExports();
const files=new Map(config.files.map(f=>[f.path,f]));assert.equal(files.size,config.files.length);
const allowed=new Set(config.reviews.map(r=>r.path)),measured=new Set();
const nameOf=full=>path.relative(root,full).split(path.sep).join('/');
function selected(url){
  const full=fileURLToPath(url),name=nameOf(full),expected=files.get(name);
  if(!allowed.has(name)||!expected)fail('unselected-file:'+name);
  if(fs.realpathSync(full)!==full||fs.lstatSync(full).isSymbolicLink())fail('namespace:'+name);
  const fd=fs.openSync(full,'r');try{
    const before=fs.fstatSync(fd,{bigint:true}),bytes=fs.readFileSync(fd),after=fs.fstatSync(fd,{bigint:true});
    for(const stat of [before,after])if(stat.nlink!==1n||!['dev','ino','size','mtimeNs','ctimeNs'].every(k=>String(stat[k])===expected.identity[k]))fail('identity:'+name);
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==expected.sha256)fail('digest:'+name);
  }finally{fs.closeSync(fd);}measured.add(name);return name;
}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'stage-manifest.json'),'utf8'));
const admission=buildPackageAdmission(manifest,config.reviews);assert.equal(admission.admitted.length,allowed.size);
registerHooks({
  resolve(specifier,context,next){
    if(terminal)fail('terminal-denial');
    const parent=context.parentURL?.startsWith('file:')?nameOf(fileURLToPath(context.parentURL)):null;
    const dynamic=parent==='node_modules/express/lib/view.js'&&!config.edges.some(e=>e.source===parent&&e.specifier===specifier);
    if(dynamic){
      resolutions.push({phase,parent,specifier,computed:true});
      if(specifier==='fixture-missing-engine'&&mode==='missing'){
        assert.equal(fs.existsSync(path.join(root,'node_modules/fixture-missing-engine/index.js')),false);
        fail('missing-dependency'); // Exact fixture preflight; no ambient ancestor search.
      }
      if(specifier!=='fixture-view-engine')fail('unexpected-computed-import');
    }
    let result;try{result=next(specifier,context);}catch(error){fail('resolution:'+error.code);}
    if(result.url.startsWith('node:')){
      if(parent?.startsWith('node_modules/')&&!config.builtins.includes(result.url))fail('unexpected-builtin:'+result.url);
    }else{
      const target=selected(result.url);
      if(parent?.startsWith('node_modules/')&&!dynamic&&!config.edges.some(e=>e.source===parent&&e.specifier===specifier&&e.resolvedPath===target))fail('unexpected-edge:'+parent+':'+specifier);
      if(dynamic&&target!=='node_modules/fixture-view-engine/index.js')fail('computed-target');
    }
    resolutions.push({phase,parent,specifier,url:result.url});return result;
  },
  load(url,context,next){if(terminal)fail('terminal-denial');if(!url.startsWith('node:'))loads.push({phase,path:selected(url)});return next(url,context);},
});
installPackageAdmissionHooks(root,admission);
const cache=()=>Object.keys(require.cache).filter(p=>p.startsWith(path.join(root,'node_modules')+path.sep)).map(nameOf).sort();
const check=(name,run)=>{run();checks.push(name);};
let failure=()=>({mode,phase,violations,resolutions,loads,checks,cache:cache()});
try{
  assert.deepEqual(cache(),[]);
  const express=require('express');phases.push({phase,cache:cache()});
  check('repeat require identity',()=>assert.equal(require('express'),express));
  const app=express();
  phase=mode;
  if(mode==='core'){
    check('app construction without startup',()=>{
      behavior.app={callable:typeof app==='function',environment:app.get('env'),defaultViewEngine:app.get('view engine')??null};
      assert.deepEqual(behavior.app,{callable:true,environment:'production',defaultViewEngine:null});
    });
    check('middleware initialization',()=>{
      for(const type of ['json','raw','text','urlencoded'])assert.equal(typeof express[type](type==='urlencoded'?{extended:false}:{}),'function');
      assert.equal(typeof express.static(path.join(root,'views')),'function');
      let next=0;express.json()({headers:{},method:'POST'},{},()=>next++);assert.equal(next,1);
      behavior.middleware={parsers:['json','raw','text','urlencoded'],staticFunction:true,emptyJsonNext:next};
    });
    check('middleware ordering without exhaustion',()=>{
      const router=express.Router(),order=[];
      router.use((req,res,next)=>{order.push('first');next();});router.use((req,res,next)=>{order.push('second');next();});
      router.get('/ordered/:id',req=>{order.push('handler:'+req.params.id);});
      router.handle({method:'GET',url:'/ordered/23',headers:{}},{},()=>assert.fail('Unexpected exhaustion'));
      assert.deepEqual(order,['first','second','handler:23']);behavior.ordering=order;
    });
    check('route and error dispatch without router exhaustion',()=>{
      const router=express.Router(),errorOrder=[];let value,error;
      router.get('/item/:id',(req,res)=>{value=req.params.id;});
      router.get('/failure',()=>{errorOrder.push('throw');throw Error('fixture-error');});
      router.use((err,req,res,next)=>{errorOrder.push('error-handler');error=err.message;});
      const done=()=>assert.fail('Unexpected router exhaustion/scheduling');
      router.handle({method:'GET',url:'/item/17',headers:{}},{},done);assert.equal(value,'17');
      router.handle({method:'GET',url:'/failure',headers:{}},{},done);assert.equal(error,'fixture-error');
      behavior.route={parameter:value};behavior.error={message:error,order:errorOrder};
    });
    check('request negotiation',()=>{const accepted=express.request.accepts.call({headers:{accept:'application/json'}},['json','html']);assert.equal(accepted,'json');behavior.request={accepted};});
    check('response JSON formatting',()=>{
      let output;const headers={};const res={app,get:n=>headers[n],set:(n,v)=>{headers[n]=v;},send:value=>{output=value;}};
      express.response.json.call(res,{ok:true});assert.equal(output,'{"ok":true}');assert.equal(headers['Content-Type'],'application/json');
      behavior.response={body:output,contentType:headers['Content-Type']};
    });
    check('view engine is not loaded by backend-style controls',()=>assert.ok(!cache().includes('node_modules/fixture-view-engine/index.js')));
    behavior.backendStyleEngineLoaded=false;
  }else if(mode==='computed'){
    const View=require('express/lib/view'),engines={};const opts={root:path.join(root,'views'),engines};
    const first=new View('hello.fixture-view-engine',opts);let output;
    first.render({value:'safe'},(err,value)=>{assert.ifError(err);output=value;});assert.equal(output,'fixture:safe');
    const engine=engines['.fixture-view-engine'],before=resolutions.filter(r=>r.computed).length;
    const second=new View('hello.fixture-view-engine',opts);assert.equal(second.engine,engine);
    assert.equal(resolutions.filter(r=>r.computed).length,before);checks.push('computed engine positive and engine-cache identity');
    Object.assign(behavior,{rendered:output,engineIdentityReused:second.engine===engine,computedRequests:before,engineTarget:'node_modules/fixture-view-engine/index.js'});
  }else{
    const engine=mode==='missing'?'fixture-missing-engine':'fixture-unreviewed-engine';let error;
    // In 4.22.2 View-construction errors escape before the rendering callback.
    // Catching them in the fixture must not clear the independent denial ledger.
    let callbacks=0;
    try{app.render('hello.'+engine,{},()=>callbacks++);}catch(caught){error=caught;}
    assert.equal(callbacks,0);
    assert.equal(error?.code,'EXPRESS_FIXTURE_DENIED');
    assert.deepEqual(violations.map(v=>v.reason),[mode==='missing'?'missing-dependency':'unexpected-computed-import']);
    assert.throws(()=>require.resolve('express'),e=>e.code==='EXPRESS_FIXTURE_DENIED'&&e.reason==='terminal-denial');
    assert.ok(!cache().some(p=>p.includes('fixture-unreviewed-engine')));checks.push('caught construction error retains denial and terminal rejection');
    Object.assign(behavior,{reason:violations[0].reason,terminalReason:violations[1].reason,callbacks,unreviewedEngineLoaded:false});
  }
  if(['core','computed'].includes(mode))assert.deepEqual(violations,[]);
  phases.push({phase,cache:cache()});
  console.log(JSON.stringify({passed:true,productionAuthority:false,completeClosure:false,mode,checks,behavior,phases,resolutions,loads,measured:[...measured].sort(),violations,admitted:admission.admitted.length}));
}catch(error){console.error(JSON.stringify({...failure(),error:{message:error.message,code:error.code,stack:error.stack}}));process.exitCode=1;}
