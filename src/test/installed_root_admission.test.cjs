const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

test('installed-root admission observes Windows ACLs, ownership and canonical identities without production authority', { skip: process.platform !== 'win32' }, () => {
  const repo = path.resolve(__dirname, '../..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-installed-root-'));
  const xml = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  const project = path.join(root, 'fixture.csproj');
  fs.writeFileSync(path.join(root, 'fixture-marker'), 'isolated-installed-root-fixture');
  const junction = path.join(root, 'junction/application/v1/redirect'), outside = path.join(root, 'private-outside-stage');
  fs.mkdirSync(path.dirname(junction), { recursive: true }); fs.mkdirSync(outside);
  fs.symlinkSync(outside, junction, 'junction');
  fs.writeFileSync(project, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0-windows</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><EnableDefaultCompileItems>false</EnableDefaultCompileItems></PropertyGroup><ItemGroup>${[
    'native/ApplicationCompanion/InstalledRootAdmission.cs', 'native/ApplicationCompanion/WindowsBoundary.cs',
    'src/test/support/installed_root_admission_fixture.cs',
  ].map(file => `<Compile Include="${xml(path.join(repo, file))}" />`).join('')}</ItemGroup></Project>`);
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA', 'USERPROFILE', 'APPDATA'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
  env.DOTNET_CLI_TELEMETRY_OPTOUT = '1'; env.DOTNET_NOLOGO = '1';
  const run = args => spawnSync('dotnet', args, { cwd: root, env, shell: false, windowsHide: true, encoding: 'utf8', timeout: 60000 });
  try {
    const build = run(['build', project, '-c', 'Release', '--disable-build-servers', '--ignore-failed-sources', '-p:NuGetAudit=false']);
    assert.equal(build.error, undefined); assert.equal(build.status, 0, build.stdout + build.stderr);
    const child = run([path.join(root, 'bin/Release/net10.0-windows/fixture.dll'), root]);
    fs.writeFileSync(path.join(root, 'build.log'), build.stdout + build.stderr);
    fs.writeFileSync(path.join(root, 'result.stdout'), child.stdout); fs.writeFileSync(path.join(root, 'result.stderr'), child.stderr);
    assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stdout + child.stderr);
    const report = JSON.parse(child.stdout);
    assert.equal(report.passed, true); assert.equal(report.productionAuthority, false); assert.equal(report.raceFree, false);
    const positive = report.results.find(r => r.name === 'protected-scoped-positive').evidence;
    assert.equal(positive.ObservedScopeProtected, true); assert.equal(positive.CompleteAncestry, false); assert.equal(positive.InstalledRootAdmitted, false);
    assert.ok(positive.Facts.every(f => (f.EffectiveGranted & f.Forbidden) === 0));
    const strict = report.results.find(r => r.name === 'strict-full-ancestry-denies-temporary-root').evidence;
    assert.equal(strict.CompleteAncestry, true); assert.equal(strict.InstalledRootAdmitted, false);
    assert.ok(strict.Facts.length > 0, 'Strict verification must inspect real ancestor security, not reject drive syntax.');
    assert.ok(['effective-token-mutation','ordinary-principal-mutation','ordinary-owner-control'].includes(strict.Denial), strict.Denial);
    assert.ok(report.results.filter(r => r.evidence?.Denial).length >= 20);
    assert.ok(report.results.some(r => r.name === 'junction-to-private-outside-stage' && r.evidence.Denial === 'reparse-point'));
    // All verifier/restore handles have been disposed: ordinary rename is possible.
    const payload = path.join(root, 'positive/application/v1/backend.cjs'), moved = payload + '.moved';
    fs.renameSync(payload, moved); fs.renameSync(moved, payload);
    const cases = fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && !['bin','obj','private-outside-stage'].includes(entry.name));
    for (const entry of cases) {
      const original = path.join(root, entry.name), parked = original + '.cleanup-check';
      assert.ok(path.relative(root, parked) && !path.relative(root, parked).startsWith('..'));
      fs.renameSync(original, parked); fs.renameSync(parked, original);
    }
    fs.unlinkSync(payload);
    fs.writeFileSync(path.join(root, 'cleanup.json'), JSON.stringify({ caseDirectoriesRenamed: cases.length, ordinaryPayloadDeleted: true,
      fixtureProcessExited: child.status === 0, productionAuthority: false }, null, 2));
    console.log('Installed-root evidence: ' + root);
  } finally {
    // Preserve only external evidence, matching the existing staging fixtures.
    // Remove the private junction explicitly; never recursively traverse its target.
    fs.rmdirSync(junction);
  }
});
