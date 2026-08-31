/** Browser-safe data contract shared by the API client and backend engine. */
export interface BulkReIpPlanItem {
  macAddress: string;
  currentIp: string;
  targetIp: string;
  subnetMask: string;
  gateway: string;
  isConflict: boolean;
}
