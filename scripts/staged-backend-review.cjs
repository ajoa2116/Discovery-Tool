// Explicit import-only review; method execution is NOT authorized by this list.
const initialProjects = ['src/server/task_routes.js', 'src/core/tasks/task_manager.js', 'src/core/tasks/operation_tasks.js',
  'src/shared/tasks.js', 'src/shared/report_configuration.js', 'src/server/foreground_discovery_routes.js',
  'src/core/engine/foreground_discovery.js', 'src/shared/discovery_session.js', 'src/server/production_authentication_boundary.js',
  'src/server/http_host_validation.js', 'src/core/storage/vault.js', 'src/core/storage/app_db.js'];
const additions = {
  'src/shared/': ['address_validation', 'advanced_scan_contract', 'advanced_scan', 'browser_secret_redaction', 'bulk_capabilities',
    'bulk_reip', 'camera_access', 'camera_configuration', 'camera_renderer', 'collision_state', 'discovery_evidence',
    'duplicate_assistant', 'error_presentation', 'evidence_provenance', 'identity_enrichment', 'identity_policy', 'network_match',
    'network_relationship', 'pair_recovery', 'project_history', 'report_set'],
  'src/core/storage/': ['project_db', 'session_suppression', 'project_history'],
  'src/core/reporting/': ['report_set', 'report_service'],
  'src/core/engine/': ['collision_reconciliation', 'diagnostic_engine', 'device_enrichment', 'phase1_topology', 'incremental_discovery_monitor'],
  'src/core/network/': ['windows_adapter_service', 'local_host_identity'],
  'src/core/readiness/': ['build_identity', 'field_readiness', 'support_trace_lease', 'support_bundle', 'windows_receive_observation'],
  'src/server/': ['current_list_routes', 'report_set_routes', 'report_routes', 'production_assets', 'advanced_scan_routes',
    'receive_matrix_routes', 'ws_discovery_trace_routes'],
};
// Remaining composition imports: declarations/in-memory defaults reviewed; guarded
// provider methods are not executed. The launcher is intentionally absent.
const compositionImports = {
  'src/core/connect/': ['camera_browser_sessions', 'camera_renderer_service', 'connect_service', 'native_camera_capability', 'native_camera_proof'],
  'src/core/drivers/': ['axis', 'camera_driver', 'dahua', 'hanwha', 'hikvision', 'onvif', 'vendor_configuration_provider', 'ws_discovery_evidence', 'ws_discovery_hello', 'ws_discovery_transport'],
  'src/core/edge_cases/': ['duplicate_assistant_service', 'duplicate_remediation_service', 'legacy_hardware'],
  'src/core/engine/': ['advanced_scan', 'bulk_reip', 'phase2_passive', 'phase3_probing', 'phase4_reconcile', 'phase5_provision', 'phase6_telemetry', 'pipeline', 'reverification'],
  'src/core/network/': ['camera_configuration_service', 'camera_network_service', 'legacy_configuration_boundary', 'match_candidate_service', 'pair_service', 'post_pair_verification'],
  'src/core/readiness/': ['receive_matrix', 'udp_port_owners'],
  'src/core/storage/': ['add_to_existing_project'],
  'src/server/': ['camera_browser_routes', 'backend_application'],
};
const reviewedProjects = [...initialProjects, ...Object.entries({ ...additions }).flatMap(([prefix, names]) => names.map(name => prefix + name + '.js')),
  ...Object.entries(compositionImports).flatMap(([prefix, names]) => names.map(name => prefix + name + '.js'))];
const testOnlyProjects = ['src/test/backend_lifecycle_fixture.js'];
const reviewReason = name => initialProjects.includes(name) ? 'Previously reviewed; synthetic behavior only.' :
  name.startsWith('src/shared/') ? 'Reviewed constants/functions and local imports; no operational calls at import.' :
  'Reviewed emitted top-level definitions/imports; operational provider methods remain uncalled. Singleton allocations are in memory.';

