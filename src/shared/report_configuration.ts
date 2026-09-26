export const REPORT_COLUMNS={NAME:'Camera Name',STATUS:'Status',IP:'IP',MAC_LAST_6:'MAC Last 6',MANUFACTURER_MODEL:'Manufacturer / Model',SERIAL:'Serial',NOTES:'Notes',MAC:'Full MAC',LOCATION:'Camera Location',CONFIGURED:'Configured',MANUFACTURER:'Manufacturer',MODEL:'Model',FIRMWARE:'Firmware',SUBNET:'Subnet',GATEWAY:'Gateway',ONVIF_UUID:'ONVIF UUID',ACTIVE_DRIVER:'Active Driver',LAST_VERIFIED:'Last Verified',DUPLICATE_STATE:'Duplicate IP State',DIAGNOSTIC_SUMMARY:'Diagnostic Summary'} as const;
export type ReportColumn=keyof typeof REPORT_COLUMNS;
export const DEFAULT_REPORT_COLUMNS:ReportColumn[]=['NAME','STATUS','IP','MAC_LAST_6','MANUFACTURER_MODEL','SERIAL','NOTES'];
export const DIAGNOSTIC_REPORT_COLUMNS:ReportColumn[]=['NAME','STATUS','IP','MAC_LAST_6','DIAGNOSTIC_SUMMARY','LAST_VERIFIED'];
export const reportDefaults=(type:string):ReportColumn[]=>[...(type==='DIAGNOSTIC_SUMMARY'?DIAGNOSTIC_REPORT_COLUMNS:DEFAULT_REPORT_COLUMNS)];
// NAME was always the camera's technician-entered name, despite its legacy label.
// Unknown/report-level keys are omitted; supported separate manufacturer/model keys remain valid.
export const reportColumns=(columns:readonly string[]|undefined,type:string):ReportColumn[]=>{
 const valid=columns?.filter((key,i,all)=>Object.hasOwn(REPORT_COLUMNS,key)&&all.indexOf(key)===i) as ReportColumn[]|undefined;
 return valid?.length?valid:reportDefaults(type);
};
export interface ReportGeneration {instant:string;timeZone:string;localDate:string;displayTimestamp:string}
export function reportGeneration(instant=new Date().toISOString(),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone):ReportGeneration {
 const date=new Date(instant);if(!Number.isFinite(date.valueOf()))throw Error('A valid report generation timestamp is required.');
 const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const part=(type:string)=>parts.find(p=>p.type===type)!.value;
 return {instant:date.toISOString(),timeZone,localDate:`${part('year')}-${part('month')}-${part('day')}`,displayTimestamp:new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date).replace(/, (?=\d{1,2}:)/,' - ')};
}
