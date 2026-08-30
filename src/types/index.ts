export type ProtocolType =
  | 'ONVIF'
  | 'AXIS_ADP'
  | 'ILLUSTRA'
  | 'LENEL'
  | 'HANWHA_SUNAPI'
  | 'HIKVISION_ISAPI'
  | 'DAHUA_CGI'
  | 'BOSCH_RCP'
  | 'PELCO_SARIX'
  | 'RTSP'
  | 'HTTP_LEGACY'
  | 'PASSIVE_SNIFF';

export type DeviceStatus = 'DISCOVERED' | 'AUTHENTICATED' | 'PROVISIONING' | 'CONFIGURED' | 'COLLISION' | 'ERROR' | 'UNRESPONSIVE';

export interface DevicePhysicalAnchor {
  macAddress: string;           // Primary permanent physical anchor (e.g. 00:40:8c:12:34:56)
  serialNumber?: string;        // Secondary hardware serial anchor
  vendor: string;               // e.g. Axis, Illustra, Lenel, Hanwha, Hikvision, Dahua, Bosch, Pelco
  model?: string;
  firmwareVersion?: string;
}

export interface OnvifVideoStreamProfile {
  name: string;
  token: string;
  codec: 'H.264' | 'H.265' | 'MJPEG';
  resolution: '3840x2160 (4K)' | '2560x1440 (2K)' | '1920x1080 (1080p)' | '1280x720 (720p)';
  framerate: number;           // FPS (e.g. 30, 60)
  bitrateKbps: number;         // e.g. 4096, 8192
  bitrateMode: 'CBR' | 'VBR';
  rtspUri: string;
}

export interface OnvifImagingSettings {
  wdrEnabled: boolean;
  wdrLevel: number;            // 0 - 100
  dayNightMode: 'AUTO' | 'DAY' | 'NIGHT';
  backlightCompensation: boolean;
  exposureCompensation: number;// -5 to +5
  irCutFilter: boolean;
}

export interface OnvifPtzCapabilities {
  supportsPanTilt: boolean;
  supportsZoom: boolean;
  panSpeed: number;            // 1 - 10
  tiltSpeed: number;           // 1 - 10
  zoomSpeed: number;           // 1 - 10
  presets: Array<{ id: number; name: string; token: string }>;
}

export interface OnvifCustomConfig {
  videoProfiles: OnvifVideoStreamProfile[];
  imaging: OnvifImagingSettings;
  ptz?: OnvifPtzCapabilities;
  ntpServer: string;
  timezone: string;
  wsSecurityMode: 'DIGEST' | 'PLAINTEXT' | 'MUTUAL_TLS';
  httpsMandatory: boolean;
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
  onvifConfig?: OnvifCustomConfig;
  manufacturerParams?: Record<string, any>;
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
