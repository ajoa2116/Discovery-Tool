# Milestone 15B.8 — Field Validation Preparation + Windows Deployment Readiness

Branch: `codex/milestone-15b8-field-validation-deployment-readiness`

Starting HEAD: `0bc6995e535f9e1ac887abef68bc297506a59a87`

Final HEAD / commit hash: the commit containing this closeout; resolve with `git log -1 --format=%H -- MILESTONE_15B_8_FIELD_VALIDATION_DEPLOYMENT_READINESS.md`. The delivery message provides the exact hash rather than embedding a commit's own hash in itself.

Commit message: `Prepare V1 field validation and Windows deployment readiness`

## Outcome and methodology

Reviewed WindowsPreflightService, server/startup/shutdown, support bundle, adapter/credential/storage paths, technician readiness UI, runtime dependencies and distribution infrastructure. Used current code and the supplied Master Blueprint v1.1 requirements; no separate blueprint file exists in this checkout. Traced the actual source-distribution path and checked official packaging/security documentation where evaluating alternatives. No packaging framework, camera feature, discovery rewrite, account system or schema migration was introduced.

Omar's normal-Windows 15B.7 follow-up is recorded as supplied evidence: production startup/bind, root HTTP 200, real discovery status/no-camera evidence filtering and ClientWebSocket Open all PASS. It resolves the previous host-only runtime limitation, without changing any camera status. This session additionally succeeded in starting the actual production backend, running the new smoke script and opening the built UI without backend mocks.

## Concrete findings and corrections

| Finding | Severity | Correction / disposition | Verification |
|---|---|---|---|
| Fallback enumeration counted IPv6/loopback and could imply useful adapter readiness | MEDIUM | Filter fallback to external IPv4; production service uses existing eligible adapter enumeration; no-adapter warning remains scoped to discovery | Focused tests, actual host readiness |
| A rejected optional capability could discard the whole preflight | MEDIUM | Catch/deadline each probe; keep individual safe results; optional credential/UDP/storage warnings do not globally disable Scan | Exception/optional/blocking tests |
| App-data write was repeated and described as project/report destination readiness | MEDIUM | One temporary write check; omit user profile path; explain browser-selected downloads are not independently certified | Storage callback, actual app-data snapshot round trip, UI download |
| No technician-visible elevation/recovery/ownership context | MEDIUM | Extend existing checks; elevation warning explicitly limited to adapter mutations; authoritative recovery (including incomplete/failed startup inspection) and active Tasks/support ownership; cache key changes with these states | Ready/warning/recovery/ownership tests, production snapshot |
| Cached readiness had no explicit refresh and malformed refresh data needed validation | MEDIUM | Refresh Field Readiness inside existing Diagnostics & Support; bounded request, structural validation and safe stale-result feedback; reuse validator for shell load | Browser refresh/error/light/focus tests |
| Fixed version alone could not identify a field build | MEDIUM | Deterministic post-build manifest with version, optional commit/dirty, SHA-256 runtime source digest; About/preflight/support integration; malformed/missing identity remains unavailable | Identity determinism/change/no-Git/redaction tests; actual About/support match |
| Production smoke was manual only | MEDIUM | Read-only `scripts/smoke-production.cjs` and npm command, bounded HTTP/API/WS validation and clean WS close, safe failure exit; never spawns a backend | Real local sockets, occupied port, HTTP/API/timeout/WS/CLI failures and actual production PASS |
| No normal Windows distribution lifecycle/installer/signing | Deferred distribution work | Recommend bundled Node plus a small signed launcher/installer after physical validation; do not migrate architecture now | Deployment decision document |
| Permissive CORS/local APIs and whole-process elevation need public-release trust review | HIGH for broad distribution; deferred outside low-risk preparation scope | Explicit Gate B item: local-origin/session/CSRF protections, least-privilege elevation and owned process lifecycle. No new authentication architecture before camera validation | Source audit; public release remains blocked |

Existing discovery, Pair safety/confirmation and explicit Restore, credential policy, camera operations, foreground/background separation and synthetic isolation remain unchanged. Preflight is explanatory, not an authorization bypass or physical multicast certification.

## Required field artifacts

- `V1_PHYSICAL_FIELD_VALIDATION_PLAN.md`: 24 sequential cases with starting conditions, technician actions, app/network expectations, evidence, PASS/FAIL and cleanup; both individual cameras plus combined workflow; risky duplicate setup conditional.
- `V1_PHYSICAL_FIELD_TEST_RESULTS_TEMPLATE.md`: one blank record and summary row per test; distinguishes PASS, FAIL, BLOCKED, NOT APPLICABLE and NOT SUPPORTED.
- `V1_FIELD_DEFECT_TEMPLATE.md`: evidence-first reproduction, severity, exact build/topology, safe references and recovery state; hypotheses separated from facts.
- `V1_WINDOWS_DEPLOYMENT_READINESS.md`: code-based runtime/storage/elevation audit, three viable architecture options, primary recommendation and two release gates; official references included.
- `V1_FIELD_TEST_BUILD_PROCEDURE.md`: exact source/dependency/test/build/smoke/identity/support/restart preparation and evidence workflow, without source edits between physical tests.

