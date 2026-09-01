export function normalizeProjectDownloadFilename(requested:string|undefined|null,fallback:string):string {
  const candidate=(requested?.trim()||fallback.trim()).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'');
  const base=candidate||'CCTV_Project';
  return base.toLowerCase().endsWith('.cctvproj')?base:`${base}.cctvproj`;
}
