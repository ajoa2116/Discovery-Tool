import type {PairCandidate} from '../types/index.ts';
export interface MatchCandidatePreview {
  deviceId:string; deviceName:string; targetIp:string; network?:string; prefixLength?:number;
  adapter?:{interfaceIndex:number;name:string}; candidates:PairCandidate[];
  state:'READY'|'BLOCKED'; message:string; examined:number;
}
