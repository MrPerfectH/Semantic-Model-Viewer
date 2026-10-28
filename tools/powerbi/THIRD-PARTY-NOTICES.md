# Power BI Desktop client libraries

Packaging restores Microsoft.AnalysisServices 19.118.3 and its dependency closure from NuGet. These unmodified components retain their licenses; the extension's MIT license does not replace them. This folder contains the exact dependency versions, package license declarations, available license/notice files, and the Microsoft AMO license (`AMO-EULA.rtf`).

Microsoft documents redistribution using NuGet: https://learn.microsoft.com/analysis-services/tom/install-distribute-and-reference-the-tabular-object-model
AMO terms: https://go.microsoft.com/fwlink/?linkid=852989
MSAL and IdentityModel dependencies declare MIT licenses in their included nuspec files: https://opensource.org/license/mit

The libraries run within Windows PowerShell/.NET Framework. No separate application, .NET SDK, or installer is required on the user's computer. Cloud authentication is not used by this connector; it connects only to a loopback Desktop model.
