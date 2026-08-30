export type ProtocolType = 'ONVIF' | 'AXIS_ADP' | 'ILLUSTRA' | 'LENEL' | 'RTSP' | 'HTTP_LEGACY' | 'PASSIVE_SNIFF';

export type DeviceStatus = 'DISCOVERED' | 'AUTHENTICATED' | 'PROVISIONING' | 'CONFIGURED' | 'COLLISION' | 'ERROR' | 'UNRESPONSIVE';

export interface DevicePhysicalAnchor {
  macAddress: string;           // Primary permanent physical anchor (e.g. 00:40:8c:12:34:56)
  serialNumber?: string;        // Secondary hardware serial anchor
  vendor: string;               // e.g. Axis, Illustra, Lenel, Hikvision, Hanwha
  model?: string;
  firmwareVersion?: string;
}

export interface NetworkEndpoint {
  ipAddress: string;
  subnetMask: string;
  gateway?: string;
  dns?: string[];
  port: number;
  protocol: ProtocolType;
  xAddr?: string;               // ONVIF service address
}

export interface Device {
  id: string;                   // Derived from MAC/Serial anchor
  anchor: DevicePhysicalAnchor;
  network: NetworkEndpoint;
  status: DeviceStatus;
  statusMessage?: string;
  discoveredPhase: number;      // Phase 2, 3, etc.
  firstSeenAt: string;
  lastSeenAt: string;
  telemetry?: {
    heartbeatIntervalMs: number;
    packetLossPct: number;
    latencyMs: number;
    rtspStreamActive: boolean;
  };
  customStaticProfile?: {
    assignedIp: string;
    assignedSubnet: string;
    assignedGateway: string;
    assignedVlan?: number;
    appliedCredentialsId?: string;
  };
}

export type PhaseStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export interface PhaseState {
  phaseNumber: number;
  name: string;
  description: string;
  status: PhaseStatus;
  progressPct: number;
  devicesFoundCount: number;
  logs: string[];
  startTime?: string;
  endTime?: string;
}

export interface IPCollisionRecord {
  ipAddress: string;
  collidingDevices: Device[];
  detectedAt: string;
  resolved: boolean;
  resolutionStrategy?: 'MANUAL_REASSIGN' | 'SEVER_LEASE' | 'ISOLATE_MAC';
}

export interface RogueDHCPOffer {
  serverIp: string;
  serverMac: string;
  offeredIp: string;
  subnetMask: string;
  detectedAt: string;
  switchPortHint?: string;
  isAuthorized: boolean;
}

export interface SiteProject {
  id: string;
  name: string;
  siteLocation: string;
  technicianName: string;
  createdAt: string;
  updatedAt: string;
  totalDevices: number;
  devices: Device[];
  collisions: IPCollisionRecord[];
  rogueDhcpEvents: RogueDHCPOffer[];
  auditLogs: AuditLogEntry[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  phase?: number;
  category: 'DISCOVERY' | 'SECURITY' | 'PROVISIONING' | 'EDGE_CASE' | 'SYSTEM';
  level: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
  message: string;
  deviceId?: string;
  details?: Record<string, any>;
}

export interface NICInfo {
  name: string;
  ipAddress: string;
  netmask: string;
  broadcast: string;
  mac: string;
  isInternal: boolean;
}
