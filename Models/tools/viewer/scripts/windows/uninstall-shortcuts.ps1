# Undoes install-shortcuts.ps1: removes the Desktop icon and the Start menu
# entry (and the Startup entry older versions created). Your saved models live
# in the app's own browser profile under %LOCALAPPDATA%\Semantic Model Viewer;
# delete that folder too if you want them gone.
function Remove-NamedShortcut {
    param([string]$FolderSpecialName)
    $folder = [Environment]::GetFolderPath($FolderSpecialName)
    if (-not $folder) { return }
    Remove-Item -ErrorAction SilentlyContinue (Join-Path $folder "Semantic Model Viewer.lnk")
}

Remove-NamedShortcut -FolderSpecialName "Desktop"
Remove-NamedShortcut -FolderSpecialName "Programs"
Remove-NamedShortcut -FolderSpecialName "Startup"
. (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "power-bi-external-tool.ps1")
$removedPowerBiTool = Remove-PbiExternalTool
Write-Host "Removed the Desktop icon and the Start menu entry."
if ($removedPowerBiTool) { Write-Host "Removed the Power BI Desktop External Tools button." }
