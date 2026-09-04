import { CODE_HOURS, CODE_LABEL, SERVICE_LABEL, SHIFT_CONFIG, TURNO_DEF, WORKING_CODES, esc, periodDates, periodLabel, periodMode, save, state } from '../core/state.js';
import { assegnaStazione, dayName, isoDate, normalizzaCella, parseISO, serviziDelCodice, stazioneDi, stazioniDi } from '../lib/logic.js';
import { Cloud } from '../lib/cloud.js';
import { costoDelLavoro, foodCostMedio, incassoDiPareggio } from '../lib/costo-lavoro.js';
import { soldi } from '../core/valuta.ts';
import './costo-vista.ts';
import { dataLunga } from '../core/lingua.ts';
import { renderDashboard } from '../viste/dashboard.js';
// fabbisogno.js importa da qui `coloreStazione`, e qui si importa `renderCapienza`
// da lì: i due moduli si citano a vicenda. È lecito perché nessuno dei due usa
// l'altro mentre viene caricato — solo dentro funzioni, chiamate dopo. Stessa
// coppia che griglia.js e dashboard.js formano da sempre due righe più su.
import { renderCapienza } from './fabbisogno.js';
import './foglio-turno-vista.ts';
import './griglia-vista.ts';
/* ============================= TURNI: griglia =============================

   UNA CELLA = UN SOLO BERSAGLIO.

   Prima ogni cella conteneva due <select> impilati: quello della sigla,
   disegnato apposta (52 × 23,3 px, carattere 10px), e quello della stazione,
   che non aveva NESSUNA regola propria e quindi ereditava lo stile del campo
   di modulo delle schede (91,3 × 37,3 px, carattere 13,5px). Due controlli di
   famiglie diverse nella stessa cella. Misurato sulla griglia vera:

     · tre larghezze e due altezze diverse per lo stesso comando;
     · 27,3px di scarto verticale fra le sigle della STESSA riga, perché una
       cella con la stazione è alta il triplo di una senza e `vertical-align`
       le centra su due quote diverse;
     · 20 etichette tagliate su 42 celle in vista settimana, 107 su 107 in
       vista mese ("Anti…", "staz…"): il carattere più grande della tabella
       assegnato al testo che non si legge;
     · 5 taglie di carattere (8, 9, 10, 10,5, 13,5px) in un riquadro largo
       827px;
     · il bersaglio più usato alto 23,3px, contro i 44px minimi per un dito.

   Ora la cella MOSTRA il turno — sigla, orario, pallino della stazione — e il
   tocco apre un foglio di scelta, dove l'etichetta intera ci sta perché c'è la
   larghezza dello schermo. Un <select> è un controllo di sistema: larghezza
   della freccia, altezza minima e padding non sono governabili dal CSS in modo
   affidabile, e su telefono apre comunque un foglio a tutto schermo. Impilarne
   due in 52px voleva dire affidare l'impaginazione a qualcosa che non si
   controlla.

   La geometria è DICHIARATA, non emergente: `table-layout:fixed` più le
   variabili qui sotto. Prima la stessa tendina misurava 91,3px in settimana e
   52,0px in mese, quindi qualunque taratura in pixel valeva per una vista sola.

   Il testo di dettaglio compare solo se ci sta PER INTERO (vedi adattaTesti):
   meglio il solo pallino che "Anti…".
   ========================================================================== */

const SIGLA_VUOTA = '—';

/* Colore del pallino di una stazione. Le tinte si ricavano dalla posizione
   nell'elenco spargendo le tonalità sul giro completo, invece di pescare da
   una tavolozza a cicli: con più stazioni della tavolozza due partite
   finirebbero dello stesso colore e il pallino direbbe una cosa falsa. */
export function coloreStazione(stationId){
  const i = state.stations.findIndex(st=>st.id===stationId);
  if(i < 0) return 'var(--brass)';
  // Il colore scelto dal titolare vince su quello calcolato: quello automatico
  // e' un ripiego decoroso, il suo e' un'informazione — «il lavaggio e' blu» se
  // lo dice lui vuol dire qualcosa in cucina.
  const scelto = state.stations[i].colore;
  if(scelto) return scelto;
  const n = Math.max(state.stations.length, 1);
  return 'hsl(' + (Math.round(i*360/n) + 24) % 360 + ' 38% 58%)';
}

