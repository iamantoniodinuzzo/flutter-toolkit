# Lente ambiente — segnali, esempi Flutter-aware, repo di atterraggio

Ogni proposta parte da una riga di quel blocco (strumento ed estratto compresi) e da nessun'altra fonte: **nessuna lettura di file di configurazione** (ADR 0011).

Le soglie sono costanti in `scripts/retro-lens.js`; qui compaiono per nome, mai per valore.

## Segnali

| Segnale | Si accende quando | Livello | Proposta tipica |
|---|---|---|---|
| information access | `__authenticate`, comando non trovato, o un rifiuto `permission-rule` / `automode-blocked` (subagent inclusi) | bloccante | configurare l'accesso, il PATH o il permesso che ha fermato l'agente |
| tool economy | un `tool_result` sopra `TOOL_RESULT_CHARS`, una troncatura del runtime, o una rilettura senza Edit riuscito in mezzo | costoso | ridurre ciò che entra nel contesto: lettura con `offset`/`limit`, comando con output ristretto |
| automated checks | sorgenti modificati e (nessun check, o file toccati dopo l'ultimo check, o almeno `CHECK_FAILED_MIN` check falliti) | attrito | far girare il check dopo l'edit, non a fine sessione |
| navigation | almeno `NAV_EMPTY_SEARCHES` ricerche a vuoto, oppure almeno `NAV_READ_MISSES` Read su path inesistente | attrito | un puntatore di contesto che dica dove vive ciò che l'agente ha cercato a vuoto |
| global agents.md | totale delle istruzioni caricate ≥ `AGENTS_MD_TOTAL_CHARS` | strutturale | handoff a `tune-setup` con il comando stampato nella riga (`--surface memory-index` se il file più grande è la memoria nativa, altrimenti `--surface istruzioni`) e l'elenco file/dimensioni (`AGENTS_MD_LIST_MAX` file al massimo); `retro` non legge i file e non giudica il contenuto |

Il tetto di righe del blocco (evidenze, non proposte) è `AMBIENTE_LINE_CAP`: se il blocco è troncato, le righe omesse non sono «nessun segnale». La sottocategoria del tag `environment` è il nome del segnale con i trattini (`information-access`, `global-agents-md`).

**Rifiuti `permission-rule` / `automode-blocked`**: propongono qualcosa solo se il transcript mostra l'agente fermarsi, abbandonare o aggirare il passo. Senza abbandono né aggiramento sono un guardrail che funziona (vedi `tune-setup`): riga neutra, nessuna proposta, mai «allenta il permesso».

`automode-unavailable` e ogni `toolDenialKind` non noto sono guasti transitori lato server: nessuna modifica all'ambiente li evita, quindi non accendono information access e non generano proposte. `user-rejected` è già attrito (ADR 0008), non un segnale ambiente.

## Falsi positivi già filtrati dallo script

Non riaprirli a mano: un comando conta come check solo in posizione di comando (mai dentro un `--body` o un argomento), un edit è «di sorgente» solo sotto il cwd della sessione, una rilettura dopo un Edit riuscito non conta. Uno script del progetto (lanciato direttamente o via `pwsh`/`bash`/`node`/…) conta come check se il nome del file contiene la parola intera `test`, `analyze`, `format`, `lint` o `check`: «nessun check eseguito» non vale per i wrapper. Se una riga ti sembra comunque sbagliata, citala come dubbia invece di proporre.

## Flutter-aware, con fallback generico

Lo stack è rilevato dal solo transcript (`stack: flutter` nell'header del blocco): edit `.dart`, comandi `flutter`/`dart`/`melos`, invocazioni di `riverpod-reviewer` e `audit-*`. Con `stack: generico` nomina solo gli strumenti che il transcript mostra; non suggerirne altri.

| Segnale | Con `stack: flutter` | Con `stack: generico` |
|---|---|---|
| automated checks | `dart analyze` o `flutter analyze` dopo gli edit `.dart`; per un feature folder la skill `flutter-analyze-targeted` | il comando di check visto nel transcript, o «un check» senza nome |
| tool economy | se il risultato grande è un file generato (`*.g.dart`, `*.freezed.dart`) o l'output di un `flutter test` completo: restringere al target | restringere al target che il transcript mostra |
| navigation | puntatore su dove vive la feature cercata a vuoto (cartella `lib/features/...`) | puntatore al path che la ricerca non ha trovato |

## Repo di atterraggio

Ogni proposta dichiara `repo:`, derivato dalla prova, mai da un default:

- prova sotto il cwd della sessione (edit, comandi, rifiuti) → il repo di quel cwd;
- l'attrito risale a una skill del toolkit → `iamantoniodinuzzo/flutter-toolkit`, issue cross-repo con `--repo` esplicito (tabella di Persistenza);
- accesso o permesso a livello utente (MCP non autenticato, comando assente sulla macchina) → configurazione utente, non un repo;
- il transcript non lo dice → `repo: da confermare`.
