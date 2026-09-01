export type HardwareClass =
  | 'IP_CAMERA'
  | 'MANAGED_SWITCH'
  | 'ACCESS_CONTROL'
  | 'INTERCOM'
  | 'PERIMETER_LIDAR';

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
  | 'SNMP_LLDP'
  | 'OPTEX_REC'
  | 'RTSP'
  | 'HTTP_LEGACY'
  | 'PASSIVE_SNIFF';

export type DeviceStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'UNREACHABLE'
  | 'DIFFERENT_SUBNET'
  | 'UNKNOWN'
  | 'DISCOVERED'
  | 'AUTHENTICATED'
  | 'PROVISIONING'
  | 'CONFIGURED'
  | 'COLLISION'
  | 'ERROR'
  | 'UNRESPONSIVE';

export interface DevicePhysicalAnchor {
  macAddress: string | null;    // Primary permanent physical anchor when legitimately obtained
  onvifEndpointUuid?: string;   // WS-Discovery endpoint identity (secondary when MAC is unavailable)
  serialNumber?: string;        // Secondary hardware serial anchor
  vendor: string;               // e.g. Axis, Illustra, Lenel, Hanwha, Hikvision, Dahua, Bosch, Pelco, Cisco, Optex
  model?: string;
  firmwareVersion?: string;
  hardwareClass?: HardwareClass;
}

export interface SwitchPortTelemetry {
  switchName: string;
  switchIp: string;
  portId: string;               // e.g. GigabitEthernet1/0/12
  vlanId: number;
  poeWatts: number;             // e.g. 12.8W
  poeStatus: 'DELIVERING' | 'FAULT' | 'OFF';
}

export interface AccessControlTelemetry {
  boardType: string;            // e.g. Mercury LNL-1320-S3 Dual Reader Interface
  doorCount: number;
  dipSwitchConfig: string;      // e.g. DIP 1-ON, 2-OFF, 3-OFF, 4-ON
  osdpPassthroughActive: boolean;
}

export interface LidarTelemetry {
  detectionZoneActive: boolean;
  relayOutputTriggered: boolean;
  targetCount: number;
  sensitivityLevel: string;
}

export interface OnvifVideoStreamProfile {
  name: string;
  token: string;
  codec: 'H.264' | 'H.265' | 'MJPEG';
  resolution: '3840x2160 (4K)' | '2560x1440 (2K)' | '1920x1080 (1080p)' | '1280x720 (720p)';
  framerate: number;
  bitrateKbps: number;
  bitrateMode: 'CBR' | 'VBR';
  rtspUri: string;
}

export interface OnvifImagingSettings {
  wdrEnabled: boolean;
  wdrLevel: number;
  dayNightMode: 'AUTO' | 'DAY' | 'NIGHT';
  backlightCompensation: boolean;
  exposureCompensation: number;
  irCutFilter: boolean;
}

export interface OnvifPtzCapabilities {
  supportsPanTilt: boolean;
  supportsZoom: boolean;
  panSpeed: number;
  tiltSpeed: number;
  zoomSpeed: number;
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
  subnetMask: string | null;
  gateway?: string;
  dns?: string[];
  port: number;
  protocol: ProtocolType;
  xAddr?: string;
  xAddrs?: string[];
  senderIp?: string;
  ipAddressHistory?: string[];
}

export interface ReachabilityEvidence {
  wsDiscoveryRespondedAt?: string;
  httpReachableAt?: string;
  httpsReachableAt?: string;
  tcpServices?: Array<{ port: number; reachable: boolean; testedAt: string }>;
  lastSuccessfulResponseAt?: string;
  discoveryInterface?: {
    name: string;
    ipAddress: string;
    netmask: string;
    interfaceIndex?: number;
  };
  subnetClassification?: 'LOCAL' | 'DIFFERENT_SUBNET' | 'UNKNOWN';
}

export type DiagnosticCheckType = 'PING' | 'HTTP' | 'HTTPS' | 'TCP' | 'ONVIF_WS_DISCOVERY';
export type DiagnosticErrorCategory =
  | 'TIMEOUT'
  | 'CONNECTION_REFUSED'
  | 'NETWORK_UNREACHABLE'
  | 'TLS_CERTIFICATE'
  | 'CANCELLED'
  | 'MALFORMED_RESPONSE'
  | 'TRANSPORT_ERROR'
  | 'UNKNOWN';

export interface DiagnosticCheckEvidence {
  type: DiagnosticCheckType;
  targetIp: string;
  port?: number;
  protocol?: string;
  success: boolean;
  transportReachable?: boolean;
  timeout?: boolean;
  responseTimeMs?: number;
  httpStatus?: number;
  certificateTrusted?: boolean;
  certificateWarning?: string;
  errorCategory?: DiagnosticErrorCategory;
  errorMessage?: string;
  originatingAdapter?: { name: string; ipAddress: string; netmask: string; interfaceIndex?: number };
  timestamp: string;
  ambiguousIdentity?: boolean;
}

export interface DeviceDiagnosticState {
  checks: DiagnosticCheckEvidence[];
  lastRunStartedAt?: string;
  lastRunCompletedAt?: string;
  lastSuccessfulContactAt?: string;
  lastRefreshAt?: string;
  previouslyReachableThisSession?: boolean;
  consecutiveFailedRefreshes?: number;
}

