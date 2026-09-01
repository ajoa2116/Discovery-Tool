# Milestone 13 Readiness Audit

## Production boundaries

- Quick Scan uses real ONVIF WS-Discovery. Test simulation remains under `src/test/support` and has no production activation path.
- Legacy automatic phase execution is disabled. Phase 5 no longer mutates devices or reports simulated provisioning success. The prototype PTZ route explicitly returns Unsupported and sends no camera command.
- Dead main-UI prototypes (`FastScanHero`, `ExecutionPipeline`, `DeviceGrid`, old `DeviceConfigModal`, unused `TaskCenter`, and the global Available IP Finder) were removed. Candidate addresses remain available only inside configuration workflows that perform live checks.
- New-device notification is driven only by a stable identity absent from the active project/session before discovery. Project open and enrichment do not trigger it.

## Safety review findings

- Pair snapshots DHCP/static IPv4, gateways, DNS mode/servers, and adapter identity; rechecks administrator privilege, adapter fingerprint, and candidate availability before apply; persists recovery before mutation; verifies restore; never auto-Pairs.
- Single and bulk configuration keep credentials backend-only, require preview and confirmation, revalidate targets, distinguish response from verification, preserve identity/IP history, block ambiguity, bound concurrency, and retain partial results.
- Vendor providers use bounded/cancellable requests, normalized safe errors, target validation, and explicit Unsupported results. Real vendor behavior still requires hardware testing.
- Duplicate remediation retains stable collision IDs, requires targetability/isolation proof, executes one device at a time, rechecks the shared IP, preserves partial resolution, and never auto-Pairs.

## Packaging readiness

- Current host: Node + Vite frontend + local Express/WebSocket backend. No Electron, Tauri, installer, or desktop lifecycle host is present.
- A future Windows package needs an approved desktop host/service lifecycle, elevation strategy limited to Pair, Windows Credential Manager access, localhost port/firewall guidance, code signing, installer/uninstaller ownership, application-data/recovery paths, and optional `.cctvproj` association.
- Do not introduce a desktop framework without a separate architecture decision and approval.

## Runtime and dependencies

- Recommended development/build runtime: Node 22 LTS. Node 24.19.0 intermittently fails inside `tsx` at `os.userInfo()` with `uv_os_get_passwd ... ENOMEM` on this host; a runner-level preload allowed validation. No product workaround was added.
- React/Vite, Express/ws, Lucide, CORS, and build/type tooling are active. Source audit found no current imports of `clsx`, `tailwind-merge`, `fast-xml-parser`, or `sql.js`; they are removal candidates for a separately reviewed dependency-cleanup change. They were not removed here to avoid unrelated lockfile/runtime churn. No major upgrade was attempted.

## Remaining physical validation

All real camera discovery, Pair/Restore, credentials, configuration writes, vendor-native behavior, duplicate remediation, UI density, firewall/multicast behavior, and report accuracy against connected hardware remain pending. See `FIELD_VALIDATION.md`.
