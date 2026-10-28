/** Runtime stale-write precondition, never authentication or persisted evidence. */
export interface MetadataWriteContext {
  version: 1;
  projectId: string;
  mode: 'PROJECT' | 'QUICK_WORK';
  generation: string;
}

export function isMetadataWriteContext(value: unknown): value is MetadataWriteContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return Object.keys(input).sort().join(',') === 'generation,mode,projectId,version'
    && input.version === 1 && typeof input.projectId === 'string' && input.projectId.length > 0
    && (input.mode === 'PROJECT' || input.mode === 'QUICK_WORK')
    && typeof input.generation === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.generation);
}

export class MetadataWriteConflictError extends Error {
  readonly code = 'METADATA_PROJECT_CONFLICT';
  constructor() {
    super('This edit could not be applied to its originating Project session. Refresh the current Project and review the intended edit before submitting again.');
    this.name = 'MetadataWriteConflictError';
  }
}
