// Structural checks for skills/retro/SKILL.md and its references (ticket "Come verificare che la
// skill retro si comporti come descritta", #93). No LLM judge: only properties that can drift
// silently — section order, reference wiring, and constants/labels cited by name that must exist
// in the scripts. Behaviour of the written report is covered by BEHAVIOR_CHECKLIST.md.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..', '..', 'skills', 'retro');
const read = (...p) => fs.readFileSync(path.join(SKILL_DIR, ...p), 'utf8');
const skill = read('SKILL.md');
const scriptsSrc = fs
  .readdirSync(path.join(SKILL_DIR, 'scripts'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => read('scripts', f))
  .join('\n');

const idx = (text, needle) => {
  const i = text.indexOf(needle);
  assert(i >= 0, `missing in SKILL.md: ${needle}`);
  return i;
};

test('SKILL.md sections appear in the decided order', () => {
  const order = [
    '## Runtime and resources',
    '## Quando lanciarla',
    '## Compatibilita della sessione',
    '## Passo 0',
    '## Le sei domande',
    '## Ambiente',
    '## Domanda di chiusura',
    '## Ship handoff',
    '## Persistenza',
    '## Report finale',
    '## Anti-patterns',
  ];
  const positions = order.map((h) => idx(skill, h));
  assert.deepStrictEqual([...positions].sort((a, b) => a - b), positions, 'sections out of order');
});

test('Passo 0 documents diff:, ambiente: and the attribution line; questions stay six', () => {
  const passo0 = skill.slice(idx(skill, '## Passo 0'), idx(skill, '## Le sei domande'));
  for (const label of ['`diff:`', '`ambiente:`', '`attribuiti ad ambiente: N`', '`rifiuti:`']) {
    assert(passo0.includes(label), `Passo 0 does not mention ${label}`);
  }
  const questions = skill.slice(idx(skill, '## Le sei domande'), idx(skill, '## Ambiente'));
  assert.strictEqual((questions.match(/^\d\. \*\*/gm) || []).length, 6);
});

test('Ambiente block points to the lens reference, states the invariant and the four levels', () => {
  const block = skill.slice(idx(skill, '## Ambiente'), idx(skill, '## Ship handoff'));
  assert(block.includes('references/environment-lens.md'));
  assert(/non legge mai un file di configurazione/.test(block));
  for (const level of ['bloccante', 'costoso', 'attrito', 'strutturale']) {
    assert(new RegExp(`\\| ${level} \\|`).test(block), `severity level missing: ${level}`);
  }
});

test('writing reference is pointed to between Persistenza and Report finale', () => {
  const pointer = idx(skill, 'references/writing-for-agents.md');
  assert(pointer > idx(skill, '## Persistenza') && pointer < idx(skill, '## Report finale'));
});

test('every file in references/ exists and is called from SKILL.md', () => {
  const files = fs.readdirSync(path.join(SKILL_DIR, 'references'));
  assert(files.length >= 2);
  for (const f of files) assert(skill.includes(`references/${f}`), `references/${f} is not called from SKILL.md`);
});

test('every constant cited by name in environment-lens.md exists in the scripts, and no value is repeated', () => {
  const lens = read('references', 'environment-lens.md');
  const names = [...lens.matchAll(/`([A-Z][A-Z0-9_]{3,})`/g)].map((m) => m[1]);
  assert(names.length >= 5, 'expected the lens to cite its constants by name');
  for (const n of new Set(names)) {
    assert(new RegExp(`\\bconst ${n}\\b`).test(scriptsSrc), `constant ${n} not defined in scripts/`);
  }
  assert(!/\b(?:20000|25000)\b/.test(lens), 'threshold values must not be duplicated in the lens');
});

test('labels and states cited in SKILL.md are emitted by the scripts', () => {
  for (const state of ['ATTRIBUITO', 'PARZIALE', 'NON ATTRIBUIBILE', 'NESSUNA MODIFICA', 'NON RICAVABILE']) {
    assert(skill.includes(state), `SKILL.md does not describe ${state}`);
    assert(scriptsSrc.includes(state), `scripts do not emit ${state}`);
  }
  for (const label of ['attribuiti ad ambiente', 'ambiente: nessun segnale', 'non valutato su Codex', 'rifiuti:']) {
    assert(scriptsSrc.includes(label), `scripts do not emit "${label}"`);
  }
});

test('Q6-to-proposal rule and the automation routing map are wired to evidence the scripts emit (ADR 0012)', () => {
  const passo0 = skill.slice(idx(skill, '## Passo 0'), idx(skill, '## Le sei domande'));
  for (const label of ['`standardizzazione:`', '`repeated user instructions:`', '`ripetute in sessione:`']) {
    assert(passo0.includes(label), `Passo 0 does not mention ${label}`);
  }
  const questions = skill.slice(idx(skill, '## Le sei domande'), idx(skill, '## Ambiente'));
  assert(questions.includes('**Da Q6 a proposta**') && questions.includes('(da Q6)'), 'Q6 proposal rule missing');
  const categories = skill.slice(idx(skill, 'Categorie:'), idx(skill, 'Cap unico'));
  for (const route of ['slash command', 'skill', 'subagent', '`[knowledge]`']) {
    assert(categories.includes(route), `automation routing map misses ${route}`);
  }
  for (const name of ['USER_REPEAT_MIN_SESSIONS', 'SKILL_ARGS_REPEAT_MIN']) {
    assert(skill.includes(name), `SKILL.md does not cite ${name}`);
    assert(new RegExp(`\\bconst ${name}\\b`).test(scriptsSrc), `constant ${name} not defined in scripts/`);
  }
  for (const label of ['standardizzazione:', 'repeated user instructions:', 'ripetute in sessione', 'args identici']) {
    assert(scriptsSrc.includes(label), `scripts do not emit "${label}"`);
  }
});

test('Q2/Q3 actions, closing question and project-issue destination are wired (ADR 0013)', () => {
  const questions = skill.slice(idx(skill, '## Le sei domande'), idx(skill, '## Ambiente'));
  assert(questions.includes('**Azione (Q2, Q3)**'), 'Azione paragraph missing');
  for (const value of ['`issue`', '`test`', '`doc`', '`memoria`', '`nessuna (<motivo>)`']) {
    assert(questions.includes(value), `Azione value missing: ${value}`);
  }

  const closing = skill.slice(idx(skill, '## Domanda di chiusura'), idx(skill, '## Ship handoff'));
  assert(
    closing.includes('Is there anything else substantial that is worth saving for later from the context of this session?'),
    'closing question is not verbatim',
  );
  assert(closing.includes('reddit.com/r/ClaudeCode/comments/1xjfize'), 'source link missing');
  assert(closing.includes('attribuzione non verificata'), 'unverified-attribution note missing');
  assert(closing.includes('Persistenza'), 'closing step does not point to Persistenza');

  const persist = skill.slice(idx(skill, '## Persistenza'), idx(skill, '## Report finale'));
  assert(/\| Issue nel repo del progetto \|.*\| Proposta — aspetta l'ok \|/.test(persist), 'project-issue row missing');
  assert(persist.includes('non esegue `gh issue create`'), 'project-issue rule must forbid gh issue create');

  const report = skill.slice(idx(skill, '## Report finale'), idx(skill, '## Anti-patterns'));
  assert(report.includes('Issue da aprire') && report.includes('Azione:'), 'report format misses the new lines');
  assert(report.includes('max 3'), 'issue pool cap missing');

  const anti = skill.slice(idx(skill, '## Anti-patterns'));
  assert(anti.includes('nel repo del progetto') && anti.includes('nessuna (<motivo>)'), 'anti-patterns not extended');
});

test('proposal shape rules and the agents-md handoff are wired (ADR 0015)', () => {
  const persist = skill.slice(idx(skill, '## Persistenza'), idx(skill, '## Report finale'));
  const shape = persist.slice(persist.indexOf('### Forma della proposta'));
  assert(persist.includes('### Forma della proposta'), 'Forma della proposta missing inside Persistenza');
  for (const needle of ['meccanic', 'hook', 'Puntatore prima del contenuto', '`prova:`', '`ripristino:`', 'references/writing-for-agents.md']) {
    assert(shape.includes(needle), `Forma della proposta misses: ${needle}`);
  }
  assert(/\bconst AGENTS_MD_LIST_MAX\b/.test(scriptsSrc), 'AGENTS_MD_LIST_MAX not defined in scripts/');
  const lens = read('references', 'environment-lens.md');
  assert(lens.includes('--surface memory-index') && lens.includes('--surface istruzioni'), 'lens misses the handoff commands');
  assert(scriptsSrc.includes('handoff: tune-setup --surface'), 'script does not emit the handoff line');
  const anti = skill.slice(idx(skill, '## Anti-patterns'));
  assert(anti.includes('vincolo meccanico') && anti.includes('handoff a `tune-setup`'), 'anti-patterns not extended');
});

test('the writing reference carries attribution, a 40-60 line body and the MIT text', () => {
  const ref = read('references', 'writing-for-agents.md');
  assert(/^> Adapted from /m.test(ref.split('\n').slice(0, 4).join('\n')));
  assert(ref.includes('Copyright (c) 2026 Matt Pocock'));
  assert(ref.includes('THE SOFTWARE IS PROVIDED "AS IS"'));
  const body = ref.slice(0, ref.indexOf('## License (MIT)')).trimEnd().split('\n');
  assert(body.length >= 40 && body.length <= 60, `condensed body is ${body.length} lines`);
});

test('tune-setup carries the boundary and the transient-denial rule', () => {
  const tune = fs.readFileSync(path.resolve(SKILL_DIR, '..', 'tune-setup', 'SKILL.md'), 'utf8');
  assert(tune.includes('evento contro file'));
  assert(tune.includes('automode-unavailable'));
});

test('retro description and Codex short_description mention the environment lens', () => {
  assert(/environment signals/.test(skill.split('\n')[2]));
  const meta = read('agents', 'openai.yaml');
  assert(/short_description: ".*environment.*"/.test(meta));
  assert(meta.includes('default_prompt: "Use $retro to handle the requested retro task."'));
});
