export const DEFAULT_MONITORING_INTERVAL_MS = 30_000;

export interface IncrementalDiscoveryStatus {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastRunAt?: string;
  nextRunAt?: string;
  lastSkippedAt?: string;
  lastSkipReason?: string;
  lastError?: string;
}

export interface IncrementalDiscoveryDependencies {
  runCycle: () => Promise<unknown>;
  canRun: () => { allowed: boolean; reason?: string };
  cancelCycle?: () => void;
  now?: () => Date;
  setTimer?: (callback: () => void, intervalMs: number) => ReturnType<typeof setInterval>;
  clearTimer?: (timer: ReturnType<typeof setInterval>) => void;
  log?: (event: 'STARTED' | 'STOPPED' | 'CYCLE_STARTED' | 'CYCLE_COMPLETED' | 'CYCLE_SKIPPED' | 'CYCLE_FAILED', message: string) => void;
}

const safeMonitoringError = () => 'Incremental discovery could not complete. Monitoring will retry at the next scheduled interval.';

export class IncrementalDiscoveryMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private activeCycle: Promise<'COMPLETED' | 'FAILED'> | null = null;
  private lastRunAt?: string;
  private nextRunAt?: string;
  private lastSkippedAt?: string;
  private lastSkipReason?: string;
  private lastError?: string;

  constructor(private readonly dependencies: IncrementalDiscoveryDependencies, public intervalMs = DEFAULT_MONITORING_INTERVAL_MS) {}

  public start(): void {
    if (this.timer) return;
    const setTimer = this.dependencies.setTimer ?? setInterval;
    this.timer = setTimer(() => { if (this.timer) void this.runNow(); }, this.intervalMs);
    this.timer.unref?.();
    this.nextRunAt = this.at(this.intervalMs);
    this.dependencies.log?.('STARTED', `Incremental discovery monitoring started with a ${this.intervalMs} ms interval.`);
  }

  public stop(): void {
    if (this.timer) (this.dependencies.clearTimer ?? clearInterval)(this.timer);
    this.timer = null;
    this.nextRunAt = undefined;
    if (this.running) this.dependencies.cancelCycle?.();
    this.dependencies.log?.('STOPPED', 'Incremental discovery monitoring stopped.');
  }

  public setIntervalMs(intervalMs: number): void {
    if (intervalMs === this.intervalMs) return;
    const enabled = Boolean(this.timer);
    if (this.timer) (this.dependencies.clearTimer ?? clearInterval)(this.timer);
    this.timer = null;
    this.nextRunAt = undefined;
    this.intervalMs = intervalMs;
    if (enabled) this.start();
  }

  public async runNow(): Promise<'COMPLETED' | 'SKIPPED' | 'FAILED'> {
    if (this.running) return this.skip('An incremental discovery cycle is already running.');
    const coordination = this.dependencies.canRun();
    if (!coordination.allowed) return this.skip(coordination.reason || 'An active technician operation has priority.');
    this.running = true;
    this.lastError = undefined;
    this.dependencies.log?.('CYCLE_STARTED', 'Incremental discovery cycle started.');
    this.activeCycle = this.executeCycle();
    return this.activeCycle;
  }

  public async yieldToTechnician(): Promise<void> {
    if (!this.activeCycle) return;
    this.dependencies.cancelCycle?.();
    await this.activeCycle;
  }

  private async executeCycle(): Promise<'COMPLETED' | 'FAILED'> {
    try {
      await this.dependencies.runCycle();
      this.lastRunAt = this.dependencies.now?.().toISOString() ?? new Date().toISOString();
      this.dependencies.log?.('CYCLE_COMPLETED', 'Incremental discovery cycle completed.');
      return 'COMPLETED';
    } catch {
      this.lastRunAt = this.dependencies.now?.().toISOString() ?? new Date().toISOString();
      this.lastError = safeMonitoringError();
      this.dependencies.log?.('CYCLE_FAILED', this.lastError);
      return 'FAILED';
    } finally {
      this.running = false;
      this.activeCycle = null;
      if (this.timer) this.nextRunAt = this.at(this.intervalMs);
    }
  }

  public getState(): IncrementalDiscoveryStatus {
    return { enabled: Boolean(this.timer), running: this.running, intervalMs: this.intervalMs, lastRunAt: this.lastRunAt, nextRunAt: this.nextRunAt, lastSkippedAt: this.lastSkippedAt, lastSkipReason: this.lastSkipReason, lastError: this.lastError };
  }

  private skip(reason: string): 'SKIPPED' {
    this.lastSkippedAt = this.dependencies.now?.().toISOString() ?? new Date().toISOString();
    this.lastSkipReason = reason;
    this.dependencies.log?.('CYCLE_SKIPPED', reason);
    return 'SKIPPED';
  }

  private at(offsetMs: number): string {
    const now = this.dependencies.now?.().getTime() ?? Date.now();
    return new Date(now + offsetMs).toISOString();
  }
}
