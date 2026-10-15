const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync, spawn } = require('node:child_process');

test('fixture-only measured input ownership, integrity and lifetime', { skip: process.platform !== 'win32' }, async () => {
  const repo = path.resolve(__dirname, '../..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-measured-input-'));
  fs.writeFileSync(path.join(root, 'fixture-marker'), 'inert-measured-input-lifetime');
  const redirect = path.join(root, 'junction/application/v1/native/redirect');
  const outside = path.join(root, 'junction-target');
  fs.mkdirSync(path.dirname(redirect), { recursive: true }); fs.mkdirSync(outside);
  fs.symlinkSync(outside, redirect, 'junction');
  const xml = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  const sources = ['native/ApplicationCompanion/InstalledRootAdmission.cs', 'native/ApplicationCompanion/WindowsBoundary.cs',
    'src/test/support/installed_root_admission_fixture.cs', 'src/test/support/measured_input_lifetime.cs', 'src/test/support/measured_input_lifetime_fixture.cs'];
  const project = path.join(root, 'fixture.csproj');
  fs.writeFileSync(project, '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0-windows</TargetFramework><StartupObject>MeasuredInputLifetimeFixture</StartupObject><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><EnableDefaultCompileItems>false</EnableDefaultCompileItems></PropertyGroup><ItemGroup>' +
    sources.map(file => '<Compile Include="' + xml(path.join(repo, file)) + '" />').join('') + '</ItemGroup></Project>');
  const env = Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH','ProgramFiles','ProgramFiles(x86)','LOCALAPPDATA','USERPROFILE','APPDATA']
    .flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
  env.DOTNET_CLI_TELEMETRY_OPTOUT = '1'; env.DOTNET_NOLOGO = '1';
  const run = args => spawnSync('dotnet', args, { cwd: root, env, shell: false, windowsHide: true, encoding: 'utf8', timeout: 60000 });
  let ownerPreserved = false;
  const runFixture = args => new Promise((resolve, reject) => {
    // A timeout must NEVER kill an owner that may hold ACL restoration handles.
    const child = spawn('dotnet', args, { cwd: root, env, shell: false, windowsHide: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', settled = false;
    const preserve = reason => {
      if (settled) return; settled = true; ownerPreserved = true; clearTimeout(timer);
      child.unref(); child.stdout.destroy(); child.stderr.destroy();
      try {
        fs.writeFileSync(path.join(root, 'owner-preserved.json'), JSON.stringify({ pid: child.pid, reason, stdout, stderr,
          ownerReviewRequired: true, handlesSurviveExit: false, productionAuthority: false }), { flag: 'wx' });
      } finally { reject(new Error(`${reason}; fixture owner PID=${child.pid} preserved at ${root}. Do not terminate it or clean its files before owner review.`)); }
    };
    const timer = setTimeout(() => preserve('Fixture timeout: process deliberately not killed; cleanup state unknown'), 60000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; if (stderr.includes('FIXTURE_RECOVERY_PENDING')) preserve('Unresolved ACL restoration/handle release'); });
    child.once('error', error => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    child.once('close', (status, signal) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ status, signal, stdout, stderr }); } });
  });
  console.log('Measured-input evidence: ' + root);
  try {
    const build = run(['build', project, '-c', 'Release', '--disable-build-servers', '--ignore-failed-sources', '-p:NuGetAudit=false']);
    fs.writeFileSync(path.join(root, 'build.log'), (build.stdout || '') + (build.stderr || ''));
    assert.equal(build.error, undefined); assert.equal(build.status, 0, build.stdout + build.stderr);
    const child = await runFixture([path.join(root, 'bin/Release/net10.0-windows/fixture.dll'), root]);
    fs.writeFileSync(path.join(root, 'result.stdout'), child.stdout || ''); fs.writeFileSync(path.join(root, 'result.stderr'), child.stderr || '');
    assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stdout + child.stderr);
    const report = JSON.parse(child.stdout);
    assert.equal(report.passed, true); assert.equal(report.allHandlesClosed, true);
    assert.equal(report.recoveryHandlesOpen, 0); assert.ok(report.restorationOwnersReleased > 0);
    for (const mode of ['early', 'late', 'both']) {
      assert.ok(report.results.some(r => r.name === `restore-failure-all-attempted:${mode}` && r.passed));
      assert.ok(report.results.some(r => r.name === `restoration-normal-disposal-no-leaks:${mode}` && r.passed));
    }
    assert.equal(report.productionAuthority, false); assert.equal(report.completeClosure, false); assert.equal(report.raceFree, false);
    assert.equal(report.inputs.length, 9); assert.ok(report.scenarioCount >= 100);
    fs.writeFileSync(path.join(root, 'lifetime-results.json'), JSON.stringify(report, null, 2));
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && !['bin','obj'].includes(e.name))) {
      const before = path.join(root, entry.name), after = before + '.released';
      fs.renameSync(before, after); fs.renameSync(after, before);
    }
    fs.writeFileSync(path.join(root, 'cleanup.json'), JSON.stringify({ fixtureExited: true, originalHandleAssertionsPassed: true, privateDirectoriesRenamed: true, productionAuthority: false }));
  } finally {
    if (!ownerPreserved && fs.existsSync(redirect)) fs.rmdirSync(redirect); // never mutate an unresolved owner's fixture
  }
});
