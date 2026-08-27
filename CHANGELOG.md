# Changelog

Tutte le modifiche rilevanti all'app, versione per versione.

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
