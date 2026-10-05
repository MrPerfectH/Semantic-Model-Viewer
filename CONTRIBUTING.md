# Contributing

Thanks for helping. Bug reports, ideas and pull requests are all welcome.
Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Report a bug or suggest a feature

Open an [issue](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/new/choose) and
pick a form. **Do not paste confidential model content** (table names, measures, DAX from
real business models). Use the built-in "Contoso Retail" demo model, or a small made-up
model, to show the problem. To report a security problem, see [SECURITY.md](SECURITY.md).

## Run it from source

You need Python 3 and a browser.

```bash
python3 Models/tools/viewer/scripts/serve.py --open
# Semantic Model Viewer: http://localhost:8931
```

Use `--port` to pick another port. Edit files in `Models/tools/viewer/` and reload the page.

## No build step

The app is plain vanilla JS, HTML and CSS. There is no bundler, no transpiler and no
runtime dependency. Please keep it that way: do not add a framework, a build tool or an
npm package to `Models/tools/viewer/`.

## Run the tests

You need Node.js 22. From the repo root:

```bash
node vscode-extension/scripts/sync-viewer.js
node --test tests/*.test.cjs Models/tools/viewer/tests/*.test.js tests/extension.test.js tests/usage-adapter.test.js
```

CI runs the same checks through `npm test` in `vscode-extension/`. To run them that way:

```bash
cd vscode-extension
npm ci
npm test
```

Optional real-Chrome layout checks are described under "Regression checks" in the
[README](README.md#regression-checks).

## Build the VS Code extension

```bash
cd vscode-extension
npm ci
npm test
npm run package   # writes semantic-model-viewer-<version>.vsix
```

The extension copies the viewer from `Models/tools/viewer/` (`npm run sync-viewer`). Edit the
viewer there, never in the copy. More detail is in
[vscode-extension/README.md](vscode-extension/README.md).

## Pull requests

- Branch from `main` and keep each PR to one change.
- Add or update a test when behavior changes.
- Make sure the tests above pass.
- If you change a user-visible behavior, update the README or `vscode-extension/CHANGELOG.md`.
- Never commit real or private models. Only synthetic data belongs in this repo.
- Write a short commit message that says what changed, for example
  `fix(viewer): keep the minimap in view`.

By contributing, you agree that your work is released under the [MIT License](LICENSE).
