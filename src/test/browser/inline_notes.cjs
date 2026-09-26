// Isolated real metadata storage with the actual App/table. No physical backend operations.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {mock}=require('./advanced_scan.cjs');
let passed=0;const check=(v,n)=>{assert.ok(v,n);console.log('PASS: '+n);passed++};
(async()=>{
 const {SiteProjectDatabase}=await import('../../core/storage/project_db.ts');
 const {LegacyConfigurationBoundary}=await import('../../core/network/legacy_configuration_boundary.ts');
 const {ReportSet}=await import('../../core/reporting/report_set.ts');
 const db=new SiteProjectDatabase(),boundary=new LegacyConfigurationBoundary(db),reports=new ReportSet(()=>db.getSession());
 const camera=id=>({id,anchor:{macAddress:id==='A'?'00:50:f9:63:fb:0f':'e4:30:22:cd:68:85',vendor:'Fixture'},technician:{name:id,notes:'Keep'},network:{ipAddress:'192.168.1.100',subnetMask:'255.255.255.0',port:80,protocol:'ONVIF'},status:'ONLINE',discoveredPhase:3,firstSeenAt:'now',lastSeenAt:'now'});
 db.startQuickWork();['A','B'].forEach(id=>db.upsertDevice(camera(id)));reports.add(['A']);
 let fail=false;const updates=[];
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));await mock(page);
 await page.exposeFunction('nameBackend',(path,body)=>{
  if(path==='/api/project/session')return{body:db.getSession()};
  if(path==='/api/project')return{body:db.getProject()};
  if(path==='/api/report-set')return{body:reports.snapshot()};
  updates.push({path,body});if(fail)return{status:500,body:{error:'Injected failure'}};
  try{return{body:{status:'LOCAL_METADATA_UPDATED',device:boundary.updateLocalMetadata(decodeURIComponent(path.split('/')[3]),body)}}}catch(e){return{status:400,body:{error:e.message}}}
 });
 await page.addInitScript(()=>{const old=fetch;window.fetch=async(url,o={})=>{const path=new URL(url,location.href).pathname;if(['/api/project','/api/project/session','/api/report-set'].includes(path)||path.match(/^\/api\/device\/[^/]+\/config$/)){const r=await nameBackend(path,o.body?JSON.parse(o.body):{});return new Response(JSON.stringify(r.body),{status:r.status||200,headers:{'Content-Type':'application/json'}})}return old(url,o)}});
 const load=()=>page.goto('http://127.0.0.1:5179/src/test/browser/advanced_scan.html?app');
 const edit=name=>page.getByRole('button',{name:'Edit name for '+name,exact:true});const input=()=>page.getByRole('textbox',{name:'Camera Name',exact:true});
 const notes=name=>page.getByRole('button',{name:'Edit notes for '+name,exact:true});
 const area=()=>page.getByRole('textbox',{name:'Camera Notes',exact:true});
 await load();await notes('A').click();check(await area().evaluate(el=>el.tagName==='TEXTAREA'),'click Notes opens multiline editor');check(await area().inputValue()==='Keep','existing Notes loaded');
 await area().fill('First');const n=updates.length;await area().press('End');await area().press('Enter');await area().press('A');check(await area().inputValue()==='First\nA'&&updates.length===n,'Enter inserts newline without saving');
 await page.getByRole('button',{name:'Name',exact:true}).click();await notes('A').waitFor();await page.waitForFunction(()=>document.querySelector('tbody')?.textContent.includes('First'));check(db.getDeviceById('A').technician.notes==='First\nA','blur saves multiline Notes');check(db.getSession().mode==='QUICK_WORK'&&!db.getSession().filePath&&db.listProjectHistory().length===0,'Quick Work Notes remain session-only');
 const before=updates.length;await notes('A').click();await area().fill('Discard');await area().press('Escape');check(await area().count()===0&&updates.length===before&&db.getDeviceById('A').technician.notes==='First\nA','Escape cancels and restores confirmed Notes');
 await notes('A').click();await area().fill('x'.repeat(1001));check((await area().inputValue()).length===1000,'input prevents over 1000 characters');await notes('B').click();check(await area().count()===1&&await area().inputValue()==='Keep'&&await input().count()===0,'Notes switch leaves exactly one editor');await page.waitForFunction(()=>document.querySelector('tbody')?.textContent.includes('xxx'));check(db.getDeviceById('A').technician.notes.length===1000,'1000-character Notes accepted');await area().press('Escape');
 assert.throws(()=>boundary.updateLocalMetadata('A',{technician:{notes:'z'.repeat(1001)}}));check(db.getDeviceById('A').technician.notes.length===1000,'storage rejects oversized Notes without mutation');
 await edit('A').click();await input().fill('Lobby');await notes('A').click();check(await input().count()===0&&await area().count()===1,'Name to Notes enforces mutual exclusion');await page.waitForFunction(()=>document.querySelector('tbody')?.textContent.includes('Lobby'));
 check(db.getDeviceById('A').technician.name==='Lobby','Name to Notes saves Name');
 await area().fill('Notes to Name');await edit('B').click();check(await input().count()===1&&await area().count()===0,'Notes to Name enforces mutual exclusion');await page.waitForFunction(()=>document.querySelector('tbody')?.textContent.includes('Notes to Name'));check(db.getDeviceById('A').technician.notes==='Notes to Name','Notes to Name saves Notes');await input().press('Escape');
 await notes('Lobby').click();await area().fill('Next notes');await notes('B').click();check(await area().count()===1&&await area().inputValue()==='Keep','Notes to another Notes loads intended camera');await page.waitForFunction(()=>document.querySelector('tbody')?.textContent.includes('Next notes'));check(db.getDeviceById('A').technician.notes==='Next notes','Notes to another Notes saves previous draft');await area().press('Escape');
 await notes('Lobby').click();await area().fill('Moved camera\nSecond line');db.getDeviceById('A').network.ipAddress='192.168.1.120';await page.evaluate(project=>__test.emit({type:'DEVICE_DISCOVERED',data:{project}}),db.getProject());await page.getByRole('button',{name:'Name',exact:true}).click();await page.waitForFunction(()=>document.querySelector('tbody')?.textContent.includes('Moved camera'));check(db.getDeviceById('A').technician.notes==='Moved camera\nSecond line'&&db.getDeviceById('B').technician.notes==='Keep'&&updates.at(-1).path==='/api/device/A/config','IP refresh and sorting preserve stable-ID Notes binding');
 fail=true;await notes('Lobby').click();await area().fill('Failed draft');await edit('B').click();await page.getByRole('alert').filter({hasText:'Notes was not saved'}).waitFor();check(db.getDeviceById('A').technician.notes==='Moved camera\nSecond line'&&db.getDeviceById('B').technician.notes==='Keep'&&await page.getByText('Failed draft',{exact:true}).count()===0,'failed save shows error, retains confirmed Notes and never writes peer');await input().press('Escape');fail=false;
 const members=reports.snapshot().members.map(m=>m.id);db.createNewProject('Notes');['A','B'].forEach(id=>db.upsertDevice(camera(id)));db.exportProjectJsonForSave();await load();await notes('A').click();await area().fill('Cancel Project');await area().press('Escape');check(!db.getSession().dirty,'Project Notes cancellation stays clean');const count=updates.length;await notes('A').click();await edit('B').click();check(updates.length===count&&!db.getSession().dirty,'unchanged Notes do not dirty Project or send write');await input().press('Escape');boundary.updateLocalMetadata('A',{technician:{notes:'Keep'}});check(!db.getSession().dirty,'storage Notes no-op stays clean');
 await notes('A').click();await area().fill('Project note\nLine two');await edit('B').click();await page.waitForFunction(()=>document.querySelector('tbody')?.textContent.includes('Project note'));check(db.getSession().dirty&&db.getProjectMemberDevices().find(d=>d.id==='A').technician.notes==='Project note\nLine two','real Project Notes change dirties saved member');await input().press('Escape');const saved=db.exportProjectJsonForSave();const reopened=new SiteProjectDatabase();reopened.importProjectJson(saved);check(reopened.getDeviceById('A').technician.notes==='Project note\nLine two','multiline Notes persist through Project round trip');
 check(JSON.stringify(reports.snapshot().members.map(m=>m.id))===JSON.stringify(members),'Report Set membership unaffected');check(updates.every(r=>/^\/api\/device\/[AB]\/config$/.test(r.path)&&Object.keys(r.body).join()==='technician'&&['name','notes'].includes(Object.keys(r.body.technician).join())),'only local technician fields submitted via stable IDs');
 const compact=await notes('A').evaluate(el=>{const text=el.querySelector('span');return getComputedStyle(text).textOverflow==='ellipsis'&&getComputedStyle(text).whiteSpace==='nowrap'});check(compact,'nonediting Notes remain compact and truncated');check(!errors.length,'no browser runtime errors');
 console.log(`Phase 12B inline notes: ${passed} passed, 0 failed, 0 skipped`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
