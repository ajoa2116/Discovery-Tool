# Dependency-free focused Stage A tests. Synthetic identities/paths only.
# Does not collect host state, load Hyper-V/CIM modules or inspect a real VM/disk.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$preflightPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../scripts/windows-isolation-readiness-preflight.ps1'))
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($preflightPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'Preflight AST has syntax errors.' }

# Inspect before dot-sourcing: every executable command must be a local evaluator
# helper, never an external/dynamic command, query, module import or live adapter.
$allowedCommands = @('Test-PlainData','Test-Fields','Test-Text','Test-Identifier',
    'Test-PositiveInteger','New-Assessment','Test-WindowsIsolationReadiness')
$commands = $ast.FindAll({ param($node) $node -is [Management.Automation.Language.CommandAst] }, $true)
foreach ($command in $commands) {
    if ($command.InvocationOperator -ne [Management.Automation.Language.TokenKind]::Unknown -or
        $allowedCommands -cnotcontains $command.GetCommandName()) {
        throw 'Preflight contains an unexpected command or invocation operator.'
    }
}
. $preflightPath

function New-InertScenario {
    $hostUuid = '11111111-1111-4111-8111-111111111111'
    $vmId = '22222222-2222-4222-8222-222222222222'
    @{
        ExpectedIdentity = @{ HostName = 'INERT-HOST'; HostUuid = $hostUuid; VmName = 'INERT-VM'; VmId = $vmId }
        Limits = @{ MaxMemoryBytes = 4GB; MaxProcessors = 2; MaxCpuPercent = 25; MaxDisks = 1 }
        QueryResponses = @{
            ComputerSystem = @{ Name = 'INERT-HOST' }
            ComputerSystemProduct = @{ UUID = $hostUuid }
            OperatingSystem = @{ BuildNumber = '00000' }
            HyperVModule = @{ Name = 'Hyper-V' }
            HyperVFeature = @{ FeatureName = 'Microsoft-Hyper-V-All'; State = 'Enabled' }
            VM = @{ Id = $vmId; Name = 'INERT-VM'; ComputerName = 'INERT-HOST'; State = 'Off' }
            Memory = @{ VMId = $vmId; Startup = 2GB; Minimum = 1GB; Maximum = 4GB; DynamicMemoryEnabled = $true }
            Processor = @{ VMId = $vmId; Count = 2; Maximum = 25 }
            NetworkAdapters = @()
            IntegrationServices = @(@{ VMId = $vmId; Enabled = $false })
            HardDiskDrives = @(@{ VMId = $vmId; Path = 'INERT-DISK-NEVER-OPENED.vhdx' })
        }
    }
}
function Assert-Denied($Result) {
    if ($Result.Status -cne 'NOT READY' -or $Result.Mode -cne 'OFFLINE_DATA_ONLY' -or
        $Result.LiveQueriesPerformed -or $Result.WholeRunConfinementProven -or $Result.GroupAExecutionAuthorized) {
        throw 'Offline result granted readiness or claimed live evidence.'
    }
    foreach ($flag in @('executionAuthority','stagingAdmission','runtimeTrust','signingApproval',
        'releaseAuthority','productionAuthority','productionReady','runtimeEquivalence',
        'facadeRemovability','completeClosure')) {
        if ($Result.$flag -isnot [bool] -or $Result.$flag) { throw "Authority changed: $flag" }
    }
    if ($Result.BackendBaseline -ne 825 -or $Result.FileCeiling -ne 64 -or
        $Result.OpenCallerObligations -ne 29 -or $Result.UnverifiedBoundaries.Count -lt 6) {
        throw 'Preserved boundary or unresolved evidence is missing.'
    }
}

