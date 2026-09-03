// ============================================================================
// IL BANCO — ogni componente, in ogni stato, da solo.
//
// A COSA SERVE DAVVERO
//
// Finora per guardare un pulsante bisognava avviare l'app, entrare con un
// account, scegliere una cucina, arrivare alla schermata giusta e avere i dati
// giusti dentro. Cinque passaggi per vedere un bordo. E lo stato «mentre sta
// lavorando» o «disabilitato e in errore» spesso non lo si vedeva mai, perche'
// per farlo comparire serviva un guasto vero.
//
// Qui ogni stato e' una riga di codice. E' quello che permette a piu' persone
// di lavorare sull'aspetto senza pestarsi i piedi, e a chi rivede il lavoro di
// guardare una pagina sola invece di dodici schermate.
//
// SARA' ANCHE IL BANCO DI PROVA VISIVO — non lo e' ancora, e vale la pena
// dirlo invece di lasciarlo intendere. CLAUDE.md dice che i test non coprono
// l'interfaccia, e che le due regressioni visive di questo progetto sono state
// trovate confrontando schermate a mano. Ogni caso qui sotto ha un `data-caso`
// apposta: e' l'appiglio a cui si aggancera' un confronto automatico di
// schermate, cosi' che un bordo che cambia da solo faccia fallire una prova
// invece di arrivare in cucina. Manca il pezzo che scatta le foto, e costa
// una dipendenza vera (un browser senza schermo dentro la pipeline).
//
// PERCHE' STA IN banco/ E NON IN ds/: il banco mostra anche schermate intere
// dell'app, quindi importa da turni/. ds/ non puo' farlo — e' la regola che
// tiene il design system riusabile. Il controllo dei confini ha bocciato
// questo file il primo giorno, quando stava ancora nella cartella sbagliata.
//
// COME SI AGGIUNGE UN CASO: una voce in GRUPPI. Nient'altro.
// ============================================================================
import { html, render, type TemplateResult } from 'lit';
import '../ds/bottone.ts';
import '../ds/campo.ts';
import '../ds/chip.ts';
import '../ds/riquadro.ts';
import '../ds/scelta.ts';
import '../ds/vuoto.ts';
import type { Opzione } from '../ds/scelta.ts';
// Una SCHERMATA INTERA dell'app, qui dentro, senza account e senza database.
// E' il punto di tutto questo lavoro: chi disegna le partite non deve piu'
// avere una cucina vera per vederle.
import '../turni/partite-vista.ts';
import type { PartitaVista } from '../turni/partite-vista.ts';
import '../ds/interruttore.ts';
import '../viste/brigata-vista.ts';
import type { PersonaVista } from '../viste/brigata-vista.ts';
import '../viste/persona-vista.ts';
import type { PartitaScelta, PersonaModifica } from '../viste/persona-vista.ts';
import '../turni/quote-vista.ts';
import type { CodiceTurno, QuotaPersona } from '../turni/quote-vista.ts';
import '../turni/fabbisogno-vista.ts';
import type { ServizioFabbisogno } from '../turni/fabbisogno-vista.ts';
import '../turni/capienza-vista.ts';
import type { Conto } from '../turni/capienza-vista.ts';
import '../turni/servizi-vista.ts';
import type { ServizioVista, TipoTurnoVista } from '../turni/servizi-vista.ts';

interface Caso {
  id: string;
  titolo: string;
  /** Cosa dimostra questo caso, e perche' esiste. */
  nota?: string;
  contenuto: () => TemplateResult;
}

interface Gruppo {
  nome: string;
  casi: Caso[];
}

const PARTITE: Opzione[] = [
  { valore: 'pass', etichetta: 'Pass' },
  { valore: 'antipasti', etichetta: 'Antipasti' },
  { valore: 'primi', etichetta: 'Primi' },
  { valore: 'secondi', etichetta: 'Secondi' },
  { valore: 'insalate', etichetta: 'Insalate' },
  { valore: 'lavaggio', etichetta: 'Lavaggio', disabilitata: true },
];

