// UI-only harness: all API requests are mocked; no Windows adapter writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {mock}=require('./advanced_scan.cjs');
let passed=0;const check=(value,name)=>{assert.ok(value,name);passed++;console.log('PASS: '+name)};
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const purpose of ['CAMERA_PAIR','NETWORK_MATCH']){
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));await mock(page);
  await page.addInitScript(purpose=>{
   const original=window.fetch;const A={interfaceIndex:8,interfaceAlias:'Ethernet',mediaType:'ETHERNET',eligible:true,operationalStatus:'Up',dhcpEnabled:false,dnsAutomatic:true,dnsServers:[],defaultGateways:[],ipv4Addresses:[{address:'192.168.0.124',prefixLength:24}],capturedAt:'now'};
   const B={...A,ipv4Addresses:[{address:'192.168.1.137',prefixLength:24}]};
   const t=window.__test;t.retentionRequests=[];t.retained={id:'retained',purpose,deviceId:'',cameraIp:'',cameraSubnetMask:'255.255.255.0',adapter:B,originalAdapter:A,candidates:[],state:'PAIRED',recoveryAvailable:true,recoveryDisposition:'HEALTHY_RETAINED',adapterMutationActive:false,adapterConfigurationVerified:true,message:'Original configuration safely retained.'};
   window.fetch=async(url,options={})=>{
    const path=String(url);const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
    if(path.endsWith('/pair/status'))return json(t.retained);
    if(path.endsWith('/pair/adapters'))return json([t.retained.adapter]);
    if(path.endsWith('/pair/keep')){t.retentionRequests.push('keep');return json(t.retained)}
    if(path.endsWith('/pair/restore')){t.retentionRequests.push('restore');t.retained={...t.retained,state:'RESTORED',adapter:A,recoveryAvailable:false,recoveryDisposition:'ALREADY_RESTORED'};return json(t.retained)}
    return original(url,options);
   };
  },purpose);
  await page.goto('http://127.0.0.1:5179/src/test/browser/advanced_scan.html?app');
  const banner=page.getByRole('button',{name:/Configuration retained on Ethernet/});await banner.waitFor();
  check(await page.getByRole('button',{name:'Keep Current',exact:true}).count()===0,purpose+' restart does not force recovery modal');
  check(!(await banner.getAttribute('class')).includes('text-amber'),purpose+' retained banner is informational');
  await banner.click();await page.getByRole('button',{name:'Keep Current',exact:true}).waitFor();
  check(await page.getByText('192.168.1.137/24',{exact:true}).count()>0,purpose+' current address and prefix visible');
  await page.getByRole('button',{name:'Keep Current',exact:true}).click();await page.getByRole('button',{name:'Keep Current',exact:true}).waitFor({state:'hidden'});
  check(await page.evaluate(()=>__test.retentionRequests.join(',')==='keep'&&__test.retained.recoveryAvailable),purpose+' Keep Current dismisses and preserves recovery without Restore');
  await banner.click();
  if(purpose==='NETWORK_MATCH')await page.getByRole('button',{name:'Close Network Adapter'}).click();
  else await page.getByRole('heading',{name:'Pair PC to Camera Network'}).locator('../..').getByRole('button').click();
  check(await page.evaluate(()=>__test.retentionRequests.join(',')==='keep'),purpose+' modal close makes no mutation request');
  await banner.click();await page.getByRole('button',{name:'Restore Original Network Configuration',exact:true}).click();
  await page.getByText('Ethernet • 192.168.0.124',{exact:true}).waitFor();
  check(await page.evaluate(()=>__test.retentionRequests.join(',')==='keep,restore'),purpose+' explicit Restore alone requests restoration');
  check(errors.length===0,purpose+' no runtime errors');await page.close();
 }
 console.log(`Retained network browser: ${passed} passed, 0 failed, 0 skipped`);
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
