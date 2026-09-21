// Run with node --import tsx; snapshots come from the actual reconciliation/report services.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');const {mock}=require('./advanced_scan.cjs');
let passed=0;const check=(v,n)=>{assert.ok(v,n);passed++;console.log('PASS: '+n)};
(async()=>{
 const {SiteProjectDatabase}=await import('../../core/storage/project_db.ts');
 const {Phase4IdentityReconciliation}=await import('../../core/engine/phase4_reconcile.ts');
 const {ReportService}=await import('../../core/reporting/report_service.ts');
 const db=new SiteProjectDatabase();db.startQuickWork();
 const camera=(id,ip='192.168.1.100')=>({id,anchor:{macAddress:id==='A'?'00:50:f9:63:fb:0f':'e4:30:22:cd:68:85',onvifEndpointUuid:'uuid-'+id,vendor:id},network:{ipAddress:ip,subnetMask:'255.255.255.0',port:80,protocol:'ONVIF'},status:'ONLINE',sessionVerification:'VERIFIED',discoveredPhase:3,firstSeenAt:new Date().toISOString(),lastSeenAt:new Date().toISOString()});
 db.upsertDevice(camera('A'));db.upsertDevice(camera('B'));await Phase4IdentityReconciliation.execute(db);const duplicate=db.getProject();
 db.upsertDevice(camera('A','192.168.1.168'),'DEVICE_ADDED',true);db.upsertDevice(camera('B'),'DEVICE_ADDED',true);await Phase4IdentityReconciliation.execute(db);const resolved=db.getProject();
 const report=new ReportService().build(db.getSession(),[],{type:'DEVICE_INVENTORY',scope:'ALL',columns:['STATUS','DUPLICATE_STATE']});
 db.upsertDevice(camera('A'),'DEVICE_ADDED',true);await Phase4IdentityReconciliation.execute(db);const reopened=db.getProject();
 const browser=await chromium.launch({channel:'msedge',headless:true});try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));await mock(page);
  await page.addInitScript(project=>{const t=__test,old=window.fetch;t.project=project;window.fetch=async(url,o)=>String(url).endsWith('/api/project')?new Response(JSON.stringify(t.project),{headers:{'Content-Type':'application/json'}}):old(url,o)},duplicate);
  await page.goto('http://127.0.0.1:5179/src/test/browser/advanced_scan.html?app');
  const count=n=>page.locator('footer').getByText('Collisions: '+n,{exact:true});await count(1).waitFor();
  check(await page.locator('tbody').getByText('Duplicate IP',{exact:true}).count()===2,'two established collision rows');
  await page.evaluate(project=>{__test.project=project;const socket=__test.sockets.at(-1);socket.readyState=1;socket.onopen?.(new Event('open'));__test.emit({type:'PHASE_COMPLETE',phaseNumber:4,context:{origin:'MONITORING',sessionId:'background'},data:{project}})},resolved);
  await count(0).waitFor();check(true,'background phase completion refreshes footer to zero');
  check(await page.getByText('192.168.1.168',{exact:true}).count()>0,'background address reconciliation visible');
  check(await page.locator('tbody').getByText('Duplicate IP',{exact:true}).count()===0,'resolved rows lose Duplicate IP status');
  check(report.rows.every(r=>!r.values.STATUS.includes('Duplicate')&&r.values.DUPLICATE_STATE==='None'),'current report projection agrees with resolved footer');
  check(resolved.collisions.length===1&&resolved.collisions[0].resolved,'resolved history retained');
  check(await page.getByRole('button',{name:'Scan',exact:true}).isVisible()&&await page.getByRole('button',{name:'Stop',exact:true}).count()===0,'monitoring never takes foreground Scan controls');
  check(await page.locator('footer').getByText('Unsaved changes',{exact:true}).count()===0,'runtime refresh does not show unsaved project edits');
  check(await count(0).evaluate(el=>el.tagName==='SPAN'&&!el.closest('button')),'footer stays noninteractive');
  await page.evaluate(project=>{__test.project=project;__test.emit({type:'PHASE_COMPLETE',phaseNumber:4,context:{origin:'MONITORING',sessionId:'background-2'},data:{project}})},reopened);
  await count(1).waitFor();check(reopened.collisions.length===1&&reopened.collisions[0].id===duplicate.collisions[0].id,'collision reopens without duplicate records');
  check(await page.locator('tbody').getByText('Duplicate IP',{exact:true}).count()===2,'reopened collision restores both row statuses');
  check(await page.evaluate(()=>__test.requests.every(r=>!r.path.endsWith('/pair/restore')&&!r.path.endsWith('/pair/confirm')&&!r.path.endsWith('/discovery/start'))),'background reconciliation sends no mutation or foreground Scan request');
  check(errors.length===0,'no browser runtime errors');
 }finally{await browser.close()}
 console.log(`Background collision browser: ${passed} passed, 0 failed, 0 skipped`);
})().catch(error=>{console.error(error);process.exitCode=1});
