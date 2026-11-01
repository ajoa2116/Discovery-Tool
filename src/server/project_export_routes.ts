import type { Express, Response } from 'express';
import type { ProjectReplacementAuthority } from '../core/projects/project_replacement_authority.ts';
import { ProjectReplacementAuthorityError } from '../core/projects/project_replacement_authority.ts';
import { ProjectValidationError } from '../core/storage/project_db.ts';
import { MetadataWriteConflictError } from '../shared/metadata_write_context.ts';

/** Existing routes only. Host validation and genuine authentication must precede
 * registration. Context binds project identity; it never confers authentication.
 */
export function registerProjectExportRoutes(app:Express,authority:ProjectReplacementAuthority,broadcast:(event:any)=>void){
  const fail=(res:Response,error:unknown,completed=false)=>{
    const blocked=!completed&&(error instanceof MetadataWriteConflictError||error instanceof ProjectReplacementAuthorityError&&error.disposition!=='UNKNOWN');
    res.status(blocked?409:!completed&&error instanceof ProjectValidationError?400:500).json({error:blocked
      ?'Project export was not authorized for the displayed project session.'
      :!completed&&error instanceof ProjectValidationError?error.message:'Project export outcome unavailable. Verify the file before trying again.'});
  };
  app.post('/api/project/save-content',(req,res)=>{
    let completed=false;
    try{const result=authority.exportForSave(req.body?.metadataWriteContext);
      completed=true;
      broadcast({type:'PROJECT_SAVED',data:{session:result.session}});res.json({filename:result.filename,content:result.content});
    }catch(error){fail(res,error,completed);}
  });
  app.post('/api/project/save',async(req,res)=>{
    let completed=false;
    try{const result=await authority.saveFile(req.body?.metadataWriteContext,req.body?.filePath||undefined);
      completed=true;
      broadcast({type:'PROJECT_SAVED',data:{session:result.session}});res.json(result);
    }catch(error){fail(res,error,completed);}
  });
  app.get('/api/project/export',(req,res)=>{
    let completed=false;
    try{const raw=req.headers['x-project-context'];let context:unknown;
      if(typeof raw==='string'&&raw.length<=2048){try{context=JSON.parse(raw);}catch{/* Missing/invalid context fails closed. */}}
      const content=authority.exportJson(context);
      completed=true;
      res.setHeader('Content-Type','application/json');res.setHeader('Content-Disposition','attachment; filename=cctv_site_export.cctvproj');res.send(content);
    }catch(error){fail(res,error,completed);}
  });
}
