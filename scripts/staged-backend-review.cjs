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
module.exports = { initialProjects, reviewedProjects, testOnlyProjects, reviewReason, classifyOutputs };
