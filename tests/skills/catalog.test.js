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

function tempCatalog(t, label) {
  const source = path.resolve(__dirname, '../..');
  const tempRoot = fs.realpathSync(os.tmpdir());
  const catalog = fs.mkdtempSync(path.join(tempRoot, `toolkit-${label}-`));
  t.after(() => {
    assert.equal(path.dirname(catalog), tempRoot);
    fs.rmSync(catalog, { recursive: true, force: true });
  });
  for (const name of ['skills', 'agents', 'ai_docs', '.codex-plugin', '.claude-plugin', '.agents/plugins', 'package.json', 'README.md']) {
    fs.cpSync(path.join(source, name), path.join(catalog, name), { recursive: true });
  }
  return catalog;
}

test('validation rejects project-specific names in skills and agents', t => {
  const catalog = tempCatalog(t, 'banned');
  assert.doesNotThrow(() => validate(catalog));
  const file = path.join(catalog, 'skills/unit-test/SKILL.md');
  fs.appendFileSync(file, '\nRead apps/pollicino_viewer/test/src/mocks.dart\n');
  assert.throws(() => validate(catalog), /project-specific name/);
});

test('validation rejects provider-named Ref parameters but accepts WidgetRef', t => {
  const catalog = tempCatalog(t, 'ref');
  const file = path.join(catalog, 'agents/riverpod-reviewer.md');
  fs.appendFileSync(file, '\nWidget build(BuildContext context, WidgetRef ref) {}\n');
  assert.doesNotThrow(() => validate(catalog));
  fs.appendFileSync(file, '\nUserRepository userRepository(UserRepositoryRef ref) {}\n');
  assert.throws(() => validate(catalog), /Riverpod v2 Ref parameter/);
});

test('validation fails when a shared copy drifts from its canonical file', t => {
  const catalog = tempCatalog(t, 'drift');
  assert.doesNotThrow(() => validate(catalog));
  // The source header and line endings are not drift.
  const headered = path.join(catalog, 'skills/audit-domain-layer/rules/patterns/feature-creation.md');
  fs.writeFileSync(headered, fs.readFileSync(headered, 'utf8').replace(/\n/g, '\r\n'));
  assert.doesNotThrow(() => validate(catalog));
  const copy = path.join(catalog, 'skills/sentry-init/references/codegen.md');
  fs.appendFileSync(copy, '\nA line that only the copy has.\n');
  assert.throws(() => validate(catalog), /shared copy drifted/);
});
