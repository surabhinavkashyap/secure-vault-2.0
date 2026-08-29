param(
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDirectory = Join-Path $projectRoot '.runtime'
$pidFile = Join-Path $runtimeDirectory 'securevault.pid.json'
$outputLog = Join-Path $runtimeDirectory 'securevault.log'
$errorLog = Join-Path $runtimeDirectory 'securevault-error.log'
$appUrl = 'http://127.0.0.1:5001'

New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null

function Test-SecureVaultHealth {
  try {
    $health = Invoke-RestMethod -Uri "$appUrl/api/health" -TimeoutSec 2
    return $health.status -eq 'ok'
  } catch { return $false }
}

function Open-SecureVault {
  if (-not $NoBrowser) { Start-Process $appUrl }
}

try {
  if (Test-SecureVaultHealth) { Open-SecureVault; exit 0 }

  $bunCommand = Get-Command bun -ErrorAction SilentlyContinue
  $bunExecutable = if ($bunCommand) { $bunCommand.Source } else { Join-Path $env:USERPROFILE '.bun\bin\bun.exe' }
  if (-not (Test-Path -LiteralPath $bunExecutable)) {
    throw 'Bun is not installed. Install Bun from https://bun.sh and run this launcher again.'
  }
  $env:PATH = "$(Split-Path -Parent $bunExecutable);$env:PATH"

  Write-Host 'Preparing SecureVault for this computer...' -ForegroundColor Cyan
  & $bunExecutable install --cwd $projectRoot
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

  Write-Host 'Building the encrypted vault interface...' -ForegroundColor Cyan
  & $bunExecutable run --cwd (Join-Path $projectRoot 'task-manager-frontend') build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }

  $apiEntry = Join-Path $projectRoot 'task-manager-api\app.js'
  $process = Start-Process -FilePath $bunExecutable -ArgumentList @($apiEntry) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
  [PSCustomObject]@{ pid = $process.Id; executable = $bunExecutable; entry = $apiEntry; startedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8

  $deadline = (Get-Date).AddSeconds(25)
  while ((Get-Date) -lt $deadline) {
    if ($process.HasExited) { throw "SecureVault stopped during startup. See $errorLog" }
    if (Test-SecureVaultHealth) { Write-Host 'SecureVault is ready.' -ForegroundColor Green; Open-SecureVault; exit 0 }
    Start-Sleep -Milliseconds 350
  }
  throw "SecureVault did not become ready in time. See $errorLog"
} catch {
  $_ | Out-String | Set-Content -LiteralPath $errorLog -Encoding UTF8
  Write-Error $_.Exception.Message
  exit 1
}
