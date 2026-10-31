// Fixture-only real App interactions. No backend, camera or native transport.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const ts=require('typescript');
const nameOwnerOnly=process.argv[2]==='--open-name-owner-only';
const reverifyRefreshOnly=process.argv[2]==='--reverify-refresh-only';
const reverifyOwnerOnly=process.argv[2]==='--reverify-owner-only';
const replacementOwnerOnly=process.argv[2]==='--replacement-owner-only';
const cancelAckOnly=process.argv[2]==='--cancel-ack-only';
assert.deepEqual(process.argv.slice(2),nameOwnerOnly?['--open-name-owner-only']:reverifyRefreshOnly?['--reverify-refresh-only']:reverifyOwnerOnly?['--reverify-owner-only']:replacementOwnerOnly?['--replacement-owner-only']:cancelAckOnly?['--cancel-ack-only']:[],'Unsupported fixture selector');
const repo=path.resolve(__dirname,'../../..'),entry='/src/test/browser/app_location_transport.html';


const results=[],boundary=[],contexts=[],sourcePaths=new Set(['/src/ui/index.css']);let vite,server,browser,root,origin,port,closed=false,removedFiles=0;
function checked(p){assert.equal(fs.realpathSync(p),p);for(let q=p;;q=path.dirname(q)){assert.equal(fs.lstatSync(q).isSymbolicLink(),false);if(path.dirname(q)===q)break;}}
function sourceGraph(file){
 const relative=path.relative(repo,file).replaceAll('\\','/');assert.match(relative,/^src\/(test\/browser\/app_location_(transport\.tsx|progress\.ts)|ui\/|shared\/|types\/)/);
 const url='/'+relative;if(sourcePaths.has(url))return;sourcePaths.add(url);checked(file);
 const tree=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 assert.equal(tree.parseDiagnostics.length,0);
 for(const node of tree.statements){if(!(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))||!node.moduleSpecifier)continue;
  const spec=node.moduleSpecifier.text;if(!spec.startsWith('.')){assert.ok(['react','react-dom','react-dom/client','react/jsx-runtime','lucide-react'].includes(spec),'Unreviewed bare frontend import: '+spec);continue;}
  sourceGraph(path.resolve(path.dirname(file),spec));
 }
}
function allowed(raw,method='GET'){
 const u=new URL(raw,origin);if(u.origin!==origin||method!=='GET')return false;
 const p=decodeURIComponent(u.pathname);
 if(p.includes('..')||p.includes('\\'))return false;
 return p===entry||sourcePaths.has(p)||p.startsWith('/@fs/'+root.replaceAll('\\','/')+'/vite-cache/');
}
async function setup(){
 assert.equal(process.platform,'win32');assert.equal(require('playwright-core/package.json').version,'1.56.1');
 const parent=fs.realpathSync(os.tmpdir());checked(parent);root=fs.mkdtempSync(path.join(parent,'discovery-app-location-'));checked(root);
 sourceGraph(path.join(repo,'src/test/browser/app_location_transport.tsx'));
 sourceGraph(path.join(repo,'src/test/browser/app_location_progress.ts'));
 sourcePaths.delete('/src/ui/progress_connection.ts');
 const {createServer}=await import('vite');
 vite=await createServer({configFile:false,envFile:false,plugins:[{name:'exact-inert-app-progress',enforce:'pre',resolveId(spec,importer){if(spec==='./progress_connection.ts'&&importer?.replaceAll('\\','/')===path.join(repo,'src/ui/App.tsx').replaceAll('\\','/'))return path.join(repo,'src/test/browser/app_location_progress.ts');}}],root:repo,cacheDir:path.join(root,'vite-cache'),logLevel:'error',
   optimizeDeps:{noDiscovery:true,include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','lucide-react']},
   server:{middlewareMode:true,hmr:false,ws:false,proxy:undefined,fs:{strict:true,allow:[repo,path.join(root,'vite-cache')]},watch:{ignored:['**/native/**','**/.git/**']}}});
 server=http.createServer((req,res)=>{
   if(!allowed('http://'+req.headers.host+req.url,req.method)){boundary.push('listener-denied:'+req.method+':'+req.url);res.writeHead(403);res.end();return;}
   if(new URL(req.url,origin).pathname===entry){res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(path.join(repo,entry)));}
   else vite.middlewares(req,res,()=>{boundary.push('unhandled-static:'+req.url);res.writeHead(404);res.end();});
 });
 server.on('upgrade',(_req,socket)=>{boundary.push('listener-websocket-denied');socket.destroy();});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const address=server.address();assert.equal(address.address,'127.0.0.1');port=address.port;origin='http://127.0.0.1:'+port;
 const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';assert.ok(fs.existsSync(edge));
 // Playwright's Node-side profile/artifact allocation must also use this owned root.
 const previousTemp=process.env.TEMP,previousTmp=process.env.TMP;
 try{process.env.TEMP=root;process.env.TMP=root;
   browser=await chromium.launch({executablePath:edge,headless:true,downloadsPath:path.join(root,'downloads'),
     env:{...process.env,TEMP:root,TMP:root},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 }finally{if(previousTemp===undefined)delete process.env.TEMP;else process.env.TEMP=previousTemp;if(previousTmp===undefined)delete process.env.TMP;else process.env.TMP=previousTmp;}
 console.log(JSON.stringify({fixtureRoot:root,listener:origin,driver:'playwright-core@1.56.1',browser:browser.version(),hmr:false,proxy:false}));
}

async function cleanup(){
 const failures=[];const attempt=async run=>{try{await run();}catch(e){failures.push(e);}};
 if(browser){for(const c of browser.contexts())await attempt(()=>c.close());await attempt(async()=>{await browser.close();assert.equal(browser.isConnected(),false);});}
 if(vite)await attempt(()=>vite.close());
 if(server)await attempt(async()=>{server.closeAllConnections();if(server.listening)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));assert.equal(server.listening,false);assert.equal(server.address(),null);});
 if(failures.length)throw new AggregateError(failures,'Owned cleanup inconclusive');
 if(root){checked(root);assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir()));
   const count=p=>{for(const e of fs.readdirSync(p,{withFileTypes:true})){const full=path.join(p,e.name);checked(full);if(e.isDirectory())count(full);else removedFiles++;}};count(root);
   fs.rmSync(root,{recursive:true});assert.equal(fs.existsSync(root),false);}
 closed=true;
}

