#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : entry.isFile() ? [full] : [];
  });
}

function validate(root = path.resolve(__dirname, '..')) {
  const json = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const pkg = json('package.json');
  const claude = json('.claude-plugin/plugin.json');
  const codex = json('.codex-plugin/plugin.json');
  const market = json('.agents/plugins/marketplace.json');
  assert.equal(codex.name, claude.name);
  assert.equal(codex.version, pkg.version);
  assert.equal(claude.version, pkg.version);
  assert.equal(json('.claude-plugin/marketplace.json').plugins[0].source.ref, `v${pkg.version}`);
  assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), new RegExp(`version-${pkg.version.replaceAll('.', '\\.')}\\-blue`));
  assert.equal(market.name, 'flutter-toolkit');
  assert.equal(json('.claude-plugin/marketplace.json').name, market.name, 'Claude and Codex marketplace names must match');
  assert.equal(claude.name, market.name, 'plugin and marketplace names must match');
  assert.equal(market.plugins[0].name, codex.name);
  assert.deepEqual(market.plugins[0].source, { source: 'local', path: '.' });
  const names = fs.readdirSync(path.join(root, 'skills')).filter(name =>
    fs.existsSync(path.join(root, 'skills', name, 'SKILL.md'))).sort();
  assert.deepEqual([...codex.skills].sort(), names.filter(n => n !== 'build-filter').map(n => `./skills/${n}`));
  for (const name of names) {
    const dir = path.join(root, 'skills', name);
    const entry = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
    const front = entry.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    assert(front, `${name}: missing frontmatter`);
    assert.match(front[1], new RegExp(`^name: ${name}$`, 'm'));
    assert.match(front[1], /^description: .+/m);
    assert(!/\.claude\/skills\/|AskUserQuestion|Task tool|gemini-consultant/.test(entry), `${name}: host-specific execution dependency`);
    assert.match(entry, /## Runtime and resources/);
    const metadata = fs.readFileSync(path.join(dir, 'agents', 'openai.yaml'), 'utf8');
    assert(metadata.includes(`$${name}`), `${name}: default prompt must invoke the skill`);
    const short = JSON.parse(metadata.match(/^  short_description: (.+)$/m)[1]);
    assert(short.length >= 25 && short.length <= 64, `${name}: invalid UI description length`);
    if (['build-filter', 'tune-setup'].includes(name)) assert.match(metadata, /allow_implicit_invocation: false/);
    for (const file of files(dir).filter(f => f.endsWith('.md'))) {
      const text = fs.readFileSync(file, 'utf8');
      // Backticked bundled resources can be relative to the skill or the containing document.
      for (const match of text.matchAll(/`((?:\.\.\/|rules\/|references\/|reference\/|scripts\/|patterns\/)[^`\n]*\.(?:md|js|sh|ps1))`/g)) {
        const resource = match[1];
        if (/[<>*\s]/.test(resource)) continue;
        assert(fs.existsSync(path.resolve(path.dirname(file), resource)) || fs.existsSync(path.resolve(dir, resource)),
          `${path.relative(root, file)}: missing bundled resource ${resource}`);
      }
      for (const match of text.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
        const link = match[1].split('#')[0];
        if (!link || /^(?:https?:|mailto:)|[<>*]/.test(link)) continue;
        if (/\.(?:md|js|sh|ps1)$/.test(link)) assert(fs.existsSync(path.resolve(path.dirname(file), link)),
          `${path.relative(root, file)}: broken Markdown link ${link}`);
      }
    }
  }
  const dependencies = { 'audit-feature': ['audit-domain-layer', 'audit-data-layer', 'audit-application-layer', 'audit-presentation-layer'],
    'tune-setup': ['retro'], 'generate-widget-tests': ['unit-test'] };
  for (const [name, required] of Object.entries(dependencies)) {
    const text = fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');
    for (const dependency of required) {
      assert(text.includes(dependency), `${name}: undeclared dependency ${dependency}`);
      assert(fs.existsSync(path.join(root, 'skills', dependency, 'SKILL.md')),
        `${name}: missing required skill ${dependency}; catalog coverage is incomplete`);
    }
    assert(/(?:missing|absent|manca)/i.test(text), `${name}: missing partial-install fallback`);
  }
  return { total: names.length, active: names.length - 1 };
}

module.exports = { validate };
if (require.main === module) {
  try { const result = validate(); console.log(`Validated ${result.total} skills (${result.active} active), resources, policies, versions and marketplaces.`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
