# Starts the viewer server (if it isn't already running) and opens it as its
# own app window. Used by the Desktop icon and the Startup-folder shortcut
# that install-shortcuts.ps1 creates.
#
# The app window uses its OWN, separate browser profile (never your regular
# browsing profile) so it never picks up - or leaves behind - unrelated
# browsing data, and running this while that profile's window is already open
# does not pile up a second one.

param([ValidateRange(1, 65535)][int]$Port = 8931)

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ViewerDir = (Resolve-Path (Join-Path $Here "..\..")).Path
$LocalAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $Here "..\..\..\.smv-profile-fallback" }
$ProfileDir = Join-Path $LocalAppData "Semantic Model Viewer\chrome-profile"

function Test-PortOpen {
    param([int]$Port)
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

# A listening port alone may belong to an unrelated service or another checkout.
# Compare the entry page with this installation before opening the browser.
function Test-ViewerReady {
    param([int]$Port)
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/index.html" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        $expected = [System.IO.File]::ReadAllText((Join-Path $ViewerDir "index.html"))
        return $response.StatusCode -eq 200 -and [string]::Equals([string]$response.Content, $expected, [System.StringComparison]::Ordinal)
    } catch {
        return $false
    }
}

$portInUse = Test-PortOpen -Port $Port
if ($portInUse -and -not (Test-ViewerReady -Port $Port)) {
    throw "Port $Port is occupied by another service or viewer version. Stop that server or run start-viewer.ps1 -Port with a free port."
}
if (-not $portInUse) {
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        $exe = "py"; $args = @("-3", "-m", "http.server", "$Port", "--bind", "127.0.0.1", "--directory", "`"$ViewerDir`"")
    } else {
        $exe = "python"; $args = @("-m", "http.server", "$Port", "--bind", "127.0.0.1", "--directory", "`"$ViewerDir`"")
    }
    $started = $true
    try {
        Start-Process -FilePath $exe -ArgumentList $args -WindowStyle Hidden
    } catch {
        $started = $false
        Write-Warning "Could not start the server with '$exe'. Install Python 3 from https://python.org (check 'Add python.exe to PATH') and try again."
    }
    if ($started) {
        $tries = 0
        while ($tries -lt 25 -and -not (Test-ViewerReady -Port $Port)) {
            Start-Sleep -Milliseconds 200
            $tries++
        }
    }
}

if (-not (Test-ViewerReady -Port $Port)) {
    throw "Semantic Model Viewer did not start on port $Port. Check that Python 3 is installed and the port is available."
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

$url = "http://localhost:$Port"
$browser = Find-Browser

if ($browser -and (Get-RunningProfileWindow)) {
    # Already running under our profile - do nothing rather than spawn a
    # second window; the existing one is available from the taskbar.
    return
}

if ($browser) {
    Start-Process -FilePath $browser -ArgumentList "--user-data-dir=`"$ProfileDir`"", "--app=$url", "--new-window"
} else {
    Start-Process $url
}
