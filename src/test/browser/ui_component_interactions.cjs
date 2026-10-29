// UI-TEST-001: actual React/Edge interactions; no App, backend or real API.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const ts=require('typescript');
const repo=path.resolve(__dirname,'../../..'),entry='/src/test/browser/ui_component_interactions.html';
const selectedGroups=new Set((process.env.UI_INTERACTION_GROUPS||'ABCDEFGHIJKL').replaceAll(',','').split(''));
assert.ok(selectedGroups.size>0&&[...selectedGroups].every(g=>'ABCDEFGHIJKLMNOPQ'.includes(g)),'Invalid group selection');
const results=[],boundary=[],contexts=[],sourcePaths=new Set(['/src/ui/index.css']);let vite,server,browser,root,origin,port,closed=false,removedFiles=0;
function checked(p){assert.equal(fs.realpathSync(p),p);for(let q=p;;q=path.dirname(q)){assert.equal(fs.lstatSync(q).isSymbolicLink(),false);if(path.dirname(q)===q)break;}}
function sourceGraph(file){
 const relative=path.relative(repo,file).replaceAll('\\','/');assert.match(relative,/^src\/(test\/browser\/ui_component_interactions\.tsx|ui\/|shared\/|types\/)/);
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
 const parent=fs.realpathSync(os.tmpdir());checked(parent);root=fs.mkdtempSync(path.join(parent,'discovery-react-interaction-'));checked(root);
 sourceGraph(path.join(repo,'src/test/browser/ui_component_interactions.tsx'));
 const {createServer}=await import('vite');
 vite=await createServer({configFile:false,envFile:false,root:repo,cacheDir:path.join(root,'vite-cache'),logLevel:'error',
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
async function pageFixture(){
 const context=await browser.newContext({viewport:{width:1400,height:1000},serviceWorkers:'block',acceptDownloads:false});contexts.push(context);
 const errors=[],requests=[];
 await context.route('**/*',async route=>{const req=route.request();requests.push({url:req.url(),method:req.method()});
   if(!allowed(req.url(),req.method())){boundary.push('browser-denied:'+req.url());await route.abort('blockedbyclient');return;}await route.continue();});
 await context.routeWebSocket('**',socket=>{boundary.push('browser-websocket-denied:'+socket.url());socket.close();});
 await context.addInitScript(()=>{
   const state=window.__interaction={locations:[],previews:[],exports:[],downloads:[],violations:[],taskReads:0,unmount:null};
   window.WebSocket=class{constructor(){state.violations.push('WebSocket');throw Error('Fixture forbids WebSocket');}};
   window.EventSource=class{constructor(){state.violations.push('EventSource');throw Error('Fixture forbids EventSource');}};
   window.fetch=async(url,options={})=>{
     const u=new URL(typeof url==='string'?url:url.url,location.href),method=options.method||'GET';
     // Tasks navigation observes a supplied snapshot entirely in memory. No API listener.
     if(method==='GET'&&u.href==='http://localhost:3001/api/tasks'&&state.taskSnapshot){
       state.taskReads++;if(state.taskPollFailure)throw Error('Injected task observation failure');
       return new Response(JSON.stringify(state.taskSnapshot),{headers:{'Content-Type':'application/json'}});
     }
     const preview=u.origin==='http://localhost:3001'&&u.pathname==='/api/reports/preview';
     const format=u.pathname.match(/^\/api\/reports\/export\/(pdf|csv|json)$/)?.[1];
     if(method!=='POST'||u.origin!=='http://localhost:3001'||u.search||(!preview&&!format)){
       state.violations.push('fetch:'+method+':'+u.href);throw Error('Unexpected fixture fetch');}
     const body=JSON.parse(options.body);
     if(preview)return new Promise((resolve,reject)=>state.previews.push({body,resolve,reject}));
     state.exports.push({format,body});return new Response(new Blob(['INERT FIXTURE '+format]),{headers:{'x-cctv-report-renderer':'field-document-v2','Content-Disposition':'attachment; filename="fixture.'+format+'"'}});
   };
   // Observe a real anchor click and revoke call, but cancel the download default action.
   const urls=new Set(),create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
   URL.createObjectURL=blob=>{const url=create(blob);urls.add(url);return url;};
   URL.revokeObjectURL=url=>{urls.delete(url);revoke(url);};
   const anchorClick=HTMLAnchorElement.prototype.click;
   HTMLAnchorElement.prototype.click=function(){
     if(this.download)this.addEventListener('click',event=>{
       if(!urls.has(this.href))state.violations.push('unowned-download-url');
       state.downloads.push({filename:this.download,href:this.href});event.preventDefault();
     },{once:true});
     return anchorClick.call(this);
   };
   state.activeBlobUrls=()=>urls.size;
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(origin+entry);await page.getByRole('button',{name:'Fixture: Location',exact:true}).waitFor();
 return {page,context,errors,requests};
}
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const locationSection=page=>page.getByRole('region',{name:'Local Camera Location'});
async function location(page){await button(page,'Fixture: Location').click();await button(page,'Edit Camera Location').waitFor();}
async function edit(page,value){await button(page,'Edit Camera Location').click();await page.getByLabel('Camera Location',{exact:true}).fill(value);}
async function locCount(page,n){await page.waitForFunction(n=>window.__interaction.locations.length===n,n);}
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function resolveLocation(page,index,fail=false){await page.evaluate(({index,fail})=>{const r=window.__interaction.locations[index];fail?r.reject(Error('Injected save rejection')):r.resolve();},{index,fail});await settle(page);}
async function openReport(page){await button(page,'Fixture: Reports').click();await page.waitForFunction(()=>window.__interaction.previews.length>0);}
async function preview(page,index,title='Accepted preview',fail=false){
 await page.evaluate(({index,title,fail})=>{const r=window.__interaction.previews[index],q=r.body;
   if(fail){r.resolve(new Response(JSON.stringify({error:'Injected preview failure'}),{status:500}));return;}
   r.resolve(new Response(JSON.stringify({title,scope:q.scope,orientation:q.orientation,generation:{instant:'2026-10-19T12:00:00.000Z',timeZone:'UTC',displayTimestamp:'Fixture timestamp'},
     metadata:{...q.reportInformation,technician:q.reportInformation.technicianName,historyIncluded:q.includeHistory,liveEvidence:false},
     columns:q.columns.map(key=>({key,label:key})),rows:[{deviceId:'fixture',values:Object.fromEntries(q.columns.map(key=>[key,title]))}],pageEstimate:1}),{headers:{'Content-Type':'application/json'}}));
 },{index,title,fail});await settle(page);
}
async function acceptLatest(page,title='Accepted preview'){
 const n=await page.evaluate(()=>window.__interaction.previews.length);await preview(page,n-1,title);
 await page.getByRole('heading',{name:title,exact:true}).waitFor();await page.waitForFunction(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='pdf');return !!b&&!b.disabled;});return n-1;
}
async function requestCount(page,n){await page.waitForFunction(n=>window.__interaction.previews.length===n,n);}
async function check(name,group,run){
 if(!selectedGroups.has(group))return;
 const f=await pageFixture();let error;
 try{await run(f.page);assert.deepEqual(await f.page.evaluate(()=>window.__interaction.violations),[]);assert.deepEqual(f.errors,[]);assert.deepEqual(boundary,[]);
   assert.equal(await f.page.evaluate(()=>window.__interaction.activeBlobUrls()),0);results.push({group,name,status:'passed'});console.log('PASS '+group+' '+name);}
 catch(e){error=e;results.push({group,name,status:'failed',error:String(e.message)});console.error('FAIL '+group+' '+name+': '+e.message);}
 finally{await f.page.evaluate(()=>window.__interaction.unmount?.()).catch(e=>{throw Error('Fixture unmount failed: '+e.message);});
   assert.equal(await f.page.evaluate(()=>document.body.style.overflow),'');await f.context.close();assert.equal(browser.contexts().includes(f.context),false);}
 if(boundary.length||f.errors.length)throw error||Error('Safety or browser error');
 return !error;
}
async function suite(){
 await check('selected task absence, polling failure and reappearance have distinct notices','Q',async p=>{
   const stamp='2000-01-01T12:00:00.000Z';
   const task={id:'DIAGNOSTICS:fixture-observation',correlationId:'fixture-observation',kind:'DIAGNOSTICS',title:'Run Diagnostics',
     state:'COMPLETED',phase:'Operation completed',startedAt:stamp,updatedAt:stamp,endedAt:stamp,cancellable:false,
     diagnosticDevices:[{deviceId:'camera/A',state:'COMPLETED'}]};
   const snapshot={tasks:[task],active:0,attention:0},before=JSON.stringify(snapshot);
   await p.waitForFunction(()=>typeof window.__interaction.enableDiagnosticTasks==='function');
   await p.evaluate(snapshot=>{window.__interaction.taskSnapshot=snapshot;window.__interaction.enableDiagnosticTasks();},snapshot);
   await p.getByRole('button',{name:'Tasks',exact:true}).click();
   const dialog=p.getByRole('dialog',{name:'Tasks',exact:true}),details=dialog.getByRole('region',{name:'Task details'});
   const missing=dialog.getByText('The selected task is absent from the current Tasks snapshot. Its execution outcome cannot be determined from that absence.',{exact:true});
   const unavailable=dialog.getByText('Task status unavailable. Showing the last known state.',{exact:true});
   const row=dialog.getByRole('list',{name:'Recent tasks'}).getByRole('button');
   await row.waitFor();assert.equal(await missing.count(),0);await row.click();await details.waitFor();
   const originalDetails=await details.textContent();
   assert.ok(originalDetails.includes('COMPLETED — Operation completed'));
   assert.equal(await row.getAttribute('aria-pressed'),'true');
   await p.evaluate(()=>{window.__interaction.taskSnapshot={tasks:[],active:0,attention:0};});
   await missing.waitFor();assert.equal(await details.count(),0);assert.equal(await unavailable.count(),0);
   assert.equal(await dialog.getByText('No recent technician tasks.',{exact:true}).count(),1);
   for(const label of ['COMPLETED','FAILED','CANCELLED'])assert.ok(!(await dialog.textContent()).includes(label));
   await p.evaluate(()=>{window.__interaction.taskPollFailure=true;});
   await unavailable.waitFor();assert.equal(await missing.count(),0);assert.equal(await details.count(),0);
   await p.evaluate(snapshot=>{window.__interaction.taskSnapshot=snapshot;window.__interaction.taskPollFailure=false;},snapshot);
   await details.waitFor();assert.equal(await missing.count(),0);assert.equal(await unavailable.count(),0);
   assert.equal(await details.textContent(),originalDetails);assert.equal(await row.getAttribute('aria-pressed'),'true');
   // Failed observation with a cached record keeps the existing historical-state warning and details.
   await p.evaluate(()=>{window.__interaction.taskPollFailure=true;});
   await unavailable.waitFor();assert.equal(await missing.count(),0);assert.equal(await details.textContent(),originalDetails);
   assert.equal(await details.getByRole('button',{name:'Cancel Task',exact:true}).count(),0);
   assert.deepEqual(await p.evaluate(()=>window.__interaction.taskSnapshot),snapshot);assert.equal(JSON.stringify(snapshot),before);
   await locCount(p,0); // Any task action/Diagnose request or callback is forbidden by the fixture.
 });
 await check('lost acknowledgment is Unavailable; correlated outcomes and Tasks re-association stay authoritative','P',async p=>{
   const {TaskManager}=await import('../../core/tasks/task_manager.ts');
   const ip='192.0.2.50',old='2000-01-01T12:00:00.000Z',started='2000-01-01T12:01:00.000Z';
   const device={id:'observation-camera',anchor:{macAddress:'00:11:22:33:44:50',onvifEndpointUuid:'uuid-observation',vendor:'Synthetic'},
     network:{ipAddress:ip,subnetMask:'255.255.255.0',port:80,protocol:'ONVIF'},
     technician:{name:'Observation Camera',location:'North Door',notes:'Retained notes'},status:'UNREACHABLE',sessionVerification:'VERIFIED',
     evidenceProvenance:'SYNTHETIC_TEST',discoveredPhase:3,firstSeenAt:old,lastSeenAt:old,reachability:{subnetClassification:'LOCAL'},
     diagnostics:{lastRunStartedAt:started,lastRunCompletedAt:started,lastSuccessfulContactAt:old,previouslyReachableThisSession:true,
       checks:[{type:'HTTP',targetIp:ip,success:true,httpStatus:200,timestamp:old},
         {type:'PING',targetIp:ip,success:false,errorCategory:'TIMEOUT',timestamp:started}]}};
   const tasks=new TaskManager(),finish=(state,reason)=>{const id=tasks.begin('DIAGNOSTICS');tasks.diagnosticTargets(id,[device.id]);
     tasks.diagnosticResult(id,device.id,state,reason);tasks.update(id,{state,phase:state==='COMPLETED'?'DONE':state});return id;};
   const completed=finish('COMPLETED'),failed=finish('FAILED','DIAGNOSTIC_RESULT_STALE'),cancelled=finish('CANCELLED');
   const running=tasks.begin('DIAGNOSTICS');tasks.diagnosticTargets(running,[device.id]);
   const snapshot=tasks.snapshot(),before=JSON.stringify({device,snapshot});
   await p.waitForFunction(()=>typeof window.__interaction.setDiagnosticDevice==='function');
   const dialog=p.getByRole('dialog',{name:'Device Inspector',exact:true}),banner=dialog.getByRole('status');
   const show=async(request,state,unavailable=false)=>{
     await p.evaluate(({device,snapshot,request})=>window.__interaction.setDiagnosticDevice(device,{snapshot,request}),
       {device,snapshot:{...snapshot,unavailable},request});
     await banner.getByText('Diagnostics: '+state,{exact:true}).waitFor();
     assert.equal(await banner.locator('strong').textContent(),'Diagnostics: '+state);
   };
   await show({failed:true},'Unavailable');
   assert.ok((await banner.textContent()).includes('Check Tasks before retrying; an accepted operation may still be running.'));
   assert.equal(await banner.getByText('Diagnostics: Failed',{exact:true}).count(),0);
   await show({taskId:failed,failed:true},'Failed');
   assert.ok((await banner.textContent()).includes('Diagnostic result no longer applies.'));
   assert.ok(!(await banner.textContent()).includes('not acknowledged'));
   await show({taskId:completed,failed:true},'Completed');
   assert.equal(await dialog.getByText('Current status',{exact:true}).locator('..').locator('p').textContent(),'Unreachable');
   await show({taskId:cancelled,failed:true},'Cancelled');
   assert.ok((await banner.textContent()).includes('Diagnostics were cancelled.'));
   await show({taskId:completed},'Unavailable',true);
   await show({taskId:completed,failed:true},'Unavailable',true);
   await show({taskId:'absent-task'},'Unavailable');
   await show({taskId:running,failed:true},'Unavailable');
   await show({failed:true},'Unavailable');
   // Use the real Tasks component and its Inspect callback, as App does. All fetches
   // remain inert, and any Diagnose POST or action callback fails this fixture.
   await p.evaluate(snapshot=>{window.__interaction.taskSnapshot=snapshot;window.__interaction.enableDiagnosticTasks();},
     {tasks:snapshot.tasks.filter(t=>t.id===completed),active:0,attention:0});
   await p.waitForFunction(()=>window.__interaction.taskReads>0);
   await p.getByRole('button',{name:/^Tasks/}).click();
   const taskDialog=p.getByRole('dialog',{name:'Tasks',exact:true});
   await taskDialog.getByRole('list',{name:'Recent tasks'}).getByRole('button').click();
   await taskDialog.getByRole('region',{name:'Task details'}).getByRole('button',{name:'Inspect '+device.id+' — COMPLETED',exact:true}).click();
   await banner.getByText('Diagnostics: Completed',{exact:true}).waitFor();
   assert.equal(await taskDialog.count(),0);
   assert.equal(await dialog.getByText('Current status',{exact:true}).locator('..').locator('p').textContent(),'Unreachable');
   assert.equal(await dialog.getByText('Last successful contact',{exact:true}).locator('..').locator('p').textContent(),old);
   assert.equal(await dialog.getByRole('region',{name:'Latest diagnostic run',exact:true}).getByText('TIMEOUT',{exact:true}).count(),1);
   assert.equal(await dialog.getByRole('region',{name:'Earlier observations',exact:true}).getByText('Responded',{exact:true}).count(),1);
   assert.equal(await dialog.locator('h3 + p').textContent(),device.technician.name);
   assert.equal(await locationSection(p).locator('p').first().textContent(),device.technician.location);
   assert.deepEqual(await p.evaluate(()=>window.__interaction.diagnosticDevice),device); // Exact diagnostics/Notes: props only.
   assert.equal(JSON.stringify({device,snapshot:tasks.snapshot()}),before);
   assert.ok(await p.evaluate(()=>window.__interaction.taskReads>0));await locCount(p,0);
 });
 await check('accepted Unreachable, stale Failed and Cancelled outcomes are truthful in Details','O',async p=>{
   const {SiteProjectDatabase}=await import('../../core/storage/project_db.ts');
   const {DeviceDiagnosticEngine}=await import('../../core/engine/diagnostic_engine.ts');
   const {TaskManager}=await import('../../core/tasks/task_manager.ts');
   const {technicianErrorResponse}=await import('../../shared/error_presentation.ts');
   const old='2000-01-01T12:00:00.000Z',ip='192.0.2.50',db=new SiteProjectDatabase('ISOLATED_TEST');db.createNewProject('Synthetic outcomes');
   db.upsertDevice({id:'outcome-camera',anchor:{macAddress:'00:11:22:33:44:50',onvifEndpointUuid:'uuid-outcome',serialNumber:'serial-outcome',vendor:'Synthetic'},
     network:{ipAddress:ip,subnetMask:'255.255.255.0',port:80,protocol:'ONVIF'},technician:{name:'Outcome Camera',location:'North Door',notes:'Retained notes'},
     status:'ONLINE',sessionVerification:'VERIFIED',evidenceProvenance:'SYNTHETIC_TEST',discoveredPhase:3,firstSeenAt:old,lastSeenAt:old,
     reachability:{subnetClassification:'LOCAL'},diagnostics:{lastSuccessfulContactAt:old,previouslyReachableThisSession:true,
       checks:[{type:'HTTP',targetIp:ip,success:true,httpStatus:200,timestamp:old}]}});
   const tasks=new TaskManager();
   const start=()=>{const id=tasks.begin('DIAGNOSTICS');tasks.diagnosticTargets(id,['outcome-camera']);tasks.update(id,{state:'RUNNING',phase:'WORKING',progress:{completed:0,total:1}});return id;};
   const failure=(type,targetIp)=>({type,targetIp,success:false,errorCategory:'TIMEOUT',timestamp:new Date().toISOString()});
   const engine=new DeviceDiagnosticEngine({ping:{async check(target){return failure('PING',target);}},
     http:{async check(target,options){return failure(options.protocol==='https'?'HTTPS':'HTTP',target);}},
     tcp:{async check(target,options){return{...failure('TCP',target),port:options.port};}}});
   await p.waitForFunction(()=>typeof window.__interaction.setDiagnosticDevice==='function');
   const show=async(device,taskId)=>{await p.evaluate(({device,snapshot,taskId})=>window.__interaction.setDiagnosticDevice(device,{snapshot,request:{taskId}}),
     {device,snapshot:tasks.snapshot(),taskId});await settle(p);};
   const dialog=p.getByRole('dialog',{name:'Device Inspector',exact:true}),banner=dialog.getByRole('status');
   const currentStatus=()=>dialog.getByText('Current status',{exact:true}).locator('..').locator('p').textContent();
   const lastContact=()=>dialog.getByText('Last successful contact',{exact:true}).locator('..').locator('p').textContent();
   const completed=start(),result=await engine.diagnose(structuredClone(db.getDevices()[0]),{isRefresh:true});
   const accepted=db.applyDiagnosticRefresh(result);assert.ok(accepted);assert.equal(accepted.status,'UNREACHABLE');
   tasks.diagnosticResult(completed,accepted.id,'COMPLETED');tasks.update(completed,{state:'COMPLETED',phase:'DONE',progress:{completed:1,total:1}});
   await show(accepted,completed);await dialog.waitFor();
   assert.equal(await banner.getByText('Diagnostics: Completed',{exact:true}).count(),1);assert.equal(await currentStatus(),'Unreachable');
   assert.ok((await banner.textContent()).includes('Network failures remain evidence, not an operation failure.'));
   assert.equal(await dialog.getByRole('region',{name:'Latest diagnostic run',exact:true}).getByText('TIMEOUT',{exact:true}).count(),4);
   assert.equal(await dialog.getByRole('region',{name:'Earlier observations',exact:true}).getByText('Responded',{exact:true}).count(),1);
   assert.equal(await lastContact(),old);
   const rejected=start(),stale=structuredClone(accepted);
   db.upsertDevice({...structuredClone(accepted),network:{...accepted.network,ipAddress:'192.0.2.99'}});
   const before=JSON.stringify(db.getSession());assert.equal(db.applyDiagnosticRefresh(stale),undefined);
   assert.equal(JSON.stringify(db.getSession()),before);
   const staleError=technicianErrorResponse(Object.assign(Error('Diagnostic result no longer applies'),{code:'DIAGNOSTIC_RESULT_STALE'}),{operation:'DIAGNOSE',deviceId:accepted.id,fallbackCode:'OPERATION_FAILED'});
   tasks.diagnosticResult(rejected,accepted.id,'FAILED','DIAGNOSTIC_RESULT_STALE');tasks.update(rejected,{state:'FAILED',phase:'FAILED',progress:{completed:1,total:1}});
   const current=db.getDevices()[0];await show(current,rejected);
   assert.equal(await banner.getByText('Diagnostics: Failed',{exact:true}).count(),1);
   assert.ok((await banner.textContent()).includes(staleError.presentation.title));
   assert.ok((await banner.textContent()).includes(staleError.presentation.message));
   assert.ok((await banner.textContent()).includes(staleError.presentation.action));
   assert.equal(await banner.getByText('Diagnostics: Completed',{exact:true}).count(),0);assert.equal(await currentStatus(),'Unreachable');
   assert.equal(await dialog.getByText('Current IP: 192.0.2.99 · Subnet: LOCAL',{exact:true}).count(),1);
   assert.equal(await dialog.locator('h3 + p').textContent(),current.technician.name);
   assert.equal(await locationSection(p).locator('p').first().textContent(),current.technician.location);
   assert.equal(await lastContact(),old);assert.equal(await dialog.getByText('Responded',{exact:true}).count(),0);
   assert.equal(await dialog.getByRole('region',{name:'Latest diagnostic run',exact:true}).count(),0);
   assert.deepEqual(await p.evaluate(()=>window.__interaction.diagnosticDevice),current);
   // Device Details has no Notes field: exact diagnostics/Notes remain storage/props assertions.
   assert.equal(current.technician.notes,'Retained notes');assert.deepEqual(current.diagnostics,accepted.diagnostics);
   const cancelled=start();tasks.diagnosticResult(cancelled,current.id,'CANCELLED');tasks.update(cancelled,{state:'CANCELLED',phase:'CANCELLED',progress:{completed:1,total:1}});
   await show(current,cancelled);assert.equal(await banner.getByText('Diagnostics: Cancelled',{exact:true}).count(),1);
   assert.ok((await banner.textContent()).includes('Diagnostics were cancelled.'));
   assert.equal(await banner.getByText('Diagnostics: Failed',{exact:true}).count(),0);assert.equal(await banner.getByText('Diagnostics: Completed',{exact:true}).count(),0);
   assert.ok(!(await banner.textContent()).includes(staleError.presentation.title));assert.equal(await lastContact(),old);
   // An old failed operation must not replace the explicitly selected newer task.
   await show(current,completed);assert.equal(await banner.getByText('Diagnostics: Completed',{exact:true}).count(),1);
   assert.ok(!(await banner.textContent()).includes(staleError.presentation.title));
   assert.equal(JSON.stringify(db.getSession()),before);await locCount(p,0);
 });
 await check('latest failed run is separated from earlier success and unclassified evidence','N',async p=>{
   const {SiteProjectDatabase}=await import('../../core/storage/project_db.ts');
   const {DeviceDiagnosticEngine}=await import('../../core/engine/diagnostic_engine.ts');
   const ip='192.0.2.50',older='2000-01-01T12:00:00.000Z',earlier='2000-01-01T12:00:01.000Z';
   const db=new SiteProjectDatabase('ISOLATED_TEST');db.createNewProject('Synthetic evidence grouping');
   db.upsertDevice({id:'evidence-camera',anchor:{macAddress:'00:11:22:33:44:50',onvifEndpointUuid:'uuid-evidence',vendor:'Synthetic'},
     network:{ipAddress:ip,subnetMask:'255.255.255.0',port:80,protocol:'ONVIF'},technician:{name:'Evidence Camera',location:'North Door',notes:'Retained'},
     status:'ONLINE',sessionVerification:'VERIFIED',evidenceProvenance:'SYNTHETIC_TEST',discoveredPhase:3,firstSeenAt:older,lastSeenAt:earlier,
     reachability:{subnetClassification:'LOCAL'},diagnostics:{lastRunStartedAt:older,lastRunCompletedAt:earlier,lastSuccessfulContactAt:older,
       previouslyReachableThisSession:true,checks:[{type:'HTTP',targetIp:ip,success:true,httpStatus:200,timestamp:older},
         {type:'PING',targetIp:ip,success:false,errorCategory:'TIMEOUT',timestamp:earlier}]}});
   const savedOnline=db.exportProjectJson(),observed=structuredClone(db.getDevices()[0]);
   const failed=(type,targetIp)=>({type,targetIp,success:false,errorCategory:'TIMEOUT',timestamp:new Date().toISOString()});
   const engine=new DeviceDiagnosticEngine({ping:{async check(target){return failed('PING',target);}},
     http:{async check(target,options){return failed(options.protocol==='https'?'HTTPS':'HTTP',target);}},
     tcp:{async check(target,options){return{...failed('TCP',target),port:options.port};}}});
   await engine.diagnose(observed,{isRefresh:true});
   const stored=db.applyDiagnosticRefresh(observed);assert.equal(stored.status,'UNREACHABLE');
   assert.equal(stored.diagnostics.lastSuccessfulContactAt,older);
   // An earlier-IP check must remain excluded, even with a latest-run timestamp.
   stored.diagnostics.checks.push({type:'HTTP',targetIp:'192.0.2.99',success:true,httpStatus:299,timestamp:new Date().toISOString()});
   const snapshot=JSON.stringify(db.getSession());
   await p.waitForFunction(()=>typeof window.__interaction.setDiagnosticDevice==='function');
   const supply=async device=>{await p.evaluate(device=>window.__interaction.setDiagnosticDevice(device),device);await settle(p);};
   const dialog=p.getByRole('dialog',{name:'Device Inspector',exact:true});
   const region=name=>dialog.getByRole('region',{name,exact:true});
   const cards=section=>section.locator('div.border.rounded-lg');
   const timestampTexts=section=>cards(section).locator('div.font-mono > span:last-child').allTextContents();
   const currentStatus=()=>dialog.getByText('Current status',{exact:true}).locator('..').locator('p').textContent();
   const lastContact=()=>dialog.getByText('Last successful contact',{exact:true}).locator('..').locator('p').textContent();
   await supply(stored);await dialog.waitFor();
   const latest=region('Latest diagnostic run'),history=region('Earlier observations');
   assert.equal(await currentStatus(),'Unreachable');assert.equal(await lastContact(),older);
   assert.equal(await latest.getByText('Responded',{exact:true}).count(),0);
   assert.equal(await history.getByText('Responded',{exact:true}).count(),1);
   assert.equal(await history.getByText('HTTP 200',{exact:true}).count(),1);
   assert.equal(await latest.getByText('TIMEOUT',{exact:true}).count(),4);
   assert.equal(await cards(latest).count(),4);assert.equal(await cards(history).count(),2);
   assert.deepEqual(await timestampTexts(history),[earlier,older]);
   const expectedLatest=stored.diagnostics.checks.filter(c=>c.targetIp===ip&&Date.parse(c.timestamp)>=Date.parse(stored.diagnostics.lastRunStartedAt)).reverse();
   assert.deepEqual(await timestampTexts(latest),expectedLatest.map(c=>c.timestamp));
   assert.deepEqual(await cards(latest).locator('div.flex.justify-between > span:first-child').allTextContents(),expectedLatest.map(c=>c.type==='TCP'?'TCP '+c.port:c.type));
   assert.equal(await dialog.getByText('HTTP 299',{exact:true}).count(),0);
   for(const boundary of [undefined,'','not-a-date','2026-10-29T12:00:00','2026-02-30T12:00:00.000Z']){
     const value=structuredClone(stored);value.diagnostics.lastRunStartedAt=boundary;await supply(value);
     assert.equal(await region('Latest diagnostic run').count(),0);
     assert.equal(await cards(region('Earlier observations')).count(),6);
     assert.equal(await currentStatus(),'Unreachable');assert.equal(await lastContact(),older);
   }
   // A valid run boundary never makes missing, malformed or ambiguous check times latest.
   const uncertain=structuredClone(stored);
   for(const timestamp of [undefined,'not-a-date','2026-10-29T12:00:00','2026-02-30T12:00:00.000Z'])
     uncertain.diagnostics.checks.push({type:'HTTP',targetIp:ip,success:true,httpStatus:298,timestamp});
   await supply(uncertain);assert.equal(await cards(region('Latest diagnostic run')).count(),4);
   assert.equal(await region('Latest diagnostic run').getByText('HTTP 298',{exact:true}).count(),0);
   assert.equal(await region('Earlier observations').getByText('HTTP 298',{exact:true}).count(),4);
   const atBoundary=structuredClone(stored);atBoundary.diagnostics.checks.push({type:'HTTP',targetIp:ip,success:false,errorCategory:'TIMEOUT',httpStatus:297,timestamp:atBoundary.diagnostics.lastRunStartedAt});
   await supply(atBoundary);assert.equal(await region('Latest diagnostic run').getByText('HTTP 297',{exact:true}).count(),1);
   assert.equal(JSON.stringify(db.getSession()),snapshot,'rendering must not mutate stored evidence or status');
   const reopened=new SiteProjectDatabase('ISOLATED_TEST');reopened.importProjectJson(savedOnline);
   const loaded=reopened.getDevices()[0];assert.equal(loaded.status,'UNKNOWN');assert.equal(loaded.sessionVerification,'NOT_VERIFIED');
   assert.equal(loaded.savedStatusSnapshot,'ONLINE');assert.equal(loaded.diagnostics,undefined);
   await supply(loaded);assert.equal(await currentStatus(),'Unknown');assert.equal(await lastContact(),'Unknown');
   assert.equal(await region('Latest diagnostic run').count(),0);assert.equal(await region('Earlier observations').count(),0);
   assert.equal(await dialog.getByText('Responded',{exact:true}).count(),0);
   assert.equal(await dialog.getByText('No diagnostic checks have run in this session.',{exact:true}).count(),1);
   assert.equal(await p.evaluate(()=>window.__interaction.diagnosticDevice.sessionVerification),'NOT_VERIFIED');
   await locCount(p,0);assert.equal(await p.evaluate(()=>window.__interaction.previews.length+window.__interaction.exports.length),0);
 });
 await check('stored diagnostic relationship refresh renders consistently and stale IP is rejected','M',async p=>{
   // Node-only real storage/relationship/diagnostic boundaries. None enter the browser source graph.
   const {SiteProjectDatabase}=await import('../../core/storage/project_db.ts');
   const {DeviceDiagnosticEngine}=await import('../../core/engine/diagnostic_engine.ts');
   const {applyNetworkRelationship,DIFFERENT_NETWORK_MESSAGE}=await import('../../shared/network_relationship.ts');
   const stamp='2026-10-29T12:00:00.000Z',ip='192.0.2.50';
   const adapter=(address)=>({interfaceIndex:7,interfaceAlias:address==='192.0.2.10'?'New Ethernet':'Old Ethernet',mediaType:'ETHERNET',
     operationalStatus:'Up',eligible:true,dhcpEnabled:false,ipv4Addresses:[{address,prefixLength:24}],defaultGateways:[],dnsAutomatic:true,dnsServers:[],capturedAt:stamp});
   const db=new SiteProjectDatabase('ISOLATED_TEST');db.createNewProject('Synthetic rendered relationship');
   const device={id:'render-camera',anchor:{macAddress:'00:11:22:33:44:50',onvifEndpointUuid:'uuid-render-camera',serialNumber:'serial-render-camera',vendor:'Synthetic'},
     network:{ipAddress:ip,subnetMask:'255.255.255.0',port:80,protocol:'ONVIF',ipAddressHistory:['192.0.2.40',ip]},
     technician:{name:'  Entrance Camera  ',location:'  North Door  ',notes:'  Preserve technician notes  '},status:'UNKNOWN',sessionVerification:'NOT_VERIFIED',
     evidenceProvenance:'SYNTHETIC_TEST',discoveredPhase:3,firstSeenAt:stamp,lastSeenAt:stamp};
   applyNetworkRelationship(device,[adapter('198.51.100.10')],[device]);db.upsertDevice(device);db.exportProjectJsonForSave();
   const original=structuredClone(db.getDevices()[0]);
   await p.waitForFunction(()=>typeof window.__interaction.setDiagnosticDevice==='function');
   const supply=async value=>{await p.evaluate(value=>window.__interaction.setDiagnosticDevice(value),value);await settle(p);};
   const dialog=p.getByRole('dialog',{name:'Device Inspector',exact:true});
   const assertIdentity=async()=>{
     assert.equal(await dialog.locator('h3 + p').textContent(),original.technician.name);
     assert.equal(await locationSection(p).locator('p').first().textContent(),original.technician.location);
     await button(p,'Identity & Network').click();
     for(const [label,value] of [['Device IP',ip+':80'],['MAC',original.anchor.macAddress],['ONVIF UUID',original.anchor.onvifEndpointUuid],['Serial',original.anchor.serialNumber]]){
       assert.equal(await dialog.getByText(label,{exact:true}).locator('..').locator('p').textContent(),value);
     }
     await button(p,'Diagnostics').click();
   };
   await supply(original);await dialog.waitFor();
   assert.equal(await dialog.getByText('Current IP: '+ip+' · Subnet: DIFFERENT_SUBNET',{exact:true}).count(),1);
   assert.equal(await dialog.getByText('Adapter: Old Ethernet • 198.51.100.10',{exact:true}).count(),1);
   assert.ok((await dialog.textContent()).includes(DIFFERENT_NETWORK_MESSAGE));
   await assertIdentity();
   const observed=applyNetworkRelationship(structuredClone(original),[adapter('192.0.2.10')],db.getDevices());
   const relationship={subnetClassification:observed.reachability.subnetClassification,
     relationshipAdapter:structuredClone(observed.reachability.relationshipAdapter),pairEligibility:structuredClone(observed.reachability.pairEligibility)};
   let providerCalls=0;
   const evidence=(type,targetIp,success=false)=>{providerCalls++;return{type,targetIp,success,timestamp:stamp};};
   const engine=new DeviceDiagnosticEngine({ping:{async check(target){return evidence('PING',target);}},
     http:{async check(target,options){return evidence(options.protocol==='https'?'HTTPS':'HTTP',target,options.protocol==='http');}},
     tcp:{async check(target){return evidence('TCP',target);}}});
   await engine.diagnose(observed);
   const stored=db.applyDiagnosticRefresh(observed,relationship);assert.ok(stored);assert.equal(providerCalls,4);
   assert.deepEqual(stored.anchor,original.anchor);assert.deepEqual(stored.technician,original.technician);assert.deepEqual(stored.network,original.network);
   assert.equal(db.getSession().dirty,false);
   await supply(stored);await assertIdentity();
   const assertCurrent=async()=>{
     assert.equal(await dialog.getByText('Current status',{exact:true}).locator('..').locator('p').textContent(),'Online');
     assert.equal(await dialog.getByText('Current IP: '+ip+' · Subnet: LOCAL',{exact:true}).count(),1);
     assert.equal(await dialog.getByText('Adapter: New Ethernet • 192.0.2.10',{exact:true}).count(),1);
     const text=await dialog.textContent();assert.ok(!text.includes(DIFFERENT_NETWORK_MESSAGE));assert.ok(!text.includes('DIFFERENT_SUBNET'));
     assert.ok(!text.includes('Old Ethernet'));assert.ok(!text.includes('198.51.100.10'));
   };
   await assertCurrent();
   await button(p,'Identity & Network').click();
   assert.equal(await dialog.getByText('Subnet relationship',{exact:true}).locator('..').locator('p').textContent(),'LOCAL');
   assert.equal(await dialog.getByText('Originating adapter',{exact:true}).locator('..').locator('p').textContent(),'New Ethernet — 192.0.2.10 / 255.255.255.0');
   assert.ok(!(await dialog.textContent()).includes('Old Ethernet'));await button(p,'Diagnostics').click();
   // Notes are not a rendered drawer field. Verify storage and props without inventing a DOM assertion.
   assert.equal(await p.evaluate(()=>window.__interaction.diagnosticDevice.technician.notes),original.technician.notes);
   const before=JSON.stringify(db.getSession()),stale=structuredClone(original);stale.network.ipAddress='192.0.2.99';
   assert.equal(db.applyDiagnosticRefresh(stale,{subnetClassification:'DIFFERENT_SUBNET',relationshipAdapter:original.reachability.relationshipAdapter}),undefined);
   assert.equal(JSON.stringify(db.getSession()),before);await supply(db.getDevices()[0]);await assertCurrent();await assertIdentity();
   await locCount(p,0);assert.equal(await p.evaluate(()=>window.__interaction.previews.length+window.__interaction.exports.length),0);
 });
 await check('open shows selected confirmed value without writes','A',async p=>{await location(p);assert.ok((await locationSection(p).textContent()).includes('Lobby'));await button(p,'Edit Camera Location').click();assert.equal(await p.getByLabel('Camera Location',{exact:true}).inputValue(),'Lobby');await locCount(p,0);});
 for(const key of ['Cancel','Escape'])await check('draft cancellation by '+key,'B',async p=>{await location(p);await edit(p,'Discard me');key==='Escape'?await p.getByLabel('Camera Location',{exact:true}).press('Escape'):await button(p,'Cancel').click();await button(p,'Edit Camera Location').waitFor();assert.ok((await locationSection(p).textContent()).includes('Lobby'));await locCount(p,0);});
 for(const value of ['Lobby','','  North Door  '])await check('save semantics '+JSON.stringify(value),'C',async p=>{await location(p);await edit(p,value);await button(p,'Save Location').click();if(value==='Lobby'){await button(p,'Edit Camera Location').waitFor();await locCount(p,0);}else{await locCount(p,1);assert.deepEqual(await p.evaluate(()=>window.__interaction.locations.map(({id,value})=>({id,value}))),[{id:'camera/A',value}]);await resolveLocation(p,0);await button(p,'Edit Camera Location').waitFor();await button(p,'Edit Camera Location').click();assert.equal(await p.getByLabel('Camera Location',{exact:true}).inputValue(),value);}});
 await check('pending callback is single, stable-ID and not early acknowledgment','D',async p=>{await location(p);await edit(p,'Pending');await button(p,'Save Location').click();await locCount(p,1);assert.equal(await button(p,'Saving…').isDisabled(),true);assert.equal(await button(p,'Cancel').isDisabled(),true);assert.ok((await locationSection(p).textContent()).includes('Lobby'));await p.keyboard.press('Enter');await locCount(p,1);await resolveLocation(p,0);await button(p,'Edit Camera Location').waitFor();assert.ok((await locationSection(p).textContent()).includes('Pending'));});
 await check('failed save retains confirmed value and retry succeeds','E',async p=>{await location(p);await edit(p,'Retry value');await button(p,'Save Location').click();await locCount(p,1);await resolveLocation(p,0,true);await p.getByRole('alert').waitFor();assert.ok((await p.getByRole('alert').textContent()).includes('Try again'));assert.ok((await locationSection(p).textContent()).includes('Lobby'));await button(p,'Save Location').click();await locCount(p,2);await resolveLocation(p,1);await button(p,'Edit Camera Location').waitFor();assert.ok((await locationSection(p).textContent()).includes('Retry value'));});
 for(const transition of ['B','ABA','close'])await check('stale location acknowledgment after '+transition,'F',async p=>{await location(p);await edit(p,'Obsolete');await button(p,'Save Location').click();await locCount(p,1);if(transition==='close')await button(p,'Fixture: Close').click();else{await button(p,'Fixture: B').click();if(transition==='ABA')await button(p,'Fixture: A').click();}await resolveLocation(p,0);if(transition==='close')assert.equal(await p.getByRole('dialog').count(),0);else{await button(p,'Edit Camera Location').waitFor();assert.ok((await locationSection(p).textContent()).includes(transition==='B'?'Garage':'Lobby'));assert.ok(!(await locationSection(p).textContent()).includes('Obsolete'));}});
 await check('preview opening uses effective selected scope and request settings','G',async p=>{await openReport(p);const q=await p.evaluate(()=>window.__interaction.previews.at(-1).body);assert.equal(q.scope,'SELECTED');assert.deepEqual(q.deviceIds,['camera/A']);assert.equal(q.reportInformation.projectName,'Fixture Project');assert.ok(q.columns.includes('NOTES'));await acceptLatest(p);});
 await check('close/reopen rejects old preview and releases scroll lock','H',async p=>{await openReport(p);const old=await p.evaluate(()=>window.__interaction.previews.length-1);assert.equal(await p.evaluate(()=>document.body.style.overflow),'hidden');await button(p,'Close reports').click();await p.waitForFunction(()=>document.body.style.overflow==='');await button(p,'Fixture: Reports').click();await p.waitForFunction(n=>window.__interaction.previews.length>n,old+1);await acceptLatest(p,'Reopened current');await preview(p,old,'Obsolete close');assert.equal(await p.getByRole('heading',{name:'Obsolete close',exact:true}).count(),0);assert.equal(await p.getByRole('heading',{name:'Reopened current',exact:true}).count(),1);});
 for(const mutation of ['orientation','columns','selection','information'])await check('settings change and revert revoke export: '+mutation,'I',async p=>{await openReport(p);await acceptLatest(p);if(mutation==='orientation'){const control=p.getByRole('combobox',{name:/^Orientation/});await control.selectOption('LANDSCAPE');await control.selectOption('PORTRAIT');}else if(mutation==='columns'){await p.getByLabel('Notes',{exact:true}).uncheck();await p.getByLabel('Notes',{exact:true}).check();}else if(mutation==='selection')await button(p,'Fixture: Select B').click();else{const control=p.getByRole('textbox',{name:'Technician Name',exact:true});await control.fill('Changed');await control.fill('Fixture Technician');}assert.equal(await button(p,'pdf').isDisabled(),true);const n=await p.evaluate(()=>window.__interaction.previews.length);await button(p,'Update Preview').click();await requestCount(p,n+1);await acceptLatest(p,'Refreshed');});
 for(const format of ['pdf','csv','json'])await check('export '+format+' carries accepted snapshot and generation','J',async p=>{await openReport(p);const index=await acceptLatest(p);const original=await p.evaluate(i=>window.__interaction.previews[i].body,index);await button(p,format).click();await p.waitForFunction(()=>window.__interaction.exports.length===1);const sent=await p.evaluate(()=>window.__interaction.exports[0]);assert.deepEqual(sent,{format,body:{...original,generatedAt:'2026-10-19T12:00:00.000Z',timeZone:'UTC'}});await p.waitForFunction(()=>window.__interaction.downloads.length===1);assert.equal(await p.evaluate(()=>window.__interaction.downloads[0].filename),'fixture.'+format);assert.equal(await p.evaluate(()=>window.__interaction.activeBlobUrls()),0);});
 for(const fail of [false,true])await check('obsolete preview '+(fail?'failure':'success')+' cannot replace newer UI','K',async p=>{await openReport(p);const old=await p.evaluate(()=>window.__interaction.previews.length-1);await button(p,'Close reports').click();await button(p,'Fixture: Reports').click();await p.waitForFunction(n=>window.__interaction.previews.length>n,old+1);await acceptLatest(p,'Newest preview');await preview(p,old,'Wrong old preview',fail);assert.equal(await p.getByRole('heading',{name:'Newest preview',exact:true}).count(),1);assert.equal(await button(p,'pdf').isDisabled(),false);assert.equal(await p.getByText('Injected preview failure',{exact:true}).count(),0);});
 await check('filtered table toggles preserve hidden IDs and zero rows','L',async p=>{await button(p,'Fixture: Table').click();await p.getByLabel('Fixture filter',{exact:true}).selectOption('camera/B');const head=p.locator('thead input[type=checkbox]');assert.equal(await head.isChecked(),false);await head.check();assert.equal(await p.getByTestId('selection').textContent(),'camera/A,camera/B');await head.uncheck();assert.equal(await p.getByTestId('selection').textContent(),'camera/A');await p.getByLabel('Fixture filter',{exact:true}).selectOption('none');assert.equal(await head.isChecked(),false);await head.click();assert.equal(await head.isChecked(),false);assert.equal(await p.getByTestId('selection').textContent(),'camera/A');await p.getByLabel('Fixture filter',{exact:true}).selectOption('all');assert.equal(await p.locator('tbody input[type=checkbox]').nth(0).isChecked(),true);assert.equal(await p.locator('tbody input[type=checkbox]').nth(1).isChecked(),false);});
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
(async()=>{let fatal;
 try{await setup();await suite();}catch(e){fatal=e;console.error(e.stack);}
 finally{try{await cleanup();}catch(e){fatal=e;console.error('CLEANUP UNCERTAIN; preserve root '+root+': '+e.stack);}}
 const groups=Object.fromEntries('ABCDEFGHIJKLMNOPQ'.split('').map(group=>{const rows=results.filter(r=>r.group===group);return[group,{passed:rows.filter(r=>r.status==='passed').length,failed:rows.filter(r=>r.status==='failed').length,status:rows.length?(rows.some(r=>r.status==='failed')?'failed':'passed'):(selectedGroups.has(group)?'blocked':'not-executed-filter')}];}));
 console.log(JSON.stringify({groups,results,boundary,cleanupConfirmed:closed,listenerClosed:server?!server.listening:null,browserDisconnected:browser?!browser.isConnected():null,
   remainingFixtureRoot:root?fs.existsSync(root):false,removedOwnedFiles:removedFiles,fatal:fatal?String(fatal.message):null},null,2));
 if(fatal||results.some(r=>r.status==='failed')||Object.values(groups).some(r=>r.status==='blocked'))process.exitCode=1;
})();
