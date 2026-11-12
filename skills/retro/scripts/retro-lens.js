'use strict';
// retro-lens.js — per-session evidence state and the `ambiente:` block (retro v3, ADR 0011).
//
// Everything here is derived from transcript events only: this module never reads a
// configuration file (retro's invariant, ADR 0011 decision 2). Tool calls are keyed by
// `tool_use.id`, so records that the CLI replays (`api-request-blob`) count once.
//
// Thresholds are named constants (decision of the "Soglie dei segnali ambiente" ticket,
// #90). The skill's references/environment-lens.md cites these names, never the values.

const path = require('path');

const TOOL_RESULT_CHARS = 20000; // one tool_result above this fires Tool economy
const NAV_EMPTY_SEARCHES = 3; // Grep/Glob with zero results (main thread)
const NAV_READ_MISSES = 1; // Read of a path that does not exist
const CHECK_FAILED_MIN = 2; // failed check commands that fire Automated checks
const AGENTS_MD_TOTAL_CHARS = 25000; // total loaded steering text (absolute, not relative)
const AGENTS_MD_LIST_MAX = 3; // files listed under the global agents.md line (handoff to tune-setup)
const AMBIENTE_LINE_CAP = 10; // own cap for the lit block; the "no signal" line is outside it
const DENIAL_KINDS = ['user-rejected', 'permission-rule', 'automode-blocked'];
const ENV_DENIALS = new Set(['permission-rule', 'automode-blocked']);

const SHELL_TOOLS = new Set(['Bash', 'PowerShell', 'exec_command', 'functions.exec_command']);
const SOURCE_EXT = new Set([
  '.dart', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.kt',
  '.swift', '.rb', '.php', '.cs', '.c', '.cc', '.cpp', '.h', '.vue', '.svelte',
]);
// Check commands, matched against the *command position* of each shell segment, never
// against arguments or a quoted --body (false positive found on a real session, #84).
const CHECK_RES = [
  /^(?:dart|flutter)\s+(?:analyze|test|format)\b/,
  /^melos\s+(?:run|exec|analyze|test)\b/,
  /^(?:eslint|tsc|prettier|jest|vitest|pytest|ruff|mypy)\b/,
  /^(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:test|lint|typecheck|check)\b/,
  /^cargo\s+(?:test|clippy|check)\b/,
  /^go\s+(?:test|vet)\b/,
  /^node\s+--test\b/,
];
// Project wrapper scripts (#107): a script run at command position counts as a check when its
// file name has one of these words. Whole words only, so `latest.ps1` does not match `test`.
const SCRIPT_RUNNERS = new Set(['pwsh', 'powershell', 'bash', 'sh', 'zsh', 'node', 'python', 'python3', 'py', 'cmd']);
const SCRIPT_EXT = new Set(['.ps1', '.sh', '.bash', '.bat', '.cmd', '.js', '.mjs', '.cjs', '.ts', '.py', '.dart']);
const WRAPPER_WORD_RE = /^(?:tests?|analy[sz]e|format|lint|check)$/;
// Harness phrase for a foreground command that outlived its timeout (#104). It belongs to the
// harness and may change, so a TaskStop on the moved task is an independent trigger.
const BG_TIMEOUT_RE = /did not complete within its \d+\s*s timeout|moved to the background/i;
const TASK_STOP_TOOLS = new Set(['TaskStop', 'KillShell']);
const FLUTTER_CMD_RE = /^(?:dart|flutter|melos)\b/;
const NOT_FOUND_RE =
  /command not found|is not recognized as|term '[^']+' is not recognized|exit code:? ?127\b/i;

const isWin = process.platform === 'win32';
const norm = (p) => {
  const s = String(p).replace(/\\/g, '/');
  return isWin ? s.toLowerCase() : s;
};

// ---------------------------------------------------------------- collection

