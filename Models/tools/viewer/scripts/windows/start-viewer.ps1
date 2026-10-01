# Opens the viewer as its own app window, straight from this folder's
# index.html - no server, no Python. Used by the Desktop and Start menu icons
# that install-shortcuts.ps1 creates.
#
# The app window uses its OWN, separate browser profile (never your regular
# browsing profile) so it never picks up - or leaves behind - unrelated
# browsing data, and running this while that profile's window is already open
# does not pile up a second one. Your saved models and layouts live in that profile.

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ViewerDir = (Resolve-Path (Join-Path $Here "..\..")).Path
$LocalAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $Here "..\..\..\.smv-profile-fallback" }
$ProfileDir = Join-Path $LocalAppData "Semantic Model Viewer\chrome-profile"
$url = ([System.Uri](Join-Path $ViewerDir "index.html")).AbsoluteUri

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
    Start-Process -FilePath $browser -ArgumentList "--user-data-dir=`"$ProfileDir`"", "--no-first-run", "--no-default-browser-check", "--app=`"$url`"", "--new-window"
} else {
    Start-Process $url
}
