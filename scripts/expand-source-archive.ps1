param(
  [Parameter(Mandatory=$true)][string]$Archive,
  [Parameter(Mandatory=$true)][string]$Destination
)

$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archivePath=(Resolve-Path -LiteralPath $Archive).Path
$destinationPath=[System.IO.Path]::GetFullPath($Destination)
[System.IO.Directory]::CreateDirectory($destinationPath) | Out-Null

function Get-SafeSegment([string]$segment) {
  $safe=$segment -replace '[<>:"/\\|?*]','_'
  $safe=$safe.TrimEnd('.',' ')
  if ([string]::IsNullOrWhiteSpace($safe)) { return '_' }
  return $safe
}

$zip=[System.IO.Compression.ZipFile]::OpenRead($archivePath)
$written=0
try {
  foreach ($entry in $zip.Entries) {
    $raw=$entry.FullName -replace '\\','/'
    $segments=@($raw.Split('/',[System.StringSplitOptions]::RemoveEmptyEntries) | ForEach-Object { Get-SafeSegment $_ })
    if ($segments.Count -eq 0) { continue }
    $target=$destinationPath
    foreach ($segment in $segments) { $target=[System.IO.Path]::Combine($target,$segment) }
    $full=[System.IO.Path]::GetFullPath($target)
    if (-not $full.StartsWith($destinationPath,[System.StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe archive path: $raw" }
    if ($raw.EndsWith('/')) { [System.IO.Directory]::CreateDirectory($full) | Out-Null; continue }
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($full)) | Out-Null
    $candidate=$full
    $suffix=1
    while ([System.IO.File]::Exists($candidate)) {
      $candidate=[System.IO.Path]::Combine([System.IO.Path]::GetDirectoryName($full),"$([System.IO.Path]::GetFileNameWithoutExtension($full))_$suffix$([System.IO.Path]::GetExtension($full))")
      $suffix++
    }
    $source=$entry.Open()
    try {
      $dest=[System.IO.File]::Create($candidate)
      try { $source.CopyTo($dest) } finally { $dest.Dispose() }
    } finally { $source.Dispose() }
    $written++
  }
} finally { $zip.Dispose() }

[pscustomobject]@{ archive=$archivePath; destination=$destinationPath; files=$written } | ConvertTo-Json
