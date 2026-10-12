import { constructBackend } from './backend_application.ts';
import { startupFailureMessage } from './production_assets.ts';
// Production has no fixture selection, injectable authority or alternate startup mode.
const backend = constructBackend();
let failed = false, terminating = false;
const removeSignals = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); };
const fatal = async (error: Error & { code?: string }) => {
  if (failed) return; failed = true;
  console.error(startupFailureMessage(error.code));
  try { await backend.shutdown(); } catch { console.error('Backend cleanup failed.'); }
  console.info(backend.recoveryDiagnostic());
  removeSignals(); process.exitCode = 1;
};
const stop = async (signal: string) => {
  if (terminating) return; terminating = true;
  console.info(`[Shutdown] ${signal}: stopping discovery, diagnostics, sockets, and HTTP service.`);
  try { await backend.shutdown(); console.info('[Shutdown] Resource cleanup complete.'); }
  catch { failed = true; console.error('Backend cleanup failed.'); }
  finally { removeSignals(); process.exitCode = failed ? 1 : 0; }
  console.info(backend.recoveryDiagnostic());
};
const interrupt = () => { void stop('SIGINT'); }, terminate = () => { void stop('SIGTERM'); };
process.once('SIGINT', interrupt); process.once('SIGTERM', terminate);
void backend.failure.then(fatal);
void backend.start().then(() => console.log('[CCTV Discovery Server v1.6] running on http://localhost:3001'))
  .catch(error => { if (error.name !== 'AbortError') void fatal(error); });
