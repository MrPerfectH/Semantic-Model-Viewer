using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using Microsoft.AnalysisServices.AdomdClient;

/// <summary>Read + Build metadata only. Never issues a query against model rows.</summary>
internal static class ConsumerMetadata
{
    internal static object Read(string workspaceName, string modelName, string accessToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceName);
        ArgumentException.ThrowIfNullOrWhiteSpace(modelName);
        ArgumentException.ThrowIfNullOrWhiteSpace(accessToken);
        var builder = new DbConnectionStringBuilder {
            ["Data Source"] = "powerbi://api.powerbi.com/v1.0/myorg/" + workspaceName,
            ["Initial Catalog"] = modelName, ["Connect Timeout"] = 30
        };
        using var connection = new AdomdConnection(builder.ConnectionString);
        connection.AccessToken = new Microsoft.AnalysisServices.AccessToken(accessToken, DateTimeOffset.UtcNow.AddMinutes(5), null);
        connection.Open();
        var warnings = new List<string> {
            "Consumer metadata is permission-dependent and is not a complete model export. Partitions, Power Query, calculation groups, roles and other internal metadata are not read. Hidden or secured objects may be omitted.",
            "Expressions may be withheld without write permission; missing or blank expressions do not prove that an object has no expression."
        };
        var tables = Query(connection, "TABLES", warnings);
        var columns = Query(connection, "COLUMNS", warnings);
        var measures = Query(connection, "MEASURES", warnings);
        var relationships = Query(connection, "RELATIONSHIPS", warnings);
        if (tables is null || tables.Count == 0 || columns is null || columns.Count == 0)
        {
            warnings.Add("INFO.VIEW tables/columns were unavailable or empty; using catalog-restricted DBSCHEMA consumer metadata where available. This fallback cannot expose relationships, expressions or complete tabular metadata.");
            var fallbackTables = Schema(connection, "DBSCHEMA_TABLES", modelName, warnings);
            var fallbackColumns = Schema(connection, "DBSCHEMA_COLUMNS", modelName, warnings);
            // Keep table/column sources paired: schema table names may differ from INFO.VIEW names.
            if (fallbackTables.Count > 0 && fallbackColumns.Count > 0)
            {
                tables = fallbackTables.Select(r => Rename(r, ("TABLE_NAME", "Name"), ("DESCRIPTION", "Description"))).ToList();
                columns = fallbackColumns.Select(r => Rename(r, ("TABLE_NAME", "Table"), ("COLUMN_NAME", "Name"), ("DATA_TYPE", "OleDbDataType"), ("DESCRIPTION", "Description"))).ToList();
            }
        }
        return Map(modelName, tables ?? [], columns ?? [], measures ?? [], relationships ?? [], warnings);
    }

    // The allowlist is deliberately closed: no caller-supplied DAX or model-row queries.
    private static List<Dictionary<string, object?>>? Query(AdomdConnection connection, string kind, List<string> warnings)
    {
        var dax = kind switch {
            "TABLES" => "EVALUATE INFO.VIEW.TABLES()",
            "COLUMNS" => "EVALUATE INFO.VIEW.COLUMNS()",
            "MEASURES" => "EVALUATE INFO.VIEW.MEASURES()",
            "RELATIONSHIPS" => "EVALUATE INFO.VIEW.RELATIONSHIPS()",
            _ => throw new ArgumentOutOfRangeException(nameof(kind))
        };
        try
        {
            using var command = connection.CreateCommand();
            command.CommandText = dax;
            command.CommandTimeout = 60;
            using var reader = command.ExecuteReader();
            var rows = new List<Dictionary<string, object?>>();
            while (reader.Read())
            {
                var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                for (var i = 0; i < reader.FieldCount; i++) row[Normalize(reader.GetName(i))] = reader.IsDBNull(i) ? null : reader.GetValue(i);
                rows.Add(row);
            }
            return rows;
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            // Do not surface provider messages: they may contain credentials/account details.
            warnings.Add($"INFO.VIEW.{kind} metadata is unavailable (unsupported or access denied; {ex.GetType().Name}). Its absence does not mean the model has no such objects.");
            return null;
        }
    }

    private static List<Dictionary<string, object?>> Schema(AdomdConnection connection, string schema, string catalog, List<string> warnings)
    {
        try
        {
            var restrictions = new AdomdRestrictionCollection { new AdomdRestriction("TABLE_CATALOG", catalog) };
            var data = connection.GetSchemaDataSet(schema, restrictions);
            var rows = new List<Dictionary<string, object?>>();
            foreach (DataTable table in data.Tables)
                foreach (DataRow row in table.Rows)
                {
                    var mapped = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                    foreach (DataColumn column in table.Columns) mapped[column.ColumnName] = row.IsNull(column) ? null : row[column];
                    // Defense in depth if the server does not honor the catalog restriction.
                    if (Text(mapped, "TABLE_CATALOG") == catalog) rows.Add(mapped);
                }
            return rows;
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            warnings.Add($"Catalog-restricted {schema} consumer metadata is unavailable ({ex.GetType().Name}).");
            return [];
        }
    }

    // Pure mapping seam for fixture tests; IDs are lookup keys, never guessed relationship endpoints.
    internal static object Map(string modelName, IReadOnlyList<Dictionary<string, object?>> tableRows,
        IReadOnlyList<Dictionary<string, object?>> columnRows, IReadOnlyList<Dictionary<string, object?>> measureRows,
        IReadOnlyList<Dictionary<string, object?>> relationshipRows, List<string> warnings)
    {
        var tables = new Dictionary<string, Dictionary<string, object?>>(StringComparer.Ordinal);
        var tableIds = new Dictionary<string, string>(StringComparer.Ordinal);
        var columnIds = new Dictionary<string, (string Table, string Name)>(StringComparer.Ordinal);
        foreach (var row in tableRows)
        {
            var name = Text(row, "Name");
            if (name.Length == 0) continue;
            if (tables.ContainsKey(name)) { warnings.Add("Duplicate table metadata was omitted."); continue; }
            var table = new Dictionary<string, object?> { ["name"] = name, ["columns"] = new List<Dictionary<string, object?>>(), ["measures"] = new List<Dictionary<string, object?>>() };
            Copy(row, table, "Description", "description"); CopyBool(row, table, "IsHidden", "isHidden");
            tables[name] = table;
            var id = Text(row, "ID"); if (id.Length > 0) tableIds[id] = name;
        }
        foreach (var row in columnRows)
        {
            var tableName = ResolveTable(row, "Table", "TableID", tableIds);
            var name = Text(row, "Name");
            if (name.Length == 0 || !tables.TryGetValue(tableName, out var table)) { warnings.Add("A column with an unavailable table/name was omitted."); continue; }
            var column = new Dictionary<string, object?> { ["name"] = name };
            var dataType = DataType(Text(row, "DataType"), Text(row, "OleDbDataType"));
            if (dataType.Length > 0) column["dataType"] = dataType;
            else warnings.Add("Some column types could not be mapped and are marked unavailable.");
            Copy(row, column, "Description", "description"); Copy(row, column, "Expression", "expression");
            Copy(row, column, "FormatString", "formatString"); Copy(row, column, "DisplayFolder", "displayFolder");
            CopyBool(row, column, "IsHidden", "isHidden"); CopyBool(row, column, "IsKey", "isKey");
            var type = Text(row, "Type");
            if (type.Equals("Calculated", StringComparison.OrdinalIgnoreCase) || type == "2") column["type"] = "calculated";
            ((List<Dictionary<string, object?>>)table["columns"]!).Add(column);
            var id = Text(row, "ID"); if (id.Length > 0) columnIds[id] = (tableName, name);
        }
        if (tables.Count == 0) throw new InvalidOperationException("No visible tables are available through INFO.VIEW or catalog-restricted consumer schema metadata. Check Read + Build access and endpoint support.");
        if (!tables.Values.Any(t => ((List<Dictionary<string, object?>>)t["columns"]!).Count > 0))
            throw new InvalidOperationException("Visible column metadata is unavailable through INFO.VIEW and consumer schema metadata.");
        foreach (var row in measureRows)
        {
            var tableName = ResolveTable(row, "Table", "TableID", tableIds);
            var name = Text(row, "Name");
            if (name.Length == 0 || !tables.TryGetValue(tableName, out var table)) { warnings.Add("A measure with an unavailable table/name was omitted."); continue; }
            var measure = new Dictionary<string, object?> { ["name"] = name };
            foreach (var pair in new[] { ("Expression", "expression"), ("Description", "description"), ("FormatString", "formatString"), ("DisplayFolder", "displayFolder") }) Copy(row, measure, pair.Item1, pair.Item2);
            CopyBool(row, measure, "IsHidden", "isHidden");
            ((List<Dictionary<string, object?>>)table["measures"]!).Add(measure);
        }
        var relationships = new List<Dictionary<string, object?>>();
        foreach (var row in relationshipRows)
        {
            var fromTable = ResolveTable(row, "FromTable", "FromTableID", tableIds);
            var toTable = ResolveTable(row, "ToTable", "ToTableID", tableIds);
            var fromColumn = Text(row, "FromColumn"); var toColumn = Text(row, "ToColumn");
            if (fromColumn.Length == 0 && columnIds.TryGetValue(Text(row, "FromColumnID"), out var fc) && fc.Table == fromTable) fromColumn = fc.Name;
            if (toColumn.Length == 0 && columnIds.TryGetValue(Text(row, "ToColumnID"), out var tc) && tc.Table == toTable) toColumn = tc.Name;
            var fromCard = Cardinality(Text(row, "FromCardinality")); var toCard = Cardinality(Text(row, "ToCardinality"));
            var cross = CrossFilter(Text(row, "CrossFilteringBehavior"));
            if (!HasColumn(tables, fromTable, fromColumn) || !HasColumn(tables, toTable, toColumn) || fromCard is null || toCard is null || cross is null || !Bool(row, "IsActive", out var active))
            { warnings.Add("A relationship with unavailable endpoints, cardinality, activity or cross-filter metadata was omitted; no relationship was inferred."); continue; }
            var relationship = new Dictionary<string, object?> { ["fromTable"] = fromTable, ["fromColumn"] = fromColumn, ["toTable"] = toTable, ["toColumn"] = toColumn,
                ["fromCardinality"] = fromCard, ["toCardinality"] = toCard, ["crossFilteringBehavior"] = cross, ["isActive"] = active };
            Copy(row, relationship, "Name", "name");
            relationships.Add(relationship);
        }
        foreach (var table in tables.Values)
            if (((List<Dictionary<string, object?>>)table["columns"]!).Count == 0) warnings.Add($"No column metadata was returned for table {table["name"]}; column coverage is incomplete.");
        var content = JsonSerializer.Serialize(new { name = modelName, model = new { tables = tables.Values, relationships } });
        return new { transport = "xmla", coverage = "consumer-metadata", warnings = warnings.Distinct().ToArray(), parts = new[] { new { path = "model.bim", content } } };
    }

    private static bool HasColumn(Dictionary<string, Dictionary<string, object?>> tables, string table, string column) =>
        tables.TryGetValue(table, out var t) && ((List<Dictionary<string, object?>>)t["columns"]!).Any(c => (string)c["name"]! == column);
    private static string ResolveTable(Dictionary<string, object?> row, string name, string id, Dictionary<string, string> ids) =>
        Text(row, name) is { Length: > 0 } value ? value : ids.GetValueOrDefault(Text(row, id), "");
    private static string Normalize(string name) => name.Contains('[') && name.EndsWith(']') ? name[(name.LastIndexOf('[') + 1)..^1] : name;
    private static string Text(Dictionary<string, object?> row, string key) => row.TryGetValue(key, out var value) ? Convert.ToString(value, CultureInfo.InvariantCulture) ?? "" : "";
    private static void Copy(Dictionary<string, object?> row, Dictionary<string, object?> target, string source, string destination)
    { var value = Text(row, source); if (value.Length > 0) target[destination] = value; }
    private static bool Bool(Dictionary<string, object?> row, string key, out bool value)
    { var text = Text(row, key); if (bool.TryParse(text, out value)) return true; if (text is "0" or "1") { value = text == "1"; return true; } return false; }
    private static void CopyBool(Dictionary<string, object?> row, Dictionary<string, object?> target, string source, string destination)
    { if (Bool(row, source, out var value)) target[destination] = value; }
    private static Dictionary<string, object?> Rename(Dictionary<string, object?> row, params (string Source, string Target)[] names)
    { var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase); foreach (var (source, target) in names) if (row.TryGetValue(source, out var value)) result[target] = value; return result; }
    private static string? Cardinality(string value) => value.ToLowerInvariant() switch { "one" or "1" => "one", "many" or "2" => "many", _ => null };
    private static string? CrossFilter(string value) => value.Replace(" ", "").ToLowerInvariant() switch { "onedirection" or "single" or "1" => "oneDirection", "bothdirections" or "both" or "2" => "bothDirections", "automatic" or "3" => "automatic", _ => null };
    private static string DataType(string value, string oleDb) => value.Replace(" ", "").ToLowerInvariant() switch {
        "string" or "text" => "string", "int64" or "integer" or "wholenumber" => "int64", "double" or "number" or "decimalnumber" => "double",
        "decimal" or "currency" or "fixeddecimalnumber" => "decimal", "datetime" or "date" => "dateTime", "boolean" or "true/false" => "boolean", "binary" => "binary",
        _ => oleDb switch { "2" or "3" or "16" or "17" or "18" or "19" or "20" or "21" => "int64", "4" or "5" => "double", "6" or "14" or "131" => "decimal", "7" or "133" or "134" or "135" => "dateTime", "11" => "boolean", "8" or "129" or "130" => "string", "128" => "binary", _ => "" }
    };
}