/* Le stesse sei partite della cucina di prova, gia' pronte da disegnare. I
   colori sono quelli automatici convertiti in esadecimale, come fa l'app. */
const PARTITE_VISTA: PartitaVista[] = [
  { id: 'pass',      nome: 'Pass',      colore: '#b8873f', copre: [] },
  { id: 'antipasti', nome: 'Antipasti', colore: '#7bb87f', copre: [] },
  { id: 'primi',     nome: 'Primi',     colore: '#5ec2a8', copre: [] },
  { id: 'secondi',   nome: 'Secondi',   colore: '#6aa8d6', copre: [] },
  { id: 'insalate',  nome: 'Insalate',  colore: '#a48ad6', copre: ['lavaggio'] },
  { id: 'lavaggio',  nome: 'Lavaggio',  colore: '#d67fa8', copre: [] },
];

/* Quattro persone scelte per COPRIRE I CASI, non per riempire: due partite con
   priorita', nessuna partita, fuori dagli extra, e una senza contatti. Un banco
   di prova in cui vanno tutti bene non prova niente. */
const BRIGATA_VISTA: PersonaVista[] = [
  { id: '1', nome: 'Lorenc', ruolo: 'Chef de partie', ore: '49',
    telefono: '333 1234567', email: 'lorenc@ristorante.it',
    partite: ['Pass', 'Primi'], fuoriExtra: false },
  { id: '2', nome: 'Chamo', ruolo: 'Sous Chef', ore: '40',
    telefono: '', email: 'chamo@ristorante.it',
    partite: [], fuoriExtra: false },
  { id: '3', nome: 'Alessio', ruolo: 'Commis', ore: '28',
    telefono: '347 7654321', email: '',
    partite: ['Pass'], fuoriExtra: true },
  { id: '4', nome: 'Rabby', ruolo: 'Plongeur', ore: '',
    telefono: '', email: '',
    partite: ['Lavaggio'], fuoriExtra: true },
];

const RUOLI = ['Chef', 'Sous Chef', 'Chef de partie', 'Cuoco', 'Commis', 'Pasticcere', 'Plongeur'];

const STAZIONI_SCELTA: PartitaScelta[] = PARTITE_VISTA.map(p => ({ id: p.id, nome: p.nome }));

const MEMBRI = [
  { id: 'u1', nome: 'lorenc@ristorante.it', email: 'lorenc@ristorante.it' },
  { id: 'u2', nome: 'Valerio', email: 'valerio@ristorante.it' },
];

const PERSONA_PIENA: PersonaModifica = {
  id: 'lorenc', nome: 'Lorenc', ruolo: 'Chef de partie', ore: '49',
  telefono: '333 1234567', email: 'lorenc@ristorante.it',
  partite: ['pass', 'primi'], fuoriExtra: false, accountId: 'u1',
};

const PERSONA_NUOVA: PersonaModifica = {
  id: 'nuova', nome: '', ruolo: 'Cuoco', ore: '',
  telefono: '', email: '', partite: [], fuoriExtra: false, accountId: '',
};

const CODICI: CodiceTurno[] = [
  { codice: 'P', etichetta: 'Pranzo' },
  { codice: 'S', etichetta: 'Cena' },
  { codice: 'SP', etichetta: 'Spezzato' },
  { codice: 'P1', etichetta: 'Pranzo01' },
  { codice: 'R', etichetta: 'Riposo' },
];

/* Tre quote: una giusta, una che non arriva a sette e una che sfora. Il totale
   accanto al nome e' l'unico modo di accorgersene senza contare a mano. */
const QUOTE: QuotaPersona[] = [
  { id: 'q1', nome: 'Lorenc', stazioni: ['pass', 'primi'],
    gruppi: [ { conteggio: 2, codici: ['R'] }, { conteggio: 3, codici: ['SP'] },
              { conteggio: 2, codici: ['S', 'P'] } ] },
  { id: 'q2', nome: 'Carlos', stazioni: ['pass'],
    gruppi: [ { conteggio: 3, codici: ['R'] }, { conteggio: 2, codici: ['P1'] } ] },
  { id: 'q3', nome: 'Samad', stazioni: [],
    gruppi: [ { conteggio: 2, codici: ['R'] }, { conteggio: 7, codici: ['SP'] } ] },
];

