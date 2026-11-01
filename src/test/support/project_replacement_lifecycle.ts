import type { SiteProjectDatabase, ProjectValidationError } from '../../core/storage/project_db.ts';
import { isolatedReplacementPermissions } from './project_replacement_permissions.ts';
import { ProjectReplacementGateProof } from './project_replacement_gate.ts';

/** Test-only composition. No existing/production store can be supplied or upgraded.
 * One permanent claim per fresh protected store, including after retirement.
 * The issuer stays private. Retirement is in-process commit revocation only.
 */
export function isolatedReplacementLifecycle(Store:typeof SiteProjectDatabase,validationError:typeof ProjectValidationError){
  const permissions=isolatedReplacementPermissions();
  const store=new Store('ISOLATED_TEST',permissions.check);
  let claimed=false;
  return Object.freeze({store,
    claim(options:Omit<ConstructorParameters<typeof ProjectReplacementGateProof>[2],'permissions'>){
      if(claimed)throw Error('Protected store lifecycle already claimed; transfer is unsupported.');
      claimed=true;
      return new ProjectReplacementGateProof(store,validationError,{...options,permissions});
    },
  });
}
