// UI-TEST-001: actual React/Edge interactions; no App, backend or real API.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const ts=require('typescript');
const repo=path.resolve(__dirname,'../../..'),entry='/src/test/browser/ui_component_interactions.html';
const selectedGroups=new Set((process.env.UI_INTERACTION_GROUPS||'ABCDEFGHIJKL').replaceAll(',','').split(''));
assert.ok(selectedGroups.size>0&&[...selectedGroups].every(g=>'ABCDEFGHIJKL'.includes(g)),'Invalid group selection');
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
   const state=window.__interaction={locations:[],previews:[],exports:[],downloads:[],violations:[],unmount:null};
   window.WebSocket=class{constructor(){state.violations.push('WebSocket');throw Error('Fixture forbids WebSocket');}};
   window.EventSource=class{constructor(){state.violations.push('EventSource');throw Error('Fixture forbids EventSource');}};
   window.fetch=async(url,options={})=>{
     const u=new URL(typeof url==='string'?url:url.url,location.href),method=options.method||'GET';
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
 const groups=Object.fromEntries('ABCDEFGHIJKL'.split('').map(group=>{const rows=results.filter(r=>r.group===group);return[group,{passed:rows.filter(r=>r.status==='passed').length,failed:rows.filter(r=>r.status==='failed').length,status:rows.length?(rows.some(r=>r.status==='failed')?'failed':'passed'):(selectedGroups.has(group)?'blocked':'not-executed-filter')}];}));
 console.log(JSON.stringify({groups,results,boundary,cleanupConfirmed:closed,listenerClosed:server?!server.listening:null,browserDisconnected:browser?!browser.isConnected():null,
   remainingFixtureRoot:root?fs.existsSync(root):false,removedOwnedFiles:removedFiles,fatal:fatal?String(fatal.message):null},null,2));
 if(fatal||results.some(r=>r.status==='failed')||Object.values(groups).some(r=>r.status==='blocked'))process.exitCode=1;
})();
