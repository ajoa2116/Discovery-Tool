import { BrowserPreference } from '../types/index.ts';
import { THEME_STORAGE_KEY, ThemePreference } from './theme.ts';

export const APPLICATION_PREFERENCES_KEY = 'cctv-network-assistant-preferences';
export const APPLICATION_PREFERENCES_VERSION = 1;
export const MONITORING_CADENCES = [15_000, 30_000, 60_000, 120_000] as const;
export type MonitoringCadence = typeof MONITORING_CADENCES[number];
export const TABLE_COLUMNS = ['NAME', 'STATUS', 'IP', 'LAST_6', 'CONFIGURED', 'SERIAL', 'NOTES'] as const;
export type TableColumnId = typeof TABLE_COLUMNS[number];

export interface ApplicationPreferences {
  version: 1;
  appearance: ThemePreference;
  monitoringEnabled: boolean;
  monitoringCadenceMs: MonitoringCadence;
  newDeviceNotifications: boolean;
  browserPreference: BrowserPreference;
  visibleColumns: TableColumnId[];
}

export const DEFAULT_VISIBLE_COLUMNS: TableColumnId[] = [...TABLE_COLUMNS];
export const DEFAULT_APPLICATION_PREFERENCES: ApplicationPreferences = {
  version: APPLICATION_PREFERENCES_VERSION,
  appearance: 'LIGHT',
  monitoringEnabled: true,
  monitoringCadenceMs: 30_000,
  newDeviceNotifications: true,
  browserPreference: 'SYSTEM',
  visibleColumns: DEFAULT_VISIBLE_COLUMNS,
};

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;
const isTheme = (value: unknown): value is ThemePreference => value === 'LIGHT' || value === 'DARK' || value === 'SYSTEM';
const isBrowser = (value: unknown): value is BrowserPreference => value === 'SYSTEM' || value === 'EDGE' || value === 'CHROME' || value === 'EMBEDDED';
const isCadence = (value: unknown): value is MonitoringCadence => typeof value === 'number' && MONITORING_CADENCES.includes(value as MonitoringCadence);

export function validateApplicationPreferences(value: unknown, legacyAppearance?: unknown): ApplicationPreferences {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const storedColumns = Array.isArray(source.visibleColumns) ? source.visibleColumns : null;
  const acceptedColumns = storedColumns ? TABLE_COLUMNS.filter(column => storedColumns.includes(column)) : null;
  const columns = acceptedColumns && (storedColumns!.length === 0 || acceptedColumns.length > 0) ? acceptedColumns : DEFAULT_VISIBLE_COLUMNS;
  return {
    version: APPLICATION_PREFERENCES_VERSION,
    appearance: isTheme(source.appearance) ? source.appearance : isTheme(legacyAppearance) ? legacyAppearance : DEFAULT_APPLICATION_PREFERENCES.appearance,
    monitoringEnabled: typeof source.monitoringEnabled === 'boolean' ? source.monitoringEnabled : DEFAULT_APPLICATION_PREFERENCES.monitoringEnabled,
    monitoringCadenceMs: isCadence(source.monitoringCadenceMs) ? source.monitoringCadenceMs : DEFAULT_APPLICATION_PREFERENCES.monitoringCadenceMs,
    newDeviceNotifications: typeof source.newDeviceNotifications === 'boolean' ? source.newDeviceNotifications : DEFAULT_APPLICATION_PREFERENCES.newDeviceNotifications,
    browserPreference: isBrowser(source.browserPreference) ? source.browserPreference : DEFAULT_APPLICATION_PREFERENCES.browserPreference,
    visibleColumns: columns,
  };
}

export function readApplicationPreferences(storage: ReadStorage | null = typeof localStorage === 'undefined' ? null : localStorage): ApplicationPreferences {
  if (!storage) return { ...DEFAULT_APPLICATION_PREFERENCES, visibleColumns: [...DEFAULT_VISIBLE_COLUMNS] };
  let stored: unknown;
  try { stored = JSON.parse(storage.getItem(APPLICATION_PREFERENCES_KEY) || 'null'); } catch { stored = null; }
  return validateApplicationPreferences(stored, storage.getItem(THEME_STORAGE_KEY));
}

export function persistApplicationPreferences(preferences: ApplicationPreferences, storage: WriteStorage = localStorage): ApplicationPreferences {
  const safe = validateApplicationPreferences(preferences);
  storage.setItem(APPLICATION_PREFERENCES_KEY, JSON.stringify(safe));
  return safe;
}

export function updateApplicationPreferences(current: ApplicationPreferences, patch: Partial<Omit<ApplicationPreferences, 'version'>>): ApplicationPreferences {
  return validateApplicationPreferences({ ...current, ...patch, version: APPLICATION_PREFERENCES_VERSION });
}

export function resolveOpenPreference(requested: BrowserPreference, saved: BrowserPreference): BrowserPreference {
  return requested === 'SYSTEM' ? saved : requested;
}

export function shouldNotifyForDiscovery(preferences: ApplicationPreferences, isNew: boolean): boolean {
  return preferences.newDeviceNotifications && isNew;
}
