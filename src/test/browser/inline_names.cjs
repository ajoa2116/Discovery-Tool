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
 await load();await edit('A').click();check(await input().count()===1,'click opens Name editor');check(await input().inputValue()==='A','saved value loaded');
 await input().fill('Lobby');await input().press('Enter');await edit('Lobby').waitFor();check(db.getDeviceById('A').technician.name==='Lobby'&&updates.length===1,'Enter saves once through stable-ID metadata endpoint');check(db.getSession().mode==='QUICK_WORK'&&!db.getSession().filePath&&db.listProjectHistory().length===0,'Quick Work naming preserves session-only metadata semantics');
 await edit('Lobby').click();await input().fill('Hall');await page.getByRole('button',{name:'Name',exact:true}).click();await edit('Hall').waitFor();check(db.getDeviceById('A').technician.name==='Hall','blur/click-away saves');
 const before=updates.length;await edit('Hall').click();await input().fill('Cancelled');await input().press('Escape');await edit('Hall').waitFor();check(updates.length===before&&await input().count()===0,'Escape restores saved value without request');
 await edit('Hall').click();await input().fill('A new');await edit('B').click();check(await input().count()===1&&await input().inputValue()==='B','switch opens only one Name editor');await edit('A new').waitFor();check(db.getDeviceById('A').technician.name==='A new','switch saves previous edit');await input().press('Escape');
 await edit('A new').click();await input().fill('x'.repeat(101));check((await input().inputValue()).length===100,'input prevents more than 100 characters');await input().press('Enter');await edit('x'.repeat(100)).waitFor();check(db.getDeviceById('A').technician.name.length===100,'100-character name accepted');
 assert.throws(()=>boundary.updateLocalMetadata('A',{technician:{name:'z'.repeat(101)}}));check(db.getDeviceById('A').technician.name.length===100,'storage rejects overlong names without mutation');
 await edit('x'.repeat(100)).click();await input().fill('Moved');db.getDeviceById('A').network.ipAddress='192.168.1.120';
 await page.evaluate(project=>__test.emit({type:'DEVICE_DISCOVERED',data:{project}}),db.getProject());await page.getByRole('button',{name:'Name',exact:true}).click();await edit('Moved').waitFor();check(db.getDeviceById('A').technician.name==='Moved'&&db.getDeviceById('B').technician.name==='B'&&updates.at(-1).path==='/api/device/A/config','IP move/re-sort preserves identity and same-IP peer');
 fail=true;await edit('Moved').click();await input().fill('Not saved');await input().press('Enter');await page.getByRole('alert').filter({hasText:'Name was not saved'}).waitFor();check(await edit('Moved').count()===1&&db.getDeviceById('A').technician.name==='Moved','failed save shows error and last confirmed value');fail=false;
 const members=reports.snapshot().members.map(m=>m.id);db.createNewProject('Names');['A','B'].forEach(id=>db.upsertDevice(camera(id)));db.exportProjectJsonForSave();await load();await edit('A').click();await input().press('Escape');check(!db.getSession().dirty,'Project enter/cancel stays clean');const n=updates.length;await edit('A').click();await input().press('Enter');check(updates.length===n&&!db.getSession().dirty,'unchanged name sends no write and stays clean');
 boundary.updateLocalMetadata('A',{technician:{name:'A'}});check(!db.getSession().dirty,'metadata no-op also stays clean');
 await edit('A').click();await input().fill('Project Lobby');await input().press('Enter');await edit('Project Lobby').waitFor();check(db.getSession().dirty&&db.getProjectMemberDevices().find(d=>d.id==='A').technician.name==='Project Lobby','saved Project name dirties existing persistent member');
 db.getDeviceById('B').technician.name='  B  ';db.exportProjectJsonForSave();await load();await edit('  B  ').click();await input().press('Enter');check(!db.getSession().dirty&&db.getDeviceById('B').technician.name==='  B  ','untouched legacy whitespace name does not dirty Project');
 check(JSON.stringify(reports.snapshot().members.map(m=>m.id))===JSON.stringify(members),'Report Set membership unaffected');check(updates.every(r=>/^\/api\/device\/[AB]\/config$/.test(r.path)&&Object.keys(r.body).join()==='technician'&&Object.keys(r.body.technician).join()==='name'),'only local stable-ID name metadata submitted');check(db.getDevices().every(d=>d.technician.notes==='Keep'),'Notes untouched');check(!errors.length,'no browser runtime errors');
 console.log(`Phase 12A inline names: ${passed} passed, 0 failed, 0 skipped`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