const SERVIZI: ServizioFabbisogno[] = [
  { id: 'pranzo', nome: 'Pranzo', righe: [
    { stazioneId: 'pass', conteggio: 1 }, { stazioneId: 'antipasti', conteggio: 1 },
    { stazioneId: 'primi', conteggio: 1 }, { stazioneId: 'lavaggio', conteggio: 2 } ] },
  { id: 'cena', nome: 'Cena', righe: [] },
];

/* Un conto che NON torna: due posti scoperti al lavaggio e una partita che
   nessuno sa fare. E' lo stato che conta — un conto in pari non ha niente da
   dire e non mette alla prova ne' i colori ne' le barre. */
const CONTO: Conto = {
  periodo: '1 – 7 set', giorni: 7, domanda: 98, coperti: 96, extra: 2,
  senzaNessuno: ['Pasticceria'],
  righe: [
    { nome: 'Pass', colore: '#b8873f', domanda: 14, coperti: 14, mancanti: 0,
      rimbalzo: 0, qualificati: 4, donatori: [], servizi: 'Pranzo 1 · Cena 1' },
    { nome: 'Insalate', colore: '#a48ad6', domanda: 14, coperti: 14, mancanti: 0,
      rimbalzo: 0, qualificati: 2, donatori: [], servizi: 'Pranzo 1 · Cena 1' },
    { nome: 'Lavaggio', colore: '#d67fa8', domanda: 28, coperti: 26, mancanti: 2,
      rimbalzo: 6, qualificati: 4, donatori: ['Insalate'], servizi: 'Pranzo 2 · Cena 2' },
    { nome: 'Pasticceria', colore: '#7bb87f', domanda: 7, coperti: 0, mancanti: 7,
      rimbalzo: 0, qualificati: 0, donatori: [], servizi: 'Cena 1' },
  ],
};

/* Due servizi e un terzo che NESSUN turno copre: e' lo stato che va visto,
   perche' e' l'unico che dice qualcosa a chi sta configurando. */
const SERVIZI_VISTA: ServizioVista[] = [
  { id: 'pranzo', nome: 'Pranzo', copertoDa: ['P', 'SP', 'P1'] },
  { id: 'cena', nome: 'Cena', copertoDa: ['S', 'SP'] },
  { id: 'aperitivo', nome: 'Aperitivo', copertoDa: [] },
];

const TIPI_TURNO: TipoTurnoVista[] = [
  { id: 't1', sigla: 'P', orario: '9:00–17:00', ore: 8, colore: '#b06b34', servizi: ['pranzo'] },
  { id: 't2', sigla: 'SP', orario: '10:00–15:00 · 19:00–24:00', ore: 11, colore: '#6b8064',
    servizi: ['pranzo', 'cena'] },
  { id: 't3', sigla: 'T1', orario: 'da compilare', ore: 8, colore: '#b8873f', servizi: [] },
  { id: 't4', sigla: 'R', orario: '', ore: 0, colore: '#2e2a25', servizi: ['pranzo'],
    errore: '«R» è riservata (R · Riposo)' },
];

