# Comanda — note per chi ci lavora

App gestionale per chef: ricettario con food cost, brigata, turni, richieste
del personale, assistente AI. Italiano e inglese.

## Come si lavora

```bash
npm ci          # richiede Node >= 22.6 (i test caricano moduli .ts direttamente)
npm run dev     # sviluppo, ricarica a caldo — le funzioni server NON girano
npm run preview # build + wrangler: come in produzione, funzioni server comprese
npm test        # 153 test
npm run typecheck
npm run lint:import
```

`npm run preview` legge `.dev.vars` (non versionato: copia `.dev.vars.example`).
Serve solo per le funzioni server — AI e raccolta errori.

**Prima di ogni push**, gli stessi quattro controlli della pipeline:
`npm test && npm run typecheck && npm run lint:import && npm run build`

## Struttura

```
app/src/
  main.js            avvio, lingua, diagnostica (window.__comanda)
  ds/                design system: token e componenti <cmd-…>, in TypeScript
  banco/             il banco: ogni componente in ogni stato (/banco.html)
  core/              state, lingua, errori, backup
  lib/               logic (motore turni), cloud (dati+account), config
  ricettario/        ingredienti, piatti, costi, fatture/
  turni/             griglia, generatore, servizi, richieste, quote
  account/           accesso, cucine, ruoli, squadra
  viste/  ui/        dashboard, menu, brigata, benessere, schede
functions/api/       proxy AI e raccolta errori (girano sul server)
supabase/schema.sql  tabelle, ruoli, permessi — la fonte di verità
```

Ogni modulo dichiara cosa importa. `npm run lint:import` lo verifica: un
simbolo usato ma non importato non lo vede né il compilatore né il bundler,
esplode solo a schermo. È successo quattro volte prima che quel controllo
esistesse.

Lo stesso controllo fa ora anche da **guardiano dei confini**, e la tabella sta
in cima a `scripts/controlla-import.cjs`:

- **`ds/` può importare solo `lit`.** Il design system non sa niente di
  Comanda: non conosce turni, cucine, ruoli, database. È ciò che rende ogni
  componente apribile da solo nel banco e riusabile altrove.
- **`lib/` non importa niente dall'app.** È il motivo per cui il motore turni
  gira dentro Node e ha dei test: se importasse una vista si porterebbe dietro
  il DOM.
- **`core/` può scendere in `lib/`**, non salire nelle funzionalità.

Le rotture note stanno in un elenco di eccezioni **con la ragione scritta**.
Un'eccezione senza motivo non la toglie più nessuno.

## Le regole che non vanno rotte

**La riservatezza sta nel database, non nell'interfaccia.** Nascondere un
riquadro non nasconde niente: chi apre la console legge tutto ciò che è
arrivato al telefono. I dati si filtrano in `leggi_sezione()`, prima che
escano. La lettura diretta di `kitchen_data` è riservata al titolare.

Corollario già costato un buco: le policy di scrittura non si scrivono
`FOR ALL`, perché in Postgres comprende anche la SELECT.

**Le protezioni si provano su OGNI ruolo.** Titolare, può modificare, sola
lettura — e per ogni combinazione delle impostazioni della cucina. Un buco è
sfuggito perché avevo provato solo i due estremi.

**Le impostazioni di permesso stanno sulla riga della cucina**, mai nei suoi
dati: chi può modificare può scrivere i dati, e se stessero lì potrebbe
alzarsi i permessi da solo.

**In dubbio si sceglie l'ambiente di prova.** `config.js` ricade su `test`
con qualsiasi valore mancante o sbagliato: un errore deve costare una prova
ripetuta, non dati veri mescolati a dati finti.

**Non si scrive ciò che non si può leggere.**

**L'interfaccia nuova si fa a componenti, non a stringhe.** `ds/` contiene i
pezzi (`<cmd-bottone>`, `<cmd-campo>`, `<cmd-scelta>`, `<cmd-chip>`,
`<cmd-riquadro>`, `<cmd-vuoto>`), scritti in TypeScript perché le proprietà di
un componente sono la sua interfaccia pubblica. Le decisioni visive stanno
tutte in `ds/tokens.css`: se stai per scrivere `#b06b34` o `12px` dentro un
componente, o il token esiste già o va aggiunto lì.

Una schermata si divide in due: un **componente** che disegna e manda eventi
senza sapere cosa sia `state`, e un **collante** che traduce quegli eventi in
modifiche ai dati (vedi `turni/partite-vista.ts` + `turni/stazioni.js`). Il
vecchio schema — costruire HTML come stringa e riagganciare gli ascoltatori
dopo — ridisegnava la schermata intera a ogni modifica: il selettore del colore
si chiudeva da solo e il cursore usciva dal campo.

Ogni componente nuovo va nel banco (`npm run dev`, poi `/banco.html`), in
**ogni** stato: acceso, spento, vuoto, in errore, mentre lavora. Uno stato che
non sta nel banco è uno stato che nessuno guarderà mai.

## Ambienti

L'ambiente lo decide il **branch** al momento della build, non l'indirizzo:
`main` → produzione, ogni altro → prova. Sono due progetti Supabase distinti.

- `staging` → https://staging.comanda-bwj.pages.dev
- `main` → produzione (non ancora attiva: manca il Supabase di produzione)

La pipeline è `test → tipi → import → build → pubblica`. Se un controllo
fallisce non si pubblica.

## Cosa manca

- **Supabase di produzione**: senza, `main` non va pubblicato o i dati veri
  finirebbero nel database di prova.
- **Variabili su Cloudflare** (`SUPABASE_URL`, `SUPABASE_PUBLIC_KEY`,
  `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`): senza, le tre funzioni AI
  rispondono "servizio non configurato". Tutto il resto funziona.
- **Traduzioni**: l'impianto c'è, coperti markup e schede principali. Il resto
  dei moduli è ancora solo in italiano.
- **Modello dati**: ogni sezione è un blob JSON riscritto per intero a ogni
  salvataggio. A 5.000 ingredienti sono 620 KB per cambiare un prezzo. Il
  momento in cui va affrontato: oltre ~500 ingredienti per cucina, o due
  persone che modificano insieme.
- **Fonti fatture automatiche**: l'interfaccia `FonteFatture` è pronta. Il
  cassetto fiscale non espone API a terzi — si passa da un gestionale
  (Fatture in Cloud, Aruba, TeamSystem) o da un intermediario accreditato.
- **Uso offline**: non c'è. In cucina con wifi ballerino è un limite vero, ma
  fatto male blocca l'app su una versione vecchia per sempre.

## Verificare, non supporre

Il browser è lo strumento principale: `window.__comanda` espone stato, cucina,
ruolo e il client del database — apposta, per poter provare ad aggirare le
protezioni come farebbe qualcuno in malafede.

Cercare una stringa dentro il pacchetto costruito **non è una prova**: nel
pacchetto ci sono entrambe le configurazioni e una sola viene scelta. Si
esegue il codice e si guarda cosa fa.

I test coprono motore turni, fatture e ambienti. **Non coprono l'interfaccia**:
le due regressioni visive di un design system sono state trovate confrontando
schermate, non dai test.
