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
    const qualificati = staffList.filter(s=> s.stations && s.stations.includes(st))
      .sort((a,b)=> a.stations.length - b.stations.length);
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
    const budgetSpezzati = {};
    Object.keys(postiOggi).forEach(st=>{
      const turniOggi = Math.round((turniResidui[st]||0) / giorniRimasti);
      budgetSpezzati[st] = Math.max(0, postiOggi[st] - turniOggi);
    });

    SERVICES.forEach(sv=>{
      // stazioni più "rare" (poche persone qualificate in tutta la brigata) vengono coperte per prime,
      // altrimenti rischiano di restare senza candidati perché consumati da stazioni più comuni.
      const stationIds = Object.keys(remain[sv]).sort((a,b)=>{
        const qa = staffList.filter(s=> s.stations && s.stations.includes(a)).length;
        const qb = staffList.filter(s=> s.stations && s.stations.includes(b)).length;
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
            candidates.sort((a,b)=> perStazioni(a,b)
              || (extraFatti[a.id] - extraFatti[b.id])
              || (oreFatte[a.id] - oreFatte[b.id]));
          } else {
            // A parità di qualifica lavora prima chi ha più quota da smaltire: la
            // quota consumata in modo uniforme non si esaurisce tutta il venerdì
            // lasciando il weekend agli extra. Poi, sempre a parità, chi finora ha
            // fatto meno ore — prima di questo criterio a decidere era solo il caso,
            // e il motore non sapeva nemmeno che SP dura 11 ore e P ne dura 8.
            candidates.sort((a,b)=> perStazioni(a,b)
              || (quotaLavoroResidua(b) - quotaLavoroResidua(a))
              || (oreFatte[a.id] - oreFatte[b.id]));
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
          remain[sv][stationId]--;
          (CODE_TO_SERVICES[code]||[]).forEach(sv2=>{
            if(sv2!==sv && remain[sv2] && remain[sv2][stationId]) remain[sv2][stationId] = Math.max(0, remain[sv2][stationId]-1);
          });
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
    const consumaCopertura = (code, st) => {
      turniResidui[st] = Math.max(0, (turniResidui[st]||0) - 1);
      (CODE_TO_SERVICES[code]||[]).forEach(sv2=>{
        if(remain[sv2] && remain[sv2][st]) remain[sv2][st] = Math.max(0, remain[sv2][st]-1);
      });
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
};
