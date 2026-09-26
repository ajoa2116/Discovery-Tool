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
 db.createNewProject('Actions');['A','B'].forEach(id=>db.upsertDevice(camera(id)));reports.add(['A']);
 let fail=false;const updates=[];
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));await mock(page);
 await page.exposeFunction('nameBackend',(path,body)=>{
  if(path==='/api/pair/eligibility')return{body:db.getDeviceById('A')};
  if(path==='/api/project/session')return{body:db.getSession()};
  if(path==='/api/project')return{body:db.getProject()};
  if(path==='/api/report-set')return{body:reports.snapshot()};
  updates.push({path,body});if(fail)return{status:500,body:{error:'Injected failure'}};
  try{return{body:{status:'LOCAL_METADATA_UPDATED',device:boundary.updateLocalMetadata(decodeURIComponent(path.split('/')[3]),body)}}}catch(e){return{status:400,body:{error:e.message}}}
 });
 await page.addInitScript(()=>{const old=fetch;window.fetch=async(url,o={})=>{const path=new URL(url,location.href).pathname;if(['/api/project','/api/project/session','/api/report-set','/api/pair/eligibility'].includes(path)||path.match(/^\/api\/device\/[^/]+\/config$/)){const r=await nameBackend(path,o.body?JSON.parse(o.body):{});return new Response(JSON.stringify(r.body),{status:r.status||200,headers:{'Content-Type':'application/json'}})}return old(url,o)}});
 const load=()=>page.goto('http://127.0.0.1:5179/src/test/browser/advanced_scan.html?app');
 const edit=name=>page.getByRole('button',{name:'Edit name for '+name,exact:true});const input=()=>page.getByRole('textbox',{name:'Camera Name',exact:true});
 db.getDeviceById('A').reachability={pairEligibility:{eligible:true,adapterIndexes:[8],calculatedAt:'now',reason:'Fixture'}};
 await load();const menu=()=>page.getByRole('menu',{name:'Actions for A',exact:true});const open=()=>page.getByRole('button',{name:'Actions for A',exact:true}).click();
 await open();await menu().waitFor();check(await menu().getByRole('menuitem',{name:'Rename Device',exact:true}).count()===0,'Rename Device absent');check(await menu().getByRole('menuitem',{name:'Edit Notes',exact:true}).count()===0,'Edit Notes absent');
 for(const label of ['Open','Details','Diagnose','Pair PC to Camera Network','Device Configuration','Remove from Report','Remove from Current List','Remove from Project'])check(await menu().getByRole('menuitem',{name:label,exact:true}).isEnabled(),label+' preserved in applicable Project context');
 check(await input().count()===0&&await page.getByRole('textbox',{name:'Camera Notes',exact:true}).count()===0,'opening Actions does not start editing');await page.keyboard.press('Escape');
 await edit('A').click();check(await input().count()===1&&await page.getByRole('menu').count()===0,'Name click opens only inline editor');await input().press('Escape');
 await page.getByRole('button',{name:'Edit notes for A',exact:true}).click();const area=page.getByRole('textbox',{name:'Camera Notes',exact:true});check(await area.count()===1&&await page.getByRole('menu').count()===0,'Notes click opens only inline editor');await area.press('Escape');
 const box=page.locator('tbody tr').filter({has:page.getByRole('button',{name:'Actions for A',exact:true})}).getByRole('checkbox');await box.check();check(await box.isChecked()&&await input().count()===0&&await area.count()===0&&await page.getByRole('menu').count()===0,'selection checkbox remains independent');await edit('A').click();await input().press('Escape');check(await box.isChecked(),'inline editing preserves selection');
 reports.remove({memberIds:[reports.snapshot().members[0].id]});db.getDeviceById('A').reachability.pairEligibility.eligible=false;await load();await open();check(await menu().getByRole('menuitem',{name:'Add to Report',exact:true}).isEnabled(),'Add to Report preserved for nonmember');check(await menu().getByRole('menuitem',{name:'Pair PC to Camera Network',exact:true}).count()===0,'ineligible Pair stays unavailable');await page.keyboard.press('Escape');
 db.startQuickWork();db.upsertDevice(camera('A'));await load();await open();check(await menu().getByRole('menuitem',{name:'Remove Device',exact:true}).isEnabled()&&await menu().getByRole('menuitem',{name:'Remove from Project',exact:true}).count()===0,'Quick Work removal label and Project-only availability unchanged');check(!errors.length,'no browser runtime errors');
 console.log(`Phase 12C actions: ${passed} passed, 0 failed, 0 skipped`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
