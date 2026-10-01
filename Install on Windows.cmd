@echo off
rem Double-click to install Semantic Model Viewer: adds Desktop and Start menu icons and opens it.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Models\tools\viewer\scripts\windows\install-shortcuts.ps1"
pause
