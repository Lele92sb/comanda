# Changelog

Tutte le modifiche rilevanti all'app, versione per versione.

## [1.6.0] — Il motore impara il mestiere, l'app diventa a componenti, i dati vanno in tabelle

Il rilascio più grosso finora: centotrentotto modifiche fra il 28 agosto e il 5
settembre 2026. Tre cose grandi — il generatore dei turni, che prima faceva un
prospetto e adesso ne ragiona uno; l'interfaccia, riscritta a componenti; e il
modo in cui i dati stanno nel database, cambiato dalle fondamenta.

### Il generatore non fa più il conto a mente dello chef

Prima assegnava turni; adesso tiene insieme le cose che uno chef tiene insieme
quando compila il prospetto la domenica sera.

- **Le ore di contratto contano.** Cinque giorni a testa non vuol dire ore
  uguali: c'era chi ne faceva 52 e chi 43. Ora il motore lo sa quanto dura ogni
  turno, e chi ha quaranta ore in busta paga non ne lavora trentadue.
- **Chi ha detto di no ai turni extra non viene chiamato.** È un interruttore
  sulla scheda della persona, e il motore lo rispetta anche quando gli costa un
  posto scoperto: dirlo è meglio che scavalcarlo in silenzio.
- **Lo spezzato copre due partite.** Poteva stare ai primi a pranzo e al pass a
  cena, ma la cella sapeva dire una partita sola per giornata.
- **La mano da un'altra partita.** Chi sta alle insalate e dà una mano al
  lavaggio adesso lo si può scrivere, e il prospetto ne tiene conto.
- **I riposi non cadono sempre negli stessi giorni.** Alessio riposava lunedì,
  martedì e mercoledì quaranta volte su quaranta.
- **Venti bozze, si mostra la migliore.** Il generatore non produce più il primo
  prospetto valido: ne prova venti e sceglie.
- **Allunga un turno per coprire un buco.** Se manca una persona al pass e chi
  sa farlo è impegnato ai primi, il motore allunga il turno di chi resta ai
  primi e sposta l'altro al pass — la mossa che lo chef faceva a mano e che al
  motore mancava. Costa ore, e le dice.
- Il fabbisogno dice 1 e adesso è 1: non metteva due persone dove ne serviva
  una per poi non averne altrove.
- Le ore che avanzano dal contratto si possono collocare dove il servizio preme,
  sui giorni scelti o su tutti.

### Dopo la generazione, si legge cosa è successo

- Una riga per fatto — posti scoperti, turni extra, allungamenti, quote non
  spese — e il dettaglio resta **chiuso**: si apre chi vuole leggerlo.
- Ogni motivo ha la sua frase, perché portano a fare cose diverse: «non restava
  un giorno libero» non è «il fabbisogno non li chiedeva».
- La risposta alla domanda vera: *si poteva fare di meglio?* Se venti prospetti
  sono equivalenti, lo dice.

### Il mese, non solo la settimana

- Si genera e si guarda un mese intero, con la settimana che resta
  lunedì-domenica anche quando il mese la taglia a metà.
- La settimana intera sta su un telefono senza scorrere; per vedere i turni si
  scorreva mezza pagina, adesso no (da 2471 pixel a 981).

### Impostazioni cucina

Cinque cose che si impostano una volta — servizi, tipi di turno, partite,
fabbisogno, quote per persona — raccolte in un posto solo invece che sparse.
I servizi e i tipi di turno sono tuoi: «aperitivo» o «brunch» si aggiungono.

### L'app è fatta di componenti

Quattordici pezzi riusabili (`<cmd-bottone>`, `<cmd-scheda>`, `<cmd-scelta>`…)
al posto dell'HTML costruito come stringa. Non è una questione estetica: la
vecchia schermata si ridisegnava intera a ogni modifica, e il selettore del
colore si chiudeva da solo mentre lo usavi, il cursore usciva dal campo. Ogni
componente si apre da solo nel banco di prova, in ogni stato.

- Le tendine di sistema sono sparite: la nostra sa cercare.
- Le finestre di dialogo usano l'elemento del browser: Esc funziona, il fuoco
  resta dentro.
- Chi gestisce sta al computer, e il computer aveva due terzi di schermo vuoti.

### I sedici punti usciti dalla prova in cucina

Tutti e sedici fatti. I più visibili: **chiaro e scuro**; **spagnolo** oltre a
italiano e inglese (587 frasi × 3); **valute**, e i prezzi smettono di essere
scritti in inglese; caratteri più grandi e leggibili; il **menu sempre
visibile**; la **ricerca** in sei elenchi, uguale dappertutto; si vede che ha
**salvato**; la **dashboard** dice cosa fare, non solo cosa c'è; le
**notifiche** dicono cosa è successo da quando non guardavi; l'invito con
**link e QR** — si gira lo schermo e l'altro è dentro; un permesso separato per
chi gestisce le richieste altrui.

### I dati in tabelle vere, e le modifiche in tempo reale

Le sezioni della cucina non sono più un blocco unico di dati: sono tabelle con
colonne. Si scrive solo quello che cambia, e la riservatezza sta nella **forma**
dei dati — quello che una persona non deve vedere sta in una tabella che quella
persona non legge, non in un riquadro nascosto.

- **Le modifiche di un collega compaiono da sole**, misurate in 860 ms dal suo
  Salva al tuo schermo. E mentre scrivi in un campo, il salvataggio di un altro
  non te lo svuota: testo, cursore e fuoco restano dov'erano.
- Le foto delle ricette non pesano più su ogni lettura.
- Per chi aveva già dei dati c'è una migrazione che prima **confronta e non
  tocca niente**, poi travasa.

### Quanto costa il servizio

Costo del lavoro di un periodo, con la tariffa oraria a persona, e l'incasso
che serve per pagarlo dato il food cost. Vuole due permessi insieme — vedere i
costi *e* vedere i dati personali — perché la tariffa di una persona è la sua
busta paga.

### Le protezioni si provano da sole

Cinquantun prove che impersonano sei persone su tre cucine con impostazioni
opposte e verificano in un secondo chi può leggere e scrivere cosa. Non leggono
le regole: le **eseguono**, dalla stessa strada che farebbe chi provasse ad
aggirarle. Passate tutte.

### Gli strumenti che trovano gli errori prima dello chef

Tre difetti sono arrivati fino in cucina perché nessun controllo poteva
vederli: un nome che non esiste (`ReferenceError` a metà funzione: la schermata
resta com'era, senza errori), un colore che non esiste (le barre diventano
invisibili), un import morto (le frecce spostavano una settimana senza nome).
Adesso ci sono sei controlli che girano prima di ogni pubblicazione, e 283 test.

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
