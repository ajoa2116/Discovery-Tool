# Phase 17A — Dedicated Camera Browser workspace

Branch: `codex/post-field-corrections-1`

Starting HEAD: `a8951051697986c27461fa0e317d1347dec68658`

Commit message: `Add dedicated Camera Browser workspace`

## Structure and boundaries

Embedded preference and the Inspector's Open Camera action now open a dedicated full-window Camera Browser region. The selected stable Device.id resolves against the current inventory. Its compact header shows technician name/vendor, model, current IP, MAC Last 6 when available, and observed status. The content region receives most of the desktop. The compact toolbar provides disabled Back/Forward, Refresh, address, Open External, Recheck, and More / technician tools. No generic address input is provided.

Credential Assistance opens as a secondary dialog. Its previous iframe is removed. Factory selection, saved-reference separation, explicit saving, and credential policy are unchanged. Inspector and Configuration navigation leave the workspace for the existing separate tools. No camera configuration forms are added to the workspace.

The workspace calls the existing Phase 6 decision locally and requires matching backend approval for the same device ID/current IP before embedding. Endpoint navigation is restricted to HTTP(S), the selected device's IP, and no URL credentials. Identity changes cancel obsolete requests and immediately revoke old approval. Reordering does not change the selected device. Active duplicate-IP ambiguity blocks embedding and external access and provides the existing Duplicate Assistant action. Resolved collisions, reopened collisions, stale saved addresses, and identity conflicts retain their original safety rules.

Open External uses the existing SYSTEM launcher endpoint, which performs its own current access check. Acknowledgment explicitly does not verify login or page rendering. Recheck sends an empty body to the existing diagnostic endpoint and reloads current approval; no credentials, camera configuration, or Windows network changes are submitted. Blocked access disables Recheck and explains the required Scan/Reverify or ambiguity workflow.

## Temporary renderer and FIELD-UI-07

The existing sandboxed iframe is retained only in the workspace. No WebView2, Electron, packaging changes, certificate bypass, camera scraping, CSP/X-Frame-Options workaround, or automatic credentials were added.

Cross-origin iframe onload cannot reliably establish successful page rendering. An unconfirmed attempt therefore has a 12-second bound, with explicit copy and Page visible — keep open / Page not displaying actions. The former only keeps the renderer visible; it is not an identity, reachability, or authentication verification. An error, unconfirmed timeout, certificate warning, or incompatible secure-context scheme produces a compact light fallback without retaining a giant empty iframe. Refresh permits another explicit attempt. A previously observed web response is stated separately from renderer compatibility; absent such evidence, reachability is not claimed.

Light surfaces, dark readable text, neutral legible disabled controls, visible keyboard focus, explicit Recheck feedback, and a neutral unavailable Delete action address FIELD-UI-07. The workspace uses existing focus/scroll protection, and the secondary dialog retains Phase 13A containment.

## Validation

New focused actual-App browser suite: **30 passed**. It covers Embedded routing, tool separation, content priority, identity header, unsupported history, external acknowledgment, reorder safety, light failure state, bounded fallback, Recheck payload, credential selection, disabled Delete, small viewport, focus, duplicate/stale/conflict blocking, resolution, reopening, and Inspector/Configuration navigation. Camera URLs are intercepted; backend APIs are mocked.

Related non-browser suites: identity_safe_access **39**, duplicate_assistant **46**, duplicate_remediation **34**, credential_guidance **30**, credentials **19**, field_workflow **76**, camera_configuration **40**, truthful_configuration_boundary **20**, technician_attention **29**, browser_boundary **222**, v1_integration **39**. Total **594 passed**.

Existing browser suites: identity_safe_access **15**, credential_guidance **23**, field_workflow **25**, modal_containment **63**, v1_integration **28**, duplicate_assistant **33**, inline_actions **19**, technician_attention **34**. Related browser **240 passed**; with the new suite, **270 passed across nine suites**.

Final selected validation: **864 passed, 0 failed, 0 skipped**. TypeScript, production build, and diff check passed. The full application regression suite was not run: shared Phase 6 policy and backend access/authentication/networking behavior are unchanged.

During validation, the old Duplicate Assistant browser locator timed out because it expected the retired Camera Access container; the three affected integration suites now target the dedicated region, retaining their original safety assertions. A wall-clock timeout check was replaced with controlled browser-clock advancement and passed. No existing assertion was removed to hide a regression.

## Files and limitations

Production changes: App workspace routing; new CameraBrowserWorkspace; BrowserModal credential-tool separation and readability. Tests: new camera_workspace browser suite and three existing suites' container/close locators. This document records closeout.

Phase 17A still uses the existing embedded renderer. Some camera interfaces remain incompatible until a future desktop webview implementation. Back/Forward remain disabled. The browser cannot automatically distinguish every cross-origin rendering failure, so visible-page confirmation is a technician action and does not verify login. Physical camera/browser acceptance remains pending. No real camera authentication, Windows adapter mutation, actual recovery-file modification, or trace-file access was performed. The three original untracked CCTV trace files remain untouched.

Stop after Phase 17A; no Phase 17B or WebView2 work included.
