# Phase 10 — Report information architecture and local dates

Master Blueprint v1.1 remains authoritative. Phase 11 is not included.

## Checkpoint and scope

Branch: `codex/post-field-corrections-1`.
Starting HEAD: `cd74b0f33fa3cec5fd4ced0a7b03c95cd6b51d78`
(`Add independent Report Set workflow`). Tracked files were clean before changes.
The three original untracked physical trace files were not read, modified, deleted,
or staged. No Windows adapter, camera, recovery, or credential operations were run.

FIELD-REPORT-02 and FIELD-REPORT-03: SOFTWARE VALIDATED / PHYSICAL RETEST PENDING.

## Date/time root cause and correction

The old filename used `generatedAt.slice(0,10)`, producing a UTC calendar date,
while the PDF body used a local Intl timestamp. UI preview also formatted its own
timestamp independently. Midnight could therefore show different dates.

`reportGeneration` now creates one context: normalized generation instant,
technician timezone, local calendar date, and human-readable timestamp. The UI
sends its Intl-resolved timezone. API callers without one use the backend's local
timezone. No fixed timezone or UTC date slicing is used. Invalid timestamps or
timezones fail safely rather than silently switching timezone.

Preview displays the generated context directly. Exports reuse the preview's
instant and timezone, including when the system date changes after preview.
PDF, CSV and JSON filenames all derive their local date from the same model.
Successful export Tasks retain that exact generation context; their details show
Report generated separately from operation Started/Ended times. Existing Task
history/lifecycle and older records remain unchanged. Historical Project events
are formatted in the report timezone without rewriting their stored timestamps.

## Information architecture

Root causes: NAME already contained the camera's technician-entered name, but its
export label said Technician Name; defaults separated Manufacturer/Model and
included Configured/Location; the PDF omitted report Technician metadata. Diagnostic
Summary inherited inventory defaults rather than including diagnostic evidence.

Report Information now exposes report-only Project, Site Location and Technician
Name. Generated time is shown from the authoritative context. These edits never
persist into a Project or device. Project reports initialize from supported Project
metadata; independent Report Set reports start with generic Report Set context and
blank site/technician, avoiding attribution to a different open Project.

Device Inventory defaults, in exact order:

1. Camera Name
2. Status
3. IP
4. MAC Last 6
5. Manufacturer / Model
6. Serial
7. Notes

Camera Name uses device Name, then existing model/vendor fallback. IP is never a
physical identity key. Combined manufacturer/model shows available evidence only;
either alone is valid and neither becomes Unknown. Serial remains typed serial.
MAC and Last 6 use shared canonical validation, rejecting zero, broadcast and
multicast forms. Existing operational status and collision semantics are retained.

Full MAC, Camera Location, Configured, separate Manufacturer/Model, firmware,
subnet, gateway, UUID, driver, verification, collision and diagnostic fields remain
optional. Configured is not a default. Device Columns is separate from Report
Information. Reset to Defaults restores the exact type-specific order. Supported
custom column order remains intact. Site Location is report-level; Camera Location
is device-level, including its sort label. Reports say Devices, not Devices detected.

Diagnostic Summary defaults to Camera Name, Status, IP, MAC Last 6, Diagnostic
Summary and Last Verified. It retains tested diagnostic evidence and the same
report-level metadata separation; inventory's seven fields are not forced on it.

## Renderer, Report Set and compatibility

The existing native PDF builder, fonts, drawing primitives, preview/export routes,
CSV/JSON and history foundation remain. Portrait stays default and explicit
landscape stays available. Eight-point table text wraps with weighted column widths.
Tall rows continue across pages without ordinary Notes truncation. Wide optional
selections use panels of at most seven columns and repeat Camera Name when selected.
Page estimates use actual inventory layout and history pagination.

Phase 9's state and identity policy are unchanged. Current and retained members
export with Name, MAC Last 6, manufacturer/model, serial and Notes. Missing rows
need no rediscovery. IP moves retain one membership; distinct same-IP cameras stay
separate. Report generation does not clear membership or dirty a clean Project.
Membership changes still create no generated-report history entries.

There are no persisted report presets or per-project report column schemas to
migrate. Existing NAME configurations retain their camera data with the corrected
label. Supported separate manufacturer/model columns retain data and order.
Unknown/report-level device-column keys are ignored, with safe defaults if none
remain. No project schema version changes or rewrites of old reports occur.

