# Cosa è in aria adesso

Questo file si legge all'inizio di ogni sessione e **si accorcia**: una riga
chiusa si cancella, non si archivia. Se cresce oltre una schermata vuol dire
che sta diventando un diario — e il diario sono i messaggi di commit.

Quello che è *finito* non sta qui: sta in `CLAUDE.md` se è una regola, nel
`CHANGELOG.md` se è un rilascio, in `git log` se è una modifica.

Aggiornato: 5 settembre 2026.

## Aspetta lo chef

- **Rigenerare i turni e confermare** che giovedì 10 il Pass a cena si copre
  (era il caso che aveva segnalato: allungare un turno da P a SP per liberare
  chi sa fare la partita scoperta). Pubblicato in `app-BFAC50xb.js`.
- Nel riepilogo deve leggersi la riga nuova «N turni allungati per coprire dei
  buchi (+Nh in tutto)», separata dai turni extra, e su Alessio il motivo
  giusto («non restava un giorno libero»), non «il fabbisogno non li chiedeva».

## Deciso a metà

- **I due posti scoperti che restano sono al lavaggio**, e restano scoperti
  perché tutte e quattro le persone che sanno lavare hanno i turni extra
  spenti. Il motore fa la cosa giusta: non si chiama chi ha detto di no. Se lo
  chef ne riaccende anche solo uno, quei buchi si chiudono da soli. È una sua
  scelta di cucina, non un difetto da correggere.

## Debiti aperti

- **Le prove sui clic girano, ma non entrano in una cucina.** `npm run
  prova:clic` apre un browser vero sul banco e sulla schermata d'accesso: nove
  prove, tredici secondi, e sono già nella pipeline. Quello che ancora non
  tocca è l'app **con dei dati dentro** — generare i turni, salvare, correggere
  una cella — perché servirebbe un account di prova nel Supabase di test. È il
  prossimo passo di questo lavoro, non un'idea nuova.

- **Il ramo `console-admin` è fermo e aspetta.** Dieci commit, mai uniti in
  `staging`: la console dell'amministratore di piattaforma, con il suo SQL. Il
  motivo per cui è fermo sta scritto nel commit «Le prove che io non ho potuto
  fare»: quel SQL non l'ha eseguito nessuno, e in fondo a `CONSOLE-ADMIN.md`
  c'è la sequenza da eseguire a mano, passo per passo, con accanto il
  risultato atteso. Finché non è passata, quel ramo non si unisce.
