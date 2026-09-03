// ============================================================================
// <cmd-griglia-turni> — il prospetto. La schermata che la brigata guarda ogni
// giorno, e l'unica dell'app dove ogni pixel e' stato misurato a schermo.
//
// TUTTA LA GEOMETRIA E' ARRIVATA QUI DENTRO SENZA CAMBIARE UN NUMERO, commenti
// compresi. Non e' pigrizia: quei numeri vengono da misure fatte sul telefono
// del proprietario («si riescono a leggere solo 5 giorni»), e riscriverli
// "meglio" vorrebbe dire rifare quelle misure. Se qualcuno li tocca, il conto
// da rifare e' scritto accanto.
//
// COSA CAMBIA rispetto alla tabella costruita come stringa:
//
//   LA GRIGLIA NON SI RIFA' PIU' DA CAPO A OGNI TOCCO. Ogni riga e' agganciata
//   all'id della persona e ogni cella alla sua data: cambiando un turno il
//   browser aggiorna QUELLA cella. Prima l'intera tabella veniva ricostruita, e
//   c'era una funzione apposta (posizioneScorrimento) per rimettere lo
//   scorrimento dov'era — perche' assegnare un turno il 20 del mese riportava
//   la griglia al giorno 1. Adesso non si sposta perche' non viene rifatta.
//
//   LE DUE PASSATE DI MISURA RESTANO, e restano imperative: si misura la cella
//   VERA dopo il disegno, perche' la stessa griglia ha colonne da 97px in vista
//   settimana e da 38px in vista mese, e una taratura in pixel varrebbe per una
//   vista sola. Girate in `updated()`, che e' il momento in cui Lit ha finito.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../core/lingua.ts';

export interface GiornoVista {
  iso: string;
  /** «Lun», «Mar»… */
  nome: string;
  numero: number;
  oggi: boolean;
  weekend: boolean;
}

export interface CellaVista {
  giorno: string;
  /** Il codice del turno, '' se vuoto. */
  sigla: string;
  /** Colore scelto dal titolare per questa sigla, '' se vale quello del foglio. */
  colore: string;
  orario: string;
  /** I colori dei pallini: uno per partita. */
  pallini: string[];
  /** La partita, o le due partite di una giornata mista. */
  stazione: { id: string; nome: string } | null;
  stazione2: { id: string; nome: string } | null;
  extra: boolean;
  titolo: string;
}

export interface OreVista {
  totale: string;
  scarto: string;
  /** 'extra', 'under' o ''. */
  classe: string;
  titolo: string;
}

export interface RigaVista {
  id: string;
  nome: string;
  senzaStazioni: boolean;
  titolo: string;
  celle: CellaVista[];
  ore: OreVista;
}

export interface TotaleGiorno {
  ore: string;
  teste: number;
  titolo: string;
}

export interface VoceLegenda {
  colore: string;
  testo: string;
  /** Pallino vuoto (chi non ha partite) o doppio (giornata mista). */
  forma?: 'vuoto' | 'doppio';
}

const SIGLA_VUOTA = '—';

/* ---- Le forme via via piu' corte di un nome ------------------------------
   Non si taglia coi puntini: si cambia FORMA. «Giulia De Angelis Ferrari»
   chiedeva 160,6px in una colonna da 122px — andava a capo su tre righe e
   alzava tutta la riga — mentre «Yu» lasciava 109px vuoti. */
function formeNome(nome: string): string[] {
  const parti = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!parti.length) return [SIGLA_VUOTA, SIGLA_VUOTA, SIGLA_VUOTA, SIGLA_VUOTA];
  const primo = parti[0] as string;
  // Quattro caselle fisse, una per livello di accorciamento, anche quando due
  // livelli coincidono: l'indice DEVE voler dire la stessa cosa per tutti.
  // Con un elenco compattato «Yu» (che di forme ne ha una sola) finiva subito
  // sull'ultima e si leggeva «Y» mentre gli altri erano ancora per esteso.
  return [
    parti.join(' '),
    parti.length > 1 ? primo + ' ' + (parti[parti.length - 1] as string)[0]!.toUpperCase() + '.' : primo,
    primo,
    parti.map(p => p[0]!.toUpperCase()).join(''),
  ];
}

