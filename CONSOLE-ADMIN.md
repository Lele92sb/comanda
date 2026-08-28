# Console di amministrazione della piattaforma

Serve a te, proprietario del prodotto — non al titolare di una cucina. Fino a
ieri, per spostare un cliente da "in prova" ad "attivo" bisognava aprire
Supabase e scrivere SQL a mano. Prima o poi si sbaglia riga.

Sta su una **pagina a parte**, `/admin`, e non è una scheda dell'app: chi apre
Comanda per fare i turni non deve avere sotto il pollice il pulsante che
sospende una cucina.

> **Niente di tutto questo è ancora attivo.** Il codice è sul branch
> `console-admin`, non pubblicato. Il database non è stato toccato: `admin.sql`
> è un file da eseguire a mano, dopo averlo letto. Finché non lo esegui, la
> pagina `/admin` esiste ma non si apre per nessuno.

---

## Cosa c'è

**Vedere** (la parte che vale di più, e non cambia niente)

- Numeri d'insieme: cucine totali e per stato commerciale, account, quanti
  attivi negli ultimi 7 e 30 giorni, nuove iscrizioni giorno per giorno.
- Elenco cucine: nome, da quando, stato, scadenza della prova, quante persone
  per ruolo, quanto pesano i dati, quando è stata usata l'ultima volta,
  chiamate AI del mese sul tetto.
- Elenco account: email, da quando, ultimo accesso, in quali cucine e con che
  ruolo.
- Ricerca e "carica altre" su entrambi.

**Agire** (ogni azione lascia una riga nel registro)

- Cambiare stato commerciale, spostare la scadenza della prova.
- Alzare o abbassare il tetto AI, azzerare il contatore del mese.
- Sospendere e riattivare.
- Cambiare ruolo, rimuovere una persona, trasferire la proprietà.
- Cancellare una cucina in due passi: prima reversibile, poi definitiva.

**Errori** — quello che si rompe a casa dei clienti finisce in una tabella
cercabile per versione, cucina e periodo, e raggruppata per messaggio
ricorrente. Prima finiva solo nei log di Cloudflare, che si guardano in diretta
e basta.

**Registro** — chi ha fatto cosa, su chi, quando, con quale esito. Si aggiunge
e basta: non si modifica e non si cancella, nemmeno con la chiave di servizio.

**Accesso di assistenza** — l'unico modo di guardare i *contenuti* di una
cucina (ricette, costi, anagrafica). Motivato, a scadenza breve, registrato ad
ogni singola lettura, e visibile al titolare della cucina nel suo pannello
Squadra.

---

## Come si applica `supabase/admin.sql`

Serve una volta sola. Fallo **prima sul progetto Supabase di prova**, e solo
dopo su quello di produzione, quando ci sarà.

