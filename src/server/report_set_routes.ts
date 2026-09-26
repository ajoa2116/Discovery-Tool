import {Router} from 'express';
import {ReportSet} from '../core/reporting/report_set.ts';
export function createReportSetRouter(set:ReportSet){
 const router=Router();const ids=(value:unknown)=>{if(!Array.isArray(value)||!value.every(id=>typeof id==='string'))throw Error('Select valid report members.');return value as string[]};
 router.get('/',(_req,res)=>res.json(set.snapshot()));
 router.post('/add',(req,res)=>{try{res.json(set.add(ids(req.body.deviceIds)))}catch{res.status(409).json({error:'Report members could not be added. Select current devices with unambiguous established identity.'})}});
 router.post('/remove',(req,res)=>{try{res.json(set.remove({deviceIds:ids(req.body.deviceIds||[]),memberIds:ids(req.body.memberIds||[])}))}catch{res.status(400).json({error:'Select valid report members to remove.'})}});
 router.post('/clear',(req,res)=>{try{res.json(set.clear(req.body.confirmed===true))}catch{res.status(409).json({error:'Confirm Clear Report Set before removing all members.'})}});
 return router;
}
