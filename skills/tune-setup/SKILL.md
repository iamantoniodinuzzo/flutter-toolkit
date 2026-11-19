---
name: tune-setup
description: "Audit the current agent configuration and workflow on explicit request. Supports Claude Code and Codex instructions, settings, hooks, agents, and available session evidence. Use for \"tune-setup\", \"ottimizza il setup\", or \"audit config\", or to audit one surface such as the memory index; never run automatically."
user-invocable: true
---

# tune-setup — audit di configurazione e workflow

## Runtime and resources

Use the current agent's native file, search, shell, and question tools; plain-text questions and direct sequential scans are valid fallbacks. Subagents are optional and require host permission. Bundled paths below are relative to this installed skill directory; application paths are relative to the target Flutter project. Resolve sibling skills through the installed skill registry (or sibling directories), never by assuming a `skills/` folder in the application. If a required dependency is absent, name it and report the affected step as unavailable; never invent its rules or claim complete coverage.

Answer in the conversation language. Be honest, specific, non-defensive. No praise, no filler. Every finding must cite a concrete artifact (file, line, hookName, turn number) from THIS session or THIS project's config — no generic advice.

## Quando lanciarla

**Solo su richiesta esplicita** — mai automaticamente, non a fine task, non a milestone, non a release. Trigger: `/tune-setup`, "ottimizza il setup", "audit config", o richiesta equivalente. Cadenza e costo (~4.160 token solo per leggere le superfici di configurazione, misurato in ADR 0006) sono incompatibili con un trigger automatico. Il confine con [[retro]] è **evento contro file** (ADR 0011): `retro` parte dagli eventi del transcript e non legge mai i file di configurazione, `tune-setup` parte dai file, li legge e li giudica.

## Agente e dipendenze

Richiede la skill `retro` per il parser condiviso. Risolvi la sua directory dal registro delle skill installate o da `../retro/`, non dal cwd del progetto. Se manca, segnala le metriche di sessione non disponibili e continua solo con l'ispezione della configurazione.

Per Claude usa le superfici sotto. Per Codex leggi `AGENTS.md` / `AGENTS.override.md` applicabili, `.codex/config.toml` e la configurazione utente accessibile sotto `CODEX_HOME` (default `~/.codex`). Controlla hook, `.codex/agents/`, skill e plugin solo se esistono e sono supportati dalla versione corrente. Non trattare la configurazione Claude come impostazioni Codex, non riportare credenziali e non modificare configurazioni personali.

Il parser Codex riporta errori, comandi ripetuti e patch ripetute. Le metriche Claude (`Skill`, `skill_listing`, hook injection/cancellation, `toolDenialKind`) sono **non disponibili**, non zero. Cita evidenze equivalenti solo se accessibili. Per altri agenti dichiara la copertura parziale. Una capacita assente non e configurazione rotta; un trigger-miss richiede la prova che la skill era offerta e pertinente.

## Ambito

Argomento opzionale `--surface <nome>`, con `<nome>` tra `istruzioni` · `impostazioni` · `hook` · `agenti` · `skill-trigger` · `memory-index`.

- Senza argomento: audit completo delle cinque superfici sotto.
- Con argomento: Passo 0 e Passo 1 si limitano a quella superficie. Le altre non compaiono nel report, nemmeno come «nessun finding»; una riga dichiara l'ambito.
- `memory-index` esiste solo con l'argomento esplicito: non fa parte dell'audit completo, che resta di cinque superfici.

## Passo 0 — Evidenze dal transcript

```bash
node "<installed retro directory>/scripts/session-evidence.js" --agent <claude|codex> --config-audit
```

Il parser appartiene alla skill installata `retro` — è deliberato (ADR 0008): un solo parser `.jsonl`, non duplicato. `retro` non passa `--config-audit`; `tune-setup` lo passa sempre. Per Claude il flag aggiunge un blocco separato, sotto un cap proprio (`CONFIG_AUDIT_LINE_CAP`), con invocazioni `Skill`, hook injection ripetute, `hook_cancelled`, `toolDenialKind` e skill offerte ma mai invocate. Per Codex il blocco dichiara queste metriche non disponibili.

Se non trova un transcript, stampa una riga sola e esce con successo — **non è prova di una sessione pulita**: dichiaralo, non presentare il silenzio come "nessun problema" (stessa regola di `retro`).

**Trigger di dimensione.** Se la causa è una soglia di dimensione (la riga `global agents.md` di `retro`, o `--surface memory-index`), errori, hook, rifiuti e skill offerte del transcript non riguardano il finding. L'evidenza valida è la dimensione per file e la lunghezza per riga, misurate nel Passo 1. Con `--surface memory-index` il Passo 0 non si esegue; senza ambito gira, e il report dichiara che il suo output non è evidenza per quel finding. Con un altro `--surface` cita solo le righe del blocco `--config-audit` di quella superficie.

## Passo 1 — Leggi i file di configurazione

Il Passo 0 copre solo il derivato dal transcript. Leggi direttamente i file applicabili all'agente corrente con gli strumenti nativi; non passano dallo script (ADR 0008).