/* Colore di un TIPO DI TURNO. Stessa regola: se il titolare l'ha scelto vale
   il suo, altrimenti resta quello che il foglio di stile da' alla sigla. */
export function coloreTurno(code){
  const t = (state.shiftTypes||[]).find(x=> x.code === code);
  return (t && t.colore) || null;
}

/* Chi non ha nessuna stazione assegnata. Il generatore non lo assegna mai
   (motore turni, punto 5): nella griglia resta visibile e assegnabile a mano,
   ma marcato — altrimenti la fila di R sembra un difetto invece di una
   conseguenza. */
function senzaStazioni(s){ return !(s.stations && s.stations.length); }

/* Le stazioni proponibili a una persona: le sue, o tutte se non ne ha
   nessuna — l'assegnazione a mano deve restare possibile. */
function stazioniPer(s){
  return senzaStazioni(s) ? state.stations : state.stations.filter(st=> s.stations.includes(st.id));
}

/* L'orario è già dentro l'etichetta del tipo di turno ("Pranzo 9:00–17:00",
   "Spezzato 10–16 / 18–23"): si legge da lì invece di aggiungere due campi al
   motore dei turni, che è coperto dai test e non ha bisogno di sapere che ore
   sono. Se l'etichetta non contiene un orario — perché ogni cucina scrive la
   sua — la cella mostra solo la sigla, come prima. Nessuna migrazione. */
function orarioDi(code){
  const m = String(CODE_LABEL(code)||'')
    .match(/\d{1,2}(?:[:.]\d{2})?\s*[–—-]\s*\d{1,2}(?:[:.]\d{2})?(?:\s*\/\s*\d{1,2}(?:[:.]\d{2})?\s*[–—-]\s*\d{1,2}(?:[:.]\d{2})?)*/);
  return m ? m[0].replace(/\s+/g,'') : '';
}

/* Le partite di una cella. `stazioniDi` legge la mappa servizio -> stazione e
   toglie i doppioni: chi fa lo stesso posto a pranzo e a cena ne ha UNA. */
function partiteDi(cella){
  return stazioniDi(cella, SHIFT_CONFIG())
    .map(id=> state.stations.find(x=> x.id === id))
    .filter(Boolean);
}

/* «Pranzo: Pass · Cena: Primi» — per il suggerimento della cella, quando le
   partite della giornata sono due e nella cella non ci starebbero. */
function dettaglioPartite(cella){
  return (serviziDelCodice(cella.code, SHIFT_CONFIG()) || []).map(sv=>{
    const st = state.stations.find(x=> x.id === stazioneDi(cella, sv));
    return st ? SERVICE_LABEL(sv) + ': ' + st.name : null;
  }).filter(Boolean);
}

/* Da una data ISO al testo lungo. La funzione di lingua.ts prende un Date;
   qui girano stringhe ISO, e questo fa il ponte in un punto solo. */
function giornoPerEsteso(iso){
  return dataLunga(parseISO(iso));
}