function classifyOutputs(manifest, inventory, probe) {
  const files = new Map(inventory.files.map(f => [f.path, f]));
  const baseline = new Set(probe.baselineLoadedModules ?? []), loaded = new Set(probe.loadedModules ?? []);
  const successful = new Set(probe.successfulProjectImports ?? []);
  const records = manifest.candidates.filter(c => ['transpiled', 'copied-candidate'].includes(c.status) && /\.(?:[cm]?js)$/.test(c.output)).map(c => {
    const evidence = files.get(c.source)?.annotation?.reachability?.evidence ?? [];
    const observed = evidence.filter(e => e.dependencyUse === 'runtime-candidate');
    const review = reviewedProjects.includes(c.output), testOnly = testOnlyProjects.includes(c.output);
    const entry = c.output === 'src/server/index.js';
    const asset = c.selectionReasons.some(r => r.startsWith('observed-module-url-directory:'));
    const category = entry ? 'excluded-real-entrypoint' : testOnly ? 'explicit-test-only-fixture' : review ? 'reviewed-production-import' :
      observed.length ? 'observed-backend-candidate-unreviewed' : asset ? 'selected-asset-candidate' : 'package-member-or-other-unknown';
    const reason = entry ? 'Production launcher invokes start(); real listeners, timers, recovery and credential initialization remain excluded.' :
      testOnly ? 'Explicit test root: synthetic lifecycle dependencies; never imported by the production launcher.' :
      review ? reviewReason(c.output) : observed.length ? 'Required-path candidate from static runtime ancestry; import-time effects/dependency graph not yet reviewed.' :
      asset ? 'Selected as an asset, not established as a Node backend module; browser execution is outside this probe.' :
      'Copied selection/membership is not observed runtime use. Alternate, optional, tool, test or build roles remain uncertain; not excluded from closure.';
    return { source: c.source, output: c.output, category, priority: entry || observed.length ? 'backend-first' : 'unestablished-runtime-use',
      runtimeReachability: observed.length ? 'observed-static-candidate' : 'unknown', evidence: observed,
      selectionReasons: c.selectionReasons, previouslyUntested: !baseline.has(c.output),
      loadObserved: loaded.has(c.output), successfulDirectImport: successful.has(c.output),
      status: loaded.has(c.output) ? 'load-observed-not-full-behavior' : 'excluded-from-this-probe', reason,
      safetyVerified: false, productionAuthority: false };
  });
  const countBy = subset => { const counts = {}; for (const r of subset) counts[r.category] = (counts[r.category] ?? 0) + 1; return counts; };
  const prior = records.filter(r => r.previouslyUntested), remaining = records.filter(r => !r.loadObserved);
  return { basis: 'explicit-review-and-static-entrypoint-evidence-not-complete-runtime-closure', records,
    previouslyUntested: { count: prior.length, byCategory: countBy(prior), additionallyLoaded: prior.filter(r => r.loadObserved).length },
    remaining: { count: remaining.length, byCategory: countBy(remaining) } };
}
// Existing inventory references identify exact specifiers; a declared dependency
// name need not export its root (e.g. dunder-proto/get, math-intrinsics/abs).
function selectedDependencyRequests(manifest, inventory, admission) {
  const admitted = new Set(admission.admitted.map(r => r.path));
  const owners = manifest.packages.map(p => p.path).sort((a, b) => b.length - a.length);
  return manifest.dependencies.map(edge => {
    const references = inventory.references.filter(r => !r.typeOnly && ['require', 'import', 'export', 'dynamic-import'].includes(r.kind) &&
      typeof r.specifier === 'string' && (r.specifier === edge.name || r.specifier.startsWith(edge.name + '/')) &&
      owners.find(owner => r.source.startsWith(owner + '/')) === edge.parent);
    return { ...edge, requests: references.filter(r => admitted.has(r.source)).map(r => ({ source: r.source,
      specifier: r.specifier, line: r.line, referenceKind: r.kind })),
      unexercisedReferences: references.filter(r => !admitted.has(r.source)).map(r => ({ source: r.source,
        specifier: r.specifier, line: r.line, reason: 'Importer not in exact-file admission.' })) };
  });
}

