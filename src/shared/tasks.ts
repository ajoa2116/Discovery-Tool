export type TaskState = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'NEEDS_ATTENTION';
export const TASK_TITLES = {
  SCAN: 'Quick Scan', ADVANCED: 'Advanced Scan', REVERIFY: 'Project Reverify',
  PAIR: 'Pair PC to Camera Network', MATCH: 'Match Network', RESTORE: 'Restore Original Network',
  BULK_REIP: 'Bulk Re-IP', BULK_CONFIGURE: 'Bulk Configure', REPORT: 'Generate Report',
  DIAGNOSTICS: 'Diagnostics', PROJECT: 'Project Operation', CAMERA: 'Camera Configuration',
} as const;
export type TaskKind = keyof typeof TASK_TITLES;
export interface TechnicianTask {
  id: string; correlationId: string; kind: TaskKind; title: string; state: TaskState;
  startedAt: string; updatedAt: string; endedAt?: string;
  phase: string; progress?: { completed: number; total: number }; reference?: string;
  target?: string;
  diagnosticDevices?: Array<{deviceId:string;state:'RUNNING'|'COMPLETED'|'FAILED'|'CANCELLED'}>;
  cancellable: boolean; cancellationRequested?: boolean;
  result?: 'PROJECT_HISTORY' | 'REPORTS' | 'NETWORK_RECOVERY';
}
export interface TaskSnapshot { tasks: TechnicianTask[]; active: number; attention: number }
export const taskActive = (task: TechnicianTask) => task.state === 'QUEUED' || task.state === 'RUNNING';