/* Stesso mestiere per il nome di una partita, con un vincolo in piu': vedi
   adattaTesti. Quattro livelli, non tre — quello in mezzo, due lettere per
   parola, e' nato dalle partite vere di una cucina: Pass e Primi hanno la
   stessa iniziale, quindi il livello delle iniziali viene saltato perche' non
   e' univoco, e si resta col nome intero. In una cella che deve dire DUE
   partite («Pass/Primi», dieci caratteri in una colonna da 97px) questo vuol
   dire non dirne nessuna. Con due lettere diventa «Pa/Pr» e ci sta. */
function formeStazione(nome: string): string[] {
  const testo = String(nome || '').trim();
  const parti = testo.split(/[\s/·|,-]+/).filter(Boolean);
  if (!parti.length) return [testo, testo, testo];
  const due = parti.map(p => p.slice(0, 2)).join('');
  return [testo, parti[0] as string, due.charAt(0).toUpperCase() + due.slice(1),
          parti.map(p => p[0]!.toUpperCase()).join('')];
}

export class GrigliaTurni extends LitElement {
  static override properties = {
    giorni: { type: Array },
    righe: { type: Array },
    totali: { type: Array },
    totalePeriodo: { type: String },
    stazioni: { type: Array },
    legenda: { type: Array },
    turni: { type: String },
    soloLettura: { type: Boolean, reflect: true, attribute: 'solo-lettura' },
    dove: { type: String, state: true },
  };

  declare giorni: GiornoVista[];
  declare righe: RigaVista[];
  declare totali: TotaleGiorno[];
  declare totalePeriodo: string;
  /** Tutte le partite della cucina: servono per l'univocità delle abbreviazioni. */
  declare stazioni: { id: string; nome: string }[];
  declare legenda: VoceLegenda[];
  /** I tipi di turno, già scritti: «P · Pranzo · S · Cena …». */
  declare turni: string;
  declare soloLettura: boolean;
  /** «1 – 7 set», scritto sotto le frecce. */
  declare dove: string;

  constructor() {
    super();
    this.giorni = [];
    this.righe = [];
    this.totali = [];
    this.totalePeriodo = '';
    this.stazioni = [];
    this.legenda = [];
    this.turni = '';
    this.soloLettura = false;
    this.dove = '';
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}

    /* ========================================================================
       GEOMETRIA DICHIARATA, non emergente. Prima non c'era table-layout:fixed:
       le colonne si "spremevano" da sole e la stessa tendina della stazione
       misurava 91,3px in vista settimana e 52,0px in vista mese. Qualunque
       taratura in pixel valeva per una vista sola.

       DUE SOLE TAGLIE DI CARATTERE, al posto delle sei di prima (8, 9, 10,
       10,5, 12 e 13,5px), e la piu' grande sulla sigla del turno invece che
       sul testo che non entrava.
       ==================================================================== */
    .shift-table{
      --turni-col:56px;        /* larghezza MINIMA di una colonna-giorno */
      --turni-nome:132px;
      --turni-ore:76px;
      --turni-cella-h:54px;    /* bersaglio per il dito: prima 23,3px, minimo 44 */
      --turni-sigla:13px;
      --turni-dettaglio:9.5px;
      --riga-orario:0px;       /* acceso da .con-orario — vedi adattaTesti() */
      table-layout:fixed;
      width:100%;
      /* Sotto questa larghezza si scorre invece di spremere: --n-giorni lo
         scrive la griglia (7 o 31), e' un dato del periodo, non una scelta. */
      min-width:calc(var(--turni-nome) + var(--turni-ore) + var(--n-giorni,7) * var(--turni-col));
      border-collapse:separate;border-spacing:0;
      font-family:var(--font-mono);font-size:var(--turni-dettaglio);
    }
    .shift-table.con-orario{--riga-orario:12px;}

