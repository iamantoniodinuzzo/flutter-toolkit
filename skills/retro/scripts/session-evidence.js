#!/usr/bin/env node
// session-evidence.js — reads Claude Code or Codex session transcripts (.jsonl) and
// extracts verifiable friction signals: tool calls that errored, Bash commands run more
// than once, and files edited more than twice. This is the evidence `skills/retro`'s Q5
// (session friction) must cite instead of guessing from the model's own memory of the
// conversation — which is unreliable, and actively fabricated once the session has been
// compacted.
//
// Usage:
//   node session-evidence.js [--agent auto|claude|codex] [--transcript <path>] [--session <id>] [--list] [--config-audit]
// Codex selection/normalization lives in codex-transcript.js. The Claude path below
// preserves its existing selection order and valid-transcript output.
//
// Transcript selection, in order (the header's `selected by:` line says which one fired):
//   1. --transcript <path>            explicit file.
//   2. --session <id>                 <id>.jsonl in ANY ~/.claude/projects/* dir (cwd-independent).
//   3. CLAUDE_CODE_SESSION_ID env     same lookup; Claude Code exports it to tool subprocesses and
//                                     it equals the transcript filename, so this is exact, not a
//                                     guess (ref #74).
//   4. Heuristic (below)              newest *.jsonl for the cwd slug. Only this path can pick a
//                                     wrong session, so only this path gets the staleness check:
//                                     if the pick's last event is older than RETRO_STALE_HOURS
//                                     (default 6) the output carries a WARNING plus a candidate
//                                     list (cwd-slug dir and `<slug>-*` siblings, e.g. monorepo
//                                     apps). If exactly one candidate is fresh it is selected.
//                                     --list prints the candidate list unconditionally.
// A WARNING means the evidence is UNVERIFIED — same as "no transcript found", never a clean
// session.
//
// Retro v3 (ADR 0011) adds two blocks in the default mode, each under its own line cap and
// outside OUTPUT_LINE_CAP, and neither is emitted under --config-audit:
//   diff:      per-branch session diff (session-diff.js, cap DIFF_LINE_CAP), anchored on the HEAD
//              the branch had when the session started; subagent edits and denials are read from
//              <session>/subagents/. NON RICAVABILE = git cannot answer; NON ATTRIBUIBILE = git
//              answered but the diff is not this session's.
//   ambiente:  five environment signals derived from the transcript only (retro-lens.js, cap
//              AMBIENTE_LINE_CAP, thresholds are named constants there). Each tool call is counted
//              once by tool_use id; a failed call claimed by a lit signal leaves `tool errors:` and
//              `repeated shell commands:` (reported as `attribuiti ad ambiente: N`).
// Retro v3.1 (ADR 0012) adds a third default-mode block, outside OUTPUT_LINE_CAP and under its own
// cap (standardize-lens.js, STANDARDIZE_LINE_CAP), also absent under --config-audit:
//   standardizzazione:  model-issued Skill calls of this session (outcome, identical args) and user
//                       instructions repeated across >= 2 distinct sessions of the same project dir
//                       (proof for a slash-command proposal; a repeat inside one session is friction).
// Codex is best-effort: the diff anchors on session_meta.git.commit_hash, ambiente and
// standardizzazione are declared not evaluated, and a cli_version outside the observed range
// carries a WARNING.
//
// --config-audit (opt-in, ADR 0008): appends a fourth block — skill invocations,
// hook-repetition, hook_cancelled, toolDenialKind breakdown, skill-listing-vs-invoked
// trigger-miss anchor — under its own CONFIG_AUDIT_LINE_CAP, separate from
// OUTPUT_LINE_CAP. `tune-setup` always passes this flag; `retro`'s Passo 0 call site
// must NEVER pass it — that cap protects retro's tight end-of-session context budget
// (see OUTPUT_LINE_CAP's comment below). Without the flag, output is byte-for-byte
// identical to the pre-ADR-0008 script.
//
// Default transcript selection: newest *.jsonl by mtime in
// ~/.claude/projects/<cwd-slug>/, where <cwd-slug> is the current working directory with
// every non-alphanumeric character replaced by -, one dash per character (matches Claude
// Code's own slugging, see slugForCwd()). If that exact directory does not exist, fall back
// to scanning ~/.claude/projects/ for an entry whose name canonicalizes (collapse runs of
// non-alphanumerics to one dash, lowercase) to the same value as the derived slug — covers
// slug-algorithm drift between toolkit and CLI versions without ever preferring a fuzzy
// match over the exact one (see canonicalSlug()). Pass --transcript to override — useful
// when retro runs against a session other than the current one, or the auto-detected file
// is wrong because multiple sessions are open against the same project.
//
// Degrades silently: if no transcript is found or it can't be parsed, prints one line
// and exits 0. A missing transcript is NOT evidence of a clean session — retro must say
// explicitly that it couldn't check, not treat silence as "nothing happened".
//
// Output is aggregated and capped at OUTPUT_LINE_CAP lines — never a raw transcript dump.
// That cap matters here specifically: this runs at the end of a session, when context is
// already tightest.
//
// This logic lives in one file (not duplicated in bash regex + PowerShell
// ConvertFrom-Json) because it needs a real JSON parser to correctly pair a tool_result's
// tool_use_id back to the tool_use block that produced it — a hand-rolled per-line regex
// parser would drift between the two shell dialects and silently miscount. Node is a safe
// dependency here: it's what Claude Code itself runs on, unlike `jq`, which this
// environment does not have installed. session-evidence.sh and session-evidence.ps1 are
// thin dispatchers to this file — there is no separate logic to keep in sync.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const lens = require('./retro-lens.js');
const sessionDiff = require('./session-diff.js');
const standardize = require('./standardize-lens.js');

