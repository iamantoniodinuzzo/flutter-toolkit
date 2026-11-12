---
name: retro
description: "End-of-task retrospective. Gathers verifiable evidence from the session transcript, answers six hard self-audit questions (least confident, what user is missing, most likely 3-month failure, unstated assumptions, smoother session, what worked well — backed by that evidence), turns recurring patterns and cross-session repeated instructions into standardization proposals, auto-persists reusable learnings to memory, flags unintegrated work, reads transcript-only environment signals to propose environment fixes, and proposes concrete fixes. Use when the user says \"/retro\", \"retrospettiva\", \"cosa mi sfugge\", \"self-audit\", after completing a significant deliverable (plan, milestone, feature, migration), at the end of `issue-dev` after merge, or before the session's context is about to be compacted."
user-invocable: true
---

# Retro — self-audit di fine task

## Runtime and resources

Use the current agent's native file, search, shell, and question tools; plain-text questions and direct sequential scans are valid fallbacks. Subagents are optional and require host permission. Bundled paths below are relative to this installed skill directory; application paths are relative to the target Flutter project. Resolve sibling skills through the installed skill registry (or sibling directories), never by assuming a `skills/` folder in the application. If a required dependency is absent, name it and report the affected step as unavailable; never invent its rules or claim complete coverage.

Answer in the conversation language. Be honest, specific, non-defensive. No praise, no filler. Every point must name a concrete artifact (file, issue, decision) from THIS session — no generic advice.

## Quando lanciarla

- A fine sessione, **prima** che il contesto venga compattato — dopo la compattazione Q5 lavora su un riassunto lossy invece che sui fatti.
- A fine `issue-dev`, dopo il merge in `develop`.
- Su richiesta esplicita ("/retro", "retrospettiva", "cosa mi sfugge", "self-audit").

Se la sessione è **già stata compattata** quando parte la retro: dichiaralo apertamente nella risposta e limita Q5 a ciò che il Passo 0 conferma dal transcript — non riempire con ricordi plausibili del riassunto.

Se l'utente indica una **sessione diversa dalla corrente**: lancia il Passo 0 con `--session <id>` e lavora solo sulle evidenze — Passo 0 (con `diff:`), Q5, blocco `Ambiente` e Ship handoff. Q1, Q2, Q3, Q4 e Q6 si dichiarano «non applicabile: richiedono la memoria del lavoro». Più sessioni insieme: fuori scope.

## Compatibilita della sessione

Passa `--agent claude` o `--agent codex` in base all'agente corrente; `--agent auto` riconosce transcript espliciti e identificativi disponibili. Codex usa `CODEX_HOME/sessions` (default `~/.codex/sessions`) e i metadati `session_meta.cwd` / `session_meta.id`; `CODEX_THREAD_ID` identifica la sessione quando presente. Se la selezione e ambigua, usa `--session <id>` o `--transcript <path>` senza indovinare. Non usare sessioni di altri progetti come prova del lavoro corrente.

Se manca Node.js, un transcript accessibile o un formato riconosciuto, usa solo le evidenze della conversazione e dichiara i controlli non verificati. Record malformati, strumenti non riconosciuti e dati obsoleti producono evidenza parziale o non verificata, mai una sessione certificata pulita.

## Passo 0 — Raccogli evidenze

Prima delle sei domande, esegui:

```bash
node "<base directory di questa skill>/scripts/session-evidence.js" --agent <claude|codex>
```

Usa il percorso **assoluto** (la base directory è mostrata quando la skill viene caricata): funziona da qualsiasi cwd, nessun `cd`. In alternativa i wrapper `scripts/session-evidence.sh` / `.ps1`, sempre col percorso risolto.

