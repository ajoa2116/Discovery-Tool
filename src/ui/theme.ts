export type ThemePreference = 'LIGHT' | 'DARK' | 'SYSTEM';
export const THEME_STORAGE_KEY = 'cctv-network-assistant-theme';

export function readThemePreference(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): ThemePreference {
  const value = storage?.getItem(THEME_STORAGE_KEY);
  return value === 'DARK' || value === 'SYSTEM' || value === 'LIGHT' ? value : 'LIGHT';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): 'LIGHT' | 'DARK' {
  return preference === 'SYSTEM' ? (systemDark ? 'DARK' : 'LIGHT') : preference;
}

export function applyTheme(preference: ThemePreference, root: Pick<DOMTokenList, 'toggle'> = document.documentElement.classList, systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches) {
  root.toggle('dark', resolveTheme(preference, systemDark) === 'DARK');
}

export function persistTheme(preference: ThemePreference, storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(THEME_STORAGE_KEY, preference);
}
