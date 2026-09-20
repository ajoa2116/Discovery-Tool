import { validRecoverySnapshot, validRecoverySession, sameAdapterConfiguration, samePhysicalAdapter } from '../../shared/pair_recovery.ts';
import { observeNeighbor } from '../../shared/identity_enrichment.ts';
import { NetworkMatchInput, networkMatchError } from '../../shared/network_match.ts';
import { verifyAfterPair } from './post_pair_verification.ts';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { Device, PairCandidate, PairSessionState, WindowsAdapterSnapshot } from '../../types/index.ts';
import { SiteProjectDatabase, projectDb } from '../storage/project_db.ts';
import { appStateDb } from '../storage/app_db.ts';
import { DeviceDiagnosticEngine, NodeTcpDiagnosticProvider, WindowsPingProvider, PingProvider } from '../engine/diagnostic_engine.ts';
import { WindowsNeighborProvider, NeighborProvider, normalizeMacAddress } from '../engine/device_enrichment.ts';
import { NetworkConfigurationError, PowerShellWindowsNetworkAdapterService, WindowsNetworkAdapterService } from './windows_adapter_service.ts';
import { pairTargetBlock, applyNetworkRelationship } from '../../shared/network_relationship.ts';
import { normalizeIPv4 } from '../../shared/address_validation.ts';

export type CandidateAvailability = 'OCCUPIED' | 'AVAILABLE' | 'UNCERTAIN';
export interface CandidateAddressChecker {
  check(ipAddress: string, options?: { signal?: AbortSignal }): Promise<{ availability: CandidateAvailability; evidence: string[] }>;
}
export interface PairRecoveryStore {
  load(): Promise<PairSessionState | null>;
  save(session: PairSessionState): Promise<void>;
  clear(): Promise<void>;
}