1. Apri il progetto su [supabase.com](https://supabase.com) → **SQL Editor** →
   **New query**.
2. Apri `supabase/admin.sql` e **leggilo**. È lungo ma è scritto per essere
   letto: ogni scelta ha accanto il perché. La parte che conta davvero sono le
   policy — quelle decidono chi vede cosa.
3. Copia **tutto** il file, incollalo nell'editor, premi **Run**.
4. Deve finire senza errori. Se si ferma dicendo che manca `public.kitchens`,
   hai sbagliato progetto: quello è un database su cui non è mai stato
   eseguito `schema.sql`.

Il file è **rieseguibile**: rilanciarlo non distrugge niente e non duplica
niente. Se un domani hai un dubbio sui contatori, rilanciarlo li ricostruisce
contandoli davvero.

### Cosa tocca del database che hai già

Nessuna policy esistente viene cambiata o rimossa, nessun dato riscritto.
Aggiunge:

| Dove | Cosa | Perché |
|---|---|---|
| `kitchens` | colonna `deleted_at` | la cancellazione reversibile |
| `kitchens` | 2 indici | l'elenco a chiave, senza ordinare l'intera tabella a ogni pagina |
| `kitchens` | trigger `kitchens_contatori` | tiene aggiornati i totali |
| `kitchen_members` | trigger `kitchen_members_stats` | conta le persone per ruolo |
| `kitchen_data` | trigger `kitchen_data_stats` | peso dei dati e ultima attività |

Più sei tabelle nuove: `platform_admins`, `admin_audit`, `kitchen_stats`,
`platform_counters`, `app_errors`, `admin_support_access`.

---

## Come nomini il primo amministratore

**Questo è l'unico modo.** Non c'è nessun pulsante nell'app che lo faccia, e
non deve esserci: se esistesse una chiamata capace di nominare un
amministratore, esisterebbe anche un modo di farla fare a qualcun altro.

Ti serve solo il SQL Editor di Supabase, che è raggiungibile solo da chi
possiede il progetto — cioè tu.

### Passo 1 — controlla che l'account esista

Devi avere già un account normale nell'app, quello con cui entri di solito.
Nel SQL Editor incolla questo, mettendo la **tua** email al posto di quella
finta:

```sql
select id, email, created_at from auth.users
 where lower(email) = lower('tua-email@esempio.it');
```

Premi Run. **Deve uscire esattamente una riga.** Se non esce niente, l'email è
scritta diversamente da come l'hai registrata: riguardala, non tirare a
indovinare.

### Passo 2 — nominati

Stessa email, di nuovo:

```sql
insert into public.platform_admins (user_id, email, nota)
select u.id, u.email, 'primo amministratore, nominato a mano'
  from auth.users u
 where lower(u.email) = lower('tua-email@esempio.it')
on conflict (user_id) do nothing;
```

### Passo 3 — controlla che sia andata

```sql
select user_id, email, created_at from public.platform_admins;
```

Deve uscire una riga, con la tua email.

### Passo 4 — entra

Vai su `/admin` (in prova:
`https://staging.comanda-bwj.pages.dev/admin`) ed entra con le stesse
credenziali dell'app.

> **Se dice "Questa pagina non è per te":** esci dall'account e rientra. Il
> permesso si legge dal token dell'accesso, e quello che hai in mano è stato
> creato prima che tu fossi amministratore.

### Per togliere un amministratore

```sql
delete from public.platform_admins
 where lower(email) = lower('email-da-togliere@esempio.it');
```

Se togli l'ultimo, la console si chiude per tutti. Non è un disastro: i dati
restano, l'app dei clienti continua a funzionare, e si rientra rifacendo il
Passo 2. È una serata persa, non un danno.

---

## Cosa ho verificato, e come

Distinguo con precisione, perché la differenza qui conta più del solito.

### Eseguito davvero

**89 test automatici, verdi** (`npm test`). Erano 54, ne ho aggiunti 35.

- **La raccolta degli errori gira per intero** (`tests/errori-raccolta.test.js`).
  Il test manda una segnalazione che si porta dietro ricette, prezzi e il
  telefono di un cuoco, e verifica che dall'altra parte arrivino solo i campi
  dell'elenco chiuso. Verifica anche che senza database configurato si comporti
  come prima, e che se il database non risponde chi usa l'app non se ne accorga.
- **L'impaginazione a chiave** (`tests/admin-console.test.js`). Un modello del
  confronto di riga di Postgres, un insieme di righe con molti istanti
  duplicati, e la verifica che scorrendo tutte le pagine si ottengano
  esattamente tutte le righe, una volta ciascuna. C'è anche un secondo test che
  dimostra che un cursore fatto sulla sola data *perderebbe* righe: serve a
  provare che il primo test ha i denti.
- **La porta d'ingresso della console.** Otto risposte diverse alla domanda
  "sei amministratore?" — errore, eccezione, `null`, la stringa `"true"`, il
  numero `1`, un oggetto — e nessuna deve aprire. Solo un `true` secco apre.
- **Che le persone si identifichino esplicitamente**: senza email né id, la
  console si ferma invece di indovinare.

**Provato nel browser** (build vera servita con wrangler, non `npm run dev`):

- `/admin` senza sessione: mostra la schermata d'accesso e **non parte nessuna
  chiamata al database**. Zero richieste di rete oltre ai file della pagina,
  zero messaggi in console.
- **Con una sessione falsificata a mano** — ho scritto un token inventato nel
  `localStorage`, che è quello che farebbe chi ci prova — la console **si
  rifiuta di aprirsi**: "Questa pagina non è per te". Supabase risponde 401 e
  la porta resta chiusa.
- Da quella pagina ho chiamato a mano `is_platform_admin`, `admin_numeri`,
  `admin_cucine`, `admin_registro`, `admin_set_stato` e ho provato a leggere
  `platform_admins` e `admin_audit`: **tutte rifiutate**.
- La console **si disegna** correttamente, su schermo di telefono (375px):
  numeri, elenco cucine, elenco account, errori raggruppati con il dettaglio
  delle singole segnalazioni, registro, e la scheda di una cucina con tutte le
  azioni. L'ho fatto sostituendo **solo il trasporto** (l'accesso e le
  chiamate) con dati finti: il codice della console ha girato tutto.
