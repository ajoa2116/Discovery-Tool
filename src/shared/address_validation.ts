export function normalizeIPv4(value: string): string | null {
  const parts = value.trim().split('.');
  if (parts.length !== 4 || parts.some(part => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) return null;
  return parts.map(Number).join('.');
}

export function normalizeManualMac(value: string): string | null {
  const input = value.trim();
  if (!/^(?:[a-f\d]{12}|(?:[a-f\d]{2}:){5}[a-f\d]{2}|(?:[a-f\d]{2}-){5}[a-f\d]{2})$/i.test(input)) return null;
  const hex = input.replace(/[:-]/g, '').toLowerCase();
  if (hex === '000000000000' || hex === 'ffffffffffff' || (parseInt(hex.slice(0, 2), 16) & 1)) return null;
  return hex.match(/.{2}/g)!.join(':');
}

export const ipv4Number = (ip: string): number | null => normalizeIPv4(ip) === null ? null : ip.trim().split('.').reduce((result, octet) => result * 256 + Number(octet), 0);
export const prefixMask = (prefix: number) => [24, 16, 8, 0].map(shift => ((prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0) >>> shift) & 255).join('.');
export function addressRelationship(ip: string, localIp: string, prefix: number): 'LOCAL' | 'DIFFERENT_SUBNET' | 'UNKNOWN' {
  const target = ipv4Number(ip), local = ipv4Number(localIp);
  if (target === null || local === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return 'UNKNOWN';
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (target & mask) === (local & mask) ? 'LOCAL' : 'DIFFERENT_SUBNET';
}