function mappedStagePath(input, root, platform = process.platform) {
  const path = require('node:path'), { fileURLToPath } = require('node:url');
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const fail = reason => { throw Object.assign(Error('Mapping denied: ' + reason), { code: 'MAPPING_DENIED' }); };
  let full;
  if (input instanceof URL || (typeof input === 'string' && input.startsWith('file:'))) {
    if (typeof input === 'string' && /(?:%2e|\/\.\.(?:\/|$))/i.test(input)) fail('url-traversal');
    const url = input instanceof URL ? input : new URL(input);
    if (url.protocol !== 'file:' || url.host || url.search || url.hash) fail('nonlocal-or-ambiguous-url');
    try { full = fileURLToPath(url, { windows: platform === 'win32' }); } catch { fail('url-conversion'); }
  } else {
    if (typeof input !== 'string' || !input || input.includes('\0') || /^[a-z]+:/i.test(input) && !/^[A-Za-z]:[\\/]/.test(input)) fail('invalid-path');
    if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(input)) fail('path-traversal');
    full = paths.resolve(root, input);
  }
  if (platform === 'win32' && (full.startsWith('\\\\') || /:/.test(full.slice(2)))) fail('windows-device-or-stream');
  const name = paths.relative(root, full).split(paths.sep).join('/');
  if (!name || name === '..' || name.startsWith('../') || paths.isAbsolute(name)) fail('outside-stage');
  return { full, name };
}

