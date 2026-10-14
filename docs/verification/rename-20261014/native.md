# Installed VS Code rename smoke — 2026-10-14

Actual native VS Code 1.141.1 x64, revision
`7baac39ec3ca969dab74ac12c097f6a486e46593`, Omarchy/Arch Linux Wayland.
Separate disposable `/tmp/smv-rename-native/profile`, extensions, and synthetic
repository. User configuration and real models untouched; no source/service state
injection. Real packaged extension installed via CLI, native model tree opened a
TMDL model. Native quick picks/input/diff editors/notification controls were driven
through the real Electron renderer CDP endpoint and Linux desktop pointer tools.
The endpoint belongs to the installed VS Code app, not a substitute browser.

Synthetic repository: Sales table, Amount column, Total Sales measure and Margin
measure referencing `[Total Sales]`; sibling bound Demo.Report includes semantic
Measure Property and queryRef plus a literal title `Total Sales`.

## Forward rename and cancellation

Tested package SHA256:
`52ae0dbc18cc9239fa062f787866207841be760d11c83dff694dc0346fe751b8`.
Chosen actual command **Semantic Model Viewer: Rename Object and References…**,
selected Total Sales, entered Revenue. Preview opened two native editor tabs:
[report diff](native/preview-report.jpg), [model diff](native/preview-model.jpg).
Both inspected by switching tabs; original disk SHA256 remained unchanged before
Apply. Nonmodal notification permits inspecting diffs and remains available in the
notification center after its toast hides.

Explicit **Apply reviewed rename** changed both actual files:

```tmdl
measure 'Revenue' = SUM(Sales[Amount])
measure 'Margin' = [Revenue] * 0.2
```

Report Property became Revenue, queryRef Sales.Revenue; title remained Total Sales.
Viewer refreshed its model: Measures showed Revenue, Margin and one dependency:
[native refreshed viewer](native/after-native-refresh.jpg).

Second rename through actual header **Rename object…**, Revenue → Income, reached
both file previews. Dismissing the final review notification cancelled it; model
and report byte hashes stayed identical to post-apply hashes:
[cancelled preview](native/cancel-preview.jpg).

## Host findings repaired and final-candidate replay

Native testing identified two UX defects, repaired by the implementation owner:

1. Initial modal confirmation prevented inspecting other diff tabs; made nonmodal.
2. Awaiting final success notification held the rename controller busy until the
   notification was dismissed; made final success/error notices fire-and-forget.

Final candidate SHA256:
`e751838f2fbee98788632c550ca2e355942f749adf63adb1776af2f86bfe9913`.
Force installed and restarted isolated VS Code; installed `src/rename.js` byte-matches
current repository source. Actual reverse rename Revenue → Total Sales was reviewed
and explicitly applied. Without dismissing success notification, clicking the
visible viewer header opened a subsequent object picker immediately, proving busy
state released: [subsequent picker](native/final2-subsequent-pick.jpg). Escape
cancelled that picker. Both real source-file SHA256 manifests remained unchanged.

Artifacts/logs and exact installed package remain under `/tmp/smv-rename-native`
and `/tmp/smv-rename-preview.vsix`. This proves native Linux installed behavior;
no fresh Windows/macOS claim, Power BI engine/report rendering validation,
published release, main merge, or Fabric modification.