$passed = 0
$cases = @(
    @{ Name = 'missing expected host'; Code = 'EXPECTED_IDENTITY_REQUIRED'; Mutate = { param($s) $s.ExpectedIdentity.HostName = '' } }
    @{ Name = 'missing expected VM'; Code = 'EXPECTED_IDENTITY_REQUIRED'; Mutate = { param($s) $s.ExpectedIdentity.VmId = $null } }
    @{ Name = 'zero host UUID'; Code = 'EXPECTED_IDENTITY_REQUIRED'; Mutate = { param($s) $s.ExpectedIdentity.HostUuid = '00000000-0000-0000-0000-000000000000' } }
    @{ Name = 'malformed VM GUID'; Code = 'EXPECTED_IDENTITY_REQUIRED'; Mutate = { param($s) $s.ExpectedIdentity.VmId = 'not-a-guid' } }
    @{ Name = 'implicit comparison limits'; Code = 'EXPLICIT_COMPARISON_LIMITS_REQUIRED'; Mutate = { param($s) $s.Limits = $null } }
    @{ Name = 'unbounded CPU policy'; Code = 'EXPLICIT_COMPARISON_LIMITS_REQUIRED'; Mutate = { param($s) $s.Limits.MaxCpuPercent = 101 } }
    @{ Name = 'missing query'; Code = 'QUERY_RESPONSES_MISSING_OR_AMBIGUOUS'; Mutate = { param($s) $s.QueryResponses.Remove('Memory') } }
    @{ Name = 'extra query'; Code = 'QUERY_RESPONSES_MISSING_OR_AMBIGUOUS'; Mutate = { param($s) $s.QueryResponses.Extra = 'unknown' } }
    @{ Name = 'unavailable host query'; Code = 'HOST_IDENTITY_MISSING_OR_MISMATCH'; Mutate = { param($s) $s.QueryResponses.ComputerSystem = $null } }
    @{ Name = 'different host name'; Code = 'HOST_IDENTITY_MISSING_OR_MISMATCH'; Mutate = { param($s) $s.QueryResponses.ComputerSystem.Name = 'OTHER-HOST' } }
    @{ Name = 'different host UUID'; Code = 'HOST_IDENTITY_MISSING_OR_MISMATCH'; Mutate = { param($s) $s.QueryResponses.ComputerSystemProduct.UUID = $s.ExpectedIdentity.VmId } }
    @{ Name = 'ambiguous host records'; Code = 'HOST_IDENTITY_MISSING_OR_MISMATCH'; Mutate = { param($s) $s.QueryResponses.ComputerSystem = @($s.QueryResponses.ComputerSystem, $s.QueryResponses.ComputerSystem) } }
    @{ Name = 'different VM ID'; Code = 'VM_IDENTITY_MISSING_OR_MISMATCH'; Mutate = { param($s) $s.QueryResponses.VM.Id = $s.ExpectedIdentity.HostUuid } }
    @{ Name = 'different VM name'; Code = 'VM_IDENTITY_MISSING_OR_MISMATCH'; Mutate = { param($s) $s.QueryResponses.VM.Name = 'OTHER-VM' } }
    @{ Name = 'different VM owner'; Code = 'VM_IDENTITY_MISSING_OR_MISMATCH'; Mutate = { param($s) $s.QueryResponses.VM.ComputerName = 'OTHER-HOST' } }
    @{ Name = 'ambiguous VM identity'; Code = 'VM_IDENTITY_MISSING_OR_MISMATCH'; Mutate = { param($s) $s.QueryResponses.VM.Id = @($s.ExpectedIdentity.VmId) } }
    @{ Name = 'running VM'; Code = 'VM_NOT_OFF'; Mutate = { param($s) $s.QueryResponses.VM.State = 'Running' } }
    @{ Name = 'saved VM'; Code = 'VM_NOT_OFF'; Mutate = { param($s) $s.QueryResponses.VM.State = 'Saved' } }
    @{ Name = 'missing VM state'; Code = 'VM_NOT_OFF'; Mutate = { param($s) $s.QueryResponses.VM.State = $null } }
    @{ Name = 'missing OS metadata'; Code = 'OS_METADATA_MISSING'; Mutate = { param($s) $s.QueryResponses.OperatingSystem = $null } }
    @{ Name = 'unavailable Hyper-V module'; Code = 'HYPERV_CAPABILITY_NOT_ESTABLISHED'; Mutate = { param($s) $s.QueryResponses.HyperVModule = $null } }
    @{ Name = 'Hyper-V feature disabled'; Code = 'HYPERV_CAPABILITY_NOT_ESTABLISHED'; Mutate = { param($s) $s.QueryResponses.HyperVFeature.State = 'Disabled' } }
    @{ Name = 'pending feature enable'; Code = 'HYPERV_CAPABILITY_NOT_ESTABLISHED'; Mutate = { param($s) $s.QueryResponses.HyperVFeature.State = 'EnablePending' } }
    @{ Name = 'ambiguous feature state'; Code = 'HYPERV_CAPABILITY_NOT_ESTABLISHED'; Mutate = { param($s) $s.QueryResponses.HyperVFeature.State = @('Enabled') } }
    @{ Name = 'missing memory query'; Code = 'MEMORY_BOUNDS_MISSING_OR_EXCEEDED'; Mutate = { param($s) $s.QueryResponses.Memory = $null } }
    @{ Name = 'memory exceeds comparison bound'; Code = 'MEMORY_BOUNDS_MISSING_OR_EXCEEDED'; Mutate = { param($s) $s.QueryResponses.Memory.Maximum = 8GB } }
    @{ Name = 'inverted memory bounds'; Code = 'MEMORY_BOUNDS_MISSING_OR_EXCEEDED'; Mutate = { param($s) $s.QueryResponses.Memory.Minimum = 3GB } }
    @{ Name = 'memory belongs to other VM'; Code = 'MEMORY_BOUNDS_MISSING_OR_EXCEEDED'; Mutate = { param($s) $s.QueryResponses.Memory.VMId = $s.ExpectedIdentity.HostUuid } }
    @{ Name = 'CPU count exceeds bound'; Code = 'PROCESSOR_BOUNDS_MISSING_OR_EXCEEDED'; Mutate = { param($s) $s.QueryResponses.Processor.Count = 3 } }
    @{ Name = 'CPU cap exceeds bound'; Code = 'PROCESSOR_BOUNDS_MISSING_OR_EXCEEDED'; Mutate = { param($s) $s.QueryResponses.Processor.Maximum = 100 } }
    @{ Name = 'CPU zero cap'; Code = 'PROCESSOR_BOUNDS_MISSING_OR_EXCEEDED'; Mutate = { param($s) $s.QueryResponses.Processor.Maximum = 0 } }
    @{ Name = 'CPU numeric string'; Code = 'PROCESSOR_BOUNDS_MISSING_OR_EXCEEDED'; Mutate = { param($s) $s.QueryResponses.Processor.Count = '2' } }
    @{ Name = 'connected NIC'; Code = 'NETWORK_ADAPTERS_NOT_ABSENT'; Mutate = { param($s) $s.QueryResponses.NetworkAdapters = @(@{ SwitchName = 'INERT-SWITCH' }) } }
    @{ Name = 'disconnected NIC still present'; Code = 'NETWORK_ADAPTERS_NOT_ABSENT'; Mutate = { param($s) $s.QueryResponses.NetworkAdapters = @(@{ SwitchName = '' }) } }
    @{ Name = 'unavailable NIC query'; Code = 'NETWORK_ADAPTERS_NOT_ABSENT'; Mutate = { param($s) $s.QueryResponses.NetworkAdapters = $null } }
    @{ Name = 'enabled guest integration'; Code = 'INTEGRATION_SERVICE_ENABLED_OR_INVALID'; Mutate = { param($s) $s.QueryResponses.IntegrationServices[0].Enabled = $true } }
    @{ Name = 'string false is not boolean'; Code = 'INTEGRATION_SERVICE_ENABLED_OR_INVALID'; Mutate = { param($s) $s.QueryResponses.IntegrationServices[0].Enabled = 'false' } }
    @{ Name = 'missing integration inventory'; Code = 'INTEGRATION_SERVICES_UNAVAILABLE'; Mutate = { param($s) $s.QueryResponses.IntegrationServices = @() } }
    @{ Name = 'missing disks'; Code = 'DISK_INVENTORY_MISSING_OR_OVER_LIMIT'; Mutate = { param($s) $s.QueryResponses.HardDiskDrives = @() } }
    @{ Name = 'disk wrong VM'; Code = 'DISK_IDENTITY_MISSING_OR_AMBIGUOUS'; Mutate = { param($s) $s.QueryResponses.HardDiskDrives[0].VMId = $s.ExpectedIdentity.HostUuid } }
    @{ Name = 'disk empty path'; Code = 'DISK_IDENTITY_MISSING_OR_AMBIGUOUS'; Mutate = { param($s) $s.QueryResponses.HardDiskDrives[0].Path = '' } }
    @{ Name = 'disk duplicate'; Code = 'DISK_IDENTITY_MISSING_OR_AMBIGUOUS'; Mutate = { param($s) $s.Limits.MaxDisks = 2; $s.QueryResponses.HardDiskDrives = @($s.QueryResponses.HardDiskDrives[0], $s.QueryResponses.HardDiskDrives[0]) } }
    @{ Name = 'non-data callback'; Code = 'INVALID_DATA_TYPE_OR_SIZE'; Mutate = { param($s) $s.QueryResponses.VM = { throw 'CALLBACK MUST NOT EXECUTE' } } }
    @{ Name = 'non-data object'; Code = 'INVALID_DATA_TYPE_OR_SIZE'; Mutate = { param($s) $s.QueryResponses.VM = [pscustomobject]@{ Id = 'inert' } } }
    @{ Name = 'oversized input'; Code = 'INVALID_DATA_TYPE_OR_SIZE'; Mutate = { param($s) $s.QueryResponses.VM.Name = 'x' * 4097 } }
)
foreach ($case in $cases) {
    $scenario = New-InertScenario
    & $case.Mutate $scenario
    $before = [Management.Automation.PSSerializer]::Serialize($scenario)
    $result = Test-WindowsIsolationReadiness @scenario
    Assert-Denied $result
    if ($result.ConfigurationChecksSatisfied -or $result.ConfigurationIssues -cnotcontains $case.Code) {
        throw "Expected denial missing: $($case.Name) ($($case.Code))."
    }
    if ([Management.Automation.PSSerializer]::Serialize($scenario) -cne $before) {
        throw "Input mutated: $($case.Name)."
    }
    $passed++
}

