@echo off
setlocal
title Enable SecureVault Auto Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\enable-autostart.ps1"
if errorlevel 1 pause
endlocal
