import { isDeepStrictEqual } from 'node:util';
import type { SiteProjectDatabase, ProjectValidationError } from '../../core/storage/project_db.ts';
import type { ActivationResult, OpenAdmissionInput } from '../../core/projects/project_open_admission_coordinator_prototype.ts';

/**
 * Test-only synchronous adapter. The caller exclusively owns the isolated store.
 * No deferred work, notifications, retry or rollback. Throws a fixed marker for
 * the existing coordinator to classify as UNKNOWN.
 * The constructor is injected to preserve import-after-tripwire test ordering.
 */
export function activateProjectImportOnce(
  store:SiteProjectDatabase,input:Readonly<OpenAdmissionInput>,validationError:typeof ProjectValidationError,
):ActivationResult{
  const beforeIdentity=store.getSessionGeneration(),beforeSession=store.getSession();
  const beforeContext=store.getMetadataWriteContext();
  if(beforeContext.generation!==input.originatingGeneration)throw Error('Activation outcome unavailable.');
  try{
    const imported=store.importProjectJson(input.payload);
    const afterIdentity=store.getSessionGeneration(),afterContext=store.getMetadataWriteContext(),afterSession=store.getSession();
    if(afterIdentity===beforeIdentity||afterContext.generation===beforeContext.generation
      ||afterContext.mode!=='PROJECT'||afterSession.mode!=='PROJECT'
      ||afterContext.projectId!==imported.id||afterSession.project.id!==imported.id
      ||!isDeepStrictEqual(afterSession.metadataWriteContext,afterContext))
      throw Error('Activation identity could not be confirmed.');
    return {status:'ADMITTED',projectId:afterSession.project.id,activatedGeneration:afterContext.generation};
  }catch(error){
    try{
      if(error instanceof validationError&&store.getSessionGeneration()===beforeIdentity
        &&isDeepStrictEqual(store.getMetadataWriteContext(),beforeContext)
        &&isDeepStrictEqual(store.getSession(),beforeSession))
        return {status:'REJECTED_BEFORE_ACTIVATION',reason:'VALIDATION_REJECTED'};
    }catch{/* Failure to verify unchanged state is not proof of rejection. */}
    throw Error('Activation outcome unavailable.');
  }
}
