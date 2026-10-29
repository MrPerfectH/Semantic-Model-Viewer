param(
    [switch]$List,
    [switch]$Connect,
    [string]$Server,
    [string]$Database,
    [string]$OutputPath
)
$ErrorActionPreference = 'Stop'

function Get-TabularAssembly {
    $roots = @()
    $processes = Get-Process PBIDesktop -ErrorAction SilentlyContinue
    foreach ($process in $processes) {
        try { if ($process.Path) { $roots += (Split-Path $process.Path -Parent) } } catch { }
    }
    foreach ($root in ($roots | Select-Object -Unique)) {
        foreach ($candidate in @((Join-Path $root 'Microsoft.AnalysisServices.Tabular.dll'), (Join-Path (Split-Path $root -Parent) 'Microsoft.AnalysisServices.Tabular.dll'))) {
            if (Test-Path $candidate) { return (Get-Item $candidate) }
        }
    }
    foreach ($root in ($roots | Select-Object -Unique)) {
        $found = Get-ChildItem -LiteralPath $root -Filter 'Microsoft.AnalysisServices.Tabular.dll' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { return $found }
    }
    throw 'Could not find Power BI Desktop’s Tabular Object Model library. Confirm that Power BI Desktop is open.'
}

function Connect-TabularServer([string]$dataSource) {
    $serverObject = New-Object Microsoft.AnalysisServices.Tabular.Server
    $serverObject.Connect($dataSource)
    return $serverObject
}

function Get-PowerBiPortFiles {
    $roots = @()
    if ($env:LOCALAPPDATA) {
        $roots += (Join-Path $env:LOCALAPPDATA 'Microsoft\Power BI Desktop\AnalysisServicesWorkspaces')
        $roots += (Join-Path $env:LOCALAPPDATA 'Packages\Microsoft.MicrosoftPowerBIDesktop_8wekyb3d8bbwe\LocalCache\Local\Microsoft\Power BI Desktop Store App\AnalysisServicesWorkspaces')
    }
    if ($env:USERPROFILE) {
        $roots += (Join-Path $env:USERPROFILE 'Microsoft\Power BI Desktop Store App\AnalysisServicesWorkspaces')
    }
    foreach ($root in $roots | Select-Object -Unique) {
        if (Test-Path $root) {
            Get-ChildItem -LiteralPath $root -Filter 'msmdsrv.port.txt' -File -Recurse -ErrorAction SilentlyContinue
        }
    }
}

function Get-ConnectedModels {
    $models = @()
    foreach ($portFile in (Get-PowerBiPortFiles)) {
        $port = (Get-Content -LiteralPath $portFile.FullName -Raw -ErrorAction SilentlyContinue).Trim()
        if ($port -notmatch '^\d{1,5}$') { continue }
        $serverName = 'localhost:' + $port
        $serverObject = $null
        try {
            $serverObject = Connect-TabularServer $serverName
            foreach ($databaseObject in $serverObject.Databases) {
                $models += [ordered]@{
                    server = $serverName
                    database = [string]$databaseObject.Name
                    name = $(if ($databaseObject.Model.Name) { [string]$databaseObject.Model.Name } else { [string]$databaseObject.Name })
                }
            }
        } catch { }
        finally { if ($serverObject) { try { $serverObject.Disconnect() } catch { } } }
    }
    return $models
}

