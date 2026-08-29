$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot '.runtime\securevault.pid.json'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host 'SecureVault is not running.'; exit 0 }

try {
  $record = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$record.pid) -ErrorAction SilentlyContinue
  if ($process) {
    $actualPath = $process.Path
    $expectedPath = [System.IO.Path]::GetFullPath([string]$record.executable)
    if (-not $actualPath -or [System.IO.Path]::GetFullPath($actualPath) -ne $expectedPath) { throw 'The saved process ID belongs to a different program, so it was not stopped.' }
    Stop-Process -Id $process.Id
    $process.WaitForExit(5000)
  }
  Remove-Item -LiteralPath $pidFile -Force
  Write-Host 'SecureVault stopped safely.' -ForegroundColor Green
} catch { Write-Error $_.Exception.Message; exit 1 }
