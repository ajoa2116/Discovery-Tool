import { strict as assert } from 'node:assert';
import express from 'express';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { AdvancedScanPlanner, AdvancedScanService } from '../core/engine/advanced_scan.ts';
import { PowerShellWindowsNetworkAdapterService, parseWindowsAdapterOutput, NetworkConfigurationError } from '../core/network/windows_adapter_service.ts';
import { createAdvancedScanRouter } from '../server/advanced_scan_routes.ts';
import { technicianErrorResponse } from '../shared/error_presentation.ts';
import { emptyAdvancedScanRequest } from '../shared/advanced_scan.ts';
import { assessAdvancedDraft, isAdapterCollection, isAdvancedPlan, advancedRequestErrors } from '../shared/advanced_scan_contract.ts';
import { loadAdvancedAdapters, validateAdvancedRequest } from '../ui/advanced_scan_client.ts';
import { AdvancedScanModal } from '../ui/components/AdvancedScanModal.tsx';
import { ApplicationErrorBoundary } from '../ui/components/ApplicationErrorBoundary.tsx';
import { WindowsAdapterSnapshot } from '../types/index.ts';
let passed=0; const check=(value:unknown,name:string)=>{assert.ok(value,name);console.log(`PASS: ${name}`);passed++};
const adapter:WindowsAdapterSnapshot={interfaceIndex:8,interfaceAlias:'Ethernet',operationalStatus:'Up',eligible:true,mediaType:'ETHERNET',hardwareInterface:true,physicalMediaType:'802.3',dhcpEnabled:true,ipv4Addresses:[{address:'192.168.0.124',prefixLength:24}],defaultGateways:[],dnsAutomatic:true,dnsServers:[],capturedAt:'now'};
const response=(body:unknown,status=200):typeof fetch => (async()=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})) as typeof fetch;
async function run(){
 check(isAdapterCollection([adapter]),'valid metadata collection accepted');
 check(parseWindowsAdapterOutput(JSON.stringify(adapter))[0].eligible,'PowerShell singleton normalized and physical eligibility retained');
 check(parseWindowsAdapterOutput('[]').length===0,'empty PowerShell collection stays empty');
 check(parseWindowsAdapterOutput(JSON.stringify([{...adapter,dnsServers:[null]}]))[0].dnsServers.length===0,'absent DNS values do not invent configuration');
 for(const body of [null,undefined,{error:'failure'},{},[null],[{...adapter,ipv4Addresses:null}],[{...adapter,ipv4Addresses:[{}]}]]){
   check(!isAdapterCollection(body),'malformed adapter collection rejected');
   const loaded=await loadAdvancedAdapters(response(body));check(!loaded.ok&&Array.isArray(loaded.adapters)&&loaded.adapters.length===0,'malformed response never reaches array rendering');
 }
 for(const body of ['bad json','null','{}']){assert.throws(()=>parseWindowsAdapterOutput(body),{code:'ADAPTER_ENUMERATION_MALFORMED_OUTPUT'});check(true,'malformed PowerShell output fails explicitly')}
 const good=await loadAdvancedAdapters(response([adapter]));check(good.ok&&good.adapters[0].interfaceIndex===8,'successful frontend load preserves adapter metadata');
 const empty=await loadAdvancedAdapters(response([]));check(empty.ok&&empty.message.includes('No network adapters'),'empty success has unavailable explanation');
 const failure=await loadAdvancedAdapters(response({error:'secret stack'},500));check(!failure.ok&&!failure.message.includes('secret'),'HTTP500 remains safe unavailable state');
 let attempt=0;const retry=(async()=>++attempt===1?new Response('{}',{status:500}):new Response(JSON.stringify([adapter]))) as typeof fetch;
 check(!(await loadAdvancedAdapters(retry)).ok&&(await loadAdvancedAdapters(retry)).ok,'retry recovers after failure');
 let calls=0,release!:(value:string)=>void;const shell=new PowerShellWindowsNetworkAdapterService(async()=>{calls++;return await new Promise<string>(resolve=>release=resolve)});
 const first=shell.inspectAdapters(),second=shell.inspectAdapters();check(calls===1,'overlapping inspection shares one PowerShell process');release(JSON.stringify([adapter]));const [one,two]=await Promise.all([first,second]);one[0].interfaceAlias='changed';check(two[0].interfaceAlias==='Ethernet','shared callers receive independent snapshots');
 const third=shell.inspectAdapters();check(calls===2,'subsequent inspection is fresh without stale cache');release('[]');await third;
 let failOnce=true;const recover=new PowerShellWindowsNetworkAdapterService(async()=>{if(failOnce){failOnce=false;throw new NetworkConfigurationError('Enumeration timed out','ADAPTER_ENUMERATION_TIMEOUT')}return JSON.stringify([adapter])});await assert.rejects(recover.inspectAdapters());check((await recover.inspectAdapters()).length===1,'inspection failure clears in-flight state for retry');
 const req=emptyAdvancedScanRequest(), row={type:'RANGE' as const,first:'192.168.1.100',second:'192.168.1.100',prefix:'',prefixSource:'BLANK' as const};
 check(assessAdvancedDraft(req,[],'',[],false).state==='INCOMPLETE','initial adapter loading is incomplete');
 check(assessAdvancedDraft(req,[row],'',[adapter],true).state==='INCOMPLETE','missing selected adapter is incomplete');req.adapterIndexes=[8];
 for(const patch of [{first:'192.168.1.'},{second:'192.168.'}])check(assessAdvancedDraft(req,[{...row,...patch}],'',[adapter],true).state==='INCOMPLETE','partial IP draft remains local incomplete state');
 check(assessAdvancedDraft(req,[{...row,first:'999.1.1.1'}],'',[adapter],true).state==='INVALID','malformed IPv4 gets visible invalid state');
 check(assessAdvancedDraft(req,[row],'80,no',[adapter],true).state==='INVALID','invalid custom port stays local');
 check(assessAdvancedDraft(req,[row],'80',[adapter],true).state==='READY','selected adapter and single-IP range ready');
 check(assessAdvancedDraft(req,[row],'',[{...adapter,eligible:false}],true).state==='INCOMPLETE','no eligible adapter cannot start');
 req.targets=[{type:'RANGE',start:row.first,end:row.second}];const plan=new AdvancedScanPlanner().plan(req,[adapter]);
 check(plan.valid&&plan.estimatedTargetCount===1&&isAdvancedPlan(plan),'single-IP plan preserves one numeric target');
 check(advancedRequestErrors({...req,customPorts:[null]}).length>0,'JSON null from NaN port rejected by runtime schema');
 check(!new AdvancedScanPlanner().plan({...req,adapterIndexes:[]},[adapter]).valid,'backend rejects missing adapter for Advanced Scan');
 check(!(await validateAdvancedRequest(req,response(plan,400))).plan,'HTTP400 cannot enable Start even with malformed valid flag');
 check(advancedRequestErrors(null).length>0,'missing request rejected safely');
 check((await validateAdvancedRequest(req,response(plan))).plan?.valid,'valid response accepted');
 const invalid={...plan,valid:false,errors:['Invalid range.']};check((await validateAdvancedRequest(req,response(invalid,400))).message==='Invalid range.','invalid plan renders structured validation');
 check((await validateAdvancedRequest(req,response({kind:'INVALID_FORM',errors:['Choose supported methods.']},400))).message.includes('Choose'),'schema rejection renders without plan fields');
 const serverFailure=await validateAdvancedRequest(req,response({error:'secret'},500));check(!serverFailure.plan&&serverFailure.message.includes('unavailable')&&!serverFailure.message.includes('secret'),'server failure distinct from invalid form');
 for(const body of [null,{}, {...plan,warnings:null},{...plan,adapterIndexes:null}])check(!(await validateAdvancedRequest(req,response(body))).plan,'malformed validation cannot enable Start');
 let throwService=false;const app=express();app.use(express.json());app.use('/advanced',createAdvancedScanRouter({listAdapters:async()=>{if(throwService)throw new NetworkConfigurationError('Enumeration timeout','ADAPTER_ENUMERATION_TIMEOUT');return [adapter]},validate:async input=>{if(throwService)throw new NetworkConfigurationError('Enumeration timeout','ADAPTER_ENUMERATION_TIMEOUT');return new AdvancedScanPlanner().plan(input,[adapter])}},(res,error,status,operation)=>res.status(status).json(technicianErrorResponse(error,{operation}))));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const port=(server.address() as any).port;
 try{
   let r=await fetch(`http://127.0.0.1:${port}/advanced/adapters`);check(r.status===200&&isAdapterCollection(await r.json()),'adapter API200 returns documented array');throwService=true;
   r=await fetch(`http://127.0.0.1:${port}/advanced/adapters`);const body=await r.json();check(r.status===500&&!isAdapterCollection(body)&&body.presentation.reference,'enumeration exception returns correlated structured500');
   r=await fetch(`http://127.0.0.1:${port}/advanced/validate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)});check(r.status===500,'enumeration failure in validation is500 rather than400');
   r=await fetch(`http://127.0.0.1:${port}/advanced/validate`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});check(r.status===400&&(await r.json()).kind==='INVALID_FORM','malformed request400 before adapter enumeration');throwService=false;
   r=await fetch(`http://127.0.0.1:${port}/advanced/validate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)});check(r.status===200&&(await r.json()).valid,'valid API request recovers after enumeration failure');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
 const html=renderToStaticMarkup(React.createElement(AdvancedScanModal,{open:true,onClose(){},onStarted(){}}));check(html.includes('Loading network adapters')&&html.includes('disabled'),'modal renders loading and disabled Start safely');
 const normal=renderToStaticMarkup(React.createElement(ApplicationErrorBoundary,null,React.createElement('p',null,'Normal child')));check(normal.includes('Normal child'),'boundary leaves normal render unchanged');
 const boundary=new ApplicationErrorBoundary({children:null});boundary.state=ApplicationErrorBoundary.getDerivedStateFromError();const fallback=renderToStaticMarkup(boundary.render() as React.ReactElement);check(fallback.includes('Reload Interface')&&fallback.includes('UI-'),'boundary error state renders recovery and reference');
 const modal=readFileSync('src/ui/components/AdvancedScanModal.tsx','utf8');check(modal.includes('controller.abort()')&&modal.includes('if (active)')&&modal.includes('validation.key === validationKey'),'validation abort and active/key guards reject stale response');check(modal.includes("draft.state !== 'READY'")&&modal.includes('clearTimeout(timer)'),'incomplete drafts suppress debounce requests');
 check(readFileSync('src/ui/main.tsx','utf8').includes('<ApplicationErrorBoundary><App /></ApplicationErrorBoundary>'),'application root contains render failures');
 console.log(`Advanced Scan hotfix: ${passed} passed, 0 failed`);
}
run().catch(error=>{console.error(error);process.exitCode=1});
