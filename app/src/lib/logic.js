// ============================================================================
// Comanda — motore di generazione turni (logica pura, senza DOM/storage)
// Modulo ES puro: nessun DOM, nessuno storage, nessuna dipendenza.
// È il motore, ed è la parte che i test coprono per intero.
// Qualunque modifica a questo file richiede che la test suite in /tests passi.
//
// I SERVIZI NON SONO CABLATI QUI. Ogni cucina definisce i propri (colazione,
// pranzo, cena, ma anche aperitivo, brunch, lunch...) e i tipi di turno che li
// coprono. Il motore riceve questa configurazione e ci lavora sopra:
//
//   services   = [{id, name}]
//   shiftTypes = [{code, label, hours, services:[serviceId, ...]}]
//
// Un tipo di turno che elenca DUE servizi è ciò che prima era lo "spezzato":
// una persona sola che copre pranzo e cena. Non è più un caso speciale nel
// codice, è una configurazione come le altre.
//
// Nemmeno le stazioni sono cablate. Chi genera può passarne l'elenco:
//
//   options.stazioni = [{id, name, copreAnche:[altroId, ...]}]
//
// `copreAnche` dice che chi lavora QUI copre anche quelle altre — le insalate
// che danno una mano al lavaggio. È facoltativo: senza, tutto si comporta come
// prima, ed è il caso di ogni cucina che non l'ha ancora impostato.
// ============================================================================

const DAYS = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];

// Codici sempre presenti, non cancellabili: non coprono servizi e non hanno ore.
const SPECIAL_CODES = {
  'R': {label:'R · Riposo',   hours:0},
  'M': {label:'M · Malattia', hours:0},
  'F': {label:'F · Ferie',    hours:0},
};
const REST_CODE = 'R';

// Configurazione di partenza per una cucina nuova, e per chi aveva i tre
// servizi cablati nella versione precedente.
const DEFAULT_SERVICES = [
  {id:'colazione', name:'Colazione'},
  {id:'pranzo',    name:'Pranzo'},
  {id:'cena',      name:'Cena'},
];
const DEFAULT_SHIFT_TYPES = [
  {code:'C',  label:'Colazione 7:30–15:00',      hours:7.5, services:['colazione']},
  {code:'P',  label:'Pranzo 9:00–17:00',         hours:8,   services:['pranzo']},
  {code:'S',  label:'Cena 15:00–23:00',          hours:8,   services:['cena']},
  {code:'SP', label:'Spezzato 10–16 / 18–23',    hours:11,  services:['pranzo','cena']},
];

// ----------------------------------------------------------------------------
// Da configurazione a tabelle di consultazione. Sostituisce le vecchie costanti
// TURNO_DEF / SERVICE_CODES / CODE_TO_SERVICES / MAIN_CODE, che erano fisse.
// ----------------------------------------------------------------------------
function buildShiftConfig(services, shiftTypes){
  services = (services && services.length) ? services : DEFAULT_SERVICES;
  shiftTypes = (shiftTypes && shiftTypes.length) ? shiftTypes : DEFAULT_SHIFT_TYPES;

  const turnoDef = { '': {label:'—', hours:0} };
  const codeToServices = {};
  const serviceCodes = {};
  const mainCode = {};
  const workingCodes = [];

  services.forEach(sv=>{ serviceCodes[sv.id] = []; });

  shiftTypes.forEach(st=>{
    turnoDef[st.code] = { label: st.code+' · '+st.label, hours: parseFloat(st.hours)||0 };
    codeToServices[st.code] = (st.services||[]).slice();
    workingCodes.push(st.code);
    (st.services||[]).forEach(svId=>{
      if(!serviceCodes[svId]) serviceCodes[svId] = [];
      serviceCodes[svId].push(st.code);
      // Il turno "principale" di un servizio è quello che copre solo quello:
      // è ciò che si assegna quando non serve accorpare due servizi.
      if(!mainCode[svId] && (st.services||[]).length === 1) mainCode[svId] = st.code;
    });
  });
  // Servizio senza un turno dedicato: ripiega sul primo che lo copre, così non
  // resta scoperto solo perché è configurato solo dentro un turno accorpato.
  services.forEach(sv=>{
    if(!mainCode[sv.id] && serviceCodes[sv.id] && serviceCodes[sv.id].length){
      mainCode[sv.id] = serviceCodes[sv.id][0];
    }
  });

  Object.keys(SPECIAL_CODES).forEach(c=>{ turnoDef[c] = SPECIAL_CODES[c]; });

  return {
    services, shiftTypes,
    serviceIds: services.map(s=>s.id),
    serviceLabels: services.reduce((m,s)=>{ m[s.id]=s.name; return m; }, {}),
    turnoDef, codeToServices, serviceCodes, mainCode, workingCodes,
  };
}

// ----------------------------------------------------------------------------
// Date. I turni sono indicizzati per data reale ("2026-09-14"), non per nome
// del giorno: senza data esisterebbe una sola settimana, senza storico e senza
// sapere quale settimana sia. Tutto costruito in ora locale — passando da UTC
// un turno di lunedì può scivolare a domenica a seconda del fuso.
// ----------------------------------------------------------------------------
function isoDate(d){
  const p = n => String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
function parseISO(s){
  const [y,m,d] = String(s).split('-').map(Number);
  return new Date(y, m-1, d);
}
// Lunedì della settimana che contiene la data.
function startOfWeek(d){
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay()+6) % 7));
  return x;
}
function weekDates(anchor){
  const start = startOfWeek(anchor);
  return Array.from({length:7}, (_,i)=>{
    const d = new Date(start); d.setDate(start.getDate()+i); return isoDate(d);
  });
}
function monthDates(anchor){
  const y = anchor.getFullYear(), m = anchor.getMonth();
  const n = new Date(y, m+1, 0).getDate();
  return Array.from({length:n}, (_,i)=> isoDate(new Date(y, m, i+1)));
}
// Nome del giorno di una data, con lo stesso vocabolario di DAYS.
function dayName(iso){ return DAYS[(parseISO(iso).getDay()+6) % 7]; }

// Raggruppa date consecutive per settimana (lunedì-domenica). Serve al
// generatore: le quote sono settimanali, quindi ogni settimana riparte da capo.
function groupByWeek(dates){
  const gruppi = new Map();
  dates.forEach(iso=>{
    const k = isoDate(startOfWeek(parseISO(iso)));
    if(!gruppi.has(k)) gruppi.set(k, []);
    gruppi.get(k).push(iso);
  });
  return Array.from(gruppi.values());
}

