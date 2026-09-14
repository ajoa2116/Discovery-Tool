/** Public documentation hints, never a login queue or a credential-store record. */
export interface FactoryCredentialHint {
 id:string;manufacturer:string;models?:string[];username?:string;
 passwordState:'VALUE'|'BLANK'|'INITIAL_SETUP'|'UNKNOWN';passwordValue?:string;
 notes:string;confidence:'MODEL_SPECIFIC'|'MANUFACTURER'|'LOW';source:{title:string;url:string;reviewed:string};
}
const hanwhaSource={title:'Hanwha camera initial credentials',url:'https://support.hanwhavisionamerica.com/hc/en-us/articles/5778082095515-What-is-the-username-and-password-for-Hanwha-Vision-Wisenet-cameras',reviewed:'2026-09-13'};
export const FACTORY_CREDENTIAL_HINTS:readonly FactoryCredentialHint[]=[
 {id:'hanwha-qnd7082r',manufacturer:'Hanwha Vision',models:['QND-7082R'],username:'admin',passwordState:'INITIAL_SETUP',notes:'Initial administrator password creation is required. Confirmed on the field QND-7082R; no factory password is suggested.',confidence:'MODEL_SPECIFIC',source:hanwhaSource},
 {id:'hanwha-current',manufacturer:'Hanwha Vision',username:'admin',passwordState:'INITIAL_SETUP',notes:'Current Hanwha/Wisenet cameras normally require an initial administrator password. Legacy products and firmware may differ; consult the model manual.',confidence:'MANUFACTURER',source:hanwhaSource},
 {id:'axis-2120-legacy',manufacturer:'Axis',models:['2120','AXIS 2120'],username:'root',passwordState:'VALUE',passwordValue:'pass',notes:'Documented legacy AXIS 2120 factory default. Applies to that original model/era; changed credentials and other firmware may differ.',confidence:'MODEL_SPECIFIC',source:{title:'AXIS 2120 user manual',url:'https://www.axis.com/dam/public/c3/3a/f3/axis-2120-users-manual-en-US-30349.pdf',reviewed:'2026-09-13'}},
 {id:'axis-current',manufacturer:'Axis',username:'root',passwordState:'INITIAL_SETUP',notes:'Modern Axis initial setup generally requires choosing a password. Some firmware allows a different administrator name; consult the model manual.',confidence:'MANUFACTURER',source:{title:'Axis device initial setup',url:'https://developer.axis.com/acap/3/get-started/set-up-the-device/',reviewed:'2026-09-13'}},
];
export function factoryCredentialHint(manufacturer='',model=''):FactoryCredentialHint|null {
 const normalized=model.trim().toUpperCase();
 const vendor=/hanwha|wisenet|samsung techwin/i.test(manufacturer)?'Hanwha Vision':/\baxis\b/i.test(manufacturer)?'Axis':null;
 const identityUnknown=!manufacturer.trim()||/unknown|unresolved|generic/i.test(manufacturer);
 const exact=FACTORY_CREDENTIAL_HINTS.find(h=>(h.manufacturer===vendor||identityUnknown)&&h.models?.some(m=>m.toUpperCase()===normalized));if(exact)return exact;
 return FACTORY_CREDENTIAL_HINTS.find(h=>!h.models&&h.manufacturer===vendor)||null;
}
