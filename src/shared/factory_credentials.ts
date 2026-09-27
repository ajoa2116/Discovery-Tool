/** Public documentation hints, never a login queue or a credential-store record. */
export interface FactoryCredentialHint {
 id:string;manufacturer:string;models?:string[];username?:string;
 passwordState:'VALUE'|'BLANK'|'INITIAL_SETUP'|'UNKNOWN';passwordValue?:string;
 notes:string;confidence:'MODEL_SPECIFIC'|'FAMILY'|'MANUFACTURER'|'LOW';scope?:'Model-specific'|'Product-family-specific'|'Manufacturer common'|'Legacy models'|'Generic legacy camera';firmwareMax?:string;source:{title:string;url?:string;reviewed:string};
}
const hanwhaSource={title:'Hanwha camera initial credentials',url:'https://support.hanwhavisionamerica.com/hc/en-us/articles/5778082095515-What-is-the-username-and-password-for-Hanwha-Vision-Wisenet-cameras',reviewed:'2026-09-13'};
export const FACTORY_CREDENTIAL_HINTS:readonly FactoryCredentialHint[]=[
 {id:'hanwha-qnd7082r',manufacturer:'Hanwha Vision',models:['QND-7082R'],username:'admin',passwordState:'INITIAL_SETUP',notes:'Initial administrator password creation is required. Confirmed on the field QND-7082R; no factory password is suggested.',confidence:'MODEL_SPECIFIC',source:hanwhaSource},
 {id:'hanwha-current',manufacturer:'Hanwha Vision',username:'admin',passwordState:'INITIAL_SETUP',notes:'Current Hanwha/Wisenet cameras normally require an initial administrator password. Legacy products and firmware may differ; consult the model manual.',confidence:'MANUFACTURER',source:hanwhaSource},
 {id:'axis-2120-legacy',manufacturer:'Axis',models:['2120','AXIS 2120'],username:'root',passwordState:'VALUE',passwordValue:'pass',notes:'Documented legacy AXIS 2120 factory default. Applies to that original model/era; changed credentials and other firmware may differ.',confidence:'MODEL_SPECIFIC',source:{title:'AXIS 2120 user manual',url:'https://www.axis.com/dam/public/c3/3a/f3/axis-2120-users-manual-en-US-30349.pdf',reviewed:'2026-09-13'}},
 {id:'axis-current',manufacturer:'Axis',username:'root',passwordState:'INITIAL_SETUP',notes:'Modern Axis initial setup generally requires choosing a password. Some firmware allows a different administrator name; consult the model manual.',confidence:'MANUFACTURER',source:{title:'Axis device initial setup',url:'https://developer.axis.com/acap/3/get-started/set-up-the-device/',reviewed:'2026-09-13'}},
 {id:'hikvision-activation',manufacturer:'Hikvision',username:'admin',passwordState:'INITIAL_SETUP',notes:'Activation-based cameras require a technician-created password. Older firmware may differ; check the model and firmware documentation.',confidence:'MANUFACTURER',source:{title:'Hikvision camera activation documentation',url:'https://legacy.hikvision.com/sites/default/files/how-to/pnpcameraactivationfrompnpnvrfna01272017.pdf',reviewed:'2026-09-27'}},
 {id:'hikvision-legacy-generation',manufacturer:'Hikvision',firmwareMax:'5.2.0',username:'admin',passwordState:'VALUE',passwordValue:'12345',scope:'Product-family-specific',notes:'Legacy firmware generation 5.2.0 and earlier only. Not applicable to activation-based firmware or a changed password.',confidence:'FAMILY',source:{title:'Hikvision support: cameras on firmware 5.2.0 and earlier',url:'https://supportusa.hikvision.com/support/solutions/articles/17000129931-i-have-a-older-hikvision-camera-on-firmware-5-2-0-after-defaulting-the-cameras-i-can-t-seem-to-be-a',reviewed:'2026-09-27'}},
 {id:'dahua-initialization',manufacturer:'Dahua',username:'admin',passwordState:'INITIAL_SETUP',notes:'Initialization-based camera firmware requires creating an administrator password. Confirm the model/firmware; older products may differ.',confidence:'MANUFACTURER',source:{title:'Dahua device initialization documentation',url:'https://www.dahuasecurity.com/about-dahua/news-events/notice/initialization-and-password-reset-for-networking-cameras-v1',reviewed:'2026-09-27'}},
 {id:'uniview-username',manufacturer:'Uniview',username:'admin',passwordState:'UNKNOWN',notes:'Username guidance only. Model and firmware password requirements are not established; consult the camera manual or technician records.',confidence:'MANUFACTURER',source:{title:'Uniview support login guidance; no model-specific password established',reviewed:'2026-09-27'}},
];
export function normalizeCredentialManufacturer(value=''):string|null {
 return /hanwha|wisenet|samsung techwin/i.test(value)?'Hanwha Vision':/\baxis\b/i.test(value)?'Axis':/\bhikvision\b/i.test(value)?'Hikvision':/\bdahua\b/i.test(value)?'Dahua':/\b(uniview|unv)\b/i.test(value)?'Uniview':null;
}
const normalizeModel=(value:string)=>value.trim().toUpperCase().replace(/^(?:AXIS|HANWHA(?: VISION)?|WISENET|SAMSUNG TECHWIN)\s+/,'').replace(/[\s_]+/g,'').replace(/[–—]/g,'-');
const firmwareNumber=(value:string)=>{const match=/^v?(\d+)\.(\d+)\.(\d+)(?:\b|_)/i.exec(value.trim());return match?Number(match[1])*1000000+Number(match[2])*1000+Number(match[3]):null;};
/** Pure local catalog lookup. Never receives saved credentials or performs I/O. */
export function factoryCredentialGuidance(manufacturer='',model='',firmware=''):FactoryCredentialHint[] {
 const vendor=normalizeCredentialManufacturer(manufacturer),unknown=!manufacturer.trim()||/^(unknown|unresolved|generic)(?: manufacturer| camera)?$/i.test(manufacturer.trim());
 const exact=FACTORY_CREDENTIAL_HINTS.filter(h=>h.models?.some(m=>normalizeModel(m)===normalizeModel(model)));
 if(exact.length)return exact.filter(h=>unknown||h.manufacturer===vendor);
 const version=firmwareNumber(firmware);
 const family=FACTORY_CREDENTIAL_HINTS.filter(h=>h.manufacturer===vendor&&h.firmwareMax&&version!==null&&version<=firmwareNumber(h.firmwareMax)!);
 if(family.length)return family;
 const common=FACTORY_CREDENTIAL_HINTS.filter(h=>h.manufacturer===vendor&&!h.models&&!h.firmwareMax);
 if(common.length)return common;
 if(!unknown)return [];
 // Two documented historical examples, explicitly not evidence identifying this camera.
 return ['axis-2120-legacy','hikvision-legacy-generation'].map(id=>{const hint=FACTORY_CREDENTIAL_HINTS.find(h=>h.id===id)!;return {...hint,id:'generic-'+id,scope:'Generic legacy camera' as const,confidence:'LOW' as const,notes:'Historical reference only, not evidence about this camera. '+hint.notes};});
}
/** Compatibility accessor excludes generic references, which are not device-specific hints. */
export function factoryCredentialHint(manufacturer='',model=''):FactoryCredentialHint|null {
 return factoryCredentialGuidance(manufacturer,model).find(h=>h.scope!=='Generic legacy camera')||null;
}
