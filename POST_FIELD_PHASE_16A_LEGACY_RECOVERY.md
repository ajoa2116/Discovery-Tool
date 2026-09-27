# Phase 16A — Legacy Pair recovery detection and safe retirement

Branch: `codex/post-field-corrections-1`

Starting HEAD: `c432295b077ef0f6e88c34bb7579381098b16c94`

Commit message: `Add safe legacy recovery retirement`

## Recognition and safety

The pre-Phase-3 Pair snapshot contract was checked in Git history. It did not contain interface GUID fields. Positive legacy recognition now requires both GUID fields to be absent, coherent supported session/snapshot/candidate evidence, a UUID session ID, confirmation/timestamps, and consistent saved adapter name/index/media. These old name/index values establish only internal record coherence, never identity of a current Windows adapter. No current GUID is inferred or attached.

Modern valid recovery continues through the existing GUID-based inspection, healthy retention, Keep Current, and explicit Restore paths. Missing only one GUID, present-but-invalid GUIDs, unknown fields, malformed JSON, inconsistent applied configuration, and unsupported evidence remain attention-required. Legacy Restore is rejected before changing session state or writing recovery data.

Both recovery dialogs display the older-record explanation, separately labeled current adapter observations where available, and Keep Current / Retire Legacy Recovery. A second explicit confirmation accepts current Windows settings and states that original settings will not be restored. Cancel performs no persistence operation. Current Windows configuration need not match any old configuration, and adapter enumeration is not required by the retirement service.

## Retirement and archive

The endpoint binds confirmation to the active session ID. The service excludes concurrent recovery/startup/Pair work. The disk store rechecks recognition and equality with the reviewed record before archival and checks the source bytes again before removing active recovery.

The archive is adjacent to the active file, named `pair-recovery.legacy-retired.<source-sha256>.json`, with a retired-format marker, source hash, a no-restore explanation, and sanitized diagnostic evidence. It is exclusively created and flushed before active removal. Matching existing archives support retry without duplication; an archive failure leaves active recovery blocking. Existing support sanitization removes credential-shaped diagnostic text. The archive is local only, never a Project/report record.

Startup loads only `pair-recovery.json`, not archives. Retirement returns IDLE / LEGACY_RETIRED, clears the active obligation, and completes the recovery attention task. Fresh Pair/Match Network work captures the current GUID-bearing original baseline. Old archive evidence cannot replace that baseline.

No Windows mutation API, normal Restore, discovery, credential, camera configuration, or Project mutation is invoked by retirement. The real development-machine adapter, active local recovery record, and three original CCTV trace files were not read or modified for validation. Tests used isolated temporary recovery files and fake adapters.

## Validation

| Non-browser suite | Passed |
| --- | ---: |
| New legacy recovery | 51 |
| Retained network / FIELD-NET-03 | 46 |
| Pair | 34 |
| Match apply | 39 |
| Match candidates | 41 |
| Post-Pair enrichment | 57 |
| Field workflow | 76 |
| Field preparation / startup / shutdown | 57 |
| V1 integration | 39 |
| Task Manager | 91 |

Focused: **51**. Related non-browser: **480**. Non-browser total: **531 passed**.

| Browser suite | Passed |
| --- | ---: |
| New legacy recovery, both dialogs | 24 |
| Retained network | 14 |
| Match apply | 11 |
| Match candidates | 9 |
| Post Pair | 15 |
| Modal containment | 63 |
| Field workflow | 25 |
| V1 integration | 28 |

Browser total: **189 passed**. Selected validation total: **720 passed, 0 failed, 0 skipped**. Final TypeScript, production build, and diff check passed. No existing tests were weakened. The full application regression suite was not run; the additive retirement path was covered with the requested broad recovery/Pair subset. Temporary test helpers and the UI-only Vite server were cleaned up.

## Remaining limitations

Recognition intentionally supports the coherent pre-GUID format only. Partially migrated, contradictory, unknown, or incomplete records still require separate investigation. Archives preserve sanitized diagnostic evidence rather than byte-identical secret-bearing free text. The application remains the single owner of active recovery; out-of-band external file editing is unsupported, with before/removal checks guarding detected changes. Current-adapter display is informational and may be unavailable; it is never used to authorize a restore. Physical acceptance remains pending; the actual technician's legacy record was not retired during implementation.

Phase 16A software validated. Stop before Phase 16B.
