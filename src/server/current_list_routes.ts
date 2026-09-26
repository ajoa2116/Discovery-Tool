import {Router} from 'express';
import {SiteProjectDatabase} from '../core/storage/project_db.ts';
/** Presentation intent only. The caller may request the existing normal Scan separately. */
export function createCurrentListRouter(db:SiteProjectDatabase,changed:()=>void){
 const router=Router();
 router.get('/suppression',(_req,res)=>res.json(db.getSuppressionDiagnostics()));
 router.post('/rediscover',(_req,res)=>{db.rediscoverManuallyRemoved();changed();res.json({session:db.getSession(),message:'Manually removed cameras can return after fresh discovery. No saved rows were restored.'});});
 return router;
}