// ----------------------------------------------------------------------------
// Il caso, ma ripetibile. Senza seme il motore usa Math.random e due
// generazioni sugli stessi dati danno due prospetti diversi: non si può rifare
// un prospetto che piaceva, né confrontare l'effetto di una modifica alle
// quote a parità di tutto il resto. Con un seme il risultato è sempre lo
// stesso. Quattro righe, nessuna dipendenza: il file dichiara di non averne.
// Senza `options.seed` il comportamento resta identico a prima, Math.random
// compreso.
// ----------------------------------------------------------------------------
function mulberry32(a){
  return function(){
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Il seme può arrivare come numero o come testo (per esempio la data del
// lunedì del periodo, che è la cosa più naturale da passare dal generatore).
function semeNumerico(v){
  if(typeof v === 'number' && isFinite(v)) return v|0;
  const s = String(v);
  let h = 2166136261;
  for(let i=0;i<s.length;i++){ h = Math.imul(h ^ s.charCodeAt(i), 16777619); }
  return h|0;
}

function shuffleArray(arr, rand){ rand = rand || Math.random; for(let i=arr.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }

function buildStaffPools(staffList, rand){
  const pools = {};
  staffList.forEach(s=>{
    let slots = [];
    (s.weeklyQuota||[]).forEach(g=>{
      for(let k=0;k<(parseInt(g.count)||0);k++){ slots.push({codes:(g.codes&&g.codes.length)?g.codes.slice():[REST_CODE]}); }
    });
    while(slots.length<7) slots.push({codes:[REST_CODE]});
    if(slots.length>7) slots = slots.slice(0,7);
    pools[s.id] = shuffleArray(slots, rand);
  });
  return pools;
}

// ----------------------------------------------------------------------------
// Vincoli: le richieste approvate del personale (ferie, riposi, "solo pranzo")
// e gli impegni in altre cucine. Sono REGOLE ASSOLUTE — il generatore non le
// viola mai: se non riesce a coprire un servizio rispettandole, lo dichiara.
//
// Forma attesa:
//   constraints[staffId][data] = { blocked:'F'|'R', services:[id,...] }
//     blocked  → la persona non è assegnabile quel giorno, con quel codice
//     services → è assegnabile SOLO a turni che coprono uno di questi servizi
// ----------------------------------------------------------------------------
function constraintFor(constraints, staffId, day){
  return (constraints && constraints[staffId] && constraints[staffId][day]) || null;
}
// Il codice è ammesso per questa persona in questo giorno?
function codeAllowed(constraints, staffId, day, code, codeToServices){
  const c = constraintFor(constraints, staffId, day);
  if(!c) return true;
  if(c.blocked) return false;
  if(c.services && c.services.length){
    const coperti = codeToServices[code] || [];
    // Un turno che copre anche servizi NON richiesti va escluso: chi ha chiesto
    // "solo pranzo" non deve ritrovarsi lo spezzato che gli porta dentro la cena.
    return coperti.length > 0 && coperti.every(sv=> c.services.includes(sv));
  }
  return true;
}

// Questa persona è disponibile a turni OLTRE la sua quota?
// Il confronto è con `false`, non con `true`, e non è un dettaglio di stile:
// chi ha già i dati salvati non ha questo campo, `undefined !== false` è vero,
// e continua a comportarsi esattamente come prima. Scritto `=== true` il
// default si invertirebbe e l'intera brigata esistente smetterebbe di poter
// coprire un buco, senza che nessuno l'abbia deciso.
function puoFareExtra(s){ return s.puoFareExtra !== false; }

// ----------------------------------------------------------------------------
// PRIORITA' DI PARTITA. `staff.stations` e' sempre stato un array, e l'ordine
// c'era gia': semplicemente nessuno lo guardava. Adesso l'ordine E' la
// priorita' — la prima stazione e' la partita principale della persona, le
// successive sono quelle su cui si sposta quando serve.
//
// Nessuna coppia di partite e' cablata qui dentro. Parole dello chef: «tu
// menzioni sempre primi e pass, ma alcune persone magari fanno primi e secondi
// o secondi e pass, quindi la priorita' la deve impostare sempre il titolare».
// Vale per qualunque combinazione, e non c'e' niente da migrare: chi ha gia' i
// dati salvati ha gia' un ordine, quello in cui le stazioni sono state spuntate.
// Nel peggiore dei casi e' un ordine casuale, e il motore si comporta come
// prima; appena il titolare lo sistema, il motore lo segue.
//
// 999 per chi non ha quella stazione: non dovrebbe capitare (i candidati sono
// gia' filtrati per qualifica) ma un -1 dell'indexOf finirebbe DAVANTI a tutti
// e ribalterebbe il criterio invece di non applicarlo.
function prioritaDi(s, stationId){
  const i = (s.stations||[]).indexOf(stationId);
  return i < 0 ? 999 : i;
}

// ----------------------------------------------------------------------------
// DOPPIA PARTITA: «quando Rakib sta alle insalate lo conto comunque nei due del
// lavaggio, perche' mentre fa le insalate aiuta l'altro al lavaggio».
//
// L'impostazione sta sulla STAZIONE (`{id, name, copreAnche:[altroId,...]}`) e
// non sulla persona, e la scelta non e' indifferente:
//   - E' un fatto della cucina, non di chi ci lavora. Le insalate stanno
//     accanto al lavaggio: chiunque ci stia dara' una mano, anche l'ultimo
//     arrivato. Sulla persona, la stessa verita' andrebbe ripetuta su ogni
//     scheda e ricopiata a ogni assunzione — e dimenticarsela non da' nessun
//     errore, toglie copertura in silenzio.
//   - Sono poche impostazioni: una per stazione (otto), non una per persona
//     (quindici, e crescono).
//   - Si generalizza: «al pass si copre anche il passaggio piatti», «al bar si
//     copre anche la caffetteria». Questa app deve servire molte cucine, non
//     solo questa.
//
// Chiusura transitiva, cosi' una catena A→B→C non si ferma al primo salto; il
// set dei visti regge anche un anello A→B→A senza girare all'infinito.
// Senza `stazioni` fra le opzioni non c'e' nessuna copertura di rimbalzo e il
// motore si comporta esattamente come prima: e' il default per chi ha gia' i
// dati salvati.
function costruisciCoperture(stazioni){
  const diretti = {};
  (stazioni||[]).forEach(st=>{
    if(!st || !st.id) return;
    diretti[st.id] = (st.copreAnche||[]).filter(x=> x && x !== st.id);
  });
  const chiusura = {};
  Object.keys(diretti).forEach(id=>{
    const visti = new Set([id]), out = [], coda = diretti[id].slice();
    while(coda.length){
      const x = coda.shift();
      if(visti.has(x)) continue;
      visti.add(x); out.push(x);
      (diretti[x]||[]).forEach(y=>{ if(!visti.has(y)) coda.push(y); });
    }
    chiusura[id] = out;
  });
  return chiusura;
}

// ----------------------------------------------------------------------------
// IL CONTO DI CAPIENZA — quello che lo chef fa a mente PRIMA di cominciare.
//
// «Io NON guardo giorno per giorno, prima mi faccio un'idea in testa e poi
// inizio.» L'idea in testa e' un'aritmetica, e finora il generatore non la
// faceva: per ogni partita, quanti posti servono in settimana, quanti ne
// coprono le persone che la sanno fare con le quote che hanno, e quindi quanti
// extra saranno inevitabili. Si sa PRIMA di generare, non leggendo le
// scoperture nel prospetto quando ormai il danno e' fatto.
//
// L'unita' di misura e' il POSTO-SERVIZIO: la quaterna (giorno, servizio,
// stazione, k-esima persona richiesta). «Due al lavaggio» a pranzo e a cena
// fanno 4 posti in una giornata, 28 in una settimana. NON e' la giornata: chi
// conta in giornate trova 14 dove lo chef ne conta 28, ed e' il motivo per cui
// i due conti non tornavano mai fra loro.
//
// Il conto dello chef sul lavaggio — 28 richiesti, 32 di capienza, 6 spesi
// altrove, 26 disponibili, 2 mancanti — esce da queste regole:
//
//   1. Il valore di uno slot di quota e' il numero di servizi che il suo codice
//      copre: uno spezzato vale 2 posti, un turno singolo 1, R/M/F zero. Sono i
//      posti che quella persona chiude con quel giorno di lavoro.
//   2. LA CAPIENZA DI CHI FA DUE PARTITE NON SI SOMMA SU ENTRAMBE. E' una sola
//      e si spende da una parte o dall'altra. Chi sta su insalate e lavaggio e'
//      dentro i 32 della capienza lorda del lavaggio, ma i suoi 6 se li
//      prendono le insalate e al lavaggio ne restano 26. Il -6 non arriva da
//      fuori: si DEDUCE dal fabbisogno delle insalate. Sommare la capienza due
//      volte farebbe sparire i 2 extra del lavaggio, che invece sono veri.
//   3. Si allocano le partite in ordine di RARITA' crescente — quante persone
//      in brigata la sanno fare — e dentro ogni partita prima chi ce l'ha come
//      principale, poi chi ce l'ha come seconda (`prioritaDi`). E' lo stesso
//      ordine con cui il motore riempie i giorni.
//   4. LE QUOTE SONO SETTIMANALI. Su un periodo piu' lungo il conto si fa per
//      settimana e si somma: fatto in un blocco solo, su due settimane la
//      capienza risulterebbe la meta' di quella vera e una partita scoperta
//      sembrerebbe coperta.
//
// LA MANO DI RIMBALZO E' UN'ALTRA COSA, e va contata in un altro modo. «Quando
// Rakib sta alle insalate lo conto comunque nei due del lavaggio»: quel turno
// non si spende due volte, chiude un posto alle insalate E uno al lavaggio
// nello stesso momento. Quindi la copertura di rimbalzo non toglie niente a
// nessuna tasca — si aggiunge, gratis. Contarla come una spesa direbbe che alla
// brigata di Rakib mancano 14 posti quando il generatore li copre tutti.
// Perche' il conto sia giusto, chi DA' una mano va allocato prima di chi la
// riceve: e' lo stesso ordine, e per lo stesso motivo, che il motore usa sui
// giorni.
//
// Quello che questo conto NON sa, ed e' giusto saperlo leggendolo: e' un tetto
// superiore. Non guarda le richieste approvate (ferie, riposi concordati), che
// tolgono capienza, e non guarda se i servizi che un codice copre sono proprio
// quelli che la partita chiede. Serve a dire «qui mancano due posti, preparati»,
// non a promettere che due bastino.
// ----------------------------------------------------------------------------

// Quanti posti-servizio chiude uno slot di quota. Lo slot puo' elencare piu'
// codici alternativi (['P','S','SP']): vale il migliore, perche' la capienza e'
// il massimo che quella persona puo' dare, non la media.
function valoreSlot(codes, cfg){
  let v = 0;
  (codes || [REST_CODE]).forEach(c=>{
    const n = (cfg.codeToServices[c] || []).length;
    if(n > v) v = n;
  });
  return v;
}
// Capienza di una persona in UNA settimana, in posti-servizio.
// Il tetto dei 7 slot e' lo stesso di buildStaffPools: una quota che ne dichiara
// di piu' non fa comparire un ottavo giorno nella settimana. Qui pero' si
// tengono i primi 7 nell'ordine dichiarato invece di sorteggiarli: un conto che
// si fa prima di generare non puo' cambiare a ogni lettura.
function capienzaSettimanale(s, cfg){
  let posti = 0, slot = 0;
  for(const g of (s.weeklyQuota || [])){
    const n = parseInt(g.count) || 0;
    for(let k=0; k<n && slot<7; k++){
      slot++;
      posti += valoreSlot((g.codes && g.codes.length) ? g.codes : [REST_CODE], cfg);
    }
  }
  return posti;
}

function contoCapienza(staffList, staffingNeeds, options){
  options = options || {};
  const cfg = options.config || buildShiftConfig(null, null);
  const SERVICES = cfg.serviceIds;
  staffList = staffList || [];
  staffingNeeds = staffingNeeds || {};

  // Il periodo. `dates` (date vere) e' quello che passa il generatore; `days`
  // (nomi dei giorni) e' la forma vecchia, ed e' una settimana sola.
  const giorni = (options.dates && options.dates.length) ? options.dates
    : (options.days && options.days.length) ? options.days : DAYS;
  const sonoDate = giorni.every(d=> /^\d{4}-\d{2}-\d{2}$/.test(String(d)));
  const settimane = sonoDate ? groupByWeek(giorni) : [giorni];

  // Posti-servizio richiesti in UNA giornata, partita per partita.
  const postiAlGiorno = {};
  SERVICES.forEach(sv=> (staffingNeeds[sv] || []).forEach(n=>{
    const c = parseInt(n.count) || 0;
    if(c > 0) postiAlGiorno[n.stationId] = (postiAlGiorno[n.stationId] || 0) + c;
  }));

  const copreOltre = costruisciCoperture(options.stazioni);
  const riceveDaAltri = {};
  Object.keys(copreOltre).forEach(d=> copreOltre[d].forEach(r=>{ riceveDaAltri[r] = true; }));
  // Chi da' una mano a questa partita restando sulla propria.
  const donatoriDi = st => Object.keys(copreOltre).filter(y=> copreOltre[y].includes(st));

  const partite = Object.keys(postiAlGiorno);
  const suoi = {};
  partite.forEach(st=>{ suoi[st] = staffList.filter(s=> (s.stations||[]).includes(st)); });
  // L'ordine di allocazione, identico a quello con cui il motore copre le
  // stazioni dentro un servizio, e per gli stessi motivi:
  //   - una partita che nessuno in brigata sa fare va in fondo: da sola non si
  //     chiude in nessun caso, e mandarla avanti per rarita' non serve;
  //   - chi DA' una mano prima di chi la riceve, altrimenti la mano arriva a
  //     giochi fatti e non vale niente;
  //   - poi rarita' crescente.
  // Il sort di JS e' stabile: a pari chiave resta l'ordine in cui le partite
  // compaiono nel fabbisogno, che e' un ordine che il titolare vede.
  const ordine = partite.slice().sort((a,b)=>{
    const qa = suoi[a].length, qb = suoi[b].length;
    if((qa?0:1) !== (qb?0:1)) return (qa?0:1) - (qb?0:1);
    const ra = riceveDaAltri[a] ? 1 : 0, rb = riceveDaAltri[b] ? 1 : 0;
    if(ra !== rb) return ra - rb;
    return qa - qb;
  });

  const conto = {};
  partite.forEach(st=>{ conto[st] = {
    stationId: st, domanda:0, capienza:0, spesaAltrove:0, disponibile:0,
    rimbalzo:0, allocata:0, mancanti:0, qualificati: suoi[st].map(s=> s.id),
  }; });

  settimane.forEach(sett=>{
    // Una sola tasca per persona, per tutta la settimana. E' il punto 2.
    const residua = {};
    staffList.forEach(s=>{ residua[s.id] = capienzaSettimanale(s, cfg); });
    // Turni che ogni partita si prende dalle proprie tasche: e' la quantita'
    // che poi da' una mano alle partite di rimbalzo. Non ci si mette dentro la
    // mano ricevuta, o una catena A→B→C la conterebbe due volte (la chiusura
    // transitiva di `copreOltre` gia' porta A fino a C).
    const dalleTasche = {};

    ordine.forEach(st=>{
      const domanda = (postiAlGiorno[st] || 0) * sett.length;
      const lorda = suoi[st].reduce((n,s)=> n + capienzaSettimanale(s, cfg), 0);
      const disponibile = suoi[st].reduce((n,s)=> n + residua[s.id], 0);
      // La mano che arriva da un'altra partita: gratis, non si spende due volte.
      const rimbalzo = Math.min(domanda,
        donatoriDi(st).reduce((n,y)=> n + (dalleTasche[y] || 0), 0));
      // Dentro la partita: prima chi ce l'ha come principale.
      const inOrdine = suoi[st].slice().sort((a,b)=> prioritaDi(a, st) - prioritaDi(b, st));
      let daCoprire = domanda - rimbalzo;
      let presi = 0;
      for(const p of inOrdine){
        if(daCoprire <= 0) break;
        const preso = Math.min(residua[p.id], daCoprire);
        residua[p.id] -= preso; daCoprire -= preso; presi += preso;
      }
      dalleTasche[st] = presi;
      conto[st].domanda      += domanda;
      conto[st].capienza     += lorda;
      conto[st].disponibile  += disponibile;
      conto[st].spesaAltrove += (lorda - disponibile);
      conto[st].rimbalzo     += rimbalzo;
      conto[st].allocata     += rimbalzo + presi;
      conto[st].mancanti     += Math.max(0, domanda - rimbalzo - presi);
    });
  });

  const elenco = ordine.map(st=> conto[st]);
  return {
    giorni: giorni.length,
    settimane: settimane.length,
    partite: elenco,
    // Gli extra che il conto dice inevitabili: nessuna scelta di chi va dove li
    // fa sparire, perche' la capienza proprio non c'e'. Sono STRUTTURALI, e si
    // leggono come «o si assume, o si alza una quota, o si abbassa il
    // fabbisogno» — non come un difetto del generatore.
    extraStrutturali: elenco.reduce((n,p)=> n + p.mancanti, 0),
  };
}

function computeShifts(staffList, staffingNeeds, options){
  options = options || {};
  const cfg = options.config || buildShiftConfig(null, null);
  const SERVICES = cfg.serviceIds;
  const { serviceCodes: SERVICE_CODES, codeToServices: CODE_TO_SERVICES,
          mainCode: MAIN_CODE, workingCodes: WORKING_CODES, turnoDef: TURNO_DEF } = cfg;
  const days = options.days || DAYS;
  const constraints = options.constraints || {};
  const rand = (options.seed != null) ? mulberry32(semeNumerico(options.seed)) : Math.random;
  // Tetto ai turni oltre quota per persona. Di default non c'è: chi non lo
  // imposta ha il comportamento di sempre.
  // Il tetto agli extra ha due letture diverse, e non è una svista:
  //   0 (o meno) = "nessun extra", ed è una REGOLA. Vale come chi ha detto di no:
  //                si dichiara la scopertura, non si chiama nessuno lo stesso.
  //   1 o più    = "non più di N a testa", ed è una PREFERENZA forte: se
  //                rispettarla lascerebbe una postazione scoperta, si sfora.
  // Prima 0 non era né l'una né l'altra cosa: il filtro `extraFatti < 0` era
  // vuoto al primo giro, quindi il tetto non scattava mai e si ripiegava sui
  // candidati liberi. Chi scriveva 0 per non avere extra otteneva il massimo
  // di concentrazione: l'esatto contrario.
  const tetto = options.maxExtraPerPersona;
  const extraVietati = (tetto != null) && !(tetto > 0);
  const maxExtra = (tetto != null && tetto > 0) ? tetto : Infinity;

  // Chi lavora su una stazione ne copre anche altre (vedi costruisciCoperture).
  // `coperteDa` restituisce sempre almeno la stazione stessa: senza
  // configurazione e' una lista di uno, e ogni conto resta quello di prima.
  const copreOltre = costruisciCoperture(options.stazioni);
  const coperteDa = st => [st].concat(copreOltre[st] || []);
  // Chi riceve copertura di rimbalzo da qualcun altro. Serve per l'ORDINE in
  // cui le stazioni vengono coperte dentro un servizio: se il lavaggio venisse
  // servito per primo si prenderebbe le sue due persone dedicate, e la mano di
  // Rakib dalle insalate arriverebbe a giochi fatti — cioe' non varrebbe
  // niente. Chi da' una mano va piazzato PRIMA di chi la riceve.
  const riceveDaAltri = {};
  Object.keys(copreOltre).forEach(d=> copreOltre[d].forEach(r=>{ riceveDaAltri[r] = true; }));

  const pools = buildStaffPools(staffList, rand);
  const assigned = {}, stationAssign = {}, extraFlag = {};
  staffList.forEach(s=>{ assigned[s.id]={}; stationAssign[s.id]={}; extraFlag[s.id]={}; });
  const shortfalls = [];
  const extras = [];
  // Ore già assegnate nella settimana, e turni oltre quota già chiesti. Si
  // azzerano a ogni settimana insieme alle quote, perché insieme alle quote
  // ripartono: computeShiftsForDates chiama questa funzione una volta per
  // settimana.
  const oreFatte = {}, extraFatti = {};
  staffList.forEach(s=>{ oreFatte[s.id] = 0; extraFatti[s.id] = 0; });
  // Le ore del turno arrivano dalla configurazione della cucina e possono
  // mancare o essere zero: un NaN qui non si vede, rende solo l'ordinamento
  // indefinito e il prospetto inspiegabile.
  const oreDi = code => (TURNO_DEF[code] && TURNO_DEF[code].hours) || 0;
  // Slot di quota ancora da smaltire che diventeranno sicuramente lavoro.
  // Criterio esplicito: uno slot che ha anche il riposo fra i codici può
  // finire a riposo, quindi non si conta — altrimenti il conteggio balla.
  const quotaLavoroResidua = s =>
    pools[s.id].filter(slot=> !slot.codes.includes(REST_CODE)).length;

  // --------------------------------------------------------------------------
  // LA FORMA DELLA SETTIMANA, decisa prima di guardare il primo giorno.
  //
  // «Io NON guardo giorno per giorno, prima mi faccio un'idea in testa così e
  // poi inizio.» Questo è quel passaggio, e sta tutto in un'aritmetica che ha
  // una sola soluzione. Su una partita, in una settimana:
  //
  //     x + y = T      si spendono i turni che si hanno
  //    2x + y = F      si coprono i posti-servizio richiesti, e basta quelli
  //   ⇒  x = F − T spezzati ,  y = 2T − F turni singoli
  //
  // dove un POSTO-SERVIZIO è la coppia (servizio, persona richiesta). «2 al
  // lavaggio» a pranzo e a cena sono 4 posti in una giornata, 28 in una
  // settimana — l'unità in cui conta lo chef. Il motore contava in GIORNATE, e
  // per questo i due conti non tornavano mai fra loro.
  //
  // Le due frasi dello chef — «se uno riposa l'altro fa spezzato» e «se uno fa
  // sera l'altro fa solo pranzo» — non sono due regole da scrivere: sono le due
  // uniche forme che una giornata può prendere quando la copertura è esatta e
  // la quota si spende tutta. Escono da sole da questa equazione, e cablarle
  // vorrebbe dire scriverla due volte e romperle al primo caso fuori misura.
  //
  // Perché F e T vanno divisi PER PARTITA e non sommati su tutta la brigata:
  // misurato sulla brigata dello chef, con un budget unico i turni singoli
  // finivano al lavaggio — la partita che di singoli ne regge due su quindici —
  // e le partite in coppia si prendevano tutti gli spezzati. Quattro turni
  // extra al lavaggio il sabato e la domenica, e 46 ore di scarto fra la
  // persona più carica e la meno carica. Con il budget per partita: zero extra.
  // --------------------------------------------------------------------------
  const postiAlGiorno = {};
  SERVICES.forEach(sv=>{ (staffingNeeds[sv]||[]).forEach(n=>{
    postiAlGiorno[n.stationId] = (postiAlGiorno[n.stationId]||0) + (parseInt(n.count)||0);
  }); });
  const serviziDi = st => SERVICES.filter(sv=>
    (staffingNeeds[sv]||[]).some(n=> n.stationId===st && (parseInt(n.count)||0) > 0));
  // Quanti posti può chiudere UN turno su questa partita: dipende da quali
  // servizi la stazione richiede e da quali codici li accorpano. Su una cucina
  // che apre solo a pranzo vale 1, e l'equazione si riduce a "un turno, un
  // posto" — cioè al comportamento di sempre.
  const postiPerTurno = st => {
    const suoi = serviziDi(st);
    let m = 1;
    WORKING_CODES.forEach(c=>{
      const k = (CODE_TO_SERVICES[c]||[]).filter(x=> suoi.includes(x)).length;
      if(k > m) m = k;
    });
    return m;
  };
  const capienza = {};
  staffList.forEach(s=>{ capienza[s.id] = quotaLavoroResidua(s); });
  const turniResidui = {};
  Object.keys(postiAlGiorno).forEach(st=>{ turniResidui[st] = 0; });
  // Partite più rare per prime: è lo stesso criterio con cui il motore riempie
  // i giorni, e ripete il ragionamento dello chef (chi ha meno margine sceglie
  // prima). Dentro la partita, prima chi sa fare meno stazioni.
  const perRarita = Object.keys(postiAlGiorno).sort((a,b)=>
    staffList.filter(s=> s.stations && s.stations.includes(a)).length -
    staffList.filter(s=> s.stations && s.stations.includes(b)).length);
  // La ripartizione vera e propria: «mi divido prima nella testa le persone a
  // partita». Quello che serve al motore è il totale per partita — quanti turni
  // quella partita può contare di avere in settimana — non chi li fa: il "chi"
  // lo decide il giro sui giorni, con i criteri che già esistono.
  const alloca = (st, tetto)=>{
    // Stessa gerarchia dei candidati sui giorni, e per lo stesso motivo: prima
    // chi sa fare meno stazioni, poi — a pari flessibilita' — chi ha QUESTA
    // come partita principale. E' letteralmente «mi divido prima le persone a
    // partita»: la capienza della settimana va sulla partita di casa, e solo
    // quella che avanza finisce sulle secondarie.
    // Non e' un abbellimento, e' la meta' che conta: guardare l'ordine solo
    // sui giorni e non qui lascia la capienza sulla partita sbagliata e a fine
    // settimana manca dove serviva. Misurato su una brigata di otto persone
    // con due partite a testa, 20 lotti da 120 generazioni: con questo
    // criterio 30-59 scoperture per lotto, senza 114-155.
    const qualificati = staffList.filter(s=> s.stations && s.stations.includes(st))
      .sort((a,b)=> (a.stations.length - b.stations.length)
        || (prioritaDi(a, st) - prioritaDi(b, st)));
    // Un turno alla volta, a giro. Prendendo da ciascuno TUTTO quello che ha
    // prima di passare al successivo, la prima persona dell'elenco si porta via
    // la partita e la seconda resta a guardare: misurato su due pari qualifica
    // in un mese, 23 giorni di lavoro contro 7. A giro l'ordine conta ancora
    // (chi sa fare meno stazioni parte per primo e finisce con un turno in più)
    // ma nessuno resta a secco.
    for(const p of qualificati){
      if(turniResidui[st] >= tetto) break;
      const take = Math.min(capienza[p.id], tetto - turniResidui[st]);
      capienza[p.id] -= take; turniResidui[st] += take;
    }
  };
  // Due giri, e il primo non è un dettaglio. Assegnando subito a ciascuna
  // partita tutti i turni che potrebbe usare, la prima partita si prende per
  // intero chi fa anche la seconda, e la seconda resta a zero: sulla brigata
  // dello chef il pass sparirebbe del tutto. Il primo giro dà a ognuna il
  // MINIMO per stare in piedi (tutti spezzati), il secondo distribuisce il
  // resto. È il modo in cui lo chef si divide le persone a partita prima di
  // cominciare.
  perRarita.forEach(st=> alloca(st, Math.ceil((postiAlGiorno[st]*days.length) / postiPerTurno(st))));
  perRarita.forEach(st=> alloca(st, postiAlGiorno[st]*days.length));

  // --------------------------------------------------------------------------
  // DOVE STANNO I RIPOSI. Secondo pezzo dell'idea che lo chef si fa in testa
  // prima di cominciare: «li divido equamente in tutti i giorni della settimana
  // in modo che ogni giorno riposino lo stesso numero di persone o quasi, per
  // non avere giorni in cui ho 6 persone di riposo e altri in cui ce ne sta una
  // sola».
  //
  // Il riposo non si assegna: è quello che resta a chi oggi non serve. Quindi
  // non si pianificano i riposi, si pianifica il loro complemento — quante
  // persone lavorano ogni giorno — e il numero esce da un conto che a questo
  // punto è già fatto: i turni che le partite hanno in cassa (`turniResidui`)
  // contro le presenze possibili (pianificabili × giorni).
  //
  // Chi non ha nessuna stazione è fuori dal conto: riposa comunque tutti i
  // giorni, e contarlo gonfierebbe il totale dei riposi da spalmare. Onestà
  // sul suo peso: il risultato non cambia, e non è un'opinione — ogni presenza
  // in più porta con sé esattamente un riposo in più al giorno, quindi la
  // differenza si annulla. Il filtro c'è perché `riposiTotali` sia il numero
  // che dice di essere, non perché sposti l'esito; provato col mutante,
  // toglierlo non fa diventare rosso nessun test, e infatti non gli è stato
  // messo accanto un test che finge di difenderlo.
  //
  // Il resto della divisione si sparge invece di cadere tutto in testa alla
  // settimana: `floor((i+1)·R/D) − floor(i·R/D)` mette i due riposi in più di
  // una settimana da sedici il giovedì e la domenica, non lunedì e martedì.
  // Concentrarli all'inizio è lo stesso difetto in scala ridotta.
  // --------------------------------------------------------------------------
  const pianificabili = staffList.filter(s=> s.stations && s.stations.length).length;
  const turniPianificati = Object.keys(turniResidui)
    .reduce((n,st)=> n + (turniResidui[st]||0), 0);
  const riposiTotali = Math.max(0, pianificabili*days.length - turniPianificati);
  const riposiDelGiorno = days.map((_,i)=>
    Math.floor(riposiTotali*(i+1)/days.length) - Math.floor(riposiTotali*i/days.length));

  days.forEach((day, indiceGiorno)=>{
    // Le richieste approvate si applicano prima di ogni altra cosa: la persona
    // è già "occupata" per quel giorno e nessuna logica successiva la tocca.
    staffList.forEach(s=>{
      const c = constraintFor(constraints, s.id, day);
      if(c && c.blocked) assigned[s.id][day] = c.blocked;
    });

    const remain = {};
    SERVICES.forEach(sv=>{ remain[sv]={}; (staffingNeeds[sv]||[]).forEach(n=>{ remain[sv][n.stationId]=(remain[sv][n.stationId]||0)+(parseInt(n.count)||0); }); });

    // La quota di forma della settimana che tocca a oggi, partita per partita.
    // I turni allocati si spalmano sui giorni che restano; i posti da coprire
    // oggi meno i turni da spendere oggi sono gli spezzati che oggi servono.
    // È un BUDGET, non un divieto: quando rinunciare allo spezzato lascerebbe
    // un servizio senza nessuno che lo possa prendere, si sfora. È la stessa
    // regola già scritta per il tetto agli extra — una scopertura falsa è
    // peggio di un turno in più, perché manda a cercare un problema che non
    // esiste.
    const giorniRimasti = days.length - indiceGiorno;
    const postiOggi = {};
    SERVICES.forEach(sv=> Object.keys(remain[sv]).forEach(st=>{
      postiOggi[st] = (postiOggi[st]||0) + remain[sv][st];
    }));
    // Quante persone devono lavorare oggi. Il piano dei riposi lo dice, ma non
    // comanda da solo: non si spendono più turni di quelli che restano davvero
    // in cassa, altrimenti il budget degli spezzati andrebbe a zero su una
    // settimana che di gente non ne ha.
    const turniRimasti = Object.keys(turniResidui)
      .reduce((n,st)=> n + (turniResidui[st]||0), 0);
    // E nemmeno più di quante persone oggi un turno di lavoro ce l'hanno
    // davvero in tasca. Senza questo tetto il piano chiede un giorno "da sei" a
    // una brigata che oggi ne ha cinque con la quota buona: il motore preferisce
    // i turni singoli, li esaurisce, e l'ultima partita della giornata finisce
    // a chiamare qualcuno oltre quota. Misurato su 300 settimane: 78 turni extra
    // comparsi dal nulla, contro zero. Un extra è una spesa vera, e non è quello
    // che si sta cercando di sistemare qui.
    const conQuotaOggi = staffList.filter(s=> s.stations && s.stations.length
      && !(constraintFor(constraints, s.id, day)||{}).blocked
      && pools[s.id].some(slot=> !slot.codes.includes(REST_CODE))).length;
    const lavoratoriOggi = Math.max(0, Math.min(
      pianificabili - riposiDelGiorno[indiceGiorno], turniRimasti, conQuotaOggi));

    // Da "quante persone lavorano oggi" a "quanti turni per partita".
    // Prima ogni partita si arrotondava per conto suo — `round(residui/giorni)`
    // — e nessuno guardava la somma: cinque arrotondamenti indipendenti fanno
    // un giorno da sette lavoratori e il giorno dopo da cinque, cioè
    // esattamente i giorni con un riposo solo che lo chef non vuole. Ora la
    // somma è fissata prima (è `lavoratoriOggi`) e le partite si spartiscono
    // QUEL numero: parte intera a ciascuna, e i posti che restano ai resti più
    // grossi. Nessuna partita riceve più turni dei posti che ha oggi né più di
    // quelli che le restano in cassa: sarebbero turni che non può spendere, e
    // li toglierebbe a chi invece li userebbe.
    const stazioniOggi = Object.keys(postiOggi);
    const esatto = {}, turniOggi = {};
    stazioniOggi.forEach(st=>{
      esatto[st] = (turniResidui[st]||0) / giorniRimasti;
      turniOggi[st] = Math.min(Math.floor(esatto[st]), postiOggi[st], turniResidui[st]||0);
    });
    let assegnati = stazioniOggi.reduce((n,st)=> n + turniOggi[st], 0);
    const perResto = stazioniOggi.slice()
      .sort((a,b)=> (esatto[b]-Math.floor(esatto[b])) - (esatto[a]-Math.floor(esatto[a])));
    // Più giri: al primo una stazione può essere già al suo tetto, al secondo
    // un'altra che ne ha ancora spazio se lo prende. Si esce quando un giro
    // intero non ha piazzato niente, così il ciclo finisce sempre.
    let mosso = true;
    while(assegnati < lavoratoriOggi && mosso){
      mosso = false;
      for(const st of perResto){
        if(assegnati >= lavoratoriOggi) break;
        if(turniOggi[st] < Math.min(postiOggi[st], turniResidui[st]||0)){
          turniOggi[st]++; assegnati++; mosso = true;
        }
      }
    }
    // E si toglie, quando le parti intere da sole passano il segno. Serve
    // soprattutto all'ULTIMO giorno, dove `esatto` è tutto il residuo e ogni
    // partita chiederebbe una persona per posto: la domenica arrivava a
    // pretendere due teste al pass quando in cassa ce n'era una, e il motore
    // tappava il buco chiamando qualcuno oltre quota. Un turno in meno qui
    // significa uno spezzato: la stessa persona copre pranzo e cena, che è
    // esattamente la frase dello chef «se uno riposa l'altro fa spezzato».
    // Misurato su 300 settimane: 78 extra prima di questo taglio, 0 dopo.
    // Si toglie dai resti più piccoli — l'ordine di `perResto` letto al
    // contrario — perché sono le partite che meno avevano diritto al turno in
    // più, e mai sotto zero.
    let calare = true;
    while(assegnati > lavoratoriOggi && calare){
      calare = false;
      for(let i=perResto.length-1; i>=0; i--){
        if(assegnati <= lavoratoriOggi) break;
        const st = perResto[i];
        if(turniOggi[st] > 0){ turniOggi[st]--; assegnati--; calare = true; }
      }
    }
    const budgetSpezzati = {};
    stazioniOggi.forEach(st=>{
      budgetSpezzati[st] = Math.max(0, postiOggi[st] - turniOggi[st]);
    });

    // Un turno assegnato chiude dei posti: su tutti i servizi che il codice
    // copre, e su tutte le stazioni che quella stazione copre — la sua, sempre,
    // piu' quelle di rimbalzo. E' l'unico punto in cui «Rakib conta anche nei
    // due del lavaggio» diventa un numero. `svBase` c'e' per sicurezza: il
    // posto che ha fatto scattare l'assegnazione va chiuso comunque, anche se
    // un domani il codice scelto smettesse di coprirlo, altrimenti il `while`
    // che ci gira intorno non finirebbe piu'.
    const segnaCopertura = (code, st, svBase) => {
      const servizi = (CODE_TO_SERVICES[code]||[]).slice();
      if(svBase && !servizi.includes(svBase)) servizi.push(svBase);
      const stazioniCoperte = coperteDa(st);
      servizi.forEach(sv2=> stazioniCoperte.forEach(st2=>{
        if(remain[sv2] && remain[sv2][st2]) remain[sv2][st2] = Math.max(0, remain[sv2][st2]-1);
      }));
    };

    SERVICES.forEach(sv=>{
      // stazioni più "rare" (poche persone qualificate in tutta la brigata) vengono coperte per prime,
      // altrimenti rischiano di restare senza candidati perché consumati da stazioni più comuni.
      // Davanti alla rarita' viene pero' chi DA' una mano a un'altra stazione:
      // la copertura di rimbalzo esiste solo se arriva prima che la stazione
      // aiutata abbia gia' chiamato tutte le sue persone dedicate (vedi
      // `riceveDaAltri`). Chi non riceve niente da nessuno resta nel gruppo di
      // testa, quindi per le cucine senza `copreAnche` l'ordine e' identico a
      // prima: la chiave vale 0 per tutti e decide la rarita', come sempre.
      // E in coda a tutti, una stazione che NESSUNO in brigata sa fare: da sola
      // non si chiude in nessun caso, quindi non ha senso che la rarita' la
      // mandi davanti a chi invece un candidato ce l'ha. E' anche l'unico modo
      // di cavarsela quando due stazioni si coprono a vicenda ("chi sta alle
      // insalate copre il lavaggio" e viceversa): li' nessuna delle due e' il
      // donatore, e a decidere resta questa.
      const quantiSanno = st => staffList.filter(s=> s.stations && s.stations.includes(st)).length;
      const stationIds = Object.keys(remain[sv]).sort((a,b)=>{
        const qa = quantiSanno(a), qb = quantiSanno(b);
        const na = qa ? 0 : 1, nb = qb ? 0 : 1;
        if(na !== nb) return na - nb;
        const ra = riceveDaAltri[a] ? 1 : 0, rb = riceveDaAltri[b] ? 1 : 0;
        if(ra !== rb) return ra - rb;
        return qa - qb;
      });
      stationIds.forEach(stationId=>{
        while(remain[sv][stationId] > 0){
          // Codici che coprono questo servizio E che questa persona può fare
          // oggi, viste le sue richieste approvate.
          const codiciUtili = (s) => (SERVICE_CODES[sv]||[])
            .filter(c=> codeAllowed(constraints, s.id, day, c, CODE_TO_SERVICES));

          let candidates = staffList.filter(s=>{
            if(assigned[s.id][day]) return false;
            const qualified = (s.stations&&s.stations.length) ? s.stations.includes(stationId) : false;
            if(!qualified) return false;
            if(!codiciUtili(s).length) return false;
            return pools[s.id].some(slot=> slot.codes.some(c=>codiciUtili(s).includes(c)));
          });
          let isExtra = false;
          if(!candidates.length){
            // il fabbisogno supera quello che le quote possono coprire: proviamo comunque a tappare
            // il buco con un turno EXTRA (oltre quota), pescando chiunque sia qualificato e libero
            // quel giorno, invece di lasciare la postazione scoperta. Le richieste
            // approvate restano intoccabili anche qui: si preferisce dichiarare la
            // scopertura piuttosto che far saltare un riposo concordato.
            //
            // Chi ha dichiarato di non fare turni oltre la quota vale quanto una
            // richiesta approvata: se non resta nessuno si dichiara il buco, non
            // si chiama lo stesso qualcuno che ha detto di no. Il filtro sta QUI e
            // non fra i candidati di quota poche righe sopra: sono due cose
            // diverse, e messo lì toglierebbe alla persona anche i turni che le
            // spettano.
            candidates = extraVietati ? [] : staffList.filter(s=> !assigned[s.id][day] && puoFareExtra(s)
              && s.stations && s.stations.includes(stationId) && codiciUtili(s).length);
            // Il tetto, se c'è, è una preferenza forte, non un divieto: se
            // rispettarlo significa lasciare la postazione scoperta si sfora e
            // basta. Una scopertura falsa è peggio di un turno in più, perché
            // manda qualcuno a cercare un problema che non esiste.
            const sottoTetto = candidates.filter(s=> extraFatti[s.id] < maxExtra);
            if(sottoTetto.length) candidates = sottoTetto;
            isExtra = true;
          }
          if(!candidates.length){
            // nessuno qualificato è libero quel giorno: qui non c'è più nulla da fare, scopertura reale.
            shortfalls.push({day, service:sv, stationId, missing:remain[sv][stationId]});
            break;
          }
          // Ordine di scelta. Il primo criterio resta il primo: dai priorità a chi è
          // qualificato per MENO stazioni — chi sa fare solo questa va piazzato qui, chi è
          // più "jolly" resta di riserva per coprire altrove. È una regressione già pagata
          // in produzione, e niente le passa davanti.
          // Lo shuffle prima del sort serve ancora: Array.sort in JS è stabile, quindi a
          // parità di TUTTI i criteri deciderebbe l'ordine dell'anagrafica.
          candidates = shuffleArray(candidates, rand);
          const perStazioni = (a,b)=>
            (a.stations?a.stations.length:999) - (b.stations?b.stations.length:999);
          // LA PARTITA PRINCIPALE, e dove si infila fra i criteri che c'erano.
          // La regola per decidere l'ordine e' una sola: prima i criteri che
          // difendono la COPERTURA, poi quelli che difendono la FORMA del
          // prospetto. Un buco manda qualcuno a cercare un problema vero; un
          // prospetto che copre tutto ma non somiglia a come lo chef si divide
          // la brigata e' solo da risistemare a mano.
          //   1. «chi sa fare meno stazioni» — copertura: sbagliarlo brucia il
          //      jolly e lascia scoperta una stazione che nessun altro sa fare.
          //      E' una regressione gia' pagata in produzione, e resta prima.
          //   2. «chi ha piu' quota da smaltire» (o, fra gli extra, «chi ne ha
          //      fatti meno») — copertura anche questo: e' cio' che impedisce
          //      di bruciare i turni il lunedi' e arrivare a sabato a secco.
          //   3. «di chi e' questa partita» — forma. Ed e' qui.
          // Nella pratica decide quasi sempre lei lo stesso, perche' le brigate
          // vere sono fatte di persone con lo stesso numero di partite (due a
          // testa, nel caso dello chef) e con quote identiche: i primi due
          // criteri pareggiano, e resta questo.
          // La frase «le secondarie solo quando la principale e' gia' coperta»
          // non e' scritta da nessuna parte: esce da sola da questo confronto.
          // Finche' su una stazione c'e' qualcuno che ce l'ha come principale,
          // chi ce l'ha come seconda gli sta dietro e viene chiamato solo
          // quando i primi sono finiti o sono gia' occupati altrove.
          const perPriorita = (a,b)=> prioritaDi(a, stationId) - prioritaDi(b, stationId);
          // LO SPEZZATO E' UN TURNO DA UNDICI ORE, E VA A GIRO.
          // Difetto vero, misurato: a parita' di cinque giorni lavorati una
          // persona faceva 52 ore e un'altra 43, perche' gli spezzati finivano
          // sempre sulle stesse teste. Il criterio delle ore c'era gia', ma
          // guardava solo una meta' della cosa: sceglieva la PERSONA e non
          // sapeva quanto sarebbe durato il TURNO che stava per darle.
          // Quanto durera' pero' si sa gia' qui, prima di scegliere: dipende da
          // quali posti restano scoperti su questa partita e dal budget della
          // giornata, non da chi lo prende. Se sta per uscire un accorpato il
          // turno lungo va a chi finora ha fatto meno ore; se sta per uscire un
          // turno singolo, quello corto va a chi ne ha gia' fatte di piu'.
          // Prima la direzione era una sola, e "prima chi ha meno ore" davanti
          // a un turno corto premiava di nuovo chi era gia' indietro.
          //
          // Il criterio resta in CODA, dietro alla partita principale, e non e'
          // una scelta timida: metterlo davanti pareggia le ore molto meglio
          // (su sei persone a pari quota lo scarto va a zero) e raddoppia le
          // scoperture, da 54 a 100 su 300 settimane. Vale la stessa regola
          // scritta venti righe piu' su — prima la copertura, poi la forma — e
          // qui la partita principale difende anche la copertura, perche' e' lo
          // stesso ordine con cui la capienza della settimana e' stata
          // ripartita. Andare contro quella ripartizione giorno per giorno
          // lascia i turni sulla partita sbagliata.
          //
          // E c'e' un limite che nessun ordinamento supera: se una partita ha
          // piu' posti che turni ci si fanno solo spezzati, e chi ci sta di
          // casa fa cinque giorni da undici ore. Sulla brigata dello chef le
          // insalate le sanno fare in due, e sono gli stessi due che tengono
          // gli antipasti: 55 ore a testa non e' una scelta del motore, e' la
          // brigata. Per abbassarle bisogna insegnare quella partita a
          // qualcun altro, non riordinare i candidati.
          const altriScoperti = SERVICES.filter(sv2=>
            sv2 !== sv && (remain[sv2]||{})[stationId] > 0);
          // Quando l'accorpato e' l'UNICO modo di coprire l'altro servizio, il
          // turno e' lungo anche se il budget della giornata dice di no — e
          // ignorarlo costava caro. Caso vero, gia' nei test: due persone con
          // in quota solo lo spezzato e due con solo il turno di pranzo. La
          // sera nessuno la copre da solo, la copre chi fa lo spezzato. Con il
          // budget a zero il turno risultava "corto", davanti andava chi aveva
          // gia' piu' ore — i due del pranzo — e la sera restava a uno
          // spezzato: tre persone al lavoro per due posti, quota bruciata un
          // giorno prima e un turno oltre quota in piu' la domenica.
          const copribileDaSolo = sv2 => staffList.some(s2=>{
            if(assigned[s2.id][day]) return false;
            if(!(s2.stations && s2.stations.includes(stationId))) return false;
            const cod = (SERVICE_CODES[sv2]||[]).filter(c=>
              (CODE_TO_SERVICES[c]||[]).length === 1
              && codeAllowed(constraints, s2.id, day, c, CODE_TO_SERVICES));
            return cod.length > 0 && pools[s2.id].some(slot=> slot.codes.some(c=> cod.includes(c)));
          });
          const turnoLungo = altriScoperti.length > 0
            && (budgetSpezzati[stationId] > 0 || altriScoperti.some(sv2=> !copribileDaSolo(sv2)));
          const perOre = turnoLungo
            ? (a,b)=> oreFatte[a.id] - oreFatte[b.id]
            : (a,b)=> oreFatte[b.id] - oreFatte[a.id];
          if(isExtra){
            // Fra chi si può chiamare oltre quota va per primo chi ne ha fatti
            // MENO. Qui prima c'era il contrario, e la spiegazione suonava bene:
            // sette extra su una testa sola sono una telefonata invece di sette.
            // Ma era stata dedotta da un foglio di turni, non chiesta a chi lo
            // aveva compilato. Parole sue: "i turni non li assegno a chi lavora
            // di più, ma semplicemente nella partita dove serve", e "sono
            // riuscito a coprire tutti i turni con soli 6 extra dati a 6 persone
            // diverse". Sei extra su una testa sola sono una settimana rovinata
            // a una persona; sparsi, sono un turno in più a testa.
            // Qui la priorita' di partita sta DIETRO alla spartizione degli
            // extra, e solo qui: un extra e' una telefonata a chi era libero, e
            // «a chi ne ha gia' fatti meno» pesa piu' di «di chi e' la
            // partita». Fra due persone con lo stesso numero di extra alle
            // spalle, allora si', va chi ci sta di casa.
            candidates.sort((a,b)=> perStazioni(a,b)
              || (extraFatti[a.id] - extraFatti[b.id])
              || perPriorita(a,b)
              || perOre(a,b));
          } else {
            // A parità di qualifica lavora prima chi ha più quota da smaltire: la
            // quota consumata in modo uniforme non si esaurisce tutta il venerdì
            // lasciando il weekend agli extra. Poi, sempre a parità, chi finora ha
            // fatto meno ore — prima di questo criterio a decidere era solo il caso,
            // e il motore non sapeva nemmeno che SP dura 11 ore e P ne dura 8.
            // La priorita' di partita sta DIETRO alla quota residua, e la
            // misura ha corretto la prima versione: messa davanti sembrava piu'
            // fedele allo chef, ma la quota residua non e' un pareggiamento del
            // carico — e' il criterio che impedisce di bruciare i turni a
            // inizio settimana. Scavalcandolo, sulla brigata di misura le
            // scoperture salivano da 0,71 a 1,30 a settimana. Dietro, scendono
            // a 0,39 E la quota sulla partita principale sale lo stesso.
            candidates.sort((a,b)=> perStazioni(a,b)
              || (quotaLavoroResidua(b) - quotaLavoroResidua(a))
              || perPriorita(a,b)
              || perOre(a,b));
          }
          const chosen = candidates[0];
          const pool = pools[chosen.id];

          // Un turno che copre più servizi conviene se ANCHE gli altri servizi che
          // copre sono ancora scoperti su questa stazione: una persona sola ne
          // chiude due. Prima era il caso particolare "pranzo + cena = spezzato".
          const codeCoversMore = code =>
            (CODE_TO_SERVICES[code]||[]).filter(sv2=> sv2!==sv && (remain[sv2]||{})[stationId] > 0).length;

          // Quante altre persone potrebbero coprire il servizio `sv2` su questa
          // stazione, oggi. Serve prima di rinunciare a uno spezzato: il turno
          // accorpato si lascia solo se il servizio che porta con sé ha
          // qualcun altro che lo può prendere.
          const altriLiberi = (sv2) => staffList.filter(s2=>{
            if(s2.id === chosen.id || assigned[s2.id][day]) return false;
            if(!(s2.stations && s2.stations.includes(stationId))) return false;
            const cod = (SERVICE_CODES[sv2]||[])
              .filter(c=> codeAllowed(constraints, s2.id, day, c, CODE_TO_SERVICES));
            if(!cod.length) return false;
            return pools[s2.id].some(slot=> slot.codes.some(c=> cod.includes(c)));
          }).length;
          // Si può rinunciare a questo codice accorpato senza aprire un buco?
          const rinunciabile = code =>
            (CODE_TO_SERVICES[code]||[]).every(sv2=>
              sv2===sv || !((remain[sv2]||{})[stationId] > 0) || altriLiberi(sv2) >= remain[sv2][stationId]);

          // La scelta del codice, con il budget della giornata. Un accorpato
          // vale due posti-servizio: si prende quando la giornata ne ha
          // bisogno (budget), o quando lasciarlo aprirebbe una scopertura.
          const scegliCodice = (codici, usaBudget) => {
            const utili = codici.slice().sort((a,b)=> codeCoversMore(b) - codeCoversMore(a));
            if(!utili.length) return undefined;
            const primo = utili[0];
            if(codeCoversMore(primo) > 0){
              const singolo = utili.find(c=> codeCoversMore(c) === 0);
              if(!usaBudget || budgetSpezzati[stationId] > 0 || !singolo || !rinunciabile(primo)){
                if(usaBudget && budgetSpezzati[stationId] > 0) budgetSpezzati[stationId]--;
                return primo;
              }
              return (codici.includes(MAIN_CODE[sv]) && codeCoversMore(MAIN_CODE[sv]) === 0)
                ? MAIN_CODE[sv] : singolo;
            }
            return codici.includes(MAIN_CODE[sv]) ? MAIN_CODE[sv] : primo;
          };

          const ammessi = codiciUtili(chosen);
          let code;
          if(isExtra){
            // nessuno slot di quota compatibile disponibile: si assegna comunque il turno giusto,
            // segnato come extra, senza consumare la quota (che è già esaurita).
            // Il budget della giornata non si applica: l'extra è fuori quota, e
            // un accorpato qui è una telefonata invece di due.
            code = scegliCodice(ammessi, false);
          } else {
            const matchIdx = [];
            pool.forEach((slot,i)=>{ if(slot.codes.some(c=>ammessi.includes(c))) matchIdx.push(i); });
            matchIdx.sort((a,b)=> pool[a].codes.length - pool[b].codes.length);
            const slotIdx = matchIdx[0];
            const slot = pool[slotIdx];
            code = scegliCodice(slot.codes.filter(c=>ammessi.includes(c)), true);
            pool.splice(slotIdx,1);
          }

          assigned[chosen.id][day] = code;
          stationAssign[chosen.id][day] = stationId;
          oreFatte[chosen.id] += oreDi(code);
          // Un turno di quota speso qui è un turno in meno da spalmare sui
          // giorni che restano: senza questo la forma della settimana
          // resterebbe ferma al conto del lunedì.
          if(!isExtra) turniResidui[stationId] = Math.max(0, (turniResidui[stationId]||0) - 1);
          if(isExtra){
            extraFlag[chosen.id][day] = true;
            extraFatti[chosen.id]++;
            extras.push({day, service:sv, stationId, staffId:chosen.id, staffName:chosen.name});
          }
          segnaCopertura(code, stationId, sv);
        }
      });
    });

    // Fra le stazioni che la persona sa fare, la prima ancora scoperta per uno
    // dei servizi che il codice copre. Serve al riempimento finale, che prima
    // pescava `qualified[a caso]` senza guardare se quella stazione servisse.
    //
    // Va detto che qui scatta di rado, ed è voluto: quando parte il riempimento
    // finale ogni stazione ancora scoperta ha già cercato i candidati di quota
    // e poi quelli oltre quota, e ha fallito entrambi. Se una persona libera e
    // qualificata è arrivata fin qui è perché una regola la escludeva (extra
    // vietati, "non faccio extra", una richiesta approvata). È una cintura di
    // sicurezza contro un riordino futuro del ciclo, non il motore della
    // correzione: il motore è il ramo che NON spende lo slot.
    const stazioneScoperta = (s, code) => {
      const mie = (s.stations && s.stations.length) ? s.stations : [];
      for(const sv2 of (CODE_TO_SERVICES[code]||[])){
        for(const st of mie){ if((remain[sv2]||{})[st] > 0) return st; }
      }
      return null;
    };
    // Segna la copertura appena decisa nel riempimento finale, altrimenti due
    // persone di fila si accamperebbero sulla stessa stazione scoperta.
    // Il turno speso qui e' un turno in meno da spalmare sui giorni che restano
    // per la stazione dove la persona sta davvero; la copertura che porta con
    // se' passa da `segnaCopertura` e vale anche per le stazioni di rimbalzo.
    // `turniResidui` NON si scala anche a quelle: e' il budget dei turni di
    // QUELLA partita, e nessuno di quei turni e' stato speso.
    const consumaCopertura = (code, st) => {
      turniResidui[st] = Math.max(0, (turniResidui[st]||0) - 1);
      segnaCopertura(code, st, null);
    };

    staffList.forEach(s=>{
      if(!assigned[s.id][day]){
        // Chi non ha nessuna stazione non può coprire niente: un turno di
        // lavoro senza stazione è un turno finto — conta nelle ore pianificate
        // e fa scattare i falsi avvisi di sforamento contrattuale, ma non
        // copre nessun servizio. Resta a riposo, e la quota NON si consuma.
        // Il controllo sta QUI, dentro `if(!assigned...)`, e non più in alto:
        // così cade dopo l'applicazione delle richieste approvate, e ferie e
        // malattie di chi non ha stazioni restano F e M invece di diventare R.
        // Nella griglia la persona resta visibile: si assegna a mano.
        if(!(s.stations && s.stations.length)){ assigned[s.id][day] = REST_CODE; return; }
        // Chi ha chiesto solo certi servizi non può ricevere qui un turno
        // qualsiasi pescato dalla quota: meglio lasciarlo a riposo.
        const vincolo = constraintFor(constraints, s.id, day);
        if(vincolo && vincolo.services && vincolo.services.length){
          const idx = pools[s.id].findIndex(slot=>
            slot.codes.some(c=> codeAllowed(constraints, s.id, day, c, CODE_TO_SERVICES)));
          if(idx < 0){ assigned[s.id][day] = REST_CODE; return; }
          const ok = pools[s.id][idx].codes
            .filter(c=> codeAllowed(constraints, s.id, day, c, CODE_TO_SERVICES));
          // Un turno si assegna dove SERVE, non su una stazione a caso fra
          // quelle che la persona sa fare. Se nessuna delle sue è ancora
          // scoperta, il turno non copre niente: resta a riposo, e lo slot NON
          // si consuma. Vale qui come venti righe più su per chi non ha
          // stazioni — è la stessa domanda, e la risposta dev'essere la stessa.
          let code = null, stazione = null;
          for(const c of ok){
            const st = stazioneScoperta(s, c);
            if(st){ code = c; stazione = st; break; }
          }
          if(!code){ assigned[s.id][day] = REST_CODE; return; }
          pools[s.id].splice(idx,1);
          assigned[s.id][day] = code;
          // Anche le ore assegnate qui sono ore vere che la persona lavora:
          // se non si contassero, il pareggiamento dei giorni successivi
          // guarderebbe metà della settimana. Misurato: contandole, lo scarto
          // medio max-min in una settimana scende da 4,25 a 2,60 ore.
          oreFatte[s.id] += oreDi(code);
          stationAssign[s.id][day] = stazione;
          consumaCopertura(code, stazione);
          return;
        }
        if(pools[s.id].length){
          // per i giorni non guidati dal fabbisogno, consuma uno slot di Riposo se c'è: non sprecare
          // turni di lavoro preziosi (specialmente quelli che coprono più servizi) in giorni dove
          // non servono.
          const valueOf = slot=>{
            if(slot.codes.length===1 && slot.codes[0]===REST_CODE) return 0;
            if(slot.codes.some(c=>(CODE_TO_SERVICES[c]||[]).length>1)) return 3;
            if(slot.codes.length===1) return 1;
            return 2;
          };
          let bestIdx = 0;
          pools[s.id].forEach((slot,i)=>{ if(valueOf(slot) < valueOf(pools[s.id][bestIdx])) bestIdx = i; });
          const slot = pools[s.id][bestIdx];
          let code = null, stazione = null;
          if(valueOf(slot) === 0){
            code = REST_CODE;                      // slot di solo riposo: si spende, è il suo scopo
          } else {
            // Prima si guarda se una stazione della persona è ancora scoperta.
            for(const c of slot.codes){
              const st = stazioneScoperta(s, c);
              if(st){ code = c; stazione = st; break; }
            }
            // Poi il riposo, se lo slot lo ammette fra i suoi codici.
            if(!code && slot.codes.includes(REST_CODE)) code = REST_CODE;
            // Altrimenti niente: riposo, e lo slot RESTA NEL POOL. È il punto
            // della correzione. La quota non spesa oggi tiene alta
            // `quotaLavoroResidua`, che nei giorni successivi porta questa
            // persona davanti agli altri fra i candidati: la quota si sposta
            // dai giorni in cui non serviva a quelli in cui servirà, invece di
            // bruciarsi il lunedì e mancare il sabato.
            if(!code){ assigned[s.id][day] = REST_CODE; return; }
          }
          pools[s.id].splice(bestIdx,1);
          assigned[s.id][day] = code;
          oreFatte[s.id] += oreDi(code);   // vedi sopra: sono ore vere
          if(stazione){
            stationAssign[s.id][day] = stazione;
            consumaCopertura(code, stazione);
          }
        } else {
          assigned[s.id][day] = REST_CODE;
        }
      }
    });
  });

  const newShifts = {};
  staffList.forEach(s=>{
    newShifts[s.id] = {};
    days.forEach(day=> newShifts[s.id][day] = { code: assigned[s.id][day]||'', stationId: stationAssign[s.id][day]||null, extra: !!extraFlag[s.id][day] });
  });
  // Chi il generatore non ha potuto pianificare, e perché. Va detto nel
  // riepilogo: senza, resta da intuire da una fila di R nella griglia.
  const nonPianificabili = staffList
    .filter(s=> !(s.stations && s.stations.length))
    .map(s=> ({staffId:s.id, staffName:s.name, motivo:'nessuna stazione'}));
  // Quota di lavoro rimasta in tasca: slot che la persona aveva e che il
  // fabbisogno non ha chiesto. Da quando il motore non rabbocca piu' i turni
  // che non servono, questo numero puo' essere > 0 — e allora nella colonna
  // Ore la persona risulta sotto le ore contrattuali. E' un numero VERO, dove
  // prima c'era un pareggio ottenuto con turni finti, ma va spiegato: chi lo
  // vede senza spiegazione pensa a un difetto del generatore.
  const quotaNonSpesa = staffList
    .map(s=> ({
      staffId: s.id, staffName: s.name,
      turni: (pools[s.id]||[]).filter(slot=>
        slot.codes.some(c=> WORKING_CODES.includes(c))).length,
    }))
    .filter(x=> x.turni > 0);
  return { newShifts, shortfalls, extras, nonPianificabili, quotaNonSpesa };
}

// ----------------------------------------------------------------------------
// Generazione su un periodo qualsiasi (una settimana, un mese, un intervallo).
// Le quote sono settimanali, quindi il periodo viene spezzato in settimane e
// ogni settimana riparte con le quote piene: altrimenti su un mese la brigata
// esaurirebbe i turni dopo sette giorni e il resto sarebbe tutto riposo.
// ----------------------------------------------------------------------------
function computeShiftsForDates(staffList, staffingNeeds, options){
  options = options || {};
  const dates = (options.dates && options.dates.length) ? options.dates : weekDates(new Date());
  const newShifts = {}, shortfalls = [], extras = [];
  const nonSpesaPerPersona = {};
  staffList.forEach(s=>{ newShifts[s.id] = {}; });

  groupByWeek(dates).forEach((settimana, i)=>{
    const res = computeShifts(staffList, staffingNeeds, {
      config: options.config, days: settimana, constraints: options.constraints,
      maxExtraPerPersona: options.maxExtraPerPersona,
      stazioni: options.stazioni,
      // Il seme avanza di settimana in settimana: con lo stesso seme per tutte,
      // le quattro settimane di un mese uscirebbero identiche fra loro.
      seed: (options.seed != null) ? (semeNumerico(options.seed) + i) : undefined,
    });
    staffList.forEach(s=>{ Object.assign(newShifts[s.id], res.newShifts[s.id]||{}); });
    shortfalls.push(...res.shortfalls);
    extras.push(...res.extras);
    // La quota e' settimanale: quella non spesa si SOMMA settimana per
    // settimana, non si ricalcola. Una persona con un turno avanzato in
    // ognuna delle quattro settimane di un mese ne ha quattro, non uno.
    (res.quotaNonSpesa||[]).forEach(q=>{
      nonSpesaPerPersona[q.staffId] = (nonSpesaPerPersona[q.staffId]||0) + q.turni;
    });
  });

  // Non dipende dalla settimana: si calcola una volta sola, altrimenti la
  // stessa persona comparirebbe nel riepilogo una volta per settimana.
  const nonPianificabili = staffList
    .filter(s=> !(s.stations && s.stations.length))
    .map(s=> ({staffId:s.id, staffName:s.name, motivo:'nessuna stazione'}));

  const quotaNonSpesa = staffList
    .map(s=> ({staffId:s.id, staffName:s.name, turni: nonSpesaPerPersona[s.id]||0}))
    .filter(x=> x.turni > 0);

  return { newShifts, shortfalls, extras, nonPianificabili, quotaNonSpesa };
}

export {
  DAYS,
  SPECIAL_CODES,
  REST_CODE,
  DEFAULT_SERVICES,
  DEFAULT_SHIFT_TYPES,
  buildShiftConfig,
  shuffleArray,
  buildStaffPools,
  computeShifts,
  isoDate,
  parseISO,
  startOfWeek,
  weekDates,
  monthDates,
  dayName,
  groupByWeek,
  computeShiftsForDates,
  constraintFor,
  codeAllowed,
  puoFareExtra,
  contoCapienza,
};