const OUTPUT_LINE_CAP = 40;
// CONFIG_AUDIT_LINE_CAP (ADR 0008 decision 2) is deliberately a SEPARATE constant from
// OUTPUT_LINE_CAP, not folded into it. 120 = 3x retro's cap: tune-setup runs on-demand
// with a different cost budget than retro's every-task-end cadence (ADR 0006), and this
// block is aggregated counters, not the ~4,160-token raw file read ADR 0006 measured.
const CONFIG_AUDIT_LINE_CAP = 120;
const TOP_N = 10;
// Repeated-hook-injection threshold (ADR 0008 decision 3): matches the existing
// "files edited >2x" threshold below, not the bash ">1" one — a hook firing on every
// matching tool call is normal by design; it takes an actual repeat to be signal.
const HOOK_REPEAT_THRESHOLD = 2;

function parseArgs(argv) {
  let agent = 'auto';
  let transcript = null;
  let session = null;
  let list = false;
  let configAudit = false;
  for (let i = 0; i < argv.length; i++) {
    if (['--agent', '--transcript', '--session'].includes(argv[i]) && (!argv[i + 1] || argv[i + 1].startsWith('--'))) {
      throw new Error(`Missing value for ${argv[i]}`);
    }
    if (argv[i] === '--agent') {
      agent = argv[++i];
    } else if (argv[i].startsWith('--agent=')) {
      agent = argv[i].slice('--agent='.length);
    } else if (argv[i] === '--transcript') {
      transcript = argv[i + 1];
      i++;
    } else if (argv[i].startsWith('--transcript=')) {
      transcript = argv[i].slice('--transcript='.length);
    } else if (argv[i] === '--session') {
      session = argv[i + 1];
      i++;
    } else if (argv[i].startsWith('--session=')) {
      session = argv[i].slice('--session='.length);
    } else if (argv[i] === '--list') {
      list = true;
    } else if (argv[i] === '--config-audit') {
      configAudit = true;
    }
  }
  if (!['auto', 'claude', 'codex'].includes(agent)) throw new Error('--agent must be auto, claude, or codex');
  return { transcript, session, list, configAudit, agent };
}

