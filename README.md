# Comanda — l'app dello chef

App gestionale per uno chef: ricettario con food cost reale (ingredienti → sub-ricette →
piatti), anagrafica fornitori con import automatico da fatture elettroniche, brigata e
turni con generatore automatico, e un assistente AI personale.

Nessun backend: gira interamente nel browser, i dati restano salvati in locale
(`localStorage`) sul dispositivo/browser che usi.

## Struttura del progetto

```
app/
  comanda-chef-app.html   ← l'app vera e propria (quella che apri nel browser)
  logic.js                ← il motore di generazione turni, condiviso tra app e test
tests/
  turni.test.js           ← test automatici del motore turni
.github/workflows/ci.yml  ← esegue i test e pubblica il sito ad ogni push
CHANGELOG.md               ← cosa è cambiato, versione per versione
```

`logic.js` esiste come file separato apposta: è la parte più delicata dell'app (chi
lavora dove, rispettando qualifiche e quote) ed è quella su cui abbiamo già trovato un
bug reale in passato. Tenerla fuori dal file monolitico permette di testarla con Node,
senza bisogno di un browser, prima di ogni rilascio.

## Flusso di lavoro: staging → produzione

Due branch:

- **`staging`** — dove arrivano le modifiche nuove. Serve per provarle senza rischiare
  i dati veri.
- **`main`** — quello che usi ogni giorno in cucina. Ci arriva solo dopo che le
  modifiche in staging sono state testate e approvate.

Ad ogni push su uno dei due branch, GitHub Actions:
1. esegue automaticamente tutti i test (`npm test`) — se falliscono, il rilascio si
   ferma qui, prima che tu veda niente di rotto;
2. pubblica il sito su GitHub Pages: `main` va nella pagina principale (produzione),
   `staging` va sotto `/staging/` (ambiente di prova).

I dati delle due copie **non si mescolano mai**: l'app rileva da sola se sta girando
nella cartella `/staging/` e usa uno spazio di salvataggio separato (lo vedi anche a
schermo, un'etichetta "AMBIENTE DI TEST" compare in alto quando sei in staging).

### La routine quando arriva una modifica

1. La modifica viene pubblicata su `staging`.
2. Apri la versione di staging (`.../staging/`), provala con calma — puoi anche
   inserire dati finti, non tocca quelli veri.
3. Se va bene, la modifica viene promossa (merge) su `main`: da quel momento è quella
   che usi normalmente, alla stessa pagina di sempre.
4. Se qualcosa non va, resta solo su staging: la produzione non è mai stata toccata.

## Eseguire i test in locale

Serve solo Node.js (nessuna dipendenza da installare):

```
npm test
```

## Versionamento

Ogni rilascio in `main` ha un numero di versione (es. `v1.2.0`) e una voce nel
`CHANGELOG.md` che spiega cosa è cambiato. Se qualcosa si rompe, sappiamo esattamente
a quale versione tornare.
