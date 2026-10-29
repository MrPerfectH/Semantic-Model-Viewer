'use strict';

/* Features still under test ship only in pre-release builds. CI marks published
   pre-releases with "smvPreRelease" in package.json (scripts/preview-version.cjs);
   development and test hosts also see them. Set a feature to true once it has
   passed manual testing to ship it in stable. */
const STABLE = {
  // Power BI Desktop connection and External Tools ribbon button (#162).
  powerBIDesktop: false
};

function featureEnabled(name, manifest, extensionMode) {
  if (!Object.prototype.hasOwnProperty.call(STABLE, name)) throw new Error('Unknown feature: ' + name);
  // vscode.ExtensionMode: Production 1, Development 2, Test 3.
  return STABLE[name] === true || Boolean(manifest && manifest.smvPreRelease === true) || extensionMode === 2 || extensionMode === 3;
}

module.exports = { STABLE, featureEnabled };
