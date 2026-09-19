import { sameIdentity, canonicalAnchor, mergeAnchors, hasIdentity } from '../../shared/identity_policy.ts';
import { Device, ReverificationResult } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';
import { projectDb, ProjectValidationError, SiteProjectDatabase } from '../storage/project_db.ts';
import { LocalHostIdentity } from '../network/local_host_identity.ts';

const persistedAnchor = (device: Device) => JSON.stringify({ mac: device.anchor.macAddress, uuid: device.anchor.onvifEndpointUuid, serial: device.anchor.serialNumber, vendor: device.anchor.vendor, model: device.anchor.model, firmware: device.anchor.firmwareVersion });

export interface ReverificationPlan extends ReverificationResult { projectDevices: Device[]; persistentChanged: boolean; }

export class ProjectReverificationEngine {
  public static plan(knownProjectDevices: Device[], liveDiscoveredDevices: Device[], localHost = LocalHostIdentity.fromAddresses([])): ReverificationPlan {
    const known = structuredClone(knownProjectDevices).map(d=>({...d,anchor:canonicalAnchor(d.anchor)}));
    const live = structuredClone(liveDiscoveredDevices).map(d=>({...d,anchor:canonicalAnchor(d.anchor)})).filter(device => localHost.isRemoteDevice(device));
    const matchedLiveIds = new Set<string>();
    const verifiedDevices: Device[] = [], notVerifiedDevices: Device[] = [];
    const possibleReplacements: ReverificationResult['possibleReplacements'] = [];
    let changedIpCount = 0, persistentChanged = false;
    for (const saved of known) {
      const matches = live.filter(found => sameIdentity(saved, found));
      const found = matches.length === 1 && known.filter(other=>sameIdentity(other,matches[0])).length === 1 ? matches[0] : undefined;
      if (found) {
        matchedLiveIds.add(found.id);
        const previousIp = saved.network.ipAddress;
        if (found.network.ipAddress !== previousIp) { changedIpCount++; persistentChanged = true; }
        const mergedAnchor = mergeAnchors(saved.anchor, found.anchor);
        if (persistedAnchor(saved) !== persistedAnchor({ ...saved, anchor: mergedAnchor })) persistentChanged = true;
        saved.network = { ...saved.network, ...found.network, ipAddressHistory: Array.from(new Set([...(saved.network.ipAddressHistory || [previousIp]), previousIp, found.network.ipAddress])) };
        saved.anchor = mergedAnchor; saved.reachability = found.reachability;
        saved.status = found.reachability?.subnetClassification === 'DIFFERENT_SUBNET' ? 'DIFFERENT_SUBNET' : found.status;
        saved.statusMessage = found.statusMessage; saved.lastSeenAt = found.lastSeenAt; saved.sessionVerification = 'VERIFIED';
        verifiedDevices.push(saved);
      } else {
        saved.sessionVerification = 'NOT_FOUND'; saved.status = 'UNKNOWN'; saved.statusMessage = 'Not verified during the latest Project reverification.'; delete saved.reachability;
        notVerifiedDevices.push(saved);
        const atSavedIp = live.filter(candidate => candidate.network.ipAddress === saved.network.ipAddress && !sameIdentity(saved, candidate));
        if (hasIdentity(saved) && atSavedIp.length === 1 && hasIdentity(atSavedIp[0])) {
          const candidate = atSavedIp[0];
          possibleReplacements.push({ candidateId: crypto.randomUUID(), originalDeviceId: saved.id, expectedName: saved.technician?.name || saved.anchor.model || saved.anchor.vendor, expectedMac: saved.anchor.macAddress, expectedIp: saved.network.ipAddress, expectedSerial: saved.anchor.serialNumber, expectedVendor: saved.anchor.vendor, expectedModel: saved.anchor.model, foundMac: candidate.anchor.macAddress, foundIp: candidate.network.ipAddress, foundSerial: candidate.anchor.serialNumber, foundVendor: candidate.anchor.vendor, model: candidate.anchor.model || candidate.anchor.vendor, evidence: ['Different stable physical identity discovered at the saved Project address.'], decision: 'PENDING' });
        }
      }
    }
    const newDevices = live.filter(device => !matchedLiveIds.has(device.id));
    const collisionIps = new Set(live.filter(device => live.some(other => other.id !== device.id && other.network.ipAddress === device.network.ipAddress)).map(device => device.network.ipAddress));
    return { totalKnown: known.length, recognizedCount: verifiedDevices.length, changedIpCount, newDevicesCount: newDevices.length, notVerifiedCount: notVerifiedDevices.length, collisionCount: collisionIps.size, verifiedDevices, notVerifiedDevices, newDevices, possibleReplacements, projectDevices: known, persistentChanged };
  }

