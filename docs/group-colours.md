# Group colours

Development feature: **Tables → Display → Colour by → Edit group colours…**.
The group canvas also provides this command in its Legend menu.

Choose **Source** or **Table group**, select a group, and choose its colour. The
preview shows both table roles: facts and dimensions share the group hue while
retaining their different headers and badges. **Apply colours** saves the changes;
**Cancel** or Escape discards them. **Auto** restores one group's automatic colour;
**Reset this mode** restores all automatic colours in the selected mode.

## Grouping rules

- **Source** groups use the connector and available connection-level metadata
  (server, database/catalog, workspace, lakehouse, dataflow and schema). Table names
  do not split a source group. Static parsing only uses metadata it can resolve;
  it does not connect to the source or evaluate M.
- **Table group** reads the table's `TabularEditor_TableGroup` annotation from TMDL
  or BIM. It does not infer groups from measure display folders or schema names.
- An explicit table folder takes priority over special categories in Table group
  mode. Without a folder, calculation groups, field parameters, measure tables,
  manual tables, calculated tables and parameters retain their category colours.
  Ordinary ungrouped tables use a neutral colour.
- Source mode retains those special categories regardless of table-folder membership.

The annotation can be authored without installing Tabular Editor. For example:

```tmdl
table Sales
	annotation TabularEditor_TableGroup = Revenue
```

Colours apply to groups, not individual tables. Assignments are initially ranked by
whole-model table count, with alphabetical ties. Once assigned, automatic palette
slots stay stable across filtering, refreshes and newly added groups. Appearance
and palette changes can change the automatic hues; explicitly chosen colours remain.

## Persistence

Settings are stored per model in the viewer's local/VS Code storage. Saved views and
HTML snapshots carry the colour settings too. Colour editing does not write back to
TMDL or BIM. Offline snapshots keep edits in their tab until another snapshot is
saved. Older snapshots retain their recorded group layout.

Portable exports retain an opaque source-group identity and a connector/schema
label so groups stay separate without adding connection settings to the snapshot.
Power Query definitions still contain any endpoints present in their M code, as
before. Source labels may therefore be less detailed in portable snapshots.
