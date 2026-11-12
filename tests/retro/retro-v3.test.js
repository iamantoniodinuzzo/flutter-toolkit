// Tests for retro v3: the `diff:` and `ambiente:` blocks of skills/retro/scripts/session-evidence.js
// (tickets "Diff e handoff con sessioni parallele", "Soglie dei segnali ambiente", "Dedup tra blocco
// Ambiente e Q1/Q5", "Il valore automode-unavailable", "Come verificare che la skill retro si
// comporti come descritta").
//
// Record shapes mirror real Claude Code / Codex records (tool_use / tool_result blocks, the
// top-level `toolUseResult` and `toolDenialKind` fields, `attachment` events, `api-request-blob`
// replays). Real repos are created in a temp dir so git is exercised, not mocked.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '..', '..', 'skills', 'retro', 'scripts', 'session-evidence.js');
const MIN = 60000;
const DAY = 24 * 60 * MIN;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const slugOf = (p) => p.replace(/[^a-zA-Z0-9]/g, '-');

function makeEnv() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'retro-v3-')));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'repo');
  fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  return { root, home, cwd, slug: slugOf(cwd) };
}

function git(env, args, date) {
  const e = { ...process.env, HOME: env.home, USERPROFILE: env.home };
  if (date) {
    e.GIT_AUTHOR_DATE = date;
    e.GIT_COMMITTER_DATE = date;
  }
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t.t', '-c', 'commit.gpgsign=false', ...args], {
    cwd: env.cwd, env: e, encoding: 'utf8',
  });
  assert.strictEqual(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function initRepo(env, date = ago(10 * DAY)) {
  git(env, ['init', '-q', '-b', 'develop']);
  fs.writeFileSync(path.join(env.cwd, 'a.txt'), 'base\n');
  git(env, ['add', '.']);
  git(env, ['commit', '-q', '-m', 'base'], date);
  return git(env, ['rev-parse', 'HEAD']);
}

function commitFile(env, rel, content, date) {
  fs.writeFileSync(path.join(env.cwd, rel), content);
  git(env, ['add', rel]);
  git(env, ['commit', '-q', '-m', `add ${rel}`], date);
}

// --- record builders ---------------------------------------------------------------------------

let uid = 0;
const rec = (env, id, type, ts, extra) => ({
  type, sessionId: id, timestamp: ts, uuid: `${id}-${uid++}`, cwd: env.cwd, gitBranch: env.branch, ...extra,
});
const use = (env, id, ts, tuid, name, input, extra) =>
  rec(env, id, 'assistant', ts, { message: { role: 'assistant', content: [{ type: 'tool_use', id: tuid, name, input }] }, ...extra });
const result = (env, id, ts, tuid, content, isError, extra) =>
  rec(env, id, 'user', ts, {
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tuid, content, is_error: !!isError }] }, ...extra,
  });
const attachment = (env, id, ts, att) => rec(env, id, 'attachment', ts, { attachment: att });