const GRUPPI: Gruppo[] = [
  {
    nome: 'cmd-bottone',
    casi: [
      {
        id: 'bottone-varianti',
        titolo: 'Le quattro varianti',
        nota: 'Quattro significati, non quattro gusti. In una schermata ci va UNA sola azione principale.',
        contenuto: () => html`
          <div class="fila">
            <cmd-bottone variante="principale">Genera turni</cmd-bottone>
            <cmd-bottone variante="fantasma">Svuota</cmd-bottone>
            <cmd-bottone variante="pericolo">Elimina</cmd-bottone>
            <cmd-bottone variante="piano">Dettagli</cmd-bottone>
          </div>`,
      },
      {
        id: 'bottone-stati',
        titolo: 'Sta lavorando, e non si puo’ premere',
        nota: 'La rotellina prende il posto di un’icona: il bottone non cambia larghezza mentre lavora, cosi’ i comandi accanto non scappano sotto il dito.',
        contenuto: () => html`
          <div class="fila">
            <cmd-bottone variante="principale" in-corso>Genero…</cmd-bottone>
            <cmd-bottone variante="principale" disabilitato>Pubblica</cmd-bottone>
            <cmd-bottone variante="fantasma" in-corso>Salvo…</cmd-bottone>
            <cmd-bottone variante="fantasma" disabilitato>Revoca</cmd-bottone>
          </div>`,
      },
      {
        id: 'bottone-misure',
        titolo: 'Misure e larghezza piena',
        nota: 'Su un dispositivo a tocco l’altezza sale a 44px da sola: la regola guarda il puntatore, non la larghezza dello schermo.',
        contenuto: () => html`
          <div class="fila">
            <cmd-bottone misura="piccolo" variante="fantasma">▲</cmd-bottone>
            <cmd-bottone misura="piccolo" variante="fantasma">▼</cmd-bottone>
            <cmd-bottone misura="piccolo" variante="pericolo">Elimina</cmd-bottone>
          </div>
          <div style="max-width:280px;margin-top:12px">
            <cmd-bottone pieno variante="principale">Entra</cmd-bottone>
          </div>`,
      },
    ],
  },
  {
    nome: 'cmd-scelta',
    casi: [
      {
        id: 'scelta-chiusa',
        titolo: 'Chiusa, scelta, vuota, spenta',
        nota: 'Sostituisce il <select> nativo, che su Windows apre il menu grigio di sistema — l’unico pezzo di schermata che non ubbidiva ai token.',
        contenuto: () => html`
          <div class="griglia">
            <cmd-scelta etichetta="Partita" .opzioni=${PARTITE} valore="primi"></cmd-scelta>
            <cmd-scelta etichetta="Partita" .opzioni=${PARTITE} segnaposto="Nessuna partita"></cmd-scelta>
            <cmd-scelta etichetta="Partita" .opzioni=${PARTITE} valore="pass" disabilitato></cmd-scelta>
          </div>`,
      },
      {
        id: 'scelta-dentro-campo',
        titolo: 'Dentro un campo, con aiuto ed errore',
        contenuto: () => html`
          <div class="griglia">
            <cmd-campo etichetta="Partita principale" aiuto="La prima conta piu’ delle altre: e’ dove la persona va per prima.">
              <cmd-scelta .opzioni=${PARTITE} valore="secondi"></cmd-scelta>
            </cmd-campo>
            <cmd-campo etichetta="Partita" errore="Scegli una partita: senza, il generatore non assegna nessun turno.">
              <cmd-scelta .opzioni=${PARTITE}></cmd-scelta>
            </cmd-campo>
          </div>`,
      },
    ],
  },
  {
    nome: 'cmd-campo',
    casi: [
      {
        id: 'campo-nativi',
        titolo: 'I controlli nativi restano nativi',
        nota: 'Per testo, numeri e date il browser fa meglio di noi: tastiere, riempimento automatico, calendario di sistema. Il campo mette solo etichetta, aiuto ed errore — e li lega, cosa che il markup a mano non faceva mai.',
        contenuto: () => html`
          <div class="griglia">
            <cmd-campo etichetta="Nome della partita" obbligatorio>
              <input type="text" value="Antipasti">
            </cmd-campo>
            <cmd-campo etichetta="Ore settimanali" aiuto="Quelle del contratto, non quelle fatte.">
              <input type="number" value="40">
            </cmd-campo>
            <cmd-campo etichetta="Email" errore="Questa email e’ gia’ collegata a un’altra persona della brigata.">
              <input type="email" value="mario@ristorante.it">
            </cmd-campo>
            <cmd-campo etichetta="Note" aiuto="Le vede solo chi puo’ modificare.">
              <textarea>Rientra dalle ferie il 12.</textarea>
            </cmd-campo>
          </div>`,
      },
      {
        id: 'campo-orizzontale',
        titolo: 'Etichetta a fianco',
        nota: 'Per le righe fitte, dove l’etichetta sopra farebbe crescere la riga del doppio.',
        contenuto: () => html`
          <cmd-campo etichetta="Servono" orizzontale>
            <input type="number" value="2">
          </cmd-campo>`,
      },
    ],
  },
  {
    nome: 'cmd-riquadro',
    casi: [
      {
        id: 'riquadro-semplice',
        titolo: 'Titolo, sottotitolo, comandi',
        contenuto: () => html`
          <cmd-riquadro titolo="Ore extra del periodo"
                        sottotitolo="Quanto si discosta ciascuno dal proprio contratto">
            <cmd-bottone slot="azioni" variante="piano">Dettagli</cmd-bottone>
            <p class="testo">Nessuno sopra il contratto in questa settimana.</p>
          </cmd-riquadro>`,
      },
      {
        id: 'riquadro-chiuso',
        titolo: 'Comprimibile — chiuso e aperto',
        nota: '«Per vedere i turni bisogna scorrere troppo». Un riquadro che si chiude tiene in pagina quello che serve ogni tanto senza pagarlo ogni giorno.',
        contenuto: () => html`
          <cmd-riquadro comprimibile titolo="Il conto della capienza"
                        sottotitolo="98 servono · 96 coperti · 2 extra inevitabili">
            <p class="testo">Il dettaglio per partita.</p>
          </cmd-riquadro>
          <cmd-riquadro comprimibile aperto titolo="Il conto della capienza"
                        sottotitolo="98 servono · 96 coperti · 2 extra inevitabili">
            <p class="testo">Il dettaglio per partita.</p>
          </cmd-riquadro>`,
      },
    ],
  },
  {
    nome: 'cmd-chip',
    casi: [
      {
        id: 'chip',
        titolo: 'Acceso, spento, spento e bloccato',
        nota: 'Questo schema esisteva gia’ a mano in cinque schermate, e i cinque erano gia’ partiti ad allontanarsi: in una fila i chip avevano 5px di riempimento, in un’altra 8.',
        contenuto: () => html`
          <div class="fila">
            <cmd-chip acceso>Pranzo</cmd-chip>
            <cmd-chip>Cena</cmd-chip>
            <cmd-chip acceso>Spezzato</cmd-chip>
            <cmd-chip disabilitato>Colazione</cmd-chip>
          </div>`,
      },
    ],
  },
  {
    nome: 'cmd-partite — una schermata intera',
    casi: [
      {
        id: 'partite-piene',
        titolo: 'Le sei partite di una cucina vera',
        nota: 'Non e’ una finta: e’ lo stesso componente che gira dentro Impostazioni cucina. Qui riceve i dati da una costante invece che dal database, e non se ne accorge — non sa cosa sia un database.',
        contenuto: () => html`<cmd-partite .partite=${PARTITE_VISTA}></cmd-partite>`,
      },
      {
        id: 'partite-vuote',
        titolo: 'Prima che ce ne sia una',
        contenuto: () => html`<cmd-partite .partite=${[]}></cmd-partite>`,
      },
      {
        id: 'partite-sola-lettura',
        titolo: 'Chi puo’ solo guardare',
        nota: 'I comandi spariscono invece di restare spenti: qui dentro non c’e’ niente da leggere in un bottone Elimina disattivato.',
        contenuto: () => html`<cmd-partite solo-lettura .partite=${PARTITE_VISTA}></cmd-partite>`,
      },
    ],
  },
  {
    nome: 'cmd-interruttore',
    casi: [
      {
        id: 'interruttore',
        titolo: 'Acceso, spento, bloccato',
        nota: 'Tutta la riga e’ il comando, titolo e spiegazione compresi: una casella da 18px e’ un bersaglio che si sbaglia col dito.',
        contenuto: () => html`
          <cmd-interruttore acceso titolo="Può fare turni extra"
            spiega="Quando il fabbisogno supera le quote della brigata, il generatore può assegnarle un turno oltre la sua quota."></cmd-interruttore>
          <cmd-interruttore titolo="Chi può modificare vede i costi"
            spiega="Spenta, i prezzi e il food cost restano solo a te. Il database non li manda proprio: non è un riquadro nascosto."></cmd-interruttore>
          <cmd-interruttore disabilitato titolo="Uso offline"
            spiega="Non disponibile in questa versione."></cmd-interruttore>`,
      },
    ],
  },
  {
    nome: 'cmd-scheda-persona — una schermata intera',
    casi: [
      {
        id: 'persona-modifica',
        titolo: 'Modifica, con due partite in ordine di priorità',
        nota: 'La prima riga e’ accesa in rame e porta il rango scritto: un elenco che si riordina e basta non dice a nessuno che il primo conta piu’ degli altri.',
        contenuto: () => html`
          <cmd-scheda-persona .persona=${PERSONA_PIENA} .stazioni=${STAZIONI_SCELTA}
                              .ruoli=${RUOLI} .membri=${MEMBRI} ?nuova=${false}></cmd-scheda-persona>`,
      },
      {
        id: 'persona-nuova',
        titolo: 'Nuova, e senza account collegabili',
        nota: 'Senza membri con un account la sezione «Account collegato» non compare: una tendina con una sola voce vuota e’ una domanda a cui non si puo’ rispondere.',
        contenuto: () => html`
          <cmd-scheda-persona .persona=${PERSONA_NUOVA} .stazioni=${STAZIONI_SCELTA}
                              .ruoli=${RUOLI} .membri=${[]} nuova></cmd-scheda-persona>`,
      },
      {
        id: 'persona-senza-stazioni',
        titolo: 'Quando in cucina non c’è ancora nessuna partita',
        contenuto: () => html`
          <cmd-scheda-persona .persona=${PERSONA_NUOVA} .stazioni=${[]}
                              .ruoli=${RUOLI} .membri=${[]} nuova></cmd-scheda-persona>`,
      },
    ],
  },
  {
    nome: 'cmd-servizi e cmd-tipi-turno — una schermata intera',
    casi: [
      {
        id: 'servizi',
        titolo: 'Tre servizi, e uno che nessun turno copre',
        nota: 'Le frecce: il primo scende soltanto, l’ultimo sale soltanto, quello in mezzo fa tutte e due. Con due soli servizi ne comparivano DUE in su e nessuna che scendesse — segnalato dal proprietario.',
        contenuto: () => html`<cmd-servizi .servizi=${SERVIZI_VISTA}></cmd-servizi>`,
      },
      {
        id: 'tipi-turno',
        titolo: 'Uno normale, uno spezzato, uno vuoto, uno rifiutato',
        nota: 'La sigla rifiutata mostra il perché SOTTO il campo. Prima lo diceva un avviso in fondo allo schermo, che spariva mentre stavi ancora guardando il campo.',
        contenuto: () => html`
          <cmd-tipi-turno .tipi=${TIPI_TURNO} .servizi=${SERVIZI_VISTA}></cmd-tipi-turno>`,
      },
      {
        id: 'tipi-turno-senza-servizi',
        titolo: 'Prima che esistano i servizi',
        contenuto: () => html`
          <cmd-tipi-turno .tipi=${TIPI_TURNO.slice(0, 1)} .servizi=${[]}></cmd-tipi-turno>`,
      },
    ],
  },
  {
    nome: 'cmd-capienza',
    casi: [
      {
        id: 'capienza',
        titolo: 'Il conto, chiuso e aperto',
        nota: 'La barra non e’ decorazione: e’ l’unica cosa che si vede senza leggere. Il pieno verde e’ quello che le quote coprono, il fondo rosso e’ il buco. Al primo giro era il contrario, e si leggeva «rosso = tanto coperto».',
        contenuto: () => html`
          <cmd-capienza .conto=${CONTO}></cmd-capienza>
          <cmd-capienza .conto=${CONTO} .aperto=${true}></cmd-capienza>`,
      },
      {
        id: 'capienza-vuota',
        titolo: 'Senza fabbisogno impostato: sparisce',
        nota: 'Un riquadro di zeri occuperebbe lo schermo per dire «non hai ancora deciso niente».',
        contenuto: () => html`<cmd-capienza .conto=${null}></cmd-capienza>`,
      },
    ],
  },
  {
    nome: 'cmd-fabbisogno — una schermata intera',
    casi: [
      {
        id: 'fabbisogno',
        titolo: 'Un servizio pieno e uno vuoto',
        contenuto: () => html`
          <cmd-fabbisogno .servizi=${SERVIZI} .stazioni=${STAZIONI_SCELTA}></cmd-fabbisogno>`,
      },
      {
        id: 'fabbisogno-senza-partite',
        titolo: 'Prima che esistano le partite',
        contenuto: () => html`
          <cmd-fabbisogno .servizi=${SERVIZI} .stazioni=${[]}></cmd-fabbisogno>`,
      },
    ],
  },
  {
    nome: 'cmd-quote — una schermata intera',
    casi: [
      {
        id: 'quote-piene',
        titolo: 'Una giusta, una corta, una che sfora',
        nota: 'Il totale accanto al nome si accende: 7/7 verde, tutto il resto rosso. Prima bisognava sommare a mente tre riquadri per accorgersi di aver scritto 8.',
        contenuto: () => html`
          <cmd-quote .persone=${QUOTE} .stazioni=${STAZIONI_SCELTA} .codici=${CODICI}></cmd-quote>`,
      },
      {
        id: 'quote-vuote',
        titolo: 'Prima che ci sia una brigata',
        contenuto: () => html`<cmd-quote .persone=${[]} .stazioni=${[]} .codici=${CODICI}></cmd-quote>`,
      },
    ],
  },
  {
    nome: 'cmd-brigata — una schermata intera',
    casi: [
      {
        id: 'brigata-piena',
        titolo: 'Quattro persone, quattro casi diversi',
        nota: 'La prima ha due partite e si legge quale conta di piu’. La seconda non ne ha nessuna: il generatore la salta, e la riga e’ rossa. La terza e’ fuori dai turni extra. La quarta non ha ne’ telefono ne’ email.',
        contenuto: () => html`<cmd-brigata .persone=${BRIGATA_VISTA}></cmd-brigata>`,
      },
      {
        id: 'brigata-vuota',
        titolo: 'Prima che ci sia qualcuno',
        contenuto: () => html`<cmd-brigata .persone=${[]}></cmd-brigata>`,
      },
      {
        id: 'brigata-sola-lettura',
        titolo: 'Chi puo’ solo guardare',
        contenuto: () => html`<cmd-brigata solo-lettura .persone=${BRIGATA_VISTA}></cmd-brigata>`,
      },
    ],
  },
  {
    nome: 'cmd-vuoto',
    casi: [
      {
        id: 'vuoto',
        titolo: 'Quando non c’e’ ancora niente',
        nota: 'Il vecchio riquadro diceva «Nessuna stazione ancora.» e finiva li’. Un vuoto senza il primo passo e’ un vicolo cieco con una scritta sopra.',
        contenuto: () => html`
          <cmd-vuoto simbolo="🍳" titolo="Nessuna partita"
                     spiega="Le partite sono i posti della cucina: pass, antipasti, primi. Il generatore le usa per sapere dove serve qualcuno.">
            <cmd-bottone variante="principale">Aggiungi la prima partita</cmd-bottone>
          </cmd-vuoto>`,
      },
    ],
  },
];