    /* LA SETTIMANA INTERA SU UN TELEFONO, senza scorrere in orizzontale.
       Chiesto dal proprietario: «si riescono a leggere solo 5 giorni, la
       dobbiamo ridimensionare in modo che si visualizzi almeno l'intera
       settimana».
       Misurato prima: area utile 302px, colonna nomi 92, colonna giorno 56,
       colonna ore 76 -> 3,8 giorni su 7.
       Il conto che decide questi numeri, e che va rifatto se qualcuno li cambia:
         302 (area) + 32 (margini del riquadro, tolti in styles.css) = 334
         334 - 66 (nomi) = 268 ;  268 / 7 = 38,3  ->  colonna 38px
       La colonna ORE esce dalla griglia perche' le stesse ore sono gia'
       scritte, per intero e con lo scarto dal contratto, nel riquadro «Ore
       extra del periodo» che sta sotto: era l'unica delle tre cose in cella che
       avesse gia' un altro posto dove vivere.
       Dalla cella escono orario e nome della partita: restano la sigla e il
       PALLINO, che il colore lo dice meglio di sei lettere tagliate. Toccando
       la cella si apre lo stesso foglio di sempre, con dentro tutto. */
    @media(max-width:767px){
      .shift-table{
        /* 80 al nome e 36 al giorno: 80 + 7x36 = 332, dentro i 334 disponibili.
           A 66px i nomi si riducevano a una lettera sola — e con due R in
           brigata una lettera non dice chi e'. Due pixel per giorno pagano un
           nome leggibile: la sigla del turno sta in 24px, il resto era aria. */
        --turni-nome:80px;
        --turni-col:36px;
        --turni-ore:0px;
        --turni-cella-h:46px;   /* resta sopra i 44px del bersaglio per il dito */
        --turni-sigla:11px;
        --riga-orario:0px;
      }
      /* Colonna ore fuori: e' l'unico dato che ha gia' un altro posto. */
      .shift-table col.c-ore,
      .shift-table th.ore-col,
      .shift-table td.ore-col{display:none;}
      /* Orario e nome della partita spariscono dalla cella: a 36px non ci
         stanno, e tagliati direbbero una cosa falsa. Il pallino resta. */
      .shift-table .ct-orario,
      .shift-table .ct-nome-stazione{display:none !important;}
    }
    @media(max-width:560px){ .shift-table{--turni-nome:80px;} }

    .shift-table col.c-nome{width:var(--turni-nome);}
    .shift-table col.c-ore{width:var(--turni-ore);}
    .shift-table th,.shift-table td{border:1px solid var(--line);padding:var(--space-1);
      text-align:center;vertical-align:middle;}
    .shift-table th{font-weight:400;color:var(--brass);text-transform:uppercase;
      font-size:var(--turni-dettaglio);line-height:1.35;}
    .shift-table td.name{text-align:left;padding-left:6px;white-space:nowrap;}

    /* Su un mese sono 31 colonne: la colonna dei nomi resta ferma mentre si
       scorre, altrimenti a meta' mese non si sa piu' di chi sia la riga. */
    .shift-table th.name-col,.shift-table td.name{position:sticky;left:0;z-index:2;background:var(--bg-elev);}
    /* ...e le date restano ferme mentre si scorre in basso. Con 12-15 persone
       in brigata si arrivava in fondo senza sapere piu' che giorno si stava
       guardando: lo stesso problema, nell'altra direzione. */
    .shift-table thead th{position:sticky;top:0;z-index:3;background:var(--bg-elev);}
    .shift-table thead th.name-col{z-index:4;}
    /* Il fondo di «oggi» nell'intestazione dev'essere OPACO: una tinta
       trasparente su un elemento appiccicato lascia vedere le righe sotto. */
    .shift-table th.today{background-color:var(--bg-elev);
      background-image:linear-gradient(rgba(176,107,52,0.14),rgba(176,107,52,0.14));}
    .shift-table td.today-col{background:rgba(176,107,52,0.14);}
    .shift-table th.weekend{color:var(--copper-light);}

