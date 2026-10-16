param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $OutputPath) { $OutputPath = Join-Path $taskRoot 'output\cloudrun\little-town-cloudrun.zip' }
$taskOutput = [System.IO.Path]::GetFullPath($OutputPath)
$taskOutputParent = Split-Path -Parent $taskOutput
[System.IO.Directory]::CreateDirectory($taskOutputParent) | Out-Null
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# 白名单打包，避免把 .env、备份、日志、临时程序放进云端构建上下文。
$taskBackend = Join-Path $taskRoot 'backend'
$taskFiles = @('go.mod','go.sum','Dockerfile','.dockerignore','docker-entrypoint.sh','.env.cloudrun.example')
foreach ($taskDirectory in @('cmd','internal','data')) {
    $taskFiles += Get-ChildItem -LiteralPath (Join-Path $taskBackend $taskDirectory) -File -Recurse |
        Where-Object { $_.Extension -in @('.go','.json') -and $_.Name -notlike '*_test.go' } |
        ForEach-Object { $_.FullName.Substring($taskBackend.Length + 1) }
}
$taskStream = [System.IO.File]::Open($taskOutput, [System.IO.FileMode]::Create)
try {
    $taskArchive = [System.IO.Compression.ZipArchive]::new($taskStream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        foreach ($taskFile in $taskFiles) {
            $taskEntry = $taskFile.Replace('\','/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskArchive, (Join-Path $taskBackend $taskFile), $taskEntry) | Out-Null
        }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskArchive, (Join-Path $taskRoot 'deploy\cloudrun-settings.json'), 'cloudrun-settings.json') | Out-Null
    } finally { $taskArchive.Dispose() }
} finally { $taskStream.Dispose() }
Write-Output "CloudRun source package: $taskOutput"
Write-Output 'Environment: prod-d4g0vweip50ea1139; service: golang-y91h; port: 80'
