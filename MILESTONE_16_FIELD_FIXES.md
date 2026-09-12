# Milestone 16 — first camera field fixes

Baseline: `codex/milestone-15b5-bulk-scope`, commit `5d2c94732e46fd7661509676c3e23e64fb9e7a40`.
Implementation branch: `codex/milestone-16-first-camera-field-fixes`.
Master Blueprint v1.1 remains authoritative. This change reuses the existing inventory, identity reconciliation, discovery pipeline, diagnostics, Pair state machine, recovery store, and table.

## Audit before implementation

| Boundary | Starting implementation and finding |
|---|---|
| A. Quick Scan | Phase 1 IPv4 topology, Phase 2 disabled passive provider, Phase 3 ONVIF probes/enrichment, Phase 4 identity reconciliation. No production packet capture. |
| B. Incremental discovery | Reuses the same pipeline with existing cancellation, monitoring deferral, identity matching, and new-device notification rules. Same discovery blind spots. |
| C. Advanced Scan | Optional pipeline scan followed by bounded ICMP/TCP target checks. NEIGHBOR selection did not enumerate neighbors; it could invoke the full pipeline, including ONVIF. |
| D. WS-Discovery sockets | One UDP4 socket per adapter, bound to that IPv4 address on an ephemeral port; outbound multicast interface explicitly selected. No membership or port-3702 listener. Only ProbeMatch accepted. |
| E. Neighbor/ARP | `WindowsNeighborProvider.lookup` only enriched known targets or supported candidate checks. A disabled passive provider could not detect gratuitous ARP. The app cannot see everything Wireshark sees. |
| F. Target versus evidence | Planner generates up to 4096 unique targets. Executor only stores successful checks, but Windows ping exit-code interpretation could incorrectly call an ICMP error a success. |
| G. Unknown rows | `AdvancedScanService` creates an `advanced:<ip>` record for positive transport evidence. `WindowsPingProvider` treated exit code zero as sufficient proof, including Windows unreachable responses. |
| H. Network relationship | Classified during ONVIF enrichment from discovery-interface topology. Manual onboarding did not calculate it. Storage also incorrectly promoted any reachability object to VERIFIED on update. |
| I. Pair eligibility | Actions required DIFFERENT_SUBNET status. Manual records remained UNKNOWN. Preparation also required a camera subnet mask, which manual records intentionally lack. |
| J. Candidate search | Existing network arithmetic excludes camera, known-device, local, network, and broadcast addresses; at most 32 positions examined and 3 candidates returned; neighbor/ICMP/TCP checks retained. |
| K. Pair/recovery | Preview captures DHCP/static IPv4, gateways and DNS. Explicit confirm, administrator check, baseline check, candidate recheck, recovery persistence before apply, verification, and explicit Restore already exist. |
| L. Manual Add | Trimmed input, permissive Number-based IPv4 validation, colon-only MAC validation, generic placeholders. Optional MAC intentionally supported. |
| M. Table sorting | Incoming filtered array rendered directly; stable-ID keys, selection, and action callbacks already exist. Headers were static. |

## Root causes and changes

**FIELD-DISC-02:** confirmed software blind spots were missing multicast Hello reception and missing neighbor enumeration. No existing off-subnet XAddr rejection was found. The reported UDP/3702 traffic alone does not establish whether the physical camera sent a valid ONVIF Hello or ProbeMatch; exact packet-level attribution remains unproven without captured XML or hardware retest.

The existing transport now listens on shared UDP4 port 3702 and joins 239.255.255.250 for selected adapters, alongside existing adapter-bound probes. A Hello must contain well-formed bounded XML, correct SOAP/discovery/addressing namespaces, endpoint UUID, and ONVIF scopes. DTD/entities, malformed packets and generic non-ONVIF announcements are rejected. Multiline scopes/XAddrs and endpoint whitespace are accepted. A message-header UUID cannot become device identity. Source IPv4 and advertised XAddrs remain separate; an off-subnet address is retained.

Hello records carry an announcement timestamp and NOT_VERIFIED, without a successful unicast-contact timestamp. With one selected adapter, the known subnet relationship can be shown. With multiple multicast memberships, Node dgram does not supply the receiving interface index, so the listener does not invent one; Pair eligibility uses a separate fresh topology calculation. The Windows network stack performs UDP fragment reassembly; the parser rejects incomplete XML rather than combining unrelated datagrams.

Windows neighbor enumeration now feeds Phase 2 through the existing passive-provider interface. Only valid IPv4/unicast-MAC entries attributable to selected interface indexes are accepted. Incomplete/unreachable entries and local addresses are excluded. Cached neighbor presence remains NOT_VERIFIED. No raw packet-capture driver was added.

