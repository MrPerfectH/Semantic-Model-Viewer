/* Run: node --test tests/mac-launcher.test.cjs
   Execute the real Mac launcher with browser/OS boundaries replaced by shell functions.
   No desktop, installed browser, local server, or user's profile is touched. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const launcher = path.join(__dirname, '../Models/tools/viewer/scripts/mac/launch.sh');
const skip = process.platform === 'win32' ? 'Mac launcher harness requires POSIX paths'
  : spawnSync('bash', ['--version'], { stdio: 'ignore' }).status !== 0 ? 'bash not installed' : false;
const harness = String.raw`
function [() {
  if [[ "$#" == 3 && "$1" == '-d' ]]; then
    case "$2" in
      '/Applications/Google Chrome.app') [[ "$SMV_TEST_BROWSER" == chrome ]]; return ;;
      '/Applications/Microsoft Edge.app') [[ "$SMV_TEST_BROWSER" == edge ]]; return ;;
    esac
  fi
  builtin [ "$@"
}
curl() { printf '%s\n' '{"ok":true}'; }
mkdir() { :; }
pgrep() { return "$SMV_TEST_PROFILE_STATUS"; }
osascript() { printf '%s\0' osascript "$@" >> "$SMV_TEST_CALLS"; }
open() { printf '%s\0' open "$@" >> "$SMV_TEST_CALLS"; }
source "$1"
`;

function launch(browser, profileRunning) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-mac-launcher-'));
  const callsFile = path.join(dir, 'calls');
  try {
    const result = spawnSync('bash', ['-c', harness, 'smv-launch-test', launcher], {
      encoding: 'utf8',
      env: { ...process.env, SMV_PORT: '18931', SMV_TEST_BROWSER: browser,
        SMV_TEST_PROFILE_STATUS: profileRunning ? '0' : '1', SMV_TEST_CALLS: callsFile },
      timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr || String(result.error || 'launcher failed'));
    return fs.readFileSync(callsFile, 'utf8').split('\0').slice(0, -1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

for (const [browser, app] of [['chrome', 'Google Chrome'], ['edge', 'Microsoft Edge']]) {
  test(`Mac launcher reopens ${app} when its profile process survives without a viewer window`,
    { skip }, () => {
      const calls = launch(browser, true);
      assert.equal(calls[0], 'open', 'must request an app window, not just activate the browser');
      assert.ok(calls.includes(app));
      assert.ok(calls.includes('--app=http://localhost:18931'));
      assert.ok(calls.includes('--new-window'));
      assert.ok(calls.includes(`--user-data-dir=${process.env.HOME}/Library/Application Support/Semantic Model Viewer/chrome-profile`),
        'reuse the dedicated profile so models/layouts remain available');
    });
}

test('Mac launcher cold start uses the same dedicated-profile window launch as reopening',
  { skip }, () => {
    assert.deepEqual(launch('chrome', false), launch('chrome', true));
  });

test('Mac launcher retains the default-browser fallback without Chrome or Edge',
  { skip }, () => {
    assert.deepEqual(launch('none', false), ['open', 'http://localhost:18931']);
  });