| Superficie | Claude Code | Codex |
|---|---|---|
| Istruzioni | `CLAUDE.md` applicabili | `AGENTS.md` / `AGENTS.override.md` applicabili |
| Impostazioni | `.claude/settings.json` + `.claude/settings.local.json` | `.codex/config.toml` e configurazione utente accessibile in `CODEX_HOME` |
| Hook e agenti | Definizizioni hook e agenti installati | Solo definizioni esistenti e supportate dall'host corrente |
| Skill e plugin | Catalogo offerto e invocazioni accessibili | Catalogo offerto e prove di caricamento accessibili |

Con `--surface`, leggi solo la riga della tabella corrispondente. Per `memory-index` il file da leggere è l'indice della memoria nativa offerta dall'host (per Claude `MEMORY.md` nella directory di memoria del progetto) più i file che punta; senza memoria nativa accessibile (host senza memoria, Codex incluso) è "non applicabile".

Se una superficie o la sua evidenza non è accessibile, segnala "non verificata"; se non è supportata, segnala "non applicabile". Non riportarla come pulita.

## Le cinque superfici

Un finding per superficie che mostra un problema; dichiara esplicitamente "nessun finding" per una superficie pulita — un audit silenzioso su un risultato pulito è un anti-pattern (stessa regola dell'anti-pattern di `retro` contro il "nulla da migliorare" non dichiarato).

1. **Istruzioni dell'agente** — contenuto stale, istruzioni che contraddicono il comportamento osservato in Passo 0, convenzioni mai più valide. La riga `global agents.md` di `retro` misura solo la dimensione: il giudizio sul contenuto è tuo.
2. **Impostazioni e permessi** — config disallineata dall'uso osservato. Usa `toolDenialKind` solo per Claude; per Codex cita le evidenze accessibili senza inventare metriche equivalenti.
3. **Hook** — per Claude, stesso `hookName` + contenuto **>2 volte** è il segnale di ripetizione; `hook_cancelled` è un finding a qualsiasi occorrenza. Per Codex controlla solo hook supportati e osservabili; le metriche Claude restano non disponibili.
4. **Agenti installati** — descrizioni incoerenti con il comportamento; mancato uso solo quando l'agente era disponibile, pertinente e la delega autorizzata.
5. **Skill-trigger-miss** — vedi sotto, disciplina separata.

### Disciplina skill-trigger-miss

La procedura `skill_listing` / `Skill` seguente riguarda Claude. Per Codex serve una prova accessibile che la skill era offerta, pertinente e non caricata; se manca, dichiara il controllo non verificato.

Il Passo 0 fornisce **solo l'ancora strutturale**: skill X offerta in `skill_listing` al turno N, mai invocata come blocco `Skill` in tutta la sessione. Il giudizio se X *avrebbe dovuto* scattare è tuo, non dello script — a differenza di Q5 di `retro` (pura aggregazione strutturale, perché gira nel punto più esposto a compattazione di una sessione), `tune-setup` gira on-demand con più margine ed esiste apposta per fare giudizi, non solo contare eventi. La regola "nessuna proposta senza evento verificabile" resta soddisfatta dall'ancora strutturale; il giudizio sopra è il lavoro vero di questa skill, non una violazione della regola.

**Esempio corretto** (citazione completa, non solo la regola astratta):

> Skill `flutter-flavors` offerta al turno #142 (`skill_listing`), mai invocata. La sua description recita "Init dev/stg/prod flavors... or audit and fix an existing broken/partial setup" — il turno #142 chiedeva esplicitamente "l'app ha già i flavor ma iOS è rotto", un match diretto con la clausola "audit and fix". Trigger-miss plausibile: la description potrebbe aver bisogno di una frase più esplicita su "iOS xcconfig/xcscheme rotto" per scattare in casi simili.

Una citazione senza turno + testo esatto della description non è una citazione valida — non proporla.

### Indice di memoria (solo con `--surface memory-index`)

**Misura** con shell o Node: righe e caratteri dell'indice, più le righe più lunghe. La lunghezza è un indizio, non il criterio.

**Criteri di potatura**, ognuno con la sua prova:

1. *Voce di issue chiusa*: la voce cita una issue chiusa (prova: `gh issue view <n> --json state`, sola lettura) e la nota non porta un apprendimento che sopravvive alla issue. Se lo porta, si riscrive come apprendimento.
2. *Riga con contenuto*: la riga d'indice riporta il fatto invece della condizione per leggere la nota. Si riscrive come puntatore più gancio.
3. *Raggiungibilità*: una voce tolta dall'indice resta su disco solo se nome file o `description` contengono i termini che un Glob/Grep sulla directory di memoria troverebbe. Altrimenti si tiene la voce o si rinomina la nota.

**Controllo dei puntatori**: ogni link dell'indice si risolve in un file esistente; ogni file della directory (indice escluso) o è indicizzato o è dichiarato orfano.

**Rimisura**: la sessione che pota vede ancora le istruzioni caricate all'avvio, quindi il prima/dopo del report è misurato su disco. La conferma sul totale caricato arriva da `retro` in una **sessione nuova** (riga `global agents.md`).

La potatura è un **lotto**: una sola proposta, mai applicata senza ok (vedi «Persistenza»).

## Persistenza

Non creare memoria sostitutiva se manca una destinazione nativa autorizzata. Le modifiche a `AGENTS.md` e `.codex/config.toml` restano proposte finche non autorizzate.

| Destinazione | Quando | Chi approva |
|---|---|---|
| Memoria nativa autorizzata; apprendimenti nel report se assente | Fatto degno di nota ma non abbastanza strutturale da meritare una proposta di config | Solo se consentito dall'host e dalle autorizzazioni correnti |
| Config del progetto target (`CLAUDE.md` / `.claude/settings.json` / hooks / `agents/`) | Convenzione permanente da correggere, o superficie che questo audit ha segnalato come rotta/stale | Proposta — aspetta l'ok |
| Automation spec (skill / hook / slash command / subagent) | Pattern ripetuto che dovrebbe diventare automazione riutilizzabile | Proposta — aspetta l'ok |
| Issue cross-repo su `iamantoniodinuzzo/flutter-toolkit` | L'attrito risale a una skill del toolkit stesso, non al progetto target | Proposta — aspetta l'ok |
| Lotto su una superficie (potatura dell'indice di memoria) | Modifica coordinata di più voci, valutata come un'unica decisione | Proposta — aspetta l'ok, anche con memoria nativa autorizzata |

**Issue cross-repo**: `gh issue create --repo iamantoniodinuzzo/flutter-toolkit`, con `--repo` **sempre esplicito** — mai dedotto dal `git remote` locale (che punta al progetto target). `retro` di solito intercetta prima l'attrito legato al toolkit (gira ad ogni fine task), ma questo non è esclusivo: `tune-setup` può produrre la stessa destinazione in autonomia, sulla propria evidenza — in particolare dal trigger-miss — perché non esiste canale di handoff tra le due skill.

Cap: **max 5 proposte** in "Proposed" — indipendente dal cap di 3 di `retro` (pool separati, per skill produttrice, non per tipo di destinazione: una issue cross-repo trovata da `retro` conta nel cap di `retro`, la stessa trovata da `tune-setup` conta nel suo). Default pensato come "una per superficie auditata", regolabile se un audit reale lo smentisce. Un lotto conta **una** proposta, per quante voci tocchi.

## Report finale

```
Applied — solo con memoria nativa autorizzata
1. [knowledge] <fatto> → memoria nativa: <destinazione>

Reported — se la memoria non è disponibile
1. [knowledge] <apprendimento conservato nel report>

Proposed — aspetto il tuo ok
2. [config] <superficie, con evidenza da Passo 0/1> → config progetto: <cosa>

No action
3. <superficie> — nessun finding, verificato

Lotto — <superficie>: proposto | applicato
  prima: <N> righe, <C> car. · dopo: <N'> righe, <C'> car.
  tolte/riscritte: <n> (issue chiuse: a · righe con contenuto: b) — elenco
  puntatori: <k>/<k> si risolvono · orfani: <nessuno | elenco>
  rimisura: retro in una sessione nuova (riga global agents.md)
```

Categorie: `batch` (modifica coordinata di più voci di una superficie, un'unica proposta) · `config` (CLAUDE.md/settings/hooks/agents da correggere) · `automation` (pattern ripetuto che potrebbe diventare skill/hook/slash command/subagent) · `friction` (segnale da `toolDenialKind`/`hook_cancelled`) · `knowledge` (fatto utile ma non abbastanza strutturale per una proposta di config).

`toolDenialKind`: solo `user-rejected` conta come attrito reale, quotato con `userFeedback` quando presente. `permission-rule` e `automode-blocked` vanno riportati separatamente, come conferma che i guardrail configurati funzionano — non come attrito, non vanno mescolati con `user-rejected`. Ogni altro valore (es. `automode-unavailable`) è un guasto transitorio del classificatore: riga neutra «guasto transitorio, né attrito né guardrail», mai una proposta.

## Anti-patterns

- Proposta di config senza evento verificabile citato (Passo 0 o Passo 1).
- Trigger-miss senza citazione del turno esatto + testo della description.
- Confondere `permission-rule`/`automode-blocked` (guardrail che funziona) con `user-rejected` (attrito reale).
- Trattare `automode-unavailable` (o un valore non noto) come `automode-blocked`: è un guasto transitorio, non un guardrail.
- Scrivere in `CLAUDE.md`, `.claude/settings.json`, un hook, `agents/`, o aprire una issue cross-repo senza ok esplicito.
- Dichiarare una superficie "pulita" senza averla effettivamente controllata in Passo 0/1.
- Superare il cap di 5 proposte "Proposed" in un singolo report.
- Applicare un lotto senza ok esplicito, anche con memoria nativa autorizzata.
- Dichiarare «ridotto» citando il totale visto dal transcript della sessione che pota: la misura è su disco, la conferma è di `retro` in una sessione nuova.
- Togliere una voce dall'indice senza il controllo di raggiungibilità.
- Chiedere evidenze del transcript per un trigger di dimensione.
