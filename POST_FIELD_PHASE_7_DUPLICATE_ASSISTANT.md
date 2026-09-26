# Phase 7 — Identity-safe Duplicate Assistant

Branch: `codex/post-field-corrections-1`

Starting HEAD: `a392cbd47247cc89bd2dfb594cf233be9c205bcd`

Master Blueprint v1.1 and the supplied Phase 7 specification remain authoritative.
The checkpoint and clean tracked baseline were verified before implementation.
Scope: FIELD-DUP-01 only. No Phase 8 work.

## Baseline findings and tests first

The old drawer displayed saved remediation snapshots. Its Recheck fetched the old
remediation GET endpoint without discovery; that GET also wrote the collision back
and dirtied the project. The drawer could fall back to an unrelated active collision,
did not follow live participant addresses, used a dark surface, and offered a write
workflow rather than safe collision inspection. Actions and blocked access lacked
assistant entry points.

The initial 39 Phase 7 assertions ran before production edits: 13 passed, 26 failed.
Failures reproduced missing live projection/service, missing discovery recheck,
stale lifecycle/results, membership effects, and missing UI entry points. Additional
edge-case checks bring final focused coverage to 46. Existing assertions were not
weakened. Phase 6 browser assertions now verify the same no-launch guarantee and
ambiguity explanation in the assistant instead of the replaced native alert.

## Architecture and workflow

- `src/shared/duplicate_assistant.ts` projects the existing Phase 4 collision record
  and current devices. It reuses canonical anchors and Phase 6 access decisions.
  It never creates/resolves collisions or modifies identities. Missing current
  participants are explicitly historical and cannot acquire current actions.
- `DuplicateAssistantService` provides read-only inspection and coalesces rechecks
  for the same collision. The server delegates to the existing incremental monitor,
  which runs the existing discovery/enrichment/final-reconciliation pipeline with
  MONITORING origin and no foreground terminal event. There is no new Task system.
- Recheck uses existing eligible adapter discovery (not a new per-IP probe that
  could miss a moved camera). Foreground, Pair/recovery, configuration, support,
  Reverify, and concurrent-cycle guards remain authoritative. Deferred/failed checks
  explain their outcome. The frontend request is bounded to 45 seconds; cancelling
  that request does not fabricate a completed discovery or resolved collision.
- New runtime discoveries in a Project reuse the existing current-only membership
  mechanism. They cannot silently join saved project membership. Explicit addition
  still promotes membership and dirties the project. No schema change.
- The light, bounded drawer renders directly from current project props, with an
  internally scrolling participant area and reachable header/footer actions.

Entry points: Duplicate IP row status, row Actions > Duplicate Assistant, blocked
external Open, and the Camera Access collision warning. All select the same logical
collision. A backend block arriving before its UI broadcast retains the backend
address key and loads the current collision rather than falling back to another one.
The application footer remains unchanged and non-clickable.

Cards show Name, manufacturer/model, current IP, canonical full MAC, prominent MAC
Last 6, serial, UUID, stable Device.id, adapter/index, status and timestamps. Discovery,
current-IP diagnostics, and neighbor observations are shown as contextual evidence.
Missing fields are unavailable; no numeric confidence or credential material is
introduced. Serial remains supporting evidence; MAC/UUID do not create HTTP routing.

Details opens the existing Inspector; Diagnose uses the existing selected-device
workflow. MAC, serial and stable ID copying are functional. Refresh invokes discovery.
Open is disabled while Phase 6 blocks and, after resolution, uses the existing backend
access/launcher checks, including their last-moment identity/address validation.

Pair and configuration/write controls are not offered in this assistant. The screen
explains that the technician must physically identify and correct a camera through
an appropriate external/vendor/direct method, then recheck. There are no adapter,
camera, credential, isolation-authorization, or TLS-bypass operations in this workflow.
The existing Pair and configuration workflows and legacy remediation backend remain
unchanged; the new assistant does not use their write or snapshot-mutating routes.

## Lifecycle and side effects

A trustworthy stable-identity address move follows Phases 1–5: current addresses and
statuses reconcile, active count clears, IDs/metadata/address history survive, and
safe Open becomes available. Missing responses alone never resolve the collision.
Background resolution/reopening updates an already-open assistant. Resolved history
is not resurrected; reopening reuses the same record and blocks Open again.
Independent collision groups remain separate; all participants in a 3+ group render.
Browser tests also exercise twelve participants on an 800x600 viewport.

Opening/closing is read-only. Recheck updates runtime evidence without a persistent
project edit or automatic membership addition. It sends no credential or write
payload and creates no foreground scan Task. Existing report selections are not
edited; reports naturally project current runtime status. No Report Set features
were added. Explicit Diagnose retains its existing workflow and semantics.

## Validation

- Phase 7 focused: 46 passed, 0 failed.
- Phase 1: 50; Phase 2: 46; Phase 3: 46; Phase 4: 42; Phase 5: 43; Phase 6: 39.
  Combined earlier-phase focused checks: 266 passed.
- Full regression: 62 test files, 2,306 checks passed, 0 failed, 0 skipped.
- Browser: Phase 7 33, Phase 6 15, Phase 5 13, Phase 4 13, field workflow 25,
  V1 integration 28, scan/monitoring 41, retained network 14: 182 passed total.
- TypeScript (`npx tsc --noEmit`): passed.
- Production build (`npm run build`): passed.
- `git diff --check`: passed.

T01–T38 are covered across focused and browser tests. T32 explicitly verifies that
Pair is not exposed. Tests include the actual discovery pipeline, final foreground
reconciliation, operation guards, concurrent coalescing, failed/empty checks,
project/report side effects, real access service with an injected launcher, live UI
updates, identity copying, and every entry point. No physical camera or adapter
mutation was used. Camera navigation was intercepted in browser tests.

The known Windows Node identity failure required the validated TEMP-only userInfo
fallback shim. It is not a product change and is removed after validation, with
NODE_OPTIONS unset. The UI-only Vite process is also stopped.

## Remaining risks and physical retests

Software validated; physical retest pending. Discovery still needs trustworthy
current identity evidence for an externally moved camera. An unreachable/disconnected
participant alone cannot prove resolution. Existing Pair recovery attention can
legitimately defer recheck; Phase 7 does not retire or repair legacy recovery data.
No MAC-bound HTTP or camera-writing transport was introduced.

Retest with the two field cameras sharing 192.168.1.100: confirm 63FB0F and CD6885,
all entry points, blocked Open/configuration, external address correction then
Refresh, correct unique addresses/status/count, safe Open, background resolution,
and reopening. Check retained Ethernet 192.168.1.205 remains unchanged. Also verify
three cameras, two independent collision groups, clean saved Project membership,
and laptop scrolling. The three untracked field trace files remain untouched.

Commit message: `Add identity-safe Duplicate Assistant workflow`.
