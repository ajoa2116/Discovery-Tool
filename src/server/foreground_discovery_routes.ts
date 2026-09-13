import { Router, Response } from 'express';
import { ForegroundDiscovery } from '../core/engine/foreground_discovery.ts';
import { DiscoveryContext } from '../shared/discovery_session.ts';
import type { AdvancedScanService } from '../core/engine/advanced_scan.ts';
type Prepared = Awaited<ReturnType<AdvancedScanService['prepare']>>;
interface Dependencies {
  foreground: ForegroundDiscovery;
  yieldMonitoring: () => Promise<void>;
  busy: () => boolean;
  quick: (context: DiscoveryContext, signal: AbortSignal) => Promise<unknown>;
  prepare: (input: any, timing: { startedAt: number; monitorYieldMs: number }) => Promise<Prepared>;
  advanced: (prepared: Prepared, context: DiscoveryContext, signal: AbortSignal) => Promise<unknown>;
  monitoring: () => unknown;
  details: () => object;
  error: (res: Response, error: unknown, status: number, operation: string) => unknown;
  failed: (error: unknown, context: DiscoveryContext) => void;
}
export function createForegroundDiscoveryRouter(d: Dependencies) {
  const router = Router();
  const start = (origin: 'MANUAL' | 'ADVANCED') => async (req: any, res: Response) => {
    if (d.foreground.isActive() || d.busy()) return res.status(409).json({ error: 'A technician discovery operation is already running.' });
    const { context, signal } = d.foreground.begin(origin);
    const startedAt = Date.now();
    try {
      // Reservation prevents a new monitoring tick throughout handoff and preparation.
      await d.yieldMonitoring();
      if (signal.aborted) throw Error('Discovery preparation was cancelled.');
      let prepared: Prepared | undefined;
      if (origin === 'ADVANCED') {
        prepared = await d.prepare(req.body, { startedAt, monitorYieldMs: Date.now() - startedAt });
        if (!prepared.plan.valid) { d.foreground.finish(context.sessionId, 'FAILED'); return res.status(400).json(prepared.plan); }
      }
      if (signal.aborted) throw Error('Discovery preparation was cancelled.');
      d.foreground.scanning(context.sessionId);
      res.status(202).json({ ...(prepared ? { plan: prepared.plan } : {}), foreground: d.foreground.getState(), message: 'Foreground discovery started.' });
      void (async () => {
        try {
          if (prepared) await d.advanced(prepared, context, signal);
          else await d.quick(context, signal);
          d.foreground.finish(context.sessionId, signal.aborted ? 'CANCELLED' : 'COMPLETED');
        } catch (error) { d.foreground.finish(context.sessionId, 'FAILED'); d.failed(error, context); }
      })();
    } catch (error) {
      d.foreground.finish(context.sessionId, 'FAILED');
      d.error(res, error, signal.aborted ? 409 : (error as {code?:string})?.code === 'INVALID_PLAN' ? 400 : 500, origin === 'ADVANCED' ? 'ADVANCED_SCAN_START' : 'QUICK_SCAN');
    }
  };
  router.post('/start', start('MANUAL'));
  router.post('/advanced/start', start('ADVANCED'));
  router.post('/stop', (req, res) => {
    const stopped = d.foreground.stop(req.body?.sessionId);
    res.status(stopped ? 202 : 409).json({ stopped, foreground: d.foreground.getState(), message: stopped ? 'This foreground session is stopping.' : 'That foreground session is no longer active.' });
  });
  router.get('/status', (_req, res) => res.json({ ...d.details(), running: d.foreground.isActive(), foreground: d.foreground.getState(), monitoring: d.monitoring() }));
  return router;
}
