import {JsonPairRecoveryStore} from '../core/network/pair_service.ts';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {WebSocketServer} from 'ws';
import {mkdtempSync,existsSync,writeFileSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {WindowsPreflightService,PreflightDependencies,recoveryRequiresReview} from '../core/readiness/field_readiness.ts';
import {readBuildIdentity} from '../core/readiness/build_identity.ts';
import {SupportBundleBuilder} from '../core/readiness/support_bundle.ts';
import {SiteProjectDatabase} from '../core/storage/project_db.ts';
import {startupFailureMessage} from '../server/production_assets.ts';
const require=createRequire(import.meta.url),{smoke,validDiscovery}=require('../../scripts/smoke-production.cjs'),{buildIdentity}=require('../../scripts/build-identity.cjs');
let passed=0;const check=(v:unknown,name:string)=>{assert.ok(v,name);passed++;console.log('PASS: '+name)};
check(recoveryRequiresReview(false,null),'incomplete startup recovery inspection never reports clear');
check(recoveryRequiresReview(true,{recoveryAvailable:true}),'inspected persisted recovery remains actionable');
check(!recoveryRequiresReview(true,null),'only completed empty recovery inspection reports clear');
const base:PreflightDependencies={platform:'win32',runtime:'v22.18.0',enumerateAdapters:async()=>1,commandAvailable:async()=>true,credentialStoreAvailable:async()=>true,portAvailable:async()=>true,udpSocketAvailable:async()=>true,writable:async()=>true,isAdministrator:async()=>true,productionAssetsAvailable:async()=>true,recoveryRequired:async()=>false,operationActive:async()=>false,production:true};
const run=(patch:PreflightDependencies={})=>new WindowsPreflightService({...base,...patch}).run();
let r=await run();check(r.overall==='READY','all readiness capabilities ready');
r=await run({isAdministrator:async()=>false});check(r.overall==='WARNING','non-elevated host does not globally block Scan');check(r.checks.find(c=>c.id==='elevation')?.detail.includes('Pair/Match apply'),'elevation warning names adapter mutations');
r=await run({enumerateAdapters:async()=>0});check(r.overall==='WARNING'&&r.checks.find(c=>c.id==='adapters')?.state==='WARNING','no adapter prevents discovery readiness, not project/report work');
r=await run({recoveryRequired:async()=>true});check(r.checks.find(c=>c.id==='network-recovery')?.state==='WARNING','authoritative recovery requires review');
r=await run({recoveryRequired:async()=>{throw Error('password=private')}});check(r.checks.find(c=>c.id==='network-recovery')?.state==='WARNING','failed recovery read never claims clear');
r=await run({commandAvailable:async()=>{throw Error('private command stack')}});check(r.overall==='UNAVAILABLE','missing PowerShell is a Windows operation blocker');check(!JSON.stringify(r).includes('private'),'capability exceptions return safe individual checks');
check(r.checks.some(c=>c.id==='network-recovery'),'failed capability does not discard remaining readiness checks');
r=await run({credentialStoreAvailable:async()=>false});check(r.overall==='WARNING','optional secure storage failure is not global failure');
r=await run({udpSocketAvailable:async()=>false});check(r.overall==='WARNING','optional multicast socket failure remains scoped');check(r.checks.find(c=>c.id==='udp-discovery')?.detail.includes('does not prove'),'UDP readiness does not claim physical multicast reception');
r=await run({productionAssetsAvailable:async()=>false});check(r.overall==='UNAVAILABLE','missing production frontend blocks production readiness');
r=await run({production:false,productionAssetsAvailable:async()=>false});check(r.overall==='WARNING','missing production assets do not globally block development');
r=await run({operationActive:async()=>true});check(r.checks.find(c=>c.id==='operation-ownership')?.state==='WARNING','active operation ownership is explicit');
r=await run({build:{commit:null,dirty:null,sourceDigest:null,runtimeMode:'production'}});check(r.checks.find(c=>c.id==='build-identity')?.state==='WARNING','missing build manifest gives explicit readiness warning');
r=await run({build:{commit:null,dirty:null,sourceDigest:'a'.repeat(64),runtimeMode:'production'}});check(r.checks.find(c=>c.id==='build-identity')?.state==='READY','source digest identifies a non-Git field build truthfully');
let directories:string[]=[];r=await run({appDataDirectory:join(tmpdir(),'field-test-data'),writable:async dir=>{directories.push(dir);return false}});check(directories.length===1,'readiness reuses one bounded storage check');check(r.overall==='WARNING','recovery storage failure does not block browser reports');check(!JSON.stringify(r).includes('field-test-data'),'readiness omits profile paths');check(r.checks.find(c=>c.id==='project-report-output')?.detail.includes('browser downloads'),'storage does not claim user download destination was tested');
check(startupFailureMessage('EACCES').includes('Windows denied'),'bind denial remains actionable');check(startupFailureMessage('EADDRINUSE').includes('Another process'),'occupied port never triggers process killing');

const fixture=mkdtempSync(join(tmpdir(),'cctv-field-preparation-'));
try{
 const previousAppData=process.env.LOCALAPPDATA;try{process.env.LOCALAPPDATA=fixture;const store=new JsonPairRecoveryStore();await store.save({id:'field-recovery',state:'PAIRED'} as any);check(existsSync(join(fixture,'CCTVDiscoveryTool','pair-recovery.json')),'recovery writes under injected app-data root');check((await store.load())?.id==='field-recovery','recovery state survives a storage round trip');await store.clear();check(await store.load()===null,'explicit recovery cleanup removes only its snapshot');}finally{if(previousAppData===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=previousAppData;}
 writeFileSync(join(fixture,'package.json'),'{"version":"1.6.0"}');mkdirSync(join(fixture,'src'));writeFileSync(join(fixture,'src','main.ts'),'export const value=1;');
 const identity=buildIdentity(fixture);check(identity.version==='1.6.0','product version retained');check(identity.commit===null&&identity.dirty===null,'non-Git distribution has no fabricated commit');check(identity.sourceDigest===buildIdentity(fixture).sourceDigest,'identical source produces deterministic build identity');
 writeFileSync(join(fixture,'src','main.ts'),'export const value=2;');check(identity.sourceDigest!==buildIdentity(fixture).sourceDigest,'runtime source changes alter build identity');
 const manifest=join(fixture,'build-info.json');writeFileSync(manifest,JSON.stringify(identity));const loaded=readBuildIdentity(manifest);check(loaded.sourceDigest===identity.sourceDigest,'runtime reads deterministic build manifest');check(['production','development'].includes(loaded.runtimeMode),'runtime mode is explicit');
 writeFileSync(manifest,'{"version":"1.6.0","commit":"password=private","sourceDigest":"fake"}');check(readBuildIdentity(manifest).commit===null,'malformed identity cannot fabricate a commit');check(readBuildIdentity(join(fixture,'absent')).sourceDigest===null,'missing manifest explicitly unavailable');
 const bundle=new SupportBundleBuilder().build({application:{name:'CCTV Network Assistant',version:loaded.version,runtime:process.version,platform:'win32',build:loaded},readiness:await run(),network:[],monitoring:{enabled:true},discovery:{},projectSession:new SiteProjectDatabase().getSession(),events:[],pair:{password:'private-password'},tasks:{secret:'private-secret'}}) as any;
 check(bundle.application.build.sourceDigest===identity.sourceDigest,'safe support output includes exact build evidence');check(bundle.readiness.checks.length>0,'safe support output retains readiness');check(!JSON.stringify(bundle).includes('private-'),'support build integration preserves redaction');
}finally{assert.ok(resolve(fixture).startsWith(resolve(tmpdir()))&&fixture.includes('cctv-field-preparation-'));rmSync(fixture,{recursive:true,force:true});}

const valid={running:false,foreground:{epoch:'smoke-test',revision:0,session:null}};
check(validDiscovery(valid),'empty discovery status is structurally valid');check(!validDiscovery({running:false}),'smoke rejects unrelated JSON');check(!validDiscovery({...valid,foreground:{...valid.foreground,revision:-1}}),'smoke rejects malformed foreground revision');
let mode='ok',gets:string[]=[],closeCode=0;
const server=createServer((req,res)=>{gets.push(req.method+' '+req.url);if(mode==='hang')return;if(mode==='http-fail'){res.writeHead(503);res.end();return;}if(req.url==='/'){res.end('<html><div id="root"></div></html>');return;}res.setHeader('Content-Type','application/json');res.end(mode==='bad-api'?'{}':JSON.stringify(valid));});
const wss=new WebSocketServer({noServer:true});server.on('upgrade',(req,socket,head)=>{if(mode==='ws-hang')return;wss.handleUpgrade(req,socket,head,ws=>{if(mode==='ws-abnormal'){ws.close(1011);return;}ws.on('close',code=>closeCode=code);});});
server.listen(0,'127.0.0.1');await new Promise<void>(done=>server.once('listening',done));const url=`http://127.0.0.1:${(server.address() as any).port}`;
const sockets=new Set<any>();server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
async function fails(next:string){mode=next;try{await smoke({baseUrl:url,timeoutMs:100});return false;}catch(error){return String(error).includes('failed')||String(error).includes('timed out')||String(error).includes('cleanly');}}
try{
 const occupied=createServer();const occupiedCode=await new Promise<string>(done=>{occupied.once('error',(error:NodeJS.ErrnoException)=>done(error.code||''));occupied.listen((server.address() as any).port,'127.0.0.1',()=>occupied.close(()=>done('UNEXPECTED_AVAILABLE')));});check(occupiedCode==='EADDRINUSE','occupied port is detected without replacing the existing listener');
 check((await smoke({baseUrl:url,timeoutMs:1000})).length===3,'real HTTP root API and WebSocket smoke succeeds on available port');for(let i=0;i<50&&closeCode===0;i++)await new Promise(resolve=>setTimeout(resolve,5));check(closeCode===1000,'WebSocket uses clean normal close');check(gets.every(req=>req==='GET /'||req==='GET /api/discovery/status'),'smoke makes only read-only HTTP requests');
 check(await fails('http-fail'),'HTTP failure yields actionable smoke failure');check(await fails('bad-api'),'invalid API yields smoke failure');check(await fails('hang'),'hanging HTTP hits deadline');check(await fails('ws-hang'),'hanging WebSocket hits deadline');check(await fails('ws-abnormal'),'abnormal WebSocket close fails');
 mode='bad-api';const code=await new Promise<number|null>(done=>{const child=spawn(process.execPath,['scripts/smoke-production.cjs',url],{stdio:'ignore',windowsHide:true});child.once('exit',done);});check(code===1,'standalone smoke returns failure exit code');
 mode='ok';const successCode=await new Promise<number|null>(done=>{const child=spawn(process.execPath,['scripts/smoke-production.cjs',url],{stdio:'ignore',windowsHide:true});child.once('exit',done);});check(successCode===0,'standalone smoke exits zero and leaves no owned backend');
 let rejected=false;try{await smoke({baseUrl:'http://example.com'})}catch{rejected=true}check(rejected,'smoke refuses external targets');
}finally{for(const socket of sockets)socket.destroy();for(const ws of wss.clients)ws.terminate();await new Promise<void>(done=>wss.close(()=>done()));await new Promise<void>(done=>server.close(()=>done()));}
const source=readFileSync('src/core/readiness/field_readiness.ts','utf8');check(source.includes("item.family==='IPv4'&&!item.internal"),'fallback excludes IPv6 and loopback-only hosts');check(!source.includes('omar.cruz'),'runtime readiness has no developer profile dependency');
console.log(`Field preparation: ${passed} passed, 0 failed, 0 skipped`);