const STILE = `
  body{margin:0;background:var(--bg);color:var(--paper);font-family:var(--font-body);}
  .pagina{max-width:var(--pagina-larga);margin:0 auto;padding:var(--space-5) var(--space-4) 80px;}
  header.banco{border-bottom:1px solid var(--line);padding-bottom:var(--space-4);margin-bottom:var(--space-5);}
  header.banco h1{font-family:var(--font-display);font-size:28px;font-weight:700;margin:0;}
  header.banco p{font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:1px;
    text-transform:uppercase;color:var(--brass);margin:var(--space-2) 0 0;}
  h2.gruppo{font-family:var(--font-mono);font-size:var(--text-sm);letter-spacing:1.5px;
    text-transform:uppercase;color:var(--copper-light);margin:var(--space-5) 0 var(--space-3);
    border-top:1px solid var(--line);padding-top:var(--space-4);}
  section.caso{margin-bottom:var(--space-5);}
  section.caso h3{font-family:var(--font-body);font-size:var(--text-md);font-weight:600;margin:0 0 var(--space-1);}
  section.caso .nota{font-size:var(--text-sm);line-height:1.6;color:var(--brass);margin:0 0 var(--space-3);max-width:70ch;}
  section.caso .palco{background:var(--bg-elev);border:1px solid var(--line);
    border-radius:var(--radius-md);padding:var(--space-4);}
  .fila{display:flex;flex-wrap:wrap;gap:var(--space-2);align-items:center;}
  .griglia{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:var(--space-3);}
  .testo{font-size:var(--text-md);line-height:1.6;margin:0;}
  .larghezze{display:flex;gap:var(--space-2);margin-top:var(--space-3);}
  .larghezze button{background:var(--bg-elev);border:1px solid var(--line);color:var(--brass);
    font-family:var(--font-mono);font-size:var(--text-xs);text-transform:uppercase;letter-spacing:0.5px;
    padding:7px 12px;border-radius:var(--radius-pill);cursor:pointer;}
  .larghezze button[aria-pressed="true"]{background:var(--copper);border-color:var(--copper);color:var(--ink);font-weight:700;}
  .eco{font-family:var(--font-mono);font-size:var(--text-xs);color:var(--sage);
    margin-top:var(--space-3);min-height:1.4em;}
`;

