export type EvidenceProvenance = 'PHYSICAL_NETWORK' | 'SYNTHETIC_TEST' | 'SUPPORT_DIAGNOSTIC';
// This marker only downgrades trust. It never authorizes physical-network provenance.
export const SYNTHETIC_NAMESPACE = 'urn:cctv-discovery:synthetic-test';
export function packetProvenance(xml:string, fallback:EvidenceProvenance='PHYSICAL_NETWORK'):EvidenceProvenance {
  return xml.includes(SYNTHETIC_NAMESPACE) ? 'SYNTHETIC_TEST' : fallback;
}
