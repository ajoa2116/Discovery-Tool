import {ReportPreviewState,buildReportPreviewRequest} from '../shared/report_preview_state.ts';
import {reportDefaults} from '../shared/report_configuration.ts';
import {readFileSync} from 'node:fs';
let passed=0,failed=0;
const check=(value:unknown,label:string)=>{if(value){passed++;console.log('PASS: '+label)}else{failed++;console.error('FAIL: '+label)}};
const settings=()=>({type:'DEVICE_INVENTORY',scope:'SELECTED',deviceIds:['camera-A'],columns:['NAME','NOTES'],orientation:'PORTRAIT',sortBy:'NAME',includeHistory:false,reportInformation:{projectName:'Site',siteLocation:'Lobby',technicianName:'Alex'},timeZone:'UTC',title:'Selected Devices Report'});
type Request=ReturnType<typeof settings>;
const generation={instant:'2026-10-18T12:00:00.000Z',timeZone:'UTC'};
const ready=(request=settings())=>{const state=new ReportPreviewState<Request>();state.sync(request);const token=state.begin(request);check(state.accept(token,generation),'unchanged successful response accepted');state.finish(token);return state;};
const mutations:Array<[string,(r:Request)=>void]>=[
 ['scope',r=>{r.scope='ALL';delete (r as Partial<Request>).deviceIds;}],
 ['selected IDs',r=>{r.deviceIds=['camera-B'];}],['Notes column',r=>{r.columns=['NAME'];}],
 ['column order',r=>{r.columns.reverse();}],['orientation',r=>{r.orientation='LANDSCAPE';}],
 ['sort',r=>{r.sortBy='IP';}],['history',r=>{r.includeHistory=true;}],
 ['technician',r=>{r.reportInformation.technicianName='Blair';}],['project information',r=>{r.reportInformation.projectName='Other';}],
 ['site information',r=>{r.reportInformation.siteLocation='Garage';}],['timezone',r=>{r.timeZone='America/New_York';}],
 ['type',r=>{r.type='DIAGNOSTIC_SUMMARY';}],['title',r=>{r.title='Other report';}],['zero columns',r=>{r.columns=[];}],
];
for(const [label,mutate] of mutations){const original=settings(),state=ready(original),changed=structuredClone(original);mutate(changed);state.sync(changed);check(state.exportRequest(changed)===null,label+' invalidates export');state.sync(original);check(state.exportRequest(original)===null,label+' change-back still requires fresh preview');}
for(const format of ['pdf','csv','json']){const request=settings(),state=ready(request),body=state.exportRequest(request);check(JSON.stringify(body)===JSON.stringify({...request,generatedAt:generation.instant,timeZone:generation.timeZone}),format+' uses accepted snapshot and generation');}
{
 const request=settings(),before=JSON.stringify(request),state=ready(request),body=state.exportRequest(request)!;body.columns.push('MAC');body.reportInformation.projectName='Mutated copy';check(JSON.stringify(request)===before,'export does not mutate source controls or Project information');check(state.exportRequest(request)!.reportInformation.projectName==='Site'&&state.exportRequest(request)!.columns.join()==='NAME,NOTES','export output cannot mutate retained snapshot');
 const reordered={...request,reportInformation:{technicianName:'Alex',siteLocation:'Lobby',projectName:'Site'}};check(state.exportRequest(reordered)!==null,'object property ordering is irrelevant');
}
{
 const request=settings(),state=ready(request);const token=state.begin(request);check(state.exportRequest(request)===null,'refresh pending disables previous acceptance');state.finish(token);check(state.exportRequest(request)===null,'failed refresh cannot reuse old acceptance');
 const cancelled=state.begin(request);state.cancel();check(!state.accept(cancelled,generation)&&!state.finish(cancelled)&&state.exportRequest(request)===null,'cancelled response cannot enable export or release another request');
 const empty={...request,columns:[]},invalid=state.begin(empty);check(!state.accept(invalid,generation),'zero-column response rejected');state.finish(invalid);check(state.exportRequest(empty)===null,'zero-column acceptance cannot enable export');
}
const deferred=()=>{let resolve!:(value:typeof generation)=>void;const promise=new Promise<typeof generation>(yes=>{resolve=yes});return{resolve,promise}};
async function run(){
 // Exercise the same request builder used for render and automatic opening requests.
 const scopeCases:Array<{label:string;from:'ALL'|'SELECTED'|'REPORT_SET';to:'ALL'|'SELECTED'|'FILTERED'|'PROJECT'|'REPORT_SET';history:boolean;expectedHistory:boolean;title:string;ids?:string[]}>= [
  {label:'first Selected opening',from:'ALL',to:'SELECTED',history:false,expectedHistory:false,title:'Selected Devices Report',ids:['camera-A']},
  {label:'initial All opening',from:'ALL',to:'ALL',history:false,expectedHistory:false,title:'Device Inventory Report'},
  {label:'reopen All to Selected',from:'ALL',to:'SELECTED',history:true,expectedHistory:true,title:'Selected Devices Report',ids:['camera-A']},
  {label:'reopen Selected to All',from:'SELECTED',to:'ALL',history:true,expectedHistory:true,title:'Device Inventory Report'},
  {label:'leave Report Set for Project',from:'REPORT_SET',to:'PROJECT',history:true,expectedHistory:true,title:'Device Inventory Report'},
  {label:'leave Report Set for Selected',from:'REPORT_SET',to:'SELECTED',history:true,expectedHistory:true,title:'Selected Devices Report',ids:['camera-A']},
  {label:'enter Report Set',from:'SELECTED',to:'REPORT_SET',history:true,expectedHistory:false,title:'Device Inventory Report'},
  {label:'filtered request IDs',from:'ALL',to:'FILTERED',history:false,expectedHistory:false,title:'Device Inventory Report',ids:['camera-B']},
 ];
 for(const item of scopeCases){
  const controls={...settings(),scope:item.from,projectMode:true,selectedDeviceIds:['camera-A'],filteredDeviceIds:['camera-B'],includeHistory:item.history};
  const info={projectName:'Technician custom site',siteLocation:'Custom location',technicianName:'Blair'},before=JSON.stringify({controls,info});
  const state=new ReportPreviewState<ReturnType<typeof buildReportPreviewRequest>>();state.sync(buildReportPreviewRequest(controls));
  const automatic=buildReportPreviewRequest(controls,item.to,info),token=state.begin(automatic);
  const rendered=buildReportPreviewRequest({...controls,scope:item.to,reportInformation:info});state.sync(rendered);
  check(automatic.title===item.title&&automatic.includeHistory===item.expectedHistory&&JSON.stringify(automatic.deviceIds)===JSON.stringify(item.ids),item.label+': effective title/history/IDs');
  check(state.accept(token,generation),item.label+': automatic response survives unchanged-controls render');state.finish(token);
  check(JSON.stringify(state.exportRequest(rendered))===JSON.stringify({...automatic,generatedAt:generation.instant,timeZone:generation.timeZone}),item.label+': automatic preview enables exact snapshot export');
  check(JSON.stringify({controls,info})===before&&JSON.stringify(automatic.reportInformation)===JSON.stringify(info),item.label+': explicit technician information and inputs preserved');
  const changed={...rendered,columns:['NAME']};check(state.exportRequest(changed)===null,item.label+': subsequent settings changes remain denied');
 }
 for(const type of ['SITE_SURVEY','DIAGNOSTIC_SUMMARY']){
  const controls={...settings(),type,scope:'REPORT_SET' as const,projectMode:false,includeHistory:true,selectedDeviceIds:['camera-A'],filteredDeviceIds:[]};
  const request=buildReportPreviewRequest(controls,'SELECTED');
  check(request.title===(type==='SITE_SURVEY'?'Site Survey / Project Report':'Diagnostic Summary')&&!request.includeHistory,type+': type-specific title and Quick Work history rule retained');
 }
 for(const order of ['old-first','new-first']){
  const state=new ReportPreviewState<Request>(),a=settings(),b={...settings(),orientation:'LANDSCAPE'};state.sync(a);
  const old=state.begin(a),oldReply=deferred();const oldResult=oldReply.promise.then(g=>{const accepted=state.accept(old,g);const finished=state.finish(old);return{accepted,finished}});
  state.sync(b);const latest=state.begin(b),latestReply=deferred();const newResult=latestReply.promise.then(g=>{const accepted=state.accept(latest,g);state.finish(latest);return accepted});
  if(order==='old-first'){oldReply.resolve(generation);const result=await oldResult;check(!result.accepted&&!result.finished,'old-first response neither accepted nor clears newer busy ownership');latestReply.resolve(generation);check(await newResult,'old-first latest response accepted');}
  else{latestReply.resolve(generation);check(await newResult,'new-first latest response accepted');oldReply.resolve(generation);const result=await oldResult;check(!result.accepted&&!result.finished,'new-first late response cannot replace accepted preview');}
  check(state.exportRequest(b)?.orientation==='LANDSCAPE',order+' exports only latest request');
 }
 {
  const state=new ReportPreviewState<Request>(),a=settings(),b={...settings(),scope:'ALL'};const token=state.begin(a);state.sync(b);state.sync(a);check(!state.accept(token,generation),'A to B to A does not revive in-flight A');state.finish(token);check(state.exportRequest(a)===null,'A to B to A requires new successful response');
  const fresh=state.begin(a);state.accept(fresh,generation);state.finish(fresh);const changed=settings();changed.columns=['NAME'];check(state.exportRequest(changed)===null,'export guard itself detects changed controls without prior sync');
 }
 {
  const request=settings(),state=new ReportPreviewState<Request>();
  check(state.exportRequest(request)===null,'no preview cannot export');
  const failed=state.begin(request);state.finish(failed);check(state.exportRequest(request)===null,'initial failed response cannot export');
  const first=state.begin(request),second=state.begin(request);check(!state.accept(first,generation)&&!state.finish(first),'same-settings older response cannot accept or release newer request');
  check(state.accept(second,generation),'same-settings latest response accepted');state.finish(second);
  const original=structuredClone(request),token=state.begin(request);token.request.columns.push('MAC');token.request.reportInformation.projectName='Changed transport copy';
  state.accept(token,generation);state.finish(token);
  check(state.exportRequest(original)?.columns.join()==='NAME,NOTES'&&state.exportRequest(original)?.reportInformation.projectName==='Site','accepted snapshot is detached from transport request mutations');
  state.cancel();check(state.exportRequest(original)===null,'close/unmount invalidation revokes prior acceptance');
 }
 check(reportDefaults('DEVICE_INVENTORY').join()==='NAME,STATUS,IP,MAC_LAST_6,MANUFACTURER_MODEL,SERIAL,NOTES','existing report column defaults unchanged');
 let sourcePassed=0,sourceFailed=0;
 const sourceCheck=(value:unknown,label:string)=>{if(value){sourcePassed++;console.log('PASS (source only): '+label)}else{sourceFailed++;console.error('FAIL (source only): '+label)}};
 const service=readFileSync('src/core/reporting/report_service.ts','utf8');sourceCheck(service.includes('if(SECRET.test(JSON.stringify(model)))throw Error('),'existing sensitive-report rejection retained');
 const ui=readFileSync('src/ui/components/SiteSurveyReportModal.tsx','utf8');
 sourceCheck(ui.includes('disabled={busy||!exportEligible}')&&ui.includes('Report settings changed — Update Preview before exporting.'),'all format buttons use current eligibility and stale preview is labelled');
 const handler=ui.slice(ui.indexOf('const exportReport='),ui.indexOf('return <ModalViewport'));
 sourceCheck(handler.indexOf('const acceptedRequest=previewState.exportRequest(request)')<handler.indexOf('await fetch(')&&handler.includes('if(busy||!acceptedRequest)')&&handler.includes('JSON.stringify(acceptedRequest)'),'export handler checks eligibility before transport and uses accepted snapshot');
 sourceCheck(ui.includes('if(previewState.accept(token,data.generation))setPreview(data)')&&ui.includes('if(previewState.finish(token))setBusy(false)')&&ui.includes('if(previewState.isCurrent(token))setError('),'response, error and busy updates are request-owned');
 sourceCheck(ui.includes('return ()=>previewState.cancel()'),'modal lifecycle invalidates pending requests');
 sourceCheck(ui.includes('const request=makeRequest()')&&ui.includes('previewState.begin(makeRequest(nextScope,nextInformation))')&&ui.includes('=>buildReportPreviewRequest('),'render and automatic previews use the same effective-scope builder');
 console.log(`Report preview source wiring: ${sourcePassed} passed, ${sourceFailed} failed`);
 if(sourceFailed)process.exitCode=1;
 console.log(`Report preview workflow: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
}
run().catch(error=>{console.error(error);process.exitCode=1});