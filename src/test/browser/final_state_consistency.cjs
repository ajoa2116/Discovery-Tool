// UI-only Vite, mocked backend, actual in-memory project workflow and final reconciliation.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');const {mock}=require('./advanced_scan.cjs');
let passed=0;const check=(value,name)=>{assert.ok(value,name);passed++;console.log('PASS: '+name)};
(async()=>{
 const {SiteProjectDatabase}=await import('../../core/storage/project_db.ts');
 const {ProjectReverificationWorkflow}=await import('../../core/engine/reverification.ts');
 const {Phase4IdentityReconciliation}=await import('../../core/engine/phase4_reconcile.ts');
 const nic={name:'Ethernet',ipAddress:'192.168.1.205',netmask:'255.255.255.0',interfaceIndex:8,isInternal:false,broadcast:'',mac:''};
 const camera=(id,ip)=>({id,anchor:{macAddress:id==='A'?'00:50:f9:63:fb:0f':'e4:30:22:cd:68:85',onvifEndpointUuid:'uuid-'+id,vendor:id},network:{ipAddress:ip,subnetMask:'255.255.255.0',port:80,protocol:'ONVIF'},status:'DIFFERENT_SUBNET',sessionVerification:'VERIFIED',discoveredPhase:3,firstSeenAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),reachability:{subnetClassification:'LOCAL',discoveryInterface:nic,wsDiscoveryRespondedAt:new Date().toISOString()}});
 const live=[camera('A','192.168.1.168'),camera('B','192.168.1.100')];
 const db=new SiteProjectDatabase();db.createNewProject('Phase 5 Browser');live.forEach(d=>db.upsertDevice(structuredClone(d)));db.importProjectJson(db.exportProjectJsonForSave());
 const flow=new ProjectReverificationWorkflow(db,async staging=>{live.forEach(d=>staging.upsertDevice(structuredClone(d)));await Phase4IdentityReconciliation.execute(staging,[nic]);return 'COMPLETED'});
 const browser=await chromium.launch({channel:'msedge',headless:true});try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));await mock(page);
  await page.exposeFunction('phase5Reverify',async()=>({result:await flow.run(),session:db.getSession()}));
  await page.addInitScript(session=>{const t=__test,old=window.fetch;t.session=session;t.project=session.project;window.fetch=async(url,o)=>{const path=String(url);let body;if(path.endsWith('/api/project/reverify')){const output=await window.phase5Reverify();t.session=output.session;t.project=output.session.project;body={result:output.result,project:t.project};}else if(path.endsWith('/api/project/session'))body=t.session;else if(path.endsWith('/api/project'))body=t.project;else return old(url,o);return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}})}},db.getSession());
  await page.goto('http://127.0.0.1:5179/src/test/browser/advanced_scan.html?app');
  await page.getByRole('button',{name:'Project',exact:true}).click();await page.getByRole('button',{name:'Reverify',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Project Reverify'});await dialog.locator('strong').filter({hasText:/^2$/}).waitFor();await dialog.getByRole('button',{name:'Done',exact:true}).waitFor();
  check(await dialog.locator('strong').filter({hasText:/^2$/}).count()===1,'T28 two verified in real workflow summary');
  check(await dialog.locator('strong').filter({hasText:/^0$/}).count()===4,'no missing/new/replacement/collision results');
  check(!db.getSession().dirty&&await page.locator('footer').getByText('Unsaved changes',{exact:true}).count()===0,'T29 unchanged Reverify has no false Unsaved changes');
  check(db.listProjectHistory().some(e=>e.type==='REVERIFY_COMPLETED'),'Reverify history remains available');
  await dialog.getByRole('button',{name:'Done',exact:true}).click();
  check(await page.locator('tbody').getByText('Online',{exact:true}).count()===2,'both rows use final Online status');
  check(await page.locator('tbody').getByText('Different Subnet',{exact:true}).count()===0,'no stale Different Subnet when Ready');
  db.updateDeviceTechnicianFields('A',{notes:'Persistent edit'});
  await page.evaluate(session=>{__test.session=session;__test.project=session.project;const socket=__test.sockets.at(-1);socket.readyState=1;socket.onopen?.(new Event('open'));__test.emit({type:'PROJECT_SESSION_CHANGED',data:{session}})},db.getSession());
  await page.locator('footer').getByText('Unsaved changes',{exact:true}).waitFor();check(true,'real persistent edit still displays Unsaved changes');
  db.exportProjectJsonForSave();await page.evaluate(session=>{__test.session=session;__test.project=session.project;__test.emit({type:'PROJECT_SESSION_CHANGED',data:{session}})},db.getSession());
  await page.locator('footer').getByText('Unsaved changes',{exact:true}).waitFor({state:'hidden'});check(true,'Save clears indicator');
  await page.getByRole('button',{name:'Project',exact:true}).click();await page.getByRole('button',{name:'Reverify',exact:true}).click();await dialog.locator('strong').filter({hasText:/^2$/}).waitFor();await dialog.getByRole('button',{name:'Done',exact:true}).waitFor();
  check(!db.getSession().dirty&&await page.locator('footer').getByText('Unsaved changes',{exact:true}).count()===0,'subsequent unchanged Reverify remains clean');
  await dialog.getByRole('button',{name:'Done',exact:true}).click();
  await page.evaluate(()=>{const project=structuredClone(__test.project);project.devices.forEach(d=>d.status='DIFFERENT_SUBNET');__test.project=project;const foreground=__test.advance('MANUAL','SCANNING','phase5-scan');__test.emit({type:'FOREGROUND_SCAN_STATE',context:{origin:'MANUAL',sessionId:'phase5-scan'},data:{foreground}});__test.emit({type:'DEVICE_ENRICHED',data:{device:project.devices[0],project}})});
  await page.locator('footer').getByText('Scanning…',{exact:true}).waitFor();check(await page.locator('tbody').getByText('Different Subnet',{exact:true}).count()===2,'progressive intermediate state remains visible while scanning');
  await page.evaluate(session=>{__test.project=session.project;__test.session=session;__test.emit({type:'PHASE_COMPLETE',phaseNumber:4,context:{origin:'MANUAL',sessionId:'phase5-scan'},data:{project:session.project}});const foreground=__test.advance('MANUAL','COMPLETED','phase5-scan');__test.emit({type:'FOREGROUND_SCAN_STATE',context:{origin:'MANUAL',sessionId:'phase5-scan'},data:{foreground}})},db.getSession());
  await page.locator('footer').getByText('Ready',{exact:true}).waitFor();await page.locator('tbody').getByText('Different Subnet',{exact:true}).waitFor({state:'hidden'});
  check(await page.locator('tbody').getByText('Online',{exact:true}).count()===2,'foreground completion exposes reconciled Online rows at Ready');
  check(await page.evaluate(()=>__test.requests.every(r=>!r.path.endsWith('/pair/restore')&&!r.path.endsWith('/pair/confirm'))),'browser workflow sends no adapter mutations');
  check(errors.length===0,'no browser runtime errors');
 }finally{await browser.close()}
 console.log(`Phase 5 browser: ${passed} passed, 0 failed, 0 skipped`);
})().catch(error=>{console.error(error);process.exitCode=1});
