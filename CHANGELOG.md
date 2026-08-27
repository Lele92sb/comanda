# Changelog

Tutte le modifiche rilevanti all'app, versione per versione.

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
