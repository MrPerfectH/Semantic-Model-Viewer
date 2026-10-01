# Installs Semantic Model Viewer as a Windows app:
#   - a Desktop icon and a Start menu entry that start the local app and open its window
#   - the local app (scripts\serve.py) reads model folders for the viewer, so the
#     browser never asks for folder permission; it stops itself when the window closes
#
# Needs Python 3 (python.org, tick "Add python.exe to PATH" during install).
#
# Run once: double-click "Install on Windows.cmd" in the repo root, or
#   powershell -ExecutionPolicy Bypass -File install-shortcuts.ps1

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$startScript = Join-Path $here "start-viewer.ps1"
$ico = Join-Path $here "SMV.ico"
$powershellExe = Join-Path $PSHOME "powershell.exe"
if (-not (Test-Path $powershellExe)) {
    # PowerShell 7+ installs as pwsh.exe; Windows PowerShell 5.1 (always present) is powershell.exe
    $powershellExe = "powershell.exe"
}

if (-not (Get-Command py -ErrorAction SilentlyContinue) -and -not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Warning "Python was not found on PATH. Install it from https://python.org (tick 'Add python.exe to PATH'), then open the app."
}

# Earlier versions started a server at every sign-in; the app now starts on demand.
$startupFolder = [Environment]::GetFolderPath("Startup")
if ($startupFolder) { Remove-Item -ErrorAction SilentlyContinue (Join-Path $startupFolder "Semantic Model Viewer.lnk") }

function New-AppShortcut {
    param([string]$Path)
    $wshShell = New-Object -ComObject WScript.Shell
    $shortcut = $wshShell.CreateShortcut($Path)
    $shortcut.TargetPath = $powershellExe
    $shortcut.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`""
    $shortcut.IconLocation = $ico
    $shortcut.WorkingDirectory = $here
    $shortcut.Description = "Semantic Model Viewer"
    $shortcut.Save()
}

function New-NamedShortcut {
    param([string]$FolderSpecialName, [string]$Label)
    $folder = [Environment]::GetFolderPath($FolderSpecialName)
    if (-not $folder) {
        Write-Warning "Windows did not report a '$FolderSpecialName' folder - skipping the $Label."
        return $null
    }
    $path = Join-Path $folder "Semantic Model Viewer.lnk"
    New-AppShortcut -Path $path
    if (Test-Path $path) {
        return $path
    }
    Write-Warning "Could not create the $Label at $path."
    return $null
}

$desktopShortcut = New-NamedShortcut -FolderSpecialName "Desktop" -Label "Desktop icon"
$startMenuShortcut = New-NamedShortcut -FolderSpecialName "Programs" -Label "Start menu entry"

if ($desktopShortcut) { Write-Host "Desktop icon created: $desktopShortcut" }
if ($startMenuShortcut) { Write-Host "Start menu entry:     $startMenuShortcut" }
Write-Host "To update, run 'git pull' in the repo and reopen the app."
if ($desktopShortcut -or $startMenuShortcut) {
    Write-Host "Opening it now..."
    & $startScript
}
