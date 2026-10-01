# Installs Semantic Model Viewer as an always-on Windows app:
#   - a Desktop icon that starts the server (if needed) and opens the app window
#   - the same icon copied into your Startup folder, so it launches at every sign-in
#
# Run once, from PowerShell:
#   Right-click this file -> Run with PowerShell
#   or:  powershell -ExecutionPolicy Bypass -File install-shortcuts.ps1
#
# Needs Python 3 on this machine (python.org, check "Add python.exe to PATH"
# during install) - the same requirement the rest of this project has.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$startScript = Join-Path $here "start-viewer.ps1"
$ico = Join-Path $here "SMV.ico"
$powershellExe = Join-Path $PSHOME "powershell.exe"
if (-not (Test-Path $powershellExe)) {
    # PowerShell 7+ installs as pwsh.exe; Windows PowerShell 5.1 (always present) is powershell.exe
    $powershellExe = "powershell.exe"
}

if (-not (Get-Command py -ErrorAction SilentlyContinue) -and -not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Warning "Python was not found on PATH. Install it from https://python.org (check 'Add python.exe to PATH') and re-run this script."
}

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
$startupShortcut = New-NamedShortcut -FolderSpecialName "Startup" -Label "auto-start shortcut"

if ($desktopShortcut) { Write-Host "Desktop icon created: $desktopShortcut" }
if ($startupShortcut) { Write-Host "Auto-start added:    $startupShortcut  (runs at every sign-in from now on)" }
if ($desktopShortcut -or $startupShortcut) {
    Write-Host "Opening it now..."
    & $startScript
}
