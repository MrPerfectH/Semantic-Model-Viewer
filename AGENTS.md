# Opening Semantic Model Viewer

Use the Viewer CLI from this checkout. Do not copy the Viewer HTML/JS into a
client folder or reuse a local HTTP port as proof that the current app is open.

```sh
node scripts/open-model.cjs "/absolute/path/Model.SemanticModel"
```

Each launch reads TMDL again and creates a unique, self-contained snapshot with
the renderer from this checkout. It validates relationship endpoints and writes
a sibling `launch.json` with source, renderer revision, dirty state, counts and
HTML hash. It rejects a checkout behind its cached `origin/main`.

On the owner's Mac, the stable installed command is
`~/.local/bin/smv-open-model <model-folder>`; it uses the configured stable Viewer
checkout, not a temporary T3 worktree. After model edits, run it again. Do not
reopen an older snapshot and claim that it refreshed.

Before claiming latest upstream, fetch `origin` in the configured checkout and
check its revision. Launch does not access the network or automatically update
code. Keep user changes and stop if a fast-forward update cannot be made safely.

Verify the rendered model name/counts, both cardinalities and filter direction,
and click a relationship to check its exact `Table[Column]` endpoints. Snapshot
generation alone is not browser acceptance. Column pairs currently appear on
hover/click and in the table inspector; they are not permanent line labels.
