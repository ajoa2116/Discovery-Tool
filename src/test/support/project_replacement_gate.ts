import { isDeepStrictEqual } from 'node:util';
import type { SiteProjectDatabase, ProjectValidationError } from '../../core/storage/project_db.ts';
import { ProjectOpenAdmissionCoordinatorPrototype as Coordinator,
  type OpenAdmissionInput, type OpenAttemptIdentity, type OpenAdmissionDisposition } from '../../core/projects/project_open_admission_coordinator_prototype.ts';
import { activateProjectImportOnce } from './project_open_import_adapter.ts';
import type { IsolatedReplacementPermissions } from './project_replacement_permissions.ts';

export type ReplacementResult =
  | {readonly status:'COMMITTED';readonly projectId:string;readonly generation:string;readonly mode:'PROJECT'|'QUICK_WORK'}
  | {readonly status:'BLOCKED';readonly reason:'OPEN_PENDING'|'ACTIVATION_UNRESOLVED'|'REPLACEMENT_ACTIVE'|'AUTHORITY_RETIRED'}
  | {readonly status:'REJECTED_BEFORE_ACTIVATION';readonly reason:'STALE_GENERATION'|'VALIDATION_REJECTED'}
  | {readonly status:'UNKNOWN';readonly reason:'ACTIVATION_UNCERTAIN'};
type Operation =
  | {kind:'QUICK_WORK'}
  | {kind:'NEW';name:string;location:string;description:string}
  | {kind:'FROM_CURRENT';name:string;description:string}
  | {kind:'IMPORT';input:Readonly<OpenAdmissionInput>};

const assignedStores=new WeakSet<SiteProjectDatabase>();

/**
 * Isolated test-only facade: one coordinator/authority per supplied store.
 * Without optional permissions, enforcement is facade-only. Matching constructor
 * hooks can additionally protect fresh ISOLATED_TEST stores. Production stores
 * do not enable the hook; production-wide exclusion remains unproven.
 * Retirement revokes commits permanently; it is not process retirement or rollback.
 * No reset/unlock, persistence or independent work queue.
 * UNKNOWN activation latches this facade closed; status/settlement cannot erase it.
 */
export class ProjectReplacementGateProof {
  readonly #store:SiteProjectDatabase;
  readonly #validationError:typeof ProjectValidationError;
  readonly #coordinator:Coordinator;
  readonly #permissions?:IsolatedReplacementPermissions;
  readonly #permit=Symbol('private synchronous Open commit permission');
  readonly #pending=new Set<Promise<Readonly<OpenAdmissionDisposition>>>();
  #executing=false;
  #unresolved=false;
  #retired=false;

