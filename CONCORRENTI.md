# I concorrenti, e dove sta il buco

Settembre 2026. Non è un elenco di funzioni da copiare: è dove sta Comanda
rispetto agli altri, e cosa vale la pena prendere — migliorato.

## Il mercato è spaccato in due, e nessuno dei due pezzi fa l'altro

**Chi fa il food cost.** meez, Apicbase, reciProfity. Ricette, scandagli,
costo teorico, allergeni. meez ricalcola i piatti quando cambiano i prezzi
delle fatture — che è esattamente quello che fa Comanda con l'import
FatturaPA. Apicbase è il più preciso, pensato per il controllo di gestione.
Nessuno di questi sa cosa sia un turno.

**Chi fa i turni.** 7shifts, HotSchedules, When I Work, Sling. Orari, scambi,
disponibilità, costo del lavoro in tempo reale mentre costruisci il prospetto.
Nessuno di questi sa cosa costi un piatto.

**Chi fa tutto.** Restaurant365, CrunchTime. Contabilità, magazzino, food cost,
turni, paghe. Sono per catene: si comprano con un contratto annuale e si
installano con un progetto. Un ristorante singolo non li guarda nemmeno.

> **Il buco è lì in mezzo:** il ristorante singolo, o le tre-quattro unità
> dello stesso proprietario, che vogliono food cost **e** turni nello stesso
> posto senza il prezzo e la complessità di un Restaurant365.

È esattamente dove è nata Comanda, e non per strategia: perché è il problema
di chi la usa.

## Cosa Comanda ha già che gli altri non hanno

**Il generatore ragiona per PARTITE, non per posizioni.** Gli altri assegnano
«un cuoco» a «un turno». Comanda sa che al pass servono due persone a cena, che
Lorenc sa fare il pass e il lavaggio, e che **chi sta alle insalate dà una mano
al lavaggio senza spostarsi**. Quella copertura incrociata non l'ho vista da
nessun'altra parte, ed è il modo in cui una cucina funziona davvero.

**Le quote come vincolo, non come preferenza.** «Tre spezzati, due pranzi, due
riposi» è una regola che il generatore rispetta, non un suggerimento.

**Il ricettario a tre livelli** — ingredienti → sub-ricette → piatti — con la
resa a parte edibile. Un chilo di asparagi non è un chilo di asparagi puliti, e
questo lo sanno fare i costing tool seri ma non i gestionali generalisti.

## Cosa hanno loro, e vale la pena — migliorato

### 1. Il costo del lavoro DENTRO il prospetto (7shifts, HotSchedules) — **FATTO**

Loro mostrano quanto costa il turno mentre lo costruisci. Comanda contava le
**ore**, non i **soldi**: sapeva dirti che Marco fa 44 ore, non che quel
prospetto costa 3.200 €.

**Fatto, e migliorato.** Sotto il prospetto c'è «Quanto costa questo periodo»,
e la riga grossa non è il costo: è **l'incasso che serve a pagarlo**. Se il
personale costa 812 € non basta incassarne 812 — di ogni euro che entra, al 30%
di food cost, 30 centesimi se ne vanno in merce, e ne servono 1.160. È il conto
che gli altri non possono fare: hanno metà delle due metà.

Un dettaglio che vale più della formula: **se manca la tariffa di qualcuno il
riquadro lo dice, per nome.** Un totale più basso del vero, dentro un riquadro
che si chiama «quanto costa», non lo mette in dubbio nessuno.

E la tariffa oraria vuole **due** permessi, non uno: è un dato della persona ed
è un dato economico. Chi vede i costi ma non le persone ha comunque il totale
del periodo — lo somma il database e ne esce solo la somma.

### 2. Il divario fra costo teorico e costo reale (tutti quelli del food cost)

È **la** metrica del settore, e Comanda non ce l'ha. Sa quanto *dovrebbe*
costare un piatto; non sa quanto è stato comprato davvero.

**Migliorato:** Comanda ha già le fatture elettroniche che entrano da sole. Il
consumo reale per periodo è a portata — è la somma delle fatture — e
confrontarlo col teorico (piatti venduti × scandaglio) darebbe lo scostamento
senza far contare niente a nessuno. Gli altri lo ottengono con inventari
manuali settimanali, che è il motivo per cui non li fa quasi nessuno.

*Costo:* medio. Serve sapere quanti piatti si vendono — cioè un POS, o
l'inserimento a mano dei coperti.

### 3. Lo scambio turni fra colleghi (7shifts, When I Work)

Comanda ha le richieste — ferie, riposi, servizi — e il titolare che approva.
Non ha «Marco chiede a Giulia di scambiare sabato».

**Migliorato:** il generatore di Comanda sa se lo scambio **regge**. Può dire
«sì, ma Giulia sabato non sa fare il pass» prima che il titolare guardi. Gli
altri fanno passare la richiesta e lasciano decidere a occhio.

*Costo:* piccolo-medio. La struttura delle richieste c'è già.

### 4. La timbratura (Homebase, When I Work, Toast)

Comanda registra le ore effettive a mano, in Benessere.

**Da valutare, non da fare subito.** La timbratura vera vuole un dispositivo in
cucina o la geolocalizzazione, ed è un'altra categoria di prodotto. Ma il
confronto **ore pianificate contro ore fatte** Comanda ce l'ha già, ed è la
parte che serve a decidere.

### 5. La previsione dalle vendite (7shifts, Restaurant365)

«Sabato sera servono cinque persone perché gli ultimi otto sabati hanno fatto
questo incasso». Richiede il POS, e senza POS non si fa.

**Non prima di un'integrazione POS.** Ma vale la pena saperlo: è la funzione
che nei confronti fa la differenza, e il giorno che Comanda si collega a un
POS diventa possibile con i dati che già raccoglie.

## Quello che NON vale la pena inseguire

- **La contabilità.** È il territorio di Restaurant365, si scontra col
  commercialista, ed è dove si va a morire.
- **Il magazzino a giacenze.** Vuole conteggi quotidiani che in cucina non fa
  nessuno. Lo scostamento del punto 2 dà il 70% del valore con il 10% della
  fatica.
- **Il POS.** È un mercato saturo con concorrenti da miliardi. Meglio
  integrarsi.

## Se dovessi scegliere uno solo

Era **il numero 1: il costo del servizio, cucina e personale insieme** — ed è
fatto (settembre 2026). Piccolo, con dati che c'erano già, e dice una cosa che
**nessun concorrente può dire**, perché nessuno ha tutte e due le metà. È la
risposta alla domanda che uno chef si fa davvero il lunedì mattina, e che fino
a ieri si dava con un foglio di carta: *sabato ho guadagnato o no?*

**Il prossimo, quando si vorrà:** il numero 2, lo scostamento fra costo teorico
e costo reale. Le fatture entrano già da sole, quindi il consumo reale è a
portata; manca il pezzo delle vendite — un POS, o i coperti inseriti a mano.

---

Fonti: [Guideflow — kitchen management
software](https://www.guideflow.com/blog/kitchen-management-software) ·
[meez — menu engineering e food
costing](https://www.getmeez.com/blog/menu-engineering-food-costing-software) ·
[Tako Solutions — sette strumenti di food cost a
confronto](https://takosolutions.com/blog/restaurant-food-cost-software-7-tools-compared-2026-guide/) ·
[Restaurant365 — strumenti di pianificazione per piccoli
ristoranti](https://www.restaurant365.com/blog/7-top-staff-scheduling-tools-for-small-restaurants-2026/) ·
[Homebase — pianificazione del personale nella
ristorazione](https://www.joinhomebase.com/blog/restaurant-employee-scheduling)
