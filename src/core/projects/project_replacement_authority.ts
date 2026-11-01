import { isDeepStrictEqual } from 'node:util';
import type { SiteProjectDatabase, ProjectValidationError, ProjectReplacementOperation, IsolatedProjectReplacementCheck } from '../storage/project_db.ts';
import type { SiteProject, ProjectSession } from '../../types/index.ts';
export type ProjectExportOperation='exportProjectJson'|'exportProjectJsonForSave'|'saveProject';

export class ProjectReplacementAuthorityError extends Error {
  constructor(readonly disposition:'BLOCKED'|'REJECTED_BEFORE_ACTIVATION'|'UNKNOWN',readonly code:string){
    super(disposition==='UNKNOWN'?'Project replacement outcome unavailable. The current project could not be confirmed.'
      :'Project replacement permission unavailable.');
  }
}
export interface ProjectReplacementAuthority {
  startQuickWork(expectedGeneration?:symbol):SiteProject;
  createNewProject(name:string,location?:string,description?:string,expectedGeneration?:symbol):SiteProject;
  createProjectFromCurrentResults(name:string,description?:string,expectedGeneration?:symbol):SiteProject;
  importProjectJson(json:string,expectedGeneration?:symbol):SiteProject;
  exportJson(context:unknown):string;
  exportForSave(context:unknown):{content:string;filename:string;session:ProjectSession};
  saveFile(context:unknown,filePath?:string):Promise<{filePath:string;session:ProjectSession}>;
  retire():Readonly<{retired:boolean;drain:'UNRESOLVED'|'COMPLETE';pendingContinuations:number;unresolvedActivation:boolean}>;
  state():ReturnType<ProjectReplacementAuthority['retire']>;
}

/** Trusted store construction only. No authentication, ownership transfer, retained
 * admission payloads, rollback, process fencing or restart guarantee. This reuses
 * the isolated gate's synchronous commit and conservative UNKNOWN contracts.
 * The grant issuer never leaves this closure. Only a protected store retains it.
 */
