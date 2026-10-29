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
npm package to the core browser viewer. The optional MCP integration lives in
`integrations/mcp/`; its official SDK bridge is bundled with `npm run build:mcp-app`.
The core app and CLI snapshot/HTML export remain usable without that build or loading MCP dependencies.

## Run the tests

You need Node.js 22. From the repo root:

```bash
npm ci
node vscode-extension/scripts/sync-viewer.js
node --test tests/*.test.cjs Models/tools/viewer/tests/*.test.js tests/extension.test.js
```

CI runs the same checks through `npm test` in `vscode-extension/`. To run them that way:

```bash
cd vscode-extension
npm ci
npm test
```

Optional real-Chrome layout checks are described under "Regression checks" in the
[developer guide](docs/development.md#regression-checks).

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

- Branch from `develop` and target `develop` for new features and routine fixes. Keep each
  PR to one change. See the development and release workflow below.
- Add or update a test when behavior changes.
- Make sure the tests above pass.
- If you change a user-visible behavior, update the README or `vscode-extension/CHANGELOG.md`.
- Never commit real or private models. Only synthetic data belongs in this repo.
- Write a short commit message that says what changed, for example
  `fix(viewer): keep the minimap in view`.

By contributing, you agree that your work is released under the [MIT License](LICENSE).

## Development and releases

`main` is the stable default branch. `develop` is the shared testing branch; its code is
public, but it is not deployed to the public website or published to the Marketplace.
Both branches require a pull request and the passing `test` check with up-to-date code.
Neither branch allows force pushes or deletion. Another person's approval is not required.

### Start a feature

Start with a clean working tree, then:

```bash
git fetch origin
git switch develop
git pull --ff-only origin develop
git switch -c feature/my-feature
```

If `develop` does not exist locally yet, use `git switch --track origin/develop` instead
of `git switch develop`. Open the feature PR against `develop`. CI tests and packages the
extension before merging; merging runs CI again and produces a downloadable test build.

To keep a stable checkout and a testing checkout side by side, run this from an existing
clone instead of switching its branch:

```bash
git fetch origin
git worktree add --detach ../semantic-model-viewer-testing origin/develop
```

That testing checkout is pinned to a commit. To update it, run `git fetch origin` and
`git switch --detach origin/develop` inside it with a clean working tree. It uses the same
local server port as the stable app; stop the other server or choose a different `--port`.

### Test a develop build

See the [pre-release overview](docs/pre-release.md) for what the preview adds compared with the stable release.

Open [Actions → CI](https://github.com/MrPerfectH/Semantic-Model-Viewer/actions/workflows/ci.yml),
select a successful **push** run for `develop`, and download its
`semantic-model-viewer-preview-<commit>` artifact. Downloads require a GitHub login and
expire after 14 days. Extract the ZIP, then in VS Code use **Extensions: Install from
VSIX…** to select the `.vsix` file.

The package is marked as a pre-release, but uses the same extension ID and source version
as the stable extension. Installing it normally replaces your installed extension. To keep
the stable installation separate, launch a test instance with its own data and extensions
directories (replace the `.vsix` path):

```bash
code --user-data-dir ../smv-preview-data --extensions-dir ../smv-preview-extensions --install-extension /path/to/preview.vsix --force
code --user-data-dir ../smv-preview-data --extensions-dir ../smv-preview-extensions .
```

A simpler option is a VS Code Profile, which keeps its own installed extensions. Keep
the stable extension in your Default profile and install the preview only in a `Beta`
profile:

1. Gear icon (bottom left) → **Profiles** → **Create Profile…**.
2. Name it `Beta`, choose **Create (Empty)**, then **Create**.
3. In the `Beta` profile, run **Extensions: Install from VSIX…** and select the
   `.vsix` file.
4. Switch between `Default` and `Beta` from the same **Profiles** menu. Install a newer
   preview the same way; it replaces the old one in `Beta` only.

The `Beta` profile starts empty, so install any other extensions you need there as well.

Use those same directory arguments whenever launching the test instance. If you installed
the preview normally, uninstall it and install the stable Marketplace version or release
`.vsix` to return to stable. No Marketplace preview channel or GitHub Release is created
by develop CI.

Repository testers can run the viewer from their `develop` checkout using the commands
above, or press F5 in VS Code to open the extension development host.

### Promote a tested release

1. Open a PR from `develop` to `main`, including any extension version and changelog updates.
2. Wait for the required `test` check and finish manual testing.
3. Use **Create a merge commit** to preserve the shared history, and keep `develop` after
   merging. Merging updates the public website automatically.
4. When ready to publish the extension, tag the tested commit in `main` as `vX.Y.Z`,
   matching `vscode-extension/package.json`, and push that tag. The release workflow checks
   main ancestry, tests, builds, and publishes the GitHub Release and (when configured)
   the Marketplace package. Do not create release tags on unmerged develop commits.
5. Merge `main` back into `develop` through a PR using **Create a merge commit**, especially
   after a stable hotfix. Keep both long-lived branches.

For an urgent stable fix, branch from `main` and target `main` directly, then bring the
fix back into `develop` through a PR. Manual website deployments and Marketplace retries
must be launched from `main`; Marketplace retries also verify the selected release commit.
