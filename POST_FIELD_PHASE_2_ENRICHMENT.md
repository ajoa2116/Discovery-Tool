# Post-field corrections — Phase 2

Branch: `codex/post-field-corrections-1`.
Starting HEAD: `1a7298be3807729c2dbe7db8ea8e1ede6aab5af1`.
Master Blueprint v1.1 remains authoritative. Phase 2 only; physical retest pending.

## Tests-first evidence

New safety suite ran against unchanged Phase 1 implementation: 7 passed,
25 failed. Failures reproduced T05/T06 in both arrival orders and before/between/
after neighbor timing, unproven single-row and Pair promotion, invalid neighbor
anchors, and authenticated MAC/serial contamination. Additional regressions cover
provenance, proof freshness/interface, immutable proof capture, retained conflicting
observations, typed serial strengthening, provider authorization invalidation, and
all invalid vendor MAC categories. A serial-only proof regression failed before
neighbor promotion was tightened to require explicit UUID corroboration.

## Exact neighbor promotion rule

Neighbor evidence is recorded first and bounded to the last eight observations.
It cannot replace an established MAC. An unknown MAC can be promoted only if:

1. Phase 1 canonical validation accepts the MAC as a unicast device address.
2. Neighbor IP and interface match the target's current address and adapter.
3. Neighbor evidence is not Incomplete/Unreachable.
4. A separate WS-Discovery response observation, captured from the raw response before transport merging or asynchronous
   enrichment, carries that same MAC and matching nonempty ONVIF UUID together.
5. That corroboration is at most 30 seconds old, not future-dated, and has the same
   IP/interface. Typed established anchors do not conflict.

Row count, completion of a discovery window, ping/TCP success, matching descriptive
metadata, and authentication alone do not establish ownership. Serial-only
corroboration does not authorize UUID-specific neighbor promotion. No new probe,
automatic login, or discovery cadence change was introduced.

Without proof, MAC remains unknown and observation is UNBOUND. Conflicting known
MACs are retained; observations are CONFLICT. Invalid observations cannot promote.
The proof lives in session reachability evidence, which project import already
discards. No project schema version migration is needed.

The default production capture uses existing discovery responses. Cameras that
never advertise a UUID/MAC association may therefore remain MAC Unknown despite
having an ARP entry. This is intentional; ARP alone cannot prove the missing
association. Discovery packet evidence is not cryptographic attestation.

## Authenticated provider and Pair paths

Provider confirmation uses Phase 1 typed comparisons. Conflicting MAC or serial,
and invalid supplied MAC, return IDENTITY_CONFLICT before metadata is applied.
Identity-bearing responses without a matching established MAC or serial return
INSUFFICIENT_IDENTITY. Manufacturer/model compatibility is not physical binding.
Matching typed evidence can strengthen missing anchors. Provider selections are
cleared before inspection so a failed subsequent identity check cannot reuse a
previous authorization. Preferred-provider inspection propagates identity failures.

Pair uses the exact same neighbor policy. Adapter apply/verification, PAIRED state,
recovery and Restore behavior are unchanged. Successful ping is communication
evidence only, not MAC ownership. Phase 3 probing is shared by foreground and
incremental discovery; MONITORING-origin integration tests exercise it directly.

## Compatibility and validation

Four legacy positive-test fixtures assumed ARP alone proved ownership. Their
assertions were retained; the fixtures now supply independent discovery ownership
evidence. The per-adapter fixture also supplies the actual interface index.
Negative tests explicitly prove the no-proof counterpart stays unknown. Raw-packet
capture tests additionally reject proof fabricated from aggregated transport anchors.

- Focused Phase 2: 46 passed, 0 failed, 0 skipped.
- Phase 1: 50 passed, 0 failed, 0 skipped.
- TypeScript and production build: passed.
- Full regression: 57 files, 2,072 passing assertions, 0 failed, 0 skipped.
- No live browser or physical camera test was performed; no UI behavior changed.

## Deferred scope

Retained adapter/restart state (Phase 3), monitoring coordination and collision
lifecycle (Phase 4), Duplicate Assistant targeting/UI, Match Network and other UI
work remain unchanged. This phase does not retroactively repair previously
misattributed anchors or promise device-specific writes over an ambiguous IP.
The three existing untracked trace files were not read or modified.
