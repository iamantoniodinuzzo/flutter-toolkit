#!/usr/bin/env node
'use strict';

// Real local CLI loading, without authentication, inference, or personal configuration.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { executable } = require('../skills/second-opinion/scripts/review.js');
const root = path.resolve(__dirname, '..');

function cleanup(temp, tempRoot) {
  assert.equal(path.dirname(path.resolve(temp)), tempRoot);
  if (process.platform !== 'win32') {
    fs.rmSync(temp, { recursive: true, force: true });
    return;
  }
  // PowerShell -Force handles Windows read-only cache entries that fs.rm cannot remove.
  const command = '$target = [IO.Path]::GetFullPath($env:TOOLKIT_SMOKE_TEMP); ' +
    '$root = [IO.Path]::GetFullPath($env:TOOLKIT_SMOKE_TEMP_ROOT).TrimEnd([IO.Path]::DirectorySeparatorChar); ' +
    'if ([IO.Path]::GetDirectoryName($target) -ne $root -or [IO.Path]::GetFileName($target) -notlike "flutter-plugin-smoke-*") { throw "Unexpected cleanup target" }; ' +
    'Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop';
  const result = spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, encoding: 'utf8', shell: false,
      env: { ...process.env, TOOLKIT_SMOKE_TEMP: temp, TOOLKIT_SMOKE_TEMP_ROOT: tempRoot } });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr);
}

function cli(launcher, args, env, cwd) {
  const result = spawnSync(launcher[0], [...launcher[1], ...args],
    { env, cwd, encoding: 'utf8', timeout: 30000, windowsHide: true, shell: false });
  if (result.error || result.status !== 0) throw new Error(`${args.join(' ')}: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout;
}

function loadedSkills(launcher, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(launcher[0], [...launcher[1], 'app-server'], { env, cwd, detached: process.platform !== 'win32',
      windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', stderr = '', done = false;
    const finish = (error, value) => {
      if (done) return; done = true; clearTimeout(timer);
      child.once('close', () => { if (error) reject(error); else resolve(value); });
      child.stdin.end();
      if (child.pid) {
        if (process.platform === 'win32') {
          const killed = spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, encoding: 'utf8' });
          if (killed.status !== 0 && killed.status !== 128) console.error(`Process cleanup: ${killed.error?.message || killed.stderr || killed.stdout}`);
        }
        else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
      }
    };
    const timer = setTimeout(() => finish(new Error(`Codex skills/list timed out: ${stderr}`)), 30000);
    const send = value => child.stdin.write(JSON.stringify(value) + '\n');
    child.on('error', error => finish(error));
    child.on('close', code => { if (!done) finish(new Error(`Codex app-server exited ${code}: ${stderr}`)); });
    child.stdin.on('error', error => { if (!done) finish(error); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-2000); });
    child.stdout.on('data', chunk => {
      buffer += chunk;
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (event.error) { finish(new Error(JSON.stringify(event.error))); return; }
        if (event.id === 1) {
          send({ method: 'initialized', params: {} });
          send({ id: 2, method: 'skills/list', params: { cwds: [cwd], forceReload: true } });
        } else if (event.id === 2) finish(null, event.result);
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'flutter-toolkit-smoke', version: '1.0.0' },
      capabilities: { experimentalApi: true } } });
  });
}

async function main() {
  const codex = executable('codex');
  const claude = executable('claude');
  assert(codex && claude, 'Install Claude and Codex CLIs to run the local smoke check');
  const tempRoot = fs.realpathSync(os.tmpdir());
  const temp = fs.mkdtempSync(path.join(tempRoot, 'flutter-plugin-smoke-'));
  let primaryError;
  try {
    const cwd = path.join(temp, 'project'); fs.mkdirSync(cwd);
    const source = path.join(temp, 'toolkit'); fs.mkdirSync(source);
    // A local marketplace copies its whole source. Stage only distributable content,
    // excluding user state, untracked checkouts, .git, and the historical graph cache.
    for (const name of ['skills', 'agents', 'ai_docs', '.claude-plugin', '.codex-plugin', '.agents/plugins',
      'AGENTS.md', 'CLAUDE.md', 'README.md', 'LICENSE', 'package.json']) {
      fs.cpSync(path.join(root, name), path.join(source, name), { recursive: true });
    }
    const env = { ...process.env, HOME: temp, USERPROFILE: temp,
      CODEX_HOME: path.join(temp, 'codex'), CLAUDE_CONFIG_DIR: path.join(temp, 'claude') };
    fs.mkdirSync(env.CODEX_HOME); fs.mkdirSync(env.CLAUDE_CONFIG_DIR);
    delete env.CODEX_THREAD_ID; delete env.CLAUDE_CODE_SESSION_ID;
    const report = cli(claude, ['plugin', 'validate', source, '--json'], env, cwd);
    const validation = JSON.parse(report);
    assert(validation.valid !== false, report);
    console.log('Claude: plugin and skill validation passed');
    cli(codex, ['plugin', 'marketplace', 'add', source, '--json'], env, cwd);
    console.log('Codex: local marketplace registered');
    cli(codex, ['plugin', 'add', 'flutter-toolkit@flutter-toolkit', '--json'], env, cwd);
    console.log('Codex: plugin installed');
    const inventory = JSON.parse(cli(codex, ['plugin', 'list', '--marketplace', 'flutter-toolkit', '--json'], env, cwd));
    assert(JSON.stringify(inventory).includes('flutter-toolkit'), 'Codex marketplace did not load the plugin');
    const result = await loadedSkills(codex, env, cwd);
    const groups = result.data || [];
    const skills = groups.flatMap(group => group.skills || []);
    const errors = groups.flatMap(group => group.errors || []);
    assert.deepEqual(errors, [], JSON.stringify(errors));
    const expected = JSON.parse(fs.readFileSync(path.join(root, '.codex-plugin/plugin.json'))).skills.map(p => path.basename(p));
    for (const name of expected) assert(skills.some(skill => skill.name === `flutter-toolkit:${name}`), `Codex did not discover ${name}`);
    assert(!skills.some(skill => skill.name === 'flutter-toolkit:build-filter'), 'Archived skill was exposed by the Codex plugin');
    const tune = skills.find(skill => skill.name === 'flutter-toolkit:tune-setup');
    // skills/list exposes UI metadata but not invocation policy. Verify the installed policy file.
    const installedPolicy = fs.readFileSync(path.join(path.dirname(tune.path), 'agents', 'openai.yaml'), 'utf8');
    assert.match(installedPolicy, /allow_implicit_invocation: false/, 'Codex install lost explicit-only policy');
    console.log(`Codex: installed and loaded ${expected.length} active skills; explicit-only policy packaged`);
  } catch (error) { primaryError = error; throw error; }
  finally {
    try { cleanup(temp, tempRoot); }
    catch (error) {
      console.error(`Temporary cleanup failed at ${temp}: ${error.message}`);
      if (!primaryError) throw error;
    }
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
