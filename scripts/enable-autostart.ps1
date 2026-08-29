$ErrorActionPreference = 'Stop'

try {
  $projectRoot = Split-Path -Parent $PSScriptRoot
  $launchScript = Join-Path $PSScriptRoot 'launch.ps1'
  $startupDirectory = [Environment]::GetFolderPath('Startup')
  $shortcutPath = Join-Path $startupDirectory 'SecureVault Background Service.lnk'
  $powershellPath = Join-Path $PSHOME 'powershell.exe'
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $powershellPath
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launchScript`" -NoBrowser"
  $shortcut.WorkingDirectory = $projectRoot
  $shortcut.Description = 'Start the local SecureVault service when Windows signs in'
  $shortcut.WindowStyle = 7
  $shortcut.Save()

  & $launchScript -NoBrowser
  if ($LASTEXITCODE -ne 0) { throw 'Auto-start was enabled, but the service could not be started now.' }
  Write-Host 'SecureVault auto-start is enabled and the backend is running.' -ForegroundColor Green
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