// Fixture-only metadata/call capture. Selected bytes are never read or executed.
function createSelectedPathCapture(root, manifest, inventory) {
  const fs = require('node:fs'), path = require('node:path');
  const identities = new Map(), calls = [];
  const fail = reason => { throw Object.assign(Error('Mapping denied: ' + reason), { code: 'MAPPING_DENIED' }); };
  function capture(input, expected, source, specifier, boundary, args = []) {
    if (typeof expected !== 'string' || !expected.split('/').every(p => p && p !== '.' && p !== '..' && !/[\\:*?"<>|]/.test(p))) fail('invalid-selection-path');
    const refs = inventory.references.filter(r => r.source === source && r.kind === 'module-url' && r.specifier === specifier);
    if (refs.length !== 1) fail('missing-or-ambiguous-reference');
    if (refs[0].resolvedPath && refs[0].resolvedPath !== expected) fail('incorrect-reference-target');
    const candidates = manifest.candidates.filter(c => [c.output, c.source].some(p => typeof p === 'string' && p.toLowerCase() === expected.toLowerCase()));
    if (candidates.length !== 1 || candidates[0].output !== expected ||
      !['copied-candidate','generated-metadata'].includes(candidates[0].status)) fail('missing-or-ambiguous-selection');
    const selected = candidates[0], reasons = selected.selectionReasons ?? [];
    if (!reasons.includes('observed-module-url:' + source) && !reasons.includes('observed-module-url-directory:' + source)) fail('unselected-reference');
    if (manifest.unresolved.some(r => r.target === expected || r.output === expected)) fail('unresolved-selection');
    const mapped = mappedStagePath(input, root);
    if (mapped.name !== expected) fail('incorrect-mapping');
    let stat;
    try {
      stat = fs.lstatSync(mapped.full);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1 || fs.realpathSync(mapped.full) !== mapped.full) fail('unsupported-file-identity');
    } catch (error) { if (error.code === 'MAPPING_DENIED') throw error; fail('missing-file'); }
    const identity = { device: stat.dev, file: stat.ino, bytes: stat.size, modified: stat.mtimeMs };
    if (identities.has(expected) && JSON.stringify(identities.get(expected)) !== JSON.stringify(identity)) fail('changed-file-identity');
    identities.set(expected, identity);
    const record = { path: expected, source, specifier, boundary, args, identity, selectionReasons: reasons,
      capturedOnly: true, executed: false, contentsRead: false, productionAuthority: false };
    calls.push(record); return record;
  }
  const retained = new Map(), resources = new Set(), retentionChecks = [], cleanupJournal = [];
  let disposed = false;
  const identityOf = stat => ({ device: stat.dev, file: stat.ino, bytes: stat.size, modified: stat.mtimeMs });
  const sameIdentity = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const retentionFail = (reason, cleanupErrors = []) => { throw Object.assign(Error('Retained file denied: ' + reason),
    { code: 'RETAINED_FILE_DENIED', reason, cleanupErrors }); };
  function digestHandle(fd, identity) {
    const { createHash } = require('node:crypto');
    if (!Number.isSafeInteger(identity.bytes) || identity.bytes < 0 || identity.bytes > 128 * 1024 * 1024) retentionFail('file-bound');
    const hash = createHash('sha256'), buffer = Buffer.alloc(65536);
    for (let position = 0; position < identity.bytes;) {
      const read = fs.readSync(fd, buffer, 0, Math.min(buffer.length, identity.bytes - position), position);
      if (!read) retentionFail('short-read');
      hash.update(buffer.subarray(0, read)); position += read;
    }
    if (!sameIdentity(identityOf(fs.fstatSync(fd)), identity)) retentionFail('changed-during-measurement');
    return hash.digest('hex');
  }
  function acquire(full) {
    const resource = { fd: fs.openSync(full, 'r'), identity: null, cleanupPending: false };
    resources.add(resource); return resource;
  }
  function close(resource) {
    if (!resource || resource.fd === null) return [];
    const errors = [], fd = resource.fd;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        fs.closeSync(fd); resource.fd = null; resources.delete(resource);
        cleanupJournal.push({ fd, status: 'closed', attempt, errors }); return errors;
      } catch (error) {
        errors.push(error.code ?? 'CLOSE_ERROR');
        // A thrown close may already have closed the descriptor. Never blindly
        // retry it: first distinguish EBADF from a still-open owned file.
        try {
          const stat = fs.fstatSync(fd);
          if (resource.identity && (stat.dev !== resource.identity.device || stat.ino !== resource.identity.file)) {
            errors.push('CLOSE_IDENTITY_UNCERTAIN'); break;
          }
        } catch (probeError) {
          if (probeError.code === 'EBADF') {
            resource.fd = null; resources.delete(resource);
            cleanupJournal.push({ fd, status: 'confirmed-closed-after-error', attempt, errors }); return errors;
          }
          errors.push(probeError.code ?? 'CLOSE_STATE_UNKNOWN'); break;
        }
      }
    }
    resource.cleanupPending = true;
    cleanupJournal.push({ fd, status: 'pending-cleanup', errors }); return errors;
  }
  const reasonOf = (error, ioReason) => error.code === 'RETAINED_FILE_DENIED' ? error.reason : error.code === 'MAPPING_DENIED' ? 'mapping-rejected' : ioReason;
  function cleanupState() {
    return { disposed, pendingDescriptors: resources.size,
      cleanupJournal: cleanupJournal.map(r => ({ ...r, errors: [...r.errors] })) };
  }
  function retain(input, expected, source, specifier) {
    if (disposed) retentionFail('disposed-capture');
    if ([...resources].some(r => r.cleanupPending)) retentionFail('pending-cleanup');
    let resource = null;
    try {
      const validation = capture(input, expected, source, specifier, 'retain-validation');
      const active = [...retained.values()].filter(e => e.resource.fd !== null);
      if (active.length >= 64 || active.reduce((sum, e) => sum + e.identity.bytes, validation.identity.bytes) > 256 * 1024 * 1024)
        retentionFail('retention-bound');
      resource = acquire(mappedStagePath(input, root).full);
      const identity = identityOf(fs.fstatSync(resource.fd)); resource.identity = identity;
      if (!sameIdentity(identity, validation.identity)) retentionFail('open-identity-mismatch');
      const digest = digestHandle(resource.fd, identity);
      const recheck = capture(input, expected, source, specifier, 'retain-recheck');
      if (!sameIdentity(identity, recheck.identity)) retentionFail('path-identity-mismatch');
      const evidence = Object.freeze({ path: expected, identity: Object.freeze(identity), digest,
        handleRetained: true, contentsRead: true, executed: false, productionAuthority: false, raceFree: false });
      retained.set(evidence, { resource, identity, digest, expected, source, specifier, state: 'validated' });
      resource = null; return evidence;
    } catch (error) {
      const reason = reasonOf(error, 'validation-io'), cleanupErrors = close(resource);
      retentionChecks.push({ path: expected, status: 'validation-denied', reason, cleanupErrors,
        handleClosed: resource === null || resource.fd === null, executed: false });
      retentionFail(reason, cleanupErrors);
    }
  }
  function simulateUse(evidence, input) {
    const entry = retained.get(evidence);
    if (!entry || entry.state !== 'validated' || entry.resource.fd === null) retentionFail('foreign-or-terminal-evidence');
    entry.state = 'verifying'; // No reentrant use or recovery after failure.
    let secondary = null, primaryError = null;
    try {
      const current = capture(input, entry.expected, entry.source, entry.specifier, 'simulated-use-validation');
      if (!sameIdentity(current.identity, entry.identity) || !sameIdentity(identityOf(fs.fstatSync(entry.resource.fd)), entry.identity))
        retentionFail('changed-file-identity');
      secondary = acquire(mappedStagePath(input, root).full);
      secondary.identity = identityOf(fs.fstatSync(secondary.fd));
      if (!sameIdentity(secondary.identity, entry.identity)) retentionFail('use-open-identity-mismatch');
      if (digestHandle(secondary.fd, entry.identity) !== entry.digest || digestHandle(entry.resource.fd, entry.identity) !== entry.digest)
        retentionFail('changed-bytes');
      capture(input, entry.expected, entry.source, entry.specifier, 'simulated-use-recheck');
    } catch (error) { primaryError = error; }
    entry.state = 'denied'; // Publish terminal state before any cleanup callback.
    const cleanupErrors = [...close(secondary), ...close(entry.resource)];
    if (!primaryError && !cleanupErrors.length) {
      entry.state = 'used';
      const result = { path: entry.expected, status: 'verified-inert-use', digest: entry.digest, executed: false,
        handleClosed: true, raceFree: false, productionAuthority: false };
      retentionChecks.push(result); return result;
    }
    const reason = primaryError ? reasonOf(primaryError, 'use-io') : 'cleanup-error';
    retentionChecks.push({ path: entry.expected, status: 'denied', reason, cleanupErrors, executed: false,
      handleClosed: entry.resource.fd === null && (!secondary || secondary.fd === null) });
    retentionFail(reason, cleanupErrors);
  }
  function dispose() {
    disposed = true;
    for (const entry of retained.values()) entry.state = 'disposed';
    const errors = [...resources].flatMap(resource => close(resource));
    if (errors.length) retentionFail('cleanup-error', errors);
  }
  return { capture, calls, retain, simulateUse, dispose, retentionChecks, cleanupState };
}

