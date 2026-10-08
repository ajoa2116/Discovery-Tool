import { performance } from 'node:perf_hooks';

/** Elapsed time limits lifetime; wall time can only shorten an absolute grant. */
export class CompanionDeadline {
  #end: number;
  #last: number;
  #expired = false;
  constructor(duration: number, private readonly elapsed: () => number = () => performance.now(),
    private readonly expiresAt?: number, private readonly wall: () => number = Date.now) {
    this.#last = elapsed();
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(this.#last) || (expiresAt !== undefined && !Number.isFinite(expiresAt))) throw new Error('Companion deadline unavailable.');
    this.#end = this.#last + duration;
  }
  remaining(): number {
    if (this.#expired) return 0;
    let now: number, wall: number;
    try { now = this.elapsed(); wall = this.expiresAt === undefined ? 0 : this.wall(); }
    catch { this.#expired = true; throw new Error('Companion deadline unavailable.'); }
    if (!Number.isFinite(now) || now < this.#last || !Number.isFinite(wall)) { this.#expired = true; throw new Error('Companion deadline unavailable.'); }
    this.#last = now;
    const remaining = Math.min(this.#end - now, this.expiresAt === undefined ? Infinity : this.expiresAt - wall);
    if (remaining <= 0) { this.#expired = true; return 0; }
    return remaining;
  }
}
