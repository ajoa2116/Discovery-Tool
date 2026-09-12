import { AdvancedScanPlan, AdvancedScanRequest } from '../shared/advanced_scan.ts';
import { isAdapterCollection, isAdvancedPlan, isRecord } from '../shared/advanced_scan_contract.ts';
import { WindowsAdapterSnapshot } from '../types/index.ts';

type Fetcher = typeof fetch;
const reference = (body: unknown) => isRecord(body) && isRecord(body.presentation) && typeof body.presentation.reference === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(body.presentation.reference) ? ` Reference: ${body.presentation.reference}.` : '';
export async function loadAdvancedAdapters(fetcher: Fetcher = fetch, signal?: AbortSignal): Promise<{ok:boolean;adapters:WindowsAdapterSnapshot[];message:string}> {
  try {
    const response = await fetcher('http://localhost:3001/api/discovery/advanced/adapters', { signal });
    const body: unknown = await response.json();
    if (!response.ok || !isAdapterCollection(body)) return {ok:false,adapters:[],message:'Unable to load network adapters. Retry or check Diagnostics/Support.' + reference(body)};
    return {ok:true,adapters:body,message:body.length ? '' : 'No network adapters were returned. Reload Adapters to try again.'};
  } catch { return {ok:false,adapters:[],message:'Unable to load network adapters. Retry or check Diagnostics/Support.'}; }
}
export async function validateAdvancedRequest(request: AdvancedScanRequest, fetcher: Fetcher = fetch, signal?: AbortSignal): Promise<{plan:AdvancedScanPlan|null;message:string}> {
  try {
    const response = await fetcher('http://localhost:3001/api/discovery/advanced/validate', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal});
    const body:unknown = await response.json();
    if (isAdvancedPlan(body) && (response.ok || response.status === 400 && !body.valid)) return {plan:body,message:body.errors.join(' ')};
    if (response.status === 400 && isRecord(body) && body.kind === 'INVALID_FORM' && Array.isArray(body.errors) && body.errors.every(error => typeof error === 'string')) return {plan:null,message:body.errors.slice(0,10).join(' ')};
    return {plan:null,message:'Validation is unavailable. Retry or check Diagnostics/Support.' + reference(body)};
  } catch { return {plan:null,message:'Validation is unavailable. Retry or check Diagnostics/Support.'}; }
}