Existing report sanitization remains and additionally rejects credential-bearing
URLs. Raw credentials/provider payloads are not report input. Sensitive text causes
a controlled rejection; Phase 9 snapshots continue to omit sensitive fields.

## Validation

- Initial new test-first baseline: 14 passed, 26 failed, reproducing the requested
  date, default, metadata, MAC and long-note problems.
- Phase 10 focused: 77 passed (53 model/renderer, 24 actual HTTP/export/history).
- Phase 1–9 focused: 398 passed (50 / 46 / 46 / 42 / 43 / 39 / 46 / 29 / 57).
- Full regression: 2,490 assertions passed across 67 test files.
- New Phase 10 browser checks: 35 passed.
- Existing browser checks: 265 passed (Report Set 24; Phase 8 34; Phase 7 33;
  Phase 6 15; Phase 5 13; background collisions 13; Tasks 25; field workflow 25;
  V1 integration 28; scan/monitoring 41; retained network 14).
- Browser total: 300 passed. Final failures/skips: 0 / 0.
- TypeScript, production build and `git diff --check`: passed.
- Poppler visual review: inventory, Diagnostic Summary and all four long-Notes
  pages; headers, body, continuation, footer and page numbering remain readable.
  All 300 long-note tokens are also checked in generated PDF content.

Date coverage includes pre/post local midnight, UTC-next-day, positive offset,
DST transition and winter non-DST examples. Browser checks verify defaults, reset,
optional fields, diagnostic defaults, report-only metadata, local filename and
history context. Prior attention, collision/access and retained-network browser
checks pass unchanged.

Existing tests were updated only for the explicitly changed contract: Camera Name,
Camera Location, truthful Devices wording, optional Configured, and exact new page
counts for wrapped rows or horizontal panels. Assertions were not weakened.

The known Windows Node `uv_os_get_passwd` / ENOMEM issue was reproduced and the
authorized TEMP-only identity shim used. It is removed after validation, with
NODE_OPTIONS not persisted. UI-only Vite and isolated HTTP fixtures were used;
the production hardware backend was not started.

## Files changed

- `src/shared/report_configuration.ts`: shared labels/defaults and generation context.
- `src/core/reporting/report_service.ts`: metadata, canonical fields, local dates,
  diagnostic defaults and wrapped/paginated native PDF tables.
- `src/server/report_routes.ts`: expose successful export generation context internally.
- `src/server/task_routes.ts`, `src/core/tasks/task_manager.ts`,
  `src/shared/tasks.ts`: carry normalized generation metadata into report Tasks.
- `src/ui/components/SiteSurveyReportModal.tsx`: report information/column controls,
  reset, timezone and preview/export integration.
- `src/ui/components/Tasks.tsx`: generation context in existing Task details.
- `src/test/report_architecture.test.ts`, `src/test/report_architecture_routes.test.ts`,
  `src/test/browser/report_architecture.cjs`: focused regressions and visual fixtures.
- `src/test/reporting.test.ts`, `src/test/report_history.test.ts`,
  `src/test/report_route_integration.test.ts`,
  `src/test/field_validation_cleanup.test.ts`,
  `src/test/field_validation_corrections.test.ts`: corrected contract expectations.
- This closeout document.

## Remaining limits and physical retest

The existing PDF font/encoding foundation remains ASCII-oriented: unsupported
Unicode characters are transliterated/replaced. CSV/JSON preserve Unicode. Long
notes can produce many pages; no arbitrary note truncation is introduced. The
renderer retains its existing Project history entry caps and notices. Wide custom
column sets produce additional panels/pages instead of shrinking all text.

Report Set remains backend-session state and clears on backend restart. Retained
status/IP remain last-known evidence. Report-only metadata is not a saved preset.
Accurate technician-local output relies on the technician system timezone; direct
API callers should supply timezone when it differs from the backend host.

Physically retest the midnight filename/body/history case in the technician's
timezone, Device Inventory and Diagnostic Summary exports, site/technician metadata,
optional Camera Location/Configured, long Notes and portrait printing. Repeat the
sequential retained-camera Report Set workflow, IP moves and same-IP identities.
Verify no project dirtying, no credential output, and retained Ethernet 192.168.1.205
unchanged. Automated validation makes no physical field-pass claim.

Commit message: `Correct report information architecture and local dates`.
