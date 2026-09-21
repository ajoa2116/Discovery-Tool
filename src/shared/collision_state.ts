import { IPCollisionRecord } from '../types/index.ts';
/** One current-state predicate for API clients, inventory and reporting. */
export const isActiveCollision=(collision:IPCollisionRecord)=>!collision.resolved&&collision.state!=='RESOLVED';
