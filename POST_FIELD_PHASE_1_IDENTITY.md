# Post-field corrections — Phase 1

Branch: `codex/post-field-corrections-1`.
Starting HEAD: `eeaebc82d79865ae057c32e42f47c725872a26f2`.
Master Blueprint v1.1 remains authoritative. Phase 1 only; no physical pass claimed.

## Tests first

Added canonical_identity.test.ts before production edits. Baseline: 9 passed,
29 failed. Failures demonstrated ambiguous first-match selection in both orders,
cross-type serial matching, inconsistent storage/import/Reverify/transport MAC
canonicalization, null-anchor erasure, transport ID replacement, and invalid MAC
acceptance. Additional tests during review caught metadata overwrite, UUID-only
replacement-review compatibility, and rediscovery with a reused serial.

Final focused result: 50 passed, 0 failed, 0 skipped. Coverage includes T01–T04,
T07–T08, typed fallback, conflicting UUIDs/MACs, invalid anchors, stable IDs,
technician metadata, UUID-only discovery and explicit replacement review.

## Implementation

Shared identity_policy canonicalizes legitimate unicast MACs and compares typed
MAC/UUID/serial evidence. Known MAC or UUID conflicts rule candidates out. More
than one compatible candidate is ambiguous unless an exact existing record ID
provides continuity and all partial records are mutually compatible; this retains
the existing tested late-evidence consolidation contract. No arbitrary first
physical-match selection is used for ambiguous incoming observations.

Database/import/export, Reverify, Add to Existing Project, transport and discovery
normalizers reuse the policy. Null/absent evidence preserves established anchors.
Transport strengthening retains existing Device.id. Database reconciliation
preserves technician metadata and IP history. UUID-only replacement still requires
the existing explicit technician decision; address-based candidate lookup does
not authorize an automatic identity merge.

One existing Reverify growth fixture generated a zero MAC. Its fixture now uses
ten legitimate unique unicast MACs; all existing assertions are unchanged. No test
was weakened. The database's existing live-reference insertion contract remains
intact.

## Validation

- 56 regression files passed, 0 failed. 2,026 passing assertions (1,985 individual
  PASS records plus the ping-evidence suite's 41-assertion summary).
- Standalone TypeScript: passed.
- Production build (TypeScript, Vite, build identity): passed.
- git diff --check: passed.
- No separate live-browser run: no UI behavior was changed. Existing browser-boundary
  and UI regression files are included in the full suite.

## Deferred

MAC formatting validation is not proof of physical ownership. Ambiguous ARP
assignment and authenticated vendor identity validation remain Phase 2 risks.
No collision UI/lifecycle, monitoring, Pair state, Match Network, credentials,
diagnostics UI, modal, project schema, or production multicast strategy changes.
Three pre-existing untracked trace files were not read or modified.