# Favorable synthetic configuration must still deny actual readiness. Result
# mutation must not affect later calls; reports never become authority objects.
$scenario = New-InertScenario
$before = [Management.Automation.PSSerializer]::Serialize($scenario)
$result = Test-WindowsIsolationReadiness @scenario
Assert-Denied $result
if (-not $result.ConfigurationChecksSatisfied -or $result.ConfigurationIssues.Count -ne 0) {
    throw "Favorable inert configuration was not assessed as expected: $($result.ConfigurationIssues -join ',')."
}
$result.executionAuthority = $true
$result.Status = 'FORGED'
$again = Test-WindowsIsolationReadiness @scenario
Assert-Denied $again
if ([Management.Automation.PSSerializer]::Serialize($scenario) -cne $before) { throw 'Favorable input mutated.' }
$passed++

$omitted = Test-WindowsIsolationReadiness
Assert-Denied $omitted
if ($omitted.ConfigurationIssues -cnotcontains 'EXPECTED_IDENTITY_REQUIRED') { throw 'Omitted input was not denied.' }
$passed++

# Multiple independent configuration defects must remain visible together.
$scenario = New-InertScenario
$scenario.QueryResponses.Processor.Count = 99
$scenario.QueryResponses.Memory.Maximum = 8GB
$scenario.QueryResponses.NetworkAdapters = @(@{ SwitchName = 'INERT' })
$result = Test-WindowsIsolationReadiness @scenario
Assert-Denied $result
foreach ($code in @('PROCESSOR_BOUNDS_MISSING_OR_EXCEEDED','MEMORY_BOUNDS_MISSING_OR_EXCEEDED','NETWORK_ADAPTERS_NOT_ABSENT')) {
    if ($result.ConfigurationIssues -cnotcontains $code) { throw "Independent defect disappeared: $code" }
}
$passed++

"PASS: $passed inert cases; 0 failed. AST command allowlist passed. No live query adapter exists or ran."