export function createProjectReplacementProtection(store:SiteProjectDatabase,validationError:typeof ProjectValidationError,
  importCommit:(json:string,permission:unknown,filePath?:string)=>SiteProject){
  const grants=new WeakMap<object,{operation:ProjectReplacementOperation|ProjectExportOperation;args:readonly unknown[];generation:symbol;active:boolean;used:boolean}>();
  const pending=new Set<Promise<unknown>>();
  let claimed=false,retired=false,executing=false,uncertain=false,exporting=false;
  let ownerToken:object|undefined;
  const state=()=>Object.freeze({retired,drain:pending.size||executing||exporting?'UNRESOLVED' as const:'COMPLETE' as const,
    pendingContinuations:pending.size,unresolvedActivation:uncertain});
  const check:IsolatedProjectReplacementCheck=(context,permission)=>{
    if(!permission||typeof permission!=='object')return false;
    const grant=grants.get(permission);
    if(!grant||!grant.active||grant.used)return false;
    grant.used=true;
    return claimed&&!retired&&executing&&!uncertain&&context.store===store&&context.generation===grant.generation
      &&context.operation===grant.operation&&context.args.length===grant.args.length
      &&grant.args.every((value,index)=>value===context.args[index]);
  };
  const requireLive=()=>{
    if(!claimed||retired||uncertain)throw new ProjectReplacementAuthorityError('BLOCKED',retired?'AUTHORITY_RETIRED':'AUTHORITY_UNAVAILABLE');
  };
  const checkExport=(operation:ProjectExportOperation,args:readonly unknown[],permission:unknown)=>{
    if(!permission||typeof permission!=='object')return false;
    const grant=grants.get(permission);if(!grant||!grant.active||grant.used)return false;
    grant.used=true;
    return claimed&&!retired&&!uncertain&&exporting&&!executing&&grant.operation===operation
      &&grant.generation===store.getSessionGeneration()&&grant.args.length===args.length&&grant.args.every((v,i)=>v===args[i]);
  };
  function beginExport(context:unknown,operation:ProjectExportOperation,args:readonly unknown[]){
    requireLive();
    if(executing||exporting||pending.size)throw new ProjectReplacementAuthorityError('BLOCKED','REPLACEMENT_PENDING');
    store.requireMetadataWriteContext(context);
    exporting=true;
    const permission=Object.freeze({}),grant={operation,args:[...args],generation:store.getSessionGeneration(),active:true,used:false};
    grants.set(permission,grant);return {permission,release:()=>{grant.active=false;exporting=false;}};
  }
  function replace(operation:ProjectReplacementOperation,args:readonly unknown[],expectedGeneration=store.getSessionGeneration(),filePath?:string,prepared=false):SiteProject{
    requireLive();
    if(executing||exporting||pending.size&&!prepared)throw new ProjectReplacementAuthorityError('BLOCKED','REPLACEMENT_PENDING');
    if(store.getSessionGeneration()!==expectedGeneration)throw new ProjectReplacementAuthorityError('REJECTED_BEFORE_ACTIVATION','STALE_GENERATION');
    executing=true;
    const permission=Object.freeze({}),grant={operation,args:Object.freeze([...args]),generation:expectedGeneration,active:true,used:false};
    grants.set(permission,grant);
    let before:ReturnType<SiteProjectDatabase['getSession']>|undefined;
    try{
      before=store.getSession();
      let project:SiteProject;
      switch(operation){
        case 'startQuickWork':project=store.startQuickWork(permission);break;
        case 'createNewProject':project=store.createNewProject(args[0] as string,args[1] as string,args[2] as string,permission);break;
        case 'createProjectFromCurrentResults':project=store.createProjectFromCurrentResults(args[0] as string,args[1] as string,permission);break;
        case 'importProjectJson':project=importCommit(args[0] as string,permission,filePath);break;
      }
      const after=store.getSession(),context=store.getMetadataWriteContext();
      if(store.getSessionGeneration()===expectedGeneration||after.project.id!==project.id||context.projectId!==project.id
        ||after.mode!==(operation==='startQuickWork'?'QUICK_WORK':'PROJECT')||context.mode!==after.mode)
        throw Error('Replacement identity unavailable.');
      return project;
    }catch(error){
      let unchanged=false;
      try{
        unchanged=error instanceof validationError&&before!==undefined&&store.getSessionGeneration()===expectedGeneration
          &&isDeepStrictEqual(store.getSession(),before);
      }catch{/* An unverifiable view is not proof of pre-activation rejection. */}
      if(unchanged)throw error;
      uncertain=true;
      throw new ProjectReplacementAuthorityError('UNKNOWN','ACTIVATION_UNCERTAIN');
    }finally{grant.active=false;executing=false;}
  }
  const authority:ProjectReplacementAuthority=Object.freeze({
    startQuickWork:(generation?:symbol)=>replace('startQuickWork',[],generation),
    createNewProject:(name:string,location='',description='',generation?:symbol)=>replace('createNewProject',[name,location,description],generation),
    createProjectFromCurrentResults:(name:string,description='',generation?:symbol)=>replace('createProjectFromCurrentResults',[name,description],generation),
    importProjectJson:(json:string,generation?:symbol)=>replace('importProjectJson',[json],generation),
    exportJson:(context:unknown)=>{
      const lease=beginExport(context,'exportProjectJson',[]);
      try{return store.exportProjectJson(lease.permission);}finally{lease.release();}
    },
    exportForSave:(context:unknown)=>{
      const lease=beginExport(context,'exportProjectJsonForSave',[]);
      let before:ProjectSession|undefined;
      try{before=store.getSession();return {content:store.exportProjectJsonForSave(lease.permission),
        filename:`${store.getProject().name.replace(/[^a-z0-9_-]+/gi,'_')}.cctvproj`,session:store.getSession()};}
      catch(error){
        let unchanged=false;try{unchanged=error instanceof validationError&&before!==undefined&&isDeepStrictEqual(before,store.getSession());}catch{}
        if(unchanged)throw error;
        throw new ProjectReplacementAuthorityError('UNKNOWN','EXPORT_OUTCOME_UNAVAILABLE');
      }
      finally{lease.release();}
    },
    saveFile:(context:unknown,filePath?:string)=>{
      const lease=beginExport(context,'saveProject',[filePath]);
      let completion:Promise<{filePath:string;session:ProjectSession}>;
      try{completion=store.saveProject(filePath,lease.permission).then(path=>{
        try{return {filePath:path,session:store.getSession()};}
        catch{throw new ProjectReplacementAuthorityError('UNKNOWN','EXPORT_OUTCOME_UNAVAILABLE');}
      });}
      catch(error){lease.release();throw error;}
      pending.add(completion);
      void completion.then(()=>{pending.delete(completion);lease.release();},()=>{pending.delete(completion);lease.release();});
      return completion;
    },
    retire:()=>{retired=true;return state();},state,
  });
  return Object.freeze({check,checkExport,
    claim(){if(claimed)throw new ProjectReplacementAuthorityError('BLOCKED','STORE_ALREADY_CLAIMED');claimed=true;ownerToken=Object.freeze({});return authority;},
    openProject(filePath:string,read:()=>Promise<string>):Promise<SiteProject>{
      requireLive();
      if(executing||exporting||pending.size)throw new ProjectReplacementAuthorityError('BLOCKED','REPLACEMENT_PENDING');
      const generation=store.getSessionGeneration(),owner=ownerToken;
      // Preparation is outside the synchronous mutation body. Permission is issued
      // only after the read, with the original owner/generation still valid.
      const completion=Promise.resolve().then(()=>{requireLive();return read();}).then(json=>{
        requireLive();
        if(owner!==ownerToken)throw new ProjectReplacementAuthorityError('BLOCKED','OBSOLETE_OWNER');
        return replace('importProjectJson',[json],generation,filePath,true);
      });
      pending.add(completion);
      void completion.then(()=>pending.delete(completion),()=>pending.delete(completion));
      return completion;
    },
  });
}