    /* Il contenitore scorre in ENTRAMBE le direzioni: e' cio' che rende
       possibile l'intestazione ferma in alto. Senza altezza massima non
       scorrerebbe mai in verticale e position:sticky non avrebbe appigli. */
    .shift-scroll{overflow:auto;max-width:100%;max-height:70vh;}

    /* Frecce per scorrere di una schermata di giorni per volta, con scritto
       quali giorni si stanno guardando. Compaiono solo quando c'e' da
       scorrere: sul telefono la vista mese e' larga 1904px in 302. */
    .shift-nav{display:flex;align-items:center;justify-content:center;
      gap:var(--space-2);margin-bottom:var(--space-2);}
    .shift-nav button{background:transparent;border:1px solid var(--line-strong);color:var(--paper);
      font-family:var(--font-mono);font-size:13px;line-height:1;padding:8px 14px;
      border-radius:var(--radius-sm);cursor:pointer;}
    .shift-nav button:hover:not(:disabled){border-color:var(--copper);}
    .shift-nav button:disabled{opacity:0.35;cursor:default;}
    .shift-nav .shift-nav-label{font-family:var(--font-mono);font-size:var(--text-xs);
      color:var(--copper-light);min-width:130px;text-align:center;}

    /* --- Colonna delle ore e riga dei totali ------------------------------
       La colonna delle ore e' appiccicata a destra, simmetrica a quella dei
       nomi — ma SOLO su schermo largo: su un telefono da 375px la griglia
       utile e' larga 302px, e togliendone altri 76 fissi i giorni visibili
       scenderebbero da 3,8 a 2,4, cioe' meno di prima del ridisegno. Sotto i
       560px la colonna resta in coda e la si raggiunge scorrendo. Misurato a
       schermo, non deciso a tavolino. */
    .shift-table td.ore,.shift-table th.ore-col{background:var(--bg-elev);}
    .shift-table .ore-tot,.shift-table .ore-scarto{display:block;line-height:1.5;}
    .shift-table .ore-scarto{color:var(--brass);}
    .shift-table .ore-scarto.extra{color:var(--copper-light);font-weight:700;}
    .shift-table .ore-scarto.under{color:var(--brass);}
    @media(min-width:561px){
      .shift-table td.ore,.shift-table th.ore-col{position:sticky;right:0;z-index:2;}
      .shift-table thead th.ore-col{z-index:4;}
      .shift-table tfoot td.ore{z-index:4;}
    }
    .shift-table tfoot th,.shift-table tfoot td{position:sticky;bottom:0;z-index:3;
      background:var(--bg-elev);border-top:1px solid var(--line-strong);color:var(--paper-dim);}
    .shift-table tfoot th.name-col{left:0;z-index:4;color:var(--brass);text-transform:uppercase;}

    /* Nome della persona: si accorcia cambiando FORMA, non tagliando coi
       puntini. Il pallino vuoto marca chi non ha partite; per gli altri resta
       al suo posto invisibile, cosi' tutti i nomi partono dalla stessa
       colonna. */
    .shift-table td.name .ct-pallino{visibility:hidden;margin-right:5px;}
    .shift-table td.name.senza-stazioni{color:var(--brass);}
    .shift-table td.name.senza-stazioni .ct-pallino{visibility:visible;}
    .shift-table .nome-persona{display:inline-block;width:calc(100% - 14px);
      overflow:hidden;white-space:nowrap;vertical-align:middle;}

    /* --- La cella: un solo bersaglio, di misura dichiarata ---------------- */
    .cella-turno{
      position:relative;display:grid;gap:1px;
      grid-template-rows:19px var(--riga-orario) 13px;
      align-content:center;justify-items:center;
      width:100%;height:var(--turni-cella-h);padding:0;
      background:transparent;border:none;border-radius:var(--radius-sm);
      color:var(--paper);font-family:var(--font-mono);font-size:var(--turni-dettaglio);
      cursor:pointer;
    }
    .cella-turno:disabled{cursor:default;}
    .cella-turno:hover:not(:disabled){background:var(--bg-elev2);}
    .cella-turno:focus-visible{outline:2px solid var(--copper);outline-offset:-2px;}

