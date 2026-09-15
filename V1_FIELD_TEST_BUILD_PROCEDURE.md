# V1 Field Test Build Procedure

Run on the normal Windows development/field-preparation host. Use one exact commit for the entire physical run; do not edit source between tests. The source checkout needs development dependencies for tests/build; a future bundled distribution is a separate milestone.

1. Open PowerShell in the project directory. Select the approved milestone commit and verify it:

   ```powershell
   git switch codex/milestone-15b8-field-validation-deployment-readiness
   git log -1 --format="%H %s"
   git status --short
   git diff --exit-code HEAD
   node --version
   npm --version
   ```

   Record the full hash. Any tracked modification requires a new reviewed build; do not discard user files to make this check green. Inspect untracked files: existing field evidence is not application code. No untracked runtime source is permitted in a final pinned build.

2. Install from the committed lockfile, then execute all test files. Do this before going offline:

   ```powershell
   npm ci
   foreach ($FieldTest in (Get-ChildItem src/test -Filter '*.test.ts' | Sort-Object Name)) {
     node --import tsx $FieldTest.FullName
     if ($LASTEXITCODE -ne 0) { throw "Regression failed: $($FieldTest.Name)" }
   }
   npx tsc --noEmit
   if ($LASTEXITCODE -ne 0) { throw 'TypeScript failed' }
   npm run build
   if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
   ```

   Do not suppress failures. If the documented Node/tsx Windows identity error occurs, retain the exact error and use only the previously approved temporary external workaround; never commit it or make it a production dependency. Clear NODE_OPTIONS afterward. Prefer the exact runtime validated for the test run; a runtime change requires rerunning validation.

3. Rehearse browser tests on an isolated UI-only server; backend calls are controlled fixtures. This does not create production devices:

   ```powershell
   npx vite --host 127.0.0.1 --port 5179 --strictPort
   ```

   In a second terminal with Playwright/Edge available, set `PLAYWRIGHT_MODULE` to that host's installed Playwright module if it is not resolvable normally, then run:

   ```powershell
   foreach ($FieldBrowserSuite in @('field_preparation','v1_integration','tasks','field_workflow','post_pair','advanced_scan','scan_monitoring')) {
     node "src/test/browser/$FieldBrowserSuite.cjs"
     if ($LASTEXITCODE -ne 0) { throw "Browser failed: $FieldBrowserSuite" }
   }
   ```

   Stop only this owned Vite process with Ctrl+C afterward. Do not kill all Node processes. If browser tooling is unavailable, retain the prior automated evidence and record the local browser step BLOCKED rather than claiming it ran.

4. Inspect deterministic build identity:

   ```powershell
   Get-Content dist/build-info.json
   git rev-parse HEAD
   git diff --exit-code HEAD
   ```

   Version and full commit must match the approved build; dirty must be false for the final pinned run. Source digest identifies runtime source/configuration, not a signing certificate or dependency-integrity guarantee. The build command writes metadata after Vite. Rebuild after any source/commit change. A non-Git package has null commit rather than a fabricated hash; use its source digest plus externally recorded release provenance. Missing/malformed manifest is shown as unavailable.

5. With cameras disconnected, verify no unrelated listener occupies port 3001; investigate conflicts without killing unrelated processes. Start production in this terminal:

   ```powershell
   Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
   npm run start:production
   ```

   In a second terminal:

   ```powershell
   npm run smoke:production
   if ($LASTEXITCODE -ne 0) { throw 'Production runtime smoke failed; do not start camera tests' }
   ```

   Smoke makes only GET `/`, GET `/api/discovery/status`, then opens/closes `/ws` with a normal close code. Each stage has a deadline and failures exit 1 with actionable text. It starts no backend, scan, camera operation or adapter mutation. Default is `http://localhost:3001`; an explicit loopback origin can be supplied for isolated script regression testing, not as an undocumented app-port fallback.

6. Open **http://localhost:3001** consistently. Confirm Quick Work, zero stale inventory, idle foreground Scan and truthful monitoring. Settings → Diagnostics & Support → **Refresh Field Readiness**; record warning scope. Settings → About: compare version, commit/source digest and production mode. Download Safe Support Bundle; compare `application.build` to `dist/build-info.json`, check readiness/Tasks/scan/recovery evidence and locally verify secrets are absent. Save one empty project/report/download to the actual destination; preflight app-data writability does not certify Downloads.

7. Rehearse no-camera Normal Scan/Stop/completion, bounded Advanced validation/zero results, empty Tasks/project/history/report, Tools → Network Adapter validation only, Settings and support. Do not Apply temporary adapter state just for rehearsal. Use existing isolated browser fixtures for credential hints/access; do not insert fake cameras into the live inventory. Credential Manager has no separate top-level screen; explicit saved references are exposed in Camera Access, so live zero-camera credential editing is not applicable.

8. Stop via Ctrl+C, wait for shutdown, inspect port 3001, then restart the same build and rerun smoke. Closing the browser alone does not stop the backend. Do not intentionally interrupt adapter APPLYING/VERIFYING or a camera write. If port binding is denied in Codex but works on the normal host, record host-specific evidence separately. Omar's supplied 15B.7 normal-host HTTP/API/WebSocket pass is accepted historical evidence, not a claim this new smoke command was already run there.

9. Create a private evidence directory `<date>-<commit-short>` outside the repository. Copy the blank result/defect templates, record timezone and both camera inventories. Verify selected Ethernet, full original DHCP/static/IP/prefix/gateway/DNS, clear recovery, intended unique camera IPs, authorized privately held credentials and saved project. Begin FV-01 in `V1_PHYSICAL_FIELD_VALIDATION_PLAN.md` when cameras return.

No installer or signing prerequisite is imposed for Gate A's authorized isolated lab run. Gate B remains pending final physical evidence and distribution work. Restore and independently verify PC/camera state after the run; never leave accidental duplicate IPs or erase a failed recovery warning without restoration.
