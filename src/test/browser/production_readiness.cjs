// Read-only browser check against an already-running production server with cameras disconnected.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
let passed=0;const check=(v,n)=>{assert.ok(v,n);passed++;console.log('PASS: '+n)};
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://localhost:3001/');await page.getByRole('heading',{name:'CCTV Network Assistant'}).waitFor();check(true,'built production frontend opens');
 await page.getByText('Quick Work',{exact:false}).first().waitFor();check(await page.getByText('No devices discovered.',{exact:true}).isVisible(),'actual production session contains no seeded cameras');
 check(await page.getByRole('button',{name:'Scan',exact:true}).isVisible(),'actual foreground is idle without starting a scan');
 await page.getByRole('button',{name:'Tasks',exact:true}).click();await page.getByText('No recent technician tasks.').waitFor();check(true,'actual production Tasks is empty');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'About',exact:true}).click();await page.getByText(/Mode: production/).waitFor({timeout:60000});check(true,'actual production About shows manifest identity and runtime mode');await page.keyboard.press('Escape');
 check(errors.length===0,'production browser has no runtime exception');
 console.log(`Production readiness browser: ${passed} passed, 0 failed, 0 skipped`);
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1});