## Validation

- Focused 15B.8: **57 assertions passed**.
- Full regression: **1,973 assertions passed across 55 files** (1,915 baseline + 57 focused + one additional browser import-boundary assertion).
- Browser/UI: **239 checks passed**: field preparation 23; production readiness 6; V1 integration 28; Tasks 25; field workflow 25; post-Pair 15; Advanced Scan 76; scan/monitoring separation 41.
- Final automated results: **0 failed, 0 skipped**. Development failures were corrected fixture completeness/menu-label issues and a close-event assertion race; one existing browser run was interrupted by preview reload and rerun successfully. No existing test was weakened or removed.
- TypeScript: **PASS**, standalone noEmit and production build.
- Production build: **PASS**, 1,605 modules; JS 357.38 kB / 101.76 kB gzip; CSS 40.45 kB; deterministic `dist/build-info.json` generated after Vite.
- Production smoke: **PASS on actual localhost:3001**, root HTML, valid real discovery status, WebSocket normal open/close; repeated after restart. Script defaults to no startup ownership and leaves no backend process behind.
- Actual production browser: built UI, genuine zero-camera Quick Work, idle foreground, empty Tasks, production About identity and no browser runtime exceptions.
- Actual Safe Support Bundle: correct format, zero devices, source digest matches About; readiness carries safe capability/build evidence.
- Existing stabilization tests verify idempotent graceful shutdown/controller/socket cleanup. Owned runtime stop/restart and released listener were checked; closing a browser tab alone is not backend shutdown, and forced Windows termination is not claimed graceful.
- This milestone required no external identity shim and introduced none. NODE_OPTIONS is clear for the final runtime. No physical camera was available or configured.

## Runtime / storage / preflight limits

Node v24.19.0 was exercised; existing readiness warns about its historical tsx host issue. Actual host readiness: Windows, PowerShell, credential-provider capability, app-data, port, UDP socket, production assets, clear recovery and idle ownership available; eligible adapter and NetTCPIP neighbor/address cmdlets unavailable/scoped, non-elevated state warning. This is truthful host capability reporting, not proof of packet reception or a field-laptop adapter pass. Recheck on the real field Ethernet before FV-01.

Recovery remains in LOCALAPPDATA/CCTVDiscoveryTool (OS temp fallback); credentials remain current-user Windows PasswordVault; project/report/support output uses user/browser selection; preferences use browser-origin localStorage; Quick Work/Tasks/audit remain session state. No developer-specific runtime path was introduced. App-data checks do not prove Download-folder permissions. Same-user elevation context matters for vault/recovery. No secrets or factory password tables were added to support evidence.

Build identity is deterministic for identical runtime source/configuration bytes. An absent Git commit is null, never guessed; untracked runtime source marks the build dirty, while unrelated untracked field traces do not. The manifest is a provenance aid, not a digital signature, dependency attestation or guarantee that a source directory was unchanged after build. Rebuild the final committed checkout and compare manifest/About/Support before field use. Precommit validation manifests truthfully show working changes; final delivery rebuilds the saved commit.

## Deployment-readiness matrix

Gate columns distinguish final physical validation from public/distributable V1. “No” for Gate A assumes the documented normal field host, installed source dependencies and per-run prerequisites. Conditional host capabilities must be established before dependent physical cases.

| Area | Status | Blocks final physical validation? | Blocks public/distributable V1? | Evidence / remaining work |
|---|---|---|---|---|
| Production frontend | READY | No | No by itself | Build and actual UI PASS |
| Production backend | READY | No | Launcher lifecycle integration | Actual start and restart smoke PASS |
| HTTP | READY | No | Local API trust hardening | Root/API PASS; permissive CORS requires review |
| WebSocket | READY | No | Local-session trust review | `/ws` opens/closes normally |
| Node runtime | PARTIAL | No, installed known runtime | Yes | Runtime bundling/pinning/clean-machine test pending |
| Windows adapter integration | READY | Conditional actual Ethernet/admin prerequisite | Representative host testing | Preserved Pair passes; Match retest pending |
| PowerShell | PARTIAL | Conditional cmdlets on field host | Yes, capability/OS matrix | Host missing NetTCPIP capability is reported |
| Elevation | PARTIAL | No with explicit same-user lab workflow | Yes | Selective elevation/least-privilege design pending |
| Credential storage | READY | No, verify same-user provider | Clean install/context test | PasswordVault; no plaintext project secrets |
| Projects | READY | No | No by itself | Persistence/reverify/merge tests; field cases pending |
| Reports | READY | No | No by itself | Portrait/history/export tests; actual destination check required |
| Support bundles | READY | No | Privacy review for sharing | Actual zero-device bundle/build match, redaction tests |
| Settings | READY | No | Retention/uninstall policy | Origin localStorage; tested UI |
| Recovery | READY | No, original-state safety required | Crash/update/install testing | Snapshot round trip and inherited recovery tests |
| Port management | PARTIAL | No | Yes | Fixed 3001; safe conflict error; launcher single-instance/ownership pending |
| Build identity | READY | No | Signing still separate | Deterministic optional commit/source digest |
| Packaging | NOT IMPLEMENTED | No | Yes | Recommended bundled Node + lightweight launcher after physical validation |
| Installer | NOT IMPLEMENTED | No | Yes | Install/uninstall/repair and data-retention validation pending |
| Code signing | NOT IMPLEMENTED | No | Yes, decision/implementation required | No blanket AV/SmartScreen guarantee |
| Updates | DEFERRED | No | Release policy required | Manual signed versioned update can be initial strategy; recovery preservation required |

