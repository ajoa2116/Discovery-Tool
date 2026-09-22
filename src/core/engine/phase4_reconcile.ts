import { Device, IPCollisionRecord, NICInfo } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';
import { projectDb, SiteProjectDatabase } from '../storage/project_db.ts';
import { reconcileCollisionState } from './collision_reconciliation.ts';

export class Phase4IdentityReconciliation {
  public static async execute(database:SiteProjectDatabase=projectDb,interfaces?:NICInfo[]):Promise<{reconciledDevices:Device[];collisions:IPCollisionRecord[];logs:string[]}> {
    const devices=database.getDevices();
    const {active,transitions}=reconcileCollisionState(devices,database.getCollisions(),interfaces);
    for(const message of transitions)appStateDb.logAudit({id:crypto.randomUUID(),timestamp:new Date().toISOString(),phase:4,category:'EDGE_CASE',level:'INFO',message});
    return {reconciledDevices:devices,collisions:active,logs:[...transitions,`[Phase 4] Reconciled ${devices.length} identities; ${active.length} active IP collision(s).`]};
  }
}
