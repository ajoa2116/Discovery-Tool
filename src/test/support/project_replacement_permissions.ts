import type { SiteProjectDatabase, ProjectReplacementOperation, IsolatedProjectReplacementCheck } from '../../core/storage/project_db.ts';

/**
 * Trusted test owner only: never export this issuer to an untrusted store caller.
 * Opaque grants expire on synchronous scope exit, bind exact primitive arguments,
 * and are consumed before validation/mutation. No transferable long-lived permit,
 * asynchronous authority, removal/reset API or production activation.
 */
export function isolatedReplacementPermissions(){
  const grants=new WeakMap<object,{store:SiteProjectDatabase;generation:symbol;operation:ProjectReplacementOperation;args:readonly string[];active:boolean;used:boolean}>();
  const activeStores=new WeakSet<SiteProjectDatabase>();
  const policies=new WeakMap<SiteProjectDatabase,()=>boolean>();
  const check:IsolatedProjectReplacementCheck=(context,permission)=>{
    if(!permission||typeof permission!=='object')return false;
    const grant=grants.get(permission);
    if(!grant||!grant.active||grant.used)return false;
    grant.used=true;
    return policies.get(context.store)?.()!==false&&grant.store===context.store&&grant.generation===context.generation&&grant.operation===context.operation
      &&grant.args.length===context.args.length
      &&grant.args.every((value,index)=>typeof context.args[index]==='string'&&value===context.args[index]);
  };
  return Object.freeze({
    check,
    bindStore(store:SiteProjectDatabase,policy:()=>boolean){
      if(activeStores.has(store)||policies.has(store))throw Error('Replacement permission policy already bound or active.');
      policies.set(store,policy);
    },
    withPermission<T>(store:SiteProjectDatabase,generation:symbol,operation:ProjectReplacementOperation,args:readonly string[],run:(permission:unknown)=>T):T{
      if(activeStores.has(store)||policies.get(store)?.()===false)throw Error('Replacement permission scope denied.');
      if(!args.every(value=>typeof value==='string'))throw Error('Replacement arguments must be primitive strings.');
      const permission=Object.freeze({}),grant={store,generation,operation,args:Object.freeze([...args]),active:true,used:false};
      grants.set(permission,grant);activeStores.add(store);
      try{return run(permission);}finally{grant.active=false;activeStores.delete(store);}
    },
  });
}
export type IsolatedReplacementPermissions=ReturnType<typeof isolatedReplacementPermissions>;
