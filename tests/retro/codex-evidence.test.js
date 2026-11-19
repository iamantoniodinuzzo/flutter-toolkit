'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const SCRIPT = path.resolve(__dirname, '../../skills/retro/scripts/session-evidence.js');

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-evidence-')));
  t.after(() => { assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true }); });
  const cwd = path.join(root, 'project');
  const home = path.join(root, 'home');
  fs.mkdirSync(cwd); fs.mkdirSync(home);
  const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, '.codex') };
  delete env.CLAUDE_CODE_SESSION_ID; delete env.CODEX_THREAD_ID;
  const timestamp = new Date().toISOString();
  const write = (id, events = [], age = 0, target = cwd) => {
    const dir = path.join(env.CODEX_HOME, 'sessions', '2026', '10', '09');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `rollout-${id}.jsonl`);
    const time = new Date(Date.now() - age).toISOString();
    fs.writeFileSync(file, [{ type: 'session_meta', timestamp: time, payload: { id, cwd: target } },
      ...events.map(payload => ({ type: 'response_item', timestamp: time, payload }))].map(e => JSON.stringify(e)).join('\n'));
    return file;
  };
  const run = (args = [], extra = {}) => {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env: { ...env, ...extra }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout;
  };
  return { root, cwd, env, write, run, timestamp };
}

// Legacy shape: `function_call exec_command` records. Real rollouts do not contain them (see the
// real-shape tests at the end of this file); the parser still accepts them.
test('Codex pairs errors with calls, repeated shell commands and successful patch edits', t => {
  const f = fixture(t);
  const events = [];
  for (let i = 0; i < 3; i++) {
    events.push({ type: 'function_call', name: 'exec_command', call_id: `shell${i}`, arguments: JSON.stringify({ cmd: 'dart analyze' }) },
      { type: 'function_call_output', call_id: `shell${i}`, output: 'Process exited with code 1\nError: compile failed' },
      { type: 'custom_tool_call', name: 'apply_patch', call_id: `edit${i}`, input: '*** Begin Patch\n*** Update File: lib/auth.dart\n@@\n-x\n+y\n*** End Patch' },
      { type: 'custom_tool_call_output', call_id: `edit${i}`, output: 'Success. Updated files.' });
  }
  const file = f.write('current', events);
  const out = f.run(['--transcript', file, '--agent', 'auto', '--config-audit']);
  assert.match(out, /tool errors: 3/); assert.match(out, /exec_command x3.*dart analyze.*Error: compile failed/);
  assert.match(out, /x3 dart analyze/); assert.match(out, /x3 lib\/auth.dart/);
  assert.match(out, /unavailable: Claude Skill/); assert.doesNotMatch(out, /hook_cancelled: 0/);
});

test('Codex thread id selects exactly even when cwd differs; unknown id does not guess', t => {
  const f = fixture(t); f.write('wanted', [], 0, path.join(f.root, 'other'));
  f.write('cwd-session');
  assert.match(f.run([], { CODEX_THREAD_ID: 'wanted' }), /session: wanted/);
  assert.match(f.run(['--agent', 'codex', '--session', 'missing']), /no transcript found for Codex session id missing/);
});

test('Codex refuses ambiguous fresh sessions and warns on stale ones', t => {
  const f = fixture(t); f.write('a'); f.write('b');
  assert.match(f.run(['--agent', 'codex']), /WARNING: multiple fresh/);
  const old = f.write('stale', [], 9 * 3600000, path.join(f.root, 'old-cwd'));
  const out = f.run(['--agent', 'codex'], { CODEX_HOME: path.join(f.root, 'missing') });
  assert.match(out, /no Codex transcript/);
  // An explicit path remains selectable even outside the cwd.
  const stale = f.run(['--agent', 'codex', '--transcript', old]);
  assert.match(stale, /session: stale/); assert.match(stale, /WARNING: newest transcript/);
});

test('Codex malformed and opaque orchestration records are explicitly partial', t => {
  const f = fixture(t);
  const file = f.write('partial', [{ type: 'function_call', call_id: 'opaque', name: 'functions.exec', arguments: '{}' }]);
  fs.appendFileSync(file, '\n{broken\nnull\n[]');
  assert.match(f.run(['--agent', 'codex', '--transcript', file]), /WARNING: partial Codex evidence/);
  const bad = path.join(f.root, 'bad.jsonl'); fs.writeFileSync(bad, '{}\n{bad');
  assert.match(f.run(['--agent', 'codex', '--transcript', bad]), /unrecognized Codex transcript/);
});

test('explicit exit status prevents false failures from error text in successful output', t => {
  const f = fixture(t);
  const file = f.write('success', [
    { type: 'function_call', name: 'exec_command', call_id: 'ok', arguments: '{"cmd":"test"}' },
    { type: 'function_call_output', call_id: 'ok', output: 'Process exit code: 0\nError: sample expected by test' },
    { type: 'function_call', name: 'exec_command', call_id: 'bad', arguments: '{"cmd":"fail"}' },
    { type: 'function_call_output', call_id: 'bad', output: 'Process exit code: 2\ninvalid input' }
  ]);
  assert.match(f.run(['--transcript', file]), /tool errors: 1/);
});

test('auto agent detection refuses overlapping Claude and Codex candidates', t => {
  const f = fixture(t); f.write('codex-session');
  const slug = f.cwd.replace(/[^a-zA-Z0-9]/g, '-');
  const claude = path.join(f.env.USERPROFILE, '.claude', 'projects', slug);
  fs.mkdirSync(claude, { recursive: true }); fs.writeFileSync(path.join(claude, 'session.jsonl'), '{}');
  assert.match(f.run(), /WARNING: Claude and Codex transcripts exist/);
  assert.match(f.run(['--agent', 'codex']), /session: codex-session/);
});

