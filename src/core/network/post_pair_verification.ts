import { Device, PairVerificationEvidence } from '../../types/index.ts';
import { DeviceDiagnosticEngine } from '../engine/diagnostic_engine.ts';

/** Fresh checks only; a late diagnostic result can never mutate the live inventory. */
export async function verifyAfterPair(device: Device, diagnostics: DeviceDiagnosticEngine, windowMs = 8000, settleMs = 400) {
  const started = Date.now(), controller = new AbortController();
  const evidence: PairVerificationEvidence = { startedAt: new Date().toISOString(), elapsedMs: 0, cameraResponded: false, attempts: [] };
  const timer = setTimeout(() => controller.abort(), windowMs);
  let latest = structuredClone(device);
  const pause = async () => { await new Promise<void>(resolve => { const t = setTimeout(done, Math.min(settleMs, Math.max(0, windowMs-(Date.now()-started)))); function done(){clearTimeout(t);controller.signal.removeEventListener('abort',done);resolve();} controller.signal.addEventListener('abort',done,{once:true});if(controller.signal.aborted)done(); }); };
  try {
    await pause();
    while (!controller.signal.aborted && evidence.attempts.length < 20) {
      const candidate = structuredClone(latest), oldChecks = new Set(candidate.diagnostics?.checks || []);
      const attempt: PairVerificationEvidence['attempts'][number] = { attempt: evidence.attempts.length+1, checks: [] };
      evidence.attempts.push(attempt);
      let abort!: () => void;
      try {
        await Promise.race([
          diagnostics.diagnose(candidate,{isRefresh:true,signal:controller.signal}),
          new Promise<never>((_,reject)=>{abort=()=>reject(Error('DEADLINE'));controller.signal.addEventListener('abort',abort,{once:true});if(controller.signal.aborted)abort();}),
        ]);
        if (controller.signal.aborted) break;
        attempt.checks = (candidate.diagnostics?.checks || []).filter(check=>!oldChecks.has(check)).slice(-10);
        latest = candidate;
        const positive = attempt.checks.find(check=>check.targetIp===device.network.ipAddress && check.success && !check.ambiguousIdentity && check.type !== 'ONVIF_WS_DISCOVERY');
        if (positive) { evidence.cameraResponded=true;evidence.successfulSource=positive.type;latest.status='ONLINE';latest.sessionVerification='VERIFIED';latest.statusMessage='Camera communication verified after Pair.';break; }
      } catch { attempt.error=controller.signal.aborted?'VERIFICATION_DEADLINE':'DIAGNOSTIC_UNAVAILABLE'; }
      finally { controller.signal.removeEventListener('abort',abort); }
      await pause();
    }
  } finally { clearTimeout(timer);controller.abort();evidence.elapsedMs=Date.now()-started; }
  return { device: latest, evidence };
}
