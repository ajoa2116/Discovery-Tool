import type { Express } from 'express';
import type { LegacyConfigurationBoundary } from '../core/network/legacy_configuration_boundary.ts';
import type { SiteProjectDatabase } from '../core/storage/project_db.ts';
import type { AuditLogEntry, Device, SiteProject } from '../types/index.ts';
import { MetadataWriteConflictError } from '../shared/metadata_write_context.ts';

export interface LocalMetadataRouteDependencies {
  projectDb: Pick<SiteProjectDatabase, 'getProject'>;
  legacyConfigurationBoundary: Pick<LegacyConfigurationBoundary, 'updateLocalMetadata'>;
  logAudit: (entry: AuditLogEntry) => void;
  broadcast: (event: { type: 'DEVICE_METADATA_UPDATED'; data: { device: Device; project: SiteProject } }) => void;
}

/** Registers only the existing POST. The composition retains its authentication middleware. */
export function registerLocalMetadataRoute(app: Pick<Express, 'post'>, dependencies: LocalMetadataRouteDependencies): void {
  const { projectDb, legacyConfigurationBoundary, logAudit, broadcast } = dependencies;
  app.post('/api/device/:identifier/config', (req, res) => {
    try {
      const device=legacyConfigurationBoundary.updateLocalMetadata(req.params.identifier,req.body||{});
      logAudit({id:crypto.randomUUID(),timestamp:new Date().toISOString(),category:'SYSTEM',level:'INFO',message:'Local technician metadata updated.',deviceId:device.id});
      broadcast({type:'DEVICE_METADATA_UPDATED',data:{device,project:projectDb.getProject()}});
      res.json({status:'LOCAL_METADATA_UPDATED',device});
    } catch(error) {
      if (error instanceof MetadataWriteConflictError) {
        res.status(409).json({status:'CONFLICT',code:error.code,error:error.message});return;
      }
      const message=error instanceof Error?error.message:'Local metadata could not be updated.';
      res.status(message.includes('Device not found')?404:message.includes('physical camera')?410:400).json({status:message.includes('physical camera')?'UNSUPPORTED':'UNAVAILABLE',error:message});
    }
  });
}
