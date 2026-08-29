$ErrorActionPreference = 'Stop'

try {
  $startupDirectory = [Environment]::GetFolderPath('Startup')
  $shortcutPath = Join-Path $startupDirectory 'SecureVault Background Service.lnk'
  if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath -Force
    Write-Host 'SecureVault auto-start is disabled. The currently running service was left untouched.' -ForegroundColor Green
  } else {
    Write-Host 'SecureVault auto-start was already disabled.'
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
