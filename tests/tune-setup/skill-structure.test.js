// Structural checks for skills/tune-setup/SKILL.md (issue #109, ADR 0014). No LLM judge: only
// properties that can drift silently — section order, the scope argument, the memory-index
// criteria and the batch report shape.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const skill = fs.readFileSync(path.resolve(__dirname, '..', '..', 'skills', 'tune-setup', 'SKILL.md'), 'utf8');

const idx = (needle) => {
  const i = skill.indexOf(needle);
  assert(i >= 0, `missing in SKILL.md: ${needle}`);
  return i;
};

test('## Ambito sits between the dependency section and Passo 0', () => {
  const order = ['## Agente e dipendenze', '## Ambito', '## Passo 0', '## Passo 1', '## Le cinque superfici', '## Persistenza', '## Report finale', '## Anti-patterns'];
  const positions = order.map(idx);
  assert.deepStrictEqual([...positions].sort((a, b) => a - b), positions, 'sections out of order');
});

test('--surface lists the six values and keeps memory-index explicit-only', () => {
  const scope = skill.slice(idx('## Ambito'), idx('## Passo 0'));
  assert(scope.includes('--surface'));
  for (const value of ['istruzioni', 'impostazioni', 'hook', 'agenti', 'skill-trigger', 'memory-index']) {
    assert(scope.includes(`\`${value}\``), `scope value missing: ${value}`);
  }
  assert(/solo con l'argomento esplicito/.test(scope), 'memory-index must be explicit-only');
  assert(/cinque superfici/.test(scope), 'full audit must stay at five surfaces');
});

test('Passo 0 states which evidence counts for a size trigger', () => {
  const passo0 = skill.slice(idx('## Passo 0'), idx('## Passo 1'));
  assert(passo0.includes('Trigger di dimensione'));
  assert(passo0.includes('global agents.md'));
  assert(passo0.includes('lunghezza per riga'));
});

test('memory-index subsection carries the three criteria, the pointer check and the re-measure rule', () => {
  const sub = skill.slice(idx('### Indice di memoria'), idx('## Persistenza'));
  for (const needle of ['issue chiusa', 'Riga con contenuto', 'Raggiungibilità', 'Controllo dei puntatori', 'orfano', 'sessione nuova']) {
    assert(sub.includes(needle), `memory-index subsection misses: ${needle}`);
  }
});

test('a batch is a proposal that always waits for an ok, and the report has a Lotto block', () => {
  const persist = skill.slice(idx('## Persistenza'), idx('## Report finale'));
  assert(/\| Lotto su una superficie[^\n]*aspetta l'ok, anche con memoria nativa autorizzata \|/.test(persist), 'batch row missing');
  assert(persist.includes('conta **una** proposta'), 'batch must count as one proposal');

  const report = skill.slice(idx('## Report finale'), idx('## Anti-patterns'));
  for (const needle of ['Lotto —', 'prima:', 'dopo:', 'puntatori:', 'rimisura:', '`batch`']) {
    assert(report.includes(needle), `report misses: ${needle}`);
  }

  const anti = skill.slice(idx('## Anti-patterns'));
  assert(anti.includes('Applicare un lotto senza ok esplicito'));
});

test('the transcript script does not parse --surface (it only prints it as a handoff command, ADR 0015)', () => {
  const retroScripts = path.resolve(__dirname, '..', '..', 'skills', 'retro', 'scripts');
  for (const f of fs.readdirSync(retroScripts).filter((n) => n.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(retroScripts, f), 'utf8');
    // an argv comparison or an options list would mean the flag is parsed here
    assert(!/argv\[[^\]]*\]\s*===\s*'--surface'/.test(src), `${f} must not parse --surface (ADR 0014)`);
    assert(!/\[[^\]]*'--surface'[^\]]*\]\.includes/.test(src), `${f} must not list --surface as an option (ADR 0014)`);
  }
});
