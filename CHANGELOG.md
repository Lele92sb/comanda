# Changelog

Tutte le modifiche rilevanti all'app, versione per versione.

## [1.5.0] — Chi vede cosa, e turni da pubblicare

### Riservatezza imposta dal database
- Tre livelli: **titolare** tutto; **può modificare** tutto tranne ciò che il
  titolare si tiene; **sola lettura** i turni pubblicati, le ricette senza
  numeri e le proprie richieste.
- I dati vengono filtrati prima di uscire dal database. Chi ha sola lettura,
  aprendo la console del browser, non trova un prezzo: non gli è mai arrivato.
- Due interruttori per cucina, nel pannello Squadra: se chi può modificare vede
  i costi (predefinito sì) e i dati personali della brigata (predefinito no).
  Ogni titolare sceglie la propria soglia.
- Non si scrive ciò che non si può leggere.

### Turni da pubblicare
- Finché non premi Pubblica, la brigata non vede quel periodo: puoi generare,
  rifare e sistemare senza che nessuno legga una bozza. Si può anche nascondere
  di nuovo.

### Interfaccia
- La barra in alto non si deforma più: i pulsanti non vanno a capo dentro se
  stessi e tutti i controlli hanno la stessa altezza.
- Lingua come due sigle IT|EN in alto a destra.
- Il pulsante "Il tuo nome" sparisce: è il nome stesso a essere cliccabile.
- Su telefono l'intestazione si stringe, per lasciare schermo alla griglia turni.

## [1.4.0] — Primo rilascio, installabile sul telefono

La prima versione pubblicata davvero. Da qui si prova in cucina.

### Si installa come un'app
- Manifesto e icone: da telefono, "Aggiungi a schermata Home" crea un'icona
  vera che apre l'app a schermo pieno, senza barra del browser. Funziona su
  Android e su iPhone.

### Struttura, in vista di più persone che ci lavorano
- Da un file di 2.851 righe a 30 moduli per dominio, il più grande di 367.
  Le dipendenze non sono state indovinate ma calcolate: 222 collegamenti.
- Build con Vite, TypeScript sui moduli dove la correttezza conta di più.
- Supabase e node-forge diventano dipendenze installate invece di due
  `<script>` verso CDN esterni: l'avvio non dipende più da server di terzi.
- Design system: 33 token, utilità e componenti al posto di 142 stili scritti
  a mano dentro l'HTML.
- Dialoghi dell'app al posto di `confirm()` e `prompt()` del browser, che in
  alcuni contesti venivano soppressi lasciando il pulsante apparentemente rotto.

### Fatture
- Import diviso in tre strati, i primi due puri e coperti da 23 test. Da lì
  escono i prezzi d'acquisto su cui si calcola il food cost, e non erano
  testati da niente.
- La partita IVA resta testo: come numero, `01234567890` diventava
  `1234567890` e il fornitore non veniva più riconosciuto.
- Il fornitore si riconosce dalla partita IVA, non dal nome.
- Le fatture già importate vengono saltate, riconosciute dall'impronta del
  contenuto anche se il file è stato rinominato.
- Le voci di servizio (trasporto, imballo, CONAI) non diventano più
  ingredienti, ma vengono dichiarate nel resoconto.
- Un'importazione si può annullare: prezzi ripristinati, fattura
  reimportabile, e quello che hai corretto a mano dopo resta com'è.
- Pronto per le fonti automatiche: aggiungerne una significa scrivere un file
  che rispetti l'interfaccia `FonteFatture`.

### Lingue
- Italiano e inglese, con selettore IT/EN in alto a destra. La lingua si
  rileva dal browser e la scelta viene ricordata.
- La chiave di traduzione è la frase italiana: se una traduzione manca compare
  l'italiano, non un codice.

### Affidabilità
- Raccolta degli errori: errori non gestiti e promesse rifiutate arrivano al
  server con versione e browser. Lo stesso errore viene mandato una volta sola.
