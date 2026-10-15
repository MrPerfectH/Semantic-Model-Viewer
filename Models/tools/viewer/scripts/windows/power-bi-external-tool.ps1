# Registers / unregisters Semantic Model Viewer as a Power BI Desktop external tool.
# Dot-sourced by install-shortcuts.ps1 and uninstall-shortcuts.ps1.
#
# Power BI Desktop reads *.pbitool.json files from one machine-wide folder when it starts,
# and shows each one as a button in the External Tools ribbon. That folder is under
# Program Files, so writing to it needs administrator rights; if the current window is
# not elevated, Windows asks once (UAC prompt) and a short elevated step does the copy.
#
# The button only opens the app (start-viewer.ps1). Power BI Desktop's %server% and
# %database% values are not used yet.

$script:PbiToolFileName = "Semantic Model Viewer.pbitool.json"

function Get-PbiExternalToolsFolder {
    $common = ${env:CommonProgramFiles(x86)}
    if (-not $common) { $common = $env:CommonProgramFiles }
    if (-not $common) { return $null }
    return Join-Path $common "Microsoft Shared\Power BI Desktop\External Tools"
}

function Invoke-ElevatedCommand {
    # Runs a PowerShell snippet in an elevated window. Returns $true if the user accepted
    # the UAC prompt and the snippet finished; the caller checks the result on disk.
    param([string]$Command)
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
    try {
        Start-Process -FilePath "powershell.exe" -Verb RunAs -Wait -WindowStyle Hidden `
            -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encoded
        return $true
    } catch {
        return $false
    }
}

function Install-PbiExternalTool {
    param([string]$StartScript, [string]$IconPng)

    $folder = Get-PbiExternalToolsFolder
    if (-not $folder) {
        Write-Warning "Could not find the Power BI Desktop External Tools folder - skipping the Power BI button."
        return $null
    }

    $powershellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $registration = [ordered]@{
        version     = "1.0.0"
        name        = "Semantic Model Viewer"
        description = "Open Semantic Model Viewer"
        path        = $powershellExe
        arguments   = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$StartScript`""
    }
    if ($IconPng -and (Test-Path $IconPng)) {
        $registration["iconData"] = "image/png;base64," + [Convert]::ToBase64String([IO.File]::ReadAllBytes($IconPng))
    }
    $json = $registration | ConvertTo-Json

    # Power BI Desktop is happiest with UTF-8 without a byte-order mark.
    $temp = Join-Path ([IO.Path]::GetTempPath()) $script:PbiToolFileName
    [IO.File]::WriteAllText($temp, $json, (New-Object Text.UTF8Encoding($false)))

    $target = Join-Path $folder $script:PbiToolFileName
    try {
        New-Item -ItemType Directory -Force -Path $folder -ErrorAction Stop | Out-Null
        Copy-Item -LiteralPath $temp -Destination $target -Force -ErrorAction Stop
    } catch {
        Write-Host "Power BI Desktop needs administrator rights to add the button. Approve the Windows prompt..."
        $quoted = { param($p) "'" + $p.Replace("'", "''") + "'" }
        $null = Invoke-ElevatedCommand ("New-Item -ItemType Directory -Force -Path " + (& $quoted $folder) + " | Out-Null; " +
            "Copy-Item -LiteralPath " + (& $quoted $temp) + " -Destination " + (& $quoted $target) + " -Force")
    }
    Remove-Item -ErrorAction SilentlyContinue $temp

    if (Test-Path $target) { return $target }
    Write-Warning "Could not add the Power BI button at $target. Run the installer again and approve the Windows prompt."
    return $null
}

function Remove-PbiExternalTool {
    $folder = Get-PbiExternalToolsFolder
    if (-not $folder) { return $false }
    $target = Join-Path $folder $script:PbiToolFileName
    if (-not (Test-Path $target)) { return $false }

    Remove-Item -ErrorAction SilentlyContinue -LiteralPath $target
    if (Test-Path $target) {
        Write-Host "Power BI Desktop needs administrator rights to remove the button. Approve the Windows prompt..."
        $null = Invoke-ElevatedCommand ("Remove-Item -LiteralPath '" + $target.Replace("'", "''") + "' -Force")
    }
    return -not (Test-Path $target)
}