- **L'app normale non si è rotta.** La pagina principale carica senza nessun
  errore in console e con le sole sue risorse, nonostante ora la build produca
  due pagine invece di una.

### Scritto, non provato

**Tutto il SQL.** Non ho credenziali del database e non le ho cercate. Le
funzioni, le policy, i trigger e i permessi di `supabase/admin.sql` sono
scritti con attenzione e **mai eseguiti**.

Quello che ho potuto fare è verificarne il *testo*, e l'ho fatto con dei test
veri (`tests/admin-sicurezza.test.js`), che controllano le righe che una
modifica frettolosa fa sparire senza rompere niente:

- ogni funzione raggiungibile dall'app ha il controllo dei permessi come
  **prima istruzione**;
- nessuna policy è scritta `for all` (in Postgres comprende anche la SELECT: è
  il buco che questo progetto ha già avuto);
- non esiste **nessuna** scrittura su `platform_admins` in tutto il file;
- il registro ha solo la policy di lettura, più il trigger che rifiuta
  modifiche e cancellazioni;
- nessuna funzione di consultazione nomina `kitchen_data` — i contenuti delle
  cucine non escono da lì;
- chi tocca ruoli e proprietà non guarda mai `auth.uid()` per decidere **su
  chi** agire.

Sono controlli sul testo, non sul comportamento. **Non sostituiscono la prova
sul database**, che è la sezione 8 in fondo a `supabase/admin.sql`: è scritta
passo per passo, con accanto il risultato atteso, e va fatta prima di
considerare questa cosa funzionante. Due punti di quella sezione si dimenticano
sempre e quindi li ripeto qui:

1. **Un errore restituito non basta.** Dopo ogni tentativo respinto, rileggi il
   dato e controlla che non si sia mosso.
2. **Si prova per ogni ruolo** — owner, editor, viewer — e per tutte e quattro
   le combinazioni delle impostazioni della cucina. Non dovrebbero contare
   niente qui, ed è esattamente per questo che vanno provate.

---

## Cosa NON ho fatto, e perché

**Non ho eseguito il SQL**, e quindi non ho provato nessuna policy sul
database. È il limite più grosso di questa consegna. Vedi sopra.

**Non ho pubblicato niente.** Il branch `console-admin` è pubblicato su GitHub,
ma la pipeline gira solo su `main` e `staging` (l'ho riletto in
`.github/workflows/ci.yml` prima di fare push): un branch di lavoro non
pubblica nulla. Lo staging che stai provando non è stato toccato.

**Non ho costruito uno sfogliatore dei contenuti** nella console. Il
meccanismo per leggerli c'è nel database (`admin_leggi_contenuto`, che pretende
un accesso di assistenza in corso e registra ogni sezione letta), ma
nell'interfaccia c'è solo l'apertura, la chiusura e l'elenco degli accessi. Non
è una dimenticanza: un pannello che mostra le ricette dei clienti è la cosa che
si finisce per aprire per abitudine. Finché non serve davvero, chi deve
guardare un dato passa dal SQL Editor con l'accesso aperto, e la lettura resta
scritta nel registro come tutte le altre.