function apriSceltaTurno(staffId, day){
  const s = state.staff.find(x=> x.id === staffId);
  if(!s) return;

  /* Una partita per tutti i servizi o una per ciascuno. È una scelta che si
     ricorda finché il foglio resta aperto, e parte da quello che la cella dice
     già: chi non fa partite miste — cioè quasi tutti, e tutti quelli che hanno
     dati salvati da prima — non se ne accorge nemmeno. Chiedere due volte la
     stessa stazione sarebbe una tassa su chi non fa spezzati misti. */
  let collegate = null;

  const foglio = document.createElement('cmd-foglio-turno');
  document.body.appendChild(foglio);

  const chiudi = ()=>{ foglio.remove(); };
  foglio.addEventListener('foglio-chiudi', chiudi);
  foglio.addEventListener('cmd-chiudi', chiudi);

  foglio.addEventListener('turno-scelto', e => {
    state.shifts[staffId] = state.shifts[staffId] || {};
    const cella = state.shifts[staffId][day] || {code:'', stations:{}, extra:false};
    cella.code = e.detail.codice;
    // Cambiando il turno cambia cosa copre, e la normalizzazione fa il resto: i
    // servizi che il nuovo codice non copre perdono la chiave, quelli nuovi
    // ereditano la stazione già decisa — passando da P a SP il pranzo non si
    // ridecide. Un codice che non copre servizi (riposo, ferie, malattia) resta
    // senza stazione: sarebbe un dato che non vuol dire niente.
    state.shifts[staffId][day] = normalizzaCella(cella, SHIFT_CONFIG());
    save('shifts');
    aggiorna(); aggiornaTutto();
  });

  foglio.addEventListener('stazione-scelta', e => {
    const giorni = state.shifts[staffId] = state.shifts[staffId] || {};
    const cella = giorni[day] = giorni[day] || {code:'', stations:{}};
    const quali = (e.detail.servizio === '*')
      ? (serviziDelCodice(cella.code, SHIFT_CONFIG()) || [])
      : [e.detail.servizio];
    quali.forEach(x=> assegnaStazione(cella, x, e.detail.stazioneId, SHIFT_CONFIG()));
    save('shifts');
    aggiorna(); aggiornaTutto();
  });

  foglio.addEventListener('collega', e => { collegate = e.detail.collegate; aggiorna(); });

  function aggiorna(){
    const cella = (state.shifts[staffId]||{})[day] || {code:'', stations:{}};
    const lavora = WORKING_CODES().includes(cella.code);
    const servizi = lavora ? (serviziDelCodice(cella.code, SHIFT_CONFIG()) || []) : [];
    if(collegate === null){
      collegate = servizi.every(sv=> stazioneDi(cella, sv) === stazioneDi(cella, servizi[0]));
    }
    // Un gruppo di scelte per servizio, o uno solo per tutta la giornata. Con un
    // turno che copre un servizio solo l'aspetto è identico a prima.
    const gruppi = (servizi.length > 1 && !collegate)
      ? servizi.map(sv=> ({ servizio: sv, etichetta: SERVICE_LABEL(sv), scelta: stazioneDi(cella, sv) || '' }))
      : [{ servizio: '*', etichetta: 'Partita', scelta: stazioneDi(cella, servizi[0]) || '' }];

    foglio.persona = s.name;
    foglio.quando = giornoPerEsteso(day);
    foglio.turni = Object.keys(TURNO_DEF()).map(code => ({
      codice: code, etichetta: code ? CODE_LABEL(code) : SIGLA_VUOTA,
    }));
    foglio.scelto = cella.code || '';
    foglio.stazioni = stazioniPer(s).map(st => ({ id: st.id, nome: st.name, colore: coloreStazione(st.id) }));
    foglio.gruppi = gruppi;
    foglio.lavora = lavora;
    foglio.mostraCollega = servizi.length > 1;
    foglio.collegate = collegate;
    foglio.extra = Boolean(cella.extra);
    foglio.senzaStazioni = senzaStazioni(s);
    foglio.aperto = true;
  }

  aggiorna();
}

function aggiornaTutto(){ renderTurni(); renderOreExtra(); renderDashboard(); }

/* ============================================================================
   QUESTO FILE E' SOLO IL COLLANTE. La griglia e' <cmd-griglia-turni>, che si
   porta dietro la geometria misurata e le due passate di adattamento del testo
   (i nomi e le partite si accorciano cambiando FORMA, non tagliando).

   Qui restano le cose che un componente non puo' sapere: dove stanno i turni,
   quanto vale un codice in ore, quale colore ha una partita, e cosa vuol dire
   toccare una cella.
   ========================================================================== */

let vista = null;

function oreDi(r){
  const scarto = r.extra > 0 ? '+' + r.extra.toFixed(1) + 'h'
               : (r.under > 0 ? '\u2212' + r.under.toFixed(1) + 'h' : 'in linea');
  return {
    totale: r.totalHours.toFixed(1) + 'h',
    scarto,
    classe: r.extra > 0 ? 'extra' : (r.under > 0 ? 'under' : ''),
    titolo: r.name + ' \u00b7 ' + r.totalHours.toFixed(1) + 'h pianificate'
      + (r.contracted ? ' su ' + r.contracted.toFixed(1) + 'h contrattuali nel periodo' : ''),
  };
}