/* Le larghezze non sono decorazione del banco: quasi tutti i difetti di questa
   app sono comparsi a 375px, e guardarli richiedeva rimpicciolire la finestra a
   mano. Qui sono due bottoni. */
const LARGHEZZE = [
  { id: 'telefono', etichetta: 'Telefono 375', px: '375px' },
  { id: 'largo', etichetta: 'Largo', px: '' },
];

let larghezza = 'largo';
let eco = '';

function disegna(): void {
  const radice = document.getElementById('banco');
  if (!radice) return;
  render(html`
    <div class="pagina">
      <header class="banco">
        <h1>Banco dei componenti</h1>
        <p>Comanda design system · ogni pezzo, in ogni stato, da solo</p>
        <div class="larghezze">
          ${LARGHEZZE.map(l => html`
            <button aria-pressed=${larghezza === l.id ? 'true' : 'false'}
                    @click=${() => { larghezza = l.id; disegna(); }}>${l.etichetta}</button>`)}
        </div>
        <p class="eco">${eco}</p>
      </header>

      ${GRUPPI.map(g => html`
        <h2 class="gruppo">${g.nome}</h2>
        ${g.casi.map(c => html`
          <section class="caso" data-caso=${c.id}>
            <h3>${c.titolo}</h3>
            ${c.nota ? html`<p class="nota">${c.nota}</p>` : ''}
            <div class="palco" style=${larghezza === 'telefono' ? 'max-width:375px' : ''}>
              ${c.contenuto()}
            </div>
          </section>`)}
      `)}
    </div>`, radice);
}

/* Gli eventi dei componenti si vedono qui: e' il modo piu' rapido di verificare
   che un componente parli davvero con chi lo usa, invece di fidarsi. */
document.addEventListener('cmd-cambio', (e: Event) => {
  const d = (e as CustomEvent<{ valore: string }>).detail;
  eco = 'cmd-cambio → ' + d.valore;
  disegna();
});
document.addEventListener('cmd-apertura', (e: Event) => {
  const d = (e as CustomEvent<{ aperto: boolean }>).detail;
  eco = 'cmd-apertura → ' + (d.aperto ? 'aperto' : 'chiuso');
  disegna();
});

// Il foglio del banco entra una volta sola: lit non aggiorna i binding dentro
// un <style>, e rimetterlo a ogni disegno lo farebbe ricalcolare per niente.
const foglio = document.createElement('style');
foglio.textContent = STILE;
document.head.appendChild(foglio);

disegna();
