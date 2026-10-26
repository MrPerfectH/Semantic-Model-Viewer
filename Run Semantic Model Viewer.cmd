@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Models\tools\viewer\scripts\windows\start-viewer.ps1" %*
exit /b %errorlevel%