- La pipeline ora è test → tipi → import → build → pubblica. Il controllo
  sugli import nasce da tre errori introdotti in sviluppo che né il
  compilatore né il bundler vedevano.

## [1.3.0] — Turni: servizi su misura, mese, richieste, più cucine

### Servizi e tipi di turno definiti da te
- Colazione, pranzo e cena non sono più cablati: ogni cucina definisce i propri
  servizi (aperitivo, brunch, lunch...) e i tipi di turno che li coprono, con
  sigla, orario e ore.
- Lo "spezzato" smette di essere un caso particolare del codice: un turno
  dichiara quali servizi copre, e se ne copre due il generatore capisce da solo
  che una persona sola ne chiude due. Vale per qualsiasi coppia di servizi.
- Rinominare una sigla la propaga ai turni già assegnati e alle quote.

### Turni per data, settimana o mese
- I turni erano indicizzati per nome del giorno ("Lun"): esisteva una sola
  settimana, senza storico e senza sapere quale fosse. Ora hanno una data vera.
- Si pianifica per settimana o per mese, avanti e indietro nel tempo. La griglia
  mensile scorre in orizzontale con la colonna dei nomi fissa.
- Rigenerando un periodo si sovrascrive solo quello: le altre settimane restano.
- La dashboard mostra i turni della data di oggi. Prima leggeva la casella con
  il nome del giorno, qualunque settimana fosse stata generata.

### Richieste del personale
- Nuova sezione dove i dipendenti inviano ferie, giorni di riposo o richieste di
  fare solo certi servizi. Il titolare approva o rifiuta; può registrarne anche
  per chi non ha un account.
- Le richieste approvate sono regole assolute per il generatore: non vengono mai
  violate, nemmeno per tappare un buco. Se un servizio non è copribile
  rispettandole, la scopertura viene dichiarata.
- Un turno accorpato non aggira una richiesta di singolo servizio: chi ha chiesto
  solo pranzo non si ritrova lo spezzato che gli porta dentro la cena.
- Solo il titolare può approvare, imposto dal database: altrimenti chiunque
  potrebbe auto-approvarsi le ferie.

### Più cucine
- Selettore rapido nella barra in alto per passare da un locale all'altro.
- Copia di servizi, turni e stazioni da un'altra cucina già impostata.
- Chi lavora su più locali non viene assegnato in due posti lo stesso giorno. La
  stessa persona è riconosciuta tra cucine dall'account collegato o dal numero
  di telefono.

### Affidabilità
- La suite di test passa da 7 a 27 casi: servizi personalizzati, calcolo delle
  date in ora locale, mesi bisestili, quote che ripartono ogni settimana,
  inviolabilità delle richieste approvate e degli impegni in altre cucine.

## [1.2.0] — Account, cucine condivise e ruoli

Passaggio da app personale su un singolo dispositivo a prodotto multi-utente, in vista
della commercializzazione. La parte di vendita (pagamenti, prezzi) è volutamente rimasta
fuori: prima l'app va provata sul campo.

### Account e condivisione
- Login con email e password. I dati di una cucina non stanno più solo nel browser: sono
  sull'account e li vedono tutte le persone di quella cucina.
- Più cucine per account, con cambio cucina dalla barra in alto.
- Tre ruoli: **titolare** (gestisce anche le persone), **può modificare**, **sola
  lettura**. I permessi sono applicati dal database, non dall'interfaccia: chi è in sola
  lettura non riesce a scrivere nemmeno chiamando l'API a mano.
- Inviti tramite codice a scadenza (14 giorni, monouso), con ruolo scelto da chi invita.
- La conversazione con l'assistente AI resta personale del singolo utente; ricettario,
  turni, fornitori e brigata sono della cucina.
- Se due persone salvano la stessa sezione insieme, la seconda riceve un avviso di
  ricaricare invece di sovrascrivere il lavoro della prima.
- Stato della cucina (`trial` / `active` / `suspended`) che governa l'accesso, già
  slegato dal futuro metodo di vendita.

