using System.Text.Json;
using JsonSerializer = System.Text.Json.JsonSerializer;
using System.Data.Common;
using Microsoft.AnalysisServices;
using Microsoft.AnalysisServices.Tabular;
// One request per process. Credentials arrive through stdin, never process arguments.
try {
    var input = await Console.In.ReadToEndAsync();
    if (input.Length > 1024 * 1024) throw new InvalidOperationException("Request is too large.");
    var request = JsonSerializer.Deserialize<Request>(input, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? throw new InvalidOperationException("Missing request.");
    if (!Guid.TryParse(request.WorkspaceId, out _) || !Guid.TryParse(request.ModelId, out _)) throw new InvalidOperationException("Invalid Fabric IDs.");
    if (string.IsNullOrWhiteSpace(request.AccessToken)) throw new InvalidOperationException("Microsoft access token is required.");
    // TOM escapes the workspace name during endpoint resolution. Pre-escaping makes percent sequences literal.
    // Include workspace IDs to disambiguate duplicate names.
    if (string.IsNullOrWhiteSpace(request.WorkspaceName)) throw new InvalidOperationException("Workspace name is required for XMLA.");
    var endpoint = "powerbi://api.powerbi.com/v1.0/myorg/" + request.WorkspaceName + " - " + request.WorkspaceId;
    var builder = new DbConnectionStringBuilder { ["Data Source"] = endpoint, ["Initial Catalog"] = request.ModelId, ["Connect Timeout"] = 30 };
    using var server = new Microsoft.AnalysisServices.Tabular.Server();
    server.AccessToken = new AccessToken(request.AccessToken, DateTimeOffset.UtcNow.AddMinutes(5), null);
    server.Connect(builder.ConnectionString);
    var database = server.Databases.Find(request.ModelId) ?? throw new InvalidOperationException("Model is unavailable on this XMLA endpoint.");
    // TOM's serializer emits full BIM metadata including partitions and shared expressions.
    var content = Microsoft.AnalysisServices.Tabular.JsonSerializer.SerializeDatabase(database);
    Console.Write(JsonSerializer.Serialize(new { transport = "xmla", coverage = "permission-dependent", warnings = new[] { "XMLA exposes metadata allowed by your account. Read + Build access may hide internal metadata, including expressions and partitions; empty fields do not prove those objects are absent." }, parts = new[] { new { path = "model.bim", content } } }));
} catch (Exception exception) {
    // Library exception text can contain endpoint/account details; return a sanitized error.
    Console.Write(JsonSerializer.Serialize(new { error = new { code = "XmlaUnavailable", message = "XMLA metadata access failed. Check Read + Build permissions, capacity, XMLA settings, and the selected workspace.", diagnostic = exception.GetType().Name + ":" + exception.GetBaseException().GetType().Name } }));
    Environment.ExitCode = 1;
}
record Request(string WorkspaceId, string WorkspaceName, string ModelId, string AccessToken);
