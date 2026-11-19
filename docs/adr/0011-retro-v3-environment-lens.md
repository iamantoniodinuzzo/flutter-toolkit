# 0011 — retro v3: la lente ambiente vive in `retro`, il confine con `tune-setup` è evento contro file

## Status

Accepted (wayfinder ticket #81, map #78). Supera in parte [0006](0006-retro-v2-skill-shape.md):
solo la decisione 1. Amended by [ADR 0015](0015-retro-proposal-shape-and-agents-md-handoff.md): the
`global agents.md` signal now prints an explicit handoff to `tune-setup`; the invariant has no exception.

## Context

La mappa #78 porta in `retro` le categorie di miglioramento dell'ambiente dell'agente (Tool
economy, Navigation, Automated checks, Information access, Global AGENTS.md), ciascuna attivata
solo da un'evidenza verificabile nel transcript (ticket #79). L'ADR 0006 aveva deciso il
contrario: `retro` «resta esattamente com'è» e tutto ciò che è config-shaped va in `tune-setup`,
con due gambe indipendenti: la cadenza (ogni fine task contro on-demand) e il costo misurato
(~4.160 token contro `OUTPUT_LINE_CAP`).

Il costo misurato in 0006 era la **lettura dei file di configurazione** (`CLAUDE.md`,
`settings`, `agents/`): 440 righe. Le categorie ambiente di #79 non leggono nessun file: si
ricavano dal solo transcript, 1-3 righe l'una, con segnali accesi solo quando scattano. Hanno
una classe di costo diversa, e questo rende superabile la gamba del costo di 0006. Restano
due sovrapposizioni parziali con `tune-setup` (Global AGENTS.md e `toolDenialKind`) da
regolare.

## Decision

**1. Criterio del confine: evento contro file.**

- `retro` parte da **eventi del transcript** della sessione. Propone modifiche all'ambiente
  (anche a `CLAUDE.md`, impostazioni, hook), ma la prova è sempre un evento della sessione.
- `tune-setup` parte dai **file di configurazione**, letti con `Read` e giudicati. Il
  transcript è per lei solo l'ancora strutturale (hook ripetuti, `hook_cancelled`,
  skill-trigger-miss).

**2. Invariante: `retro` non legge mai i file di configurazione del progetto.** È ciò che tiene
`retro` nella sua classe di costo e rende falsa la lettura «la lente ambiente fa crescere `retro`
fino al costo di `tune-setup`». Chi ha bisogno di leggere un file di configurazione usa
`tune-setup`.

**3. `Global AGENTS.md`: flag strutturale in `retro`, giudizio in `tune-setup`.** `retro`
emette solo la riga ricavata dal transcript (attachment `instructions.files[]` /
`world_state.state.agents_md`): dimensione relativa dei file caricati e righe duplicate tra file
di steering. La critica del contenuto (stale, contraddittorio) resta alla superficie 1 di
`tune-setup`. Nessun dato passa da una skill all'altra; `retro` può solo nominare `tune-setup`
nel report, come già permesso da 0006 (decisione 5).

**4. `Information access` e `toolDenialKind`: stesso evento, due letture, nessun dedup.** `retro`
lo usa come causa di quella sessione (una riga: tool negato, `userFeedback` quotato).
`tune-setup` lo usa come lettura di salute dei permessi (`user-rejected` contro i guardrail che
funzionano, ADR 0008 decisione 5). Poiché l'utente decide quando lanciare `tune-setup`, la
sovrapposizione parziale tra i due report è accettabile.

**5. `tune-setup` resta invariata nel perimetro.** Cinque superfici, cap di 5, `--config-audit`,
tutto com'è. Cambiano solo due testi: la motivazione in «Quando lanciarla» (oggi dice che esiste
separata «invece di crescere» dentro `retro` per costo e cadenza: va riscritta col criterio di
questa decisione 1) e la superficie 1, che dichiara che il giudizio sul contenuto è suo anche
quando `retro` ha già segnalato il file. Lo «snellire» di `tune-setup` si chiude con «no»; si
riapre solo se un audit reale mostra ridondanza.

## Decisioni di 0006 che restano valide

La 2 (cadenza on-demand di `tune-setup`), la 3 (`automation` assorbita da `retro`), la 4 (confine
di repo a `retro`, raffinata da 0009), la 5 (nessun handoff) e la 6 (multi-transcript rinviato).
Solo la decisione 1 («`retro` resta esattamente com'è») e il ragionamento sul costo che la
sostiene sono superati.

## Consequences

- **#82** (tassonomia, persistenza, cap) sa che `retro` ha un blocco ambiente con cap proprio e
  che la sua prova è sempre un evento. Il cap di `retro` per le proposte (3, ADR 0009) e la sua
  interazione con il blocco ambiente sono decisione di #82, non di questo ADR.
- **#83** (struttura della skill) sa che `retro` ha ora un invariante in più da dichiarare
  (nessuna lettura dei file di configurazione) e un rinvio a `tune-setup` per il giudizio sui
  file.
- **#85** (build): `skills/tune-setup/SKILL.md` riceve solo i due ritocchi di testo della
  decisione 5; `skills/retro/SKILL.md` e `session-evidence.js` ricevono il lavoro delle altre
  decisioni della mappa. Nessun file è toccato da questo ADR oltre allo stato di 0006.
- Chi legge 0006 da solo viene indirizzato qui dalla riga di stato.

## Nota del 2026-11-03 — allineamento alle decisioni successive

Le decisioni sopra restano come scritte; queste note correggono ciò che i ticket successivi della mappa #78 hanno precisato.

- **Decisione 3 (Global AGENTS.md):** la «dimensione relativa» e le «righe duplicate» sono superate dal ticket #90. Il flag è un totale assoluto: la riga `global agents.md [strutturale]` si accende quando il totale delle istruzioni caricate raggiunge `AGENTS_MD_TOTAL_CHARS` (in `retro-lens.js`). La forma relativa è stata scartata perché non discrimina (la quota del file più grande è quasi costante). Le righe duplicate tra file di steering **non sono implementate**: nessuna soglia decisa, nessun segnale emesso.
- **Decisione 2 (invariante):** vale anche per questa riga. L'input è l'allegato `instructions` / `world_state.agents_md` del transcript, non la lettura di un file: il blocco `Ambiente` non legge file di configurazione.
- **Conseguenze:** i lavori citati come «#85 (build)» sono stati eseguiti nei ticket #95 (script), #96 (`SKILL.md`, reference, ritocchi a `tune-setup`) e #97 (documentazione), prima del rilascio in #85.