function slugForCwd(cwd) {
  // Matches Claude Code's own project-dir slugging exactly (extracted from the installed
  // CLI, issue #59): every character that is not an ASCII letter or digit is replaced,
  // one dash per character — no collapsing. "C:\Users\..." has two non-alnum characters
  // after the drive letter (":" then "\"), producing "C--Users-...", not "C-Users-...".
  // A collapsing regex (`+`) silently points at a directory that doesn't exist.
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

// Lossier than slugForCwd() on purpose — this is ONLY for recovery matching, never for
// deriving the path we look up first. Collapses runs of non-alphanumerics to a single dash
// and lowercases, so a directory written by a different slug algorithm still matches:
// "C-Users-x-my_app" and "C--Users-x-my-app" both canonicalize to "c-users-x-my-app".
// slugForCwd() stays exact (one dash per character) because that is what Claude Code
// actually writes today (ref #61).
function canonicalSlug(s) {
  return s.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
}

function newestJsonlIn(dir) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const withStats = files
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const full = path.join(dir, f);
      let mtime = 0;
      try {
        mtime = fs.statSync(full).mtimeMs;
      } catch {
        /* ignore, sorts last */
      }
      return { full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return withStats.length ? withStats[0].full : null;
}

function findLatestTranscript() {
  const slug = slugForCwd(process.cwd());
  const dir = path.join(os.homedir(), '.claude', 'projects', slug);
  if (fs.existsSync(dir)) {
    return { path: newestJsonlIn(dir), slug, dir, matchedDir: null };
  }

  // Exact dir missing — scan for a canonical-slug match before giving up (ref #69).
  const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
  let entries;
  try {
    entries = fs.readdirSync(projectsRoot);
  } catch {
    return { path: null, slug, dir, matchedDir: null };
  }
  const target = canonicalSlug(slug);
  const candidates = entries
    .filter((name) => canonicalSlug(name) === target)
    .map((name) => path.join(projectsRoot, name))
    .filter((full) => {
      try {
        return fs.statSync(full).isDirectory();
      } catch {
        return false;
      }
    });

  let bestPath = null;
  let bestDir = null;
  let bestMtime = -1;
  for (const candidateDir of candidates) {
    let files;
    try {
      files = fs.readdirSync(candidateDir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const full = path.join(candidateDir, f);
      let mtime = 0;
      try {
        mtime = fs.statSync(full).mtimeMs;
      } catch {
        continue;
      }
      if (mtime > bestMtime) {
        bestMtime = mtime;
        bestPath = full;
        bestDir = candidateDir;
      }
    }
  }

  return { path: bestPath, slug, dir, matchedDir: bestDir };
}

const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

// <id>.jsonl in any project dir — cwd-independent (ref #74). The id is validated so it can
// never be used to build a path outside ~/.claude/projects.
function findBySessionId(id) {
  if (!id || !SESSION_ID_RE.test(id)) return null;
  const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
  let entries;
  try {
    entries = fs.readdirSync(projectsRoot);
  } catch {
    return null;
  }
  let best = null;
  let bestMtime = -1;
  for (const name of entries) {
    const full = path.join(projectsRoot, name, `${id}.jsonl`);
    try {
      const m = fs.statSync(full).mtimeMs;
      if (m > bestMtime) {
        bestMtime = m;
        best = full;
      }
    } catch {
      /* not in this dir */
    }
  }
  return best;
}

// Cheap per-file summary for the header and candidate list: event count and last-event
// timestamp (falls back to mtime when the file has no timestamps).
function transcriptSummary(file) {
  let events = 0;
  let lastTs = null;
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      events++;
      const m = line.match(/"timestamp":"([^"]+)"/);
      if (m && (!lastTs || m[1] > lastTs)) lastTs = m[1];
    }
  } catch {
    /* unreadable: report zero events */
  }
  let lastMs = lastTs ? Date.parse(lastTs) : NaN;
  if (Number.isNaN(lastMs)) {
    try {
      lastMs = fs.statSync(file).mtimeMs;
    } catch {
      lastMs = 0;
    }
  }
  return { events, lastTs, lastMs, id: path.basename(file, '.jsonl') };
}

function humanAge(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min}m`;
  const h = min / 60;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${Math.round(h / 24)}d`;
}

// Project dirs for the cwd slug plus `<slug>-*` children (a Melos monorepo has one project
// dir per app: <root-slug>-apps-<app>). Newest `limit` transcripts across all of them.
function listCandidates(slug, limit) {
  const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
  let entries;
  try {
    entries = fs.readdirSync(projectsRoot);
  } catch {
    return [];
  }
  const target = canonicalSlug(slug);
  const found = [];
  for (const name of entries) {
    const canon = canonicalSlug(name);
    if (canon !== target && !canon.startsWith(`${target}-`)) continue;
    const dir = path.join(projectsRoot, name);
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const full = path.join(dir, f);
      let mtime;
      try {
        mtime = fs.statSync(full).mtimeMs;
      } catch {
        continue;
      }
      found.push({ full, dirName: name, mtime });
    }
  }
  return found
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map((c) => ({ ...c, ...transcriptSummary(c.full) }));
}

function staleThresholdMs() {
  const h = parseFloat(process.env.RETRO_STALE_HOURS);
  return (Number.isFinite(h) && h > 0 ? h : 6) * 3600000;
}

function firstLine(text, maxLen) {
  const line = String(text).split('\n')[0];
  return line.length > maxLen ? line.slice(0, maxLen) + '…' : line;
}

// Codex CLI versions whose rollout format was observed (research ticket #79); outside this
// range the evidence is flagged, not trusted silently (ticket "Retro v3 su Codex").
const CODEX_OBSERVED = { min: [0, 153, 4], max: [0, 165, 0] };