function Convert-DatabaseToBim($databaseObject) {
    $model = $databaseObject.Model
    $tables = @()
    foreach ($table in $model.Tables) {
        if ($table.Name -match '^(LocalDateTable_|DateTableTemplate_)') { continue }
        $columns = @()
        foreach ($column in $table.Columns) {
            $columnType = [string]$column.Type
            $columns += [ordered]@{
                name = $column.Name
                dataType = ([string]$column.DataType).ToLowerInvariant()
                isHidden = [bool]$column.IsHidden
                isKey = [bool]$column.IsKey
                type = $(if ($columnType -match 'Calculated') { 'calculated' } else { 'data' })
                expression = $(if ($columnType -match 'Calculated') { [string]$column.Expression } else { $null })
            }
        }
        $measures = @()
        foreach ($measure in $table.Measures) {
            $measures += [ordered]@{
                name = $measure.Name
                expression = [string]$measure.Expression
                displayFolder = [string]$measure.DisplayFolder
                formatString = [string]$measure.FormatString
                isHidden = [bool]$measure.IsHidden
            }
        }
        $partitions = @()
        foreach ($partition in $table.Partitions) {
            $source = $partition.Source
            $partitions += [ordered]@{
                name = $partition.Name
                source = [ordered]@{
                    type = $(if ($source -and $source.GetType().Name -match 'MPartitionSource') { 'm' } elseif ($source -and $source.GetType().Name -match 'CalculatedPartitionSource') { 'calculated' } else { 'query' })
                    expression = $(if ($source -and $source.PSObject.Properties['Expression']) { [string]$source.Expression } else { '' })
                }
            }
        }
        $outTable = [ordered]@{ name = $table.Name; isHidden = [bool]$table.IsHidden; description = [string]$table.Description; columns = $columns; measures = $measures; partitions = $partitions }
        if ($table.CalculationGroup) {
            $items = @()
            foreach ($item in $table.CalculationGroup.CalculationItems) {
                $format = ''
                if ($item.FormatStringDefinition) { $format = [string]$item.FormatStringDefinition.Expression }
                $items += [ordered]@{ name = $item.Name; expression = [string]$item.Expression; formatStringDefinition = @{ expression = $format } }
            }
            $outTable.calculationGroup = @{ calculationItems = $items }
        }
        $tables += $outTable
    }
    $relationships = @()
    foreach ($relationship in $model.Relationships) {
        $crossDirection = [string]$relationship.CrossFilteringBehavior
        if ($crossDirection -eq 'BothDirections') { $crossDirection = 'bothDirections' }
        elseif ($crossDirection -eq 'OneDirection') { $crossDirection = 'oneDirection' }
        $relationships += [ordered]@{
            name = [string]$relationship.Name
            fromTable = [string]$relationship.FromColumn.Table.Name
            fromColumn = [string]$relationship.FromColumn.Name
            toTable = [string]$relationship.ToColumn.Table.Name
            toColumn = [string]$relationship.ToColumn.Name
            fromCardinality = [string]$relationship.FromCardinality
            toCardinality = [string]$relationship.ToCardinality
            isActive = [bool]$relationship.IsActive
            crossFilteringBehavior = $crossDirection
        }
    }
    $expressions = @()
    foreach ($expression in $model.Expressions) {
        $expressions += [ordered]@{ name = $expression.Name; expression = [string]$expression.Expression }
    }
    return [ordered]@{
        name = [string]$databaseObject.Name
        compatibilityLevel = [int]$databaseObject.CompatibilityLevel
        model = [ordered]@{ tables = $tables; relationships = $relationships; expressions = $expressions }
    }
}

try {
    if (-not $List -and -not $Connect) { throw 'Select either -List or -Connect.' }
    if ($List -and -not (Get-Process PBIDesktop -ErrorAction SilentlyContinue)) {
        Write-Output '[]'
        exit 0
    }
    $assembly = Get-TabularAssembly
    $bin = $assembly.DirectoryName
    foreach ($name in @('Microsoft.AnalysisServices.Core.dll','Microsoft.AnalysisServices.dll','Microsoft.AnalysisServices.Tabular.dll')) {
        $dll = Join-Path $bin $name
        if (Test-Path $dll) { Add-Type -Path $dll }
    }

    if ($List) {
        $models = @(Get-ConnectedModels)
        ConvertTo-Json -InputObject $models -Depth 20 -Compress
        exit 0
    }

    if (-not $Server -or -not $Database -or -not $OutputPath) { throw 'Server, Database, and OutputPath are required to connect.' }
    $serverObject = Connect-TabularServer $Server
    try {
        $databaseObject = $serverObject.Databases.FindByName($Database)
        if (-not $databaseObject) { throw 'The selected model is no longer open in Power BI Desktop. Connect again and choose an open model.' }
        $bim = Convert-DatabaseToBim $databaseObject
        $json = ConvertTo-Json -InputObject $bim -Depth 100
        [IO.File]::WriteAllText($OutputPath, $json, (New-Object Text.UTF8Encoding($false)))
    } finally { $serverObject.Disconnect() }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