const installFixture=require('./app_location_transport_fixture.cjs');
const summaries=[];
const pause=p=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const button=(p,name)=>p.getByRole('button',{name,exact:true});
const region=p=>p.getByRole('region',{name:'Local Camera Location'});
const confirmed=async p=>(await region(p).locator('p').first().textContent()).trim();
async function inspect(p,name='Camera A'){
 const row=p.locator('tbody tr').filter({has:p.getByRole('button',{name:'Edit name for '+name,exact:true})});
 await row.locator('td').nth(2).click();await button(p,'Edit Camera Location').waitFor();
}
async function edit(p,value){await button(p,'Edit Camera Location').click();await p.getByLabel('Camera Location',{exact:true}).fill(value);}
async function begin(p,value='A saved',id='camera/A'){
 await p.evaluate(({value,id})=>{window.__appTransport.holdSessions=true;window.__appTransport.expectedWrites.push({id,value});},{value,id});
 await button(p,'Save Location').click();
 await p.waitForFunction(()=>window.__appTransport.requests.some(r=>r.method==='POST'&&r.path.includes('/api/device/')&&r.state==='pending'));
 return p.evaluate(()=>window.__appTransport.requests.find(r=>r.method==='POST'&&r.path.includes('/api/device/')&&r.state==='pending').id);
}
async function ack(p,id,kind='valid'){
 await p.evaluate(({id,kind})=>{const r=window.__appTransport.requests.find(r=>r.id===id);
   if(kind==='transport'){r.reject();return;}
   r.resolve({status:kind==='status'?'UNCONFIRMED':'LOCAL_METADATA_UPDATED',device:{id:kind==='identity'?'camera/B':'camera/A'}},kind==='http'?503:200);
 },{id,kind});await pause(p);
}
async function heldSessions(p,n=1){
 await p.waitForFunction(n=>window.__appTransport.requests.filter(r=>r.path==='/api/project/session'&&r.state==='pending').length===n,n,{timeout:4000});
 return p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path==='/api/project/session'&&r.state==='pending').map(r=>r.id));
}
async function release(p,id,session){await p.evaluate(({id,session})=>window.__appTransport.requests.find(r=>r.id===id).resolve(session),{id,session});await pause(p);}
async function refresh(p,session){const [id]=await heldSessions(p);await release(p,id,session||await p.evaluate(()=>window.__appTransport.snapshot()));}
async function eventProject(p,sameId=false){
 await p.evaluate(same=>{const s=window.__appTransport;s.session=s.nextProject(same);s.emit('PROJECT_SESSION_CHANGED',{session:s.snapshot()});},sameId);await pause(p);
}
async function close(p){await p.getByRole('dialog',{name:'Device Inspector',exact:true}).getByRole('button',{name:'Close',exact:true}).click();}
async function evidence(p){return p.evaluate(()=>({
   requests:window.__appTransport.requests.map(({id,path,method,body,state,response})=>({id,path,method,body,state,response})),
   violations:[...window.__appTransport.violations],
   confirmed:document.querySelector('[aria-label="Local Camera Location"] p')?.textContent,
   input:document.querySelector('input[aria-label="Camera Location"]')?.value,
   saving:[...document.querySelectorAll('button')].some(b=>b.textContent==='Saving…'),
   table:document.querySelector('tbody')?.textContent,
   subscriptions:window.__appTransport.subscriptions.map(({id,active,unsubscribed})=>({id,active,unsubscribed}))
 }));}
