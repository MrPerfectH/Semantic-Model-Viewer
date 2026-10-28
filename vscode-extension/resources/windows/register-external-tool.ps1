# Only this registration operation can request elevation. The viewer and VS Code
# continue running as the normal user. No model connection is made here.
param([string]$RegistrationBase64, [switch]$Remove)
$ErrorActionPreference = 'Stop'

try {
    $common = ${env:CommonProgramFiles(x86)}
    if (-not $common) { $common = [Environment]::GetFolderPath('CommonProgramFilesX86') }
    if (-not $common) { $common = $env:CommonProgramFiles }
    if (-not $common) { $common = [Environment]::GetFolderPath('CommonProgramFiles') }
    if (-not $common) { throw 'Windows did not report its Common Files folder.' }
    $folder = Join-Path $common 'Microsoft Shared\Power BI Desktop\External Tools'
    $target = Join-Path $folder 'Semantic Model Viewer VS Code.pbitool.json'

    # The elevated operation contains fixed code and encoded JSON data. It never
    # executes a downloaded/user-writable script or reads a shared temporary file.
    $quotedTarget = "'" + $target.Replace("'", "''") + "'"
    $quotedFolder = "'" + $folder.Replace("'", "''") + "'"
    if ($Remove) {
        $operation = "[IO.File]::Delete($quotedTarget)"
        if (-not (Test-Path -LiteralPath $target)) { Write-Output $target; exit 0 }
    } else {
        $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($RegistrationBase64))
        $registration = $json | ConvertFrom-Json
        if ($registration.name -ne 'Semantic Model Viewer (VS Code)' -or
            $registration.arguments -notmatch '^--open-url "vscode(-insiders)?://MrPerfectH\.semantic-model-viewer/powerbi\?server=%server%&database=%database%"$') {
            throw 'Invalid Semantic Model Viewer registration.'
        }
        # Re-encode validated text before interpolating; no input becomes PowerShell code.
        $encodedJson = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
        $operation = "New-Item -ItemType Directory -Force -Path $quotedFolder | Out-Null; " +
            "[IO.File]::WriteAllBytes($quotedTarget, [Convert]::FromBase64String('$encodedJson'))"
        if ((Test-Path -LiteralPath $target) -and [IO.File]::ReadAllText($target) -eq $json) { Write-Output $target; exit 0 }
    }

    try {
        & ([ScriptBlock]::Create($operation))
    } catch {
        # Static .NET file methods wrap access errors in MethodInvocationException.
        $cause = $_.Exception
        $accessDenied = $_.CategoryInfo.Category -eq 'PermissionDenied' -or $_.CategoryInfo.Category -eq 'SecurityError'
        while ($cause) {
            if ($cause -is [System.UnauthorizedAccessException] -or $cause.HResult -eq -2147024891) { $accessDenied = $true }
            $cause = $cause.InnerException
        }
        if (-not $accessDenied) { throw }
        $command = '$ErrorActionPreference = ''Stop''; try { ' + $operation + '; exit 0 } catch { exit 1 }'
        $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
        $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        try {
            $process = Start-Process -FilePath $powershell -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList @('-NoProfile', '-NonInteractive', '-EncodedCommand', $encodedCommand)
        } catch { throw 'Registration was not approved. The viewer still works without the Power BI ribbon button.' }
        if ($process.ExitCode -ne 0) { throw 'Windows could not update the Power BI ribbon registration. Ask your administrator to check folder permissions.' }
    }
    if ($Remove) {
        if (Test-Path -LiteralPath $target) { throw 'Could not remove the Power BI ribbon registration.' }
    } elseif (-not (Test-Path -LiteralPath $target) -or [IO.File]::ReadAllText($target) -ne $json) {
        throw 'Could not verify the Power BI ribbon registration.'
    }
    Write-Output $target
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
