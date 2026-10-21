'use strict';

// Keep plugin artifacts and explicit CLI session records in the user's project.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function prepare(project = process.cwd()) {
  const projectRoot = fs.realpathSync(project);
  const artifactsDir = path.join(projectRoot, '.smv-artifacts');
  if (fs.existsSync(artifactsDir) && fs.lstatSync(artifactsDir).isSymbolicLink()) {
    throw new Error('The plugin artifact directory must not be a symlink');
  }
  fs.mkdirSync(artifactsDir, { recursive: true, mode: 0o700 });
  const ignore = path.join(artifactsDir, '.gitignore');
  try { fs.writeFileSync(ignore, '*\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (fs.lstatSync(ignore).isSymbolicLink() || fs.readFileSync(ignore, 'utf8').trim() !== '*') {
      throw new Error('The artifact directory has a custom ignore file; it was not changed');
    }
  }
  const sessions = fs.readdirSync(artifactsDir).filter(name => /^session-[a-f0-9-]+\.json$/.test(name)).sort().map(name => {
    const file = path.join(artifactsDir, name);
    if (fs.lstatSync(file).isSymbolicLink()) return { file, error: 'Symlink session record; inspect manually' };
    try {
      const state = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { file, source: state.source, startedAt: state.startedAt, watch: state.watch, status: 'Not checked; use smv session status' };
    } catch (error) { return { file, error: error.message }; }
  });
  const id = crypto.randomUUID();
  return {
    projectRoot, artifactsDir, sessions,
    newSessionFile: path.join(artifactsDir, `session-${id}.json`),
    newViewFile: path.join(artifactsDir, `view-${id}.json`),
    newExportFile: path.join(artifactsDir, `view-${id}.html`)
  };
}

if (require.main === module) {
  try { process.stdout.write(JSON.stringify(prepare()) + '\n'); }
  catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
module.exports = { prepare };
