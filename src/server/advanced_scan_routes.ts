import { Router } from 'express';
import { AdvancedScanService } from '../core/engine/advanced_scan.ts';
import { AdvancedScanRequest } from '../shared/advanced_scan.ts';
import { advancedRequestErrors, isAdapterCollection } from '../shared/advanced_scan_contract.ts';
import { NetworkConfigurationError } from '../core/network/windows_adapter_service.ts';
import { appStateDb } from '../core/storage/app_db.ts';

export function createAdvancedScanRouter(service: Pick<AdvancedScanService,'listAdapters'|'validate'>, fail: (res:any,error:unknown,status:number,operation:string)=>unknown) {
  const router=Router();
  router.get('/adapters',async(_req,res)=>{
    try { const adapters=await service.listAdapters(); if(!isAdapterCollection(adapters))throw new NetworkConfigurationError('Adapter enumeration returned an invalid collection.','ADAPTER_ENUMERATION_MALFORMED_OUTPUT');res.json(adapters); }
    catch(error){fail(res,error,500,'ADVANCED_SCAN_ADAPTERS')}
  });
  router.post('/validate',async(req,res)=>{
    const errors=advancedRequestErrors(req.body);
    if(errors.length){res.status(400).json({kind:'INVALID_FORM',errors});return}
    try {
      const plan=await service.validate(req.body as AdvancedScanRequest);
      if(!plan.valid)appStateDb.logAudit({id:crypto.randomUUID(),timestamp:new Date().toISOString(),category:'DISCOVERY',level:'INFO',message:'Advanced Scan configuration needs correction.',details:{operation:'ADVANCED_SCAN_VALIDATE',classification:'INVALID_FORM',errors:plan.errors.slice(0,10)}});
      res.status(plan.valid?200:400).json({...plan,kind:plan.valid?'VALID_FORM':'INVALID_FORM'});
    } catch(error){fail(res,error,500,'ADVANCED_SCAN_VALIDATE')}
  });
  return router;
}
