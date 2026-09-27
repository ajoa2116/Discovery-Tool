import type {PairCandidate,DevicePhysicalAnchor,WindowsAdapterSnapshot} from '../types/index.ts';
export interface MatchCandidatePreview {
  previewId?:string; currentAdapter?:WindowsAdapterSnapshot;
  deviceId:string; deviceName:string; targetIp:string; network?:string; prefixLength?:number;
  adapter?:{interfaceIndex:number;name:string}; candidates:PairCandidate[];
  state:'READY'|'BLOCKED'; message:string; examined:number;
}

export interface MatchApplyPlan {preview:MatchCandidatePreview;adapter:WindowsAdapterSnapshot;anchor:DevicePhysicalAnchor;createdAt:number;}
