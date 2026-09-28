// Every backend/camera request is intercepted. Actual GUI is tested separately.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
let passed=0;const check=(v,n)=>{assert.ok(v,n);passed++;console.log('PASS: '+n)};
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://192.0.2.99/**',r=>r.fulfill({contentType:'text/html',body:'<p>Intercepted fixture</p>'}));
 await page.addInitScript(()=>{
  const d={id:'native-A',anchor:{macAddress:'00:50:F9:63:FB:0F',onvifEndpointUuid:'uuid-A',vendor:'Fixture'},technician:{name:'Native fixture'},network:{ipAddress:'192.0.2.99',port:80,protocol:'ONVIF'},status:'ONLINE',sessionVerification:'VERIFIED',discoveredPhase:3};
  window.__nativeFixture=d;window.__nativeTest={code:location.search.includes('gated')?'GATED':'PREPARING',back:false,forward:false,commands:[],opens:[],closed:0,external:0,recheck:0};
  const old=fetch;window.fetch=async(url,o={})=>{
   const p=new URL(url,location.href).pathname,t=__nativeTest,json=(v,status=200)=>Promise.resolve(new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}}));
   if(p.startsWith('/api/connect/')){if(p.endsWith('/open')){t.external++;return json({})}if(p.endsWith('/recheck')){t.recheck++;return json({})}return json({endpoint:{url:'http://192.0.2.99',scheme:'http',verified:true},accessDecision:{allowed:true,deviceId:d.id,ipAddress:d.network.ipAddress,code:'SAFE_TO_OPEN'}})}
   if(p.startsWith('/api/camera-browser/')){
    const body=JSON.parse(o.body||'{}'),snapshot=()=>({code:t.code,canGoBack:t.back,canGoForward:t.forward});
    if(p.endsWith('/open')){t.session={version:1,sessionId:crypto.randomUUID(),deviceId:d.id,address:d.network.ipAddress,origin:'http://192.0.2.99',renderer:t.code==='GATED'?'IFRAME':'WINDOWS_WEBVIEW2',display:{name:'Fixture',manufacturer:'Fixture'},createdAt:Date.now(),expiresAt:Date.now()+300000};t.opens.push(t.session.sessionId);return json({session:t.session,controlToken:'cbi_'+'z'.repeat(43),snapshot:snapshot()})}
    if(!p.startsWith('/api/camera-browser/controls/'))return json({},404);
    if(p.endsWith('/command')){t.commands.push(body.command);return json({accepted:true})}
    if(p.endsWith('/close')){t.closed++;return json({closed:true})}
    return json({session:t.session,snapshot:snapshot()});
   }return old(url,o);
  };
 });
 const open=async()=>{await page.getByRole('button',{name:'Open fixture',exact:true}).click();};
 const w=page.getByRole('region',{name:'Camera Browser'});
 await page.goto('http://127.0.0.1:5179/src/test/browser/native_workspace.html');await open();await w.getByText('Preparing native browser…',{exact:true}).waitFor();check(true,'preparing native state is truthful');
 await page.evaluate(()=>__nativeTest.code='ACTIVE');await w.getByText('Native browser active in the dedicated Camera Browser window.',{exact:true}).waitFor();
 check(await w.locator('iframe').count()===0,'active native view does not pretend to render in iframe');
 check(await w.getByRole('button',{name:'Back',exact:true}).isDisabled(),'native back initially disabled');
 await page.evaluate(()=>{__nativeTest.back=true;__nativeTest.forward=true});await page.waitForFunction(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Back')?.disabled===false);
 for(const [label,command] of [['Back','BACK'],['Forward','FORWARD'],['Refresh','REFRESH']]){await w.getByRole('button',{name:label,exact:true}).click();check(await page.evaluate(c=>__nativeTest.commands.includes(c),command),label+' sends only scoped native command')}
 await w.getByRole('button',{name:'Open External',exact:true}).click();await w.getByText(/login is not confirmed/).waitFor();check(await page.evaluate(()=>__nativeTest.external===1),'Open External remains independent without login claim');
 await w.getByRole('button',{name:'Recheck',exact:true}).click();await w.getByText(/No login was attempted/).waitFor();check(await page.evaluate(()=>__nativeTest.recheck===1),'Recheck remains separate and read-only');
 for(const [code,text] of [['CERTIFICATE_REJECTED','Certificate/security problem.'],['SECURITY_BLOCKED','Native browser authorization or security check failed.'],['NAVIGATION_BLOCKED','Camera navigation blocked'],['FAILED','Native renderer failed.'],['RUNTIME_UNAVAILABLE','WebView2 runtime is unavailable.'],['CLOSED','Native renderer closed.']]){
  await page.evaluate(c=>__nativeTest.code=c,code);await w.getByText(new RegExp(text.replaceAll('.','\\.'))).first().waitFor();check(await w.locator('iframe').count()===0,code+' never silently mounts iframe');check(await w.getByRole('button',{name:'Open External',exact:true}).isEnabled(),code+' preserves independently authorized external action');
 }
 const first=await page.evaluate(()=>__nativeTest.opens[0]);await w.getByRole('button',{name:'Close Camera Browser',exact:true}).click();await page.evaluate(()=>__nativeTest.code='PREPARING');await open();await w.getByText('Preparing native browser…',{exact:true}).waitFor();check(await page.evaluate(id=>__nativeTest.opens.at(-1)!==id,first),'reopen obtains fresh authorization');
 await page.goto('http://127.0.0.1:5179/src/test/browser/native_workspace.html?gated');await open();await w.locator('iframe').waitFor();check(await w.getByText(/real-camera native access is not enabled/).isVisible(),'intentional product gate is explained');check(await w.getByText(/Native renderer failed/).count()===0,'product gate is not misreported as failure');check(await w.getByRole('button',{name:/enable native|disable gate/i}).count()===0,'no technician gate bypass');check(await w.getByRole('button',{name:'Open External',exact:true}).isEnabled(),'gated real camera retains external route');
 check(errors.length===0,'no workspace runtime errors');console.log(`Native workspace mocked browser: ${passed} passed, 0 failed, 0 skipped`);
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
