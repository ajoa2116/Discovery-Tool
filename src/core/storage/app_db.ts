import { AuditLogEntry } from '../../types/index.ts';

// Comprehensive IEEE OUI database for CCTV & Security hardware
export const OUI_VENDOR_DATABASE: Record<string, string> = {
  // Axis Communications
  '00:40:8c': 'Axis Communications',
  'ac:cc:8e': 'Axis Communications',
  'b8:a4:4f': 'Axis Communications',
  'e8:27:25': 'Axis Communications',
  
  // Illustra / Tyco / Johnson Controls
  '00:1a:e8': 'Illustra / Tyco',
  '00:0e:53': 'Illustra / Tyco',
  '00:26:55': 'Illustra / Tyco',
  '14:a7:8b': 'Illustra / Tyco',

  // Lenel / UTC / Carrier
  '00:02:b3': 'Lenel Access Control',
  '00:50:c2': 'Lenel Access Control',
  '70:b3:d5': 'Lenel Access Control',

  // Hanwha Vision (Samsung Techwin)
  '00:16:6c': 'Hanwha Vision',
  '00:09:18': 'Hanwha Vision',
  '14:14:4b': 'Hanwha Vision',

  // Hikvision
  '00:24:b2': 'Hikvision Digital Technology',
  'bc:ad:28': 'Hikvision Digital Technology',
  '44:19:b6': 'Hikvision Digital Technology',

  // Dahua Technology
  '3c:ef:8c': 'Dahua Technology',
  '4c:11:bf': 'Dahua Technology',
  '90:02:a9': 'Dahua Technology',

  // Bosch Security Systems
  '00:07:5f': 'Bosch Security',
  '18:a9:58': 'Bosch Security',

  // Pelco / Motorola
  '00:04:7d': 'Pelco',
  '00:17:7c': 'Pelco',
};

export class AppStateDatabase {
  private auditLogs: AuditLogEntry[] = [];
  private technicianName: string = 'Field Specialist (Omar Cruz)';
  private authorizedDHCPServers: Set<string> = new Set(['192.168.1.1', '10.0.0.1']);

  constructor() {
    this.logAudit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      category: 'SYSTEM',
      level: 'INFO',
      message: 'Global App State & OUI Database initialized successfully.',
    });
  }

  public resolveVendor(mac: string): string {
    const cleanMac = mac.toLowerCase().replace(/[:-]/g, '');
    if (cleanMac.length < 6) return 'Generic ONVIF / Unknown';
    
    const prefix = `${cleanMac.slice(0, 2)}:${cleanMac.slice(2, 4)}:${cleanMac.slice(4, 6)}`;
    return OUI_VENDOR_DATABASE[prefix] || 'Generic ONVIF Device';
  }

  public logAudit(entry: AuditLogEntry): void {
    this.auditLogs.unshift(entry);
    // Keep last 1000 logs in memory/storage
    if (this.auditLogs.length > 1000) {
      this.auditLogs.pop();
    }
  }

  public getAuditLogs(): AuditLogEntry[] {
    return [...this.auditLogs];
  }

  public getTechnicianName(): string {
    return this.technicianName;
  }

  public setTechnicianName(name: string): void {
    this.technicianName = name;
  }

  public isDHCPServerAuthorized(ip: string): boolean {
    return this.authorizedDHCPServers.has(ip);
  }

  public authorizeDHCPServer(ip: string): void {
    this.authorizedDHCPServers.add(ip);
  }
}

export const appStateDb = new AppStateDatabase();
