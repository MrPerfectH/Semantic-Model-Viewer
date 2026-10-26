# Build an unpack-and-run Windows x64 distribution without installing Python.
[CmdletBinding()]
param(
    [string]$OutputPath,
    [string]$PythonZip
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) { $OutputPath = Join-Path $repo 'dist\semantic-model-viewer-windows-portable.zip' }
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
$buildRoot = Join-Path ([IO.Path]::GetTempPath()) ('smv-portable-' + [guid]::NewGuid())
$stage = Join-Path $buildRoot 'stage'
$viewer = Join-Path $stage 'Models\tools\viewer'
$expectedHash = '9e35319bffedab8b36ad44d8f377cb4f1733bcec257a0b6d04d94f01486ddb38'

try {
    New-Item -ItemType Directory -Path $viewer -Force | Out-Null
    if (-not $PythonZip) {
        $PythonZip = Join-Path $buildRoot 'python-3.13.17-embed-amd64.zip'
        Invoke-WebRequest -UseBasicParsing -Uri 'https://www.python.org/ftp/python/3.13.17/python-3.13.17-embed-amd64.zip' -OutFile $PythonZip
    }
    $actualHash = (Get-FileHash -LiteralPath $PythonZip -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) { throw "Python runtime SHA-256 mismatch: $actualHash" }

    $source = Join-Path $repo 'Models\tools\viewer'
    Get-ChildItem -LiteralPath $source -File | Where-Object { $_.Extension -in '.html', '.css', '.js', '.json', '.webmanifest' } | Copy-Item -Destination $viewer
    foreach ($directory in @('js', 'icons')) {
        Copy-Item -LiteralPath (Join-Path $source $directory) -Destination $viewer -Recurse
    }
    $scripts = Join-Path $viewer 'scripts'
    New-Item -ItemType Directory -Path $scripts -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $source 'scripts\serve.py') -Destination $scripts
    Copy-Item -LiteralPath (Join-Path $source 'scripts\fabric_bridge.py') -Destination $scripts
    Copy-Item -LiteralPath (Join-Path $source 'scripts\windows') -Destination $scripts -Recurse
    $models = Join-Path $stage 'Models'
    Copy-Item -LiteralPath (Join-Path $repo 'Models\demo') -Destination $models -Recurse
    Copy-Item -LiteralPath (Join-Path $repo 'Run Semantic Model Viewer.cmd'), (Join-Path $repo 'LICENSE') -Destination $stage
    Expand-Archive -LiteralPath $PythonZip -DestinationPath (Join-Path $viewer 'runtime')
    # Embedded Python ignores the script directory unless it is listed explicitly.
    Add-Content -LiteralPath (Join-Path $viewer 'runtime\python313._pth') -Value '../scripts' -Encoding ASCII
    New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $OutputPath -Force
    Write-Host "Portable ZIP: $OutputPath"
    Write-Host "Python 3.13.17 amd64 SHA-256 verified: $actualHash"
} finally {
    # Only remove this invocation's unique temporary directory.
    if (Test-Path -LiteralPath $buildRoot) {
        $resolved = (Resolve-Path -LiteralPath $buildRoot).Path
        $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
        if ((Split-Path -Parent $resolved) -ne $tempRoot -or (Split-Path -Leaf $resolved) -notlike 'smv-portable-*') {
            throw "Refusing to remove unexpected build directory: $resolved"
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
