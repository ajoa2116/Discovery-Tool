// Fixture-only real App interactions. No backend, camera or native transport.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const ts=require('typescript');
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
 const families=Object.fromEntries(Array.from({length:8},(_,i)=>{const rows=results.filter(r=>r.family===i+1);return[i+1,{passed:rows.filter(r=>r.status==='passed').length,failed:rows.filter(r=>r.status==='failed').length,status:!rows.length?'blocked':rows.some(r=>r.status==='failed')?'failed':'passed'}];}));
 console.log(JSON.stringify({families,results,summaries,boundary,contextsCreated:contexts.length,cleanupConfirmed:closed,listenerClosed:server?!server.listening:null,browserDisconnected:browser?!browser.isConnected():null,fixtureRoot:root,remainingFixtureRoot:root?fs.existsSync(root):false,removedOwnedFiles:removedFiles,fatal},null,2));
 if(fatal||results.length!==17||results.some(r=>r.status==='failed'))process.exitCode=1;
})();