function newState() {
  return {
    uses: new Map(), // id -> {id, name, input, ts, sidechain, seq}
    results: new Map(), // tool_use_id -> {isError, len, text, ts, tr}
    denials: [], // {kind, id, feedback}
    truncations: 0,
    rereadAtt: 0,
    instr: new Map(), // path -> {type, len}
    branches: new Set(),
    cwd: null,
    seq: 0,
  };
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === 'string' ? c : c && typeof c.text === 'string' ? c.text : ''))
      .join('\n');
  }
  return '';
}

// A Grep/Glob that found nothing. Grep in output_mode "content" reports numFiles 0 even with
// hits (it counts lines), so a zero file count alone is not "empty" (#103). The literal result
// text is the fallback for a record that carries no structured toolUseResult.
const EMPTY_SEARCH_TEXT_RE = /^\s*No (?:matches|files) found\b/i;
function emptySearch(tr, text) {
  if (EMPTY_SEARCH_TEXT_RE.test(text || '')) return true;
  if (!tr || typeof tr !== 'object') return false;
  const noFiles = tr.numFiles === 0 || (Array.isArray(tr.filenames) && tr.filenames.length === 0);
  const noHits = !(tr.numLines > 0) && !(tr.numMatches > 0) && !tr.content;
  return noFiles && noHits;
}

// A shell call the harness moved to the background (#104): the id of that task and, when the
// harness reports it, the timeout that triggered the move. A deliberate run_in_background has
// an id and no timeout.
function backgroundInfo(tr, text) {
  const out = {};
  const obj = tr && typeof tr === 'object' ? tr : {};
  if (typeof obj.backgroundTaskId === 'string' && obj.backgroundTaskId) out.bgTaskId = obj.backgroundTaskId;
  else {
    const m = /\(ID: ([A-Za-z0-9_-]+)\)/.exec(text);
    if (m) out.bgTaskId = m[1];
  }
  if (typeof obj.timedOutAfterMs === 'number' && obj.timedOutAfterMs > 0) out.timedOutMs = obj.timedOutAfterMs;
  return out;
}

// Fold one transcript event into `st`. Idempotent per tool_use id / tool_result id.
function collect(st, evt, sidechain) {
  if (!evt || typeof evt !== 'object') return;
  const replay = evt.type === 'api-request-blob';
  if (!replay) {
    if (!st.cwd && typeof evt.cwd === 'string') st.cwd = evt.cwd;
    if (typeof evt.gitBranch === 'string' && evt.gitBranch && evt.gitBranch !== 'HEAD') {
      st.branches.add(evt.gitBranch);
    }
  }
  const content = evt.message && Array.isArray(evt.message.content) ? evt.message.content : [];
  let firstResultId = null;
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'tool_use') {
      const id = block.id || `anon-${st.seq}`;
      const prev = st.uses.get(id);
      if (prev) {
        if (!prev.ts && evt.timestamp) prev.ts = evt.timestamp;
        continue;
      }
      st.uses.set(id, {
        id,
        name: block.name,
        input: block.input,
        ts: evt.timestamp || null,
        sidechain: !!sidechain,
        seq: st.seq++,
      });
    } else if (block.type === 'tool_result' && block.tool_use_id) {
      if (!firstResultId) firstResultId = block.tool_use_id;
      if (st.results.has(block.tool_use_id)) continue;
      const text = textOf(block.content);
      st.results.set(block.tool_use_id, {
        isError: !!block.is_error,
        len: text.length,
        text: text.length > 2000 ? text.slice(0, 2000) : text,
        truncated: /truncated output \(original token count/i.test(text),
        ts: evt.timestamp || null,
        emptySearch: emptySearch(evt.toolUseResult, text),
        ...backgroundInfo(evt.toolUseResult, text),
      });
    }
  }
  if (!replay && typeof evt.toolDenialKind === 'string') {
    st.denials.push({
      kind: evt.toolDenialKind,
      id: firstResultId,
      feedback: typeof evt.userFeedback === 'string' ? evt.userFeedback : null,
    });
  }
  if (evt.type === 'attachment' && evt.attachment && typeof evt.attachment === 'object') {
    const a = evt.attachment;
    if (a.type === 'read_truncation_notice') st.truncations++;
    else if (a.type === 'already_read_file') st.rereadAtt++;
    else if (a.type === 'instructions' && Array.isArray(a.files)) {
      for (const f of a.files) {
        if (f && typeof f.path === 'string' && typeof f.content === 'string') {
          st.instr.set(f.path, { type: f.type || 'unknown', len: f.content.length });
        }
      }
    }
  }
}

