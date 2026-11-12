'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function records(file) {
  const events = [];
  let malformed = 0;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (!event || typeof event !== 'object' || Array.isArray(event)) malformed++;
      else events.push(event);
    } catch { malformed++; }
  }
  return { events, malformed };
}

function sessionFiles(dir) {
  const files = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...sessionFiles(full));
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(full);
    }
  } catch { /* Missing or inaccessible session directory. */ }
  return files;
}

function summary(file) {
  let fd;
  try {
    // Candidate discovery reads only the metadata and tail, not every full session.
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const chunks = [];
    let offset = 0;
    while (offset < Math.min(size, 2_000_000)) {
      const chunk = Buffer.alloc(Math.min(size - offset, 65536));
      const read = fs.readSync(fd, chunk, 0, chunk.length, offset);
      if (!read) break;
      chunks.push(chunk.subarray(0, read)); offset += read;
      if (chunk.subarray(0, read).includes(10)) break;
    }
    const first = JSON.parse(Buffer.concat(chunks).toString('utf8').split('\n')[0]);
    const meta = first.type === 'session_meta' ? first.payload : null;
    if (!meta?.id || !meta.cwd) return null;
    const tail = Buffer.alloc(Math.min(size, 65536));
    fs.readSync(fd, tail, 0, tail.length, Math.max(0, size - tail.length));
    const times = [...tail.toString('utf8').matchAll(/"timestamp"\s*:\s*"([^"]+)"/g)]
      .map(m => Date.parse(m[1])).filter(Number.isFinite);
    return { full: file, id: meta.id, cwd: meta.cwd, dirName: meta.cwd,
      events: 'not counted', lastMs: times.length ? Math.max(...times) : 0 };
  } catch { return null; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

function sameDirectory(a, b) {
  const normalize = value => {
    const absolute = path.resolve(value);
    return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
  };
  return normalize(a) === normalize(b);
}

function candidates() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return sessionFiles(path.join(home, 'sessions')).map(summary).filter(Boolean)
    .sort((a, b) => b.lastMs - a.lastMs);
}

function select(args) {
  if (args.agent === 'claude') return null;
  if (args.transcript) {
    try {
      const { events } = records(args.transcript);
      if (args.agent === 'codex' || events.some(e => e.type === 'session_meta')) {
        return { path: args.transcript, selectedBy: '--transcript', candidates: args.list ? candidates().slice(0, 5) : null, notes: [] };
      }
    } catch {
      if (args.agent === 'codex') return { path: null, message: `no transcript found at ${args.transcript}` };
    }
    return null;
  }
  const id = args.session || process.env.CODEX_THREAD_ID;
  if (args.agent === 'auto' && !id && process.env.CLAUDE_CODE_SESSION_ID) return null;
  const all = candidates();
  if (id) {
    const matches = all.filter(c => c.id === id);
    if (matches.length === 1) return { path: matches[0].full,
      selectedBy: args.session ? `--session ${id}` : `session id (CODEX_THREAD_ID=${id})`,
      candidates: args.list ? all.filter(c => sameDirectory(c.cwd, process.cwd())).slice(0, 5) : null, notes: [] };
    if (args.agent === 'codex' || (!args.session && process.env.CODEX_THREAD_ID)) {
      return { path: null, message: matches.length > 1
        ? 'WARNING: ambiguous Codex session id; use --transcript <path> (evidence UNVERIFIED)'
        : `no transcript found for Codex session id ${id}` };
    }
    return null;
  }
  const matching = all.filter(c => sameDirectory(c.cwd, process.cwd()));
  if (!matching.length) return args.agent === 'codex'
    ? { path: null, message: 'no Codex transcript found for this working directory' } : null;
  if (args.agent === 'auto') {
    const slug = process.cwd().replace(/[^a-zA-Z0-9]/g, '-');
    const claudeDir = path.join(os.homedir(), '.claude', 'projects', slug);
    try {
      if (fs.readdirSync(claudeDir).some(name => name.endsWith('.jsonl'))) return {
        path: null, message: 'WARNING: Claude and Codex transcripts exist for this cwd; pass --agent or an explicit transcript (evidence UNVERIFIED)' };
    } catch { /* No Claude candidate for this cwd. */ }
  }
  const threshold = Number(process.env.RETRO_STALE_HOURS);
  const ageLimit = (Number.isFinite(threshold) && threshold > 0 ? threshold : 6) * 3600000;
  const fresh = matching.filter(c => Date.now() - c.lastMs <= ageLimit);
  if (fresh.length > 1) return { path: null,
    message: 'WARNING: multiple fresh Codex sessions for this cwd; use --session <id> or --transcript <path> (evidence UNVERIFIED)' };
  const chosen = fresh[0] || matching[0];
  return { path: chosen.full, selectedBy: 'Codex cwd metadata (only fresh candidate, otherwise newest)',
    candidates: args.list || !fresh.length ? matching.slice(0, 5) : null,
    stale: fresh.length ? null : { ageMs: Date.now() - chosen.lastMs }, notes: [] };
}

const EXEC_RE = /^(?:functions\.)?exec$/;
const SHELL_EXE_RE = /^(?:pwsh|powershell|bash|sh|zsh|cmd)(?:\.exe)?$/i;
const SHELL_FLAG_RE = /^(?:-c|-lc|-command|\/c)$/i;
const OUTPUT_CAP = 4000;

// A CommandExecution item carries argv: `[pwsh.exe, -Command, "<script>"]`. The script is what
// the agent ran, so that is the command; any other argv is joined.
function commandText(argv) {
  if (typeof argv === 'string') return argv;
  if (!Array.isArray(argv)) return '';
  const parts = argv.map(String);
  const exe = (parts[0] || '').split(/[\\/]/).pop();
  if (SHELL_EXE_RE.test(exe) && parts.length >= 3 && parts.slice(1, -1).some((p) => SHELL_FLAG_RE.test(p))) {
    return parts[parts.length - 1];
  }
  return parts.join(' ');
}

// Paths named by an apply_patch body. The body is also seen as a JS string literal inside an
// `exec` call, where the newlines are the two characters `\n`, so a path ends at a backslash,
// a real newline or a closing quote.
function patchPaths(text) {
  const paths = [];
  for (const m of String(text || '').matchAll(/\*\*\* (?:Update File|Add File|Delete File|Move to): ([^\\\r\n"'`]+)/g)) {
    paths.push(m[1].trim());
  }
  return paths;
}

function outputText(output) {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return output.map((o) => (o && typeof o.text === 'string' ? o.text : '')).join('\n');
  return JSON.stringify(output) || '';
}

function normalize(raw) {
  const events = [];
  let malformed = 0;
  let unsupported = 0;
  let sessionId;
  const pending = new Map();
  // Real rollouts (CLI 0.155 - 0.167) log every shell run twice: an `exec` custom tool call (a JS
  // body that may run several commands) and one CommandExecution event per command actually run.
  // The events are authoritative, so the `exec` call is not counted again when they exist. Patches
  // are logged as FileChange events and also inside the `exec` body; the body is the fallback.
  const hasCommandExecution = raw.includes('"type":"CommandExecution"');
  const hasFileChange = raw.includes('"type":"FileChange"');
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { malformed++; continue; }
    if (!event || typeof event !== 'object' || Array.isArray(event)) { malformed++; continue; }
    if (event.type === 'session_meta') sessionId = event.payload?.id;
    const payload = event.payload || {};
    const content = [];
    if (event.type === 'event_msg' && payload.type === 'item_completed' && payload.item && typeof payload.item === 'object') {
      const item = payload.item;
      if (item.type === 'CommandExecution') {
        const failed = item.status === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0);
        const text = String(item.aggregated_output ?? item.stdout ?? '') || (failed ? `exit code ${item.exit_code}` : '');
        content.push({ type: 'tool_use', id: item.id, name: 'exec_command', input: { command: commandText(item.command) } },
          { type: 'tool_result', tool_use_id: item.id, is_error: failed, content: text.slice(0, OUTPUT_CAP) });
      } else if (item.type === 'FileChange' && item.status === 'completed' && item.changes && typeof item.changes === 'object') {
        for (const [file, change] of Object.entries(item.changes)) {
          content.push({ type: 'tool_use', name: 'Edit', input: { file_path: file } });
          if (change && typeof change.move_path === 'string' && change.move_path) {
            content.push({ type: 'tool_use', name: 'Edit', input: { file_path: change.move_path } });
          }
        }
      }
    }
    if (event.type === 'response_item') {
      if (payload.type === 'custom_tool_call' && EXEC_RE.test(payload.name) && hasCommandExecution) {
        // Covered by CommandExecution events: no tool_use, no result. Keep the body for the patch fallback.
        if (payload.call_id) pending.set(payload.call_id, { name: payload.name, input: {}, covered: true, body: payload.input });
      } else if (payload.type === 'custom_tool_call_output' && pending.get(payload.call_id)?.covered) {
        const call = pending.get(payload.call_id);
        if (!hasFileChange && !/^Script failed/.test(outputText(payload.output))) {
          for (const file of patchPaths(call.body)) content.push({ type: 'tool_use', name: 'Edit', input: { file_path: file } });
        }
      } else if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
        let input = {};
        if (payload.type === 'function_call') {
          try { input = JSON.parse(payload.arguments || '{}'); } catch { malformed++; }
        } else input = { patch: payload.input || '' };
        if (typeof input.cmd === 'string') input.command = input.cmd;
        if (EXEC_RE.test(payload.name)) unsupported++;
        if (payload.call_id) pending.set(payload.call_id, { name: payload.name, input });
        content.push({ type: 'tool_use', id: payload.call_id, name: payload.name, input });
      } else if (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') {
        const output = payload.output;
        const text = typeof output === 'string' ? output : JSON.stringify(output);
        let data = output;
        if (typeof output === 'string') { try { data = JSON.parse(output); } catch { /* Plain-text tool output. */ } }
        const exitMatch = (text || '').match(/(?:Process exited with code|Process exit code):?\s*(-?\d+)\b/i);
        const exit = data?.exit_code ?? data?.metadata?.exit_code ?? (exitMatch ? Number(exitMatch[1]) : undefined);
        const failed = data?.isError === true || data?.is_error === true
          || (typeof exit === 'number' ? exit !== 0 : /^(?:Error:|error:|Failed to|failed to)/m.test(text || ''));
        content.push({ type: 'tool_result', tool_use_id: payload.call_id, is_error: failed, content: text || '' });
        const call = pending.get(payload.call_id);
        if (!call) unsupported++;
        if (call && !failed && /(?:^|__)apply_patch$/.test(call.name)) {
          for (const file of patchPaths(call.input.patch || call.input.input)) {
            content.push({ type: 'tool_use', name: 'Edit', input: { file_path: file } });
          }
        }
      } else if (payload.type === 'local_shell_call' || /tool|function_call/.test(payload.type || '')) {
        unsupported++;
      }
    }
    events.push({ timestamp: event.timestamp, sessionId, message: { content } });
  }
  return { raw: events.map(e => JSON.stringify(e)).join('\n'), malformed, unsupported,
    recognized: !!sessionId };
}

module.exports = { select, normalize, candidates, sameDirectory };
