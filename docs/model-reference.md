# Model reference

Open **Reference** in the top navigation. The left library searches tables,
columns, measures, calculation groups/items, hierarchies and Power Query
objects. Search matches names, table names, descriptions and display folders;
**Include DAX and M** also searches expressions. Object type narrows the results.
Large result sets show 100 objects at a time, with **Show more**.

Selecting an object opens a reference page. Tables have Overview, Columns,
Relationships, Measures, Power Query, Hierarchies and Properties tabs.
Calculation groups also have Calculation items. Measures, columns and
calculation items have Expression, Dependencies and Properties tabs. Query
pages show their exact available definition and detected direct inputs.

Links between objects stay in the reference. **Back** restores the preceding
object, tab, search and page position. **Explore relationships** opens the table
in Tables; **Explore dependencies** opens the measure or column in Measures.
**Link to object** exposes a URL with an object fragment. On a local file this
URL names the sender's local path; recipients must use the fragment with their
own copy. Object identities contain type, parent table and name, so renaming an
object changes its link.

## Facts and derived references

Descriptions are read from the model, never generated. Missing descriptions
are explicitly shown as unavailable. Measures stored in a table are listed
separately from measures referencing its data. Direct and indirect measure
references are distinguished. Calculation-group precedence, item ordinals,
expressions and dynamic formats are available when imported. `SELECTEDMEASURE()`
is context-dependent; the viewer does not infer a fixed list of affected measures.

The reference retains these additional fields from TMDL and BIM:

- Table, column, measure, hierarchy and calculation-item descriptions.
- Column formatting, sorting, summarization, category, source column and lineage.
- Measure dynamic format expressions and lineage.
- Calculation-group precedence and item ordinals.
- Hierarchies and their levels, column references and ordinals.
- Partition names, source types and storage modes.

TMDL `///` descriptions and multiline description properties are supported.
The JavaScript and Python importers share this allowlisted field contract.
The Python model generator's existing separate Power Query enrichment step
is still needed to include exact M definitions.

Security roles, perspectives, translations, arbitrary annotations, and calculation
selection expressions are not covered by this reference. Static DAX/M analysis
has the same limitations as the existing visual views. No detected references
never establishes that an object is unused. Report usage and runtime values are
not inferred. Old snapshots and cached models can lack the new fields; reimport
source definitions to obtain them.

## Offline sharing

**Save snapshot** embeds the reference UI, metadata, search, selected object and
tab. The recipient can navigate, inspect expressions, open visual views, and
re-export without a server, network, repository or native browser storage.

The reference distinguishes the metadata-opened timestamp, when known, from
snapshot creation time. Re-exporting preserves the known metadata-opened time.
Neither timestamp establishes that the source service is currently up to date.
CLI exports without an opened timestamp show their snapshot creation time.

The existing snapshot scope is unchanged: full supported model metadata and
available DAX/M definitions travel with the file, including text written in M.
Search filters do not redact exported content. No service authentication or
connection settings are added by this feature.

## Verification

- `node --test tests/reference.test.cjs`: TMDL/BIM preservation, Python parity,
  search, scoped identities, old-model behavior and snapshot allowlisting.
- `node --test tests/reference.browser.cjs`: actual offline runtime, navigation,
  tabs, dependency-view integration, re-export, restore, responsive width,
  model replacement and safe rendering of hostile metadata.
