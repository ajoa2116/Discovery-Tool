# Level 2 Stage A: OFFLINE DATA ONLY. No query adapter, auto-discovery or live mode.
# Dot-source to call Test-WindowsIsolationReadiness with inert normalized responses.
# Direct invocation assesses supplied data; omitted arguments deny readiness.
# QueryResponses is NOT raw CIM/Hyper-V objects: only ordinary hashtables, object
# arrays and primitive values are accepted. A future live collector requires new
# approval, identity binding, provenance/freshness review and a separate adapter.
# Normalized response keys:
# ComputerSystem: { Name }; ComputerSystemProduct: { UUID };
# OperatingSystem: { BuildNumber }; HyperVModule: { Name };
# HyperVFeature: { FeatureName, State };
# VM: { Id, Name, ComputerName, State };
# Memory: { VMId, Startup, Minimum, Maximum, DynamicMemoryEnabled };
# Processor: { VMId, Count, Maximum } (Maximum is percentage);
# NetworkAdapters: object[]; IntegrationServices: object[] of { VMId, Enabled };
# HardDiskDrives: object[] of { VMId, Path }.
# Empty NetworkAdapters is required (no NICs, not merely disconnected switches).
# All listed integration services must be disabled; completeness is unverified.
# Disk paths are opaque data, never opened/mounted/resolved. Disk storage bounds,
# host sharing, input protection and external termination remain unverified.
param($ExpectedIdentity, $Limits, $QueryResponses)