  constructor(store:SiteProjectDatabase,validationError:typeof ProjectValidationError,options:{
    epoch:string;capacity?:number;permissions?:IsolatedReplacementPermissions;
    /** Controlled preparation barrier, before entry to the synchronous mutation body. */
    beforeOpenActivation?:(input:Readonly<OpenAdmissionInput>)=>Promise<void>;
  }){
    if(assignedStores.has(store))throw Error('A proof authority already owns this store.');
    this.#store=store;this.#validationError=validationError;this.#permissions=options.permissions;
    this.#coordinator=new Coordinator({epoch:options.epoch,capacity:options.capacity??16,
      currentGeneration:()=>this.generation(),
      activate:async input=>{
        if(options.beforeOpenActivation)await options.beforeOpenActivation(input);
        const result=this.#commit({kind:'IMPORT',input},input.originatingGeneration,this.#permit);
        if(result.status==='COMMITTED')return {status:'ADMITTED',projectId:result.projectId,activatedGeneration:result.generation};
        if(result.status==='REJECTED_BEFORE_ACTIVATION'&&result.reason==='VALIDATION_REJECTED')
          return {status:'REJECTED_BEFORE_ACTIVATION',reason:'VALIDATION_REJECTED'};
        throw Error('Replacement outcome unavailable.');
      }});
    this.#permissions?.bindStore(store,()=>!this.#retired&&this.#executing&&!this.#unresolved);
    assignedStores.add(store);
  }

  generation():string{return this.#store.getMetadataWriteContext().generation;}
  state(){return Object.freeze({pendingOpen:this.#pending.size,unresolved:this.#unresolved,executing:this.#executing});}
  /** Synchronous revocation precedes any caller cleanup. Never waits on held work. */
  retire(){this.#retired=true;return this.retirementState();}
  retirementState(){return Object.freeze({retired:this.#retired,
    drain:this.#pending.size||this.#executing?'UNRESOLVED' as const:'COMPLETE' as const,
    pendingContinuations:this.#pending.size,unresolvedActivation:this.#unresolved});}
  status(identity:OpenAttemptIdentity){return this.#coordinator.status(identity);}
  settle(identity:OpenAttemptIdentity){return this.#track(this.#coordinator.settle(identity));}

  importProjectJson(input:OpenAdmissionInput):Promise<Readonly<OpenAdmissionDisposition>>{
    // Read existing dispositions after retirement, but never reserve new admissions.
    if(this.#retired)return Promise.resolve(this.#coordinator.status(input));
    const completion=this.#coordinator.admit(input);
    return this.#track(completion);
  }
  #track(completion:Promise<Readonly<OpenAdmissionDisposition>>){
    // Track promises, not just IDs: an immediate conflicting replay must not release
    // the reservation of the original, still-pending admission.
    this.#pending.add(completion);
    void completion.then(result=>{
      this.#pending.delete(completion);
      if(result.status==='UNKNOWN'&&result.reason==='ACTIVATION_UNCERTAIN')this.#unresolved=true;
    },()=>{this.#pending.delete(completion);this.#unresolved=true;});
    return completion;
  }
  startQuickWork(expectedGeneration:string):ReplacementResult{
    return this.#commit({kind:'QUICK_WORK'},expectedGeneration);
  }
  createNewProject(expectedGeneration:string,name:string,location='',description=''):ReplacementResult{
    return this.#commit({kind:'NEW',name,location,description},expectedGeneration);
  }
  createProjectFromCurrentResults(expectedGeneration:string,name:string,description=''):ReplacementResult{
    return this.#commit({kind:'FROM_CURRENT',name,description},expectedGeneration);
  }

  #commit(operation:Operation,expectedGeneration:string,permit?:symbol):ReplacementResult{
    if(this.#retired)return {status:'BLOCKED',reason:'AUTHORITY_RETIRED'};
    if(this.#executing)return {status:'BLOCKED',reason:'REPLACEMENT_ACTIVE'};
    if(this.#unresolved)return {status:'BLOCKED',reason:'ACTIVATION_UNRESOLVED'};
    if(this.#pending.size&&permit!==this.#permit)return {status:'BLOCKED',reason:'OPEN_PENDING'};
    this.#executing=true;
    let beforeIdentity:symbol|undefined,beforeSession:ReturnType<SiteProjectDatabase['getSession']>|undefined;
    try{
      beforeIdentity=this.#store.getSessionGeneration();beforeSession=this.#store.getSession();
      if(this.generation()!==expectedGeneration)return {status:'REJECTED_BEFORE_ACTIVATION',reason:'STALE_GENERATION'};
      const method=operation.kind==='QUICK_WORK'?'startQuickWork':operation.kind==='NEW'?'createNewProject'
        :operation.kind==='FROM_CURRENT'?'createProjectFromCurrentResults':'importProjectJson';
      const args=operation.kind==='QUICK_WORK'?[]:operation.kind==='NEW'?[operation.name,operation.location,operation.description]
        :operation.kind==='FROM_CURRENT'?[operation.name,operation.description]:[operation.input.payload];
      // No await, deferred callback or arbitrary mutation closure in this body.
      const replace=(permission?:unknown):string|undefined=>{
        switch(operation.kind){
          case 'QUICK_WORK':return this.#store.startQuickWork(permission).id;
          case 'NEW':return this.#store.createNewProject(operation.name,operation.location,operation.description,permission).id;
          case 'FROM_CURRENT':return this.#store.createProjectFromCurrentResults(operation.name,operation.description,permission).id;
          case 'IMPORT':{
            const result=activateProjectImportOnce(this.#store,operation.input,this.#validationError,permission);
            return result.status==='REJECTED_BEFORE_ACTIVATION'?undefined:result.projectId;
          }
        }
      };
      const id=this.#permissions?this.#permissions.withPermission(this.#store,beforeIdentity,method,args,replace):replace();
      if(id===undefined)return {status:'REJECTED_BEFORE_ACTIVATION',reason:'VALIDATION_REJECTED'};
      const after=this.#store.getSession(),context=this.#store.getMetadataWriteContext();
      if(this.#store.getSessionGeneration()===beforeIdentity||context.generation===expectedGeneration
        ||after.project.id!==id||context.projectId!==id
        ||after.mode!==(operation.kind==='QUICK_WORK'?'QUICK_WORK':'PROJECT')||context.mode!==after.mode)
        throw Error('Replacement identity unavailable.');
      return {status:'COMMITTED',projectId:id,generation:context.generation,mode:after.mode};
    }catch(error){
      try{
        if(error instanceof this.#validationError&&beforeIdentity!==undefined&&beforeSession!==undefined
          &&this.#store.getSessionGeneration()===beforeIdentity&&isDeepStrictEqual(this.#store.getSession(),beforeSession))
          return {status:'REJECTED_BEFORE_ACTIVATION',reason:'VALIDATION_REJECTED'};
      }catch{/* An unverifiable state is never proof of rejection. */}
      this.#unresolved=true;return {status:'UNKNOWN',reason:'ACTIVATION_UNCERTAIN'};
    }finally{this.#executing=false;}
  }
}
