@echo off
setlocal
title Disable SecureVault Auto Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\disable-autostart.ps1"
if errorlevel 1 pause
endlocal
