# Bundled XMLA components

The helper includes Microsoft.AnalysisServices and Microsoft.AnalysisServices.AdomdClient 19.118.3, their runtime dependencies, and the self-contained .NET 8 runtime. These components retain their own licenses; the application's MIT license does not replace them.

- `AMO-EULA.rtf`: English license from the AMO package's NuGet license URL, https://go.microsoft.com/fwlink/?linkid=852989 (retrieved 2026-10-26).
- `ADOMD-EULA.rtf`: English license from the ADOMD package's NuGet license URL, https://go.microsoft.com/fwlink/?linkid=852895 (retrieved 2026-10-26).
- `DOTNET-LICENSE.txt` and `DOTNET-THIRD-PARTY-NOTICES.txt`: copied during publication from the exact Microsoft.NETCore.App.Runtime package for each runtime ID/version. Windows and Unix notice texts differ; `copy-notices.cjs` resolves the restored package and fails if its notices are unavailable.

MSAL Node and its JavaScript production dependencies include their license files under the packaged `node_modules` directories. The NuGet dependency versions and license declarations are recorded in the helper's restored `obj/project.assets.json` and package `.nuspec` files during the build. Microsoft.Identity.Client, Microsoft.Identity.Client.Broker, Microsoft.Identity.Client.NativeInterop and Microsoft.IdentityModel.Abstractions declare MIT licenses.

Distribution must respect the bundled component terms, including the AMO/ADOMD distribution requirements. Including notices records the component terms; it does not establish publisher signing, notarization, or completion of the public-distribution review.