**FIELD-PAIR-01:** missing manual topology classification, a status-only UI gate, the mask prerequisite, and the storage verification shortcut together blocked the field workflow. Manual Add now calculates the relationship using current topology, preferring eligible Ethernet when no adapter is explicitly supplied. An Actions-menu lookup recalculates eligibility for existing or reopened records without changing inventory or networking. Valid off-subnet targets do not need ICMP, HTTP, or ONVIF success. Local targets, duplicate IPs and identity conflicts are blocked by the backend; confirmation rechecks target/IP ambiguity and local/known candidate occupancy.

When the camera mask is unknown, Pair proposes a temporary prefix derived from the selected adapter and labels it `ADAPTER_PREFIX_PROPOSAL`. It does not persist that as the camera's actual mask. For the field Ethernet /24, candidates are in 192.168.1.0/24 and exclude .0, .255 and camera .100. The conservative candidate check is evidence-based, not a guarantee that a silent or unroutable address is unused; preview retains its evidence. No automatic Pair was added. Pair changes only the explicitly selected adapter; the field test selects Ethernet and leaves Wi-Fi alone. Camera IP, credentials and configuration are untouched. Restore preserves the existing snapshot workflow and recalculates the device's network relationship afterward.

**FIELD-ADV-01:** ping must contain an echo reply from the exact target with IPv4 TTL evidence, not merely a zero process exit code. Failed/silent checks advance completed-target counts without inventory rows. Positive ICMP/TCP still supports unknown network devices. Responses on shared IPs are marked identity-ambiguous and never assigned to just the first device. Include Unknown remains a presentation filter on evidence-backed inventory. Progressive results, cancellation, bounds and local-host exclusion remain intact.

**Field UI:** shared manual-input validation accepts trimmed strict dotted IPv4 and colon, hyphen or compact MAC, normalized to lowercase colon notation. Malformed MAC, multicast/broadcast MAC and missing IPv4 are rejected; omitted MAC remains null. Address examples and validation guidance appear in the form. Name, Status, numeric IPv4, MAC Last 6, Configured and Serial headers toggle ascending/descending, display accessible indicators, and keep unknowns last with stable-ID tie-breaking. Notes and Actions are not sortable. Selection and current action targets remain ID-based.

**Diagnostics/support:** Different Network is explained independently of verification and never becomes Offline/Failed solely from failed off-subnet checks. Support output adds safe topology/Pair eligibility, preview source/candidate, checked versus evidence-backed target counts, and WS-Discovery accepted/rejected counts and bounded interface warnings. Existing sanitization and timeline bounds remain. No credentials or packet bodies are included in these additions.

## IPv6 and remaining physical limits

Discovery uses UDP4, Phase 1 selects IPv4 and neighbor enumeration requests IPv4. IPv6 link-local presence is not retained. Preserve future IPv6 presence as a separate evidence type with scope/interface identity before considering management; no IPv6 configuration or Pair system was added here.

The multicast listener exists only during a scan window. Boot announcements outside that window, absent neighbor-cache entries, firewall/membership failures, and unicast routing constraints may still prevent automatic discovery. A manually entered known IP can now reach the existing Pair preview. Hardware testing must determine whether Camera #2's actual announcements satisfy the ONVIF boundary and whether the proposed subnet/address works on the physical network.

Protocol references: [ONVIF Core specification](https://www.onvif.org/specs/2512/ONVIF-Core-Spec-v2512.pdf) describes multicast Hello announcements; [Node UDP documentation](https://nodejs.org/download/release/latest-jod/docs/api/dgram.html) documents membership and socket binding. These references support the implementation design, not a claim of physical validation.

## Validation record

The deterministic fixture in `src/test/support/first_camera_field.ts` represents Hanwha Vision, MAC E4:30:22:CD:68:85, camera 192.168.1.100, and Ethernet 192.168.0.124/24. It is software evidence only. Focused tests: 147 assertions (80 field workflow, 26 discovery, 41 ping evidence). Full regression: 41/41 files, 1,150 passed assertions, 0 failed, 0 skipped. TypeScript (`npx tsc --noEmit`), production build, and `git diff --check` passed. Vite transformed 1,590 modules. The previously authorized temporary identity shim was used only in the test runner outside the repository and removed before commit; no product runtime workaround was added.

No physical Pair, Restore, camera write, or credential operation is performed by these regression tests; network mutation tests use in-memory adapter services. Hardware retest remains pending.

## Next technician test

1. Start the corrected app with Camera #2 unchanged at 192.168.1.100.
2. Scan Ethernet during the camera's announcement window; inspect discovery/support evidence.
3. If needed, manually add the known IP/MAC and confirm Different Network with Not Verified.
4. Open Pair from Actions, select Ethernet and inspect the original snapshot, proposed temporary address/mask and evidence.
5. Only the technician confirms actual Pair. Verify Ethernet addressing, camera communication, scan/diagnose/connect, then explicitly Restore and verify the original Ethernet configuration.

MILESTONE 16 FIRST CAMERA FIELD FIXES — SOFTWARE VALIDATED / PHYSICAL CAMERA RETEST PENDING
