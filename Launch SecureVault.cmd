@echo off
setlocal
title SecureVault Launcher
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch.ps1"
if errorlevel 1 (
  echo.
  echo SecureVault could not start. Review .runtime\securevault-error.log for details.
  pause
)
endlocal
