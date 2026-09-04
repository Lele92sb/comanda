# Dal blob JSON alle tabelle vere

Deciso il 4 settembre 2026, con l'app ancora piccola e **senza dati veri**:
solo qualche collega che la prova. È la finestra in cui questo cambio costa
poco, e non tornerà.

## Cosa c'è oggi

Ogni sezione è **un blob JSON** dentro `kitchen_data(kitchen_id, key, value,
version)`, riscritto per intero a ogni salvataggio. Venti sezioni, venti righe.

Tre cose non funzionano, e sono legate:

1. **A 5.000 ingredienti servono 620 KB per cambiare un prezzo.** Si riscrive
   tutto l'elenco per toccare un numero.
2. **Due persone che modificano insieme si sovrascrivono.** Il controllo di
   versione se ne accorge, ma dopo: uno dei due ha già perso il lavoro.
3. **Il tempo reale non si può fare.** Realtime rispetta RLS, e RLS filtra
   RIGHE, non CAMPI dentro un JSON. La redazione che fa `leggi_sezione()` —
   togliere i prezzi a chi non li vede — lì dentro non si può replicare.

## La scoperta che ha cambiato il progetto

Il primo istinto è: tabelle vere con colonne, e la redazione si fa con una
vista che scrive `null` al posto del prezzo per chi non lo vede.

**Non funziona, e per una ragione che si vede solo pensando al tempo reale.**
Realtime legge la TABELLA, non la vista. Se do la `select` sulla tabella a un
editor che non vede i costi, il canale gli manderà la riga intera — prezzo
compreso — a ogni modifica. La vista lo proteggerebbe solo finché usa
l'interfaccia.

Quindi:

> **La riservatezza non si fa filtrando i campi. Si fa separando le tabelle.**

Quello che una persona non deve vedere non deve stare in una riga che quella
persona può leggere. Non è una precauzione in più: è la stessa regola che
CLAUDE.md già impone («la riservatezza sta nel database, non nell'interfaccia»),
portata fino in fondo.

## Come si spezza

### Gli ingredienti — due tabelle, e la separazione È la redazione

```
ingredienti        id, kitchen_id, name, unit, yield_pct, yield_estimated
                   → la legge ogni membro: servono per leggere una ricetta

ingredienti_costi  kitchen_id, id, price, supplier
                   → la legge solo chi vede i costi
```

Chi non vede i costi non è iscritto alla seconda tabella: in tempo reale non
riceve niente da lì, e interrogandola a mano non riceve niente lo stesso. Non
c'è un campo da ricordarsi di nascondere.

### La brigata — stessa forma, altra riga di taglio

```
persone            id, kitchen_id, name, role, stations, weekly_quota, puo_fare_extra
                   → vincoli di pianificazione: li vede chi fa i turni

persone_personali  kitchen_id, id, phone, email, contract_hours
                   → dati da datore di lavoro
```

Attenzione: oggi `reddigi_sezione` per la brigata NON toglie dei campi,
RICOSTRUISCE la persona su una lista chiusa — e il commento nello schema spiega
perché (un vincolo nuovo dimenticato lì arriva `undefined`, il default lo legge
come acceso, e il generatore dà due prospetti diversi a seconda di chi preme il
bottone). Con due tabelle il problema **sparisce da solo**: i vincoli stanno
tutti nella prima, e non c'è nessuna lista da tenere aggiornata.

### I turni — qui la redazione è già per riga, e RLS la sa fare

```
turni              kitchen_id, staff_id, giorno, codice, stazioni
giorni_pubblicati  kitchen_id, giorno
```

Chi ha sola lettura vede solo i giorni pubblicati. Oggi è una redazione dentro
il JSON; domani è una policy:
`using (pubblicato(kitchen_id, giorno) or public.can_write(kitchen_id))`.

È anche la sezione **più scritta** dell'app — una cella alla volta — e quella
dove i 620 KB si sentono di più.

### Il resto

| sezione | dove va |
|---|---|
| `subrecipes`, `recipes`, `menus` | tabelle proprie; il costo è già calcolato dal client |
| `suppliers`, `stations`, `services`, `shiftTypes` | tabelle piccole, nessuna redazione |
| `staffingNeeds` | tabella `fabbisogno(kitchen_id, servizio, stazione, quante)` |
| `wellbeing` | tabella `ore_registrate` |
| `knowledge`, `chatHistory` | restano blob: sono documenti, non collezioni |
| `impostazioni`, `eccedenzaOre` | riga singola per cucina |
| `importedInvoices`, `invoiceHistory` | tabella `importazioni` |

**`knowledge` e `chatHistory` restano blob apposta.** Non sono collezioni di
entità: sono un testo e una conversazione, si leggono e si riscrivono interi, e
spezzarli non darebbe niente.

## L'ordine, e perché

Una sezione alla volta, ognuna committata e funzionante. Il confine che lo
rende possibile c'è già: **tutto passa da `cloudGet`/`cloudSet` in
`lib/cloud.js`**. Il resto dell'app chiede `state.ingredients` e riceve un
array — non sa e non deve sapere da dove viene.

1. **`ingredients`** — la più grande in prospettiva, la redazione più semplice,
   e non tocca il motore turni. È la fetta su cui si prova il modello.
2. **`staff`** — la redazione più delicata, e quella che oggi ha la lista chiusa.
3. **`shifts`** — la più scritta, e dove il guadagno si sente.
4. Il resto, in ordine di dimensione.

Ogni fetta finisce con: tabelle + RLS + `cloudGet`/`cloudSet` che le usano +
i quattro controlli verdi + provato nel browser.

## Cosa NON si fa

**Non si scrive una migrazione dei dati.** Non ci sono dati veri: si cancella e
si riparte. Scrivere un convertitore per dati che non esistono sarebbe codice
da mantenere per niente, e sarebbe la parte più rischiosa di tutto il lavoro.

Chi sta provando l'app perde quello che ha inserito, e lo sa.

## Il tempo reale, che è il motivo per cui si fa

Arriva alla fine, e a quel punto è quasi gratis: `alter publication
supabase_realtime add table ...` sulle tabelle che non hanno niente da
nascondere a chi le può leggere — che dopo questo lavoro sono tutte, perché
quello che va nascosto sta in una tabella diversa.

## Nota su `schema.sql`

Finché questo lavoro è in corso, le tabelle nuove stanno **solo nelle
migrazioni numerate**, e `schema.sql` descrive ancora il modello a blob.
Riallinearlo a ogni fetta vorrebbe dire tenerlo coerente con qualcosa che sta
cambiando sotto, e una fonte di verità che dice una cosa a metà è peggio di una
che dice apertamente «guarda le migrazioni».

Si riallinea **alla fine**, quando tutte le sezioni sono passate: a quel punto
`schema.sql` torna a essere quello che serve per far nascere una cucina nuova,
e le migrazioni tornano a essere solo la storia di come ci si è arrivati.

Oggi non ci sono progetti Supabase da creare da zero — c'è solo quello di
prova, e la produzione non esiste ancora — quindi il disallineamento non fa
danno a nessuno.
