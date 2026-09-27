# Phase 15A — FIELD-CRED-02 credential suggestion evidence

Starting branch: `codex/post-field-corrections-1`
Starting HEAD: `dbdfcf2107edeb212d3d7b79a92b95dcb011807e`
Commit message: `Expand credential assistance guidance`

## Scope and behavior

Suggestion/presentation only. The existing selection handler remains unchanged: it fills supported editable fields, clears the local saved-reference selection and Remember intent, and performs no request. Authentication and saving remain separate explicit actions. No credential storage, redaction, project schema, discovery identity, networking, or recovery implementation changed. Three pre-existing untracked CCTV trace files were left untouched.

The plural catalog lookup selects the strongest applicable evidence tier: exact model, documented product/firmware generation, manufacturer guidance, then a bounded generic historical section for unresolved manufacturers. A conflicting recognized manufacturer suppresses a known model's guidance. Unsupported named vendors do not receive generic suggestions. Existing single-hint callers remain compatible and do not receive generic references.

QND-7082R retains exact-model initial-password-creation precedence, including when the vendor is unknown. It supplies username guidance without inventing a password. Hanwha/Samsung Techwin/Wisenet and Axis normalization is retained and expanded for model prefixes/spacing; Hikvision, Dahua, and Uniview/UNV are recognized. Hikvision's documented older firmware generation has explicit applicability. Manufacturer fallbacks explain model/firmware uncertainty; Uniview supplies username-only guidance.

Unknown identity receives two separately labeled historical references, each explicitly low applicability and not evidence identifying the camera. Arrays and individual selection buttons support multiple independent suggestions without automatic cycling. Every item shows scope, provenance, evidence quality, and a not-verified statement. Initial setup is prominent. A missing verified URL produces text only. Selected passwords remain masked in the existing input. Saved credentials remain a separate selector and backend store.

## Provenance and limitations

Existing catalog links were preserved. Sources reviewed for the additions:

- [Hikvision camera activation documentation](https://legacy.hikvision.com/sites/default/files/how-to/pnpcameraactivationfrompnpnvrfna01272017.pdf).
- [Hikvision older firmware support](https://supportusa.hikvision.com/support/solutions/articles/17000129931-i-have-a-older-hikvision-camera-on-firmware-5-2-0-after-defaulting-the-cameras-i-can-t-seem-to-be-a). Official indexed article evidence was available; direct automated retrieval failed.
- [Dahua initialization documentation](https://www.dahuasecurity.com/about-dahua/news-events/notice/initialization-and-password-reset-for-networking-cameras-v1).
- [Uniview support login reference](https://cn.uniview.com/Service/Service_Training/Download/Problem/Recorder/202406/819969_194214_0.htm). Catalog keeps textual provenance and no model-specific password or model-specific verified link.
- [Existing Axis 2120 manual](https://www.axis.com/dam/public/c3/3a/f3/axis-2120-users-manual-en-US-30349.pdf) and [Axis setup documentation](https://developer.axis.com/acap/3/get-started/set-up-the-device/) remain accessible.
- The preserved Hanwha America article URL currently redirects to its support portal; this is not represented as a fresh exact-model document verification. Existing QND field evidence remains unchanged.

The catalog is deliberately small. Product-generation support currently uses explicit Hikvision firmware evidence, not inferred model-family prefixes. Guidance is never proof of current credentials; changed passwords and firmware differences remain possible. No physical camera authentication or hardware validation was performed.

## Validation

New focused non-browser checks: **30 passed** (`credential_guidance.test.ts`). New actual Camera Access browser checks: **23 passed** (`credential_guidance.cjs` and isolated fixture). They cover hierarchy, aliases, conflicts, generic labels, independent selection, source handling, editable fields, no mutation requests, unchanged device evidence, saved-reference separation, masking, light-theme contrast colors, keyboard focus/selection, and output isolation.

Related non-browser regressions: **575 passed**:

| Suite | Passed |
| --- | ---: |
| field_workflow | 76 |
| credentials | 19 |
| task_manager | 91 |
| project_persistence | 28 |
| project_history | 39 |
| reporting | 34 |
| report_set | 39 |
| report_history | 38 |
| error_support_evidence | 33 |
| identity_safe_access | 39 |
| v1_integration | 39 |

Existing browser regressions: field_workflow **25**, identity_safe_access **15**, v1_integration **28**, modal_containment **63**. Browser total including new tests: **154 passed**. Final selected validation total: **759 passed, 0 failed, 0 skipped**.

`npx tsc --noEmit`, production `npm run build`, and `git diff --check`: **PASS**. Full regression intentionally not run: shared storage/serialization/redaction implementation did not change, as required by this phase.

Validation troubleshooting: the initial new keyboard test used programmatic focus after mouse input; it was corrected to establish keyboard modality before checking `:focus-visible`, then all 23 checks passed. Node/tsx initially hit the environment's `uv_os_get_passwd` failure; tests used a temporary external userInfo fallback shim, subsequently removed. The first sandboxed build could not resolve Vite configuration through restricted parent directories; the authorized build rerun passed. These were not production regressions. The existing optional-source assertion was adapted to optional chaining while still requiring the Axis URL to exist and match.

Phase 15A complete. No automatic authentication or Phase 15B work included.