    .ct-sigla{
      display:flex;align-items:center;justify-content:center;
      min-width:32px;height:19px;padding:0 6px;border-radius:var(--radius-sm);
      background:var(--bg-elev2);border:1px solid var(--line-strong);
      font-size:var(--turni-sigla);line-height:1;
    }
    .ct-sigla.C{background:#d38f57;border-color:#d38f57;color:#1d1b18;font-weight:700;}
    .ct-sigla.P{background:#b06b34;border-color:#b06b34;color:#1d1b18;font-weight:700;}
    .ct-sigla.S{background:#332c24;border-color:#4a4036;color:#f3eee2;font-weight:700;}
    .ct-sigla.SP{background:#6b8064;border-color:#6b8064;color:#1d1b18;font-weight:700;}
    .ct-sigla.M{background:#a8412f;border-color:#a8412f;color:#f3eee2;font-weight:700;}
    .ct-sigla.F{background:#5a5a5a;border-color:#5a5a5a;color:#f3eee2;font-weight:700;}

    .ct-orario,.ct-stazione{display:flex;align-items:center;justify-content:center;gap:4px;
      max-width:100%;overflow:hidden;white-space:nowrap;color:var(--brass);}
    .ct-orario{height:var(--riga-orario);}
    .ct-nome-stazione{overflow:hidden;white-space:nowrap;color:var(--paper-dim);}
    .shift-table:not(.con-stazione) .ct-nome-stazione{display:none;}
    .ct-pallino{display:inline-block;flex:0 0 auto;width:7px;height:7px;border-radius:50%;
      background:var(--pallino,var(--brass));}
    .ct-pallino.vuoto{background:transparent;border:1px solid var(--brass);}

    /* Turno extra. Prima era un outline:2px sulla <td>: disegnato FUORI dal
       riquadro, invadeva di 2px le quattro celle confinanti, e il
       border-radius non si vedeva perche' il fondo restava quadrato. */
    .cella-turno.extra{background:rgba(211,143,87,0.14);box-shadow:inset 0 0 0 1px var(--copper-light);}
    .cella-turno.extra::after{content:"";position:absolute;top:0;right:0;
      border-top:6px solid var(--copper-light);border-left:6px solid transparent;}

    /* --- La legenda. Il pallino e' l'unica cosa che resta quando il nome
           della partita non entra nella cella: qui si legge cosa vuol dire. */
    .legenda{font-family:var(--font-mono);font-size:var(--text-xs);
      color:var(--brass);line-height:1.6;margin-top:var(--space-2);}
    .voci{display:flex;flex-wrap:wrap;gap:var(--space-1) var(--space-3);margin-top:var(--space-2);}
    .voce{display:inline-flex;align-items:flex-start;gap:5px;}
    .voce .ct-pallino{position:relative;top:4px;}
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private get tabella(): HTMLTableElement | null {
    return this.renderRoot.querySelector('.shift-table');
  }

  /* ---- Le due passate di misura, dopo il disegno -------------------------
     I test non coprono l'interfaccia (CLAUDE.md): queste due funzioni fanno a
     ogni disegno la misura che altrimenti andrebbe rifatta a mano a ogni
     modifica — e la fanno sulla cella VERA, non su una taratura in pixel che
     varrebbe per una vista sola. */

  /* Nomi: si prova la forma piu' lunga e si accorcia tutta la colonna insieme
     finche' nessuno sfora. Tutti nella stessa forma, cosi' la colonna resta
     coerente. */
  private accorciaNomi(): void {
    const tab = this.tabella;
    if (!tab) return;
    const celle = [...tab.querySelectorAll<HTMLElement>('.nome-persona')];
    if (!celle.length) return;
    const forme = celle.map(c => formeNome(c.dataset['nome'] ?? c.textContent ?? ''));
    const passi = Math.max(...forme.map(f => f.length));
    for (let i = 0; i < passi; i++) {
      celle.forEach((c, k) => {
        const f = forme[k] as string[];
        c.textContent = f[Math.min(i, f.length - 1)] as string;
      });
      if (!celle.some(c => c.scrollWidth > c.clientWidth + 1)) return;
    }
  }

  /* Orario e nome della partita compaiono solo se ci stanno PER INTERO.
     L'orario e' o tutto o niente. Il nome della partita si accorcia prima di
     sparire («Secondi / griglia» -> «Secondi» -> «SG»), ma una forma accorciata
     si usa solo se resta UNIVOCA fra tutte le partite: «Secondi carne» e
     «Secondi pesce» ridotte entrambe a «Secondi» farebbero dire alla cella una
     cosa falsa, e una cella che mente e' peggio di una cella muta. Quando
     nessuna forma entra resta il pallino, col nome per esteso nella legenda,
     nel foglio di scelta e nel suggerimento. */
  private adattaTesti(): void {
    const tab = this.tabella;
    if (!tab) return;
    tab.classList.add('con-orario', 'con-stazione');
    const sfora = (sel: string) =>
      [...tab.querySelectorAll(sel)].some(e => e.scrollWidth > e.clientWidth + 1);
    if (sfora('.ct-orario')) tab.classList.remove('con-orario');

    const etichette = [...tab.querySelectorAll<HTMLElement>('.ct-nome-stazione')];
    if (!etichette.length) return;
    const livelli = Math.max(1, ...this.stazioni.map(st => formeStazione(st.nome).length));
    const formeAl = (i: number): Map<string, string> | null => {
      const forme = new Map(this.stazioni.map(st => {
        const f = formeStazione(st.nome);
        return [st.id, f[Math.min(i, f.length - 1)] as string] as const;
      }));
      const valori = [...forme.values()];
      // Il livello 0 sono i nomi veri: si mostrano anche se due partite si
      // chiamano uguale, perche' l'ambiguita' e' nei dati, non nell'abbreviazione.
      return (i > 0 && new Set(valori).size !== valori.length) ? null : forme;
    };
    // I due gruppi si accorciano SEPARATAMENTE, e non e' pignoleria: una cella
    // a due partite ha bisogno del doppio dello spazio, e se decidesse per
    // tutti basterebbero tre celle doppie a far scrivere «Pa» al posto di
    // «Pass» nelle altre sessanta.
    const gruppi = [
      { sel: '.ct-nome-stazione:not([data-stazione2])',
        quali: etichette.filter(e => !e.dataset['stazione2']),
        testo: (e: HTMLElement, f: Map<string, string>) =>
          f.get(e.dataset['stazione'] ?? '') ?? e.dataset['nome'] ?? '' },
      { sel: '.ct-nome-stazione[data-stazione2]',
        quali: etichette.filter(e => e.dataset['stazione2']),
        // Le due meta' si accorciano allo STESSO livello: «Pass/Pr» farebbe
        // sembrare che una delle due valga piu' dell'altra.
        testo: (e: HTMLElement, f: Map<string, string>) =>
          (f.get(e.dataset['stazione'] ?? '') ?? e.dataset['nome'] ?? '')
          + '/' + (f.get(e.dataset['stazione2'] ?? '') ?? e.dataset['nome2'] ?? '') },
    ];
    for (const g of gruppi) {
      if (!g.quali.length) continue;
      let entrato = false;
      for (let i = 0; i < livelli; i++) {
        const forme = formeAl(i);
        if (!forme) continue;
        g.quali.forEach(e => { e.textContent = g.testo(e, forme); });
        if (!sfora(g.sel)) { entrato = true; break; }
      }
      // Nessuna forma entra: per QUESTO gruppo restano i pallini. Le celle a
      // una partita sola non pagano per quelle a due.
      if (!entrato) g.quali.forEach(e => { e.textContent = ''; });
    }
  }

  /* ---- Le frecce: una schermata di giorni per volta ---------------------- */
  private aggiornaFrecce(): void {
    const tab = this.tabella;
    const box = this.renderRoot.querySelector<HTMLElement>('.shift-scroll');
    const nav = this.renderRoot.querySelector<HTMLElement>('.shift-nav');
    if (!tab || !box || !nav) return;

    const primaColonna = tab.querySelector('thead th:nth-child(2)');
    const colonnaNome = tab.querySelector('thead th.name-col');
    const larghezzaColonna = primaColonna?.getBoundingClientRect().width || 1;
    const larghezzaNome = colonnaNome?.getBoundingClientRect().width || 0;
    // Quanti giorni interi ci stanno oltre la colonna dei nomi, che resta ferma.
    const visibili = Math.max(1, Math.floor((box.clientWidth - larghezzaNome) / larghezzaColonna));
    const daScorrere = box.scrollWidth > box.clientWidth + 4;

    nav.hidden = !daScorrere;
    if (!daScorrere) { this.dove = ''; return; }

    const primo = Math.min(
      Math.max(0, Math.round(box.scrollLeft / larghezzaColonna)),
      Math.max(0, this.giorni.length - visibili));
    const ultimo = Math.min(this.giorni.length - 1, primo + visibili - 1);
    const a = this.giorni[primo], b = this.giorni[ultimo];
    this.dove = a && b
      ? (primo === ultimo ? `${a.nome} ${a.numero}` : `${a.nome} ${a.numero} – ${b.nome} ${b.numero}`)
      : '';

    const indietro = this.renderRoot.querySelector<HTMLButtonElement>('[data-passo="-1"]');
    const avanti = this.renderRoot.querySelector<HTMLButtonElement>('[data-passo="1"]');
    if (indietro) indietro.disabled = box.scrollLeft <= 1;
    if (avanti) avanti.disabled = box.scrollLeft >= box.scrollWidth - box.clientWidth - 1;
  }

  private scorri(passo: number): void {
    const box = this.renderRoot.querySelector<HTMLElement>('.shift-scroll');
    const tab = this.tabella;
    if (!box || !tab) return;
    const colonna = tab.querySelector('thead th:nth-child(2)')?.getBoundingClientRect().width || 1;
    const nome = tab.querySelector('thead th.name-col')?.getBoundingClientRect().width || 0;
    const visibili = Math.max(1, Math.floor((box.clientWidth - nome) / colonna));
    box.scrollBy({ left: passo * visibili * colonna, behavior: 'smooth' });
  }

  private riadatta = (): void => {
    // Girando il telefono cambia la larghezza delle colonne, quindi cambia cosa
    // ci sta dentro. Le due passate vanno rifatte: senza, restano in piedi le
    // decisioni prese per l'altra larghezza e il testo torna tagliato — provato
    // passando da 900px a 375px, e si leggeva di nuovo «Antipa», «Pastic».
    clearTimeout(this.attesa);
    this.attesa = window.setTimeout(() => {
      this.accorciaNomi();
      this.adattaTesti();
      this.aggiornaFrecce();
    }, 120);
  };
  private attesa = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('resize', this.riadatta);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('resize', this.riadatta);
    clearTimeout(this.attesa);
  }

  override updated(): void {
    const tab = this.tabella;
    if (!tab) return;
    // Il numero di giorni e' un DATO, non una decisione di stile: serve al CSS
    // per calcolare la larghezza minima della tabella (vedi --turni-col).
    tab.style.setProperty('--n-giorni', String(this.giorni.length));
    this.accorciaNomi();
    this.adattaTesti();
    this.aggiornaFrecce();
  }

  private cella(riga: RigaVista, c: CellaVista, giorno: GiornoVista): TemplateResult {
    const stileSigla = c.colore
      // Il colore scelto si scrive in riga: le regole del foglio (.ct-sigla.P,
      // .ct-sigla.SP…) valgono solo per le sigle predefinite, e una sigla
      // inventata dal titolare non ne avrebbe nessuna.
      ? `background:${c.colore};border-color:${c.colore};color:#1d1b18;font-weight:700;`
      : '';
    return html`
      <td class=${giorno.oggi ? 'today-col' : ''}>
        <button type="button" class="cella-turno ${c.extra ? 'extra' : ''}"
                title=${c.titolo} ?disabled=${this.soloLettura}
                @click=${() => this.manda('cella-tocca', { personaId: riga.id, giorno: c.giorno })}>
          <span class="ct-sigla ${c.sigla}" style=${stileSigla}>${c.sigla || SIGLA_VUOTA}</span>
          <span class="ct-orario">${c.orario}</span>
          <span class="ct-stazione">
            ${c.pallini.map(col => html`<i class="ct-pallino" style="--pallino:${col}"></i>`)}
            ${c.stazione2 && c.stazione
              ? html`<span class="ct-nome-stazione"
                       data-stazione=${c.stazione.id} data-nome=${c.stazione.nome}
                       data-stazione2=${c.stazione2.id} data-nome2=${c.stazione2.nome}
                     >${c.stazione.nome}/${c.stazione2.nome}</span>`
              : c.stazione
                ? html`<span class="ct-nome-stazione"
                         data-stazione=${c.stazione.id} data-nome=${c.stazione.nome}
                       >${c.stazione.nome}</span>`
                : nothing}
          </span>
        </button>
      </td>`;
  }

  override render(): TemplateResult {
    return html`
      <div class="shift-nav" hidden>
        <button type="button" data-passo="-1" title=${t('Giorni precedenti')}
                @click=${() => this.scorri(-1)}>‹</button>
        <span class="shift-nav-label">${this.dove}</span>
        <button type="button" data-passo="1" title=${t('Giorni successivi')}
                @click=${() => this.scorri(1)}>›</button>
      </div>

      <div class="shift-scroll" @scroll=${() => this.aggiornaFrecce()}>
        <table class="shift-table">
          <colgroup>
            <col class="c-nome">
            ${this.giorni.map(() => html`<col class="c-giorno">`)}
            <col class="c-ore">
          </colgroup>
          <thead>
            <tr>
              <th class="name-col left">${t('Persona')}</th>
              ${this.giorni.map(g => html`
                <th class="${g.oggi ? 'today' : ''} ${g.weekend ? 'weekend' : ''}">${g.nome}<br>${g.numero}</th>`)}
              <th class="ore-col">${t('Ore')}</th>
            </tr>
          </thead>
          <tbody>
            ${repeat(this.righe, r => r.id, r => html`
              <tr>
                <td class="name ${r.senzaStazioni ? 'senza-stazioni' : ''}" title=${r.titolo}>
                  <i class="ct-pallino vuoto" aria-hidden="true"></i><span class="nome-persona" data-nome=${r.nome}>${r.nome}</span>
                </td>
                ${repeat(r.celle, c => c.giorno, (c, i) => this.cella(r, c, this.giorni[i] as GiornoVista))}
                <td class="ore ore-col" title=${r.ore.titolo}>
                  <span class="ore-tot">${r.ore.totale}</span>
                  <span class="ore-scarto ${r.ore.classe}">${r.ore.scarto}</span>
                </td>
              </tr>`)}
          </tbody>
          <tfoot>
            <tr>
              <th class="name-col left">${t('Totale')}</th>
              ${this.totali.map((tt, i) => html`
                <td class=${this.giorni[i]?.oggi ? 'today-col' : ''} title=${tt.titolo}>
                  <span class="ore-tot">${tt.ore}</span>
                  <span class="ore-scarto">${tt.teste}</span>
                </td>`)}
              <td class="ore ore-col">
                <span class="ore-tot">${this.totalePeriodo}</span>
                <span class="ore-scarto">${t('periodo')}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p class="legenda">${this.turni}
        ${this.legenda.length ? html`
          <span class="voci">
            ${this.legenda.map(v => html`
              <span class="voce">
                ${v.forma === 'doppio'
                  ? html`<i class="ct-pallino" style="--pallino:${v.colore}"></i><i class="ct-pallino" style="--pallino:${v.colore}"></i>`
                  : html`<i class="ct-pallino ${v.forma === 'vuoto' ? 'vuoto' : ''}" style="--pallino:${v.colore}"></i>`}
                ${v.testo}
              </span>`)}
          </span>` : nothing}
      </p>`;
  }
}

customElements.define('cmd-griglia-turni', GrigliaTurni);

declare global {
  interface HTMLElementTagNameMap { 'cmd-griglia-turni': GrigliaTurni }
}