function righeDa(dates, ore){
  const cfg = SHIFT_CONFIG();
  return state.staff.map((s, i) => ({
    id: s.id,
    nome: s.name,
    senzaStazioni: senzaStazioni(s),
    titolo: s.name + (senzaStazioni(s)
      ? ' \u2014 nessuna partita assegnata: il generatore non lo assegna' : ''),
    celle: dates.map(d => {
      const cella = normalizzaCella((state.shifts[s.id]||{})[d] || {code:'', stations:{}}, cfg);
      const lavora = WORKING_CODES().includes(cella.code);
      const partite = lavora ? partiteDi(cella) : [];
      return {
        giorno: d,
        sigla: cella.code || '',
        colore: coloreTurno(cella.code) || '',
        orario: lavora ? orarioDi(cella.code) : '',
        pallini: partite.map(st => coloreStazione(st.id)),
        stazione: partite[0] ? { id: partite[0].id, nome: partite[0].name } : null,
        // Con due partite si scrivono ENTRAMBE, abbreviate: «Pa/Pr». Prima qui
        // restavano i soli pallini e il dettaglio stava nel suggerimento — che
        // su un telefono non esiste. Ma «a pranzo ai primi, a cena al pass» e'
        // proprio la cosa che lo chef aveva chiesto: lasciarla leggibile solo
        // col mouse voleva dire non averla fatta.
        stazione2: partite[1] ? { id: partite[1].id, nome: partite[1].name } : null,
        extra: Boolean(cella.extra),
        titolo: s.name + ' \u00b7 ' + giornoPerEsteso(d) + ' \u00b7 ' + CODE_LABEL(cella.code)
          + (partite.length === 1 ? ' \u00b7 ' + partite[0].name
             : partite.length > 1 ? ' \u00b7 ' + dettaglioPartite(cella).join(' / ') : '')
          + (cella.extra ? ' \u00b7 turno extra' : ''),
      };
    }),
    ore: oreDi(ore[i]),
  }));
}

/* Riga dei totali per giorno: ore e teste. E' il controllo che mancava del
   tutto — si vede a colpo d'occhio se un giovedi' e' scoperto. */
function totaliDa(dates){
  return dates.map(d => {
    let h = 0, teste = 0;
    state.staff.forEach(s => {
      const code = ((state.shifts[s.id]||{})[d]||{}).code || '';
      h += CODE_HOURS(code);
      if(WORKING_CODES().includes(code)) teste++;
    });
    return {
      ore: h.toFixed(1) + 'h',
      teste,
      titolo: giornoPerEsteso(d) + ' \u00b7 ' + h.toFixed(1) + 'h su ' + teste
        + (teste === 1 ? ' persona' : ' persone'),
    };
  });
}

/* La legenda non e' decorativa: quando il nome della partita non entra nella
   cella, il pallino e' l'unica cosa che resta, e qui si legge cosa vuol dire. */
function legendaDa(dates){
  const voci = state.stations.map(st => ({ colore: coloreStazione(st.id), testo: st.name }));
  if(state.staff.some(senzaStazioni)){
    voci.push({ colore: 'var(--brass)', forma: 'vuoto',
      testo: 'senza partite: il generatore non li assegna, si assegnano a mano' });
  }
  // Due pallini in una cella sono l'unica cosa che si vede quando il nome non
  // ci sta, e da soli non si spiegano. La voce compare solo se nel periodo c'e'
  // DAVVERO una giornata su due partite: una legenda che spiega qualcosa che
  // non c'e' e' rumore.
  const dueDavvero = state.staff.some(s => dates.some(d =>
    partiteDi((state.shifts[s.id]||{})[d] || {}).length > 1));
  if(dueDavvero){
    voci.push({ colore: 'var(--brass)', forma: 'doppio',
      testo: "due partite nella stessa giornata: a pranzo una, a cena l'altra" });
  }
  return voci;
}