export class JsonPairRecoveryStore implements PairRecoveryStore {
  constructor(private readonly filePath = join(process.env.LOCALAPPDATA || tmpdir(), 'CCTVDiscoveryTool', 'pair-recovery.json')) {}
  async load(): Promise<PairSessionState | null> { try { return JSON.parse(await fs.readFile(this.filePath, 'utf8')) as PairSessionState; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } }
  async save(session: PairSessionState): Promise<void> { await fs.mkdir(dirname(this.filePath), { recursive: true }); const temp = `${this.filePath}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, JSON.stringify(session, null, 2), { flag: 'wx' }); await fs.rename(temp, this.filePath); }
  async clear(): Promise<void> { await fs.rm(this.filePath, { force: true }); }
}

export class ConservativeCandidateAddressChecker implements CandidateAddressChecker {
  constructor(private readonly neighbor: NeighborProvider = new WindowsNeighborProvider(), private readonly ping: PingProvider = new WindowsPingProvider(), private readonly tcp = new NodeTcpDiagnosticProvider()) {}
  async check(ipAddress: string, options: { signal?: AbortSignal } = {}) {
    const evidence: string[] = [];
    try {
      const neighbor = await this.neighbor.lookup(ipAddress, { signal: options.signal });
      if (neighbor) return { availability: 'OCCUPIED' as const, evidence: [`Windows neighbor table reports ${neighbor.macAddress}.`] };
      evidence.push('No Windows neighbor-table identity was present.');
      const [ping, http, https] = await Promise.all([
        this.ping.check(ipAddress, { timeoutMs: 350, signal: options.signal }),
        this.tcp.check(ipAddress, { port: 80, timeoutMs: 350, signal: options.signal }),
        this.tcp.check(ipAddress, { port: 443, timeoutMs: 350, signal: options.signal }),
      ]);
      if (ping.success || http.success || https.success) return { availability: 'OCCUPIED' as const, evidence: ['The address responded to an active ICMP or TCP check.'] };
      evidence.push('ICMP did not respond; this alone is not proof of availability.');
      evidence.push('Targeted TCP checks on 80 and 443 did not accept a connection.');
      const stimulatedNeighbor = await this.neighbor.lookup(ipAddress, { signal: options.signal });
      if (stimulatedNeighbor) return { availability: 'OCCUPIED' as const, evidence: [...evidence, `Neighbor stimulation resolved ${stimulatedNeighbor.macAddress}.`] };
      evidence.push('A second neighbor-table check after active stimulation remained empty.');
      return { availability: 'AVAILABLE' as const, evidence };
    } catch {
      return { availability: 'UNCERTAIN' as const, evidence: ['Availability checks could not establish sufficient confidence.'] };
    }
  }
}

const ipToNumber = (ip: string): number | null => {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
};
const numberToIp = (value: number) => [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join('.');

export function subnetMaskToPrefix(mask: string): number | null {
  if (!normalizeIPv4(mask)) return null;
  const number = ipToNumber(mask); if (number === null) return null;
  const binary = number.toString(2).padStart(32, '0');
  if (!/^1*0*$/.test(binary)) return null;
  const prefix = binary.indexOf('0');
  return prefix === -1 ? 32 : prefix;
}
export function prefixToSubnetMask(prefix: number): string {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return numberToIp(mask);
}

function snapshotFingerprint(snapshot: WindowsAdapterSnapshot): string {
  return JSON.stringify({ index: snapshot.interfaceIndex, status: snapshot.operationalStatus, dhcp: snapshot.dhcpEnabled, ips: [...snapshot.ipv4Addresses].sort((a, b) => a.address.localeCompare(b.address)), gateways: [...snapshot.defaultGateways].sort(), dnsAutomatic: snapshot.dnsAutomatic, dns: [...snapshot.dnsServers].sort() });
}

export class PairService {
  private session: PairSessionState | null = null;
  private recoveryInspecting=false;
  private invalidRecovery=false;
  private networkPreparing=false;
  private mutationPending=false;
  private preparationController: AbortController | null = null;
  constructor(
    private readonly adapters: WindowsNetworkAdapterService = new PowerShellWindowsNetworkAdapterService(),
    private readonly checker: CandidateAddressChecker = new ConservativeCandidateAddressChecker(),
    private readonly diagnostics = new DeviceDiagnosticEngine(),
    private readonly recovery: PairRecoveryStore = new JsonPairRecoveryStore(),
    private readonly database: SiteProjectDatabase = projectDb,
    private readonly verificationOptions: {windowMs?:number;settleMs?:number;neighbors?:NeighborProvider;changed?:(state:PairSessionState)=>void} = {},
  ) {}

  async initializeRecovery(): Promise<PairSessionState | null> {
    this.recoveryInspecting=true;
    try { return await this.inspectRecovery(); } finally { this.recoveryInspecting=false; }
  }

  private async inspectRecovery(): Promise<PairSessionState | null> {
    let recovered: unknown;
    try { recovered = await this.recovery.load(); }
    catch { return this.invalidRecoveryStatus(); }
    if (recovered === null) return this.getStatus();
    if (!validRecoverySession(recovered)) return this.invalidRecoveryStatus();
    this.session = { ...recovered, state:'ROLLBACK_REQUIRED', recoveryDisposition:'ATTENTION_REQUIRED', recoveryAvailable:true,
      message:'Recovery requires review. The current adapter configuration has not been verified.', updatedAt:new Date().toISOString() };
    try {
      const current = await this.currentRecoveryAdapter();
      if (sameAdapterConfiguration(recovered.originalAdapter,current)) {
        await this.recovery.clear();
        this.session = {...this.session,adapter:current,state:'RESTORED',recoveryAvailable:false,recoveryDisposition:'ALREADY_RESTORED',message:'Original configuration is already active. No adapter change was made.'};
      } else if (recovered.state==='PAIRED' && recovered.adapterConfigurationVerified===true && sameAdapterConfiguration(recovered.adapter,current) && current.operationalStatus.toLowerCase()==='up') {
        this.session = {...this.session,adapter:current,state:'PAIRED',recoveryDisposition:'HEALTHY_RETAINED',message:'Configuration previously applied by CCTV Network Assistant. Original configuration safely retained. Keep Current or Restore Original whenever ready.'};
      } else {
        this.session.message='The current configuration differs from the verified recovery state, or a previous mutation was interrupted. Review before explicitly restoring the original configuration.';
      }
    } catch (error) {
      this.session.message=error instanceof Error?error.message:'Adapter recovery inspection is unavailable.';
    }
    return this.getStatus();
  }

  private invalidRecoveryStatus(): PairSessionState {
    // Safe display-only status. Never overwrite the malformed recovery evidence with placeholders.
    this.invalidRecovery=true;
    const adapter:WindowsAdapterSnapshot={interfaceIndex:0,interfaceAlias:'Unverified adapter',mediaType:'OTHER',operationalStatus:'Unknown',eligible:false,dhcpEnabled:false,ipv4Addresses:[],defaultGateways:[],dnsAutomatic:false,dnsServers:[],capturedAt:''};
    this.session={id:'invalid-recovery',state:'ROLLBACK_REQUIRED',recoveryDisposition:'ATTENTION_REQUIRED',deviceId:'',cameraIp:'',cameraSubnetMask:'',adapter,originalAdapter:adapter,candidates:[],createdAt:'',updatedAt:new Date().toISOString(),recoveryAvailable:true,errorCode:'INVALID_RECOVERY',message:'Recovery data is unreadable or incomplete. Original evidence is preserved. Adapter changes are blocked until recovery data can be safely resolved.'};
    return this.getStatus()!;
  }

  private async currentRecoveryAdapter():Promise<WindowsAdapterSnapshot> {
    if(this.invalidRecovery||!validRecoverySession(this.session))throw new NetworkConfigurationError('Recovery data cannot safely identify the original physical adapter.','INVALID_RECOVERY');
    const matches=(await this.adapters.inspectAdapters()).filter(adapter=>samePhysicalAdapter(this.session!.originalAdapter,adapter));
    if(matches.length!==1)throw new NetworkConfigurationError('The original physical adapter is missing or cannot be uniquely identified. Recovery evidence is preserved.','ADAPTER_IDENTITY_MISMATCH');
    return matches[0];
  }

  keepCurrent():PairSessionState {
    if(this.getStatus()?.adapterMutationActive||this.session?.recoveryDisposition!=='HEALTHY_RETAINED')throw new NetworkConfigurationError('Only a verified retained configuration can be kept without review.','RECOVERY_REVIEW_REQUIRED');
    return this.getStatus()!;
  }

  getStatus(): PairSessionState | null {
    return this.session ? {...structuredClone(this.session),adapterMutationActive:(this.mutationPending&&this.session.state==='READY_FOR_CONFIRMATION')||['APPLYING','VERIFYING','RESTORING'].includes(this.session.state)} : null;
  }
  async getEligibleAdapters(signal?: AbortSignal) { return (await this.adapters.inspectAdapters(signal)).filter(adapter => adapter.eligible); }
  async getEligibility(deviceId: string): Promise<Device> {
    const device = this.database.getDeviceById(deviceId);
    if (!device) throw new NetworkConfigurationError('The selected device no longer exists.', 'DEVICE_NOT_FOUND');
    return applyNetworkRelationship(structuredClone(device), await this.adapters.inspectAdapters(), this.database.getDevices());
  }

  async prepare(deviceId: string, interfaceIndex: number): Promise<PairSessionState> {
    if(this.recoveryInspecting||this.networkPreparing||this.mutationPending)throw new NetworkConfigurationError('Another adapter operation is in progress.','PAIR_SESSION_ACTIVE');
    if (this.session && ['APPLYING', 'VERIFYING', 'PAIRED', 'RESTORING', 'ROLLBACK_REQUIRED'].includes(this.session.state)) throw new NetworkConfigurationError('Restore or resolve the active Pair session before starting another.', 'PAIR_SESSION_ACTIVE');
    const device = this.database.getDeviceById(deviceId);
    if (!device) throw new NetworkConfigurationError('The selected camera no longer exists.', 'DEVICE_NOT_FOUND');
    this.preparationController?.abort();
    this.preparationController = new AbortController();
    const adapters = await this.adapters.inspectAdapters(this.preparationController.signal);
    const adapter = adapters.find(item => item.interfaceIndex === interfaceIndex);
    if (!adapter?.eligible) throw new NetworkConfigurationError(adapter?.eligibilityReason || 'The selected adapter is unavailable.', 'ADAPTER_INELIGIBLE');
    const block = pairTargetBlock(device, adapters, this.database.getDevices());
    if (block) throw new NetworkConfigurationError(block, 'UNSAFE_TARGET');
    const knownMask = device.network.subnetMask && device.network.subnetMask !== 'Unknown' ? device.network.subnetMask : null;
    const prefix = knownMask ? subnetMaskToPrefix(knownMask) : adapter.ipv4Addresses[0]?.prefixLength;
    if (prefix === null || prefix === undefined || prefix < 1 || prefix > 30) throw new NetworkConfigurationError('The subnet mask is invalid or unsupported for Pair.', 'INVALID_SUBNET');
    const now = new Date().toISOString();
    this.session = { id: crypto.randomUUID(), state: 'CHECKING_ADDRESS', deviceId, cameraIp: device.network.ipAddress, cameraSubnetMask: prefixToSubnetMask(prefix), subnetSource: knownMask ? 'CAMERA_EVIDENCE' : 'ADAPTER_PREFIX_PROPOSAL', adapter, originalAdapter: structuredClone(adapter), candidates: [], createdAt: now, updatedAt: now, recoveryAvailable: false };
    const candidates = await this.findCandidates(device, prefix, adapters, this.preparationController.signal);
    if (this.preparationController.signal.aborted) throw new NetworkConfigurationError('Pair preparation was cancelled.', 'CANCELLED');
    if (!candidates.length) { this.session.state = 'FAILED'; this.session.errorCode = 'NO_CONFIDENT_CANDIDATE'; this.session.message = 'No candidate address passed the conservative availability checks.'; throw new NetworkConfigurationError(this.session.message, this.session.errorCode); }
    this.session.candidates = candidates;
    this.session.selectedCandidate = candidates[0];
    this.session.state = 'READY_FOR_CONFIRMATION';
    this.session.message = 'Review the complete before/after preview and explicitly confirm Pair.';
    this.session.updatedAt = new Date().toISOString();
    this.preparationController = null;
    this.audit('Pair preview prepared', { deviceId, interfaceIndex, proposedIp: candidates[0].ipAddress });
    return this.getStatus()!;
  }

  async prepareNetwork(input:NetworkMatchInput):Promise<PairSessionState> {
    if(this.recoveryInspecting||this.networkPreparing||this.mutationPending||(this.preparationController&&(!this.session||['PREPARING','CHECKING_ADDRESS'].includes(this.session.state))))throw new NetworkConfigurationError('Another adapter operation is in progress.','PAIR_SESSION_ACTIVE');
    if(this.session&&['CHECKING_ADDRESS','APPLYING','VERIFYING','PAIRED','RESTORING','ROLLBACK_REQUIRED'].includes(this.session.state))throw new NetworkConfigurationError('Restore or resolve the current adapter operation first.','PAIR_SESSION_ACTIVE');
    const error=networkMatchError(input);if(error)throw new NetworkConfigurationError(error,'INVALID_INPUT');
    this.networkPreparing=true;try {
    const adapters=await this.adapters.inspectAdapters();const adapter=adapters.find(a=>a.interfaceIndex===input.interfaceIndex&&a.eligible);
    if(!adapter)throw new NetworkConfigurationError('Select a current eligible adapter.','ADAPTER_INELIGIBLE');
    if([...adapters.flatMap(a=>a.ipv4Addresses.map(ip=>ip.address)),...this.database.getDevices().map(d=>d.network.ipAddress)].includes(input.ipAddress))throw new NetworkConfigurationError('That address is already assigned to a known device or local adapter.','CANDIDATE_CHANGED');
    const now=new Date().toISOString();
    this.session={id:crypto.randomUUID(),purpose:'NETWORK_MATCH',state:'CHECKING_ADDRESS',deviceId:'',cameraIp:'',cameraSubnetMask:prefixToSubnetMask(input.prefixLength),adapter,originalAdapter:structuredClone(adapter),temporaryGateway:input.gateway||undefined,candidates:[],createdAt:now,updatedAt:now,recoveryAvailable:false};
    try {
      const result=await this.checker.check(input.ipAddress);
      if(this.session.state!=='CHECKING_ADDRESS')throw new NetworkConfigurationError('Preview was cancelled.','CANCELLED');
      if(result.availability!=='AVAILABLE')throw new NetworkConfigurationError('The requested address is occupied or could not be checked confidently.','CANDIDATE_CHANGED');
      const candidate:PairCandidate={ipAddress:input.ipAddress,prefixLength:input.prefixLength,confidence:'AVAILABLE',evidence:result.evidence};
      this.session.candidates=[candidate];this.session.selectedCandidate=candidate;this.session.state='READY_FOR_CONFIRMATION';this.session.message='Review the preserved and temporary PC adapter settings, then explicitly confirm.';
      this.audit('NETWORK_MATCH_PREVIEWED',{interfaceIndex:input.interfaceIndex,temporaryIp:input.ipAddress});return this.getStatus()!;
    } catch(error){if(this.session.state!=='CANCELLED')this.session.state='FAILED';throw error;}
    }finally{this.networkPreparing=false;}
  }

  selectCandidate(ipAddress: string): PairSessionState {
    if (this.mutationPending || !this.session || this.session.state !== 'READY_FOR_CONFIRMATION') throw new NetworkConfigurationError('Pair is not ready for candidate selection.', 'NOT_READY');
    const candidate = this.session.candidates.find(item => item.ipAddress === ipAddress && item.confidence === 'AVAILABLE');
    if (!candidate) throw new NetworkConfigurationError('Select one of the verified Pair candidates.', 'INVALID_CANDIDATE');
    this.session.selectedCandidate = candidate; this.session.updatedAt = new Date().toISOString(); return this.getStatus()!;
  }

  async confirmAndApply(sessionId: string, confirmed: boolean): Promise<PairSessionState> {
    if (!confirmed) throw new NetworkConfigurationError('Explicit technician confirmation is required.', 'CONFIRMATION_REQUIRED');
    if (!this.session || this.session.id !== sessionId || this.session.state !== 'READY_FOR_CONFIRMATION' || !this.session.selectedCandidate) throw new NetworkConfigurationError('Pair preview is missing or no longer current.', 'NOT_READY');
    if(this.mutationPending)throw new NetworkConfigurationError('Another adapter operation is in progress.','PAIR_SESSION_ACTIVE');
    this.mutationPending=true;try {
    if (!(await this.adapters.isAdministrator())) throw new NetworkConfigurationError('Administrator privileges are required to change this Windows adapter.', 'ADMIN_REQUIRED');
    const adapters = await this.adapters.inspectAdapters();
    const current = adapters.find(item => item.interfaceIndex === this.session!.adapter.interfaceIndex);
    if (!current) throw new NetworkConfigurationError('The selected adapter no longer exists.', 'ADAPTER_NOT_FOUND');
    if (!samePhysicalAdapter(current,this.session.originalAdapter) || snapshotFingerprint(current) !== snapshotFingerprint(this.session.originalAdapter)) throw new NetworkConfigurationError('The adapter configuration changed after preview. Prepare Pair again.', 'BASELINE_CHANGED');
    const standalone=this.session.purpose==='NETWORK_MATCH';
    const target = this.database.getDeviceById(this.session.deviceId);
    if (!current.eligible || (!standalone&&(!target || target.network.ipAddress !== this.session.cameraIp || pairTargetBlock(target, adapters, this.database.getDevices())))) throw new NetworkConfigurationError('The Pair target or adapter is no longer safe. Prepare Pair again.', 'UNSAFE_TARGET');
    if ([...this.database.getDevices().map(device => device.network.ipAddress), ...adapters.flatMap(adapter => adapter.ipv4Addresses.map(address => address.address))].includes(this.session.selectedCandidate.ipAddress)) throw new NetworkConfigurationError('The proposed address is now assigned to a known device or local adapter.', 'CANDIDATE_CHANGED');
    const recheck = await this.checker.check(this.session.selectedCandidate.ipAddress);
    if (recheck.availability !== 'AVAILABLE') throw new NetworkConfigurationError('The proposed address is no longer confidently available.', 'CANDIDATE_CHANGED');

    if(!validRecoverySnapshot(this.session.originalAdapter))throw new NetworkConfigurationError('A complete original snapshot and physical adapter identity are required.','INVALID_RECOVERY');
    this.session.state = 'APPLYING'; this.session.technicianConfirmedAt = new Date().toISOString(); this.session.updatedAt = this.session.technicianConfirmedAt; this.session.recoveryAvailable = true;
    await this.recovery.save(this.session);
    this.audit(standalone?'NETWORK_MATCH_CONFIRMED':'Technician confirmed Pair', { deviceId: this.session.deviceId, interfaceIndex: current.interfaceIndex, temporaryIp: this.session.selectedCandidate.ipAddress });
    this.verificationOptions.changed?.(this.getStatus()!);
    try {
      const applied = await this.adapters.applyTemporary(current.interfaceIndex, this.session.selectedCandidate.ipAddress, this.session.selectedCandidate.prefixLength, this.session.temporaryGateway, current.interfaceGuid);
      this.session.state = 'VERIFYING';
      const verified = samePhysicalAdapter(this.session.originalAdapter,applied) && !applied.dhcpEnabled && (!standalone || (applied.defaultGateways.length===(this.session.temporaryGateway?1:0)&&(!this.session.temporaryGateway||applied.defaultGateways.includes(this.session.temporaryGateway)))) && applied.ipv4Addresses.some(item => item.address === this.session!.selectedCandidate!.ipAddress && item.prefixLength === this.session!.selectedCandidate!.prefixLength);
      this.session.adapterConfigurationVerified = verified;
      if (!verified) throw new NetworkConfigurationError('Windows did not report the intended temporary address after Pair.', 'APPLY_VERIFICATION_FAILED');
      this.session.adapter = applied;
      if(standalone){
        this.refreshNetworkMatch(applied);
        this.session.state='PAIRED';this.session.recoveryDisposition='HEALTHY_RETAINED';this.session.message='Temporary PC adapter configuration applied and verified. Choose Scan when ready; Restore remains available.';this.session.updatedAt=new Date().toISOString();
        await this.recovery.save(this.session);this.verificationOptions.changed?.(this.getStatus()!);this.audit('NETWORK_MATCH_VERIFIED',{interfaceIndex:applied.interfaceIndex,temporaryIp:this.session.selectedCandidate.ipAddress});return this.getStatus()!;
      }
      const device = structuredClone(this.database.getDeviceById(this.session.deviceId)!);
      applyNetworkRelationship(device, [applied], this.database.getDevices(), applied.interfaceIndex);
      device.reachability = { ...device.reachability, discoveryInterface: device.reachability?.relationshipAdapter };
      this.database.upsertDevice(device);
      this.verificationOptions.changed?.(this.getStatus()!);
      const verification = await verifyAfterPair(device, this.diagnostics, this.verificationOptions.windowMs, this.verificationOptions.settleMs);
      this.session.verification = verification.evidence;
      this.session.cameraReachabilityVerified = verification.evidence.cameraResponded;
      const enriched = verification.device;
      {
        const localAddress = applied.ipv4Addresses.find(ip=>ip.address===this.session!.selectedCandidate!.ipAddress)!.address;
        const details:Record<string,unknown> = { requestedIp:enriched.network.ipAddress,interfaceIndex:applied.interfaceIndex,adapterIPv4:localAddress,deviceId:enriched.id };
        try {
          const neighbor = await (this.verificationOptions.neighbors ?? new WindowsNeighborProvider()).lookup(enriched.network.ipAddress,{interfaceIndex:applied.interfaceIndex,localAddress});
          const mac = normalizeMacAddress(neighbor?.macAddress);
          const accepted = neighbor ? observeNeighbor(enriched,neighbor) : false;
          this.audit('Post-Pair neighbor enrichment',{...details,state:neighbor?.state,rawMac:neighbor?.macAddress,normalizedMac:mac,result:accepted?'NEIGHBOR_MATCHED':neighbor?'NEIGHBOR_OBSERVED_NOT_PROMOTED':'NEIGHBOR_NOT_FOUND',mergedDeviceId:accepted?enriched.id:undefined});
        } catch { this.audit('Post-Pair neighbor enrichment',{...details,result:'NEIGHBOR_LOOKUP_UNAVAILABLE'}); }
      }
      this.database.upsertDevice(enriched);
      this.session.state = 'PAIRED'; this.session.recoveryDisposition='HEALTHY_RETAINED';
      this.session.message = this.session.cameraReachabilityVerified ? 'Adapter Pair succeeded and the camera responded.' : 'Adapter Pair succeeded, but camera communication remains unverified. Restore remains available.';
      this.session.updatedAt = new Date().toISOString();
      await this.recovery.save(this.session);
      this.audit('Pair applied', { deviceId: device.id, interfaceIndex: applied.interfaceIndex, cameraVerified: this.session.cameraReachabilityVerified });
      return this.getStatus()!;
    } catch (error) {
      if(standalone)this.audit('NETWORK_MATCH_FAILED',{interfaceIndex:current.interfaceIndex});
      this.session.state = 'ROLLBACK_REQUIRED'; this.session.recoveryDisposition='ATTENTION_REQUIRED'; this.session.message = error instanceof Error ? error.message : 'Pair failed after network modification began.'; this.session.errorCode = error instanceof NetworkConfigurationError ? error.code : 'PAIR_FAILED'; this.session.updatedAt = new Date().toISOString();
      await this.recovery.save(this.session); throw error;
    }
    }finally{this.mutationPending=false;}
  }

  async restore(): Promise<PairSessionState> {
    if (!this.session?.recoveryAvailable) throw new NetworkConfigurationError('No original adapter snapshot is available to restore.', 'NO_RECOVERY');
    if (this.mutationPending || ['APPLYING','VERIFYING','RESTORING'].includes(this.session.state)) throw new NetworkConfigurationError('Wait for the current Pair operation to finish before Restore.', 'PAIR_OPERATION_ACTIVE');
    this.mutationPending=true;
    try {
      this.session.state='RESTORING';
      const current = await this.currentRecoveryAdapter();
      if(this.session.purpose==='NETWORK_MATCH')this.audit('NETWORK_MATCH_RESTORE_STARTED',{interfaceIndex:this.session.adapter.interfaceIndex});
      this.session.updatedAt = new Date().toISOString();
      this.verificationOptions.changed?.(this.getStatus()!);
      const restored = sameAdapterConfiguration(this.session.originalAdapter,current) ? current : await this.adapters.restore({...this.session.originalAdapter,interfaceIndex:current.interfaceIndex});
      const ok = this.verifyRestoration(this.session.originalAdapter, restored);
      if (!ok) throw new NetworkConfigurationError('Windows did not report the complete original adapter configuration after restore.', 'RESTORE_VERIFICATION_FAILED');
      await this.recovery.clear();
      this.session.adapter = restored;
      this.session.state = 'RESTORED'; this.session.recoveryDisposition='ALREADY_RESTORED'; this.session.recoveryAvailable = false; this.session.message = 'Original network configuration restored and verified.'; this.session.updatedAt = new Date().toISOString();
      if(this.session.purpose==='NETWORK_MATCH'){this.refreshNetworkMatch(restored);this.audit('NETWORK_MATCH_RESTORED',{interfaceIndex:restored.interfaceIndex});}
      const device = this.database.getDeviceById(this.session.deviceId);
      if (device) { applyNetworkRelationship(device, [restored], this.database.getDevices(), restored.interfaceIndex);device.reachability={...device.reachability,discoveryInterface:device.reachability?.relationshipAdapter};this.database.upsertDevice(device); }
      this.verificationOptions.changed?.(this.getStatus()!);
      this.audit('Original adapter configuration restored', { interfaceIndex: restored.interfaceIndex }); return this.getStatus()!;
    } catch (error) {
      this.session.state = 'ROLLBACK_REQUIRED'; this.session.recoveryDisposition='ATTENTION_REQUIRED'; this.session.errorCode = error instanceof NetworkConfigurationError ? error.code : 'RESTORE_FAILED'; this.session.message = error instanceof Error ? error.message : 'Restore failed.'; this.session.updatedAt = new Date().toISOString(); if(!this.invalidRecovery)await this.recovery.save(this.session); throw error;
    } finally { this.mutationPending=false; }
  }

  cancelPreparation(): PairSessionState | null {
    if(this.mutationPending)return this.getStatus();
    this.preparationController?.abort(); this.preparationController = null;
    if (this.session && ['PREPARING', 'CHECKING_ADDRESS', 'READY_FOR_CONFIRMATION'].includes(this.session.state)) { this.session.state = 'CANCELLED'; this.session.message = 'Pair preparation cancelled; no adapter change was made.'; this.session.updatedAt = new Date().toISOString(); }
    return this.getStatus();
  }

  private refreshNetworkMatch(adapter:WindowsAdapterSnapshot) {
    for(const device of this.database.getDevices()) {
      const index=device.reachability?.relationshipAdapter?.interfaceIndex ?? device.reachability?.discoveryInterface?.interfaceIndex;
      if(index!==undefined&&index!==adapter.interfaceIndex)continue;
      applyNetworkRelationship(device,[adapter],this.database.getDevices(),adapter.interfaceIndex);
      device.reachability={...device.reachability,discoveryInterface:device.reachability?.relationshipAdapter};this.database.upsertDevice(device);
    }
  }

  private async findCandidates(device: Device, prefix: number, adapters: WindowsAdapterSnapshot[], signal: AbortSignal): Promise<PairCandidate[]> {
    const camera = ipToNumber(device.network.ipAddress)!;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const network = (camera & mask) >>> 0, broadcast = (network | (~mask >>> 0)) >>> 0;
    const hostCount = broadcast - network - 1;
    const excluded = new Set([device.network.ipAddress, ...this.database.getDevices().map(item => item.network.ipAddress), ...adapters.flatMap(item => item.ipv4Addresses.map(ip => ip.address))]);
    const candidates: PairCandidate[] = [];
    const attempts = Math.min(32, hostCount);
    for (let attempt = 1; attempt <= attempts && candidates.length < 3; attempt++) {
      if (signal.aborted) throw new NetworkConfigurationError('Pair preparation was cancelled.', 'CANCELLED');
      const hostOffset = ((camera - network + attempt * 37 - 1) % hostCount) + 1;
      const candidateIp = numberToIp((network + hostOffset) >>> 0);
      if (excluded.has(candidateIp) || candidateIp === numberToIp(network) || candidateIp === numberToIp(broadcast)) continue;
      const result = await this.checker.check(candidateIp, { signal });
      if (result.availability === 'AVAILABLE') candidates.push({ ipAddress: candidateIp, prefixLength: prefix, confidence: 'AVAILABLE', evidence: result.evidence });
    }
    return candidates;
  }

  private verifyRestoration(expected: WindowsAdapterSnapshot, actual: WindowsAdapterSnapshot): boolean {
    return sameAdapterConfiguration(expected, actual);
  }

  private audit(message: string, details: Record<string, unknown>) { appStateDb.logAudit({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), category: 'SYSTEM', level: 'INFO', message, details }); }
}
