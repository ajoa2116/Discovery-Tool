export type ReportPreviewScope='ALL'|'SELECTED'|'FILTERED'|'PROJECT'|'REPORT_SET';
interface ReportPreviewInformation {projectName:string;siteLocation:string;technicianName:string}
interface ReportPreviewSettings {
 type:string;scope:ReportPreviewScope;selectedDeviceIds:readonly string[];filteredDeviceIds:readonly string[];
 columns:string[];orientation:string;sortBy:string;includeHistory:boolean;projectMode:boolean;
 reportInformation:ReportPreviewInformation;timeZone:string;
}
/** Render and automatic preview share the same effective-scope derivation. */
export function buildReportPreviewRequest(settings:ReportPreviewSettings,scope=settings.scope,reportInformation=settings.reportInformation) {
 return {type:settings.type,scope,timeZone:settings.timeZone,reportInformation:{...reportInformation},
 deviceIds:scope==='SELECTED'?[...settings.selectedDeviceIds]:scope==='FILTERED'?[...settings.filteredDeviceIds]:undefined,
 columns:[...settings.columns],orientation:settings.orientation,sortBy:settings.sortBy,
 includeHistory:settings.projectMode&&scope!=='REPORT_SET'&&settings.includeHistory,
 title:settings.type==='SITE_SURVEY'?'Site Survey / Project Report':settings.type==='DIAGNOSTIC_SUMMARY'?'Diagnostic Summary':scope==='SELECTED'?'Selected Devices Report':'Device Inventory Report'};
}
/** JSON request identity: object key order is irrelevant; array order is preserved. */
function requestKey(value:unknown):string {
 const json=JSON.parse(JSON.stringify(value));
 const ordered=(item:any):any=>Array.isArray(item)?item.map(ordered):item&&typeof item==='object'?Object.fromEntries(Object.keys(item).sort().map(key=>[key,ordered(item[key])])):item;
 return JSON.stringify(ordered(json));
}
const detached=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
type PreviewGeneration={instant:string;timeZone:string};
/** Local UI state only. This is neither report admission nor a server snapshot guarantee. */
export class ReportPreviewState<R extends {columns:string[]}> {
 private key='';
 private revision=0;
 private pending?:{token:object;revision:number;request:R};
 private accepted?:{request:R;generation:PreviewGeneration};
 sync(request:R) {
  const key=requestKey(request);
  if(key!==this.key){this.key=key;this.revision++;this.accepted=undefined;}
 }
 begin(request:R) {
  this.sync(request);
  const token={request:detached(request)};
  this.accepted=undefined;
  this.pending={token,revision:this.revision,request:detached(request)};
  return token;
 }
 isCurrent(token:object) {return this.pending?.token===token&&this.pending.revision===this.revision;}
 accept(token:object,generation:PreviewGeneration) {
  if(!this.isCurrent(token)||!this.pending!.request.columns.length||!generation?.instant||!generation?.timeZone)return false;
  this.accepted={request:detached(this.pending!.request),generation:detached(generation)};
  return true;
 }
 finish(token:object) {
  if(this.pending?.token!==token)return false;
  this.pending=undefined;
  return true;
 }
 cancel() {this.revision++;this.pending=undefined;this.accepted=undefined;}
 exportRequest(request:R) {
  this.sync(request);
  if(this.pending||!this.accepted||!request.columns.length)return null;
  return {...detached(this.accepted.request),generatedAt:this.accepted.generation.instant,timeZone:this.accepted.generation.timeZone};
 }
}