# Build-time fixture input only. Never consult environment/runtime owner routing.
function Get-FixtureOwnerMeasurements {
    param([Parameter(Mandatory)][string]$OwnerRoot)
    if ($OwnerRoot -notmatch '^[A-Za-z]:[\\/]' -or $OwnerRoot -match '["\x00-\x1f]' -or $OwnerRoot.Substring(2).Contains(':')) {
        throw 'Owner root must be an explicit absolute local directory.'
    }
    $canonical = [IO.Path]::GetFullPath($OwnerRoot)
    $directory = Get-Item -LiteralPath $canonical -Force
    if (!$directory.PSIsContainer) { throw 'Owner root is not a directory.' }
    for ($ancestor = $directory; $null -ne $ancestor; $ancestor = $ancestor.Parent) {
        if ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Owner root has a reparse ancestor.' }
    }
    $names = @('ApplicationCompanion.exe','ApplicationCompanion.dll','ApplicationCompanion.deps.json','ApplicationCompanion.runtimeconfig.json')
    $streams = @()
    try {
        # Hold all four read-only streams through hashing; deny concurrent writes/deletes.
        foreach ($name in $names) {
            $file = Get-Item -LiteralPath (Join-Path $directory.FullName $name) -Force
            if ($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $file.Length -le 0 -or $file.Length -gt 128MB) {
                throw 'Invalid fixture owner file.'
            }
            $streams += [IO.File]::Open($file.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
        }
        $total = 0L
        foreach ($stream in $streams) { $total += $stream.Length }
        if ($total -gt 256MB) { throw 'Fixture owner byte limit exceeded.' }
        for ($i = 0; $i -lt $names.Count; $i++) {
            $hash = [Security.Cryptography.SHA256]::Create()
            try { $digest = [BitConverter]::ToString($hash.ComputeHash($streams[$i])).Replace('-', '').ToLowerInvariant() }
            finally { $hash.Dispose() }
            @{ path = Join-Path $directory.FullName $names[$i]; sha256 = $digest }
        }
    } finally { foreach ($stream in $streams) { $stream.Dispose() } }
}
