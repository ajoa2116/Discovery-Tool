import { AuditLogEntry } from '../../types/index.ts';
import { AppendProjectHistory, ProjectHistoryEvent, ProjectHistoryFilter, ProjectHistoryType } from '../../shared/project_history.ts';
export type { AppendProjectHistory, ProjectHistoryEvent, ProjectHistoryFilter, ProjectHistoryType } from '../../shared/project_history.ts';

export const PROJECT_HISTORY_LIMIT = 2000;
const SECRET_KEY = /(password|passwd|pwd|credential|authorization|cookie|token|secret|api[_-]?key|session[_-]?key|vault)/i;
const VALID_LEVELS = new Set(['INFO','WARNING','ERROR','SUCCESS']);
const VALID_CATEGORIES = new Set(['DISCOVERY','SECURITY','PROVISIONING','EDGE_CASE','SYSTEM']);

function safe(value: unknown, key = ''): unknown {
  if (SECRET_KEY.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(item => safe(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([name]) => !SECRET_KEY.test(name)).map(([name, child]) => [name, safe(child, name)]));
  if (typeof value === 'string') return value.replace(/\b(?:Basic|Bearer)\s+[A-Za-z0-9._~+\/-]+=*/gi, '[REDACTED AUTH]').replace(/\b(password|passwd|pwd|credential(?:ref)?|authorization|cookie|token|secret|api[_ -]?key|vault)\b(?:\s*[:=]\s*[^,;\s]+)?/gi, '[REDACTED]');
  return value;
}
const knownType = (value: unknown): ProjectHistoryType => typeof value === 'string' && [
  'PROJECT_CREATED','DEVICE_ADDED','DEVICE_RE_ADDED','DEVICE_REMOVED','IP_ADDRESS_CHANGED','IDENTITY_VERIFIED','IDENTITY_EVIDENCE_CHANGED','DIFFERENT_NETWORK','NOT_VERIFIED','REVERIFY_COMPLETED','REPLACEMENT_CANDIDATE','REPLACEMENT_CONFIRMED','REPLACEMENT_REJECTED','REPLACEMENT_DEFERRED','CONFIGURATION','TECHNICIAN_NAME_CHANGED','LOCATION_CHANGED','NOTES_UPDATED'
].includes(value) ? value as ProjectHistoryType : 'UNKNOWN';
const legacyType = (entry: AuditLogEntry): ProjectHistoryType => {
  const operation = String(entry.details?.operation || '');
  if (operation === 'REMOVE_FROM_PROJECT') return 'DEVICE_REMOVED';
  if (operation === 'ADD_TO_EXISTING_PROJECT') return entry.details?.result === 'RE_ADDED' ? 'DEVICE_RE_ADDED' : 'DEVICE_ADDED';
  if (/replacement/i.test(entry.message)) return 'REPLACEMENT_CONFIRMED';
  return 'UNKNOWN';
};

export class ProjectHistoryService {
  public static create(input: AppendProjectHistory): AuditLogEntry {
    const timestamp = input.timestamp && Number.isFinite(Date.parse(input.timestamp)) ? input.timestamp : new Date().toISOString();
    return { id: crypto.randomUUID(), timestamp, category: input.category || 'SYSTEM', level: input.level || (input.result === 'FAILED' ? 'ERROR' : 'INFO'), message: String(safe(input.summary)), deviceId: input.deviceId, details: safe({ historyType: input.type, title: input.title, source: input.source || 'PROJECT', result: input.result, ...(input.details || {}) }) as Record<string, unknown> };
  }
  public static sanitizeEntry(value: unknown): AuditLogEntry | null {
    if (!value || typeof value !== 'object') return null;
    const entry = value as Partial<AuditLogEntry>;
    if (typeof entry.id !== 'string' || !entry.id || typeof entry.timestamp !== 'string' || !Number.isFinite(Date.parse(entry.timestamp)) || typeof entry.message !== 'string') return null;
    return { id: entry.id, timestamp: entry.timestamp, category: VALID_CATEGORIES.has(String(entry.category)) ? entry.category! : 'SYSTEM', level: VALID_LEVELS.has(String(entry.level)) ? entry.level! : 'INFO', message: String(safe(entry.message)), deviceId: typeof entry.deviceId === 'string' ? entry.deviceId : undefined, details: safe(entry.details || {}) as Record<string, unknown> };
  }
  public static normalize(value: unknown): ProjectHistoryEvent | null {
    const entry = this.sanitizeEntry(value); if (!entry) return null;
    const type = knownType(entry.details?.historyType) === 'UNKNOWN' ? legacyType(entry) : knownType(entry.details?.historyType);
    return { ...entry, type, title: typeof entry.details?.title === 'string' ? entry.details.title : type === 'UNKNOWN' ? 'Project event' : type.replaceAll('_',' ').replace(/\b\w/g, c=>c.toUpperCase()), summary: entry.message, source: typeof entry.details?.source === 'string' ? entry.details.source : 'PROJECT', result: ['SUCCESS','FAILED','CANCELLED','UNKNOWN'].includes(String(entry.details?.result)) ? entry.details?.result as ProjectHistoryEvent['result'] : undefined };
  }
  public static bounded(entries: unknown[]): AuditLogEntry[] { return entries.map(entry=>this.sanitizeEntry(entry)).filter((entry):entry is AuditLogEntry=>Boolean(entry)).slice(-PROJECT_HISTORY_LIMIT); }
  public static list(entries: unknown[], filter: ProjectHistoryFilter = 'ALL', deviceId?: string): ProjectHistoryEvent[] {
    const groups: Record<ProjectHistoryFilter, ProjectHistoryType[]> = { ALL:[], DEVICE:['DEVICE_ADDED','DEVICE_RE_ADDED','DEVICE_REMOVED','IP_ADDRESS_CHANGED','IDENTITY_EVIDENCE_CHANGED','TECHNICIAN_NAME_CHANGED','LOCATION_CHANGED','NOTES_UPDATED','REPLACEMENT_CONFIRMED'], VERIFICATION:['IDENTITY_VERIFIED','DIFFERENT_NETWORK','NOT_VERIFIED','REVERIFY_COMPLETED','REPLACEMENT_CANDIDATE','REPLACEMENT_REJECTED','REPLACEMENT_DEFERRED'], CONFIGURATION:['CONFIGURATION'], PROJECT:['PROJECT_CREATED'] };
    return entries.map((entry,index)=>({event:this.normalize(entry),index})).filter(item=>item.event && (!deviceId || item.event.deviceId===deviceId) && (filter==='ALL' || groups[filter].includes(item.event.type))).sort((a,b)=>b.event!.timestamp.localeCompare(a.event!.timestamp)||b.index-a.index||b.event!.id.localeCompare(a.event!.id)).map(item=>item.event!);
  }
}
