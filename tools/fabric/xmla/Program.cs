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
    if (string.IsNullOrWhiteSpace(request.AccessToken) || string.IsNullOrWhiteSpace(request.WorkspaceName) || string.IsNullOrWhiteSpace(request.ModelName)) throw new InvalidOperationException("Missing connection metadata.");
    object result;
    try { result = ReadDefinition(request); }
    catch (Exception exception) when (MetadataDenied(exception)) {
        result = ConsumerMetadata.Read(request.WorkspaceName, request.ModelName, request.AccessToken);
    }
    Console.Write(JsonSerializer.Serialize(result));
} catch (Exception exception) {
    // Library exception text can contain endpoint/account details; return only fixed messages.
    var denied = MetadataDenied(exception);
    Console.Write(JsonSerializer.Serialize(new { error = new {
        code = denied ? "XmlaAccessDenied" : "XmlaUnavailable",
        message = denied ? "Your account cannot read this model’s XMLA metadata. Check Read + Build access and the workspace’s XMLA availability." : "XMLA metadata access failed. Check the capacity state, XMLA availability, and model permissions.",
        diagnostic = exception.GetType().Name + ":" + exception.GetBaseException().GetType().Name
    } }));
    Environment.ExitCode = 1;
}
static object ReadDefinition(Request request) {
    var endpoint = "powerbi://api.powerbi.com/v1.0/myorg/" + request.WorkspaceName;
    var builder = new DbConnectionStringBuilder { ["Data Source"] = endpoint, ["Initial Catalog"] = request.ModelName, ["Connect Timeout"] = 30 };
    using var server = new Microsoft.AnalysisServices.Tabular.Server();
    server.AccessToken = new AccessToken(request.AccessToken, DateTimeOffset.UtcNow.AddMinutes(5), null);
    server.Connect(builder.ConnectionString);
    var database = server.Databases.Find(request.ModelId) ?? server.Databases.Cast<Microsoft.AnalysisServices.Tabular.Database>().SingleOrDefault(database => database.Name == request.ModelName) ?? throw new InvalidOperationException("Model is unavailable on this XMLA endpoint.");
    var content = Microsoft.AnalysisServices.Tabular.JsonSerializer.SerializeDatabase(database);
    return new { transport = "xmla", coverage = "permission-dependent", warnings = new[] { "XMLA exposes metadata allowed by your account. Read + Build access may hide internal metadata, including expressions and partitions; empty fields do not prove those objects are absent." }, parts = new[] { new { path = "model.bim", content } } };
}
static bool MetadataDenied(Exception exception) {
    for (Exception? current = exception; current != null; current = current.InnerException) {
        if (current is UnauthorizedAccessException || current is System.Net.Http.HttpRequestException http && http.StatusCode == System.Net.HttpStatusCode.Forbidden) return true;
        if (new[] { "permission", "access denied", "not authorized" }.Any(text => current.Message.Contains(text, StringComparison.OrdinalIgnoreCase))) return true;
    }
    return false;
}
record Request(string WorkspaceId, string WorkspaceName, string ModelId, string ModelName, string AccessToken);