function Test-WindowsIsolationReadiness {
    [CmdletBinding()]
    param($ExpectedIdentity, $Limits, $QueryResponses)

    # Local helpers do not alter caller scope, environment or input collections.
    function Test-PlainData($Value, [int]$Depth = 0) {
        if ($Depth -gt 8) { return $false }
        if ($null -eq $Value) { return $true }
        $kind = $Value.GetType()
        if ($kind -eq [string]) { return $Value.Length -le 4096 }
        if ($kind -eq [bool] -or $kind -eq [int] -or $kind -eq [long]) { return $true }
        if ($kind -eq [hashtable]) {
            if ($Value.get_Count() -gt 32) { return $false }
            foreach ($key in $Value.get_Keys()) {
                if ($key -isnot [string] -or $key.Length -gt 64) { return $false }
                if (-not (Test-PlainData $Value[$key] ($Depth + 1))) { return $false }
            }
            return $true
        }
        if ($kind -eq [object[]]) {
            if ($Value.Length -gt 32) { return $false }
            foreach ($entry in $Value) {
                if (-not (Test-PlainData $entry ($Depth + 1))) { return $false }
            }
            return $true
        }
        return $false
    }
    function Test-Fields($Record, [string[]]$Fields) {
        if ($null -eq $Record -or $Record.GetType() -ne [hashtable]) { return $false }
        if ($Record.get_Count() -ne $Fields.Count) { return $false }
        foreach ($field in $Fields) { if (-not $Record.ContainsKey($field)) { return $false } }
        return $true
    }
    function Test-Text($Value) {
        return ($Value -is [string] -and $Value.Length -gt 0 -and
            $Value.Length -le 256 -and $Value -notmatch '[\x00-\x1f\x7f]' -and
            $Value -ceq $Value.Trim())
    }
    function Test-Identifier($Value) {
        $parsed = [guid]::Empty
        return ((Test-Text $Value) -and [guid]::TryParseExact($Value, 'D', [ref]$parsed) -and
            $parsed -ne [guid]::Empty)
    }
    function Test-PositiveInteger($Value) {
        return (($Value -is [int] -or $Value -is [long]) -and $Value -gt 0)
    }
    function New-Assessment([string[]]$Issues) {
        # Fixed literals: supplied data can never set any authority or readiness.
        [pscustomobject]@{
            SchemaVersion = 1
            Mode = 'OFFLINE_DATA_ONLY'
            Status = 'NOT READY'
            ConfigurationIssues = @($Issues)
            ConfigurationChecksSatisfied = ($Issues.Count -eq 0)
            UnverifiedBoundaries = @(
                'Response origin, completeness, freshness and actual host/VM identity'
                'Supported host/guest compatibility and effective OS isolation'
                'Host-resource redirection, disk/storage bounds and protected measured inputs'
                'Whole-run ownership, external deadline, teardown and recovery'
                'Runtime/dependency authenticity, loading closure and mapped-image identity'
                'Separate exact-path execution approval, including any Group A run'
            )
            LiveQueriesPerformed = $false
            WholeRunConfinementProven = $false
            GroupAExecutionAuthorized = $false
            executionAuthority = $false
            stagingAdmission = $false
            runtimeTrust = $false
            signingApproval = $false
            releaseAuthority = $false
            productionAuthority = $false
            productionReady = $false
            runtimeEquivalence = $false
            facadeRemovability = $false
            completeClosure = $false
            BackendBaseline = 825
            FileCeiling = 64
            OpenCallerObligations = 29
        }
    }

    foreach ($inputValue in @($ExpectedIdentity, $Limits, $QueryResponses)) {
        if (-not (Test-PlainData $inputValue)) {
            return New-Assessment @('INVALID_DATA_TYPE_OR_SIZE')
        }
    }
    if (-not (Test-Fields $ExpectedIdentity @('HostName','HostUuid','VmName','VmId')) -or
        -not (Test-Text $ExpectedIdentity.HostName) -or
        -not (Test-Identifier $ExpectedIdentity.HostUuid) -or
        -not (Test-Text $ExpectedIdentity.VmName) -or
        -not (Test-Identifier $ExpectedIdentity.VmId)) {
        return New-Assessment @('EXPECTED_IDENTITY_REQUIRED')
    }
    # These are caller-supplied synthetic comparison bounds, NOT approved policy.
    if (-not (Test-Fields $Limits @('MaxMemoryBytes','MaxProcessors','MaxCpuPercent','MaxDisks')) -or
        -not (Test-PositiveInteger $Limits.MaxMemoryBytes) -or
        -not (Test-PositiveInteger $Limits.MaxProcessors) -or
        -not (Test-PositiveInteger $Limits.MaxCpuPercent) -or $Limits.MaxCpuPercent -gt 100 -or
        -not (Test-PositiveInteger $Limits.MaxDisks) -or $Limits.MaxDisks -gt 32) {
        return New-Assessment @('EXPLICIT_COMPARISON_LIMITS_REQUIRED')
    }
    $responseNames = @('ComputerSystem','ComputerSystemProduct','OperatingSystem',
        'HyperVModule','HyperVFeature','VM','Memory','Processor','NetworkAdapters',
        'IntegrationServices','HardDiskDrives')
    if (-not (Test-Fields $QueryResponses $responseNames)) {
        return New-Assessment @('QUERY_RESPONSES_MISSING_OR_AMBIGUOUS')
    }
    # A failed/unavailable query is represented by null, never silently replaced.
    if (-not (Test-Fields $QueryResponses.ComputerSystem @('Name')) -or
        -not (Test-Fields $QueryResponses.ComputerSystemProduct @('UUID')) -or
        -not (Test-Text $QueryResponses.ComputerSystem.Name) -or
        -not (Test-Identifier $QueryResponses.ComputerSystemProduct.UUID) -or
        $QueryResponses.ComputerSystem.Name -ine $ExpectedIdentity.HostName -or
        $QueryResponses.ComputerSystemProduct.UUID -ine $ExpectedIdentity.HostUuid) {
        return New-Assessment @('HOST_IDENTITY_MISSING_OR_MISMATCH')
    }
    if (-not (Test-Fields $QueryResponses.VM @('Id','Name','ComputerName','State')) -or
        -not (Test-Identifier $QueryResponses.VM.Id) -or
        -not (Test-Text $QueryResponses.VM.Name) -or
        -not (Test-Text $QueryResponses.VM.ComputerName) -or
        $QueryResponses.VM.Id -ine $ExpectedIdentity.VmId -or
        $QueryResponses.VM.Name -cne $ExpectedIdentity.VmName -or
        $QueryResponses.VM.ComputerName -ine $ExpectedIdentity.HostName) {
        return New-Assessment @('VM_IDENTITY_MISSING_OR_MISMATCH')
    }
    if ($QueryResponses.VM.State -isnot [string] -or $QueryResponses.VM.State -cne 'Off') {
        return New-Assessment @('VM_NOT_OFF')
    }

    $issues = [Collections.Generic.List[string]]::new()
    if (-not (Test-Fields $QueryResponses.OperatingSystem @('BuildNumber')) -or
        $QueryResponses.OperatingSystem.BuildNumber -isnot [string] -or
        $QueryResponses.OperatingSystem.BuildNumber -notmatch '^[0-9]{1,10}$') {
        $issues.Add('OS_METADATA_MISSING')
    }
    if (-not (Test-Fields $QueryResponses.HyperVModule @('Name')) -or
        -not (Test-Text $QueryResponses.HyperVModule.Name) -or
        $QueryResponses.HyperVModule.Name -cne 'Hyper-V' -or
        -not (Test-Fields $QueryResponses.HyperVFeature @('FeatureName','State')) -or
        -not (Test-Text $QueryResponses.HyperVFeature.FeatureName) -or
        -not (Test-Text $QueryResponses.HyperVFeature.State) -or
        $QueryResponses.HyperVFeature.FeatureName -cne 'Microsoft-Hyper-V-All' -or
        $QueryResponses.HyperVFeature.State -cne 'Enabled') {
        $issues.Add('HYPERV_CAPABILITY_NOT_ESTABLISHED')
    }
    $memory = $QueryResponses.Memory
    if (-not (Test-Fields $memory @('VMId','Startup','Minimum','Maximum','DynamicMemoryEnabled')) -or
        -not (Test-Identifier $memory.VMId) -or
        $memory.VMId -ine $ExpectedIdentity.VmId -or
        -not (Test-PositiveInteger $memory.Startup) -or
        -not (Test-PositiveInteger $memory.Minimum) -or
        -not (Test-PositiveInteger $memory.Maximum) -or
        $memory.DynamicMemoryEnabled -isnot [bool] -or
        $memory.Minimum -gt $memory.Startup -or $memory.Startup -gt $memory.Maximum -or
        $memory.Maximum -gt $Limits.MaxMemoryBytes) {
        $issues.Add('MEMORY_BOUNDS_MISSING_OR_EXCEEDED')
    }
    $processor = $QueryResponses.Processor
    if (-not (Test-Fields $processor @('VMId','Count','Maximum')) -or
        -not (Test-Identifier $processor.VMId) -or
        $processor.VMId -ine $ExpectedIdentity.VmId -or
        -not (Test-PositiveInteger $processor['Count']) -or $processor['Count'] -gt $Limits.MaxProcessors -or
        -not (Test-PositiveInteger $processor.Maximum) -or $processor.Maximum -gt $Limits.MaxCpuPercent) {
        $issues.Add('PROCESSOR_BOUNDS_MISSING_OR_EXCEEDED')
    }
    if ($null -eq $QueryResponses.NetworkAdapters -or
        $QueryResponses.NetworkAdapters.GetType() -ne [object[]] -or
        $QueryResponses.NetworkAdapters.Length -ne 0) {
        $issues.Add('NETWORK_ADAPTERS_NOT_ABSENT')
    }
    $services = $QueryResponses.IntegrationServices
    if ($null -eq $services -or $services.GetType() -ne [object[]] -or $services.Length -eq 0) {
        $issues.Add('INTEGRATION_SERVICES_UNAVAILABLE')
    } else {
        foreach ($service in $services) {
            if (-not (Test-Fields $service @('VMId','Enabled')) -or
                -not (Test-Identifier $service.VMId) -or
                $service.VMId -ine $ExpectedIdentity.VmId -or
                $service.Enabled -isnot [bool] -or $service.Enabled) {
                $issues.Add('INTEGRATION_SERVICE_ENABLED_OR_INVALID')
                break
            }
        }
    }
    $disks = $QueryResponses.HardDiskDrives
    if ($null -eq $disks -or $disks.GetType() -ne [object[]] -or
        $disks.Length -eq 0 -or $disks.Length -gt $Limits.MaxDisks) {
        $issues.Add('DISK_INVENTORY_MISSING_OR_OVER_LIMIT')
    } else {
        $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        foreach ($disk in $disks) {
            if (-not (Test-Fields $disk @('VMId','Path')) -or
                -not (Test-Identifier $disk.VMId) -or
                $disk.VMId -ine $ExpectedIdentity.VmId -or -not (Test-Text $disk.Path) -or
                -not $seen.Add($disk.Path)) {
                $issues.Add('DISK_IDENTITY_MISSING_OR_AMBIGUOUS')
                break
            }
        }
    }
    return New-Assessment ($issues.ToArray())
}

if ($MyInvocation.InvocationName -ne '.') {
    Test-WindowsIsolationReadiness -ExpectedIdentity $ExpectedIdentity -Limits $Limits -QueryResponses $QueryResponses
}