function write(env, id, events, subdir = env.slug) {
  const dir = path.join(env.home, '.claude', 'projects', subdir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(file, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return file;
}

function run(env, args = [], extraEnv = {}) {
  const childEnv = { ...process.env, HOME: env.home, USERPROFILE: env.home, ...extraEnv };
  childEnv.CODEX_HOME = path.join(env.home, '.codex');
  delete childEnv.CODEX_THREAD_ID;
  delete childEnv.CLAUDE_CODE_SESSION_ID;
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: env.cwd, env: childEnv, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout;
}

const block = (out, head) => {
  const lines = out.split('\n');
  const i = lines.findIndex((l) => l.startsWith(head));
  if (i < 0) return '';
  const body = [lines[i]];
  for (let j = i + 1; j < lines.length && lines[j].startsWith('  '); j++) body.push(lines[j]);
  return body.join('\n');
};

// A session of `lines` events, 30 minutes old to 1 minute old.
const T0 = 30 * MIN;
const T1 = 1 * MIN;

// =================================================================== diff: ====

test('diff: working-tree change edited by the session is ATTRIBUITO, anchored before the session', () => {
  const env = makeEnv();
  const base = initRepo(env);
  git(env, ['checkout', '-q', '-b', 'feature/x']);
  fs.writeFileSync(path.join(env.cwd, 'a.txt'), 'changed\n');
  env.branch = 'feature/x';
  const file = path.join(env.cwd, 'a.txt');
  write(env, 's1', [
    use(env, 's1', ago(T0), 'e1', 'Edit', { file_path: file }),
    result(env, 's1', ago(T0 - 1000), 'e1', 'ok'),
    result(env, 's1', ago(T1), 'e1x', 'late'),
  ]);
  const out = run(env, ['--session', 's1']);
  const diff = block(out, 'diff:');
  assert.match(diff, /feature\/x \[ATTRIBUITO\]/);
  assert.match(diff, new RegExp(`${base.slice(0, 7)} → working tree: 1 file`));
  assert.match(diff, /1\/1 path anche negli edit/);
  assert.match(diff, /a\.txt \+1 -1/);
});

test('diff: edits covering a small share of the git diff are PARZIALE', () => {
  const env = makeEnv();
  initRepo(env);
  git(env, ['checkout', '-q', '-b', 'feature/p']);
  for (const f of ['b.txt', 'c.txt', 'd.txt']) commitFile(env, f, 'x\n', ago(20 * DAY));
  git(env, ['commit', '-q', '--allow-empty', '-m', 'noop'], ago(9 * DAY));
  for (const f of ['b.txt', 'c.txt', 'd.txt', 'a.txt']) fs.writeFileSync(path.join(env.cwd, f), 'new\n');
  env.branch = 'feature/p';
  write(env, 's2', [
    use(env, 's2', ago(T0), 'e1', 'Edit', { file_path: path.join(env.cwd, 'a.txt') }),
    result(env, 's2', ago(T0 - 1000), 'e1', 'ok'),
  ]);
  assert.match(block(run(env, ['--session', 's2']), 'diff:'), /feature\/p \[PARZIALE\].*1\/4 path/);
});

test('diff: git changes the transcript never edited are NON ATTRIBUIBILE, with a global verdict', () => {
  const env = makeEnv();
  initRepo(env);
  git(env, ['checkout', '-q', '-b', 'feature/o']);
  fs.writeFileSync(path.join(env.cwd, 'a.txt'), 'someone else\n');
  env.branch = 'feature/o';
  write(env, 's3', [
    use(env, 's3', ago(T0), 'e1', 'Edit', { file_path: path.join(env.cwd, 'never-in-diff.txt') }),
    result(env, 's3', ago(T0 - 1000), 'e1', 'ok'),
  ]);
  const diff = block(run(env, ['--session', 's3']), 'diff:');
  assert.match(diff, /feature\/o \[NON ATTRIBUIBILE\]/);
  assert.match(diff, /verdetto: NON ATTRIBUIBILE/);
  assert.doesNotMatch(diff, /NON RICAVABILE/);
});

test('diff: not a git repo is NON RICAVABILE with only the transcript paths, never "no change"', () => {
  const env = makeEnv(); // no git init
  write(env, 's4', [
    use(env, 's4', ago(T0), 'e1', 'Edit', { file_path: path.join(env.cwd, 'lib', 'a.dart') }),
    result(env, 's4', ago(T0 - 1000), 'e1', 'ok'),
  ]);
  const diff = block(run(env, ['--session', 's4']), 'diff:');
  assert.match(diff, /diff: NON RICAVABILE \(non è un repo git/);
  assert.match(diff, /path dal transcript \(parziali.*lib\/a\.dart/);
  assert.doesNotMatch(diff, /NESSUNA MODIFICA|nessuna modifica/i);
});

test('diff: one diff per branch; a HEAD that is not a session branch gets a neutral line', () => {
  const env = makeEnv();
  initRepo(env);
  git(env, ['checkout', '-q', '-b', 'feature/a']);
  commitFile(env, 'fa.txt', 'a\n', ago(20 * MIN));
  git(env, ['checkout', '-q', 'develop']);
  git(env, ['checkout', '-q', '-b', 'feature/b']);
  commitFile(env, 'fb.txt', 'b\n', ago(10 * MIN));
  git(env, ['checkout', '-q', 'develop']);
  const events = [];
  for (const [br, f, t] of [['feature/a', 'fa.txt', 25], ['feature/b', 'fb.txt', 15]]) {
    env.branch = br;
    events.push(use(env, 's5', ago(t * MIN), `e-${br}`, 'Write', { file_path: path.join(env.cwd, f) }));
    events.push(result(env, 's5', ago(t * MIN - 1000), `e-${br}`, 'ok'));
  }
  write(env, 's5', events);
  const diff = block(run(env, ['--session', 's5']), 'diff:');
  assert.match(diff, /diff: 2 branch/);
  assert.match(diff, /feature\/a \[ATTRIBUITO\].*1 commit della sessione/);
  assert.match(diff, /feature\/b \[ATTRIBUITO\].*1 commit della sessione/);
  assert.match(diff, /HEAD attuale: develop, non un branch di questa sessione/);
});

test('diff: block stays within its 12-line cap and the denials line is always last', () => {
  const env = makeEnv();
  initRepo(env);
  const events = [];
  for (let i = 0; i < 10; i++) {
    git(env, ['checkout', '-q', '-b', `feature/n${i}`, 'develop']);
    commitFile(env, `n${i}.txt`, 'x\n', ago(20 * MIN));
    env.branch = `feature/n${i}`;
    events.push(use(env, 's6', ago(25 * MIN), `e${i}`, 'Write', { file_path: path.join(env.cwd, `n${i}.txt`) }));
    events.push(result(env, 's6', ago(25 * MIN - 1000), `e${i}`, 'ok'));
  }
  git(env, ['checkout', '-q', 'develop']);
  write(env, 's6', events);
  const lines = block(run(env, ['--session', 's6']), 'diff:').split('\n');
  assert.ok(lines.length <= 12, `diff block has ${lines.length} lines`);
  assert.match(lines[lines.length - 1], /^ {2}rifiuti: /);
  assert.ok(lines.some((l) => /righe omesse/.test(l)));
});

test('diff: --session on an old session anchors at its start and stops at its end, not at HEAD now', () => {
  const env = makeEnv();
  const base = initRepo(env, ago(10 * DAY));
  git(env, ['checkout', '-q', '-b', 'feature/old']);
  commitFile(env, 'during.txt', 'x\n', ago(5 * DAY - 5 * MIN));
  commitFile(env, 'after.txt', 'x\n', ago(1 * DAY));
  env.branch = 'feature/old';
  write(env, 's7', [
    use(env, 's7', ago(5 * DAY), 'e1', 'Write', { file_path: path.join(env.cwd, 'during.txt') }),
    result(env, 's7', ago(5 * DAY - MIN), 'e1', 'ok'),
    result(env, 's7', ago(5 * DAY - 10 * MIN), 'x', 'end'),
  ]);
  const diff = block(run(env, ['--session', 's7']), 'diff:');
  assert.match(diff, new RegExp(`feature/old \\[ATTRIBUITO\\] ${base.slice(0, 7)} → tip: 1 file`));
  assert.match(diff, /during\.txt/);
  assert.doesNotMatch(diff, /after\.txt/);
});

test('diff: subagent edits (read from <session>/subagents) count toward attribution; worktree branch is a candidate', () => {
  const env = makeEnv();
  initRepo(env);
  git(env, ['branch', 'worktree-agent-1']);
  git(env, ['checkout', '-q', 'worktree-agent-1']);
  commitFile(env, 'sub.txt', 'x\n', ago(20 * MIN));
  git(env, ['checkout', '-q', 'develop']);
  env.branch = 'develop';
  write(env, 's8', [use(env, 's8', ago(T0), 'm1', 'Bash', { command: 'echo hi' }), result(env, 's8', ago(T0 - 1000), 'm1', 'hi')]);
  const sub = path.join(env.home, '.claude', 'projects', env.slug, 's8', 'subagents');
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(sub, 'agent-1.jsonl'), [
    use(env, 's8', ago(25 * MIN), 'u1', 'Write', { file_path: path.join(env.cwd, 'sub.txt') }),
    result(env, 's8', ago(25 * MIN - 1000), 'u1', 'ok'),
    result(env, 's8', ago(24 * MIN), 'u2', 'denied', true, { toolDenialKind: 'permission-rule' }),
  ].map((e) => JSON.stringify(e)).join('\n'));
  fs.writeFileSync(path.join(sub, 'agent-1.meta.json'), JSON.stringify({ worktreeBranch: 'worktree-agent-1', worktreePath: path.join(env.cwd, '.claude', 'worktrees', 'agent-1') }));
  const diff = block(run(env, ['--session', 's8']), 'diff:');
  assert.match(diff, /worktree-agent-1 \[ATTRIBUITO\]/);
  assert.match(diff, /rifiuti: .*permission-rule=1/);
});

test('diff: denial counts include unknown kinds such as automode-unavailable, never dropped', () => {
  const env = makeEnv();
  write(env, 's9', [
    use(env, 's9', ago(T0), 'a', 'Edit', { file_path: path.join(env.cwd, 'x.txt') }),
    result(env, 's9', ago(T0 - 1000), 'a', 'blocked', true, { toolDenialKind: 'automode-unavailable' }),
    result(env, 's9', ago(T0 - 2000), 'b', 'blocked', true, { toolDenialKind: 'automode-unavailable' }),
    result(env, 's9', ago(T0 - 3000), 'c', 'new', true, { toolDenialKind: 'brand-new-kind' }),
  ]);
  const out = run(env, ['--session', 's9']);
  assert.match(out, /rifiuti: user-rejected=0 permission-rule=0 automode-blocked=0 automode-unavailable=2 brand-new-kind=1/);
  const audit = run(env, ['--session', 's9', '--config-audit']);
  assert.match(audit, /toolDenialKind: user-rejected=0 permission-rule=0 automode-blocked=0 automode-unavailable=2 brand-new-kind=1/);
});

test('--config-audit emits neither diff: nor ambiente: (tune-setup output unchanged)', () => {
  const env = makeEnv();
  write(env, 's10', [use(env, 's10', ago(T0), 'a', 'Bash', { command: 'ls' }), result(env, 's10', ago(T0 - 1000), 'a', 'ok')]);
  const audit = run(env, ['--session', 's10', '--config-audit']);
  assert.doesNotMatch(audit, /^diff:|^ambiente:/m);
  assert.match(audit, /--- config audit/);
});

// ============================================================ counting by id ====

test('a tool_use replayed by api-request-blob counts once; failed Edits are not edits', () => {
  const env = makeEnv();
  const events = [];
  const u = use(env, 's11', ago(T0), 'dup', 'Bash', { command: 'ls -la' });
  const r = result(env, 's11', ago(T0 - 1000), 'dup', 'ok');
  events.push(u, r);
  for (let i = 0; i < 2; i++) events.push({ type: 'api-request-blob', sessionId: 's11', hash: `h${i}`, message: u.message }, { type: 'api-request-blob', sessionId: 's11', hash: `g${i}`, message: r.message });
  for (let i = 0; i < 3; i++) {
    events.push(use(env, 's11', ago(T0 - 5000 - i), `ed${i}`, 'Edit', { file_path: path.join(env.cwd, 'f.txt') }));
    events.push(result(env, 's11', ago(T0 - 6000 - i), `ed${i}`, 'String to replace not found', true));
  }
  write(env, 's11', events);
  const out = run(env, ['--session', 's11']);
  assert.match(out, /repeated shell commands: 0/);
  assert.match(out, /files edited >2x: 0/);
});

test('format canary: tool_use records with no tool_result at all raise WARNING evidenza parziale', () => {
  const env = makeEnv();
  write(env, 's12', [use(env, 's12', ago(T0), 'a', 'Bash', { command: 'ls' }), use(env, 's12', ago(T0 - 1000), 'b', 'Bash', { command: 'pwd' })]);
  assert.match(run(env, ['--session', 's12']), /WARNING: evidenza parziale \(formato non riconosciuto\)/);
});

// ================================================================ ambiente: ====

const shell = (env, id, n, command, out, isError, ts = ago(T0 - n * 1000)) => [
  use(env, id, ts, `sh${n}`, 'Bash', { command }),
  result(env, id, ts, `sh${n}`, out, isError),
];
const edit = (env, id, n, file, ts = ago(T0 - n * 1000)) => [
  use(env, id, ts, `ed${n}`, 'Edit', { file_path: file }),
  result(env, id, ts, `ed${n}`, 'ok'),
];
const src = (env, name = 'lib/a.dart') => path.join(env.cwd, name);

test('ambiente: a session with nothing to report says "nessun segnale" on one line', () => {
  const env = makeEnv();
  write(env, 'a1', shell(env, 'a1', 1, 'ls', 'ok', false));
  const out = run(env, ['--session', 'a1']);
  assert.match(out, /^ambiente: nessun segnale$/m);
});

test('ambiente/tool economy: fires above TOOL_RESULT_CHARS (20000), not at it; rereads respect an Edit in between', () => {
  const env = makeEnv();
  const readUse = (n, file) => use(env, 'a2', ago(T0 - n * 1000), `r${n}`, 'Read', { file_path: file });
  const readRes = (n, len) => result(env, 'a2', ago(T0 - n * 1000), `r${n}`, 'x'.repeat(len));
  write(env, 'a2', [readUse(1, src(env, 'a.txt')), readRes(1, 20000)]);
  assert.match(run(env, ['--session', 'a2']), /^ambiente: nessun segnale$/m);

  write(env, 'a2', [readUse(1, src(env, 'a.txt')), readRes(1, 20001)]);
  assert.match(run(env, ['--session', 'a2']), /tool economy \[costoso\]: 1 risultati >20000 car\./);

  // reread without an Edit in between fires; with a successful Edit between it does not
  write(env, 'a2', [readUse(1, src(env, 'b.txt')), readRes(1, 10), readUse(2, src(env, 'b.txt')), readRes(2, 10)]);
  assert.match(run(env, ['--session', 'a2']), /tool economy \[costoso\]: 0 risultati >20000 car\., 0 troncature, 1 riletture/);
  write(env, 'a2', [readUse(1, src(env, 'b.txt')), readRes(1, 10), ...edit(env, 'a2', 5, src(env, 'b.txt')), readUse(6, src(env, 'b.txt')), readRes(6, 10)]);
  assert.match(run(env, ['--session', 'a2']), /^ambiente: nessun segnale$/m);
});

test('ambiente/tool economy: a runtime truncation notice fires it', () => {
  const env = makeEnv();
  write(env, 'a3', [attachment(env, 'a3', ago(T0), { type: 'read_truncation_notice', banner: 'showing lines 1-9 of 99' })]);
  assert.match(run(env, ['--session', 'a3']), /1 troncature/);
});

test('ambiente/navigation: 2 empty searches stay silent, the 3rd fires; one Read miss fires', () => {
  const env = makeEnv();
  const search = (n) => [
    use(env, 'a4', ago(T0 - n * 1000), `g${n}`, 'Glob', { pattern: `*.nope${n}` }),
    result(env, 'a4', ago(T0 - n * 1000), `g${n}`, 'No files found', false, { toolUseResult: { numFiles: 0, filenames: [] } }),
  ];
  write(env, 'a4', [...search(1), ...search(2)]);
  assert.match(run(env, ['--session', 'a4']), /^ambiente: nessun segnale$/m);
  write(env, 'a4', [...search(1), ...search(2), ...search(3)]);
  assert.match(run(env, ['--session', 'a4']), /navigation \[attrito\]: 3 ricerche a vuoto/);
  write(env, 'a4', [
    use(env, 'a4', ago(T0), 'rm', 'Read', { file_path: src(env, 'ghost.dart') }),
    result(env, 'a4', ago(T0), 'rm', 'File does not exist.', true),
  ]);
  const out = run(env, ['--session', 'a4']);
  assert.match(out, /navigation \[attrito\]: 0 ricerche a vuoto, 1 Read su path inesistente/);
  assert.match(out, /attribuiti ad ambiente: 1/);
  assert.doesNotMatch(out, /Read x1/); // the Read miss left Q5's error list
});

test('ambiente/automated checks: sources edited with no check, or after the last check, or 2 failed checks', () => {
  const env = makeEnv();
  write(env, 'a5', edit(env, 'a5', 1, src(env)));
  assert.match(run(env, ['--session', 'a5']), /automated checks \[attrito\]: nessun check eseguito; 1 edit di sorgenti/);

  // check after the last edit and passing: silent
  write(env, 'a5', [...edit(env, 'a5', 1, src(env)), ...shell(env, 'a5', 2, 'flutter analyze', 'ok', false)]);
  assert.match(run(env, ['--session', 'a5']), /^ambiente: nessun segnale$/m);

  // edit after the last check fires
  write(env, 'a5', [...shell(env, 'a5', 1, 'dart analyze', 'ok', false), ...edit(env, 'a5', 2, src(env))]);
  assert.match(run(env, ['--session', 'a5']), /1 check \(0 falliti\); 1 edit di sorgenti dopo l'ultimo check/);

  // two failed checks fire even though the last check is after the edit
  write(env, 'a5', [
    ...edit(env, 'a5', 1, src(env)),
    ...shell(env, 'a5', 2, 'flutter test', 'Some tests failed.', true),
    ...shell(env, 'a5', 3, 'flutter test --reporter expanded', 'Some tests failed.', true),
  ]);
  const out = run(env, ['--session', 'a5']);
  assert.match(out, /2 check \(2 falliti\)/);
  assert.match(out, /attribuiti ad ambiente: 2/);
  assert.match(out, /tool errors: 0/);
  assert.match(out, /stack: flutter/);
});

test('ambiente false positives: check words inside a --body or heredoc, and edits outside the cwd, do not count', () => {
  const env = makeEnv();
  const outside = path.join(env.root, 'elsewhere', 'scratch.dart');
  write(env, 'a6', [
    ...edit(env, 'a6', 1, outside),
    ...shell(env, 'a6', 2, 'gh issue create --body "remember to run flutter test; dart analyze"', 'ok', false),
    ...shell(env, 'a6', 3, "cat <<'EOF'\nflutter analyze\nEOF", 'flutter analyze', false),
  ]);
  const out = run(env, ['--session', 'a6']);
  assert.match(out, /^ambiente: nessun segnale$/m); // the outside edit is not a source edit under the cwd
  // and the same text IS a check at command position
  write(env, 'a6', [...edit(env, 'a6', 1, src(env)), ...shell(env, 'a6', 2, 'cd app && flutter analyze', 'ok', false)]);
  assert.match(run(env, ['--session', 'a6']), /^ambiente: nessun segnale$/m);
  write(env, 'a6', [...edit(env, 'a6', 1, src(env)), ...shell(env, 'a6', 2, 'gh issue create --body "run flutter test"', 'ok', false)]);
  assert.match(run(env, ['--session', 'a6']), /nessun check eseguito/);
});

test('ambiente/automated checks: project wrapper scripts count as checks by file name (#107)', () => {
  const env = makeEnv();
  const silent = /^ambiente: nessun segnale$/m;
  const ps = (id, n, command) => [
    use(env, id, ago(T0 - n * 1000), `ps${n}`, 'PowerShell', { command }),
    result(env, id, ago(T0 - n * 1000), `ps${n}`, 'ok', false),
  ];
  for (const command of [
    'pwsh -NoProfile -File scripts/run-tests.ps1',
    'node scripts/changelog-lint.js',
    'bash ./tool/runTests.sh',
    'powershell -Command "& ./tool/flutter_analyze.ps1"',
  ]) {
    write(env, 'w1', [...edit(env, 'w1', 1, src(env)), ...shell(env, 'w1', 2, command, 'ok', false)]);
    assert.match(run(env, ['--session', 'w1']), silent, command);
  }
  write(env, 'w1', [...edit(env, 'w1', 1, src(env)), ...ps('w1', 2, '& .\\tool\\analyze.ps1')]);
  assert.match(run(env, ['--session', 'w1']), silent);

  // a wrapper run before the last edit is a check like any other
  write(env, 'w1', [...shell(env, 'w1', 1, 'pwsh -File scripts/run-tests.ps1', 'ok', false), ...edit(env, 'w1', 2, src(env))]);
  assert.match(run(env, ['--session', 'w1']), /1 check \(0 falliti\); 1 edit di sorgenti dopo l'ultimo check/);

  // names without a check word, and the same words in arguments or non-script commands, do not count
  for (const command of ['./scripts/latest.ps1', 'cat scripts/test.ps1', 'git add scripts/test.sh', 'pwsh scripts/deploy.ps1']) {
    write(env, 'w1', [...edit(env, 'w1', 1, src(env)), ...shell(env, 'w1', 2, command, 'ok', false)]);
    assert.match(run(env, ['--session', 'w1']), /nessun check eseguito/, command);
  }
});

test('ambiente/information access: authenticate, command not found and env denials fire; user-rejected does not', () => {
  const env = makeEnv();
  write(env, 'a7', [use(env, 'a7', ago(T0), 'au', 'mcp__claude_ai_Notion__authenticate', {}), result(env, 'a7', ago(T0), 'au', 'login needed')]);
  assert.match(run(env, ['--session', 'a7']), /information access \[bloccante\]: accesso non configurato: claude_ai_Notion/);

  write(env, 'a7', shell(env, 'a7', 1, 'melos run analyze', "The term 'melos' is not recognized as a name of a cmdlet", true));
  const nf = run(env, ['--session', 'a7']);
  assert.match(nf, /comando non trovato: melos/);

  write(env, 'a7', [
    use(env, 'a7', ago(T0), 'd1', 'Bash', { command: 'cat secrets.env' }),
    result(env, 'a7', ago(T0), 'd1', 'denied by rule', true, { toolDenialKind: 'permission-rule' }),
  ]);
  const den = run(env, ['--session', 'a7']);
  assert.match(den, /rifiuti permission-rule x1/);
  assert.match(den, /permission-rule: Bash cat secrets\.env/);

  write(env, 'a7', [
    use(env, 'a7', ago(T0), 'd1', 'Bash', { command: 'rm -rf x' }),
    result(env, 'a7', ago(T0), 'd1', 'user said no', true, { toolDenialKind: 'user-rejected', userFeedback: 'no' }),
  ]);
  assert.match(run(env, ['--session', 'a7']), /^ambiente: nessun segnale$/m);
});

test('ambiente/information access takes precedence: a missing flutter binary is not a failed check, and is claimed once', () => {
  const env = makeEnv();
  write(env, 'a8', [
    ...edit(env, 'a8', 1, src(env)),
    ...shell(env, 'a8', 2, 'flutter analyze', "The term 'flutter' is not recognized as a name of a cmdlet", true),
    ...shell(env, 'a8', 3, 'flutter analyze', "The term 'flutter' is not recognized as a name of a cmdlet", true),
  ]);
  const out = run(env, ['--session', 'a8']);
  assert.match(out, /comando non trovato: flutter/);
  assert.match(out, /attribuiti ad ambiente: 2/);
  assert.match(out, /tool errors: 0/);
  assert.match(out, /automated checks \[attrito\]: nessun check eseguito; 1 edit di sorgenti/); // no check actually ran
  assert.doesNotMatch(out, /falliti/);
  assert.match(out, /repeated shell commands: 0/); // the claimed calls left ripetizioni too
});

test('ambiente dedup: repeated checks leave "repeated shell commands" when the block is lit, stay when it is not', () => {
  const env = makeEnv();
  const checks = [1, 2, 3].flatMap((n) => shell(env, 'a9', n, 'flutter test', 'ok', false));
  // unlit: a source edit BEFORE the checks, all passing
  write(env, 'a9', [...edit(env, 'a9', 0, src(env), ago(T0 + MIN)), ...checks]);
  assert.match(run(env, ['--session', 'a9']), /repeated shell commands: 1/);
  // lit: a source edit after the last check
  write(env, 'a9', [...checks, ...edit(env, 'a9', 9, src(env), ago(T1))]);
  const out = run(env, ['--session', 'a9']);
  assert.match(out, /3 check \(0 falliti\); 1 edit di sorgenti dopo l'ultimo check/);
  assert.match(out, /repeated shell commands: 0/);
});

test('ambiente/global agents.md: total at 24999 chars is silent, 25000 fires and names the largest file', () => {
  const env = makeEnv();
  const att = (a, b) => attachment(env, 'a10', ago(T0), {
    type: 'instructions',
    files: [{ path: '/u/CLAUDE.md', type: 'Project', content: 'x'.repeat(a) }, { path: '/u/MEMORY.md', type: 'AutoMem', content: 'y'.repeat(b) }],
  });
  write(env, 'a10', [att(10000, 14999)]);
  assert.match(run(env, ['--session', 'a10']), /^ambiente: nessun segnale$/m);
  write(env, 'a10', [att(10000, 15000)]);
  const fired = run(env, ['--session', 'a10']);
  assert.match(fired, /global agents\.md \[strutturale\]: 2 file, 25000 car\..*handoff: tune-setup --surface memory-index/);
  // listed by size, largest first
  assert.match(fired, /AutoMem MEMORY\.md 15000 car\.\n\s+Project CLAUDE\.md 10000 car\./);
});

test('ambiente/global agents.md: handoff surface follows the largest file and the list is capped', () => {
  const env = makeEnv();
  const file = (name, type, len) => ({ path: `/u/${name}`, type, content: 'x'.repeat(len) });
  write(env, 'a12', [
    attachment(env, 'a12', ago(T0), {
      type: 'instructions',
      files: [file('CLAUDE.md', 'Project', 20000), file('MEMORY.md', 'AutoMem', 6000)],
    }),
  ]);
  assert.match(run(env, ['--session', 'a12']), /handoff: tune-setup --surface istruzioni/);

  write(env, 'a13', [
    attachment(env, 'a13', ago(T0), {
      type: 'instructions',
      files: [
        file('a.md', 'Project', 9000), file('b.md', 'Project', 8000), file('c.md', 'Project', 7000),
        file('d.md', 'User', 2000), file('e.md', 'User', 1000),
      ],
    }),
  ]);
  const out = run(env, ['--session', 'a13']);
  assert.match(out, /Project a\.md 9000 car\.\n\s+Project b\.md 8000 car\.\n\s+Project c\.md 7000 car\.\n\s+\.\.\. \+2 file/);
  assert.doesNotMatch(out, /d\.md 2000/);
});

test('ambiente block has its own cap and reports omitted lines', () => {
  const env = makeEnv();
  const events = [
    attachment(env, 'a11', ago(T0), { type: 'instructions', files: [{ path: '/u/M.md', type: 'AutoMem', content: 'x'.repeat(30000) }] }),
    attachment(env, 'a11', ago(T0), { type: 'read_truncation_notice', banner: 'b' }),
    ...edit(env, 'a11', 1, src(env)),
    use(env, 'a11', ago(T0), 'au', 'mcp__x__authenticate', {}),
    result(env, 'a11', ago(T0), 'au', 'login'),
    use(env, 'a11', ago(T0), 'rm', 'Read', { file_path: src(env, 'ghost.dart') }),
    result(env, 'a11', ago(T0), 'rm', 'File does not exist.', true),
  ];
  for (let i = 0; i < 3; i++) {
    events.push(use(env, 'a11', ago(T0), `dn${i}`, 'Bash', { command: `cat f${i}` }), result(env, 'a11', ago(T0), `dn${i}`, 'no', true, { toolDenialKind: 'permission-rule' }));
  }
  write(env, 'a11', events);
  const amb = block(run(env, ['--session', 'a11']), 'ambiente:').split('\n');
  assert.ok(amb.length <= 10, `ambiente block has ${amb.length} lines`);
  assert.match(amb[0], /^ambiente: 5 segnali/);
});

// ==================================================================== Codex ====

function codexRollout(env, id, meta, events = []) {
  const dir = path.join(env.home, '.codex', 'sessions', '2026', '11', '03');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rollout-${id}.jsonl`);
  const t = ago(2 * MIN);
  fs.writeFileSync(file, [
    { type: 'session_meta', timestamp: t, payload: { id, cwd: env.cwd, ...meta } },
    ...events.map((payload) => ({ type: 'response_item', timestamp: t, payload })),
  ].map((e) => JSON.stringify(e)).join('\n'));
  return file;
}

test('Codex: diff is anchored on session_meta.git.commit_hash; ambiente is declared not evaluated', () => {
  const env = makeEnv();
  const anchor = initRepo(env, ago(2 * DAY));
  fs.writeFileSync(path.join(env.cwd, 'a.txt'), 'edited by codex\n');
  const file = codexRollout(env, 'cx1', { cli_version: '0.160.0', git: { commit_hash: anchor, branch: 'develop' } }, [
    { type: 'custom_tool_call', name: 'apply_patch', call_id: 'p1', input: '*** Begin Patch\n*** Update File: a.txt\n@@\n-x\n+y\n*** End Patch' },
    { type: 'custom_tool_call_output', call_id: 'p1', output: 'Success. Updated files.' },
  ]);
  const out = run(env, ['--agent', 'codex', '--transcript', file]);
  assert.match(block(out, 'diff:'), new RegExp(`develop \\[ATTRIBUITO\\] ${anchor.slice(0, 7)} → working tree: 1 file`));
  assert.match(out, /^ambiente: non valutato su Codex/m);
  assert.doesNotMatch(out, /cli_version.*outside/);
});

test('Codex: a cli_version outside the observed range carries a WARNING', () => {
  const env = makeEnv();
  const file = codexRollout(env, 'cx2', { cli_version: '0.200.0' });
  assert.match(run(env, ['--agent', 'codex', '--transcript', file]), /WARNING: Codex cli_version 0\.200\.0 outside the observed range 0\.153\.4 - 0\.165\.0/);
});

// ====================================================== real-shape canary ====

// tests/retro/fixtures/claude-real-shape.jsonl was cut from real Claude Code transcripts (CLI
// 2.1.317) and sanitized: every free-text string is replaced, record structure, keys and tool
// id pairing are kept. If the CLI changes its record shapes this test fails before the
// synthetic builders above can mask it (the lesson of the Codex parser, ticket #79).
test('real-shape canary: the sanitized Claude fixture is read in full, replayed blobs count once', () => {
  const env = makeEnv();
  const fixture = path.join(__dirname, 'fixtures', 'claude-real-shape.jsonl');
  const out = run(env, ['--transcript', fixture]);
  assert.doesNotMatch(out, /WARNING/);
  assert.match(out, /session: canary-session {2}events: 11 /);
  assert.match(out, /tool errors: 1\n/);
  assert.match(out, /attribuiti ad ambiente: 1/); // the denied call belongs to the ambiente block
  assert.match(out, /rifiuti: .*automode-blocked=1/);
  assert.match(out, /information access \[bloccante\]: rifiuti automode-blocked x1/);
  assert.match(out, / x3 echo placeholder/); // 3 distinct tool_use ids; the 2 blob replays add nothing
});