### Funzioni AI: risolto un problema che le rendeva inutilizzabili
- Le tre funzioni AI (stima resa da fattura, lettura ricetta da foto, assistente)
  chiamavano l'API di Anthropic direttamente dal browser e senza chiave: funzionavano
  solo dentro l'anteprima di Claude, e fuori da lì erano già rotte. Ora passano da un
  proxy sul server, l'unico a conoscere la chiave API.
- Il proxy verifica identità, appartenenza alla cucina, stato della cucina e tetto
  mensile di chiamate prima di inoltrare. Modello e limiti di spesa li decide il server:
  una richiesta manipolata dal browser non può farsi costare quanto vuole.
- Quando una funzione AI non è disponibile, l'app spiega perché invece di fallire in
  silenzio.

### Infrastruttura
- Pubblicazione spostata da GitHub Pages a Cloudflare Pages (serve un server per il proxy
  AI). I test restano il cancello: se falliscono, non si pubblica.
- Test e produzione ora usano **due database separati**, non solo due indirizzi: i dati di
  prova non possono finire tra quelli veri.
- L'app funziona ancora in modalità locale (dati nel browser, nessun account) finché la
  configurazione cloud non viene compilata.

## [1.1.0] — Prima versione tracciata nel repository
Questo è il primo commit del progetto in un ambiente di sviluppo vero (repository git,
test automatici, branch staging/produzione). Contiene tutto il lavoro fatto fin qui,
riportato qui in un'unica voce dato che prima d'ora non esisteva uno storico verso cui
confrontare.

### Ricettario e cucina
- Ricettario a tre livelli: ingredienti (con resa/parte edibile e costo effettivo),
  sub-ricette (con calo peso e costo finale), piatti (food cost, prezzo suggerito,
  margine).
- Menu builder.
- Import automatico da fatture elettroniche (XML e XML firmato .p7m): crea e
  aggiorna ingredienti e fornitori, con stima AI della resa per i nuovi ingredienti.
- Lettura ricette da foto (OCR via AI) per sub-ricette e piatti.
- Assistente AI personale con base di conoscenza caricabile (testo o file).

### Brigata e turni
- Anagrafica brigata con contatti e stazioni di competenza.
- Griglia turni settimanale con codici C/P/S/SP/R/M/F, calcolo ore extra.
- Generatore automatico dei turni basato su fabbisogno per servizio
  (colazione/pranzo/cena) e quote settimanali per persona.
- Turni "extra" assegnati automaticamente quando il fabbisogno supera le quote
  disponibili, invece di lasciare postazioni scoperte senza segnalarlo.
- Monitoraggio benessere (ore lavorate, alert oltre soglia).

### Infrastruttura e affidabilità
- Struttura progetto professionale: repository git, branch `staging`/`main`, test
  automatici, pubblicazione separata staging/produzione via GitHub Pages.
- Motore di generazione turni (`app/logic.js`) estratto in un modulo condiviso e
  testato automaticamente (7 test) prima di ogni rilascio.
- Rilevamento automatico dell'ambiente (badge "AMBIENTE DI TEST" in staging) e
  separazione dei dati salvati tra staging e produzione.
- Salvataggio dati passato a `localStorage` standard del browser (prima usava un
  meccanismo disponibile solo nell'anteprima di Claude, causando perdita dati).
- Selettori file (import backup, foto ricetta) passati a `<label for="...">` invece
  di apertura via JavaScript — risolve il mancato funzionamento su alcuni browser
  mobili (in particolare iOS Safari).
- Generatore turni: corretto un bug per cui il personale qualificato per più
  stazioni veniva usato in modo inefficiente, lasciando scoperte stazioni che
  sarebbero state copribili con un'allocazione migliore.
- Lettura fatture elettroniche firmate (`.p7m`): sostituita l'estrazione tramite
  libreria di terze parti (che non leggeva correttamente il contenuto firmato) con
  una lettura diretta della struttura del file, verificata su un file reale.
- Backup manuale (esporta/importa) dei dati.
