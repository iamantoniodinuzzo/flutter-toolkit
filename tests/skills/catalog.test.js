'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validate } = require('../../scripts/validate-skills.js');
test('catalog distributes active skills with valid resources and invocation policies', () => {
  assert.deepEqual(validate(), { total: 23, active: 22 });
});

test('partial catalogs identify missing shared dependencies', t => {
  const source = path.resolve(__dirname, '../..');
  const tempRoot = fs.realpathSync(os.tmpdir());
  const temp = fs.mkdtempSync(path.join(tempRoot, 'toolkit-partial-'));
  t.after(() => {
    assert.equal(path.dirname(temp), tempRoot);
    fs.rmSync(temp, { recursive: true, force: true });
  });
  for (const dependency of ['audit-domain-layer', 'retro', 'unit-test']) {
    const catalog = path.join(temp, dependency);
    for (const name of ['skills', '.codex-plugin', '.claude-plugin', '.agents/plugins', 'package.json', 'README.md']) {
      fs.cpSync(path.join(source, name), path.join(catalog, name), { recursive: true });
    }
    const missing = path.join(catalog, 'skills', dependency);
    assert.equal(path.dirname(missing), path.join(catalog, 'skills'));
    fs.rmSync(missing, { recursive: true, force: true });
    // Keep the manifest consistent so validation reaches the dependent skill's resources.
    const manifestPath = path.join(catalog, '.codex-plugin/plugin.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.skills = manifest.skills.filter(skill => skill !== `./skills/${dependency}`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => validate(catalog), error =>
      /missing (?:bundled resource|required skill)/.test(error.message) && error.message.includes(dependency));
  }
});
