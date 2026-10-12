param([string]$Inputs = 'C:\Users\Omar\AppData\Local\Temp\discovery-addon-inputs-992d859955ac47ecb13986c9e204af15')
$ErrorActionPreference = 'Stop'
$bridgeRoot = Split-Path $PSScriptRoot -Parent
$bridgeVs = 'C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools'
$bridgeMsvcVersion = (Get-Content -LiteralPath (Join-Path $bridgeVs 'VC\Auxiliary\Build\Microsoft.VCToolsVersion.default.txt') -Raw).Trim()
$bridgeMsvc = Join-Path $bridgeVs ('VC\Tools\MSVC\' + $bridgeMsvcVersion)
$bridgeCompiler = Join-Path $bridgeMsvc 'bin\Hostx64\x64\cl.exe'
$bridgeSdk = 'C:\Program Files (x86)\Windows Kits\10'
$bridgeSdkVersion = '10.0.26100.0'
$bridgeHeaders = Join-Path $Inputs 'node-v24.19.0-headers.tar.xz'
$bridgeLibrary = Join-Path $Inputs 'node.lib'
foreach ($bridgeCheck in @(@($bridgeHeaders,'435da86ef9c54c76624240628ca4bc98c8d807398a86c9ed4aea166a3dc0bcf2'),@($bridgeLibrary,'63ec831bbf164d1b23197d6fac1944dfb146534e332889ca0755d250e8dedff9'),@('C:\Program Files\nodejs\node.exe','3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237'))) {
  if ((Get-FileHash -LiteralPath $bridgeCheck[0] -Algorithm SHA256).Hash.ToLowerInvariant() -ne $bridgeCheck[1]) { throw 'Build input/runtime mismatch; stop.' }
}
foreach ($bridgeRequired in @($bridgeCompiler,(Join-Path $bridgeSdk ('Include\'+$bridgeSdkVersion+'\um\Windows.h')),(Join-Path $bridgeSdk ('Lib\'+$bridgeSdkVersion+'\um\x64\kernel32.lib')))) {
  if (!(Test-Path -LiteralPath $bridgeRequired)) { throw ('Missing approved tooling: '+$bridgeRequired) }
}
$bridgeOut = Join-Path $env:TEMP ('discovery-bridge-build-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $bridgeOut | Out-Null
$bridgeArchiveList = @(& tar.exe -tf $bridgeHeaders)
if ($LASTEXITCODE -ne 0 -or $bridgeArchiveList.Count -gt 20000 -or @($bridgeArchiveList | Where-Object { $_ -notlike 'node-v24.19.0/*' -or $_ -match '(^|/)\.\.(/|$)|^[\/]|^[A-Za-z]:' }).Count) { throw 'Unsupported headers archive.' }
& tar.exe -xf $bridgeHeaders -C $bridgeOut
if ($LASTEXITCODE -ne 0) { throw 'Headers extraction failed.' }
$bridgeOwnerDir = Join-Path $bridgeRoot 'native\ApplicationCompanion\bin\Release\net10.0-windows'
$bridgeOwnerNames = @('ApplicationCompanion.exe','ApplicationCompanion.dll','ApplicationCompanion.deps.json','ApplicationCompanion.runtimeconfig.json')
$bridgeOwnerRecords = @($bridgeOwnerNames | ForEach-Object { $bridgeOwnerPath=Join-Path $bridgeOwnerDir $_; @{ path=$bridgeOwnerPath; sha256=(Get-FileHash -LiteralPath $bridgeOwnerPath -Algorithm SHA256).Hash.ToLowerInvariant() } })
$bridgeOwnerHeader = 'struct OwnerMeasurement { const wchar_t* path; const char* sha256; }; static const OwnerMeasurement ownerMeasurements[] = {' + "`n"
foreach ($bridgeOwnerRecord in $bridgeOwnerRecords) { $bridgeOwnerHeader += ' { L"' + $bridgeOwnerRecord.path.Replace('\','\\') + '", "' + $bridgeOwnerRecord.sha256 + '" },' + "`n" }
$bridgeOwnerHeader += '};'
Set-Content -LiteralPath (Join-Path $bridgeOut 'owner_measurements.h') -Value $bridgeOwnerHeader -Encoding utf8
$bridgeSetup = Join-Path $bridgeVs 'VC\Auxiliary\Build\vcvars64.bat'
$bridgeEnvironment = & $env:ComSpec /d /s /c ('call "'+$bridgeSetup+'" >nul && set')
if ($LASTEXITCODE -ne 0) { throw 'Compiler environment failed.' }
foreach ($bridgeEnvironmentLine in $bridgeEnvironment) { if ($bridgeEnvironmentLine -match '^([^=]+)=(.*)$' -and $matches[1] -notin @('HOME','CODEX_HOME')) { [Environment]::SetEnvironmentVariable($matches[1],$matches[2],'Process') } }
$env:VSLANG='1033'
$bridgeArguments = @('/nologo','/LD','/std:c++20','/EHsc','/MT','/O2','/W4','/WX','/showIncludes','/DNAPI_VERSION=8','/DNODE_GYP_MODULE_NAME=node_owner_bridge',
  ('/I'+(Join-Path $bridgeOut 'node-v24.19.0\include\node')),('/I'+$bridgeOut),
  (Join-Path $bridgeRoot 'native\NodeOwnerBridge\bridge.cc'),('/Fo'+(Join-Path $bridgeOut 'bridge.obj')),
  '/link','/INCREMENTAL:NO',('/OUT:'+(Join-Path $bridgeOut 'node-owner-bridge.node')),('/IMPLIB:'+(Join-Path $bridgeOut 'bridge.lib')),$bridgeLibrary,'bcrypt.lib','advapi32.lib','kernel32.lib','/VERBOSE:LIB')
$bridgeLog = @(& $bridgeCompiler @bridgeArguments 2>&1)
$bridgeExit = $LASTEXITCODE
$bridgeLog | Set-Content -LiteralPath (Join-Path $bridgeOut 'build.log')
$bridgeSelectedFiles = @($bridgeCompiler,(Join-Path $bridgeMsvc 'bin\Hostx64\x64\link.exe'),(Join-Path $bridgeMsvc 'bin\Hostx64\x64\c1xx.dll'),(Join-Path $bridgeMsvc 'bin\Hostx64\x64\c2.dll'),$bridgeHeaders,$bridgeLibrary,(Join-Path $bridgeRoot 'native\NodeOwnerBridge\bridge.cc'),(Join-Path $bridgeOut 'owner_measurements.h'))
foreach ($bridgeLogLine in $bridgeLog) {
  if ($bridgeLogLine -match '^Note: including file:\s*(.+)$') { $bridgeSelectedFiles += $matches[1].Trim() }
  if ($bridgeLogLine -match '^\s*Searching (.+\.lib):\s*$') { $bridgeSelectedFiles += $matches[1].Trim() }
}
$bridgeFiles = @($bridgeSelectedFiles | Sort-Object -Unique | ForEach-Object { if(Test-Path -LiteralPath $_ -PathType Leaf) { @{ path=$_; bytes=(Get-Item -LiteralPath $_).Length; sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant() } } })
$bridgeProvenance = @{ purpose='test-only-native-node-bridge'; productionAuthority=$false; completeClosure=$false; outputDirectory=$bridgeOut;
  visualStudio=@{path=$bridgeVs; displayVersion='18.10.3'; installationVersion='18.10.12224.181'};
  compiler=@{path=$bridgeCompiler; toolsVersion=$bridgeMsvcVersion; fileVersion=(Get-Item -LiteralPath $bridgeCompiler).VersionInfo.FileVersion; signatureStatus=(Get-AuthenticodeSignature -LiteralPath $bridgeCompiler).Status.ToString()};
  sdk=@{path=$bridgeSdk;version=$bridgeSdkVersion}; ownerMeasurements=$bridgeOwnerRecords; selectedInputs=$bridgeFiles;
  command=@{executable=$bridgeCompiler;arguments=$bridgeArguments;exitCode=$bridgeExit};
  limits=@('Official Node v24.19.0 checksums were matched; signed checksum authentication not performed.','Selected compiler/header/library measurements are not complete compiler or Windows-system provenance.','Addon and staged runtime closure remain unverified; this output grants no authority.') }
if ($bridgeExit -eq 0) { $bridgeProvenance.output=@{path=(Join-Path $bridgeOut 'node-owner-bridge.node'); sha256=(Get-FileHash -LiteralPath (Join-Path $bridgeOut 'node-owner-bridge.node') -Algorithm SHA256).Hash.ToLowerInvariant()} }
$bridgeProvenance | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $bridgeOut 'build-input-provenance.json')
Write-Output $bridgeOut
if ($bridgeExit -ne 0) { $bridgeLog | Select-Object -Last 18; throw 'Addon compilation failed; evidence retained.' }