export function renderTurni(){
  const el = document.getElementById('turni-panel');
  if(!el) return;
  if(!state.staff.length){
    const vuoto = document.createElement('div');
    vuoto.className = 'empty';
    vuoto.textContent = 'Aggiungi prima persone alla brigata.';
    el.replaceChildren(vuoto);
    vista = null;
    return;
  }
  if(!vista || !vista.isConnected){
    vista = document.createElement('cmd-griglia-turni');
    vista.addEventListener('cella-tocca', e =>
      apriSceltaTurno(e.detail.personaId, e.detail.giorno));
    el.replaceChildren(vista);
  }

  const dates = periodDates();
  const oggi = isoDate(new Date());
  // Le ore per persona: lo STESSO calcolo del riquadro «Ore extra del periodo»,
  // e viene fuori nello stesso ordine di state.staff — quindi la riga i-esima
  // della griglia e la riga i-esima del conteggio sono la stessa persona.
  const ore = weeklyExtraFromTurni();

  vista.giorni = dates.map(d => {
    const g = dayName(d);
    return { iso: d, nome: g, numero: parseISO(d).getDate(),
             oggi: d === oggi, weekend: g === 'Sab' || g === 'Dom' };
  });
  // L'ORDINE DELLE RIGHE E' L'ORDINE DI state.staff, cioe' quello che il
  // titolare ha deciso coi pulsanti su/giu' nella brigata. Non si riordina qui:
  // due ordinamenti diversi per lo stesso elenco sono due elenchi diversi.
  vista.righe = righeDa(dates, ore);
  vista.totali = totaliDa(dates);
  vista.totalePeriodo = ore.reduce((n, r) => n + r.totalHours, 0).toFixed(1) + 'h';
  vista.stazioni = state.stations.map(st => ({ id: st.id, nome: st.name }));
  vista.legenda = legendaDa(dates);
  vista.turni = Object.entries(TURNO_DEF()).filter(([c]) => c).map(([, v]) => v.label).join(' \u00b7 ');
  vista.soloLettura = Cloud.enabled && !Cloud.canWrite();
}


export function weeklyExtraFromTurni(){
  const dates = periodDates();
  // Le ore contrattuali sono settimanali: su un mese vanno rapportate alla
  // durata del periodo, altrimenti chiunque risulterebbe in fortissimo extra.
  const settimane = dates.length / 7;
  return state.staff.map(s=>{
    const days = state.shifts[s.id] || {};
    const totalHours = dates.reduce((sum,d)=> sum + CODE_HOURS((days[d]||{}).code||''), 0);
    const contracted = (parseFloat(s.hours)||0) * settimane;
    const extra = Math.max(0, totalHours - contracted);
    const under = contracted>0 ? Math.max(0, contracted-totalHours) : 0;
    return {id:s.id, name:s.name, totalHours, contracted, extra, under};
  });
}
let vistaOre = null;

export function renderOreExtra(){
  // Attaccato qui apposta: e' lo stesso conto in un'altra unita' di misura, e
  // sette punti di chiamata da tenere allineati sono sette modi di scordarne
  // uno — con l'effetto che il costo resterebbe fermo al periodo di prima.
  renderCostoServizio();
  const el = document.getElementById('ore-extra-table');
  if(!el) return;
  if(!vistaOre || !vistaOre.isConnected){
    vistaOre = document.createElement('cmd-ore-extra');
    el.replaceChildren(vistaOre);
  }
  vistaOre.righe = weeklyExtraFromTurni().map(r => ({
    nome: r.name,
    pianificate: r.totalHours.toFixed(1) + 'h',
    contrattuali: r.contracted ? r.contracted.toFixed(1) + 'h' : '—',
    scarto: r.extra > 0 ? '+' + r.extra.toFixed(1) + 'h'
          : (r.under > 0 ? '−' + r.under.toFixed(1) + 'h sotto' : 'in linea'),
    classe: r.extra > 0 ? 'extra' : (r.under > 0 ? 'under' : ''),
  }));
}


