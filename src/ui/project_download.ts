export function normalizeProjectDownloadFilename(requested: string | undefined | null, fallback: string): string {
  const candidate = (requested?.trim() || fallback.trim()).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '');
  const base = candidate || 'CCTV_Project';
  return base.toLowerCase().endsWith('.cctvproj') ? base : `${base}.cctvproj`;
}

interface SaveProjectDownloadOptions {
  saveAs: boolean;
  currentFilename: string;
  suggestedFilename: string;
  chooseFilename: (suggested: string) => string | null;
  fetchContent: () => Promise<string>;
  download: (content: string, filename: string) => void;
}

/** Coordinates one user save action into at most one serialization and one download. */
export async function saveProjectDownload(options: SaveProjectDownloadOptions): Promise<string | null> {
  const fallback = normalizeProjectDownloadFilename(options.currentFilename, options.suggestedFilename);
  const requested = options.saveAs ? options.chooseFilename(fallback) : fallback;
  if (requested === null) return null;
  const filename = normalizeProjectDownloadFilename(requested, fallback);
  const content = await options.fetchContent();
  options.download(content, filename);
  return filename;
}
