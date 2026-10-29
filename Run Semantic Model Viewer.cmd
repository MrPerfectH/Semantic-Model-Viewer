@echo off
rem Launch the portable Semantic Model Viewer without installing shortcuts.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Models\tools\viewer\scripts\windows\start-viewer.ps1"
