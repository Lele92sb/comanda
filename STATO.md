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

- **Nessuna prova automatica sui clic.** Due difetti veri di quest'ultima
  settimana erano entrambi di comportamento, non di logica — il chip che si
  accendeva da solo e il riquadro che scriveva in uno stato ormai sostituito —
  e nessuno dei 283 test poteva vederli: Node non ha una pagina. Li ha trovati
  lo chef usando l'app. Finché non c'è una prova che apra davvero la schermata
  e clicchi, quella classe di errori arriva in cucina.