function readCodexMeta(raw) {
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e && e.type === 'session_meta') {
      const p = e.payload || {};
      return { cwd: p.cwd, commit: p.git && p.git.commit_hash, branch: p.git && p.git.branch, cliVersion: p.cli_version };
    }
  }
  return null;
}

function outsideCodexRange(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
  if (!m) return true;
  const n = [Number(m[1]), Number(m[2]), Number(m[3])];
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  return cmp(n, CODEX_OBSERVED.min) < 0 || cmp(n, CODEX_OBSERVED.max) > 0;
}

// Subagent transcripts live in <session dir>/subagents/agent-*.jsonl with an agent-*.meta.json
// beside each (worktreeBranch / worktreePath). Retro reads them only for successful edit
// paths and tool denials (ticket "Diff e handoff con sessioni parallele").
function scanSubagents(transcriptPath) {
  const dir = path.join(path.dirname(transcriptPath), path.basename(transcriptPath, '.jsonl'), 'subagents');
  const sub = { st: lens.newState(), branches: [], roots: [] };
  let files;
  try { files = fs.readdirSync(dir); } catch { return sub; }
  for (const name of files) {
    if (!name.endsWith('.jsonl')) continue;
    try {
      for (const line of fs.readFileSync(path.join(dir, name), 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { lens.collect(sub.st, JSON.parse(line), true); } catch { /* skip malformed */ }
      }
    } catch { /* unreadable subagent file */ }
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, name.replace(/\.jsonl$/, '.meta.json')), 'utf8'));
      if (meta.worktreeBranch) sub.branches.push(meta.worktreeBranch);
      if (meta.worktreePath) sub.roots.push(meta.worktreePath);
    } catch { /* no meta */ }
  }
  return sub;
}

// What was run, short enough to cite: the command for shells, the path for file tools,
// else truncated JSON. Newlines collapsed so one error group stays one output line.
function inputExcerpt(input) {
  if (!input || typeof input !== 'object') return '';
  const s =
    typeof input.command === 'string'
      ? input.command
      : typeof input.file_path === 'string'
        ? input.file_path
        : JSON.stringify(input);
  const flat = s.trim().replace(/\s+/g, ' ');
  return flat.length > 120 ? flat.slice(0, 120) + '…' : flat;
}

// First line of an error result that looks like the actual error; falls back to the first
// non-empty line. Shell output often opens with a banner, so line 1 alone is a poor cite.
function errorLine(text) {
  const lines = String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const hit = lines.find((l) => /error|fail|exception/i.test(l)) || lines[0] || '';
  return hit.length > 100 ? hit.slice(0, 100) + '…' : hit;
}

// Last two path segments (either separator) — enough to cite, short enough not to truncate
// to a useless "...\lib\src\feature…" prefix.
function tailSegments(p) {
  const parts = p.split(/[\\/]+/).filter(Boolean);
  return parts.slice(-2).join('/');
}

function sampleFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textBlock = content.find((c) => c && c.type === 'text');
    if (textBlock) return textBlock.text;
    return JSON.stringify(content);
  }
  return '';
}

function bump(map, key, sidechain) {
  const rec = map.get(key) || { count: 0, sidechain: false, sample: '' };
  rec.count++;
  rec.sidechain = rec.sidechain || sidechain;
  map.set(key, rec);
  return rec;
}

// attachment.content on hook_additional_context / hook_system_message events is
// sometimes a plain string, sometimes an array of strings — normalize to one string.
function attachmentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(String).join(' ');
  return '';
}