## Gates, blockers and next step

**GATE A — READY FOR FINAL PHYSICAL VALIDATION.** Preparation, software validation, runtime smoke, evidence templates and executable procedures are complete. This means ready to run tests when cameras return, not that those tests have passed. Verify the actual field laptop's Ethernet/cmdlets, selected adapter, private credentials and recovery prerequisites before camera mutation.

**GATE B — NOT YET READY FOR DISTRIBUTABLE V1.** Final physical passes, bundled-runtime launcher/installer, signing decision, clean offline install/update/uninstall, local API trust/elevation review, license/dependency/runtime review and representative Windows/security-policy testing remain. No packaging framework was installed in this milestone.

Next step when cameras return: pin/rebuild this final commit using the build procedure, run `npm run start:production` then **`npm run smoke:production`** in a second terminal, compare About/Support identity, record original adapter/camera inventory, then execute FV-01 through FV-24 with a copied results template. Prioritize FV-06 Open, FV-07 credentials, FV-08 contrast and FV-11/FV-12 Match/recovery for pending FIELD items. Do not reset cameras or force unsafe duplicate-IP setup merely to obtain coverage.

## Preserved physical statuses

FIELD-DISC-02 — PHYSICAL PASS

FIELD-DISC-03 — PHYSICAL CLEAN-START PASS

FIELD-SCAN-01 — PHYSICAL PASS

FIELD-PAIR-01 — PHYSICAL PASS

FIELD-PAIR-02 — PHYSICAL PASS

FIELD-ENRICH-01 — PHYSICAL PASS

FIELD-UI-04 — PHYSICAL PASS

FIELD-NET-01 — SOFTWARE VALIDATED / PHYSICAL RETEST PENDING

FIELD-CRED-01 — SOFTWARE VALIDATED / PHYSICAL RETEST PENDING

FIELD-OPEN-01 — SOFTWARE VALIDATED / PHYSICAL RETEST PENDING

FIELD-UI-03 — SOFTWARE VALIDATED / PHYSICAL RETEST PENDING

## Files / line changes / Git review

| File | Added | Removed |
|---|---:|---:|
| `V1_FIELD_DEFECT_TEMPLATE.md` | 37 | 0 |
| `V1_FIELD_TEST_BUILD_PROCEDURE.md` | 85 | 0 |
| `V1_PHYSICAL_FIELD_TEST_RESULTS_TEMPLATE.md` | 430 | 0 |
| `V1_PHYSICAL_FIELD_VALIDATION_PLAN.md` | 281 | 0 |
| `V1_WINDOWS_DEPLOYMENT_READINESS.md` | 78 | 0 |
| `package.json` | 3 | 2 |
| `scripts/build-identity.cjs` | 14 | 0 |
| `scripts/smoke-production.cjs` | 39 | 0 |
| `src/core/readiness/build_identity.ts` | 8 | 0 |
| `src/core/readiness/field_readiness.ts` | 28 | 11 |
| `src/core/readiness/support_bundle.ts` | 1 | 1 |
| `src/server/index.ts` | 24 | 9 |
| `src/test/browser/field_preparation.cjs` | 39 | 0 |
| `src/test/browser/production_readiness.cjs` | 13 | 0 |
| `src/test/field_preparation.test.ts` | 68 | 0 |
| `src/ui/App.tsx` | 2 | 2 |
| `src/ui/components/SettingsMenu.tsx` | 13 | 5 |
| `MILESTONE_15B_8_FIELD_VALIDATION_DEPLOYMENT_READINESS.md` | 149 | 0 |

Total: **18 files, 1312 additions, 30 deletions**.

Intended source/tests/scripts and the six milestone documents are committed. Three pre-existing untracked CCTV trace files are untouched and excluded. No generated dist, dependency tree, temporary shim, credential or runtime recovery file is committed. `git diff --check` and staged review pass; final delivery verifies a clean tracked tree.

MILESTONE 15B.8 V1 FIELD VALIDATION PREPARATION + WINDOWS DEPLOYMENT READINESS — SOFTWARE VALIDATED
