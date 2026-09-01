export type BulkBatchState = 'PLANNING'|'VALIDATING'|'READY'|'CONFIRMED'|'EXECUTING'|'VERIFYING'|'COMPLETED'|'PARTIAL_FAILURE'|'FAILED'|'CANCELLED';
export type BulkDeviceState = 'PENDING'|'APPLYING'|'WAITING_FOR_DEVICE'|'VERIFYING'|'VERIFIED'|'FAILED'|'NEEDS_ATTENTION'|'SKIPPED';
export interface BulkNetworkPlanRequest { deviceIds:string[];startIp:string;prefixLength:number;gateway?:string;dhcp?:boolean;manualTargets?:Record<string,string> }
export interface BulkNetworkPlanItem { deviceId:string;name:string;currentIp:string;currentPrefix?:number;currentGateway?:string;targetIp:string;targetPrefix:number;targetGateway?:string;dhcp:boolean;credentialId?:string;credentialLabel?:string;eligibility:'ELIGIBLE'|'BLOCKED';validation:'READY'|'BLOCKED';errors:string[];order:number;state:BulkDeviceState;resultMessage?:string;verified?:boolean }
export interface BulkNetworkPlan { batchId:string;state:BulkBatchState;items:BulkNetworkPlanItem[];totalSelected:number;eligibleCount:number;blockedCount:number;readyCount:number;estimatedOperationCount:number;confirmedAt?:string;startedAt?:string;completedAt?:string;cancellationRequested?:boolean }
export type BulkReIpPlanItem = BulkNetworkPlanItem;