// skill_listing's attachment.content is a "- <name>: <description>" line per offered
// skill. Names can themselves contain a bare colon (namespaced, e.g.
// "mattpocock-skills:grilling"), so split on the first ": " (colon+space) — the real
// name/description separator — not the first bare colon.
function parseSkillListing(content) {
  const names = [];
  for (const rawLine of attachmentText(content).split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('- ')) continue;
    const rest = line.slice(2);
    const sep = rest.indexOf(': ');
    if (sep === -1) continue;
    names.push(rest.slice(0, sep));
  }
  return names;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { transcript: explicit, session, list, configAudit } = args;
  const codex = require('./codex-transcript.js').select(args);
  if (codex && !codex.path) { console.log(codex.message); return; }

  // Selection (see header). `notes` are header lines for anything unusual on the way.
  const notes = [];
  let transcriptPath = null;
  let selectedBy = null;
  let auto = null;
  let candidates = null;
  let stale = null; // { ageMs } when the heuristic pick is older than the threshold

  if (codex) {
    transcriptPath = codex.path;
    selectedBy = codex.selectedBy;
    candidates = codex.candidates;
    stale = codex.stale;
  } else if (explicit) {
    transcriptPath = explicit;
    selectedBy = '--transcript';
  } else if (session) {
    transcriptPath = findBySessionId(session);
    selectedBy = `--session ${session}`;
    if (!transcriptPath) {
      console.log(`no transcript found for session id ${session} under ~/.claude/projects/*`);
      process.exit(0);
    }
  } else if (process.env.CLAUDE_CODE_SESSION_ID) {
    const envId = process.env.CLAUDE_CODE_SESSION_ID;
    transcriptPath = findBySessionId(envId);
    if (transcriptPath) {
      selectedBy = `session id (CLAUDE_CODE_SESSION_ID=${envId})`;
    } else {
      notes.push(`  [CLAUDE_CODE_SESSION_ID=${envId} has no transcript; fell back to newest-by-mtime]`);
    }
  }

  if (!transcriptPath && !explicit) {
    auto = findLatestTranscript();
    transcriptPath = auto.path;
    selectedBy = `newest by mtime in ${auto.matchedDir || auto.dir}`;
    if (transcriptPath && fs.existsSync(transcriptPath)) {
      const age = Date.now() - transcriptSummary(transcriptPath).lastMs;
      if (age > staleThresholdMs()) {
        stale = { ageMs: age };
        candidates = listCandidates(auto.slug, 5);
        const fresh = candidates.filter((c) => Date.now() - c.lastMs <= staleThresholdMs());
        if (fresh.length === 1) {
          transcriptPath = fresh[0].full;
          selectedBy = `candidate scan (only fresh transcript among ${auto.slug}[-*])`;
          stale = null;
        }
      }
    }
  }
  if (list && !candidates && auto && !codex) candidates = listCandidates(auto.slug, 5);
  if (list && !candidates && !codex) {
    candidates = listCandidates(slugForCwd(process.cwd()), 5);
  }

  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    if (explicit) {
      console.log(`no transcript found at ${explicit}`);
    } else {
      console.log(
        `no transcript found (slug: ${auto.slug}, checked: ${auto.dir}, ` +
          'no canonical-slug match under ~/.claude/projects)'
      );
    }
    process.exit(0);
  }

  let raw;
  try {
    raw = fs.readFileSync(transcriptPath, 'utf8');
  } catch (e) {
    console.log(`no transcript found (could not read ${transcriptPath}: ${e.message})`);
    process.exit(0);
  }

  let codexMeta = null;
  if (codex) {
    const normalized = require('./codex-transcript.js').normalize(raw);
    if (!normalized.recognized) { console.log('WARNING: unrecognized Codex transcript; evidence UNVERIFIED'); return; }
    codexMeta = readCodexMeta(raw);
    raw = normalized.raw;
    if (normalized.malformed || normalized.unsupported) notes.push(
      `WARNING: partial Codex evidence (${normalized.malformed} malformed records, ${normalized.unsupported} unsupported tool records); do not claim complete coverage.`);
  }

  const st = lens.newState();
  let sessionId = null;
  let firstTs = null;
  let lastTs = null;
  let eventCount = 0;
  let malformedCount = 0;

  // --config-audit only (ADR 0008). Left unpopulated and unread when the flag is
  // absent, so the default path's output cannot be affected by any of this.
  const skillsOffered = new Map(); // skill name -> event # first offered
  const hookInjections = new Map(); // "hookName sample" -> {count, hookName, sample}
  const hookCancelled = [];
  // Default mode only (standardize-lens.js, ADR 0012): the human-typed messages of this session.
  const userMsgs = [];

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let evt;
    try {
      evt = JSON.parse(line);
    } catch {
      malformedCount++;
      continue;
    }
    if (!evt || typeof evt !== 'object' || Array.isArray(evt)) { malformedCount++; continue; }
    eventCount++;
    if (!sessionId && evt.sessionId) sessionId = evt.sessionId;
    if (evt.timestamp) {
      if (!firstTs || evt.timestamp < firstTs) firstTs = evt.timestamp;
      if (!lastTs || evt.timestamp > lastTs) lastTs = evt.timestamp;
    }

    // Tool calls, results, denials and steering attachments are folded by id (retro-lens.js),
    // so records the CLI replays (api-request-blob) count once.
    lens.collect(st, evt, !!evt.isSidechain);

    if (!configAudit) {
      if (!codex) {
        const t = standardize.humanText(evt);
        if (t) userMsgs.push(t);
      }
      continue;
    }

    // hook_* and skill_listing events are top-level `type: "attachment"` events, not
    // nested in message.content — a different shape from the tool_use/tool_result
    // blocks above.
    if (evt.type === 'attachment' && evt.attachment && typeof evt.attachment === 'object') {
      const att = evt.attachment;
      if (att.type === 'skill_listing') {
        for (const name of parseSkillListing(att.content)) {
          if (!skillsOffered.has(name)) skillsOffered.set(name, eventCount);
        }
      } else if (att.type === 'hook_additional_context' || att.type === 'hook_system_message') {
        const hookName = att.hookName || 'unknown';
        const sample = firstLine(attachmentText(att.content), 80);
        const key = `${hookName} ${sample}`;
        const rec = hookInjections.get(key) || { count: 0, hookName, sample };
        rec.count++;
        hookInjections.set(key, rec);
      } else if (att.type === 'hook_cancelled') {
        hookCancelled.push({
          hookName: att.hookName || 'unknown',
          timedOut: !!att.timedOut,
          durationMs: att.durationMs,
        });
      }
    }
  }
  if (codexMeta) {
    if (!st.cwd && codexMeta.cwd) st.cwd = codexMeta.cwd;
    if (codexMeta.branch) st.branches.add(codexMeta.branch);
    if (outsideCodexRange(codexMeta.cliVersion)) {
      notes.push(
        `WARNING: Codex cli_version ${codexMeta.cliVersion || 'unknown'} outside the observed range ` +
          `${CODEX_OBSERVED.min.join('.')} - ${CODEX_OBSERVED.max.join('.')}; the rollout format may have changed, evidence is partial.`
      );
    }
  }
  {
    // Format canary (ticket "Come verificare che la skill retro si comporti come descritta"):
    // tool_use blocks with not a single matching tool_result mean the record shape is not
    // the one this parser knows. Silence must never read as a clean session.
    let paired = 0;
    for (const id of st.uses.keys()) if (st.results.has(id)) paired++;
    if (st.uses.size > 0 && paired === 0) {
      notes.push(
        `WARNING: evidenza parziale (formato non riconosciuto): ${st.uses.size} tool_use senza alcun tool_result; ` +
          'do not read the counters below as a clean session.'
      );
    }
  }

  const uses = [...st.uses.values()];
  const skillInvocations = new Map(); // skill name -> count
  if (configAudit) {
    for (const u of uses) {
      if (u.name === 'Skill' && u.input && typeof u.input.skill === 'string') {
        skillInvocations.set(u.input.skill, (skillInvocations.get(u.input.skill) || 0) + 1);
      }
    }
  }

  // diff: and ambiente: (default mode only: tune-setup's --config-audit output is unchanged).
  let diffLines = null;
  let ambiente = null;
  let claimedFailed = new Set();
  let claimedChecks = new Set();
  let claimedBy = new Map();
  if (!configAudit) {
    const sub = codex ? { st: lens.newState(), branches: [], roots: [] } : scanSubagents(transcriptPath);
    const subDenials = [...sub.st.denials].map((d) => {
      const u = d.id && sub.st.uses.get(d.id);
      return { ...d, what: u ? `${u.name} ${inputExcerpt(u.input)}` : null };
    });
    const roots = [st.cwd, ...sub.roots].filter(Boolean);
    if (codex) {
      ambiente = { block: ['ambiente: non valutato su Codex (best-effort: nessun segnale ambiente, non è una sessione pulita)'] };
    } else {
      ambiente = lens.evaluate(st, { excerpt: inputExcerpt, roots }, subDenials);
      claimedFailed = ambiente.claimedFailed;
      claimedChecks = ambiente.claimedChecks;
      claimedBy = ambiente.claimedBy;
    }
    const editPaths = new Set(
      lens.successfulEdits(st, { mainOnly: false }).concat(lens.successfulEdits(sub.st, { mainOnly: false })).map((e) => e.file)
    );
    const lastMsForLive = lastTs ? Date.parse(lastTs) : NaN;
    diffLines = sessionDiff.buildDiff({
      cwd: st.cwd,
      firstTs,
      lastTs,
      live: Number.isFinite(lastMsForLive) && Date.now() - lastMsForLive <= staleThresholdMs(),
      branches: [...st.branches, ...sub.branches],
      worktreeRoots: sub.roots,
      anchorCommit: codexMeta && codexMeta.commit ? codexMeta.commit : null,
      editPaths,
      deniedLine: lens.denialPairs(st.denials.concat(sub.st.denials)) + ' (transcript principale + subagent)',
    });
  }

  // Failed tool calls grouped by tool + what was run, minus the ones the ambiente block
  // claimed (each fact appears once, ticket "Dedup tra blocco Ambiente e Q1/Q5").
  const errorsByTool = new Map(); // "tool\0excerpt" -> {count, sidechain, sample, name, excerpt}
  let attributed = 0;
  const attributedBy = new Map(); // section -> failed calls it claimed (#100)
  for (const [id, r] of st.results) {
    if (!r.isError) continue;
    if (claimedFailed.has(id)) {
      attributed++;
      const section = claimedBy.get(id);
      if (section) attributedBy.set(section, (attributedBy.get(section) || 0) + 1);
      continue;
    }
    const u = st.uses.get(id);
    const name = u ? u.name : 'unknown';
    const excerpt = u ? inputExcerpt(u.input) : '';
    const rec = bump(errorsByTool, `${name}\u0001${excerpt}`, !!(u && u.sidechain));
    rec.name = name;
    rec.excerpt = excerpt;
    if (!rec.sample) rec.sample = errorLine(r.text);
  }
  const bashCommandCounts = new Map();
  const editedFileCounts = new Map();
  for (const u of uses) {
    const cmd = lens.SHELL_TOOLS.has(u.name) && u.input && typeof u.input.command === 'string' ? u.input.command : null;
    if (cmd !== null && !claimedChecks.has(u.id) && !claimedFailed.has(u.id)) bump(bashCommandCounts, cmd.trim(), u.sidechain);
    if ((u.name === 'Edit' || u.name === 'Write') && u.input && typeof u.input.file_path === 'string') {
      const r = st.results.get(u.id);
      if (!(r && r.isError)) bump(editedFileCounts, u.input.file_path, u.sidechain);
    }
  }

  // Header first and impossible to miss (ref #74): which file, how it was chosen, how old it
  // is. Kept outside OUTPUT_LINE_CAP — it is bounded (<= ~12 lines) and the cap protects the
  // evidence body, which must not be cut to make room for it.
  const header = [];
  if (!eventCount) { console.log('WARNING: empty or malformed transcript; evidence UNVERIFIED'); return; }
  if (malformedCount) notes.push(`WARNING: ${malformedCount} malformed records skipped; evidence is partial.`);
  header.push(`transcript: ${transcriptPath}`);
  header.push(`  selected by: ${selectedBy}`);
  if (auto && auto.matchedDir) {
    header.push(`  [slug fallback: derived ${auto.dir} missing, matched ${auto.matchedDir}]`);
  }
  notes.forEach((n) => header.push(n));
  const lastMs = lastTs ? Date.parse(lastTs) : NaN;
  if (codex && !stale && Number.isFinite(lastMs) && Date.now() - lastMs > staleThresholdMs()) {
    stale = { ageMs: Date.now() - lastMs };
  }
  const ageText = Number.isNaN(lastMs) ? 'unknown' : `${humanAge(Date.now() - lastMs)} ago`;
  header.push(
    `session: ${sessionId || 'unknown'}  events: ${eventCount}  ` +
      `window: ${firstTs || '?'} .. ${lastTs || '?'}  last event: ${ageText}`
  );
  if (stale) {
    header.push(
      `WARNING: newest transcript is ${humanAge(stale.ageMs)} old (threshold ` +
        `${humanAge(staleThresholdMs())}), probably NOT the current session — treat the ` +
        'evidence below as UNVERIFIED, not as a clean session. Re-run with --session <id>.'
    );
  }
  if (candidates) {
    header.push(`candidates (${candidates.length}, newest first):`);
    candidates.forEach((c) => {
      header.push(
        `  ${c.id}  ${humanAge(Date.now() - c.lastMs)} ago  events: ${c.events}  dir: ${c.dirName}`
      );
    });
    if (!candidates.length) header.push('  (none found for this cwd slug)');
  }
  header.push('');

  const out = [];
  const totalErrors = [...errorsByTool.values()].reduce((s, r) => s + r.count, 0);
  out.push(`tool errors: ${totalErrors}`);
  [...errorsByTool.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N)
    .forEach((rec) => {
      const ran = rec.excerpt ? ` \`${rec.excerpt}\`` : '';
      out.push(
        `  ${rec.name} x${rec.count}${rec.sidechain ? ' [subagent]' : ''}${ran} → ${rec.sample}`
      );
    });
  if (attributed) {
    const parts = lens.CLAIM_SECTIONS.filter((s) => attributedBy.get(s)).map((s) => `${s} ${attributedBy.get(s)}`);
    out.push(`attribuiti ad ambiente: ${attributed} (${parts.length ? `${parts.join(', ')}; ` : ''}vedi blocco Ambiente)`);
  }
  out.push('');

  const repeatedCmds = [...bashCommandCounts.entries()].filter(([, r]) => r.count > 1);
  out.push(`repeated shell commands: ${repeatedCmds.length}`);
  repeatedCmds
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, TOP_N)
    .forEach(([cmd, rec]) => {
      out.push(`  x${rec.count}${rec.sidechain ? ' [subagent]' : ''} ${firstLine(cmd, 90)}`);
    });
  out.push('');

  const reedited = [...editedFileCounts.entries()].filter(([, r]) => r.count > 2);
  out.push(`files edited >2x: ${reedited.length}`);
  reedited
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, TOP_N)
    .forEach(([fp, rec]) => {
      out.push(`  x${rec.count}${rec.sidechain ? ' [subagent]' : ''} ${tailSegments(fp)}`);
    });

  if (!configAudit) {
    const body = out.slice(0, OUTPUT_LINE_CAP);
    const standardizeBlock = standardize.evaluate({ st, userMsgs, transcriptPath, codex: !!codex });
    console.log(header.concat(diffLines, '', body, '', ambiente.block, '', standardizeBlock).join('\n'));
    return;
  }

  if (codex) {
    out.push('', '--- config audit (tune-setup, --config-audit) ---',
      'unavailable: Claude Skill invocations, hook injection/cancellation, toolDenialKind, and skill_listing trigger-miss metrics.',
      'Inspect Codex configuration and accessible session evidence directly; unavailable metrics are not zero findings.');
    console.log(header.concat(out.slice(0, OUTPUT_LINE_CAP + CONFIG_AUDIT_LINE_CAP)).join('\n'));
    return;
  }

  // --config-audit block (ADR 0008). Appended after the three default blocks above,
  // under its own CONFIG_AUDIT_LINE_CAP — see that constant's comment for why it is
  // never folded into OUTPUT_LINE_CAP.
  out.push('');
  out.push('--- config audit (tune-setup, --config-audit) ---');
  out.push('');

  out.push(
    `skill invocations: ${
      skillInvocations.size
        ? [...skillInvocations.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => `${name} x${count}`)
            .join(', ')
        : 'none'
    }`
  );
  out.push('');

  const repeatedHooks = [...hookInjections.values()].filter((r) => r.count > HOOK_REPEAT_THRESHOLD);
  out.push(`hook injections (hookName + content, >${HOOK_REPEAT_THRESHOLD}x): ${repeatedHooks.length}`);
  repeatedHooks
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N)
    .forEach((r) => {
      out.push(`  ${r.hookName} x${r.count} — ${r.sample}`);
    });
  out.push('');

  out.push(`hook_cancelled: ${hookCancelled.length}`);
  hookCancelled.slice(0, TOP_N).forEach((h) => {
    out.push(`  ${h.hookName}${h.timedOut ? ' [timed out]' : ''} — ${h.durationMs}ms`);
  });
  out.push('');

  out.push(`toolDenialKind: ${lens.denialPairs(st.denials)}`);
  st.denials
    .filter((d) => d.kind === 'user-rejected' && d.feedback)
    .slice(0, TOP_N)
    .forEach((d) => {
      out.push(`  user-rejected: ${firstLine(d.feedback, 100)}`);
    });
  out.push('');

  const missed = [...skillsOffered.keys()].filter((name) => !skillInvocations.has(name));
  out.push(`skills offered, never invoked (structural anchor for trigger-miss): ${missed.length}`);
  missed.slice(0, TOP_N).forEach((name) => {
    out.push(`  ${name} — first offered at event #${skillsOffered.get(name)}`);
  });

  // Truncation must be visible, not silent — an empty-looking tail (e.g. "0 findings")
  // should never be confused with "cap cut the real findings off". Scoped to the
  // --config-audit block only: the default (non-config-audit) path's OUTPUT_LINE_CAP
  // behavior is unchanged, per ADR 0008's byte-for-byte invariant on retro's own call.
  const totalCap = OUTPUT_LINE_CAP + CONFIG_AUDIT_LINE_CAP;
  if (out.length > totalCap) {
    const omitted = out.length - (totalCap - 1);
    console.log(
      header.concat(out.slice(0, totalCap - 1)).join('\n') +
        `\n... output truncated at ${totalCap} lines (${omitted} more line(s) omitted)`
    );
  } else {
    console.log(header.concat(out).join('\n'));
  }
}

main();