// ---------------------------------------------------------------- commands

// Split a shell command into segments at unquoted ; | & newline, skipping heredoc bodies.
function commandSegments(cmd) {
  const segs = [];
  let cur = '';
  let q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      cur += c;
      if (c === '\\' && q === '"') {
        cur += cmd[++i] || '';
        continue;
      }
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      cur += c;
      continue;
    }
    if (c === '<' && cmd[i + 1] === '<' && cmd[i + 2] !== '<') {
      const m = /^<<-?\s*(['"]?)([A-Za-z_]\w*)\1/.exec(cmd.slice(i));
      if (m) {
        const rest = cmd.slice(i + m[0].length);
        const end = new RegExp(`\\n[ \\t]*${m[2]}[ \\t]*(?:\\n|$)`).exec(rest);
        cur += m[0];
        i = end ? i + m[0].length + end.index + end[0].length - 1 : cmd.length;
        continue;
      }
    }
    if (c === ';' || c === '\n' || c === '|' || c === '&') {
      segs.push(cur);
      cur = '';
      if ((c === '|' || c === '&') && cmd[i + 1] === c) i++;
      continue;
    }
    cur += c;
  }
  segs.push(cur);
  return segs.map((s) => s.trim()).filter(Boolean);
}

function normSegment(seg) {
  return seg
    .replace(/^&\s+/, '')
    .replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)+/, '')
    .replace(/^(?:npx|pnpx|bunx|time|sudo)\s+/, '');
}

const baseName = (t) => t.replace(/\\/g, '/').split('/').pop();
const scriptExt = (t) => path.extname(baseName(t)).toLowerCase();

// True when the segment invokes a project script (directly or through a runner such as
// `pwsh -File`) whose file name carries a check word: run-tests.ps1, changelog-lint.js, runTests.sh.
function isWrapperCheck(seg) {
  const tokens = (seg.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^["']|["']$/g, ''));
  if (!tokens.length) return false;
  const head = baseName(tokens[0]).toLowerCase().replace(/\.exe$/, '');
  let script = null;
  if (SCRIPT_RUNNERS.has(head)) {
    // `-Command "& ./x.ps1"` arrives as one token: look at its words too.
    for (const t of tokens.slice(1)) {
      const hit = t.split(/\s+/).map((w) => w.replace(/^&/, '')).find((w) => w && SCRIPT_EXT.has(scriptExt(w)));
      if (hit) {
        script = hit;
        break;
      }
    }
  } else if (SCRIPT_EXT.has(scriptExt(tokens[0])) || /[\\/]/.test(tokens[0])) {
    script = tokens[0];
  }
  if (!script) return false;
  const stem = baseName(script).replace(/\.[^.]+$/, '');
  return stem
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .some((w) => WRAPPER_WORD_RE.test(w.toLowerCase()));
}

function isCheckCommand(cmd) {
  return commandSegments(cmd).some((s) => {
    const n = normSegment(s);
    return CHECK_RES.some((re) => re.test(n)) || isWrapperCheck(n);
  });
}

function hasFlutterCommand(cmd) {
  return commandSegments(cmd).some((s) => FLUTTER_CMD_RE.test(normSegment(s)));
}

function shellCommand(use) {
  return SHELL_TOOLS.has(use.name) && use.input && typeof use.input.command === 'string'
    ? use.input.command
    : null;
}

function notFoundName(use, text) {
  const m = /term '([^']+)' is not recognized/i.exec(text) || /(\S+): command not found/i.exec(text);
  if (m) return m[1];
  const cmd = shellCommand(use) || '';
  return (normSegment(commandSegments(cmd)[0] || '').split(/\s+/)[0] || 'comando').slice(0, 40);
}

// ---------------------------------------------------------------- evaluation

