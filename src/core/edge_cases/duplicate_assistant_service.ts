import { SiteProjectDatabase } from '../storage/project_db.ts';
import { IncrementalDiscoveryMonitor } from '../engine/incremental_discovery_monitor.ts';
import { duplicateAssistantView } from '../../shared/duplicate_assistant.ts';

export class DuplicateAssistantService {
  private pending=new Map<string,Promise<ReturnType<DuplicateAssistantService['result']>>>();
  constructor(private db:SiteProjectDatabase,private monitor:Pick<IncrementalDiscoveryMonitor,'runNow'|'getState'>){}
  get(key:string) {
    const visible=new Set(this.db.getProject().devices.map(d=>d.id));
    const view=duplicateAssistantView(this.db.getCollisions(),this.db.getDevices(),key,new Set(this.db.getDevices().filter(d=>!visible.has(d.id)).map(d=>d.id)));
    if(!view)throw new Error('This collision is no longer available in the current project.');
    return view;
  }
  private result(key:string,outcome:'COMPLETED'|'SKIPPED'|'FAILED') {
    const state=this.monitor.getState();
    return {outcome,reason:outcome==='SKIPPED'?state.lastSkipReason:outcome==='FAILED'?state.lastError:undefined,view:this.get(key)};
  }
  recheck(key:string) {
    const id=this.get(key).id,existing=this.pending.get(id);
    if(existing)return existing;
    // Same coordinator, read-only discovery pipeline, runtime upserts and operation guards.
    const work=this.monitor.runNow().then(outcome=>this.result(id,outcome)).finally(()=>this.pending.delete(id));
    this.pending.set(id,work);
    return work;
  }
}
