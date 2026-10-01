# Undoes install-shortcuts.ps1: removes the Desktop icon and the Startup entry.
# The server process (if running) is left alone - close its window, or just
# sign out, to stop it; there is nothing else to clean up.
function Remove-NamedShortcut {
    param([string]$FolderSpecialName)
    $folder = [Environment]::GetFolderPath($FolderSpecialName)
    if (-not $folder) { return }
    Remove-Item -ErrorAction SilentlyContinue (Join-Path $folder "Semantic Model Viewer.lnk")
}

Remove-NamedShortcut -FolderSpecialName "Desktop"
Remove-NamedShortcut -FolderSpecialName "Startup"
Write-Host "Removed the Desktop icon and the auto-start entry."
