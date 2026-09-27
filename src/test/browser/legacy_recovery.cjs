// Actual App/dialog integration with mocked API only. Never accesses a Windows adapter.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');const {mock}=require('./advanced_scan.cjs');
let passed=0;const check=(v,n)=>{assert.ok(v,n);passed++;console.log('PASS: '+n)};
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const purpose of ['CAMERA_PAIR','NETWORK_MATCH']){
  const page=await browser.newPage({viewport:{width:800,height:480}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await mock(page);
  await page.addInitScript(purpose=>{const t=__test,old=fetch;const saved={interfaceIndex:8,interfaceAlias:'Ethernet',mediaType:'ETHERNET',eligible:true,operationalStatus:'Up',dhcpEnabled:false,dnsAutomatic:true,dnsServers:[],defaultGateways:[],ipv4Addresses:[{address:'192.168.0.124',prefixLength:24}],capturedAt:'now'};t.current={...saved,ipv4Addresses:[{address:'192.168.1.205',prefixLength:24}]};t.retireCalls=[];t.legacy={id:'legacy-test',purpose,state:'ROLLBACK_REQUIRED',recoveryAvailable:true,recoveryDisposition:'LEGACY_UNVERIFIABLE',errorCode:'LEGACY_RECOVERY',deviceId:'',cameraIp:'',adapter:saved,originalAdapter:saved,candidates:[],message:'An older network recovery record was found. Its adapter identity cannot be verified using current safety rules. Automatic and normal Restore are blocked. Retiring this record keeps current Windows network settings unchanged.'};window.fetch=async(url,o={})=>{const path=String(url),json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});if(path.endsWith('/pair/status'))return json(t.legacy);if(path.endsWith('/pair/adapters'))return json([t.current]);if(path.endsWith('/pair/retire-legacy')){t.retireCalls.push(JSON.parse(o.body));t.legacy={...t.legacy,state:'IDLE',recoveryDisposition:'LEGACY_RETIRED',recoveryAvailable:false};return json(t.legacy)}return old(url,o)};},purpose);
  await page.goto('http://127.0.0.1:5179/src/test/browser/advanced_scan.html?app');const review=page.getByRole('region',{name:'Legacy recovery review'});await review.waitFor();
  check(await review.getByText('Older network recovery record',{exact:true}).isVisible(),purpose+' specific legacy explanation');
  check(await review.getByText(/192.168.1.205\/24/).count()===1,purpose+' current Windows information displayed separately');
  check(await page.getByRole('button',{name:'Restore Original Network Configuration',exact:true}).count()===0,purpose+' legacy has no normal Restore');
  const state=await page.evaluate(()=>JSON.stringify([__test.current,__test.project]));
  await review.getByRole('button',{name:'Keep Current / Retire Legacy Recovery',exact:true}).click();
  check(await page.evaluate(()=>__test.retireCalls.length)===0,purpose+' first click does not retire');
  await review.getByRole('button',{name:'Cancel — keep recovery record',exact:true}).click();check(await page.evaluate(()=>__test.retireCalls.length===0&&__test.legacy.recoveryAvailable),purpose+' Cancel keeps recovery');
  await review.getByRole('button',{name:'Keep Current / Retire Legacy Recovery',exact:true}).click();const confirm=review.getByRole('button',{name:'Confirm retirement — keep current settings',exact:true});await confirm.scrollIntoViewIfNeeded();
  const panel=page.locator('.modal-viewport').last().locator(':scope > :first-child');check(await panel.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1}),purpose+' confirmation contained in small viewport');
  await page.keyboard.press('Tab');await confirm.focus();check(await confirm.evaluate(el=>el===document.activeElement),purpose+' confirmation keyboard reachable');await page.keyboard.press('Enter');
  await review.waitFor({state:'hidden'});check(await page.evaluate(()=>__test.retireCalls.length===1&&__test.retireCalls[0].confirmed===true&&__test.retireCalls[0].sessionId==='legacy-test'),purpose+' explicit confirmation bound to record');
  check(await page.evaluate(()=>JSON.stringify([__test.current,__test.project]))===state,purpose+' current Windows and Project unchanged');
  check(await page.evaluate(()=>__test.requests.every(r=>!r.path.endsWith('/pair/restore')&&!r.path.endsWith('/pair/confirm')&&!r.path.includes('/credentials'))),purpose+' no restore apply or credential request');
  check(await page.getByRole('button',{name:/Network recovery requires review/}).count()===0,purpose+' active warning removed');
  check(errors.length===0,purpose+' no runtime errors');await page.close();
 }
 console.log(`Legacy recovery browser: ${passed} passed, 0 failed, 0 skipped`);
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