test('Codex declares the standardizzazione block not evaluated, never zero', t => {
  const f = fixture(t); const file = f.write('std');
  const out = f.run(['--agent', 'codex', '--transcript', file]);
  assert.match(out, /standardizzazione:\n  non valutato su Codex/);
  assert.doesNotMatch(out, /repeated user instructions: 0/);
});

test('large Codex metadata can be discovered without parsing entire rollouts', t => {
  const f = fixture(t); const file = f.write('large');
  const record = JSON.parse(fs.readFileSync(file, 'utf8')); record.payload.base_instructions = 'x'.repeat(100000);
  fs.writeFileSync(file, JSON.stringify(record));
  assert.match(f.run(['--agent', 'codex', '--session', 'large']), /session: large/);
});

// --- real rollout shape (#88) ---------------------------------------------------------------
// tests/retro/fixtures/codex-real-shape.jsonl is reduced from real rollouts (CLI 0.155 - 0.167):
// shell runs are `exec` custom tool calls plus one CommandExecution event per command run, edits
// are FileChange events (and the same patch as a JS string with literal \n inside the exec body).
const REAL = path.join(__dirname, 'fixtures', 'codex-real-shape.jsonl');

test('Codex real shape: commands, exit status and edits are read from CommandExecution / FileChange (#88)', t => {
  const f = fixture(t);
  const out = f.run(['--agent', 'codex', '--transcript', REAL]);
  assert.match(out, /tool errors: 3/);
  assert.match(out, /exec_command x3 `dart analyze` → Error: undefined name x/);
  assert.match(out, /x3 dart analyze/);
  // each patch is logged as a FileChange and inside the exec body: counted once, rename included
  for (const file of ['lib/auth.dart', 'lib/new.dart', 'lib/old.dart', 'lib/renamed.dart']) {
    assert.match(out, new RegExp(`x3 ${file.replace('.', '\.')}\n`), file);
  }
  assert.doesNotMatch(out, /partial Codex evidence/);
  assert.doesNotMatch(out, /cli_version .* outside the observed range/);
});

// A rollout line list written straight to disk: the `write` helper wraps everything as response_item.
function rollout(f, id, version, records) {
  const dir = path.join(f.env.CODEX_HOME, 'sessions', '2026', '10', '10');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rollout-${id}.jsonl`);
  const ts = new Date().toISOString();
  const meta = { type: 'session_meta', timestamp: ts, payload: { id, cwd: f.cwd, cli_version: version } };
  fs.writeFileSync(file, [meta, ...records.map(r => ({ timestamp: ts, ...r }))].map(r => JSON.stringify(r)).join('\n') + '\n');
  return file;
}
const execCall = (id, input) => ({ type: 'response_item', payload: { type: 'custom_tool_call', call_id: id, name: 'exec', input } });
const execOut = (id, text) => ({ type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: id, output: [{ type: 'input_text', text }] } });
const commandRan = (id, exit) => ({ type: 'event_msg', payload: { type: 'item_completed', item: {
  type: 'CommandExecution', id, command: ['bash', '-lc', 'true'], status: exit ? 'failed' : 'completed', exit_code: exit, aggregated_output: '' } } });
const patchBody = '*** Begin Patch\n*** Update File: lib/a.dart\n*** Move to: lib/b.dart\n@@\n-x\n+y\n*** End Patch';

test('Codex without FileChange events falls back to the patch in the exec body, with literal \n; a failed script adds none (#88)', t => {
  const f = fixture(t);
  const records = [commandRan('c1', 0)];
  for (let i = 0; i < 3; i++) {
    records.push(execCall(`p${i}`, `const patch = "${patchBody}";\ntext(await tools.apply_patch(patch));`), execOut(`p${i}`, 'Script completed'));
  }
  records.push(execCall('bad', `const patch = "${patchBody}";`), execOut('bad', 'Script failed\nSyntaxError'));
  const out = f.run(['--agent', 'codex', '--transcript', rollout(f, 'fallback', '0.165.0', records)]);
  assert.match(out, /x3 lib\/a\.dart\n/);
  assert.match(out, /x3 lib\/b\.dart\n/);
  assert.doesNotMatch(out, /partial Codex evidence/);
});

test('Codex exec calls with no CommandExecution events stay unsupported, so the partial warning is truthful (#88)', t => {
  const f = fixture(t);
  const file = rollout(f, 'old-shape', '0.165.0', [execCall('e1', 'text(await tools.exec_command({cmd:"ls"}));'), execOut('e1', 'Script completed')]);
  assert.match(f.run(['--agent', 'codex', '--transcript', file]), /WARNING: partial Codex evidence \(0 malformed records, 1 unsupported/);
});

test('Codex cli_version 0.153.4 - 0.167.0 is inside the observed range; 0.150.0 and 0.168.0 are not (#88)', t => {
  const f = fixture(t);
  for (const [version, outside] of [['0.153.4', false], ['0.166.0', false], ['0.167.0', false], ['0.150.0', true], ['0.168.0', true]]) {
    const out = f.run(['--agent', 'codex', '--transcript', rollout(f, `v-${version}`, version, [])]);
    assert.equal(/outside the observed range/.test(out), outside, version);
  }
});