**I tentativi di chi non è amministratore non finiscono nel registro.** Quando
una funzione rifiuta per mancanza di permesso solleva un errore, e in Postgres
un errore annulla la transazione — portandosi via anche la riga di registro che
avesse appena scritto. Non esistono transazioni autonome. I rifiuti *per
regola* (togliere l'ultimo titolare, per esempio) invece ci sono, perché quelle
funzioni non sollevano: tornano un esito e registrano. Per avere anche gli
altri servirebbe scrivere fuori transazione (una coda con `pg_cron`, oppure il
proxy server). Vale la pena farlo quando gli amministratori saranno più di uno.

**Non c'è un collegamento alla console dentro l'app.** Ci si arriva col
segnalibro. Metterlo avrebbe voluto dire far chiedere a ogni cliente, ad ogni
avvio, "sono amministratore della piattaforma?" — una chiamata in più per tutti
e un cartello che dice che quella pagina esiste.

**La console è solo in italiano.** L'impianto di traduzione c'è ma copre metà
app; questa pagina la usi tu.

**Ho trovato un difetto che non ho corretto**: il campo della password è un
rettangolo bianco su fondo scuro, nella schermata d'accesso dell'app *e* in
quella della console. Il foglio di stile elenca tutti i tipi di campo tranne
`password`. È una riga sola da correggere, ma cambierebbe l'aspetto della
schermata d'accesso dell'app che stai provando in questi giorni, e non mi è
sembrato il momento di fartelo trovare a sorpresa. C'è un promemoria a parte.

---

## Le decisioni che ho dovuto prendere al posto tuo

Le lascio esplicite: sono tutte reversibili, ma è meglio che le guardi.

**1. Una cucina cancellata resta nell'elenco di chi ne fa parte.** La
cancellazione reversibile mette `deleted_at` e sospende la cucina — così l'app
la blocca già senza modifiche, dicendo "cucina sospesa". Ma chi ne faceva parte
continua a vederla nella lista delle sue cucine. Nasconderla avrebbe voluto
dire cambiare una policy in `schema.sql`, e non ho voluto toccare le regole
dell'app dei clienti per una funzione della console. **Da decidere: va
nascosta?**

**2. Nessuna quarantena prima dell'eliminazione definitiva.** Bastano i due
passi e il nome scritto per esteso. Si potrebbe pretendere che siano passati
7 giorni dalla cancellazione — più sicuro, ma scomodo il giorno che un cliente
chiede di sparire subito. **Da decidere: quanti giorni, se ne vuoi.**

**3. Ripristinare una cucina la riporta "sospesa", non "attiva".** Chi
ripristina per errore non regala un abbonamento: riattivare è una seconda
decisione, presa guardando lo stato commerciale.

**4. Il trasferimento di proprietà non declassa nessuno se non glielo dici.**
Devi nominare *anche* il vecchio titolare per toglierglielo. Se lo lasci vuoto,
la cucina resta con due titolari — che è uno stato sano. La scorciatoia
"declassa tutti quelli diversi dal nuovo" è quella che toglie il ruolo alla
persona sbagliata, ed è già successa qui.

**5. Le soglie oltre cui i numeri diventano stime: 200.000.** Sopra quel
numero di account, il totale viene dalla stima del planner invece che da un
`count(*)`, e i conteggi degli attivi smettono di rispondere invece di
scandire tutta la tabella. La console lo dichiara a schermo. È un numero scelto
da me: si cambia in `admin_numeri()`.

**6. Un accesso di assistenza dura al massimo un giorno**, e almeno 5 minuti.
"Finché serve" significa per sempre, e a quel punto le altre garanzie non
contano più niente.

**7. Gli errori non si potano da soli.** C'è una funzione per farlo
(`admin_pulisci_errori`), ma nessun lavoro automatico la chiama: preferisco che
sia una tua decisione consapevole quando la tabella crescerà.

---

## Quando queste scelte andranno rifatte

Sono scritte anche nel SQL, accanto al codice che riguardano. In breve:

- **Contatori della piattaforma**: una riga per secchio, quindi due creazioni
  di cucina nello stesso istante si aspettano a vicenda. Oltre ~10 creazioni al
  secondo va cambiato.
- **Peso dei dati**: calcolato serializzando il JSON a ogni salvataggio. Si
  sente sopra i ~5 MB per sezione.
- **Ricerca per nome**: usa `ILIKE '%...%'`, che nessun indice normale può
  servire. Oltre qualche decina di migliaia di cucine serve un indice trigram —
  il comando è scritto nel file, commentato, perché installa un'estensione e
  quella è una decisione di chi possiede il database.
- **Elenco account**: `auth.users` non ha un indice su `created_at`, quindi
  ordinarlo costa. Il comando per aggiungerlo è nel file, commentato: è una
  tabella gestita da Supabase e non me la sono sentita di toccarla.
- **Riempimento iniziale delle statistiche**: è l'unica volta che si scandiscono
  tutti i dati di tutti. Oltre ~50.000 cucine va spezzato a lotti.