function packageFilePath(name) {
  return typeof name === 'string' && name.startsWith('node_modules/') &&
    name === name.normalize('NFC') && name.split('/').every(part => part && part !== '.' && part !== '..' &&
      !/[\\:*?"<>|\x00-\x1f]/.test(part) && !/[. ]$/.test(part)) && /\.(?:[cm]?js|json)$/.test(name);
}

// Intersect a narrow review with actual successful staging records. Never expand
// a package/directory or derive admission from loadedModules or unresolved edges.
function buildPackageAdmission(manifest, reviews = reviewedPackageFiles) {
  if (!Array.isArray(manifest.candidates) || !Array.isArray(manifest.unresolved) || !Array.isArray(reviews))
    throw Error('Missing package selection evidence.');
  const selected = new Map(), reviewed = new Map(), admitted = [], denied = [];
  const add = (map, name, value) => { const key = name.toLowerCase(); map.set(key, [...(map.get(key) ?? []), value]); };
  for (const candidate of manifest.candidates) {
    for (const name of new Set([candidate.source, candidate.output].filter(n => typeof n === 'string' && /^node_modules\//i.test(n))))
      add(selected, name, candidate);
  }
  for (const review of reviews) {
    if (!packageFilePath(review.path) || typeof review.reason !== 'string' || !review.reason.trim())
      throw Error('Invalid exact package-file review.');
    add(reviewed, review.path, review);
  }
  for (const key of new Set([...selected.keys(), ...reviewed.keys()])) {
    const candidates = selected.get(key) ?? [], review = reviewed.get(key) ?? [];
    const name = review[0]?.path ?? candidates[0]?.output ?? candidates[0]?.source;
    const candidate = candidates[0];
    let reason;
    if (review.length !== 1) reason = review.length ? 'ambiguous-review' : 'unreviewed-package-file';
    else if (candidates.length !== 1) reason = candidates.length ? 'ambiguous-selection' : 'missing-selection';
    else if (!packageFilePath(name) || candidate.source !== name || candidate.output !== name) reason = 'ambiguous-output-path';
    else if (candidate.status !== 'copied-candidate') reason = 'unsuccessful-or-unresolved-selection';
    else if (!Array.isArray(candidate.selectionReasons) || !candidate.selectionReasons.length ||
      candidate.selectionReasons.some(r => typeof r !== 'string' || !r.trim())) reason = 'missing-selection-reasons';
    // Reference-analysis gaps describe edges, not a successful file selection.
    // Retain them below; explicit unresolved target/selection evidence still denies.
    else if (manifest.unresolved.some(r => r.target === name || r.output === name ||
      (r.source === name && /(?:selection|copy|output|missing|unreadable|not-in-lock|collision|byte-limit)/.test(r.reason ?? ''))))
      reason = 'unresolved-file-selection';
    const evidence = { path: name, selectionReasons: candidates.flatMap(c => c.selectionReasons ?? []), reviewReason: review[0]?.reason ?? null };
    if (reason) denied.push({ ...evidence, reason });
    else admitted.push({ ...evidence, source: candidate.source, status: candidate.status });
  }
  return { informationalOnly: true, productionAuthority: false, completeClosure: false,
    basis: 'exact-reviewed-files-intersected-with-successful-staging-selections', admitted, denied,
    unresolved: manifest.unresolved, pending: manifest.loadingSummary?.pending ?? [],
    limitation: 'File admission is not import-edge closure, byte integrity, sandboxing or production trust.' };
}

// Node synchronous hooks cover ESM and CommonJS (including transitive require).
// Called before any package imports; read data cannot nominate new admitted paths.
function installPackageAdmissionHooks(root, admission, onLoad = () => {}) {
  const fs = require('node:fs'), path = require('node:path');
  const { fileURLToPath } = require('node:url');
  const { registerHooks } = require('node:module');
  if (admission?.basis !== 'exact-reviewed-files-intersected-with-successful-staging-selections' ||
    admission.productionAuthority !== false || !Array.isArray(admission.admitted)) throw Error('Missing package admission evidence.');
  const paths = new Set();
  for (const record of admission.admitted) {
    if (!packageFilePath(record.path) || paths.has(record.path.toLowerCase())) throw Error('Ambiguous package admission.');
    paths.add(record.path.toLowerCase());
  }
  const check = url => {
    if (url.startsWith('node:')) return;
    const full = fileURLToPath(url), relative = path.relative(root, full).split(path.sep).join('/');
    if (!/^node_modules\//i.test(relative)) return;
    if (fs.realpathSync(full) !== full || !paths.has(relative.toLowerCase()) ||
      !admission.admitted.some(r => r.path === relative))
      throw Object.assign(Error('Unadmitted package file: ' + relative), { code: 'PACKAGE_FILE_DENIED' });
    return relative;
  };
  return registerHooks({
    resolve(specifier, context, next) { const result = next(specifier, context); check(result.url); return result; },
    load(url, context, next) { const name = check(url); const result = next(url, context); if (name) onLoad(name); return result; },
  });
}
module.exports = { initialProjects, reviewedProjects, testOnlyProjects, reviewReason, classifyOutputs,
  buildPackageAdmission, installPackageAdmissionHooks, selectedDependencyRequests, mappedStagePath, createSelectedPathCapture };

// Exact fixture paths reviewed against current literal imports/requires and top-level definitions.
// Historical load evidence helped locate candidates; observation never generates admission.
// Node-only debug/inherits branches are listed; browser, iconv encoding tables, optional WS
// native peers and computed view engines remain unlisted. Operational calls stay guarded.
const reviewedPackageFiles = [
  'node_modules/accepts/index.js',
  'node_modules/array-flatten/array-flatten.js',
  'node_modules/body-parser/index.js',
  'node_modules/body-parser/lib/read.js',
  'node_modules/body-parser/lib/types/json.js',
  'node_modules/body-parser/lib/types/raw.js',
  'node_modules/body-parser/lib/types/text.js',
  'node_modules/body-parser/lib/types/urlencoded.js',
  'node_modules/body-parser/node_modules/debug/src/debug.js',
  'node_modules/body-parser/node_modules/debug/src/index.js',
  'node_modules/body-parser/node_modules/debug/src/node.js',
  'node_modules/body-parser/node_modules/ms/index.js',
  'node_modules/bytes/index.js',
  'node_modules/call-bind-apply-helpers/actualApply.js',
  'node_modules/call-bind-apply-helpers/functionApply.js',
  'node_modules/call-bind-apply-helpers/functionCall.js',
  'node_modules/call-bind-apply-helpers/index.js',
  'node_modules/call-bind-apply-helpers/reflectApply.js',
  'node_modules/call-bound/index.js',
  'node_modules/content-disposition/index.js',
  'node_modules/content-type/index.js',
  'node_modules/cookie-signature/index.js',
  'node_modules/cookie/index.js',
  'node_modules/cors/lib/index.js',
  'node_modules/depd/index.js',
  'node_modules/destroy/index.js',
  'node_modules/dunder-proto/get.js',
  'node_modules/ee-first/index.js',
  'node_modules/encodeurl/index.js',
  'node_modules/es-define-property/index.js',
  'node_modules/es-errors/eval.js',
  'node_modules/es-errors/index.js',
  'node_modules/es-errors/range.js',
  'node_modules/es-errors/ref.js',
  'node_modules/es-errors/syntax.js',
  'node_modules/es-errors/type.js',
  'node_modules/es-errors/uri.js',
  'node_modules/es-object-atoms/index.js',
  'node_modules/escape-html/index.js',
  'node_modules/etag/index.js',
  'node_modules/express/index.js',
  'node_modules/express/lib/application.js',
  'node_modules/express/lib/express.js',
  'node_modules/express/lib/middleware/init.js',
  'node_modules/express/lib/middleware/query.js',
  'node_modules/express/lib/request.js',
  'node_modules/express/lib/response.js',
  'node_modules/express/lib/router/index.js',
  'node_modules/express/lib/router/layer.js',
  'node_modules/express/lib/router/route.js',
  'node_modules/express/lib/utils.js',
  'node_modules/express/lib/view.js',
  'node_modules/express/node_modules/debug/src/debug.js',
  'node_modules/express/node_modules/debug/src/index.js',
  'node_modules/express/node_modules/debug/src/node.js',
  'node_modules/express/node_modules/ms/index.js',
  'node_modules/fast-xml-parser/src/fxp.js',
  'node_modules/fast-xml-parser/src/ignoreAttributes.js',
  'node_modules/fast-xml-parser/src/util.js',
  'node_modules/fast-xml-parser/src/validator.js',
  'node_modules/fast-xml-parser/src/xmlbuilder/json2xml.js',
  'node_modules/fast-xml-parser/src/xmlbuilder/orderedJs2Xml.js',
  'node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js',
  'node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js',
  'node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js',
  'node_modules/fast-xml-parser/src/xmlparser/XMLParser.js',
  'node_modules/fast-xml-parser/src/xmlparser/node2json.js',
  'node_modules/fast-xml-parser/src/xmlparser/xmlNode.js',
  'node_modules/finalhandler/index.js',
  'node_modules/finalhandler/node_modules/debug/src/debug.js',
  'node_modules/finalhandler/node_modules/debug/src/index.js',
  'node_modules/finalhandler/node_modules/debug/src/node.js',
  'node_modules/finalhandler/node_modules/ms/index.js',
  'node_modules/forwarded/index.js',
  'node_modules/fresh/index.js',
  'node_modules/function-bind/implementation.js',
  'node_modules/function-bind/index.js',
  'node_modules/get-intrinsic/index.js',
  'node_modules/get-proto/Object.getPrototypeOf.js',
  'node_modules/get-proto/Reflect.getPrototypeOf.js',
  'node_modules/get-proto/index.js',
  'node_modules/gopd/gOPD.js',
  'node_modules/gopd/index.js',
  'node_modules/has-symbols/index.js',
  'node_modules/has-symbols/shams.js',
  'node_modules/hasown/index.js',
  'node_modules/http-errors/index.js',
  'node_modules/iconv-lite/lib/bom-handling.js',
  'node_modules/iconv-lite/lib/extend-node.js',
  'node_modules/iconv-lite/lib/index.js',
  'node_modules/iconv-lite/lib/streams.js',
  'node_modules/inherits/inherits.js',
  'node_modules/ipaddr.js/lib/ipaddr.js',
  'node_modules/math-intrinsics/abs.js',
  'node_modules/math-intrinsics/floor.js',
  'node_modules/math-intrinsics/isNaN.js',
  'node_modules/math-intrinsics/max.js',
  'node_modules/math-intrinsics/min.js',
  'node_modules/math-intrinsics/pow.js',
  'node_modules/math-intrinsics/round.js',
  'node_modules/math-intrinsics/sign.js',
  'node_modules/media-typer/index.js',
  'node_modules/merge-descriptors/index.js',
  'node_modules/methods/index.js',
  'node_modules/mime-db/db.json',
  'node_modules/mime-db/index.js',
  'node_modules/mime-types/index.js',
  'node_modules/mime/mime.js',
  'node_modules/mime/types.json',
  'node_modules/ms/index.js',
  'node_modules/negotiator/index.js',
  'node_modules/negotiator/lib/charset.js',
  'node_modules/negotiator/lib/encoding.js',
  'node_modules/negotiator/lib/language.js',
  'node_modules/negotiator/lib/mediaType.js',
  'node_modules/object-assign/index.js',
  'node_modules/object-inspect/index.js',
  'node_modules/object-inspect/util.inspect.js',
  'node_modules/on-finished/index.js',
  'node_modules/parseurl/index.js',
  'node_modules/path-to-regexp/index.js',
  'node_modules/proxy-addr/index.js',
  'node_modules/qs/lib/formats.js',
  'node_modules/qs/lib/index.js',
  'node_modules/qs/lib/parse.js',
  'node_modules/qs/lib/stringify.js',
  'node_modules/qs/lib/utils.js',
  'node_modules/range-parser/index.js',
  'node_modules/raw-body/index.js',
  'node_modules/safe-buffer/index.js',
  'node_modules/safer-buffer/safer.js',
  'node_modules/send/index.js',
  'node_modules/send/node_modules/debug/node_modules/ms/index.js',
  'node_modules/send/node_modules/debug/src/debug.js',
  'node_modules/send/node_modules/debug/src/index.js',
  'node_modules/send/node_modules/debug/src/node.js',
  'node_modules/serve-static/index.js',
  'node_modules/setprototypeof/index.js',
  'node_modules/side-channel-list/index.js',
  'node_modules/side-channel-map/index.js',
  'node_modules/side-channel-weakmap/index.js',
  'node_modules/side-channel/index.js',
  'node_modules/statuses/codes.json',
  'node_modules/statuses/index.js',
  'node_modules/strnum/strnum.js',
  'node_modules/toidentifier/index.js',
  'node_modules/type-is/index.js',
  'node_modules/unpipe/index.js',
  'node_modules/utils-merge/index.js',
  'node_modules/vary/index.js',
  'node_modules/ws/index.js', // Node require export: definitions plus already reviewed literal lib imports.
  'node_modules/ws/lib/buffer-util.js',
  'node_modules/ws/lib/constants.js',
  'node_modules/ws/lib/event-target.js',
  'node_modules/ws/lib/extension.js',
  'node_modules/ws/lib/limiter.js',
  'node_modules/ws/lib/permessage-deflate.js',
  'node_modules/ws/lib/receiver.js',
  'node_modules/ws/lib/sender.js',
  'node_modules/ws/lib/stream.js',
  'node_modules/ws/lib/subprotocol.js',
  'node_modules/ws/lib/validation.js',
  'node_modules/ws/lib/websocket-server.js',
  'node_modules/ws/lib/websocket.js',
  'node_modules/ws/wrapper.mjs',
].map(path => ({ path, reason: 'Explicit Node synthetic import path; declarations/helpers and literal dependencies reviewed; operational methods remain guarded.' }));
