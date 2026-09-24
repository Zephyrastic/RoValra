# Builds an AMO-safe Firefox zip from dist-firefox/.
#
# Windows PowerShell 5.1's Compress-Archive writes subdirectory entries with
# backslashes (e.g. `assets\RigR15.rbxm`), which addons.mozilla.org rejects
# with "Invalid file name in archive". The zip specification requires forward
# slashes, so every entry name is written explicitly here and the result is
# verified before use.
param(
    [string]$Source = (Join-Path $PSScriptRoot '..\dist-firefox'),
    [string]$Destination = (Join-Path (Split-Path -Parent $PSScriptRoot) 'RoValra-firefox.zip')
)

$ErrorActionPreference = 'Stop'

$Source = (Resolve-Path -Path $Source).Path.TrimEnd('\')
$Destination = [System.IO.Path]::GetFullPath($Destination)

$destinationDir = Split-Path -Parent $Destination
if ($destinationDir -and -not (Test-Path $destinationDir)) {
    New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
}
if (Test-Path $Destination) {
    Remove-Item $Destination -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open(
    $Destination,
    [System.IO.Compression.ZipArchiveMode]::Create
)
try {
    $files = Get-ChildItem -Recurse -File -Path $Source
    if ($files.Count -eq 0) {
        throw "No files found in $Source - run 'npm run build:firefox' first."
    }
    foreach ($file in $files) {
        $entryName = $file.FullName.Substring($Source.Length).TrimStart('\').Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip,
            $file.FullName,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
} finally {
    $zip.Dispose()
}

# Verify the archive before calling it done.
$check = [System.IO.Compression.ZipFile]::OpenRead($Destination)
try {
    $badEntries = @(
        $check.Entries | Where-Object {
            $_.FullName -match '\\' -or $_.FullName -like './*'
        }
    )
    $manifestEntry = $check.Entries | Where-Object {
        $_.FullName -eq 'manifest.json'
    }
    if ($badEntries.Count -gt 0) {
        throw "Zip validation failed: $($badEntries.Count) entries with backslashes or './' prefix."
    }
    if ($null -eq $manifestEntry) {
        throw 'Zip validation failed: manifest.json missing at archive root.'
    }
    $reader = New-Object System.IO.StreamReader($manifestEntry.Open())
    try {
        $manifestJson = $reader.ReadToEnd()
    } finally {
        $reader.Close()
    }
    $version = ([regex]::Match($manifestJson, '"version":"([0-9.]+)"')).Groups[1].Value
    $sizeKb = [math]::Round((Get-Item $Destination).Length / 1KB)
    Write-Output "Created $Destination ($($check.Entries.Count) entries, $sizeKb KB, version $version)"
} finally {
    $check.Dispose()
}