function underRoots(file, roots) {
  const f = norm(file);
  return roots.some((r) => {
    const root = norm(r).replace(/\/+$/, '');
    return f === root || f.startsWith(`${root}/`);
  });
}

function successfulEdits(st, { mainOnly }) {
  const edits = [];
  for (const u of st.uses.values()) {
    if (mainOnly && u.sidechain) continue;
    if (u.name !== 'Edit' && u.name !== 'Write') continue;
    if (!u.input || typeof u.input.file_path !== 'string') continue;
    const r = st.results.get(u.id);
    if (r && r.isError) continue;
    edits.push({ file: u.input.file_path, seq: u.seq });
  }
  return edits;
}

function denialCounts(denials) {
  const counts = new Map(DENIAL_KINDS.map((k) => [k, 0]));
  for (const d of denials) counts.set(d.kind, (counts.get(d.kind) || 0) + 1);
  return counts;
}

function denialPairs(denials) {
  return [...denialCounts(denials).entries()].map(([k, n]) => `${k}=${n}`).join(' ');
}

// Evaluate the five signals. Returns the lit lines plus the tool_use ids the block claims,
// so session-evidence.js can leave them out of Q5's `errori:` and `ripetizioni:` (ticket
// "Dedup tra blocco Ambiente e Q1/Q5"). A call is claimed only if its category is lit, so a
// fact never vanishes from the report.
function evaluate(st, ctx, extraDenials) {
  const { excerpt, roots } = ctx;
  const denials = st.denials.concat(extraDenials || []);
  const claimedFailed = new Set();
  const claimedChecks = new Set();
  const main = [...st.uses.values()].filter((u) => !u.sidechain);

  // --- Information access (highest precedence)
  const auth = new Set();
  for (const u of main) if (/__authenticate$/.test(u.name || '')) auth.add(u.name.split('__')[1] || u.name);
  const notFound = new Map();
  for (const u of main) {
    const r = st.results.get(u.id);
    if (!r || !r.isError || !shellCommand(u) || !NOT_FOUND_RE.test(r.text)) continue;
    claimedFailed.add(u.id);
    const n = notFoundName(u, r.text);
    notFound.set(n, (notFound.get(n) || 0) + 1);
  }
  const envDenials = denials.filter((d) => ENV_DENIALS.has(d.kind));
  for (const d of envDenials) if (d.id && st.uses.has(d.id) && !st.uses.get(d.id).sidechain) claimedFailed.add(d.id);
  const infoLit = auth.size > 0 || notFound.size > 0 || envDenials.length > 0;

  // --- Automated checks
  // A check that never ran (binary not found) is an access gap, not a check that was run.
  const checkUses = main.filter((u) => {
    const c = shellCommand(u);
    return c && isCheckCommand(c) && !claimedFailed.has(u.id);
  });
  const failedChecks = checkUses.filter((u) => {
    const r = st.results.get(u.id);
    return r && r.isError && !claimedFailed.has(u.id);
  });
  const lastCheckSeq = checkUses.length ? Math.max(...checkUses.map((u) => u.seq)) : -1;
  const srcEdits = successfulEdits(st, { mainOnly: true }).filter(
    (e) => SOURCE_EXT.has(path.extname(e.file).toLowerCase()) && underRoots(e.file, roots)
  );
  const editsAfter = srcEdits.filter((e) => e.seq > lastCheckSeq);
  const checksLit =
    srcEdits.length > 0 &&
    (checkUses.length === 0 || editsAfter.length > 0 || failedChecks.length >= CHECK_FAILED_MIN);
  if (checksLit) {
    failedChecks.forEach((u) => claimedFailed.add(u.id));
    checkUses.forEach((u) => claimedChecks.add(u.id));
  }

  // --- Navigation
  let emptySearches = 0;
  const emptyExamples = [];
  let readMisses = 0;
  for (const u of main) {
    const r = st.results.get(u.id);
    if (!r) continue;
    if ((u.name === 'Grep' || u.name === 'Glob') && r.emptySearch) {
      emptySearches++;
      if (emptyExamples.length < 2) emptyExamples.push(`${u.name} ${excerpt(u.input)}`);
    }
    if (u.name === 'Read' && r.isError && !claimedFailed.has(u.id) && /does not exist|no such file|not found|ENOENT/i.test(r.text)) {
      readMisses++;
    }
  }
  const navLit = emptySearches >= NAV_EMPTY_SEARCHES || readMisses >= NAV_READ_MISSES;
  if (navLit) {
    for (const u of main) {
      const r = st.results.get(u.id);
      if (u.name === 'Read' && r && r.isError && !claimedFailed.has(u.id) && /does not exist|no such file|not found|ENOENT/i.test(r.text)) {
        claimedFailed.add(u.id);
      }
    }
  }

  // --- Tool economy
  const big = main
    .map((u) => ({ u, r: st.results.get(u.id) }))
    .filter((x) => x.r && x.r.len > TOOL_RESULT_CHARS)
    .sort((a, b) => b.r.len - a.r.len);
  let truncs = st.truncations;
  for (const u of main) {
    const r = st.results.get(u.id);
    if (r && r.truncated) truncs++;
  }
  let rereads = st.rereadAtt;
  const lastRead = new Map();
  const lastEdit = new Map();
  for (const e of successfulEdits(st, { mainOnly: true })) lastEdit.set(norm(e.file), e.seq);
  for (const u of main.filter((x) => x.name === 'Read' && x.input && typeof x.input.file_path === 'string')) {
    const key = `${norm(u.input.file_path)}|${u.input.offset || ''}|${u.input.limit || ''}`;
    const prev = lastRead.get(key);
    // An Edit/Write that succeeded on the path between the two reads makes the second a verification.
    if (prev !== undefined && !(lastEdit.has(norm(u.input.file_path)) && lastEdit.get(norm(u.input.file_path)) > prev)) rereads++;
    lastRead.set(key, u.seq);
  }
  // Foreground shell calls that timed out into the background. A deliberate
  // run_in_background never counts, even when it is stopped later.
  const stopped = new Set();
  for (const u of main) {
    if (!TASK_STOP_TOOLS.has(u.name) || !u.input) continue;
    const id = u.input.task_id || u.input.shell_id;
    if (typeof id === 'string' && id) stopped.add(id);
  }
  const timeouts = [];
  for (const u of main) {
    if (!shellCommand(u) || u.input.run_in_background) continue;
    const r = st.results.get(u.id);
    if (!r) continue;
    if (r.timedOutMs || BG_TIMEOUT_RE.test(r.text) || (r.bgTaskId && stopped.has(r.bgTaskId))) {
      const m = /(\d+)\s*s timeout/i.exec(r.text);
      const secs = r.timedOutMs ? Math.round(r.timedOutMs / 1000) : m ? Number(m[1]) : null;
      timeouts.push({ u, secs });
    }
  }
  const econLit = big.length > 0 || truncs > 0 || rereads > 0 || timeouts.length > 0;

  // --- Global AGENTS.md (a constant property of the project, severity "strutturale")
  let total = 0;
  let largest = null;
  for (const [p, f] of st.instr) {
    total += f.len;
    if (!largest || f.len > largest.len) largest = { p, ...f };
  }
  const agentsLit = total >= AGENTS_MD_TOTAL_CHARS;

  // --- stack (Flutter-aware only from the transcript; generic fallback otherwise)
  const flutter =
    srcEdits.some((e) => path.extname(e.file).toLowerCase() === '.dart') ||
    main.some((u) => {
      const c = shellCommand(u);
      return c && hasFlutterCommand(c);
    });

  const lines = [];
  if (infoLit) {
    const parts = [];
    if (auth.size) parts.push(`accesso non configurato: ${[...auth].join(', ')}`);
    if (notFound.size) parts.push(`comando non trovato: ${[...notFound.keys()].join(', ')}`);
    if (envDenials.length) {
      const c = new Map();
      envDenials.forEach((d) => c.set(d.kind, (c.get(d.kind) || 0) + 1));
      parts.push(`rifiuti ${[...c.entries()].map(([k, n]) => `${k} x${n}`).join(', ')}`);
    }
    lines.push(`  information access [bloccante]: ${parts.join('; ')}`);
    for (const d of envDenials.slice(0, 2)) {
      const u = d.id && st.uses.get(d.id);
      const what = u ? `${u.name} ${excerpt(u.input)}` : 'tool sconosciuto';
      lines.push(`    ${d.kind}: ${what}${d.feedback ? ` — "${d.feedback.split('\n')[0].slice(0, 80)}"` : ''}`);
    }
  }
  if (checksLit) {
    const desc =
      checkUses.length === 0
        ? `nessun check eseguito; ${srcEdits.length} edit di sorgenti (${new Set(srcEdits.map((e) => norm(e.file))).size} file)`
        : `${checkUses.length} check (${failedChecks.length} falliti); ` +
          `${editsAfter.length} edit di sorgenti dopo l'ultimo check (${new Set(editsAfter.map((e) => norm(e.file))).size} file)`;
    lines.push(`  automated checks [attrito]: ${desc}`);
  }
  if (navLit) {
    lines.push(
      `  navigation [attrito]: ${emptySearches} ricerche a vuoto, ${readMisses} Read su path inesistente` +
        (emptyExamples.length ? ` — ${emptyExamples.join('; ')}` : '')
    );
  }
  if (econLit) {
    lines.push(
      `  tool economy [costoso]: ${big.length} risultati >${TOOL_RESULT_CHARS} car., ${truncs} troncature, ${rereads} riletture` +
        (timeouts.length ? `, ${timeouts.length} timeout` : '')
    );
    for (const x of big.slice(0, 2)) {
      lines.push(`    ${x.u.name} ${excerpt(x.u.input)} → ${x.r.len} car.`);
    }
    for (const t of timeouts.slice(0, 2)) {
      lines.push(`    timeout: ${t.u.name} ${excerpt(t.u.input)}${t.secs ? ` → ${t.secs} s` : ''}`);
    }
  }
  if (agentsLit) {
    const surface = largest.type === 'AutoMem' ? 'memory-index' : 'istruzioni';
    lines.push(
      `  global agents.md [strutturale]: ${st.instr.size} file, ${total} car. (soglia ${AGENTS_MD_TOTAL_CHARS}); ` +
        `handoff: tune-setup --surface ${surface}`
    );
    const bySize = [...st.instr].sort((a, b) => b[1].len - a[1].len);
    for (const [p, f] of bySize.slice(0, AGENTS_MD_LIST_MAX)) {
      lines.push(`    ${f.type} ${path.basename(p)} ${f.len} car.`);
    }
    if (bySize.length > AGENTS_MD_LIST_MAX) lines.push(`    ... +${bySize.length - AGENTS_MD_LIST_MAX} file`);
  }
  const litCount = [infoLit, checksLit, navLit, econLit, agentsLit].filter(Boolean).length;

  let block;
  if (!litCount) block = ['ambiente: nessun segnale'];
  else {
    block = [`ambiente: ${litCount} segnali (stack: ${flutter ? 'flutter' : 'generico'})`, ...lines];
    if (block.length > AMBIENTE_LINE_CAP) {
      const omitted = block.length - (AMBIENTE_LINE_CAP - 1);
      block = block.slice(0, AMBIENTE_LINE_CAP - 1).concat(`  ... ${omitted} righe omesse (tetto ${AMBIENTE_LINE_CAP})`);
    }
  }
  return { block, claimedFailed, claimedChecks, srcEdits };
}

module.exports = {
  newState,
  collect,
  evaluate,
  denialCounts,
  denialPairs,
  successfulEdits,
  isCheckCommand,
  commandSegments,
  textOf,
  SHELL_TOOLS,
  DENIAL_KINDS,
  TOOL_RESULT_CHARS,
  NAV_EMPTY_SEARCHES,
  NAV_READ_MISSES,
  CHECK_FAILED_MIN,
  AGENTS_MD_TOTAL_CHARS,
  AMBIENTE_LINE_CAP,
};
