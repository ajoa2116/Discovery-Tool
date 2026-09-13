// Run against UI-only Vite on port 5179. Every backend request is replaced in-browser.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
let passed = 0;
const check = (value, name) => { assert.ok(value, name); console.log('PASS: ' + name); passed++; };
async function mock(page) {
 await page.addInitScript(() => {
  const native = window.fetch.bind(window);
  const adapter = {interfaceIndex:8,interfaceAlias:'Ethernet',operationalStatus:'Up',eligible:true,mediaType:'ETHERNET',hardwareInterface:true,physicalMediaType:'802.3',dhcpEnabled:true,ipv4Addresses:[{address:'192.168.0.124',prefixLength:24}],defaultGateways:[],dnsAutomatic:true,dnsServers:[],capturedAt:'now'};
  const test = window.__test = { mode:'ok', startMode:'ok', adapterMode:'ok', validations:0, starts:0, aborts:0, pending:[], running:null, sockets:[], statusMode:'ok', foreground:{epoch:'test-server',revision:0,session:null}, monitoring:{enabled:true,running:false,intervalMs:30000,status:'WAITING'}, requests:[] };
  test.advance = (origin,state,sessionId) => { test.foreground={epoch:'test-server',revision:test.foreground.revision+1,session:{origin,state,sessionId:sessionId||('scan-'+(test.foreground.revision+1))}};return test.foreground; };
  test.emit = event => test.sockets.at(-1)?.onmessage?.({data:JSON.stringify(event)});
  const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  const plan = request => ({mode:request.adapterIndexes.length?'ADVANCED':'QUICK_FALLBACK',request,adapterIndexes:request.adapterIndexes,normalizedTargets:[],methods:request.methods,ports:request.customPorts,routeSummary:[],estimatedTargetCount:request.targets.length,maximumTcpChecks:0,warnings:[],valid:true,errors:[]});
  window.fetch = async (url, options={}) => {
   if (!String(url).startsWith('http://localhost:3001/')) return native(url,options);
   const path = new URL(url).pathname;test.requests.push({path,body:options.body?JSON.parse(options.body):null});
   let mode = 'ok', body = {};
   if(path.endsWith('/advanced/adapters')) { mode=test.adapterMode;body=[adapter]; }
   else if(path.endsWith('/advanced/validate')) { test.validations++; mode=test.mode;body=plan(JSON.parse(options.body)); }
   else if(path.endsWith('/advanced/start')) { test.starts++;mode=test.startMode;body={plan:plan(JSON.parse(options.body)),foreground:test.advance('ADVANCED','SCANNING')}; }
   else if(path.endsWith('/discovery/start')) {mode=test.quickMode||'ok';body={foreground:test.advance('MANUAL','SCANNING')};}
   else if(path.endsWith('/discovery/stop')) { const id=JSON.parse(options.body).sessionId;if(id!==test.foreground.session?.sessionId)return json({foreground:test.foreground},409);body={foreground:test.advance(test.foreground.session.origin,'CANCELLED',id)}; }
   else if(path.endsWith('/discovery/status')) {mode=test.statusMode;if(test.running!==null&&Boolean(test.running)!==Boolean(test.foreground.session&&['PREPARING','SCANNING','STOPPING'].includes(test.foreground.session.state)))test.advance('MANUAL',test.running?'SCANNING':'COMPLETED');body={running:test.running??false,foreground:test.foreground,monitoring:{...test.monitoring,incrementalDiscovery:{...test.monitoring.incrementalDiscovery,pausedForForeground:Boolean(test.foreground.session&&['PREPARING','SCANNING','STOPPING'].includes(test.foreground.session.state))}}};}
   else if(path.endsWith('/diagnostics/refresh')||path.endsWith('/monitoring/preferences'))body=test.monitoring;
   else if(path.endsWith('/project/session')) body={mode:'QUICK_WORK',dirty:false,project:null};
   else if(path.endsWith('/pair/status')) body=null;
   if(mode==='throw') throw Error('Injected frontend request exception');
   if(mode==='network') return Promise.reject(new TypeError('Failed to fetch'));
   if(mode==='500') return json({error:'private diagnostic'},500);
   if(mode==='400') return json({...body,valid:false,errors:['Invalid test configuration']},400);
   if(mode==='malformed') return new Response('{');
   if(mode==='hold') return new Promise(resolve=>{options.signal?.addEventListener('abort',()=>test.aborts++);test.pending.push({resolve:(failure=false)=>resolve(failure?json({error:'old'},500):json(body))});});
   if(mode==='bodyHold') return {ok:true,status:200,json:()=>new Promise(()=>{})};
   return json(body);
  };
  const NativeSocket=window.WebSocket;
  class FakeSocket {
   readyState=0;onopen=null;onclose=null;onerror=null;onmessage=null;closed=0;
   constructor(url,...args){if(!url.includes('localhost:3001'))return new NativeSocket(url,...args);test.sockets.push(this);}
   close(){this.closed++;this.readyState=3;}
  }
  window.WebSocket=FakeSocket;
 });
}
async function open(page) { await page.goto('http://127.0.0.1:5179/src/test/browser/advanced_scan.html');await page.getByRole('button',{name:'Open Advanced Scan',exact:true}).click();await page.getByLabel('Ethernet',{exact:false}).waitFor(); }
async function valid(page) {await page.getByRole('button',{name:'Start Advanced Scan',exact:true}).waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Start Advanced Scan')?.disabled);}
async function configure(page) {
 await page.getByLabel('Ethernet',{exact:false}).check();
 await page.getByRole('button',{name:'Add Range',exact:true}).click();
 await page.getByLabel('Target 1 type').selectOption('RANGE');
 for(const label of ['Start IP','End IP']) for(const [index,value] of ['192','168','1','100'].entries()) await page.getByLabel(`${label} octet ${index+1}`,{exact:true}).fill(value);
 for(const label of ['ONVIF / WS-Discovery','Windows Neighbor / ARP evidence','ICMP / Ping','TCP Port Check','Camera Common']) await page.getByLabel(label,{exact:true}).check();
 await valid(page);
}
async function run(){
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 try {
 for(const viewport of [{width:1280,height:720},{width:700,height:720},{width:700,height:760},{width:560,height:576}]) {
  const page=await browser.newPage({viewport});await mock(page);await open(page);await configure(page);
  for(let i=0;i<4;i++)await page.getByRole('button',{name:'Add Range',exact:true}).click();
  const boxes=await page.evaluate(()=>{const d=document.querySelector('[role=dialog]'),b=document.querySelector('[data-testid=advanced-scan-body]'),h=d.querySelector('header'),f=d.querySelector('footer');return {dialog:d.getBoundingClientRect().toJSON(),body:b.getBoundingClientRect().toJSON(),header:h.getBoundingClientRect().toJSON(),footer:f.getBoundingClientRect().toJSON(),scroll:b.scrollHeight,client:b.clientHeight,width:b.scrollWidth,viewport:innerHeight};});
  const name=`${viewport.width}x${viewport.height}`;
  check(boxes.dialog.top>=0&&boxes.dialog.bottom<=viewport.height+1&&boxes.header.top>=0&&boxes.footer.bottom<=viewport.height+1,name+' dialog/header/footer fit');
  check(boxes.scroll>boxes.client&&boxes.body.bottom<=boxes.footer.top+1&&boxes.width<=boxes.body.width+1,name+' body owns scrolling, no horizontal overflow or footer overlap');
  for(const label of ['Add Range','ONVIF / WS-Discovery','Custom ports','Manufacturer filter','Performance']) {
   const el=label==='Add Range'?page.getByRole('button',{name:label,exact:true}):page.getByLabel(label,{exact:true});await el.scrollIntoViewIfNeeded();
   const rect=await el.boundingBox(),footer=await page.locator('footer').boundingBox();
   check(rect.y>=boxes.body.top-1&&rect.y+rect.height<=footer.y+1,name+' reachable '+label);
  }
  await page.getByLabel('Performance').selectOption('FAST');
  await page.locator('[data-testid=advanced-scan-body]').evaluate(b=>b.scrollTop=0);
  await page.locator('[data-testid=advanced-scan-body]').hover();await page.mouse.wheel(0,600);await page.waitForTimeout(200);
  check(await page.locator('[data-testid=advanced-scan-body]').evaluate(b=>b.scrollTop>0)&&await page.evaluate(()=>scrollY===0),name+' wheel stays in body');
  await page.getByLabel('Close Advanced Scan').focus();let reached=false;
  for(let i=0;i<110;i++){await page.keyboard.press('Tab');if(await page.getByLabel('Performance').evaluate(e=>e===document.activeElement))reached=true;}
  check(reached&&await page.evaluate(()=>document.querySelector('[role=dialog]').contains(document.activeElement)),name+' tab reaches lower controls and remains trapped');
  await page.mouse.click(2,2);check(await page.evaluate(()=>document.getElementById('root').inert&&document.body.dataset.backgroundClicked!=='true'),name+' background is inert and cannot receive overlay clicks');
  await page.getByLabel('Close Advanced Scan').click();check(await page.getByRole('dialog').count()===0&&await page.getByRole('button',{name:'Open Advanced Scan',exact:true}).evaluate(e=>e===document.activeElement),name+' X closes and restores focus');
  await page.getByRole('button',{name:'Open Advanced Scan',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();check(await page.getByRole('dialog').count()===0,name+' Cancel remains clickable');await page.close();
 }
 const page=await browser.newPage({viewport:{width:700,height:720}});await mock(page);await open(page);
 await page.getByLabel('Ethernet',{exact:false}).check();await page.getByRole('button',{name:'Add Range',exact:true}).click();await page.waitForTimeout(400);
 const count=await page.evaluate(()=>__test.validations);await page.getByLabel('CIDR address octet 1',{exact:true}).fill('192');await page.waitForTimeout(400);
 check(await page.evaluate(()=>__test.validations)===count,'incomplete draft never validates');
 for(const [i,v] of ['168','1','100'].entries())await page.getByLabel(`CIDR address octet ${i+2}`,{exact:true}).fill(v);
 await valid(page);check(await page.evaluate(()=>__test.validations)===count+1,'complete draft validates once');
 await page.evaluate(()=>__test.mode='hold');await page.getByLabel('Custom ports').fill('80');await page.waitForTimeout(400);
 await page.getByLabel('Custom ports').fill('invalid');await page.evaluate(()=>__test.pending.shift().resolve());await page.waitForTimeout(100);
 check(await page.getByRole('button',{name:'Start Advanced Scan',exact:true}).isDisabled()&&await page.getByText('Validating configuration...', {exact:true}).count()===0,'stale success cannot overwrite newer invalid form; abort exits validating');
 await page.getByLabel('Custom ports').fill('81');await page.waitForTimeout(400);await page.evaluate(()=>__test.mode='ok');await page.getByLabel('Custom ports').fill('82');await valid(page);await page.evaluate(()=>__test.pending.shift().resolve(true));await page.waitForTimeout(100);
 check(await page.getByRole('button',{name:'Start Advanced Scan',exact:true}).isEnabled()&&await page.getByRole('button',{name:'Retry Validation'}).count()===0,'stale failure cannot overwrite newer valid form');
 check(await page.evaluate(()=>__test.aborts)>=2,'superseded requests abort transport');
 for(const mode of ['400','500','network','throw','malformed']) {
  await page.evaluate(mode=>__test.mode=mode,mode);await page.getByLabel('Custom ports').fill(String(90+passed));await page.getByRole('button',{name:'Retry Validation'}).waitFor();
  check(await page.getByText('Validating configuration...', {exact:true}).count()===0&&await page.getByRole('button',{name:'Start Advanced Scan',exact:true}).isDisabled(),mode+' exits validating with visible recovery');
 }
 await page.clock.install();await page.evaluate(()=>__test.mode='bodyHold');await page.getByRole('button',{name:'Retry Validation'}).click();await page.clock.runFor(350);await page.clock.fastForward(15100);
 await page.getByRole('button',{name:'Retry Validation'}).waitFor();check(await page.getByText('Validating configuration...', {exact:true}).count()===0,'hanging JSON body hits validation deadline');
 await page.evaluate(()=>__test.mode='hold');await page.getByRole('button',{name:'Retry Validation'}).click();await page.clock.runFor(350);await page.getByLabel('Close Advanced Scan').click();await page.evaluate(()=>{__test.pending.shift().resolve();__test.mode='ok'});await page.getByRole('button',{name:'Open Advanced Scan',exact:true}).click();await page.clock.runFor(400);await valid(page);
 check(await page.getByLabel('Ethernet',{exact:false}).isChecked()&&await page.getByLabel('CIDR address octet 4',{exact:true}).inputValue()==='100','close during validation/reopen preserves selected adapter and target');
 await page.getByLabel('ONVIF / WS-Discovery',{exact:true}).check();await page.getByLabel('Manufacturer filter').selectOption('Hanwha');await page.getByLabel('Performance').selectOption('FAST');await page.clock.runFor(400);await valid(page);
 await page.evaluate(()=>__test.mode='hold');await page.getByLabel('Custom ports').fill('554');await page.clock.runFor(350);await page.getByRole('button',{name:'Reload Adapters'}).click();await page.evaluate(()=>{__test.mode='ok';__test.pending.shift().resolve(true)});await page.clock.runFor(400);await valid(page);
 check(await page.getByLabel('Ethernet',{exact:false}).isChecked()&&await page.getByLabel('ONVIF / WS-Discovery',{exact:true}).isChecked()&&await page.getByLabel('CIDR address prefix',{exact:true}).inputValue()==='24'&&await page.getByLabel('Manufacturer filter').inputValue()==='Hanwha'&&await page.getByLabel('Performance').inputValue()==='FAST','reload during validation preserves adapter/method/prefix/filters/performance');
 await page.evaluate(()=>__test.startMode='hold');await page.getByRole('button',{name:'Start Advanced Scan',exact:true}).evaluate(b=>{b.click();b.click()});
 check(await page.getByRole('button',{name:'Preparing scan...',exact:true}).isDisabled()&&await page.evaluate(()=>__test.starts)===1,'accepted Start immediately prepares; double click sends one request');
 await page.clock.fastForward(30100);await page.getByText(/Preparation timed out/).waitFor();check(await page.getByRole('button',{name:'Start Advanced Scan',exact:true}).isEnabled()&&await page.getByRole('button',{name:'Cancel',exact:true}).isEnabled(),'preparation deadline unlocks form with uncertain outcome explanation');
 await page.evaluate(()=>__test.pending.shift().resolve());await page.clock.runFor(100);check(await page.getByRole('dialog').count()===1,'late start response cannot close modal or report accepted scan');
 await page.evaluate(()=>__test.startMode='500');await page.getByRole('button',{name:'Start Advanced Scan',exact:true}).click();await page.getByText(/Advanced Scan could not be confirmed/).waitFor();check(await page.getByRole('button',{name:'Start Advanced Scan',exact:true}).isEnabled(),'preflight500 restores actionable form');
 await page.evaluate(()=>__test.startMode='ok');await page.getByRole('button',{name:'Start Advanced Scan',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});check(await page.evaluate(()=>document.body.dataset.started==='true'),'accepted start exits Preparing and hands off progress');await page.close();
 const recovery=await browser.newPage();await mock(recovery);await recovery.clock.install();await recovery.goto('http://127.0.0.1:5179/src/test/browser/advanced_scan.html');await recovery.evaluate(()=>__test.adapterMode='hold');await recovery.getByRole('button',{name:'Open Advanced Scan',exact:true}).click();await recovery.clock.fastForward(15100);
 await recovery.getByRole('button',{name:'Reload Adapters'}).waitFor();check(await recovery.getByRole('button',{name:'Reload Adapters'}).isEnabled(),'adapter deadline exposes reload instead of locking dialog');
 await recovery.evaluate(()=>__test.adapterMode='ok');await recovery.getByRole('button',{name:'Reload Adapters'}).click();await recovery.getByLabel('Ethernet',{exact:false}).waitFor();await recovery.clock.runFor(400);await recovery.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Start Quick Scan')?.disabled);check(await recovery.getByRole('button',{name:'Start Quick Scan',exact:true}).isEnabled(),'empty form intentionally returns Quick Scan after adapter recovery');
 await recovery.getByLabel('Ethernet',{exact:false}).check();await recovery.clock.runFor(400);await valid(recovery);await recovery.evaluate(()=>__test.startMode='hold');await recovery.getByRole('button',{name:'Start Advanced Scan',exact:true}).click();await recovery.evaluate(()=>document.dispatchEvent(new Event('unmount-test')));await recovery.evaluate(()=>{__test.pending.forEach(p=>p.resolve());});await recovery.clock.runFor(100);
 check(await recovery.evaluate(()=>!document.querySelector('[role=dialog]')&&document.body.dataset.started!=='true'&&__test.aborts>=2&&!document.getElementById('root').inert&&document.body.style.overflow===''),'unmount aborts preparation, ignores late response, restores page interaction');await recovery.close();
 const app=await browser.newPage();const errors=[];app.on('pageerror',error=>errors.push(String(error)));app.on('console',message=>{if(message.type()==='error')errors.push(message.text())});await mock(app);await app.clock.install();await app.goto('http://127.0.0.1:5179/src/test/browser/advanced_scan.html?app');await app.clock.runFor(100);
 check(await app.evaluate(()=>__test.sockets.length)===1,'StrictMode creates one owned progress socket');
 await app.evaluate(()=>{const s=__test.sockets[0];s.onerror?.(new Event('error'));});await app.clock.runFor(1100);
 check(await app.evaluate(()=>__test.sockets.length===2&&__test.sockets[0].closed===1),'failed initial socket reconnects once and closes old socket');
 await app.evaluate(()=>{const s=__test.sockets[1];s.readyState=1;s.onopen?.(new Event('open'));__test.running=true;});await app.clock.runFor(3200);
 check(await app.getByRole('button',{name:'Stop',exact:true}).count()>0,'HTTP status discovers running scan without WS events');
 await app.evaluate(()=>{__test.running=false;const s=__test.sockets[1];s.onclose?.(new Event('close'));});await app.clock.runFor(3200);
 check(await app.getByRole('button',{name:'Stop',exact:true}).count()===0,'lost WS terminal event reconciles through HTTP without scan deadlock');
 await app.evaluate(()=>__test.statusMode='500');await app.clock.runFor(3200);check(await app.getByText(/Scan status is unavailable/).count()===1,'unavailable HTTP and WS status is reported truthfully');
 await app.evaluate(()=>{const s=__test.sockets.at(-1);for(let i=0;i<20;i++)s.onmessage?.({data:'{'});});check(errors.length===0,'malformed events and failed connection do not crash or spam application console');
 await app.evaluate(()=>document.dispatchEvent(new Event('unmount-test')));await app.clock.runFor(20000);check(await app.evaluate(()=>__test.sockets.every(s=>s.closed===1)),'app unmount closes owned sockets without orphan reconnect');await app.close();
 console.log(`Advanced Scan browser: ${passed} passed, 0 failed, 0 skipped`);
 } finally {await browser.close();}
}
module.exports={mock,open,configure,valid};
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1});
