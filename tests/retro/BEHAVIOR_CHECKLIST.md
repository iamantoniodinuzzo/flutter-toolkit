# retro v3 — checklist di comportamento (pre-rilascio)

Da eseguire **una volta prima di ogni rilascio che tocca `skills/retro/`**, su una fixture di sessione (un transcript reale ripulito o sintetico con segnali accesi, più uno senza segnali). Proprietà, non testo: nessun giudice LLM. Segna ogni riga `ok` / `KO`; un `KO` blocca il rilascio.

Ricorda: `skill-structure.test.js` copre ordine e cablaggio, questa lista copre ciò che solo una lettura del report può mostrare.

| # | Proprietà | Come si verifica | Esito |
|---|---|---|---|
| 1 | Il blocco `Ambiente` sta dopo Q6 e prima dell'handoff | ordine delle sezioni nel report | |
| 2 | Senza segnali il blocco è la sola riga «ambiente: nessun segnale» | fixture senza segnali | |
| 3 | Al massimo 3 proposte in `Proposed`, ambiente incluso; le altre in `No action` con motivo | fixture con più di 3 segnali | |
| 4 | Ogni proposta `environment` dichiara `repo:` (o `repo: da confermare`) | leggere le proposte | |
| 5 | Nessuna lettura di file di configurazione | transcript della retro: nessun `Read` su `CLAUDE.md`, `settings`, hook, `agents/` | |
| 6 | Proposte ordinate per severità: bloccante, costoso, attrito, strutturale | confronto con i tag `[livello]` | |
| 7 | Nessuna scrittura (memoria esclusa se autorizzata) senza ok esplicito | transcript della retro | |
| 8 | Q5 non dichiara «sessione pulita» se `attribuiti ad ambiente` è > 0 | fixture con N > 0 | |
| 9 | Un fatto compare una sola volta come proposta, sotto `Ambiente` | cercare lo stesso fatto come `friction` / `skill gap` | |
| 10 | Con `diff:` NON RICAVABILE o NON ATTRIBUIBILE il report non scrive «nessuna modifica» e non genera finding di handoff | fixture con repo assente | |
| 11 | Q6 produce una proposta `(da Q6)` solo con `args identici` o una voce già in `MEMORY.md`; senza prova resta una riflessione | fixture con una skill chiamata 2 volte con gli stessi args, poi una senza | |
| 12 | La proposta da Q6 è una sola, di livello strutturale, e rientra nel cap di 3 (scalzata → `No action` con motivo) | fixture con 3 segnali più gravi e una proposta da Q6 | |
| 13 | Uno slash command è proposto solo per `repeated user instructions:` (≥2 sessioni); una voce solo in `ripetute in sessione:` resta attrito di Q5 | fixture con la stessa istruzione ripetuta in una sessione sola | |
| 14 | Ogni voce di Q2 e Q3 chiude con `Azione:` (`issue`, `test`, `doc`, `memoria` o `nessuna (motivo)`); nessuna azione inventata | fixture con un fatto senza azione sensata | |
| 15 | Al massimo 3 bozze in `Issue da aprire`, pool separato da `Proposed` (le eccedenti in `No action`) | fixture con più di 3 voci `issue` e 3 proposte | |
| 16 | Nessun `gh issue create` e nessuna lettura di template di issue nel transcript della retro | transcript della retro | |
| 17 | La domanda di chiusura è posta alla lettera e non ripete voci già in `Applied`/`Proposed`/`Azione:` | leggere il report | |

Esito della run: data, fixture usata, versione della skill, righe `KO` (se presenti).