async function pageFixture(){
 const context=await browser.newContext({viewport:{width:1500,height:1000},serviceWorkers:'block',acceptDownloads:false});contexts.push(context);
 const f={context,page:null,errors:[],teardown:false};
 await context.route('**/*',async route=>{const request=route.request();if(!allowed(request.url(),request.method())){boundary.push('browser-denied:'+request.url());await route.abort('blockedbyclient');return;}await route.continue();});
 await context.routeWebSocket('**',socket=>{boundary.push('browser-websocket-denied:'+socket.url());socket.close();});
 await context.addInitScript(installFixture);
 const p=f.page=await context.newPage();
 p.on('pageerror',e=>f.errors.push({kind:'page',text:String(e),teardown:f.teardown}));
 p.on('console',m=>{if(m.type()==='error')f.errors.push({kind:'console',text:m.text(),teardown:f.teardown});});
 await p.goto(origin+entry);
 await p.getByRole('button',{name:'Edit name for Camera A',exact:true}).waitFor();
 await p.waitForFunction(()=>window.__appTransport.subscriptions.filter(s=>s.active).length===1);
 await pause(p);return f;
}
async function check(family,name,run,expectedConsole=false){
 if(nameOwnerOnly&&family>=9)return;
 if(reverifyRefreshOnly&&![7,9].includes(family))return;
 if(reverifyOwnerOnly&&![9,10].includes(family))return;
 if(replacementOwnerOnly&&![9,11].includes(family))return;
 if(cancelAckOnly&&![9,12].includes(family))return;
 let f,status='passed',error,observations;
 try{
   f=await pageFixture();await run(f.page);observations=await evidence(f.page);
   assert.deepEqual(observations.violations,[]);assert.deepEqual(boundary,[]);
   const unexpected=f.errors.filter(e=>!(expectedConsole&&e.kind==='console'&&e.text.startsWith('Failed to fetch backend data:')&&e.text.includes('Injected refetch failure')));
   assert.deepEqual(unexpected,[],'Unexpected browser/React errors');
   if(expectedConsole)assert.equal(f.errors.length,1,'One declared refresh error must be observed');
 }catch(e){status='failed';error=String(e.stack);if(f?.page)observations=await evidence(f.page).catch(()=>null);}
 finally{
   if(f){f.teardown=true;
     await f.page.evaluate(()=>{const s=window.__appTransport;s.unmount();for(const r of s.requests)if(r.state==='pending')r.reject('Fixture teardown');s.restore();});
     await pause(f.page);
     const end=await evidence(f.page);
     assert.deepEqual(end.violations,[],'Safety violation (even if App swallowed it)');
     assert.ok(end.requests.every(r=>r.state!=='pending'),'Outstanding fixture request');
     assert.ok(end.subscriptions.length>=2&&end.subscriptions.every(s=>!s.active&&s.unsubscribed===1),'StrictMode subscription ownership');
     assert.equal(await f.page.evaluate(()=>document.body.style.overflow),'');
     summaries.push({family,name,requests:end.requests.length,subscriptions:end.subscriptions,errors:f.errors,pending:0,preferencesRestored:true});
     await f.context.close();assert.equal(browser.contexts().includes(f.context),false);
   }
 }
 results.push({family,name,status,error,observations:status==='failed'||family===7?observations:undefined});
 console.log((status==='passed'?'PASS ':'FAIL ')+family+' '+name+(error?'\n'+error:''));
 if(boundary.length||f?.errors.some(e=>e.kind==='page'))throw Error('Transport or React safety failure');
 // Independent application assertions may fail; remaining cases use fresh isolated contexts.
}
async function suite(){
 const startReverify=async p=>{
   await p.evaluate(()=>{const s=window.__appTransport;s.expectedReverify=true;s.holdSessions=true;});
   await button(p,'Project').click();await button(p,'Reverify').click();
   await p.waitForFunction(()=>window.__appTransport.requests.some(r=>r.path==='/api/project/reverify'&&r.state==='pending'));
   return p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path==='/api/project/reverify'&&r.state==='pending').at(-1).id);
 };
 const switchReverifyOwner=async(p,transition)=>{
   if(transition==='B')await eventProject(p,true);
   else{await p.evaluate(()=>{const s=window.__appTransport;s.session.metadataWriteContext.generation='33333333-3333-4333-8333-333333333333';
     s.session.project.devices[0].technician.location='Reopened location';s.emit('PROJECT_SESSION_CHANGED',{session:s.snapshot()});});await pause(p);}
   await p.getByRole('dialog',{name:'Project Reverify',exact:true}).waitFor({state:'hidden'});
 };
 const oldResult={totalKnown:2,recognizedCount:2,changedIpCount:0,newDevicesCount:0,possibleReplacements:[]};
 const cancelWaiting='Cancellation requested; waiting for acknowledgment.';
 const cancelAccepted='Cancellation request accepted. Waiting for the Reverify operation’s terminal result.';
 const cancelRejected='Cancellation request was not accepted. The Reverify operation may still be running.';
 const cancelUnavailable='Cancellation acknowledgment unavailable. The Reverify operation may still be running. Check Tasks before retrying.';
 const requestCancel=async p=>{
   const previous=await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path==='/api/project/reverify/cancel').map(r=>r.id));
   await p.evaluate(()=>{window.__appTransport.expectedCancel=true;});await button(p,'Cancel Reverify').click();
   await p.waitForFunction(previous=>window.__appTransport.requests.some(r=>r.path==='/api/project/reverify/cancel'&&r.state==='pending'&&!previous.includes(r.id)),previous);
   await p.getByText(cancelWaiting,{exact:true}).waitFor();
   return p.evaluate(previous=>window.__appTransport.requests.find(r=>r.path==='/api/project/reverify/cancel'&&r.state==='pending'&&!previous.includes(r.id)).id,previous);
 };
 const acknowledgeCancel=async(p,id,mode)=>{
   await p.evaluate(({id,mode})=>{const r=window.__appTransport.requests.find(r=>r.id===id);
     if(mode==='transport')r.reject('Injected cancellation secret=not-for-display');
     else if(mode==='json')r.resolveText('incomplete JSON');
     else if(mode==='unusable')r.resolve({});
     else if(mode==='http')r.resolve({error:'Raw rejected acknowledgment'},409);
     else r.resolve({cancelled:mode==='accepted'},202);
   },{id,mode});await pause(p);
 };
 const stillRunning=async p=>{
   const modal=p.getByRole('dialog',{name:'Project Reverify',exact:true});
   assert.equal(await modal.getByText('Discovering and reconciling Project identities…',{exact:true}).count(),1);
   assert.equal(await modal.locator('strong').count(),0);assert.equal(await button(p,'Done').count(),0);assert.equal(await button(p,'Retry').count(),0);
   assert.equal(await modal.getByText('Project reverification was cancelled.',{exact:true}).count(),0);
 };
 const finishOriginal=async(p,id,terminal)=>{
   const session=await p.evaluate(()=>window.__appTransport.snapshot());
   await p.evaluate(({id,terminal,oldResult})=>window.__appTransport.requests.find(r=>r.id===id).resolve(
     terminal==='cancelled'?{error:'Project reverification was cancelled.',code:'CANCELLED'}:{result:oldResult},terminal==='cancelled'?400:200),{id,terminal,oldResult});
   if(terminal==='completed'){const [read]=await heldSessions(p);await release(p,read,session);}
   await button(p,'Done').waitFor();const modal=p.getByRole('dialog',{name:'Project Reverify',exact:true});
   if(terminal==='cancelled')assert.equal(await modal.getByText('Project reverification was cancelled.',{exact:true}).count(),1);
   else assert.equal(await modal.locator('strong').first().textContent(),'2');
   for(const text of [cancelWaiting,cancelAccepted,cancelRejected,cancelUnavailable])assert.equal(await modal.getByText(text,{exact:true}).count(),0);
 };
 const oneCancel=async(p,count=1)=>{
   const posts=await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.method==='POST').map(r=>r.path));
   assert.equal(posts.filter(path=>path==='/api/project/reverify').length,1);assert.equal(posts.filter(path=>path==='/api/project/reverify/cancel').length,count);
   assert.ok(posts.every(path=>['/api/monitoring/preferences','/api/project/reverify','/api/project/reverify/cancel'].includes(path)));
 };
 for(const [newer,older] of [['accepted','http'],['negative','accepted'],['transport','accepted'],['negative','transport'],['negative','json'],['transport','transport'],['transport','json']])
 await check(12,'latest cancellation '+newer+' survives older '+older+' acknowledgment',async p=>{
   const original=await startReverify(p),session=await p.evaluate(()=>window.__appTransport.snapshot());
   const reads=await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path==='/api/project/session').length);
   const first=await requestCancel(p),second=await requestCancel(p);assert.notEqual(first,second);
   const expected=newer==='accepted'?cancelAccepted:newer==='negative'?cancelRejected:cancelUnavailable;
   await acknowledgeCancel(p,second,newer);await p.getByText(expected,{exact:true}).waitFor();await stillRunning(p);
   await acknowledgeCancel(p,first,older);assert.equal(await p.getByText(expected,{exact:true}).count(),1);await stillRunning(p);
   for(const text of [cancelWaiting,cancelAccepted,cancelRejected,cancelUnavailable].filter(text=>text!==expected))assert.equal(await p.getByText(text,{exact:true}).count(),0);
   await oneCancel(p,2);assert.deepEqual(await p.evaluate(()=>window.__appTransport.snapshot()),session);
   assert.equal(await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path==='/api/project/session').length),reads);
   await finishOriginal(p,original,newer==='accepted'?'cancelled':'completed');await oneCancel(p,2);
   assert.deepEqual(await p.evaluate(()=>window.__appTransport.snapshot()),session);
 });
 for(const terminal of ['cancelled','completed'])await check(12,'accepted cancellation acknowledgment then original '+terminal,async p=>{
   const original=await startReverify(p),session=await p.evaluate(()=>window.__appTransport.snapshot()),ack=await requestCancel(p);
   await stillRunning(p);await acknowledgeCancel(p,ack,'accepted');await p.getByText(cancelAccepted,{exact:true}).waitFor();await stillRunning(p);
   await finishOriginal(p,original,terminal);await oneCancel(p);assert.deepEqual(await p.evaluate(()=>window.__appTransport.snapshot()),session);
 });
 for(const mode of ['http','negative','transport','json','unusable'])await check(12,'cancellation '+mode+' acknowledgment leaves original operation active',async p=>{
   const original=await startReverify(p),session=await p.evaluate(()=>window.__appTransport.snapshot()),ack=await requestCancel(p);
   const reads=await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path==='/api/project/session').length);
   await acknowledgeCancel(p,ack,mode);await p.getByText(['http','negative'].includes(mode)?cancelRejected:cancelUnavailable,{exact:true}).waitFor();await stillRunning(p);
   assert.equal(await p.getByText('Raw rejected acknowledgment',{exact:true}).count(),0);assert.ok(!(await p.locator('body').textContent()).includes('secret=not-for-display'));
   assert.equal(await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path==='/api/project/session').length),reads);
   await oneCancel(p);assert.deepEqual(await p.evaluate(()=>window.__appTransport.snapshot()),session);await finishOriginal(p,original,'completed');
 });
 for(const mode of ['accepted','transport'])await check(12,'original completes before late '+mode+' cancellation acknowledgment',async p=>{
   const original=await startReverify(p),ack=await requestCancel(p);await finishOriginal(p,original,'completed');
   await acknowledgeCancel(p,ack,mode);await oneCancel(p);
   assert.equal(await p.getByRole('dialog',{name:'Project Reverify'}).locator('strong').first().textContent(),'2');
   for(const text of [cancelWaiting,cancelAccepted,cancelRejected,cancelUnavailable])assert.equal(await p.getByText(text,{exact:true}).count(),0);
 });
 for(const transition of ['B','same-project-reopen'])for(const mode of ['accepted','http','transport','json'])
 await check(12,'obsolete '+mode+' cancellation acknowledgment after '+transition,async p=>{
   const original=await startReverify(p),ack=await requestCancel(p);await switchReverifyOwner(p,transition);
   const session=await p.evaluate(()=>window.__appTransport.snapshot()),reads=await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path==='/api/project/session').length);
   await acknowledgeCancel(p,ack,mode);
   await p.evaluate(({original,oldResult})=>window.__appTransport.requests.find(r=>r.id===original).resolve({result:oldResult}),{original,oldResult});await pause(p);
   assert.equal(await p.getByRole('dialog',{name:'Project Reverify'}).count(),0);
   for(const text of [cancelWaiting,cancelAccepted,cancelRejected,cancelUnavailable])assert.equal(await p.getByText(text,{exact:true}).count(),0);
   assert.equal(await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path==='/api/project/session').length),reads);await oneCancel(p);
   assert.deepEqual(await p.evaluate(()=>window.__appTransport.snapshot()),session);await inspect(p);
   assert.equal(await confirmed(p),transition==='B'?'New project location':'Reopened location');await close(p);
 });
 const modalFor=p=>p.getByRole('dialog',{name:'Project Reverify',exact:true});
 const decisionButtons={CONFIRMED:'Confirm Replacement',REJECTED:'Keep Original / Do Not Replace',DEFERRED:'Decide Later'};
 const decisionMessages={CONFIRMED:'Replacement confirmed; Project has unsaved changes.',REJECTED:'Original retained.',DEFERRED:'Decision deferred.'};
 const uncertainDecision='Replacement decision outcome unavailable. The decision may have been applied. Check the current project state before trying again.';
 const candidateCard=(p,name='Camera A')=>modalFor(p).locator('div.rounded.border-rose-200').filter({has:p.getByText(name,{exact:true})});
 const candidateReady=async(p,two=false)=>{
   const request=await startReverify(p),session=await p.evaluate(()=>window.__appTransport.snapshot());
   const candidate={candidateId:'fixture-candidate',originalDeviceId:'camera/A',expectedName:'Camera A',expectedMac:'00:11:22:33:44:50',
     expectedIp:'192.0.2.50',foundIp:'192.0.2.50',foundMac:'00:11:22:33:44:99',foundVendor:'Synthetic',model:'Replacement fixture',decision:'PENDING'};
   await p.evaluate(({request,candidate,two})=>window.__appTransport.requests.find(r=>r.id===request).resolve({result:{
     totalKnown:2,recognizedCount:0,changedIpCount:0,newDevicesCount:1,notVerifiedCount:2,possibleReplacements:two?[candidate,{...candidate,candidateId:'fixture-candidate-two',originalDeviceId:'camera/B',expectedName:'Camera B'}]:[candidate]}}),{request,candidate,two});
   const [read]=await heldSessions(p);await release(p,read,session);await button(p,'Done').waitFor();
   await candidateCard(p).getByRole('button',{name:'Confirm Replacement',exact:true}).waitFor();return session;
 };
 const submitDecision=async(p,decision,name='Camera A',candidate='fixture-candidate')=>{
   const previous=await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path.includes('/replacements/')).map(r=>r.id));
   await p.evaluate(({decision,candidate})=>{window.__appTransport.expectedDecision=decision;window.__appTransport.expectedCandidate=candidate;},{decision,candidate});
   const card=candidateCard(p,name);
   // Same-turn native DOM clicks exercise the real controls before awaiting a response.
   await card.evaluate((element,label)=>{
     const buttons=[...element.querySelectorAll('button')],chosen=buttons.find(b=>b.textContent===label);
     chosen.click();chosen.click();for(const button of buttons)button.click();
   },decisionButtons[decision]);
   const target='/api/project/reverify/replacements/'+candidate;
   await p.waitForFunction(({target,previous})=>window.__appTransport.requests.some(r=>r.path===target&&r.state==='pending'&&!previous.includes(r.id)),{target,previous});
   await card.getByText('Awaiting acknowledgment...',{exact:true}).waitFor();
   for(const label of Object.values(decisionButtons))assert.equal(await card.getByRole('button',{name:label,exact:true}).isDisabled(),true);
   for(const text of Object.values(decisionMessages))assert.equal(await card.getByText(text,{exact:true}).count(),0);
   return p.evaluate(({target,previous})=>window.__appTransport.requests.find(r=>r.path===target&&r.state==='pending'&&!previous.includes(r.id)).id,{target,previous});
 };
 const respondDecision=async(p,id,mode,decision)=>{
   await p.evaluate(({id,mode,decision})=>{const r=window.__appTransport.requests.find(r=>r.id===id);
     if(mode==='transport')r.reject('Injected decision transport failure');
     else if(mode==='json')r.resolveText('incomplete JSON');
     else if(mode==='unusable')r.resolve({});
     else if(mode==='rejection')r.resolve({error:'Fixture replacement review rejected'},400);
     else r.resolve({decision});
   },{id,mode,decision});await pause(p);
 };
 const readCount=p=>p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path==='/api/project/session').length);
 const oneDecision=async p=>{
   const posts=await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.method==='POST').map(r=>r.path));
   assert.equal(posts.filter(path=>path==='/api/project/reverify/replacements/fixture-candidate').length,1);
   assert.equal(posts.filter(path=>path==='/api/project/reverify').length,1);
   assert.ok(posts.every(path=>['/api/monitoring/preferences','/api/project/reverify','/api/project/reverify/replacements/fixture-candidate'].includes(path)));
 };
 await check(11,'pending replacement candidates remain independently actionable',async p=>{
   const session=await candidateReady(p,true),reads=await readCount(p),first=await submitDecision(p,'CONFIRMED');
   for(const label of Object.values(decisionButtons))assert.equal(await candidateCard(p,'Camera B').getByRole('button',{name:label,exact:true}).isEnabled(),true);
   const second=await submitDecision(p,'DEFERRED','Camera B','fixture-candidate-two');
   assert.equal(await modalFor(p).getByText('Awaiting acknowledgment...',{exact:true}).count(),2);
   assert.equal(await readCount(p),reads);assert.deepEqual(await p.evaluate(()=>window.__appTransport.snapshot()),session);
   await respondDecision(p,second,'success','DEFERRED');let read=(await heldSessions(p))[0];await release(p,read,session);
   await candidateCard(p,'Camera B').getByText(decisionMessages.DEFERRED,{exact:true}).waitFor();
   await candidateCard(p).getByText('Awaiting acknowledgment...',{exact:true}).waitFor();
   await respondDecision(p,first,'success','CONFIRMED');read=(await heldSessions(p))[0];await release(p,read,session);
   await candidateCard(p).getByText(decisionMessages.CONFIRMED,{exact:true}).waitFor();
   assert.equal(await modalFor(p).getByText('Awaiting acknowledgment...',{exact:true}).count(),0);
   const posts=await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.method==='POST').map(r=>r.path));
   assert.equal(posts.filter(path=>path.includes('/replacements/')).length,2);assert.equal(posts.filter(path=>path==='/api/project/reverify').length,1);
   assert.ok(posts.every(path=>['/api/monitoring/preferences','/api/project/reverify','/api/project/reverify/replacements/fixture-candidate','/api/project/reverify/replacements/fixture-candidate-two'].includes(path)));
   assert.equal(await readCount(p),reads+2);assert.deepEqual(await p.evaluate(()=>window.__appTransport.snapshot()),session);
 });
 for(const transition of ['B','same-project-reopen'])await check(11,'obsolete decision cannot clear new pending candidate after '+transition,async p=>{
   await candidateReady(p);const old=await submitDecision(p,'CONFIRMED');await switchReverifyOwner(p,transition);
   const session=await candidateReady(p),newRequest=await submitDecision(p,'REJECTED'),reads=await readCount(p);
   await respondDecision(p,old,'rejection','CONFIRMED');
   await candidateCard(p).getByText('Awaiting acknowledgment...',{exact:true}).waitFor();
   for(const label of Object.values(decisionButtons))assert.equal(await candidateCard(p).getByRole('button',{name:label,exact:true}).isDisabled(),true);
   assert.equal(await modalFor(p).getByText('Fixture replacement review rejected',{exact:true}).count(),0);
   assert.equal(await readCount(p),reads);assert.deepEqual(await p.evaluate(()=>window.__appTransport.snapshot()),session);
   await respondDecision(p,newRequest,'success','REJECTED');const [read]=await heldSessions(p);await release(p,read,session);
   await candidateCard(p).getByText(decisionMessages.REJECTED,{exact:true}).waitFor();
   assert.equal(await modalFor(p).getByText('Awaiting acknowledgment...',{exact:true}).count(),0);
   assert.equal(await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path.includes('/replacements/')).length),2);
   assert.deepEqual(await p.evaluate(()=>window.__appTransport.snapshot()),session);
 });
 for(const transition of ['B','same-project-reopen'])for(const mode of ['success','transport','json','rejection'])
 await check(11,'obsolete replacement '+mode+' after '+transition+' is consumed',async p=>{
   await candidateReady(p);const id=await submitDecision(p,'CONFIRMED');await switchReverifyOwner(p,transition);
   const session=await p.evaluate(()=>window.__appTransport.snapshot()),reads=await readCount(p);
   await respondDecision(p,id,mode,'CONFIRMED');assert.equal(await modalFor(p).count(),0);
   for(const text of [uncertainDecision,'Fixture replacement review rejected',...Object.values(decisionMessages)])assert.equal(await p.getByText(text,{exact:true}).count(),0);
   assert.equal(await readCount(p),reads);assert.deepEqual(await p.evaluate(()=>window.__appTransport.snapshot()),session);await oneDecision(p);
   await inspect(p);assert.equal(await confirmed(p),transition==='B'?'New project location':'Reopened location');
   assert.equal(await p.getByRole('dialog',{name:'Device Inspector'}).getByText('Current status',{exact:true}).locator('..').locator('p').textContent(),'Unknown');await close(p);
 });
 for(const mode of ['transport','json','unusable','rejection','CONFIRMED','REJECTED','DEFERRED'])
 await check(11,'current-owner replacement '+mode+' remains truthful',async p=>{
   const session=await candidateReady(p),decision=mode in decisionButtons?mode:'CONFIRMED';
   const id=await submitDecision(p,decision),reads=await readCount(p);await respondDecision(p,id,mode,decision);
   const modal=modalFor(p);
   if(['transport','json','unusable'].includes(mode)){
     await modal.getByText(uncertainDecision,{exact:true}).waitFor();assert.equal(await modal.locator('strong').count(),0);
     assert.equal(await modal.getByRole('button',{name:'Retry',exact:true}).count(),0);
     for(const label of Object.values(decisionButtons))assert.equal(await modal.getByRole('button',{name:label,exact:true}).count(),0);
     for(const text of Object.values(decisionMessages))assert.equal(await modal.getByText(text,{exact:true}).count(),0);
     assert.equal(await readCount(p),reads);
   }else if(mode==='rejection'){
     await modal.getByText('Fixture replacement review rejected',{exact:true}).waitFor();
     assert.equal(await modal.getByText(uncertainDecision,{exact:true}).count(),0);
     assert.equal(await modal.getByRole('button',{name:'Confirm Replacement',exact:true}).count(),1);assert.equal(await readCount(p),reads);
     for(const label of Object.values(decisionButtons))assert.equal(await candidateCard(p).getByRole('button',{name:label,exact:true}).isEnabled(),true);
   }else{
     await modal.getByText(decisionMessages[decision],{exact:true}).waitFor();
     const [read]=await heldSessions(p);await release(p,read,session);
     assert.equal(await modal.getByText(uncertainDecision,{exact:true}).count(),0);assert.equal(await readCount(p),reads+1);
   }
   assert.equal(await modal.getByText('Awaiting acknowledgment...',{exact:true}).count(),0);
   await oneDecision(p);assert.deepEqual(await p.evaluate(()=>window.__appTransport.snapshot()),session);
   await button(p,'Done').click();await modal.waitFor({state:'hidden'});await inspect(p);assert.equal(await confirmed(p),'Lobby');
   assert.equal(await p.getByRole('dialog',{name:'Device Inspector'}).getByText('Current status',{exact:true}).locator('..').locator('p').textContent(),'Unknown');await close(p);
 });
 for(const transition of ['B','same-project-reopen'])for(const outcome of ['success','rejection','transport','cancelled'])
 await check(10,'late A '+outcome+' after '+transition+' cannot affect current owner',async p=>{
   const request=await startReverify(p);await switchReverifyOwner(p,transition);
   const current=await p.evaluate(()=>window.__appTransport.snapshot());
   const reads=await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path==='/api/project/session').length);
   await p.evaluate(({request,outcome,oldResult})=>{const r=window.__appTransport.requests.find(r=>r.id===request);
     if(outcome==='transport')r.reject('Old A transport rejection');
     else r.resolve(outcome==='success'?{result:oldResult}:{error:outcome==='cancelled'?'Project reverification was cancelled.':'Old A request rejected',code:outcome==='cancelled'?'CANCELLED':'OPERATION_FAILED'},outcome==='success'?200:400);
   },{request,outcome,oldResult});await pause(p);
   assert.equal(await p.getByRole('dialog',{name:'Project Reverify',exact:true}).count(),0);
   assert.equal(await button(p,'Reverify').count(),0); // No menu or replacement-owner run was opened automatically.
   assert.equal(await p.getByText('Old A request rejected',{exact:true}).count(),0);
   assert.equal(await p.getByText('Project reverification was cancelled.',{exact:true}).count(),0);
   assert.equal(await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path==='/api/project/session').length),reads);
   assert.deepEqual(await p.evaluate(()=>window.__appTransport.snapshot()),current);
   const posts=await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.method==='POST').map(r=>r.path));
   assert.equal(posts.filter(path=>path==='/api/project/reverify').length,1);
   assert.ok(posts.every(path=>['/api/monitoring/preferences','/api/project/reverify'].includes(path)));
   await inspect(p);assert.equal(await confirmed(p),transition==='B'?'New project location':'Reopened location');
   const inspector=p.getByRole('dialog',{name:'Device Inspector',exact:true});
   assert.equal(await inspector.getByText('Current status',{exact:true}).locator('..').locator('p').textContent(),'Unknown');
   assert.equal(await inspector.locator('h3 + p').textContent(),'Camera A');await close(p);
 });
 await check(10,'obsolete A refresh and finally cannot overwrite an explicitly started B operation',async p=>{
   const a=await startReverify(p),oldSession=await p.evaluate(()=>window.__appTransport.snapshot());
   await p.evaluate(({a,oldResult})=>window.__appTransport.requests.find(r=>r.id===a).resolve({result:oldResult}),{a,oldResult});
   const [oldRead]=await heldSessions(p);await switchReverifyOwner(p,'B');
   const current=await p.evaluate(()=>window.__appTransport.snapshot()),b=await startReverify(p);
   const modal=p.getByRole('dialog',{name:'Project Reverify',exact:true});await modal.waitFor();
   await release(p,oldRead,oldSession);
   assert.equal(await modal.getByText('Discovering and reconciling Project identities…',{exact:true}).count(),1);
   assert.equal(await modal.locator('strong').count(),0);assert.equal(await button(p,'Done').count(),0);
   assert.equal(await modal.getByRole('status').count(),0);assert.deepEqual(await p.evaluate(()=>window.__appTransport.snapshot()),current);
   await p.evaluate(b=>window.__appTransport.requests.find(r=>r.id===b).resolve({result:{totalKnown:1,recognizedCount:0,changedIpCount:0,newDevicesCount:0,possibleReplacements:[]}}),b);
   const [newRead]=await heldSessions(p);await release(p,newRead,current);await button(p,'Done').waitFor();
   assert.equal(await modal.locator('strong').first().textContent(),'0');await button(p,'Done').click();
   await inspect(p);assert.equal(await confirmed(p),'New project location');await close(p);
   assert.equal(await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path==='/api/project/reverify').length),2);
 });
 for(const outcome of ['applied','failed','stale'])await check(9,'confirmed Reverify with '+outcome+' inventory refresh',async p=>{
   await p.evaluate(()=>{const s=window.__appTransport;s.session.project.devices[0].sessionVerification='NOT_VERIFIED';
     s.session.project.devices[0].savedStatusSnapshot='ONLINE';s.emit('PROJECT_SESSION_CHANGED',{session:s.snapshot()});});
   await pause(p);const baseline=await p.evaluate(()=>window.__appTransport.snapshot());
   const inspector=p.getByRole('dialog',{name:'Device Inspector',exact:true});
   const currentStatus=()=>inspector.getByText('Current status',{exact:true}).locator('..').locator('p').textContent();
   await inspect(p);assert.equal(await currentStatus(),'Unknown');assert.equal(await confirmed(p),'Lobby');await close(p);
   await p.evaluate(()=>{const s=window.__appTransport;s.holdSessions=true;s.expectedReverify=true;});
   await button(p,'Project').click();await button(p,'Reverify').click();
   await p.waitForFunction(()=>window.__appTransport.requests.some(r=>r.path==='/api/project/reverify'&&r.state==='pending'));
   const refreshed=structuredClone(baseline),device=refreshed.project.devices[0];
   device.status='ONLINE';device.sessionVerification='VERIFIED';
   device.reachability={lastSuccessfulResponseAt:'2026-10-29T12:00:00.000Z'};
   const result={totalKnown:2,recognizedCount:1,changedIpCount:0,newDevicesCount:0,notVerifiedCount:1,collisionCount:0,
     verifiedDevices:[device],notVerifiedDevices:[refreshed.project.devices[1]],newDevices:[],possibleReplacements:[]};
   await p.evaluate(({result,refreshed})=>{const s=window.__appTransport;s.session=refreshed;
     s.requests.find(r=>r.path==='/api/project/reverify'&&r.state==='pending').resolve({result,project:refreshed.project});},{result,refreshed});
   const modal=p.getByRole('dialog',{name:'Project Reverify',exact:true});
   await modal.getByRole('heading',{name:'Verified',exact:true}).waitFor();assert.equal(await modal.locator('strong').first().textContent(),'1');
   const [read]=await heldSessions(p);
   if(outcome==='applied')await release(p,read,refreshed);
   else if(outcome==='failed')await p.evaluate(id=>window.__appTransport.requests.find(r=>r.id===id).resolve({error:'Inventory unavailable'},503),read);
   else{
     await p.evaluate(()=>window.__appTransport.reconcile());const pending=await heldSessions(p,2);
     await release(p,pending.find(id=>id!==read),baseline);await release(p,read,refreshed);
   }
   await button(p,'Done').waitFor();
   const warning=modal.getByText('Reverify completed, but the displayed device inventory could not be confirmed as refreshed.',{exact:true});
   assert.equal(await warning.count(),outcome==='applied'?0:1);assert.equal(await modal.locator('strong').first().textContent(),'1');
   assert.equal(await modal.getByRole('button',{name:'Retry',exact:true}).count(),0);
   assert.equal(await modal.getByText('Reverify outcome unavailable. The operation may still be running. Check Tasks before retrying.',{exact:true}).count(),0);
   await button(p,'Done').click();await modal.waitFor({state:'hidden'});await inspect(p);
   assert.equal(await currentStatus(),outcome==='applied'?'Online':'Unknown');assert.equal(await confirmed(p),'Lobby');
   assert.equal(await inspector.locator('h3 + p').textContent(),'Camera A');
   assert.equal(await inspector.getByText('Current IP: 192.0.2.50 · Subnet: Unknown',{exact:true}).count(),1);
   assert.equal(await inspector.getByText('Last successful contact',{exact:true}).locator('..').locator('p').textContent(),outcome==='applied'?'2026-10-29T12:00:00.000Z':'Unknown');
   assert.equal(await inspector.getByText('No diagnostic checks are available for the current IP address.',{exact:true}).count(),1);
   const requests=await p.evaluate(()=>window.__appTransport.requests.map(({path,method})=>({path,method})));
   assert.equal(requests.filter(r=>r.path==='/api/project/reverify').length,1);
   assert.ok(requests.filter(r=>r.method==='POST').every(r=>['/api/monitoring/preferences','/api/project/reverify'].includes(r.path)));
   assert.deepEqual(baseline.project.devices[0].technician,device.technician); // Fixture state, not a DOM Notes assertion.
   await close(p);
 });
 await check(1,'open Name draft cannot rebind to a replacement project with the same device ID',async p=>{
   await p.getByRole('button',{name:'Edit name for Camera A',exact:true}).click();
   await p.getByLabel('Camera Name',{exact:true}).fill('Old draft');
   await eventProject(p,true);
   await p.getByLabel('Camera Name',{exact:true}).press('Enter');
   await p.getByRole('alert').waitFor();assert.match(await p.getByRole('alert').textContent(),/Refresh.*review/);
   assert.equal(await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path.includes('/api/device/')).length),0);
 });
 if(nameOwnerOnly)return;
 await check(1,'server conflict is actionable without automatic retry or refresh',async p=>{
   await inspect(p);await edit(p,'Review this edit');const id=await begin(p,'Review this edit');
   const original=await p.evaluate(id=>window.__appTransport.requests.find(r=>r.id===id).body,id);
   await p.evaluate(id=>window.__appTransport.requests.find(r=>r.id===id).resolve({status:'CONFLICT',code:'METADATA_PROJECT_CONFLICT'},409),id);await pause(p);
   await p.getByRole('alert').waitFor();assert.match(await p.getByRole('alert').textContent(),/Refresh.*review/);
   assert.equal(await confirmed(p),'Lobby');
   assert.equal(await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path.includes('/api/device/')).length),1);
   assert.equal(await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path==='/api/project/session'&&r.state==='pending').length),0);
   assert.equal(original.metadataWriteContext.projectId,'Project One');
 });
 await check(1,'missing accepted context fails closed before transport',async p=>{
   await p.evaluate(()=>{const s=window.__appTransport;delete s.session.metadataWriteContext;s.emit('PROJECT_SESSION_CHANGED',{session:s.snapshot()});});await pause(p);
   await inspect(p);await edit(p,'No context');await button(p,'Save Location').click();
   await p.getByRole('alert').waitFor();assert.match(await p.getByRole('alert').textContent(),/Refresh.*review/);
   assert.equal(await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path.includes('/api/device/')).length),0);
 });
 for(const field of ['name','notes'])await check(1,field+' carries accepted context and preserves pending request ownership',async p=>{
   const label=field==='name'?'Camera Name':'Camera Notes';
   await p.getByRole('button',{name:'Edit '+field+' for Camera A',exact:true}).click();
   await p.getByLabel(label,{exact:true}).fill('Owned '+field);
   await p.evaluate(field=>{const s=window.__appTransport;s.holdSessions=true;s.expectedWrites.push({id:'camera/A',field,value:'Owned '+field,context:s.snapshot().metadataWriteContext});},field);
   await p.getByLabel(label,{exact:true}).press(field==='notes'?'Tab':'Enter');
   await p.waitForFunction(()=>window.__appTransport.requests.some(r=>r.path.includes('/api/device/')&&r.state==='pending'));
   const write=await p.evaluate(()=>window.__appTransport.requests.find(r=>r.path.includes('/api/device/')&&r.state==='pending').id);
   await eventProject(p,true);
   const body=await p.evaluate(id=>window.__appTransport.requests.find(r=>r.id===id).body,write);
   assert.equal(body.metadataWriteContext.projectId,'Project One');
   await p.evaluate(id=>window.__appTransport.requests.find(r=>r.id===id).resolve({status:'CONFLICT',code:'METADATA_PROJECT_CONFLICT'},409),write);await pause(p);
   await p.getByRole('alert').waitFor();assert.match(await p.getByRole('alert').textContent(),/Refresh.*review/);
   assert.equal(await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path.includes('/api/device/')).length),1);
 });
 await check(1,'stable-ID exact body, pending UI and refetch completion',async p=>{
   await inspect(p);await edit(p,'  North Door  ');const id=await begin(p,'  North Door  ');
   assert.equal(await confirmed(p),'Lobby');assert.equal(await button(p,'Saving…').isDisabled(),true);
   await p.keyboard.press('Enter');
   assert.equal(await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path.includes('/api/device/')).length),1);
   await ack(p,id);await heldSessions(p);assert.equal(await button(p,'Saving…').isDisabled(),true);assert.equal(await confirmed(p),'Lobby');
   await p.evaluate(()=>window.__appTransport.session.project.devices[0].technician.location='  North Door  ');await refresh(p);
   await button(p,'Edit Camera Location').waitFor();assert.equal(await confirmed(p),'North Door');
 });
 for(const kind of ['http','status','identity','transport'])await check(2,'invalid acknowledgment '+kind+' and independent retry',async p=>{
   await inspect(p);await edit(p,'Retry location');const first=await begin(p,'Retry location');await ack(p,first,kind);
   await p.getByRole('alert').waitFor();assert.equal(await confirmed(p),'Lobby');assert.ok((await p.getByRole('alert').textContent()).includes('Try again'));
   assert.equal((await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path==='/api/project/session'&&r.state==='pending'))).length,0);
   const retry=await begin(p,'Retry location');assert.notEqual(retry,first);await ack(p,retry);
   await p.evaluate(()=>window.__appTransport.session.project.devices[0].technician.location='Retry location');await refresh(p);
   await button(p,'Edit Camera Location').waitFor();assert.equal(await confirmed(p),'Retry location');
 });
 await check(3,'A completion while B selected does not write or change B',async p=>{
   await inspect(p);await edit(p,'A changed');const id=await begin(p,'A changed');await inspect(p,'Camera B');
   await p.evaluate(()=>window.__appTransport.session.project.devices[0].technician.location='A changed');await ack(p,id);await refresh(p);
   assert.equal(await confirmed(p),'Garage');await inspect(p);assert.equal(await confirmed(p),'A changed');await inspect(p,'Camera B');assert.equal(await confirmed(p),'Garage');
   assert.equal(await p.evaluate(()=>window.__appTransport.requests.filter(r=>r.path.includes('/api/device/')).length),1);
 });
 await check(4,'A-B-A keeps newer editor generation and confirmed value',async p=>{
   await inspect(p);await edit(p,'Old save');const id=await begin(p,'Old save');await inspect(p,'Camera B');await inspect(p);
   await edit(p,'New draft');await p.evaluate(()=>{const s=window.__appTransport;s.session.project.devices[0].technician.location='New confirmed';s.emit('PROJECT_SESSION_CHANGED',{session:s.snapshot()});});await pause(p);
   await ack(p,id);await refresh(p);assert.equal(await confirmed(p),'New confirmed');assert.equal(await p.getByLabel('Camera Location',{exact:true}).inputValue(),'New draft');
 });
 await check(5,'closed completion cannot acknowledge reopened editor',async p=>{
   await inspect(p);await edit(p,'Closed save');const id=await begin(p,'Closed save');await close(p);await inspect(p);await edit(p,'Reopened draft');
   await ack(p,id);await refresh(p);assert.equal(await confirmed(p),'Lobby');assert.equal(await p.getByLabel('Camera Location',{exact:true}).inputValue(),'Reopened draft');
 });
 await check(6,'older session read must not regress newer rendered state',async p=>{
   await inspect(p);await p.evaluate(()=>{const s=window.__appTransport;s.holdSessions=true;s.reconcile();});await heldSessions(p);
   await p.evaluate(()=>window.__appTransport.reconcile());const [older,newer]=await heldSessions(p,2);
   const old=await p.evaluate(()=>window.__appTransport.snapshot()),current=structuredClone(old);
   current.project.devices[0].technician.location='Newest refetch';current.project.name='Newer read';
   await release(p,newer,current);assert.equal(await confirmed(p),'Newest refetch');await release(p,older,old);
   assert.equal(await confirmed(p),'Newest refetch','An older session read regressed the current device');
 });
 await check(7,'acknowledged save with failed refresh retains confirmed value and permits retry',async p=>{
   await inspect(p);await edit(p,'Acknowledged only');const id=await begin(p,'Acknowledged only');assert.equal(await confirmed(p),'Lobby');await ack(p,id);
   const [read]=await heldSessions(p);assert.equal(await confirmed(p),'Lobby');
   await p.evaluate(id=>window.__appTransport.requests.find(r=>r.id===id).reject('Injected refetch failure'),read);await pause(p);
   await p.getByRole('alert').waitFor();assert.equal(await confirmed(p),'Lobby');
   const message=await p.getByRole('alert').textContent();
   assert.ok(message.includes('server acknowledged'));assert.ok(message.includes('refresh failed'));
   assert.ok(message.includes('persistence has not been reverified'));assert.ok(message.includes('Try again'));
   assert.ok(!message.includes('was not saved'));
   assert.equal(await p.getByLabel('Camera Location',{exact:true}).inputValue(),'Acknowledged only');
   assert.equal(await button(p,'Save Location').isDisabled(),false);
   await close(p);await inspect(p);assert.equal(await confirmed(p),'Lobby');
   await edit(p,'Acknowledged only');const retry=await begin(p,'Acknowledged only');assert.notEqual(retry,id);await ack(p,retry);
   await p.evaluate(()=>window.__appTransport.session.project.devices[0].technician.location='Acknowledged only');await refresh(p);
   await button(p,'Edit Camera Location').waitFor();assert.equal(await confirmed(p),'Acknowledged only');assert.equal(await p.getByRole('alert').count(),0);
   await close(p);await inspect(p);assert.equal(await confirmed(p),'Acknowledged only');
 },true);
 await check(7,'acknowledged save with non-2xx session refresh is not confirmed',async p=>{
   await inspect(p);await edit(p,'HTTP acknowledged');const write=await begin(p,'HTTP acknowledged');await ack(p,write);
   const [read]=await heldSessions(p);
   await p.evaluate(id=>window.__appTransport.requests.find(r=>r.id===id).resolve({error:'Injected session read unavailable'},503),read);await pause(p);
   await p.getByRole('alert').waitFor();assert.equal(await confirmed(p),'Lobby');
   assert.ok((await p.getByRole('alert').textContent()).includes('server acknowledged'));
   assert.ok((await p.getByRole('alert').textContent()).includes('refresh failed'));
   assert.equal(await p.getByLabel('Camera Location',{exact:true}).inputValue(),'HTTP acknowledged');
 });
 await check(7,'superseded post-ack refresh cannot confirm submitted value',async p=>{
   await inspect(p);await edit(p,'Superseded value');const write=await begin(p,'Superseded value');await ack(p,write);
   await heldSessions(p);await p.evaluate(()=>window.__appTransport.reconcile());const [older,newer]=await heldSessions(p,2);
   const current=await p.evaluate(()=>window.__appTransport.snapshot());await release(p,newer,current);
   const old=structuredClone(current);old.project.devices[0].technician.location='Superseded value';await release(p,older,old);
   await p.getByRole('alert').waitFor();assert.equal(await confirmed(p),'Lobby');
   assert.ok((await p.getByRole('alert').textContent()).includes('refresh was superseded'));
   assert.equal(await p.getByLabel('Camera Location',{exact:true}).inputValue(),'Superseded value');
 });
 await check(7,'applied current snapshot must confirm the exact acknowledged location',async p=>{
   await inspect(p);await edit(p,'Unverified value');const write=await begin(p,'Unverified value');await ack(p,write);await refresh(p);
   await p.getByRole('alert').waitFor();assert.equal(await confirmed(p),'Lobby');
   assert.ok((await p.getByRole('alert').textContent()).includes('did not confirm the submitted value'));
   assert.ok((await p.getByRole('alert').textContent()).includes('persistence has not been reverified'));
   assert.equal(await p.getByLabel('Camera Location',{exact:true}).inputValue(),'Unverified value');
 });
 for(const phase of ['save','refetch'])for(const same of [false,true])await check(8,'project replacement during '+phase+'; '+(same?'same ID':'different ID'),async p=>{
   const oldSession=await p.evaluate(()=>window.__appTransport.snapshot());oldSession.project.devices[0].technician.location='Old project save';
   await inspect(p);await edit(p,'Old project save');const id=await begin(p,'Old project save');let held;
   if(phase==='refetch'){await ack(p,id);held=(await heldSessions(p))[0];}
   await eventProject(p,same);
   if(!same)await inspect(p,'Camera C');
   assert.equal(await confirmed(p),'New project location');
   if(phase==='save'){await ack(p,id);await refresh(p);}else await release(p,held,oldSession);
   assert.equal(await confirmed(p),'New project location','Old work overwrote or acknowledged the new project context');
   assert.equal(await p.getByText('Project Two',{exact:true}).count(),1,'Old refetch replaced the active project');
 });
}
(async()=>{let fatal;
 try{await setup();await suite();}catch(e){fatal=String(e.stack);console.error(fatal);}
 finally{try{await cleanup();}catch(e){fatal=String(e.stack);console.error('CLEANUP UNCERTAIN; preserve '+root+': '+fatal);}}
 const families=Object.fromEntries(Array.from({length:12},(_,i)=>{const rows=results.filter(r=>r.family===i+1);return[i+1,{passed:rows.filter(r=>r.status==='passed').length,failed:rows.filter(r=>r.status==='failed').length,status:!rows.length?(nameOwnerOnly||reverifyRefreshOnly||reverifyOwnerOnly||replacementOwnerOnly||cancelAckOnly?'not-executed-filter':'blocked'):rows.some(r=>r.status==='failed')?'failed':'passed'}];}));
 console.log(JSON.stringify({families,results,summaries,boundary,contextsCreated:contexts.length,cleanupConfirmed:closed,listenerClosed:server?!server.listening:null,browserDisconnected:browser?!browser.isConnected():null,fixtureRoot:root,remainingFixtureRoot:root?fs.existsSync(root):false,removedOwnedFiles:removedFiles,fatal},null,2));
 if(fatal||results.length!==(nameOwnerOnly?1:reverifyRefreshOnly?7:reverifyOwnerOnly?12:replacementOwnerOnly?21:cancelAckOnly?27:76)||results.some(r=>r.status==='failed'))process.exitCode=1;
})();
