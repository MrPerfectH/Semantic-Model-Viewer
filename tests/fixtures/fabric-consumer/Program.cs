using System.Text.Json;
static Dictionary<string, object?> Row(params object[] pairs) {
    var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
    for (int i = 0; i < pairs.Length; i += 2) row[(string)pairs[i]] = pairs[i+1];
    return row;
}
static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
var tables = new[] { Row("ID", 1, "Name", "Sales", "IsHidden", true, "Description", "Visible to consumer"), Row("ID", 2, "Name", "Products") };
var columns = new[] { Row("ID", 10, "TableID", 1, "Name", "Product", "DataType", "Whole Number", "Type", "Calculated", "Expression", "1", "IsHidden", true), Row("ID", 20, "Table", "Products", "Name", "ID", "DataType", "Integer"), Row("ID", 11, "Table", "Sales", "Name", "Amount", "DataType", "Number"), Row("ID", 21, "Table", "Products", "Name", "Future", "DataType", "FutureType") };
var measures = new[] { Row("Table", "Sales", "Name", "Total", "FormatString", "0.00", "DisplayFolder", "Totals") };
var relationships = new[] { Row("Name", "r", "FromTableID", 1, "ToTableID", 2, "FromColumnID", 10, "ToColumnID", 20, "FromCardinality", "Many", "ToCardinality", "One", "CrossFilteringBehavior", "BothDirections", "IsActive", false), Row("FromTable", "Missing") };
var warnings = new List<string>();
var result = JsonSerializer.SerializeToElement(ConsumerMetadata.Map("Model", tables, columns, measures, relationships, warnings));
Check(result.GetProperty("coverage").GetString() == "consumer-metadata", "coverage");
var bim = JsonDocument.Parse(result.GetProperty("parts")[0].GetProperty("content").GetString()!).RootElement.GetProperty("model");
var sales = bim.GetProperty("tables")[0];
Check(sales.GetProperty("isHidden").GetBoolean(), "hidden table");
Check(sales.GetProperty("columns")[0].GetProperty("type").GetString() == "calculated", "calculated");
Check(sales.GetProperty("columns")[0].GetProperty("dataType").GetString() == "int64", "data type");
Check(!sales.GetProperty("measures")[0].TryGetProperty("expression", out _), "no invented expression");
Check(!sales.TryGetProperty("partitions", out _), "no fabricated partitions");
Check(bim.GetProperty("relationships").GetArrayLength() == 1, "unknown relationship omitted");
var rel = bim.GetProperty("relationships")[0];
Check(rel.GetProperty("fromTable").GetString() == "Sales" && rel.GetProperty("toColumn").GetString() == "ID", "ID resolution");
Check(rel.GetProperty("fromCardinality").GetString() == "many" && rel.GetProperty("crossFilteringBehavior").GetString() == "bothDirections" && !rel.GetProperty("isActive").GetBoolean(), "relationship mapping");
Check(warnings.Count > 0, "omission warning");
Check(sales.GetProperty("columns")[1].GetProperty("dataType").GetString() == "double", "live INFO.VIEW Number type");
var products = bim.GetProperty("tables")[1];
Check(products.GetProperty("columns")[0].GetProperty("dataType").GetString() == "int64", "live INFO.VIEW Integer type");
Check(!products.GetProperty("columns")[1].TryGetProperty("dataType", out _), "unknown type is not guessed");
foreach (var emptyTables in new[] { true, false }) {
    bool failed = false;
    try { ConsumerMetadata.Map("Empty", emptyTables ? [] : tables, [], [], [], []); } catch (InvalidOperationException) { failed = true; }
    Check(failed, "mandatory metadata must fail");
}
Console.WriteLine(result.GetRawText());
Console.WriteLine("15 mapper checks passed.");
