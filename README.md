# Comanda — l'app dello chef

App gestionale per uno chef: ricettario con food cost reale (ingredienti → sub-ricette →
piatti), anagrafica fornitori con import automatico da fatture elettroniche, brigata e
turni con generatore automatico, e un assistente AI personale.

L'app gira nel browser. I dati possono stare **solo sul dispositivo** (modalità locale,
per provarla) oppure **sull'account della cucina** (modalità cloud, condivisa tra più
persone con ruoli diversi).

## Struttura del progetto

```
app/
  comanda-chef-app.html   ← l'app vera e propria
  config.js               ← quale ambiente/database usare (produzione o test)
  cloud.js                ← account, cucine, ruoli, salvataggio dati
  logic.js                ← il motore di generazione turni, condiviso con i test
functions/
  api/ai.js               ← proxy server delle funzioni AI (tiene segreta la chiave API)
supabase/
  schema.sql              ← tabelle, ruoli e permessi del database
tests/
  turni.test.js           ← test automatici del motore turni
.github/workflows/ci.yml  ← test + pubblicazione ad ogni push
CHANGELOG.md              ← cosa è cambiato, versione per versione
```

## Come sono organizzati i dati e i permessi

Il contenitore di tutto è la **cucina**. Ogni persona appartiene a una cucina con un ruolo:

| Ruolo | Cosa può fare |
|---|---|
| **titolare** | tutto, più invitare persone e cambiare i loro ruoli |
| **può modificare** | legge e modifica ricettario, turni, fornitori, brigata |
| **sola lettura** | vede tutto, non può modificare niente |

Il permesso non è solo un bottone nascosto: è applicato da Postgres tramite Row Level
Security (`supabase/schema.sql`). Anche chiamando l'API a mano, chi è in sola lettura non
riesce a scrivere. L'interfaccia si limita a spiegarlo in modo comprensibile.

La conversazione con l'assistente AI resta **personale** di ciascun utente: la cucina è
condivisa, il proprio sous-chef no.

Se due persone modificano la stessa sezione contemporaneamente, chi salva per secondo
riceve un avviso di ricaricare invece di sovrascrivere in silenzio il lavoro dell'altro.

## Le funzioni AI e la chiave API

Le tre funzioni AI (stima resa degli ingredienti dalle fatture, lettura ricetta da foto,
assistente sous-chef) **non** parlano direttamente con Anthropic dal browser: passano da
`functions/api/ai.js`, che gira sul server. Solo quel file conosce la chiave API.

Prima di inoltrare qualsiasi richiesta il proxy verifica chi chiama, che sia membro della
cucina dichiarata, che la cucina non sia sospesa e che non abbia superato il tetto mensile
di chiamate. Modello e limiti di spesa li decide il server, non il browser.

## Ambienti: test e produzione

Due branch e due ambienti completamente separati:

- **`staging`** → `staging.<progetto>.pages.dev` — dove si prova. Punta a un **progetto
  Supabase dedicato**, quindi i dati di prova stanno in un database diverso da quello
  vero: non possono mescolarsi. A schermo compare l'etichetta "AMBIENTE DI TEST".
- **`main`** → l'indirizzo di produzione — quello che si usa in cucina.

Ad ogni push, GitHub Actions esegue i test; **solo se passano** pubblica su Cloudflare
Pages. Se un test fallisce, il rilascio si ferma prima che qualcosa di rotto arrivi in
cucina.

### La routine quando arriva una modifica

1. La modifica viene pubblicata su `staging`.
2. La provi sull'indirizzo di staging, con dati finti: non tocca quelli veri.
3. Se va bene, viene promossa (merge) su `main`.
4. Se qualcosa non va, resta su staging: la produzione non è mai stata toccata.

## Attivare la modalità cloud

Finché `app/config.js` ha i campi vuoti, l'app funziona in **modalità locale**: dati nel
browser, nessun account, funzioni AI spente. Per attivare account e condivisione:

1. **Supabase** — crea due progetti su [supabase.com](https://supabase.com): uno per la
   produzione e uno per il test. In ciascuno, apri il *SQL Editor* ed esegui
   `supabase/schema.sql`.
2. **config.js** — copia `Project URL` e `anon public key` di ciascun progetto nei campi
   corrispondenti (`produzione` e `test`) di `app/config.js`. Sono chiavi pubbliche,
   pensate per stare nel browser: a proteggere i dati sono le policy del database.
3. **Cloudflare Pages** — crea un progetto Pages chiamato `comanda`. Disattiva
   l'integrazione Git automatica di Cloudflare: a pubblicare ci pensa GitHub Actions,
   così i test restano il cancello d'ingresso.
4. **Segreti GitHub** — in *Settings → Secrets and variables → Actions* aggiungi
   `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`.
5. **Variabili Cloudflare** — nelle impostazioni del progetto Pages, per **Production** e
   **Preview** separatamente, imposta: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` e `ANTHROPIC_API_KEY`. Le ultime due vanno marcate come
   *secret*. Preview usa i valori del progetto Supabase di test.

Per il test interno conviene disattivare la conferma via email in Supabase
(*Authentication → Providers → Email*): si creano gli account della brigata senza dover
girare per caselle di posta. Prima di aprire l'app a persone esterne, riattivala.

## Eseguire i test in locale

Serve solo Node.js (nessuna dipendenza da installare):

```bash
npm test
```

## Prima di vendere l'app

L'infrastruttura è pronta per essere commercializzata, ma la parte commerciale è
volutamente **non ancora costruita**: prima va provata sul campo. Ogni cucina ha un campo
`status` (`trial` / `active` / `suspended`) che governa l'accesso ed è già slegato dal
metodo di vendita — così, quando la decisione sarà presa, si aggiunge il pagamento senza
riscrivere il resto.

Restano da fare, in ordine:

1. **Provarla sul campo** nelle proprie cucine, con la brigata vera.
2. **Decidere il modello** (abbonamento ricorrente o acquisto una tantum) e il prezzo,
   tenendo conto del costo variabile delle chiamate AI.
3. **Posizione fiscale**: serve una P.IVA per fatturare. Da valutare con un
   commercialista, insieme al regime da adottare.
4. **Pagamenti**: integrare Stripe, che scriverà lo `status` della cucina.
5. **Adempimenti legali**: Termini di servizio e Privacy policy. L'app tratta dati
   personali di dipendenti (nomi, contatti, ore lavorate), quindi servono informativa
   GDPR e, verso i clienti, un accordo come responsabile del trattamento.

## Versionamento

Ogni rilascio in `main` ha un numero di versione (es. `v1.2.0`) e una voce nel
`CHANGELOG.md`. Se qualcosa si rompe, sappiamo a quale versione tornare.
