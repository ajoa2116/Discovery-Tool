import { canonicalMac } from '../../shared/identity_policy.ts';
import { Device } from '../../types/index.ts';
import { CameraConfigurationOperation, CameraConfigurationProposal } from '../../shared/camera_configuration.ts';
import { createHash, randomBytes } from 'node:crypto';

export type DriverCapabilityState = 'SUPPORTED'|'UNSUPPORTED'|'UNKNOWN'|'REQUIRES_AUTHENTICATION'|'TRANSPORT_UNAVAILABLE';
export type DriverErrorCode = 'AUTHENTICATION_FAILED'|'UNSUPPORTED'|'TIMEOUT'|'REFUSED'|'UNREACHABLE'|'MALFORMED_RESPONSE'|'VENDOR_ERROR'|'TLS_WARNING'|'AMBIGUOUS_IDENTITY'|'CANCELLED';
export interface DriverCapability { operation:CameraConfigurationOperation|'IDENTITY'|'NETWORK'; state:DriverCapabilityState; detail:string }
export interface DriverIdentity { manufacturer?:string; model?:string; serial?:string; firmware?:string; macAddress?:string; hostname?:string }
export interface DriverValues { deviceName?:string; ntp?:{fromDhcp:boolean;servers:string[]}; timeZone?:string; onvifEnabled?:boolean }
export interface DriverEvidence { source:'ONVIF_MANUFACTURER'|'ONVIF_SCOPE'|'MAC_OUI'|'MODEL_METADATA'|'VENDOR_RESPONSE'; value:string; confidence:'HIGH'|'MEDIUM' }
export interface DriverSelection { driver:CameraVendorDriver|null; provider:string; evidence:DriverEvidence[]; confidence:'VERIFIED'|'POSITIVE'|'UNKNOWN' }
export interface DriverHttpRequest { url:URL; method:'GET'|'PUT'|'POST'; headers?:Record<string,string>; body?:string; credential:{username:string;password:string}; signal?:AbortSignal; timeoutMs:number }
export interface DriverHttpResponse { status:number; headers?:Record<string,string>; body:string }
export interface DriverHttpTransport { request(request:DriverHttpRequest):Promise<DriverHttpResponse> }

export class CameraDriverError extends Error { constructor(message:string,public readonly code:DriverErrorCode,public readonly diagnostic?:string){super(message)} }

export class BoundedFetchTransport implements DriverHttpTransport {
  async request(request:DriverHttpRequest):Promise<DriverHttpResponse>{
    const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(()=>controller.abort(),request.timeoutMs);
    request.signal?.addEventListener('abort',abort,{once:true});
    try{
      let response=await fetch(request.url,{method:request.method,headers:request.headers,body:request.body,signal:controller.signal});
      const challenge=response.headers.get('www-authenticate');
      if(response.status===401&&challenge?.toLowerCase().startsWith('digest ')){
        const params=new Map([...challenge.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)].map(x=>[x[1].toLowerCase(),x[2]||x[3]]));
        const realm=params.get('realm'),nonce=params.get('nonce');if(!realm||!nonce)return{status:401,headers:Object.fromEntries(response.headers.entries()),body:await response.text()};
        const algorithm=(params.get('algorithm')||'MD5').toUpperCase();if(algorithm!=='MD5')throw new CameraDriverError(`Unsupported Digest algorithm ${algorithm}.`,'UNSUPPORTED');
        const qop=(params.get('qop')||'auth').split(',').map(x=>x.trim()).find(x=>x==='auth'),nc='00000001',cnonce=randomBytes(8).toString('hex'),uri=request.url.pathname+request.url.search,md5=(v:string)=>createHash('md5').update(v).digest('hex');
        const ha1=md5(`${request.credential.username}:${realm}:${request.credential.password}`),ha2=md5(`${request.method}:${uri}`),digest=qop?md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`):md5(`${ha1}:${nonce}:${ha2}`);
        const safeUsername=request.credential.username.replace(/["\\]/g,'');
        const auth=`Digest username="${safeUsername}",realm="${realm}",nonce="${nonce}",uri="${uri}",response="${digest}",algorithm=MD5${qop?`,qop=${qop},nc=${nc},cnonce="${cnonce}"`:''}${params.get('opaque')?`,opaque="${params.get('opaque')}"`:''}`;
        response=await fetch(request.url,{method:request.method,headers:{...request.headers,Authorization:auth},body:request.body,signal:controller.signal});
      }else if(response.status===401&&challenge?.toLowerCase().startsWith('basic ')){
        const auth=`Basic ${Buffer.from(`${request.credential.username}:${request.credential.password}`).toString('base64')}`;
        response=await fetch(request.url,{method:request.method,headers:{...request.headers,Authorization:auth},body:request.body,signal:controller.signal});
      }
      return{status:response.status,headers:Object.fromEntries(response.headers.entries()),body:await response.text()};
    }catch(error){
      if(error instanceof CameraDriverError)throw error;
      if((error as Error).name==='AbortError')throw new CameraDriverError(request.signal?.aborted?'Vendor request cancelled.':'Vendor request timed out.',request.signal?.aborted?'CANCELLED':'TIMEOUT');
      const message=(error as Error).message;
      if(/certificate|self signed|tls/i.test(message))throw new CameraDriverError('The camera TLS certificate is not trusted.','TLS_WARNING');
      if(/refused/i.test(message))throw new CameraDriverError('The camera refused the connection.','REFUSED');
      throw new CameraDriverError('The vendor service could not be reached.','UNREACHABLE');
    }finally{clearTimeout(timer);request.signal?.removeEventListener('abort',abort)}
  }
}

export interface CameraVendorDriver {
  readonly id:'HIKVISION_ISAPI'|'DAHUA_CGI'|'HANWHA_SUNAPI'|'AXIS_VAPIX';
  readonly label:string;
  readonly vendorTokens:string[];
  capabilities():DriverCapability[];
  inspect(device:Device,credential:{username:string;password:string},signal?:AbortSignal):Promise<{identity:DriverIdentity;values:DriverValues}>;
  apply(device:Device,credential:{username:string;password:string},operation:CameraConfigurationOperation,proposal:CameraConfigurationProposal,signal?:AbortSignal):Promise<void>;
  verify(device:Device,credential:{username:string;password:string},operation:CameraConfigurationOperation,proposal:CameraConfigurationProposal,signal?:AbortSignal):Promise<boolean>;
}

const clean=(value?:string)=>value?.trim()||undefined;
export const xmlText=(xml:string,name:string)=>clean(xml.match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([^<]*)<\\/(?:\\w+:)?${name}>`,'i'))?.[1]);
export const queryMap=(body:string)=>new Map(body.split(/\r?\n|&/).map(line=>line.trim()).filter(Boolean).map(line=>{const i=line.indexOf('=');return i<0?[line,'']:[line.slice(0,i),decodeURIComponent(line.slice(i+1))]}));
export const escapeXml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function normalizeMac(value?:string){return canonicalMac(value)||undefined}
export async function boundedReverify(signal:AbortSignal|undefined,probe:()=>Promise<unknown>,attempts=6,delayMs=750){for(let i=0;i<attempts;i++){if(signal?.aborted)throw new CameraDriverError('Vendor verification cancelled.','CANCELLED');await new Promise(resolve=>setTimeout(resolve,delayMs));try{await probe();return true}catch{}}return false}