  public static reverifyProject(known: Device[], live: Device[]): ReverificationResult {
    const plan = this.plan(known, live); plan.projectDevices.forEach((device, index) => Object.assign(known[index], device)); return this.toResult(plan);
  }
  public static reverifyActiveProject(live: Device[]): ReverificationResult {
    const session = projectDb.getSession(); if (session.mode !== 'PROJECT') throw new ProjectValidationError('Open or create a Project before reverifying.');
    const plan = this.plan(projectDb.getProjectMemberDevices(), live); projectDb.applyReverification(plan.projectDevices, plan.newDevices || [], plan.persistentChanged, session.dirty); return this.toResult(plan);
  }
  public static toResult(plan: ReverificationPlan): ReverificationResult { const { projectDevices: _devices, persistentChanged: _changed, ...result } = plan; return result; }
}

export type ReverificationDiscovery = (database: SiteProjectDatabase) => Promise<'COMPLETED'|'CANCELLED'|'BUSY'>;
export class ProjectReverificationWorkflow {
  private running = false;
  private candidates = new Map<string, { originalDeviceId: string; replacement: Device }>();
  constructor(private db: SiteProjectDatabase, private discover: ReverificationDiscovery, private cancelDiscovery: () => boolean = () => false, private localHost = LocalHostIdentity.fromAddresses([])) {}
  public isRunning(): boolean { return this.running; }
  public cancel(): boolean { return this.running && this.cancelDiscovery(); }
  public async run(): Promise<ReverificationResult> {
    if (this.running) throw new ProjectValidationError('Project reverification is already running.');
    const session = this.db.getSession(); if (session.mode !== 'PROJECT') throw new ProjectValidationError('Open or create a Project before reverifying.');
    const baseline = structuredClone(this.db.getProjectMemberDevices()), staging = new SiteProjectDatabase(); staging.startQuickWork(); this.running = true; this.candidates.clear();
    try {
      const outcome = await this.discover(staging);
      if (outcome === 'BUSY') throw new ProjectValidationError('Project reverification could not start because discovery is already running.');
      if (outcome === 'CANCELLED') throw new ProjectValidationError('Project reverification was cancelled.');
      const plan = ProjectReverificationEngine.plan(baseline, staging.getDevices(), this.localHost);
      for (const candidate of plan.possibleReplacements) {
        // The plan already established exactly one different identity at this address.
        // This locates the technician-review candidate; it does not authorize an identity merge.
        const candidates = plan.newDevices?.filter(device => device.network.ipAddress === candidate.foundIp) || [];
        const replacement = candidates.length === 1 ? candidates[0] : undefined;
        if (candidate.candidateId && candidate.originalDeviceId && replacement) this.candidates.set(candidate.candidateId, { originalDeviceId: candidate.originalDeviceId, replacement });
      }
      this.db.applyReverification(plan.projectDevices, plan.newDevices || [], plan.persistentChanged, session.dirty);
      const result = ProjectReverificationEngine.toResult(plan);
      const baselineById = new Map(baseline.map(device=>[device.id,device]));
      for (const device of result.verifiedDevices || []) {
        const previous = baselineById.get(device.id);
        if (previous && previous.network.ipAddress !== device.network.ipAddress) this.db.appendHistory({type:'IP_ADDRESS_CHANGED',title:'IP Address Changed',summary:`IP changed from ${previous.network.ipAddress} to ${device.network.ipAddress} during Project Reverify.`,deviceId:device.id,source:'PROJECT_REVERIFY',details:{previousIp:previous.network.ipAddress,currentIp:device.network.ipAddress}});
        const different = device.reachability?.subnetClassification === 'DIFFERENT_SUBNET';
        this.db.appendHistory({type:different?'DIFFERENT_NETWORK':'IDENTITY_VERIFIED',title:different?'Different Network':'Identity Verified',summary:different?'Stable identity was verified on a different network.':'Stable device identity was verified during Project Reverify.',deviceId:device.id,source:'PROJECT_REVERIFY',result:'SUCCESS'});
      }
      for (const device of result.notVerifiedDevices || []) this.db.appendHistory({type:'NOT_VERIFIED',title:'Not Verified',summary:'Device was not verified during the latest Project Reverify.',deviceId:device.id,source:'PROJECT_REVERIFY',result:'UNKNOWN',level:'WARNING'});
      for (const candidate of result.possibleReplacements) this.db.appendHistory({type:'REPLACEMENT_CANDIDATE',title:'Replacement Candidate',summary:'A different stable identity was found at the saved Project address.',deviceId:candidate.originalDeviceId,source:'PROJECT_REVERIFY',level:'WARNING',details:{candidateId:candidate.candidateId,expected:{macAddress:candidate.expectedMac,serialNumber:candidate.expectedSerial,ipAddress:candidate.expectedIp},found:{macAddress:candidate.foundMac,serialNumber:candidate.foundSerial,ipAddress:candidate.foundIp}}});
      this.db.appendHistory({type:'REVERIFY_COMPLETED',title:'Project Reverify Completed',summary:`${result.recognizedCount} verified, ${result.notVerifiedCount} not verified, ${result.newDevicesCount} new device(s), ${result.possibleReplacements.length} replacement candidate(s).`,source:'PROJECT_REVERIFY',result:'SUCCESS',details:{recognizedCount:result.recognizedCount,notVerifiedCount:result.notVerifiedCount,newDevicesCount:result.newDevicesCount,changedIpCount:result.changedIpCount,replacementCandidateCount:result.possibleReplacements.length}});
      appStateDb.logAudit({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), category: 'EDGE_CASE', level: result.possibleReplacements.length ? 'WARNING' : 'INFO', message: `Project reverification completed: ${result.recognizedCount} verified, ${result.notVerifiedCount} not verified, ${result.newDevicesCount} new, ${result.possibleReplacements.length} replacement candidate(s).` });
      return result;
    } catch (error) {
      if (error instanceof ProjectValidationError) throw error;
      throw new ProjectValidationError('Project reverification could not complete because discovery stopped unexpectedly.');
    } finally { this.running = false; }
  }
  public decide(candidateId: string, decision: 'CONFIRMED'|'REJECTED'|'DEFERRED'): { device?: Device } {
    const candidate = this.candidates.get(candidateId); if (!candidate) throw new ProjectValidationError('This replacement candidate is no longer available. Run Reverify again.');
    const device = decision === 'CONFIRMED' ? this.db.confirmProjectReplacement(candidate.originalDeviceId, candidate.replacement) : undefined;
    if (decision === 'REJECTED') this.db.appendHistory({type:'REPLACEMENT_REJECTED',title:'Kept Original Device',summary:'Technician reviewed the candidate and kept the original Project identity.',deviceId:candidate.originalDeviceId,source:'PROJECT_REVERIFY'});
    if (decision === 'DEFERRED') this.db.appendHistory({type:'REPLACEMENT_DEFERRED',title:'Replacement Decision Deferred',summary:'Technician chose to decide on this replacement candidate later.',deviceId:candidate.originalDeviceId,source:'PROJECT_REVERIFY'});
    if (decision !== 'DEFERRED') this.candidates.delete(candidateId); return { device };
  }
}
