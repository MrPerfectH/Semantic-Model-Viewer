# Installs Semantic Model Viewer as a Windows app:
#   - a Desktop icon and a Start menu entry that open the app window
#   - it opens this viewer folder's index.html directly from disk, so there is
#     no server, no Python and nothing running in the background
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

# Earlier versions started a Python server at every sign-in; it is no longer needed.
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