// ============================================================================
// QUANTO COSTA IL PERIODO, e quanto serve incassare per pagarlo.
//
// Vive attaccato alle ore extra e non in una schermata sua: e' lo stesso conto
// guardato con un'altra unita' di misura — le stesse ore, moltiplicate per
// quello che costano. Separarli vorrebbe dire due punti da tenere allineati e
// un utente che deve cambiare scheda per capire perche' un numero e' quello.
//
// LE DUE STRADE, e il perche'. Chi vede le tariffe conta sul proprio telefono:
// ha gia' tutto, e un giro di rete per rifare una moltiplicazione sarebbe solo
// piu' lento. Chi vede i costi ma non le persone non ha le tariffe e non deve
// averle: per lui somma il database e ne esce solo il totale. Due strade
// perche' sono due domande diverse — «quanto costa Marco» e «quanto costa
// sabato» — e la seconda si puo' rispondere senza rispondere alla prima.
// ============================================================================
let vistaCosto = null;

export function renderCostoServizio(){
  const el = document.getElementById('costo-servizio');
  if(!el) return;

  // A chi non vede i costi il riquadro non compare affatto. Mostrarlo vuoto
  // sarebbe peggio: direbbe che c'e' un numero e che a lui non lo dicono.
  if(!Cloud.vedeCosti()){ el.replaceChildren(); vistaCosto = null; return; }

  if(!vistaCosto || !vistaCosto.isConnected){
    vistaCosto = document.createElement('cmd-costo-servizio');
    el.replaceChildren(vistaCosto);
  }
  vistaCosto.soloLettura = Cloud.enabled && !Cloud.canWrite();

  const giorni = periodDates();
  const foodPct = foodCostMedio(state.recipes || []);

  if(Cloud.vedeTariffe()){
    const r = costoDelLavoro({
      giorni, turni: state.shifts, persone: state.staff, oreDi: CODE_HOURS,
    });
    mostra(r.perGiorno, r.ore, r.costo, r.senzaTariffa, foodPct, false,
           state.staff.every(p => p.costoOrario == null || p.costoOrario === ''));
    return;
  }

  // Chi vede i costi ma non le persone: il totale lo fa il database.
  Cloud.costoLavoro(giorni[0], giorni[giorni.length - 1]).then(righe => {
    if(!righe){ el.replaceChildren(); vistaCosto = null; return; }
    const perGiorno = giorni.map(g => {
      const r = righe.find(x => x.giorno === g);
      return { giorno: g, ore: r ? r.ore : 0, costo: r ? r.costo : 0,
               completo: r ? r.completo : true };
    });
    mostra(perGiorno,
           perGiorno.reduce((n, g) => n + g.ore, 0),
           perGiorno.reduce((n, g) => n + g.costo, 0),
           // I nomi di chi non ha la tariffa non escono dal database, ed e'
           // giusto cosi': sapere CHI sono e' gia' un dato sulle persone.
           perGiorno.some(g => !g.completo) ? ['\u2014'] : [],
           foodPct, true,
           perGiorno.every(g => g.costo === 0));
  });
}

function mostra(perGiorno, ore, costo, senzaTariffa, foodPct, soloTotale, vuoto){
  if(!vistaCosto) return;
  const massimo = perGiorno.reduce((m, g) => Math.max(m, g.costo), 0);
  const pareggio = incassoDiPareggio(costo, foodPct);

  vistaCosto.vuoto = vuoto;
  vistaCosto.soloTotale = soloTotale;
  vistaCosto.costo = soldi(costo);
  vistaCosto.ore = ore.toFixed(1) + 'h';
  vistaCosto.pareggio = pareggio === null ? '' : soldi(pareggio);
  vistaCosto.foodCost = foodPct === null ? '' : foodPct.toFixed(0) + '%';
  vistaCosto.senzaTariffa = senzaTariffa;
  // Solo i giorni in cui si e' lavorato: una riga a zero per ogni riposo
  // allungherebbe l'elenco senza dire niente.
  vistaCosto.giorni = perGiorno.filter(g => g.ore > 0).map(g => {
    const d = parseISO(g.giorno);
    const nome = dayName(g.giorno);
    return {
      etichetta: nome + ' ' + d.getDate(),
      ore: g.ore.toFixed(1) + 'h',
      costo: soldi(g.costo),
      quota: massimo > 0 ? g.costo / massimo : 0,
      completo: g.completo,
      weekend: nome === 'Sab' || nome === 'Dom',
    };
  });
}