Legge il transcript `.jsonl` della sessione corrente (e `subagents/` solo per edit riusciti e rifiuti) ed estrae, in forma aggregata e contando per `id` del `tool_use`: tool call falliti (per tool, con il comando eseguito e la riga d'errore — citabili), comandi shell identici eseguiti più di una volta, file rieditati più di due volte (ultimi due segmenti di path), più quattro blocchi:

- `diff:` — un diff per branch di sessione, ognuno con uno stato: **ATTRIBUITO** (il diff git coincide con gli edit del transcript, o commit della sessione), **PARZIALE** (anche file non spiegati dal transcript), **NON ATTRIBUIBILE** (diff non vuoto ma non della sessione), **NESSUNA MODIFICA**, **NON RICAVABILE** (git non può rispondere: usa i soli path del transcript, etichettati parziali, e non scrivere mai «nessuna modifica»). La riga `rifiuti:` in coda conta i `toolDenialKind`, subagent inclusi.
- `attribuiti ad ambiente: N` — chiamate già reclamate dal blocco `Ambiente` (la riga manca se N = 0): citale una volta sola, sotto `Ambiente`, e non ricontarle in Q5.
- `ambiente:` — i segnali accesi, con livello di severità (vedi «Ambiente»). Su Codex dice «non valutato», che non equivale a «nessun segnale».
- `standardizzazione:` — le chiamate `Skill` del modello in questa sessione (esito, `args identici xN`) e `repeated user instructions:`, le istruzioni dell'utente scritte in almeno `USER_REPEAT_MIN_SESSIONS` sessioni distinte della **stessa project dir** (mai di altri progetti). La riga `ripetute in sessione:` è evidenza per Q5: una ripetizione nella stessa sessione di solito significa che l'agente ha ignorato la prima richiesta. Su Codex o senza transcript precedenti dice «non valutato», che non equivale a «nessuna ripetizione».

Selezione del transcript, in ordine: `--transcript <path>`, `--session <id>`, variabile d'ambiente `CLAUDE_CODE_SESSION_ID` (esatta, indipendente dal cwd), poi l'euristica "più recente per mtime" sullo slug del cwd (con match a slug canonico se la directory derivata non esiste, ref #69). La riga `selected by:` dell'header dice quale ha deciso.

Solo l'euristica può sbagliare sessione, e dipende dal cwd: va lanciata dalla **working directory primaria della sessione** (nel blocco environment a inizio sessione). In un monorepo Melos c'è una project dir per app (`<slug>-apps-<app>`), quindi dal root si legge un'altra directory. Se l'ultimo evento del transcript scelto è più vecchio di `RETRO_STALE_HOURS` (default 6) l'output stampa `WARNING`, più l'elenco dei candidati (`--list` lo stampa sempre); rilancia con `--session <id>`.

**Sanity check prima di Q1** — l'header deve mostrare `selected by: session id`, oppure un ultimo evento recente e un numero di eventi plausibile per questa conversazione. Altrimenti rilancia con `--session`/`--transcript` e dichiaralo nel report.

Se non trova un transcript (nessuna directory, sessione non tracciata) stampa una riga sola ed esce con successo; se trova un transcript **stantio o di un'altra sessione** (`WARNING`, età incoerente, conteggio eventi implausibile) l'output sembra valido ma non lo è. In entrambi i casi **non è prova di una sessione pulita** ("0 errori, 0 ripetizioni" su un transcript sbagliato non significa nulla): dichiara nel report che non hai potuto verificare, non presentare il silenzio come "nessun problema".

Esegui poi:

```bash
git status --porcelain && git branch --show-current
```

`diff:` risponde a «cosa è cambiato in questa sessione»; questo a «cosa non è integrato adesso» e alimenta l'handoff finale (sotto), non le domande.

## Le sei domande

Q1, Q2 e Q4 si ancorano ai file del `diff:` con stato ATTRIBUITO/PARZIALE; con ogni altro stato si ancorano ai soli edit del transcript e il report lo dichiara in una riga. Con `attribuiti ad ambiente: N` e N > 0 Q5 rimanda al blocco `Ambiente`: nessuna voce propria, nessuna «sessione pulita».

Answer all six, in this order, as separate sections:

1. **Least confident** — Which parts of what I just produced am I least sure about? Rank top 2-3. For each: what exactly is uncertain, what would verify it (a grep, a doc, a test), and verify it NOW if it costs < 2 minutes.
2. **What the user is missing** — The biggest thing they don't realize about the current situation. Structural gaps, not details: missing artifacts, implicit contracts, things that live only in this conversation and will be lost.
3. **Most likely 3-month failure** — If this work breaks in 3 months, the single most probable cause. Pick ONE primary candidate with the failure mechanism spelled out, plus a runner-up. Name the cheapest mitigation.
   **Azione (Q2, Q3)**: ogni voce di Q2 e Q3 chiude con una riga `Azione:` che vale `issue` · `test` · `doc` · `memoria` · `nessuna (<motivo>)`. `issue` porta una bozza di due righe (titolo; che cosa deve essere vero a lavoro finito) e va in `Issue da aprire`; `test` e `doc` nominano il file; `memoria` rimanda alla voce `Applied`/`Reported`. In Q3 la mitigazione più economica è l'azione della voce. `nessuna (<motivo>)` è un valore valido: scegli l'azione che il fatto richiede, non una per riempire il campo.

4. **Unstated assumptions** — Decisions I made silently: scale, locale, edge-case behavior, ordering, naming. List each as "assumed X, never asked".
5. **Smoother session** — Cite concrete events from the Passo 0 output: a specific failed tool call, a command run twice, a file rewritten repeatedly, something the user had to ask for a second time. No entry without a matching event. If Passo 0 found genuinely nothing (0 errors, 0 repeats) and you have no other verifiable friction, say so plainly instead of inventing a "could have been smoother" — that is itself a valid answer, not a hedge.
6. **What worked well** — Name one concrete pattern from this session worth repeating: a skill invocation that paid off, a sequence that avoided rework, a decision that held up under later pressure. Must name a specific artifact (skill name, tool sequence, file, commit) — no generic praise ("things went smoothly"). If nothing genuinely stands out, say so plainly instead of manufacturing a compliment — same standard Q5 already applies to its negative case.

   **Da Q6 a proposta**: al massimo una, tag `[automation]` o `[knowledge]` con marcatore `(da Q6)`, livello strutturale, dentro il cap. Serve una prova: una skill chiamata con `args identici` almeno `SKILL_ARGS_REPEAT_MIN` volte e senza errori nel blocco `standardizzazione:`, oppure lo stesso pattern già in `MEMORY.md`. Una skill esiste già: la proposta riguarda *come* viene invocata (→ slash command), non la skill. Senza prova Q6 resta una riflessione.

## Ambiente

`ambiente:` con almeno un segnale acceso → leggi `references/environment-lens.md` (segnali, esempi Flutter-aware, repo di atterraggio) prima di scrivere il blocco; senza segnali o con «non valutato», non leggerlo.

Blocco dopo Q6, senza Q7+, di sole evidenze: una riga per ogni categoria accesa nell'`ambiente:` del Passo 0. Scrivi «ambiente: nessun segnale» solo se lo script lo stampa, «ambiente: non valutato» se la riga manca o lo dice (Codex, transcript assente).

**Invariante: la prova è sempre un evento del transcript. `retro` non legge mai un file di configurazione** (`CLAUDE.md`, `settings`, hook, `agents/`). Giudicare il contenuto di quei file è il lavoro di `tune-setup`, su richiesta esplicita. Un guasto transitorio (`automode-unavailable`, o un `toolDenialKind` non noto) resta un numero nella riga `rifiuti:`, mai una proposta.

Ogni proposta porta un livello di severità, in questo ordine (spareggio: più eventi del transcript a sostegno, poi meno righe di prova):

| Livello | Prova misurabile nel transcript |
|---|---|
| bloccante | accesso o permesso negato che ha fermato l'agente |
| costoso | una chiamata o una riga di contesto sopra soglia, o ripetuta |
| attrito | ricerca a vuoto, check fallito, Read su path inesistente |
| strutturale | proprietà costante misurata nel transcript (es. dimensione delle istruzioni caricate) |

La tabella vale per **tutte** le proposte, anche dei tag non ambiente.

## Domanda di chiusura

Dopo Q6 e il blocco `Ambiente`, poniti alla lettera, in inglese: «Is there anything else substantial that is worth saving for later from the context of this session?» (formulazione da un post di r/ClaudeCode, <https://www.reddit.com/r/ClaudeCode/comments/1xjfize/one_question_i_ask_my_coding_agent_before_closing.json>; attribuzione non verificata, la pagina risponde 403 ai client automatici).

Rispondi nella lingua della conversazione, solo con ciò che non sta già in `Applied`, `Reported`, `Proposed` o in un'`Azione:` di Q2/Q3. Ogni voce va in una destinazione di «Persistenza». Il passo è chiuso quando ogni voce ha una destinazione, oppure c'è la riga «nulla da aggiungere».

## Ship handoff

Dal blocco `diff:` e dall'output di `git status`/branch del Passo 0, con git in sola lettura:

- Ogni branch ATTRIBUITO o PARZIALE non integrato → **finding**: `lavoro non integrato: <branch> (+N commit, pushato sì/no)` — usa `git-workflow` / `issue-dev` per commit, merge, chiusura issue. «Integrato» = commit contenuti in `develop` se esiste, altrimenti in `main`/`master` (non `origin/HEAD`: in git-flow punta al ramo di release); modifiche non committate non sono integrate (`+0 commit`).
- Finding solo per ATTRIBUITO/PARZIALE. NON ATTRIBUIBILE e NON RICAVABILE: nessun finding, una riga neutra («non valutabile»). HEAD corrente fuori dai branch della sessione: riga neutra «non della sessione, non valutato».
- Working tree sporco: finding solo per i file presenti anche negli edit della sessione, gli altri in una riga di riepilogo.
- Nessuna esenzione per nome di branch (`research/*` inclusi): se la sessione ci ha lavorato e il lavoro non è integrato, il finding scatta; decide l'utente se scartarlo.
- Retro non committa, non pusha, non fa merge.

## Persistenza

Le configurazioni del progetto includono `AGENTS.md` e `.codex/config.toml` per Codex; le relative modifiche restano proposte finche non autorizzate.

Proposta che tocca `AGENTS.md`, `CLAUDE.md` o il testo di una skill, nuova o esistente → leggi `references/writing-for-agents.md` prima di scriverla.

Route each learning to exactly one destination:

| Destinazione | Quando | Chi approva |
|---|---|---|
| Memoria nativa autorizzata; apprendimenti nel report se assente | Default. Serve *a volte*, dipende dal contesto della sessione (pattern scoperto, gotcha, preferenza) | Solo se consentito dall'host e dalle autorizzazioni correnti |
| Config del progetto target (`CLAUDE.md` / `.claude/settings.json` / hooks / `agents/`) | Convenzione permanente che deve guidare *ogni* sessione futura su questo repo | Proposta — aspetta l'ok |
| Automation spec (skill / hook / slash command / subagent) | Pattern ripetuto che dovrebbe diventare automazione riutilizzabile | Proposta — aspetta l'ok |
| Issue cross-repo su `iamantoniodinuzzo/flutter-toolkit` | L'attrito risale a una skill del toolkit stesso, non al progetto target | Proposta — aspetta l'ok |
| Issue nel repo del progetto | Lavoro sul deliverable scoperto da Q2, Q3 o dalla domanda di chiusura | Proposta — aspetta l'ok |

`.claude/rules/` con frontmatter `paths:` **non** è una destinazione a basso costo: viene caricato all'avvio indipendentemente dallo scoping ([claude-code#16299](https://github.com/anthropics/claude-code/issues/16299)), quindi non risparmia contesto rispetto a `CLAUDE.md`. Non instradarci nulla per motivi di token.

**Issue cross-repo**: `gh issue create --repo iamantoniodinuzzo/flutter-toolkit`, con `--repo` **sempre esplicito** — non va mai dedotto dal `git remote` locale, che punta al progetto target, non al toolkit. Sempre "Proposta — aspetta l'ok": aprire una issue pubblica su un altro repo non è mai un default silenzioso. `tune-setup` può produrre la stessa destinazione in modo indipendente, sulla propria evidenza — non c'è canale di handoff tra le due skill.

**Prima di scrivere nella memoria nativa:**
Usa solo una destinazione offerta dall'agente e autorizzata. Se assente, lascia gli apprendimenti nel report; non creare `MEMORY.md` o altri sostituti. I passi seguenti su `MEMORY.md` si applicano solo alla memoria Claude quando presente.
1. Leggi `MEMORY.md`. Se una voce esistente copre già il fatto, **aggiorna quel file** (segui il formato già in uso lì — spesso più fatti correlati nello stesso file, separati da `---`) invece di crearne uno nuovo.
2. Se l'indice è cresciuto e più voci coprono lo stesso tema, consolidale in una.
3. Nessun cap numerico rigido — la cifra "solo le prime 200 righe si caricano" circola su Reddit ma non è verificata in questo ambiente; non progettare intorno a un numero che non hai controllato.

**Issue nel repo del progetto**: retro presenta titolo e bozza e non esegue `gh issue create`; non legge nemmeno i template di issue del progetto (invariante di «Ambiente»). La crea l'utente o la sua skill di issue. Non è la issue cross-repo: quella riguarda l'attrito di una skill del toolkit.

Le proposte per config del progetto, automation spec, issue cross-repo o issue nel repo del progetto restano **proposte**: presentale, non applicarle senza ok esplicito. Le proposte `environment` non sono mai «Applied» e dichiarano il repo di atterraggio (`repo: da confermare` se il transcript non lo dice).

Per un audit più ampio della configurazione (CLAUDE.md, settings, hooks, agents/, skill-trigger-miss), fuori dal perimetro di questa skill: esegui `tune-setup` — su richiesta esplicita, non da qui.

## Report finale

```
Applied — solo con memoria nativa autorizzata
1. [knowledge] <fatto> → memoria nativa: <destinazione>

Reported — se la memoria non è disponibile
1. [knowledge] <apprendimento conservato nel report>

Proposed — aspetto il tuo ok (ordinate per severità: bloccante, costoso, attrito, strutturale)
2. [automation] [strutturale] <pattern ripetuto, con conteggio da Passo 0> → skill spec: <nome>
3. [environment: tool-economy] [costoso] <evidenza dal blocco Ambiente> → config progetto: <cosa> (repo: <dove atterra | da confermare>)

Issue da aprire — aspetto il tuo ok (max 3, fuori dal cap di Proposed)
4. [issue] <titolo> — <che cosa deve essere vero a lavoro finito> (da Q3 | da Q2 | da chiusura)

No action
5. [friction] <cosa> — già coperto da <dove>
6. [environment: navigation] <proposta oltre il cap> — oltre il cap di 3
7. [issue] <titolo> — oltre il cap di 3 issue
```

Ogni voce di Q2 e Q3 nel report porta `Azione: issue → Issue da aprire n | test: <file> | doc: <file> | memoria → Applied n | nessuna (<motivo>)`.

Categorie: `skill gap` (l'agente ha sbagliato o ha impiegato più tentativi) · `friction` (passo manuale ripetuto, cosa chiesta esplicitamente che doveva essere automatica) · `knowledge` (fatto su progetto/preferenze che l'agente non sapeva) · `automation` (pattern ripetuto che potrebbe diventare skill/hook/slash command/subagent — include esplicitamente: istruzioni ripetute che potrebbero diventare uno slash command, un workflow che dovrebbe diventare una skill o un subagent dedicato; instradamento: istruzione in `repeated user instructions:` o skill con `args identici` → slash command · workflow ripetuto → skill · competenza di dominio ricorrente → subagent · convenzione di progetto → `[knowledge]` verso config progetto; solo il primo ha un contatore, gli altri richiedono una voce già in `MEMORY.md` più l'evento di sessione) · `environment` (solo con prova dal blocco `Ambiente`, sottocategoria tra parentesi: `tool-economy`, `navigation`, `automated-checks`, `information-access`, `global-agents-md`).

Cap unico: **max 3 proposte** in "Proposed", ambiente incluso: restano le 3 di severità maggiore, le altre vanno in `No action` con il motivo. Un `automation` senza costo misurato è «strutturale». Più segnali che portano a una sola proposta contano una voce. Le scritture autorizzate "Applied" nella memoria nativa non contano nel cap — sono già fatte, non richiedono slot di attenzione dell'utente.

Le bozze `issue` hanno un pool proprio: **max 3** in `Issue da aprire`, nell'ordine di provenienza Q3, Q2, chiusura; le altre vanno in `No action` con il motivo. Il pool non consuma slot del cap di `Proposed` e viceversa.

Un fatto compare **una sola volta** nel report: un punto già in `Proposed`, `Applied` o `Reported` non diventa anche bozza di issue, e la domanda di chiusura non ripete nulla di quanto sta nelle `Azione:` di Q2/Q3. Come proposta vince `Ambiente`: Q1 può nominarlo (verificarlo ora non è una proposta), Q5 tiene solo il comportamento dell'agente. Un'istruzione che è sia in `ripetute in sessione:` sia in `repeated user instructions:` è la proposta `automation`: Q5 non la riconta.

## Anti-patterns

- Hedged non-answers ("everything seems fine") — there is ALWAYS a weakest point.
- Listing 10 shallow risks instead of 2 deep ones.
- Generic advice detached from session artifacts.
- **Inventare un fallimento per Q5 che non compare nell'output di Passo 0.**
- **Scrivere in `CLAUDE.md`, `.claude/rules/`, creare una skill, o aprire una issue (cross-repo o nel repo del progetto) senza ok esplicito.**
- **Inventare un'azione per riempire `Azione:`**: `nessuna (<motivo>)` è un valore valido.
- **Duplicare una voce di memoria che esiste già invece di aggiornarla.**
- **Dichiarare "nulla da migliorare" quando Passo 0 ha trovato errori o ripetizioni non ancora spiegati.**
- **Leggere un file di configurazione del progetto per costruire una proposta ambiente** (è il lavoro di `tune-setup`).
- **Proposta ambiente senza un evento del transcript** che la provi, o con un repo di atterraggio assunto invece che dichiarato.
- **Riproporre come `friction` o `skill gap` un fatto già nel blocco `Ambiente`.**
- **Una proposta da Q6 senza prova** (`args identici`, istruzione ripetuta tra sessioni, o voce in `MEMORY.md`), o uno slash command proposto per una ripetizione avvenuta in una sola sessione.
- Fixing things during the retro without authorization. Native memory writes also follow host permissions; unavailable memory means report-only learnings.
