# Comanda — note per chi ci lavora

App gestionale per chef: ricettario con food cost, brigata, turni, richieste
del personale, assistente AI. Italiano e inglese.

## Come si lavora

```bash
npm ci          # richiede Node >= 22.6 (i test caricano moduli .ts direttamente)
npm run dev     # sviluppo, ricarica a caldo — le funzioni server NON girano
npm run preview # build + wrangler: come in produzione, funzioni server comprese
npm test        # 233 test
npm run typecheck
npm run lint:import
npm run lint:lingue  # quanto coprono i dizionari (non blocca)
```

`npm run preview` legge `.dev.vars` (non versionato: copia `.dev.vars.example`).
Serve solo per le funzioni server — AI e raccolta errori.

**Prima di ogni push**, gli stessi quattro controlli della pipeline:
`npm test && npm run typecheck && npm run lint:import && npm run build`

**La build va guardata, non solo lanciata.** `tsc` non controlla i `.js`, e il
controllo degli import non vede i nomi doppi: una funzione importata che si
chiama come una locale la trova SOLO la build, e a quel punto la locale chiama
se stessa. È già successo.

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

**L'interfaccia si fa a componenti, non a stringhe.** `ds/` contiene i pezzi,
scritti in TypeScript perché le proprietà di un componente sono la sua
interfaccia pubblica:

| | |
|---|---|
| `<cmd-bottone>` | quattro varianti = quattro significati; sa di stare lavorando |
| `<cmd-campo>` | etichetta, aiuto, errore — e li LEGA al controllo |
| `<cmd-scelta>` | la tendina, con o senza ricerca. Mai più `<select>` nativi |
| `<cmd-chip>` | un interruttore che si legge come un'etichetta |
| `<cmd-interruttore>` | sì/no con una frase che spiega; tutta la riga è il comando |
| `<cmd-riquadro>` | superficie con titolo e comandi; comprimibile (parte chiuso) |
| `<cmd-scheda>` | la riga di elenco con i comandi a destra |
| `<cmd-etichetta>` | uno stato in una parola: neutro, allarme, ok |
| `<cmd-avviso>` | una cosa da sapere; resta finché resta la ragione |
| `<cmd-dialogo>` | l'elemento `<dialog>` nativo: fuoco dentro, Esc, top layer |
| `<cmd-comanda>` | la carta strappata: piatti, sub-ricette, menu |
| `<cmd-vuoto>` | il primo passo, non un vicolo cieco |
| `<cmd-ricerca>` | cercare in un elenco: accenti, parole fuori ordine, conteggio |

Le decisioni visive stanno tutte in `ds/tokens.css`: se stai per scrivere
`#b06b34` o `12px` dentro un componente, o il token esiste già o va aggiunto lì.
`styles.css` è sceso da 800 a **454 righe**, e i punti che scrivono HTML come
stringa da 89 a 8: ogni schermata che diventa componente si porta via il
proprio stile. Gli otto rimasti sono messaggi brevi (la navigazione, la
schermata «controlla la posta», il dettaglio del generatore).

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

## I sedici punti della prova in cucina

Provata coi colleghi, l'agosto 2026, sono usciti sedici punti. Undici fatti,
uno per commit — il messaggio di ognuno spiega cosa e perché.

| | | |
|---|---|---|
| 16 | caratteri più leggibili | fatto (in due passate) |
| 8 | chiaro e scuro | fatto |
| 15 | tutto nel profilo | fatto |
| 1 | menu sempre visibile | fatto |
| 14 | valute | fatto |
| 2 | spagnolo | fatto — 519 frasi × 3 lingue |
| 4 | blocchi sugli stati impossibili | fatto |
| 7 | si vede che ha salvato | fatto |
| 6 | ricerca in sei elenchi | fatto |
| 9 | quello che sembra cliccabile lo è | fatto |
| 12 | dashboard | fatto |
| 11 | permesso per le richieste altrui | codice fatto, migrazione applicata |
| 5 | notifiche | fatto |
| 13 | iscrizione con QR e link | fatto |
| 10 | modifiche in tempo reale | fatto — ha richiesto di spezzare il modello dati, vedi `supabase/PIANO-modello-dati.md` |
| 3 | studio dei concorrenti | fatto — vedi `CONCORRENTI.md` |

**Il tempo reale sui DATI della cucina non è banale, e la ragione è precisa.**

Realtime di Supabase rispetta RLS: manda una riga solo a chi potrebbe leggerla
con una `select`. E su `kitchen_data` la `select` ce l'ha **solo il titolare**
(`data_select`) — tutti gli altri passano da `leggi_sezione()`, che REDIGE:
toglie i prezzi a chi non li vede, i telefoni a chi non li vede, i turni non
pubblicati.

Quindi abilitando Realtime su `kitchen_data` oggi **non si aprirebbe un buco**:
semplicemente non funzionerebbe per nessuno tranne il titolare, cioè per
nessuno di quelli a cui serve.

**La trappola è il passo dopo**, ed è per questo che sta scritto qui: chi vede
che «non arriva niente» è tentato di allargare `data_select` a tutti i membri.
Quello sì che aprirebbe il buco — e in un modo che non si nota, perché tutto
comincerebbe a funzionare benissimo. La redazione dei campi dentro un blob JSON
RLS non la sa fare: filtra righe, non campi.

Le due strade vere sono: un canale che porta solo «la sezione X è cambiata,
versione N» (nessun dato, poi si rilegge da `leggi_sezione()`), oppure spezzare
`kitchen_data` in tabelle vere con colonne — che è la stessa cosa che chiede la
voce «Modello dati» qui sotto, e che regalerebbe il tempo reale come effetto
collaterale.

Le migrazioni da applicare a mano stanno in `supabase/migrazioni/`, numerate.
`schema.sql` resta la fonte di verità per una cucina nuova; le migrazioni
servono a chi ce l'ha già.

## Cosa manca

- **Supabase di produzione**: senza, `main` non va pubblicato o i dati veri
  finirebbero nel database di prova.
- **Variabili su Cloudflare** (`SUPABASE_URL`, `SUPABASE_PUBLIC_KEY`,
  `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`): senza, le tre funzioni AI
  rispondono "servizio non configurato". Tutto il resto funziona.

- ~~**Modello dati**~~: **fatto**. Le sezioni sono tabelle vere, si scrive solo
  quello che cambia, e la riservatezza sta nella FORMA dei dati — quello che
  una persona non deve vedere sta in una tabella che quella persona non legge.
  Il perché e come sta in `supabase/PIANO-modello-dati.md`.
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

I test coprono motore turni, fatture, valuta e ambienti. Dell'interfaccia
coprono **il contrasto**: `banco/contrasto.ts` misura ogni testo della pagina
nei due temi (bottone «Prova il contrasto» nel banco). Il resto no:
le due regressioni visive di un design system sono state trovate confrontando
schermate, non dai test.