export abstract class HttpCameraVendorDriver implements CameraVendorDriver {
  abstract readonly id:CameraVendorDriver['id']; abstract readonly label:string; abstract readonly vendorTokens:string[];
  constructor(protected readonly transport:DriverHttpTransport=new BoundedFetchTransport(),protected readonly timeoutMs=7000){}
  abstract capabilities():DriverCapability[];
  abstract inspect(device:Device,credential:{username:string;password:string},signal?:AbortSignal):Promise<{identity:DriverIdentity;values:DriverValues}>;
  abstract apply(device:Device,credential:{username:string;password:string},operation:CameraConfigurationOperation,proposal:CameraConfigurationProposal,signal?:AbortSignal):Promise<void>;
  abstract verify(device:Device,credential:{username:string;password:string},operation:CameraConfigurationOperation,proposal:CameraConfigurationProposal,signal?:AbortSignal):Promise<boolean>;
  protected url(device:Device,path:string){const scheme=device.network.xAddr?.startsWith('https:')?'https':'http',port=device.network.port||(scheme==='https'?443:80);return new URL(path,`${scheme}://${device.network.ipAddress}:${port}`)}
  protected async request(device:Device,credential:{username:string;password:string},path:string,method:'GET'|'PUT'|'POST'='GET',body?:string,signal?:AbortSignal,headers:Record<string,string>={}){
    const response=await this.transport.request({url:this.url(device,path),method,body,signal,timeoutMs:this.timeoutMs,credential,headers});
    if(response.status===401||response.status===403)throw new CameraDriverError('Camera authentication failed.','AUTHENTICATION_FAILED');
    if(response.status===404||response.status===405||response.status===501)throw new CameraDriverError('The vendor endpoint does not support this operation.','UNSUPPORTED');
    if(response.status<200||response.status>=300)throw new CameraDriverError(`Vendor request failed with HTTP ${response.status}.`,'VENDOR_ERROR',response.body.slice(0,300));
    return response.body;
  }
}

export class CameraDriverResolver {
  constructor(private readonly drivers:CameraVendorDriver[]){}
  resolve(device:Device):DriverSelection{
    const evidence:DriverEvidence[]=[];const candidates=new Set<CameraVendorDriver>();
    const fields=[device.anchor.vendor,device.anchor.model,...(device.network.xAddrs||[]),device.network.xAddr].filter(Boolean).join(' ').toLowerCase();
    for(const driver of this.drivers)if(driver.vendorTokens.some(token=>fields.includes(token.toLowerCase()))){candidates.add(driver);evidence.push({source:device.anchor.vendor&&driver.vendorTokens.some(t=>device.anchor.vendor.toLowerCase().includes(t.toLowerCase()))?'ONVIF_MANUFACTURER':'ONVIF_SCOPE',value:driver.label,confidence:'HIGH'})}
    if(candidates.size>1)return{driver:null,provider:'Unsupported / ambiguous vendor',evidence,confidence:'UNKNOWN'};
    const driver=[...candidates][0];return driver?{driver,provider:driver.label,evidence,confidence:'POSITIVE'}:{driver:null,provider:'Unsupported / unknown vendor',evidence:[],confidence:'UNKNOWN'};
  }
  confirm(device:Device,driver:CameraVendorDriver,identity:DriverIdentity):DriverSelection{const value=identity.manufacturer||driver.label;if(!driver.vendorTokens.some(t=>value.toLowerCase().includes(t.toLowerCase())))throw new CameraDriverError('Vendor response conflicts with the selected driver.','AMBIGUOUS_IDENTITY');return{driver,provider:driver.label,evidence:[{source:'VENDOR_RESPONSE',value,confidence:'HIGH'}],confidence:'VERIFIED'}}
}