export type BrowserPreference = 'SYSTEM' | 'EDGE' | 'CHROME' | 'EMBEDDED';
export interface CameraAccessEndpoint {
  url: string;
  scheme: 'http' | 'https';
  port?: number;
  verified: boolean;
  source: 'DIAGNOSTIC' | 'XADDR' | 'IP_FALLBACK';
  certificateWarning?: string;
}
export interface ConnectReadiness {
  state: 'READY' | 'DIFFERENT_SUBNET' | 'UNREACHABLE' | 'UNKNOWN' | 'AMBIGUOUS';
  canOpenManually: boolean;
  pairAvailable: boolean;
  retryDiagnoseAvailable: boolean;
  warning?: string;
}
export interface ConnectionHistoryEntry {
  id: string;
  timestamp: string;
  mode: BrowserPreference;
  url: string;
  statusBeforeOpen: DeviceStatus;
  event: 'OPEN_ATTEMPT' | 'RECHECK' | 'FIRST_LOGIN_REQUIRED';
  result?: string;
}

export interface IdentityConflict {
  detectedAt: string;
  reason: string;
  existingMac?: string | null;
  incomingMac?: string | null;
  existingUuid?: string;
  incomingUuid?: string;
}

export interface Device {
  id: string;                   // Derived from MAC/Serial anchor
  anchor: DevicePhysicalAnchor;
  network: NetworkEndpoint;
  status: DeviceStatus;
  statusMessage?: string;
  discoveredPhase: number;
  firstSeenAt: string;
  lastSeenAt: string;
  switchTelemetry?: SwitchPortTelemetry;
  accessTelemetry?: AccessControlTelemetry;
  lidarTelemetry?: LidarTelemetry;
  onvifConfig?: OnvifCustomConfig;
  manufacturerParams?: Record<string, any>;
  reachability?: ReachabilityEvidence;
  diagnostics?: DeviceDiagnosticState;
  connectionHistory?: ConnectionHistoryEntry[];
  activationState?: 'UNKNOWN' | 'PASSWORD_SETUP_REQUIRED' | 'TECHNICIAN_REPORTED_COMPLETE';
  identityConflicts?: IdentityConflict[];
  technician?: {
    name?: string;
    location?: string;
    notes?: string;
  };
  configuredState?: {
    inferred: boolean | null;
    manualOverride?: boolean | null;
    updatedAt?: string;
  };
  configurationEvidence?: {
    verifiedOperations: Array<'DEVICE_NAME'|'NTP'|'TIME_ZONE'|'ONVIF_ENABLE'|'REBOOT'|'PASSWORD'>;
    updatedAt: string;
  };
  savedStatusSnapshot?: DeviceStatus;
  sessionVerification?: 'NOT_VERIFIED' | 'VERIFIED' | 'NOT_FOUND';
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
  description?: string;
  siteLocation: string;
  technicianName: string;
  createdAt: string;
  updatedAt: string;
  lastSavedAt?: string;
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
  interfaceIndex?: number;
}

export interface WindowsAdapterSnapshot {
  interfaceIndex: number;
  interfaceAlias: string;
  interfaceDescription?: string;
  mediaType: 'ETHERNET' | 'WIFI' | 'OTHER';
  operationalStatus: string;
  eligible: boolean;
  eligibilityReason?: string;
  dhcpEnabled: boolean;
  ipv4Addresses: Array<{ address: string; prefixLength: number }>;
  defaultGateways: string[];
  dnsAutomatic: boolean;
  dnsServers: string[];
  capturedAt: string;
}

export type PairState =
  | 'IDLE' | 'PREPARING' | 'CHECKING_ADDRESS' | 'READY_FOR_CONFIRMATION'
  | 'APPLYING' | 'VERIFYING' | 'PAIRED' | 'RESTORING' | 'RESTORED'
  | 'FAILED' | 'ROLLBACK_REQUIRED' | 'CANCELLED';

export interface PairCandidate {
  ipAddress: string;
  prefixLength: number;
  confidence: 'AVAILABLE' | 'UNCERTAIN';
  evidence: string[];
}

export interface PairSessionState {
  id: string;
  state: PairState;
  deviceId: string;
  cameraIp: string;
  cameraSubnetMask: string;
  adapter: WindowsAdapterSnapshot;
  originalAdapter: WindowsAdapterSnapshot;
  candidates: PairCandidate[];
  selectedCandidate?: PairCandidate;
  createdAt: string;
  updatedAt: string;
  technicianConfirmedAt?: string;
  adapterConfigurationVerified?: boolean;
  cameraReachabilityVerified?: boolean;
  message?: string;
  errorCode?: string;
  recoveryAvailable: boolean;
}

export type WorkMode = 'QUICK_WORK' | 'PROJECT';

export interface ProjectSession {
  mode: WorkMode;
  project: SiteProject;
  filePath?: string;
  dirty: boolean;
}

export interface CctvProjectBundle {
  format: 'CCTV_DISCOVERY_PROJECT';
  schemaVersion: 1;
  applicationVersion: string;
  project: SiteProject;
}

export interface ReverificationResult {
  totalKnown: number;
  recognizedCount: number;
  changedIpCount: number;
  newDevicesCount: number;
  possibleReplacements: Array<{
    expectedName: string;
    expectedMac: string | null;
    foundMac: string | null;
    foundIp: string;
    model: string;
  }>;
}
