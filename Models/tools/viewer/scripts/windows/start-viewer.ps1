# Starts the local app (scripts\serve.py) if it is not already running, then opens the
# viewer as its own window. The Desktop and Start menu icons that install-shortcuts.ps1
# creates run this script.
#
# The window uses its OWN, separate browser profile (never your regular browsing
# profile), and running this while that window is already open brings it forward
# instead of piling up a second one. The server listens on this computer only and
# stops by itself a few minutes after the window is closed.

param([ValidateRange(1, 65535)][int]$Port = 8931)

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ViewerDir = (Resolve-Path (Join-Path $Here "..\..")).Path
$ServePy = Join-Path $ViewerDir "scripts\serve.py"
$LocalAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $Here "..\..\..\.smv-profile-fallback" }
$ProfileDir = Join-Path $LocalAppData "Semantic Model Viewer\chrome-profile"
$Log = Join-Path $LocalAppData "Semantic Model Viewer\viewer.log"
$url = "http://localhost:$Port"

function Show-Problem {
    param([string]$Message)
    try { (New-Object -ComObject WScript.Shell).Popup($Message, 0, "Semantic Model Viewer", 48) | Out-Null } catch { Write-Warning $Message }
}

function Test-ViewerReady {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/ping" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        return ($response.StatusCode -eq 200 -and [string]$response.Content -match '"ok":\s*true')
    } catch {
        return $false
    }
}

function Test-PortOpen {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $result = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $ok = $result.AsyncWaitHandle.WaitOne(300)
        $open = $ok -and $client.Connected
        $client.Close()
        return $open
    } catch {
        return $false
    }
}

if (-not (Test-ViewerReady)) {
    if (Test-PortOpen) {
        Show-Problem "Port $Port is used by another program. Stop it, or run start-viewer.ps1 -Port with a free port."
        exit 1
    }
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        $exe = "py"; $args = @("-3", "`"$ServePy`"", "--port", "$Port", "--idle-exit", "180")
    } else {
        $exe = "python"; $args = @("`"$ServePy`"", "--port", "$Port", "--idle-exit", "180")
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Log) | Out-Null
    try {
        Start-Process -FilePath $exe -ArgumentList $args -WindowStyle Hidden -RedirectStandardOutput $Log -RedirectStandardError "$Log.err"
    } catch {
        Show-Problem "Python 3 is needed to run the viewer. Install it from https://python.org (tick 'Add python.exe to PATH'), then open the app again."
        exit 1
    }
    $tries = 0
    while ($tries -lt 50 -and -not (Test-ViewerReady)) {
        Start-Sleep -Milliseconds 200
        $tries++
    }
    if (-not (Test-ViewerReady)) {
        Show-Problem "The viewer could not start. Check that Python 3 is installed (https://python.org, tick 'Add python.exe to PATH'). Details: $Log.err"
        exit 1
    }
}

function Find-Browser {
    # Environment variables like ProgramFiles(x86) can be unset (32-bit
    # Windows, odd sandboxes) - build the candidate list from only the roots
    # that actually exist instead of handing Join-Path a null path.
    $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA) | Where-Object { $_ }
    $relative = @(
        "Google\Chrome\Application\chrome.exe",
        "Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($rel in $relative) {
        foreach ($root in $roots) {
            $candidate = Join-Path $root $rel
            if (Test-Path $candidate) { return $candidate }
        }
    }
    return $null
}

function Get-RunningProfileWindow {
    # Chrome/Edge lock their user-data-dir, so a second process pointed at
    # the same one won't create a duplicate profile - but it's still worth
    # checking first so a repeat launch doesn't even try. CommandLine is
    # only available via CIM/WMI, not Get-Process.
    try {
        Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" -ErrorAction Stop |
            Where-Object { $_.CommandLine -and $_.CommandLine.Contains($ProfileDir) } |
            Select-Object -First 1
    } catch {
        $null
    }
}

$browser = Find-Browser

if ($browser -and (Get-RunningProfileWindow)) {
    # Already running under our profile - do nothing rather than spawn a
    # second window; the existing one is available from the taskbar.
    return
}

if ($browser) {
    Start-Process -FilePath $browser -ArgumentList "--user-data-dir=`"$ProfileDir`"", "--no-first-run", "--no-default-browser-check", "--app=$url", "--new-window"
} else {
    Start-Process $url
}
