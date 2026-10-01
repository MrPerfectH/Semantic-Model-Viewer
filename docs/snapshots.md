# Interactive snapshots

Use **Save snapshot** in the app header to download one HTML file containing the
current semantic model and the viewer. Send that file as an attachment, or include
it alongside documentation. The recipient opens it in a desktop browser; no repo,
installation, login, local server, or connection to the semantic model is required.
If an attachment preview shows source text or a static preview, download the file
and open it in the browser instead.

Inside VS Code, **Save snapshot** opens the native Save dialog. The exported HTML
works independently of VS Code and includes any loaded Cleaner usage badges.

## What travels with the file

- The full set of tables, columns, relationships, measure expressions, dependencies,
  effective table roles, and already-loaded report usage.
- The starting analysis view: Tables, Measures, Domains, or Matrix.
- Table membership, positions, selection, focus, pins, zoom, card display, and named
  saved views. A blank or focused canvas still includes the full model for exploration.
- Selected and compared measures, expanded dependencies, library filters, DAX mode,
  split position and ratio, graph direction, wrapping, zoom, and pan.
- Domain group expansion, positions, camera, and Matrix scroll position.

The header shows the snapshot creation time. The file is a frozen copy of model
metadata: it does not refresh or execute DAX against a data source. Refresh the
model in the main app and export again to distribute an updated version.

## Changes in a snapshot

Recipients can explore, change layouts, save named views, compare formulas, and
use **Save snapshot** again. This downloads a new self-contained copy with those
changes. Changes live only in the current tab until exported; opening the original
file again restores its original state. The snapshot does not read or overwrite
models and preferences already stored in the recipient's browser.

Snapshots include model names and DAX business logic. Data-source endpoints,
connection settings, raw queries, repository handles, and raw imported files are
excluded from packaging. Text explicitly written into a measure or description
remains in that metadata. Share the file with people who should see that model.

## Offline packaging

Local scripts and styles are embedded in the file. No runtime downloads, fonts,
repository reconnection, or browser database are needed. A restrictive content
policy blocks outgoing connections and external resources. PNG export and model
import are hidden in offline mode; the complete interactive export remains available.

The package has a versioned data format. Unsupported or malformed snapshots show
a clear error rather than silently loading the sample model. Source parsing and
DAX dependency analysis have the same limitations as the main viewer.

## Verification

`tests/snapshot.browser.cjs` exercises the actual Save snapshot button with the
bundled 51-table, 110-relationship, 336-measure model. It stops the sender's server,
disables network access, makes native storage and repository access unavailable,
and opens the downloaded HTML files directly. It covers each starting view,
selection and viewport restoration, blank canvas completeness, cross-view
exploration, and re-export followed by reopening the recipient's changed file.

`tests/snapshot.test.cjs` and `tests/snapshot-app.test.cjs` cover packaging,
lossless DAX and special-character handling, metadata allowlisting, malformed
payloads, storage isolation, and startup/restore failures. The measure regression
and browser suites cover the saved analysis state and responsive layout.
