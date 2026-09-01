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
// UNA STAZIONE PER SERVIZIO. «Potrebbe essere che la stessa persona stia a
// pranzo in una partita e a cena in un'altra.»
//
// La cella era { code:'SP', stationId:'st1' }: la stazione era una sola per
// giornata, quindi chi faceva spezzato copriva pranzo e cena ma su una partita
// sola. Ora la cella porta anche una MAPPA servizio → stazione:
//
//     { code:'SP', stations:{pranzo:'st1', cena:'st4'}, stationId:'st1' }
//
// La chiave e' il SERVIZIO perche' e' l'unita' in cui parla lo chef ed e' gia'
// l'unita' di tutto il resto del motore (`staffingNeeds[sv]`, `remain[sv]`, i
// record di scopertura e di extra). Non c'e' nessun caso particolare
// "spezzato": un codice che coprisse TRE servizi ci sta senza altre modifiche,
// come il file dichiara in testa.
//
// `stationId` NON SI TOGLIE, ed e' un contratto verso il passato, non una
// svista. Resta scritto, sempre allineato alla prima stazione della mappa:
//   - `Cloud.impegniAltrove` legge i turni di UN'ALTRA cucina, che puo' essere
//     ancora su una versione vecchia dell'app — e viceversa;
//   - una scheda gia' aperta col pacchetto vecchio continua a mostrare qualcosa
//     di sensato invece di una cella muta;
//   - se questa versione va ritirata, i dati salvati restano leggibili.
// Lo riscrive UN SOLO punto, `normalizzaCella`: scritto a mano dai chiamanti
// divergerebbe dalla mappa, e allora sarebbe peggio di niente.
// ----------------------------------------------------------------------------

// I servizi coperti dal codice di una cella. Tre casi, e la differenza conta:
//   []   il codice non copre servizi — R, M, F, cella vuota;
//   null NON SI SA: e' un tipo di turno che questa cucina non ha (piu'). Non e'
//        la stessa cosa di "nessuno", e trattarlo come tale butterebbe via la
//        stazione di un turno il cui codice e' stato cancellato per sbaglio.
function serviziDelCodice(code, cfg){
  if(!code || SPECIAL_CODES[code]) return [];
  const m = cfg && cfg.codeToServices;
  return (m && m[code]) ? m[code].slice() : null;
}

// La stazione di UN servizio in questa cella.
// Il confronto e' `!== undefined`, non un `||`, e non e' stile: una stazione
// tolta a mano ("nessuna") su un servizio si scrive `null` nella mappa. Con
// `||` ricadrebbe sul vecchio `stationId` e la cella tornerebbe da sola al
// valore appena cancellato.
function stazioneDi(cella, serviceId){
  if(!cella || typeof cella !== 'object') return null;
  if(cella.stations && cella.stations[serviceId] !== undefined){
    return cella.stations[serviceId] || null;
  }
  return cella.stationId || null;
}

// Le stazioni della giornata, senza ripetizioni, in ordine di servizio. Una
// sola voce e' il caso normale; due vogliono dire due partite nello stesso
// giorno.
function stazioniDi(cella, cfg){
  if(!cella || typeof cella !== 'object') return [];
  const servizi = serviziDelCodice(cella.code, cfg);
  if(servizi === null) return cella.stationId ? [cella.stationId] : [];
  const out = [];
  servizi.forEach(sv=>{
    const st = stazioneDi(cella, sv);
    if(st && !out.includes(st)) out.push(st);
  });
  return out;
}

// Porta la cella in forma canonica, e riscrive `stationId`. E' l'unico punto
// che tocca quel campo.
//   - Cella nella forma VECCHIA: la stazione unica diventa la stazione di TUTTI
//     i servizi che il codice copre. E' l'unica lettura possibile di un dato
//     che i servizi non li distingueva, ed e' esattamente cio' che quel turno
//     voleva dire.
//   - La mappa finisce con ESATTAMENTE una chiave per servizio coperto: le
//     chiavi orfane (un servizio tolto dal tipo di turno) spariscono, i servizi
//     nuovi entrano ereditando la stazione gia' decisa.
//   - Codice sconosciuto: la mappa resta com'e' e `stationId` NON si tocca.
//     Meglio un dato che gli accessori sanno ancora leggere che una stazione
//     buttata via per un codice che non c'e' piu'.
function normalizzaCella(cella, cfg){
  if(!cella || typeof cella !== 'object') return cella;
  if(!cella.stations || typeof cella.stations !== 'object') cella.stations = {};
  const servizi = serviziDelCodice(cella.code, cfg);
  if(servizi === null) return cella;
  const mappa = {};
  servizi.forEach(sv=>{ mappa[sv] = stazioneDi(cella, sv); });
  cella.stations = mappa;
  // Derivato: la prima stazione in ordine di servizio. Si salta un servizio
  // senza stazione invece di fermarsi li' — un client vecchio che legge
  // `stationId` merita la partita che la persona fa davvero, non "nessuna".
  cella.stationId = servizi.map(sv=> mappa[sv]).find(st=> st) || null;
  return cella;
}

// Scrive la stazione di un servizio e riallinea il resto. Da qui in poi nessuno
// tocca `stations` o `stationId` a mano.
function assegnaStazione(cella, serviceId, stationId, cfg){
  if(!cella || typeof cella !== 'object') return cella;
  if(!cella.stations || typeof cella.stations !== 'object') normalizzaCella(cella, cfg);
  cella.stations[serviceId] = stationId || null;
  return normalizzaCella(cella, cfg);
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

// Confronto fra due chiavi di ordinamento scritte come liste di numeri: il
// primo criterio che differisce decide. Scriverle come liste invece che come
// catene di `||` serve a poterle leggere in fila, una riga per criterio, con
// accanto il motivo — e a poterne aggiungere uno senza rileggere tutto.
function chiaveMinore(a, b){
  for(let i=0; i<a.length; i++){ if(a[i] !== b[i]) return a[i] < b[i]; }
  return false;
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

// ----------------------------------------------------------------------------
// L'ORDINE DELL'ALLOCAZIONE, IN UN POSTO SOLO.
//
// Allocare per CONTARE (`contoCapienza`, il riquadro «il conto, prima di
// generare») e allocare per ASSEGNARE (`pianificaSettimana`, il piano che il
// motore poi esegue) devono dare lo stesso risultato: se divergono, il riquadro
// promette una cosa e il generatore ne fa un'altra, ed e' il modo piu' veloce
// di far perdere fiducia a chi legge. Per questo l'ordine sta scritto qui una
// volta sola e lo chiamano tutti e due, invece di essere copiato.
// ----------------------------------------------------------------------------

// Le partite, dalla prima da allocare all'ultima:
//   - una partita che NESSUNO in brigata sa fare va in fondo: da sola non si
//     chiude in nessun caso, e mandarla avanti per rarita' non serve;
//   - chi DA' una mano a un'altra (`copreAnche`) prima di chi la riceve,
//     altrimenti la mano arriva a giochi fatti e non vale niente;
//   - poi rarita' crescente: quante persone in brigata la sanno fare.
// Il sort di JS e' stabile: a pari chiave resta l'ordine in cui le partite
// compaiono nel fabbisogno, che e' un ordine che il titolare vede.
function ordinePartite(staffList, partite, copreOltre){
  const riceve = {};
  Object.keys(copreOltre||{}).forEach(d=> (copreOltre[d]||[]).forEach(r=>{ riceve[r] = true; }));
  const quanti = {};
  partite.forEach(st=>{ quanti[st] = staffList.filter(s=> (s.stations||[]).includes(st)).length; });
  return partite.slice().sort((a,b)=>{
    const qa = quanti[a], qb = quanti[b];
    if((qa?0:1) !== (qb?0:1)) return (qa?0:1) - (qb?0:1);
    const ra = riceve[a] ? 1 : 0, rb = riceve[b] ? 1 : 0;
    if(ra !== rb) return ra - rb;
    return qa - qb;
  });
}

// Le persone di una partita, dalla prima da esaurire all'ultima:
//   - PRIMA CHI SA FARE MENO PARTITE. La capienza di chi sa fare solo questa
//     non serve a nessun altro, quindi va esaurita per prima, mentre quella di
//     chi ne sa fare due va protetta perche' e' l'unica che puo' arrivare
//     altrove. Su DEROMA, prendendo prima Nisan (antipasti+pass) invece di
//     Biplop (solo antipasti), restavano 2 posti in tasca a Biplop — dove
//     nessuno puo' spenderli — e il pass risultava scoperto di 2.
//   - poi di chi e' questa partita (`prioritaDi`, l'ordine che imposta il
//     titolare).
//
// QUI C'ERA UN TERZO CRITERIO, «prima chi ha meno alternative», e non c'e' piu'.
// L'idea era che chi ha in tasca solo turni di pranzo va speso finche' un
// pranzo lo accetta, mentre chi puo' fare pranzo o cena va tenuto per dove
// servira'. E' un ragionamento giusto, ma da quando il piano sceglie i GIORNI
// guardando le riserve (`riservePer`) non muove piu' niente: rimesso e tolto,
// su DEROMA i cinque scenari danno numeri identici a virgola, e su 300 brigate
// a caso la differenza e' 5,70 posti scoperti contro 5,76 — cioe' rumore, e
// nella direzione sbagliata. Una regola che nessun test puo' far diventare
// rossa non e' una regola, e restava li' solo perche' l'avevo scritta io.
function chiaveQualificato(s, st){
  return [(s.stations||[]).length, prioritaDi(s, st)];
}
function ordineQualificati(staffList, st){
  return staffList.filter(s=> (s.stations||[]).includes(st))
    .sort((a,b)=> chiaveMinore(chiaveQualificato(a, st), chiaveQualificato(b, st)) ? -1
      : chiaveMinore(chiaveQualificato(b, st), chiaveQualificato(a, st)) ? 1 : 0);
}
// Le stesse persone, raggruppate per PARI GRADO: chi ha la stessa chiave sta
// nello stesso gruppo. Fra gruppi si esaurisce, dentro un gruppo si fa a giro,
// e la differenza vale dei posti veri (vedi `pianificaSettimana`).
function gruppiQualificati(staffList, st){
  const gruppi = [];
  ordineQualificati(staffList, st).forEach(s=>{
    const k = chiaveQualificato(s, st).join('|');
    const ultimo = gruppi[gruppi.length-1];
    if(ultimo && ultimo.chiave === k) ultimo.gente.push(s);
    else gruppi.push({chiave:k, gente:[s]});
  });
  return gruppi;
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
  // L'ordine di allocazione: sta scritto in `ordinePartite`, che lo condivide
  // con il piano della settimana. Contare e assegnare devono allocare uguale.
  const ordine = ordinePartite(staffList, partite, copreOltre);

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
      // Dentro la partita l'ordine e' quello di `ordineQualificati`, lo stesso
      // che usa il piano della settimana. E' meta' del conto: con i dedicati
      // per primi il pass si chiude, e gli extra strutturali su DEROMA scendono
      // da 4 a 2 (i due del lavaggio, quelli veri).
      const inOrdine = ordineQualificati(staffList, st);
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

// ============================================================================
// IL PIANO DELLA SETTIMANA — «prima mi faccio un'idea in testa, poi inizio».
//
// COSA C'ERA PRIMA, E PERCHE' NON BASTAVA. Il motore decideva un giorno alla
// volta, con una scelta avida fra i candidati liberi. Prima del giro sui giorni
// c'era gia' una ripartizione, ma produceva un TOTALE PER PARTITA
// (`turniResidui`: «ai primi spettano otto turni in settimana») e il giro sui
// giorni non lo usava come vincolo — lo usava solo per derivare il budget degli
// spezzati. Misurato: tre varianti di quel totale, stesse 100 generazioni su
// DEROMA, tutte e tre inutili. Con il tetto in POSTI invece che in turni,
// scoperture 10,12 (peggio). Con un piano per PERSONA (`piano[chi][partita]` =
// quanti turni) 10,77 (uguale). Preferendo, fra i candidati, chi ha in tasca il
// codice che chiude esattamente i posti aperti: identico bit per bit, perche'
// quando tocca alla cena i candidati rimasti hanno in tasca solo accorpati e
// non c'e' nessuna alternativa da preferire.
//
// LA PRE-ALLOCAZIONE CHE SERVE E' PIU' FINE, ED E' UN PIANO DI GIORNI E DI
// FORME, non di totali:
//
//     piano[indiceGiorno] = [ {staffId, slot, code, stationId, sv}, ... ]
//
// cioe', per ogni giorno, CHI lavora, con QUALE codice e su QUALE partita.
// L'invariante e' che i posti chiusi dai codici di un giorno siano esattamente
// i posti che il fabbisogno chiede quel giorno — mai uno di piu'.
//
// IL PASSAGGIO CHE VALEVA GLI OTTO POSTI SCOPERTI e' l'APPAIAMENTO DEI SINGOLI
// SULLO STESSO GIORNO. L'equazione che il file gia' scriveva — x accorpati +
// y singoli, x = F−T, y = 2T−F — e' giusta come totale di settimana, ma un
// totale non dice niente su come si mettono in fila i giorni, e quello e' il
// punto. Su una partita da una persona per servizio, un giorno puo' prendere
// due forme sole: UN accorpato, oppure DUE singoli DI DUE PERSONE DIVERSE.
// Nessuno lo diceva al motore, e la seconda forma non si formava mai.
//   Il caso vero, sui primi di DEROMA: Valerio sa fare solo i primi, Lorenc
//   fa primi e pass. Prendendo da Lorenc tre spezzati (sei posti, il massimo
//   per turno) i primi si chiudono con otto turni — ma allora il settimo
//   giorno vorrebbe due singoli, e gli unici due singoli rimasti sono
//   entrambi di Valerio, che quel giorno puo' lavorare una volta sola. La
//   forma non sta in piedi. Prendendo invece da Lorenc DUE spezzati e DUE
//   singoli i primi si chiudono lo stesso, e a Lorenc resta uno spezzato che
//   e' esattamente quello che mancava al pass.
//
// COME LO TROVA, senza cablare nessuna forma. Si va per partita (le piu' rare
// per prime) e dentro la partita per persona (`ordineQualificati`: prima chi sa
// fare meno partite, poi di chi e' la partita, poi chi ha meno alternative).
// Per ogni persona si cerca il posto migliore fra tutti i suoi slot, tutti i
// suoi codici e tutti i giorni, e si scarta SEMPRE qualunque collocazione che
// lasci per strada meta' di un turno: uno spezzato su una giornata gia' mezza
// coperta e' sovracopertura, e non si prende. E' quel filtro che, da solo, fa
// uscire la forma giusta — Lorenc non piazza il terzo spezzato perche' non c'e'
// piu' un giorno con entrambi i servizi aperti, e piazza due singoli.
//
// E IL PRIMO CRITERIO E' «QUANTO CHIUDE QUI», non «quanto chiude in tutto».
// Senza, agli antipasti Nisan piazzava tre spezzati regalando ogni volta il
// pranzo al pass — il conto totale tornava uguale, ma agli antipasti restava un
// mezzo giorno che nessun altro poteva chiudere e la domenica Biplop finiva
// chiamato oltre quota. Misurato su DEROMA togliendo quel criterio: 1,00 posto
// di sovracopertura e 2,00 turni extra a settimana, contro 0,00 e 0,00. Con
// «quanto chiude qui» davanti, la meta' avanzata va altrove solo quando qui non
// serviva davvero piu' a nessuno.
//
// FRA GRUPPI SI ESAURISCE, DENTRO UN GRUPPO SI FA A GIRO. Non e' un
// compromesso fra due idee: sono due domande diverse, e la risposta e' scritta
// per esteso sopra il ciclo che le applica.
//
// UNA PERSONA COMPARE AL MASSIMO UNA VOLTA AL GIORNO — ed e' qui, e non
// altrove, che si decide se la sua giornata e' pranzo su una partita e cena su
// un'altra: quando meta' del codice non serve piu' su questa partita, prima di
// buttarla si guarda se un'ALTRA partita della persona la chiede quel giorno.
//
// COSA RESTA AL GIRO SUI GIORNI. Un ruolo diverso e piu' piccolo: applicare le
// richieste approvate — che il piano conosce ma che possono anche arrivare a
// piano gia' fatto — e RIPARARE dove il piano non e' eseguibile, riassegnando
// a un'altra persona qualificata o, in ultima istanza, dichiarando l'extra o la
// scopertura. Il `while(remain > 0)` con la scelta avida non e' piu' il motore:
// e' la rete di sicurezza, e se il piano e' buono non scatta.
// ============================================================================
function pianificaSettimana(staffList, staffingNeeds, ctx){
  const cfg = ctx.config;
  const SERVICES = cfg.serviceIds;
  const C2S = cfg.codeToServices;
  const WORK = cfg.workingCodes;
  const days = ctx.days;
  const pools = ctx.pools;
  const constraints = ctx.constraints || {};
  const coperteDa = ctx.coperteDa;
  // Il caso, ma ripetibile. Fra due collocazioni che pareggiano su TUTTI i
  // criteri non c'e' niente da preferire, e a decidere resterebbe l'ordine dei
  // giorni: il piano sarebbe sempre lo stesso, e «rigenera» non cambierebbe
  // piu' niente. Il seme arriva dal motore, quindi due generazioni con lo
  // stesso seme restano identiche e due semi diversi danno due prospetti
  // diversi — che e' esattamente quello che i test chiedono.
  const rand = ctx.rand || Math.random;

  // Posti richiesti in UNA giornata, partita per partita e servizio per
  // servizio. Nei dati il fabbisogno non ha una dimensione giorno: e' lo stesso
  // ogni giorno, e il piano lo replica sui giorni del periodo.
  const perServizio = {};
  SERVICES.forEach(sv=> (staffingNeeds[sv]||[]).forEach(n=>{
    const c = parseInt(n.count) || 0;
    if(c <= 0) return;
    perServizio[n.stationId] = perServizio[n.stationId] || {};
    perServizio[n.stationId][sv] = (perServizio[n.stationId][sv]||0) + c;
  }));
  const partite = Object.keys(perServizio);
  if(!partite.length) return days.map(()=> []);

  // bisogno[partita][giorno][servizio]: quello che resta da coprire mentre il
  // piano si costruisce. E' lo stesso conto che nel giro sui giorni si chiama
  // `remain`, esteso alla settimana.
  const bisogno = {};
  partite.forEach(st=>{ bisogno[st] = days.map(()=> Object.assign({}, perServizio[st])); });
  // Un posto chiuso si chiude anche sulle partite che questa copre di rimbalzo
  // («chi sta alle insalate copre il lavaggio»): e' `segnaCopertura`, qui.
  const chiudi = (st, i, sv) => coperteDa(st).forEach(st2=>{
    if(bisogno[st2] && bisogno[st2][i][sv] > 0) bisogno[st2][i][sv]--;
  });
  const serve = (st, i, sv) => coperteDa(st).some(st2=>
    bisogno[st2] && bisogno[st2][i][sv] > 0);
  const rimastiIl = (st, i) => SERVICES.reduce((n,sv)=> n + (bisogno[st][i][sv]||0), 0);
  const piano = days.map(()=> []);
  const occupato = {};
  staffList.forEach(s=>{ occupato[s.id] = days.map(()=> false); });
  // Gli slot di quota ancora liberi nel piano. Copia dei riferimenti, non degli
  // oggetti: il motore ritrova lo slot in `pools[s.id]` per identita' e lo
  // spende. Il piano non consuma il pool — chi esegue, consuma.
  const disponibili = {};
  staffList.forEach(s=>{ disponibili[s.id] = (pools[s.id]||[])
    .filter(slot=> slot.codes.some(c=> WORK.includes(c))); });

  // QUANTE RISERVE HA QUELLA PARTITA QUEL GIORNO: le persone che la sanno fare,
  // quel giorno ancora libere, non bloccate da una richiesta approvata e con
  // ancora un turno in tasca. E' il criterio che decide DOVE mettere i giorni
  // quando tutto il resto pareggia, e su DEROMA vale CINQUE posti a settimana:
  // togliendolo, le scoperture salgono da 2,00 a 7,00 (e da 6 a 23 su un mese).
  //   Alessio e Carlos sanno fare solo il pass, e ce l'hanno quattro giorni a
  //   testa. Lorenc, Mohammed e Nisan lo sanno fare, ma quando tocca al pass
  //   sono gia' impegnati sulla loro partita in quattro giorni su sette: al
  //   pass restano buoni solo per gli altri tre. Se Carlos si prende i giorni
  //   dove i tre sono liberi, il loro spezzato avanzato non ha piu' un giorno
  //   dove andare e il pass resta scoperto tre volte. Andando prima dove le
  //   riserve sono POCHE, Carlos e Alessio si prendono i quattro giorni magri
  //   e i tre spezzati trovano i tre giorni grassi.
  const riservePer = (st, i, day) => staffList.filter(s=>
    (s.stations||[]).includes(st)
    && !occupato[s.id][i]
    && !(constraintFor(constraints, s.id, day)||{}).blocked
    && disponibili[s.id].length).length;

  // La collocazione migliore di UNA persona su UNA partita, cercata su tutti i
  // suoi slot, tutti i codici ammessi e tutti i giorni del periodo.
  const miglioreCollocazione = (p, st) => {
    let best = null;
    days.forEach((day, i)=>{
      if(occupato[p.id][i]) return;
      // Una richiesta approvata e' un vincolo assoluto: il piano non ci prova
      // nemmeno, cosi' il giorno resta libero per chi lo puo' davvero fare.
      if((constraintFor(constraints, p.id, day)||{}).blocked) return;
      const riserve = riservePer(st, i, day);
      disponibili[p.id].forEach(slot=>{
        slot.codes.forEach(code=>{
          if(!WORK.includes(code)) return;
          if(!codeAllowed(constraints, p.id, day, code, C2S)) return;
          const servizi = C2S[code] || [];
          const mappa = {};
          let chiude = 0, spreco = 0, suSt = 0;
          servizi.forEach(sv=>{
            // Il posto che si sta chiudendo e' quello che QUESTA partita chiede,
            // non quello che chiede una partita che questa copre di rimbalzo.
            // La differenza sembra un cavillo e non lo e': col rimbalzo acceso
            // («chi sta alle insalate copre il lavaggio») guardare l'unione
            // metterebbe DUE persone alle insalate perche' al lavaggio ne
            // mancava una — e alle insalate sul fabbisogno c'e' scritto uno.
            // Misurato su DEROMA con il rimbalzo acceso: 6,00 posti di
            // sovracopertura a settimana, contro 0,00.
            if(bisogno[st][i][sv] > 0){ mappa[sv] = st; chiude++; suSt++; return; }
            // QUI si spezza la giornata fra due partite. La meta' di turno che
            // su questa partita non serve piu' non si butta: se un'ALTRA
            // partita della persona quel servizio lo chiede, ci va. E' «pranzo
            // al pass e cena ai primi», e nasce da un avanzo, non da una regola.
            const altra = (p.stations||[]).find(st2=>
              st2 !== st && bisogno[st2] && bisogno[st2][i][sv] > 0);
            if(altra){ mappa[sv] = altra; chiude++; return; }
            // E se non serve a nessuna delle sue partite, puo' ancora servire
            // DI RIMBALZO restando dov'e': quella meta' non e' buttata, chiude
            // un posto su una partita che questa copre. Non conta come «chiude
            // qui» — la persona resta segnata sulla SUA stazione, e i posti di
            // rimbalzo li scala `chiudi`.
            mappa[sv] = st;
            if(serve(st, i, sv)) chiude++; else spreco++;
          });
          // MAI UNA META' DI TURNO BUTTATA. E' il filtro che fa uscire la forma
          // giusta della settimana: uno spezzato su una giornata gia' mezza
          // coperta resta in tasca, e allora la persona piazza due singoli —
          // oppure quello spezzato avanza per la partita che ne aveva bisogno.
          if(spreco > 0 || !suSt) return;
          const chiave = [
            -suSt,                   // prima quello che chiude QUI
            -chiude,                 // chiudere di piu' con un turno solo
            rimastiIl(st, i),        // e completare la giornata piu' avanti
            riserve,                 // prima i giorni dove questa partita ha meno riserve
            -servizi.reduce((n,sv)=> n + (bisogno[st][i][sv]||0), 0),
            slot.codes.filter(c=> WORK.includes(c)).length,  // lo slot piu' rigido
            i,                       // e a pari merito il giorno piu' vicino
          ];
          if(!best || chiaveMinore(chiave, best.chiave)){
            best = {i, slot, code, mappa, servizi, chiave};
          }
        });
      });
    });
    return best;
  };

  const collocaNelPiano = (p, st, m) => {
    const k = disponibili[p.id].indexOf(m.slot);
    if(k >= 0) disponibili[p.id].splice(k, 1);
    occupato[p.id][m.i] = true;
    m.servizi.forEach(sv=> chiudi(m.mappa[sv], m.i, sv));
    // Il servizio che ha fatto scattare la collocazione: il primo che sta
    // sulla partita di casa. E' quello che il motore passa a `mappaStazioni`.
    const sv = m.servizi.find(x=> m.mappa[x] === st) || m.servizi[0];
    piano[m.i].push({staffId:p.id, slot:m.slot, code:m.code, stationId:st, sv, stations:m.mappa});
  };
  ordinePartite(staffList, partite, ctx.copreOltre).forEach(st=>{
    // FRA GRUPPI SI ESAURISCE, DENTRO UN GRUPPO SI FA A GIRO. Sono due regole
    // diverse perche' rispondono a due domande diverse, e provate a scambiarle
    // peggiorano tutte e due.
    //
    // Fra gruppi (chi sa fare meno partite, poi di chi e' la partita, poi chi
    // ha meno alternative) si ESAURISCE: l'avanzo del dedicato non serve a
    // nessuno, quello del flessibile e' l'unico che puo' arrivare altrove. Ai
    // primi, prendendo a giro da Valerio e da Lorenc, tutti e due finiscono la
    // settimana con un turno singolo in tasca: quello di Valerio non lo puo'
    // spendere nessuno, e a Lorenc serviva uno SPEZZATO per il pass. Esaurendo
    // Valerio, a Lorenc resta lo spezzato giusto.
    //
    // Dentro un gruppo si fa A GIRO: fra pari non c'e' nessun motivo per
    // esaurirne uno prima dell'altro, e spartire i giorni fa stare in piedi
    // piu' turni. Al lavaggio Hossein, Akmol e Rabby sono identici; esaurendo
    // Hossein e poi Akmol, i due si prendono per intero gli stessi tre giorni,
    // e a Rabby restano quattro giorni buoni per cinque turni: uno gli muore in
    // tasca. A giro i sei spezzati si spartiscono cinque giornate a due a due,
    // e i sei turni singoli trovano posto tutti. Misurato su DEROMA esaurendo
    // anche dentro il gruppo: 4,08 posti scoperti a settimana invece di 2,00 e
    // 0,54 di sovracopertura invece di 0,00 — il turno che muore in tasca fa
    // partire una reazione a catena, perche' il motore va a prendersi Rakib per
    // tappare il buco e il giovedi' alle insalate Rakib non c'e' piu'.
    gruppiQualificati(staffList, st).forEach(g=>{
      // IL CASO STA QUI, ED E' L'UNICO POSTO DOVE PUO' STARE SENZA COSTARE.
      // Dentro il gruppo le persone sono pari per definizione: mescolarle non
      // toglie niente a nessun criterio, e senza, «rigenera» darebbe sempre lo
      // stesso identico prospetto — il piano e' un conto, e un conto non
      // cambia da solo. Sui GIORNI invece il caso costa: a pari merito il piano
      // prende il giorno piu' vicino, e cosi' i turni riempiono la settimana
      // dall'inizio e il vuoto — quando le quote non bastano — cade in fondo,
      // dove la squadra lo vede arrivare. Misurato mettendo il caso sui giorni:
      // su una brigata da 24 turni per 28 posti i turni oltre quota cadevano
      // di giovedi' invece che di domenica.
      const gente = shuffleArray(g.gente.slice(), rand);
      let mosso = true;
      while(mosso){
        mosso = false;
        for(const p of gente){
          const m = miglioreCollocazione(p, st);
          if(!m) continue;
          collocaNelPiano(p, st, m);
          mosso = true;
        }
      }
    });
  });

  return piano;
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
  // `origineFlag` dice DA DOVE viene un turno, e non e' un doppione di
  // `extraFlag`: due booleani indipendenti («extra» ed «eccedenza») permettono
  // lo stato impossibile "extra E eccedenza", e prima o poi qualcuno li somma.
  // Un solo campo a valori mutuamente esclusivi non lo permette:
  //   'copertura'  turno di quota che chiude un posto richiesto (il caso normale)
  //   'extra'      fuori quota — COSTA DI PIU'
  //   'eccedenza'  dentro quota, collocata dove non era richiesta — GIA' PAGATA
  //   'manuale'    scritto a mano dalla griglia (il motore non lo produce mai)
  // `extra` resta come campo DERIVATO (extra === origine==='extra'): la griglia,
  // il foglio di scelta e i test che leggono `.extra` continuano a funzionare
  // senza toccarli, e le celle gia' salvate — che `origine` non ce l'hanno — si
  // leggono con `origine || (extra ? 'extra' : 'copertura')`. Nessuna migrazione.
  const assigned = {}, stationAssign = {}, extraFlag = {}, origineFlag = {};
  staffList.forEach(s=>{ assigned[s.id]={}; stationAssign[s.id]={}; extraFlag[s.id]={}; origineFlag[s.id]={}; });
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

  // IL PIANO DELLA SETTIMANA, deciso qui: prima del primo giorno, e una volta
  // sola. Da qui in avanti il giro sui giorni lo esegue e ne ripara i pezzi
  // che non stanno in piedi (vedi la testata di `pianificaSettimana`).
  const perId = {};
  staffList.forEach(s=>{ perId[s.id] = s; });
  const piano = pianificaSettimana(staffList, staffingNeeds, {
    config: cfg, pools, days, constraints, coperteDa, copreOltre, rand,
  });
  // Quanti turni il piano ha gia' prenotato a questa persona nei giorni che
  // vengono dopo quello in corso. Serve al giro dei giorni per non spendere
  // oggi un turno che serve venerdi'.
  const impegniFuturi = (s, indiceGiorno) => {
    let n = 0;
    for(let i=indiceGiorno+1; i<piano.length; i++){
      if(piano[i].some(v=> v.staffId === s.id)) n++;
    }
    return n;
  };
  // E quanti gliene restano in tasca da spendere. NON e' `quotaLavoroResidua`,
  // e la differenza conta: quella non conta gli slot che hanno anche il riposo
  // fra i codici (['R','SP']), perche' li' serve a dire «questi diventeranno
  // sicuramente lavoro». Qui la domanda e' un'altra — «quanti turni puo' ancora
  // scrivere» — e uno slot ['R','SP'] il piano lo prenota eccome. Con il conto
  // sbagliato, Samad e Rabby, che di slot cosi' ne hanno tre a testa,
  // risultavano sempre gia' impegnati oltre il possibile.
  const slotSpendibili = s => (pools[s.id]||[])
    .filter(slot=> slot.codes.some(c=> WORKING_CODES.includes(c))).length;

  days.forEach((day, indiceGiorno)=>{
    // Le richieste approvate si applicano prima di ogni altra cosa: la persona
    // è già "occupata" per quel giorno e nessuna logica successiva la tocca.
    staffList.forEach(s=>{
      const c = constraintFor(constraints, s.id, day);
      if(c && c.blocked) assigned[s.id][day] = c.blocked;
    });

    const remain = {};
    SERVICES.forEach(sv=>{ remain[sv]={}; (staffingNeeds[sv]||[]).forEach(n=>{ remain[sv][n.stationId]=(remain[sv][n.stationId]||0)+(parseInt(n.count)||0); }); });

    // Un turno assegnato chiude dei posti: su tutti i servizi che il codice
    // copre, e su tutte le stazioni che quella stazione copre — la sua, sempre,
    // piu' quelle di rimbalzo. E' l'unico punto in cui «Rakib conta anche nei
    // due del lavaggio» diventa un numero. `svBase` c'e' per sicurezza: il
    // posto che ha fatto scattare l'assegnazione va chiuso comunque, anche se
    // un domani il codice scelto smettesse di coprirlo, altrimenti il `while`
    // che ci gira intorno non finirebbe piu'.
    const segnaCopertura = (mappa) => {
      Object.keys(mappa||{}).forEach(sv2=>{
        const st = mappa[sv2];
        if(!st) return;
        coperteDa(st).forEach(st2=>{
          if(remain[sv2] && remain[sv2][st2]) remain[sv2][st2] = Math.max(0, remain[sv2][st2]-1);
        });
      });
    };
    // Su quale stazione sta questa persona, SERVIZIO PER SERVIZIO.
    // «Potrebbe essere che la stessa persona stia a pranzo in una partita e a
    // cena in un'altra.»
    //
    // Il posto che ha fatto scattare l'assegnazione (`sv`) va sulla stazione
    // richiesta, e non si discute. Per gli ALTRI servizi che il codice copre la
    // domanda e' una sola: quella stazione, li', serve ancora?
    //   - Si' → non ci si sposta. E' il caso normale, ed e' anche il motivo per
    //     cui il codice accorpato e' stato scelto (`codeCoversMore`): una
    //     persona sola chiude due posti sulla stessa partita.
    //   - No  → quella meta' di turno oggi non copre niente. Si guarda fra le
    //     ALTRE stazioni della persona, nell'ordine di `s.stations`, che e' la
    //     priorita' impostata dal titolare: la prima ancora scoperta se la
    //     prende. Se non ce n'e' nessuna si resta dov'era, come sempre.
    // Il turno resta UNO — `turniResidui` si scala una volta sola, piu' sotto —
    // e quello che si sposta e' solo dove la persona sta fisicamente nella
    // seconda meta' della giornata.
    //
    // `sv` si scrive comunque, anche se il codice non lo coprisse: il posto che
    // ha fatto scattare l'assegnazione va chiuso, altrimenti il `while` che ci
    // gira intorno non finirebbe piu'.
    // La stessa domanda su un `remain` QUALSIASI, non solo su quello di adesso.
    // Serve perche' una delle domande che il motore si fa e' «e dopo che avro'
    // assegnato questo turno, chi resta puo' ancora coprire senza sprecare?»:
    // e' una domanda sul mondo che si sta per creare, e farla sul mondo di
    // adesso da' sempre la risposta ottimista.
    const serveIn = (r, sv2, st) =>
      coperteDa(st).some(st2=> (r[sv2]||{})[st2] > 0);
    const serveAncora = (sv2, st) => serveIn(remain, sv2, st);
    // `remain` come sara' dopo che una mappa servizio → stazione avra' chiuso
    // i suoi posti. Copia, non tocca l'originale: e' una simulazione.
    const remainDopo = (mappa) => {
      const r = {};
      SERVICES.forEach(sv2=>{ r[sv2] = Object.assign({}, remain[sv2]||{}); });
      Object.keys(mappa||{}).forEach(sv2=>{
        const st = mappa[sv2];
        if(!st) return;
        coperteDa(st).forEach(st2=>{ if(r[sv2][st2]) r[sv2][st2] = Math.max(0, r[sv2][st2]-1); });
      });
      return r;
    };
    // QUANTE META' DI UN TURNO SI BUTTANO VIA. Un codice che copre piu' servizi
    // porta con se' delle meta' di giornata: quelle che cadono su un servizio
    // dove questa partita non chiede piu' nessuno — e dove nessun'altra partita
    // della persona chiede nessuno, perche' allora `mappaStazioni` la
    // sposterebbe li' — sono persone in piu' del fabbisogno, cioe' la
    // sovracopertura. Il servizio che ha fatto scattare l'assegnazione
    // (`svBase`) non si conta mai: quello e' il motivo per cui si assegna.
    const sprecoIn = (r, s, code, svBase, st) => (CODE_TO_SERVICES[code]||[]).filter(sv2=>
      sv2 !== svBase
      && !serveIn(r, sv2, st)
      && !(s.stations||[]).some(st2=> st2 !== st && serveIn(r, sv2, st2))).length;
    // Lo stesso conto SENZA contare lo spostamento su un'altra partita, e la
    // differenza non e' un dettaglio. Quando si guarda il turno che si sta
    // assegnando ADESSO, `mappaStazioni` lo spostamento lo fa subito e quindi
    // va contato. Quando invece si PREVEDE che un altro coprira' un servizio
    // piu' tardi, quello spostamento e' una promessa su un posto che nel
    // frattempo qualcun altro chiudera': su DEROMA l'altra partita di Lorenc e'
    // il pass, che a pranzo viene coperto DOPO i primi, e la promessa e' gia'
    // scaduta quando arriva il momento di mantenerla. Previsione ottimista
    // uguale sovracopertura: qui si guarda solo questa partita.
    const sprecoSecco = (r, code, svBase, st) => (CODE_TO_SERVICES[code]||[]).filter(sv2=>
      sv2 !== svBase && !serveIn(r, sv2, st)).length;
    // `base` e' la mappa che il PIANO aveva gia' deciso per questa persona, e
    // c'e' solo per il ramo che esegue il piano. Senza, ogni servizio parte
    // dalla stazione che ha fatto scattare l'assegnazione, ed e' il
    // comportamento di sempre. Con, si parte da dove il piano aveva messo la
    // persona — e la regola su dove finisce la meta' che qui non serve piu'
    // resta scritta una volta sola, qui dentro.
    // Perche' serve: il piano puo' aver deciso «pranzo alle insalate, cena al
    // lavaggio». Se al momento di scrivere si ripartisse da «tutto alle
    // insalate», la cena tornerebbe alle insalate — dove c'era gia' qualcuno —
    // e sarebbe una persona in piu' del fabbisogno. Misurato su DEROMA: 1,00
    // posto di sovracopertura a settimana, tutto qui.
    const mappaStazioni = (s, code, sv, stationId, base) => {
      const m = {};
      (CODE_TO_SERVICES[code]||[]).forEach(sv2=>{ m[sv2] = (base && base[sv2]) || stationId; });
      m[sv] = (base && base[sv]) || stationId;
      Object.keys(m).forEach(sv2=>{
        if(sv2 === sv || serveAncora(sv2, m[sv2])) return;
        const altra = (s.stations||[]).find(st2=>
          st2 !== m[sv2] && serveAncora(sv2, st2));
        if(altra) m[sv2] = altra;
      });
      return m;
    };

    // ------------------------------------------------------------------------
    // SI ESEGUE IL PIANO, e solo dopo si guarda cosa e' rimasto scoperto.
    //
    // Il piano sa gia' chi lavora oggi, con quale codice e su quale partita:
    // qui non si sceglie piu' niente, si scrive. Una voce si salta in tre casi
    // soli, e sono tutti «il piano non e' eseguibile», mai «ho cambiato idea»:
    //   - la persona ha gia' una cella oggi (una richiesta approvata l'ha
    //     bloccata, oppure una voce precedente l'ha gia' presa);
    //   - il codice oggi non le e' ammesso (chi ha chiesto «solo pranzo»);
    //   - lo slot che il piano le aveva messo da parte non e' piu' nel pool.
    // E una quarta, che e' la difesa contro la sovracopertura: se quando arriva
    // il suo turno la voce non chiude piu' nemmeno un posto, non si scrive. Con
    // il piano intero eseguibile non capita mai — l'invariante del piano e' che
    // i posti chiusi siano esattamente quelli richiesti — ma con le richieste
    // approvate di mezzo il conto puo' scivolare, e allora meglio un buco che
    // una persona in piu' dove il fabbisogno ne chiedeva una.
    // Quello che il piano non ha potuto fare resta a `remain`, e lo raccoglie
    // il giro dei candidati piu' sotto: e' la rete di sicurezza.
    // ------------------------------------------------------------------------
    (piano[indiceGiorno]||[]).forEach(voce=>{
      const s = perId[voce.staffId];
      if(!s || assigned[s.id][day]) return;
      if(!codeAllowed(constraints, s.id, day, voce.code, CODE_TO_SERVICES)) return;
      const idx = (pools[s.id]||[]).indexOf(voce.slot);
      if(idx < 0) return;
      // La stessa `mappaStazioni` del giro dei candidati, e non e' un
      // doppione: il piano ha deciso dove sta la persona servizio per servizio,
      // ma fra il piano e adesso puo' essere cambiato qualcosa, e la regola su
      // dove finisce la meta' di turno che qui non serve piu' dev'essere una
      // sola scritta in un posto solo.
      const m = mappaStazioni(s, voce.code, voce.sv, voce.stationId, voce.stations);
      if(!Object.keys(m).some(sv2=> serveAncora(sv2, m[sv2]))) return;
      pools[s.id].splice(idx, 1);
      assigned[s.id][day] = voce.code;
      stationAssign[s.id][day] = m;
      oreFatte[s.id] += oreDi(voce.code);
      // Un turno e' UNO, e si scala sulla partita che l'ha chiesto: vale qui la
      // stessa regola scritta piu' sotto per il riempimento finale.
      turniResidui[voce.stationId] = Math.max(0, (turniResidui[voce.stationId]||0) - 1);
      segnaCopertura(m);
    });

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

          // Un turno che copre più servizi conviene se ANCHE gli altri servizi che
          // copre sono ancora scoperti su questa stazione: una persona sola ne
          // chiude due. Prima era il caso particolare "pranzo + cena = spezzato".
          const codeCoversMore = code =>
            (CODE_TO_SERVICES[code]||[]).filter(sv2=> sv2!==sv && (remain[sv2]||{})[stationId] > 0).length;

          // `remain` come sara' dopo che UN TURNO SINGOLO avra' chiuso questo
          // posto: e' il mondo in cui si trovera' chi coprira' gli altri servizi
          // di questa partita, e la domanda «qualcun altro puo' farlo?» va fatta
          // li'.
          const remainSingolo = remainDopo({[sv]: stationId});

          // Lo spreco di uno slot e' quello del codice MIGLIORE che ci si puo'
          // pescare: uno slot ['R','SP'] non spreca niente finche' il riposo e'
          // fra le sue scelte, e uno ['S','P'] nemmeno.
          const sprecoSlot = (s, slot, ok) => slot.codes.filter(c=> ok.includes(c))
            .reduce((n,c)=> Math.min(n, sprecoIn(remain, s, c, sv, stationId)), Infinity);
          // Quanti ALTRI posti ancora aperti su questa partita lo slot sa
          // chiudere, nel suo giorno migliore.
          const chiudeSlot = (slot, ok) => slot.codes.filter(c=> ok.includes(c))
            .reduce((n,c)=> Math.max(n, codeCoversMore(c)), 0);

          let candidates = staffList.filter(s=>{
            if(assigned[s.id][day]) return false;
            const qualified = (s.stations&&s.stations.length) ? s.stations.includes(stationId) : false;
            if(!qualified) return false;
            if(!codiciUtili(s).length) return false;
            return pools[s.id].some(slot=> slot.codes.some(c=>codiciUtili(s).includes(c)));
          });
          // NON SI SMONTA IL PIANO PER TAPPARE UN BUCO. Chi ha in tasca esattamente
          // i turni che il piano gli ha gia' prenotato per i giorni che vengono,
          // oggi si lascia stare: prendergliene uno adesso non aggiunge niente —
          // il buco si sposta soltanto a venerdi' — e in mezzo rompe la giornata
          // che il piano aveva costruito. Misurato su DEROMA: senza questo
          // filtro, il motore andava a prendersi Rakib il martedi' per il
          // lavaggio, e il giovedi' Rakib arrivava alle insalate con in tasca
          // solo uno spezzato: mezza giornata sprecata (2,00 posti di
          // sovracopertura a settimana) e la domenica un turno oltre quota.
          // E' una PREFERENZA, non un divieto, come il tetto agli extra: se non
          // resta nessun altro si prende comunque, perche' una scopertura falsa
          // e' peggio di un piano smontato.
          candidates = candidates.filter(s=> slotSpendibili(s) > impegniFuturi(s, indiceGiorno));
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
          // SE LASCIARE IL RESTO AGLI ALTRI COSTA UNO SPRECO, SI ACCORPA ADESSO.
          // La forma della giornata puo' chiedere due turni singoli su questa
          // partita — uno a pranzo e uno a cena — ma quella forma esiste solo
          // se DUE persone un turno singolo ce l'hanno davvero in tasca. Quando
          // non c'e', il secondo servizio finisce a chi ha in tasca solo
          // accorpati, e quell'accorpato si porta dietro una meta' di giornata
          // che nessuno chiedeva piu'. Il motore non se ne accorgeva perche' si
          // chiedeva «c'e' qualcun altro che copre la cena?» guardando il mondo
          // di ADESSO, dove il posto di pranzo e' ancora aperto e quindi
          // l'accorpato di chiunque sembra gratis.
          // Misurato su DEROMA: e' l'ultimo 0,94 di sovracopertura a settimana,
          // e cade quasi tutto il venerdi'.
          const sostituibileSenzaSpreco = (sv2, esclusoId) => staffList.some(s2=>{
            if(s2.id === esclusoId || assigned[s2.id][day]) return false;
            if(!(s2.stations && s2.stations.includes(stationId))) return false;
            const cod = (SERVICE_CODES[sv2]||[]).filter(c=>
              codeAllowed(constraints, s2.id, day, c, CODE_TO_SERVICES)
              && sprecoSecco(remainSingolo, c, sv2, stationId) === 0);
            return cod.length > 0 && pools[s2.id].some(slot=> slot.codes.some(c=> cod.includes(c)));
          });
          // Questa persona sa chiudere, con UN turno solo, anche gli altri
          // servizi ancora scoperti qui?
          const accorpaQui = (s) => { const ok = codiciUtili(s);
            return (pools[s.id]||[]).some(slot=>
              slot.codes.some(c=> ok.includes(c) && codeCoversMore(c) > 0)); };
          // Il costo che la scelta di questa persona scarica sul resto della
          // giornata: uno, se non accorpa e cio' che lascia aperto non ha
          // nessuno che possa prenderlo senza sprecare. Zero in ogni altro caso
          // — e su una cucina con un servizio solo e' sempre zero, perche'
          // `altriScoperti` e' vuoto.
          const costoDelResto = (s) => (!accorpaQui(s)
            && altriScoperti.some(sv2=> !sostituibileSenzaSpreco(sv2, s.id))) ? 1 : 0;
          const costoDelCandidato = {};
          candidates.forEach(s=>{ costoDelCandidato[s.id] = costoDelResto(s); });
          const perCostoDelResto = (a,b)=> costoDelCandidato[a.id] - costoDelCandidato[b.id];

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
            // IL COSTO DEL RESTO STA DAVANTI A TUTTO, ANCHE A «CHI SA FARE MENO
            // STAZIONI», e va spiegato perche' quel criterio e' una regressione
            // gia' pagata in produzione e finora non gli passava davanti
            // nessuno. Non e' un'inversione: `perCostoDelResto` vale zero per
            // tutti tranne nel caso stretto in cui la persona non puo' chiudere
            // gli altri servizi ancora aperti QUI e cio' che lascia aperto non
            // ha nessuno che lo possa prendere senza sprecare. In quel caso il
            // criterio delle stazioni non sta difendendo niente: il jolly che
            // «si tiene di riserva» e' proprio quello che fra due passaggi verra'
            // chiamato lo stesso, e con un turno che butta via mezza giornata.
            // Misurato su DEROMA, dietro a `perStazioni` non muove niente
            // (0,92 di sovracopertura, identico a toglierlo del tutto); davanti
            // porta la sovracopertura a 0,00 e le scoperture da 9,00 a 8,54.
            candidates.sort((a,b)=> perCostoDelResto(a,b)
              || perStazioni(a,b)
              || (quotaLavoroResidua(b) - quotaLavoroResidua(a))
              || perPriorita(a,b)
              || perOre(a,b));
          }
          const chosen = candidates[0];
          const pool = pools[chosen.id];

          // SERVE UN ACCORPATO QUI, OGGI? E' la stessa domanda di `turnoLungo`
          // — che pero' decide CHI lavora e va risposta prima di sapere chi —
          // rifatta ora che la persona e' scelta, e senza contare lei.
          // Contarla e' contare due volte la stessa testa: su DEROMA Uddin
          // prendeva il turno di pranzo sui secondi perche' «tanto la cena la
          // copre qualcuno da solo», e quel qualcuno era Uddin. La sera restava
          // Mohammed, che in tasca ha solo accorpati, e il suo pranzo finiva su
          // una partita gia' chiusa. E' l'ultimo 0,46 di sovracopertura.
          const copribileDaAltri = sv2 => staffList.some(s2=>{
            if(s2.id === chosen.id || assigned[s2.id][day]) return false;
            if(!(s2.stations && s2.stations.includes(stationId))) return false;
            const cod = (SERVICE_CODES[sv2]||[]).filter(c=>
              (CODE_TO_SERVICES[c]||[]).length === 1
              && codeAllowed(constraints, s2.id, day, c, CODE_TO_SERVICES));
            return cod.length > 0 && pools[s2.id].some(slot=> slot.codes.some(c=> cod.includes(c)));
          });
          const serveAccorpare = altriScoperti.length > 0
            && (budgetSpezzati[stationId] > 0 || altriScoperti.some(sv2=> !copribileDaAltri(sv2)));

          // Quante altre persone potrebbero coprire il servizio `sv2` su questa
          // stazione, oggi. Serve prima di rinunciare a uno spezzato: il turno
          // accorpato si lascia solo se il servizio che porta con sé ha
          // qualcun altro che lo può prendere.
          // Qui NON si filtra sullo spreco, e non è una dimenticanza: provato,
          // aggiungendo `sprecoSecco(remainSingolo, ...) === 0` i numeri su
          // DEROMA non si muovono di un centesimo (0,00 / 8,54 / 0,00). Quando
          // si arriva qui la persona è già stata scelta con il criterio del
          // costo del resto, che quella domanda l'ha già fatta.
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
            // PRIMA GLI SLOT CHE NON SI BUTTANO VIA, poi i meno flessibili.
            // Il criterio «meno codici per primi» c'era gia' ed e' giusto —
            // uno slot con una sola scelta va speso finche' quella scelta
            // serve — ma da solo guarda la persona e non la giornata: uno slot
            // di solo accorpato ha UN codice, quindi passava davanti a tutto, e
            // quando il servizio gemello era gia' coperto quella meta' di turno
            // finiva su una partita che non chiedeva nessuno. E' la
            // sovracopertura, ed e' l'intera sovracopertura: misurata su
            // DEROMA, 8,37 posti-servizio a settimana su 8,37, tutti scritti
            // qui. Ora lo spreco viene prima: fra gli slot compatibili si
            // spende per primo quello che non regala niente.
            //
            // In mezzo, a parita' di spreco, la FORMA della giornata: se qui
            // oggi ci vuole un accorpato si prende uno slot che sappia farlo,
            // altrimenti uno che sappia fare il turno corto. Senza questo
            // criterio due slot pareggiavano — «S/P» e «R/SP» hanno entrambi
            // due codici — e a decidere restava l'ordine in cui la quota e'
            // scritta in anagrafica: Rabby faceva il turno di pranzo al
            // lavaggio con il budget degli accorpati a tre, e la sera il
            // lavaggio restava a chi accorpati ne aveva solo. Misurato: 0,36 di
            // sovracopertura e 1,58 posti scoperti a settimana.
            //
            // Su una cucina con UN SOLO SERVIZIO nessuno di questi due criteri
            // esiste: ogni codice copre un servizio solo, quindi lo spreco e'
            // sempre zero e `chiudeSlot` sempre zero. L'ordinamento torna a
            // essere «meno codici per primi», identico a prima.
            matchIdx.sort((a,b)=> (sprecoSlot(chosen, pool[a], ammessi) - sprecoSlot(chosen, pool[b], ammessi))
              || (serveAccorpare ? chiudeSlot(pool[b], ammessi) - chiudeSlot(pool[a], ammessi)
                                 : chiudeSlot(pool[a], ammessi) - chiudeSlot(pool[b], ammessi))
              || (pool[a].codes.length - pool[b].codes.length));
            const slotIdx = matchIdx[0];
            const slot = pool[slotIdx];
            code = scegliCodice(slot.codes.filter(c=>ammessi.includes(c)), true);
            pool.splice(slotIdx,1);
          }

          assigned[chosen.id][day] = code;
          stationAssign[chosen.id][day] = mappaStazioni(chosen, code, sv, stationId);
          oreFatte[chosen.id] += oreDi(code);
          // Un turno di quota speso qui è un turno in meno da spalmare sui
          // giorni che restano: senza questo la forma della settimana
          // resterebbe ferma al conto del lunedì.
          if(!isExtra) turniResidui[stationId] = Math.max(0, (turniResidui[stationId]||0) - 1);
          if(isExtra){
            extraFlag[chosen.id][day] = true;
            origineFlag[chosen.id][day] = 'extra';
            extraFatti[chosen.id]++;
            extras.push({day, service:sv, stationId, staffId:chosen.id, staffName:chosen.name});
          }
          segnaCopertura(stationAssign[chosen.id][day]);
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
    // Restituisce la MAPPA servizio → stazione, non una stazione sola: da
    // quando la cella distingue i servizi, il riempimento finale deve dire
    // dove sta la persona a pranzo e dove a cena.
    const stazioniScoperte = (s, code) => {
      const mie = (s.stations && s.stations.length) ? s.stations : [];
      const servizi = CODE_TO_SERVICES[code]||[];
      const m = {};
      let prima = null;
      servizi.forEach(sv2=>{
        // La prima delle sue partite ancora scoperta su QUESTO servizio, in
        // ordine di priorita': anche qui pranzo e cena possono cadere su due
        // partite diverse.
        const st = mie.find(st0=> (remain[sv2]||{})[st0] > 0) || null;
        m[sv2] = st;
        if(st && !prima) prima = st;
      });
      if(!prima) return null;
      // Un servizio che non ha trovato niente resta sulla partita degli altri:
      // e' il comportamento di sempre, e lascia la cella senza buchi.
      servizi.forEach(sv2=>{ if(!m[sv2]) m[sv2] = prima; });
      return m;
    };
    // Segna la copertura appena decisa nel riempimento finale, altrimenti due
    // persone di fila si accamperebbero sulla stessa stazione scoperta.
    // Il turno speso qui e' un turno in meno da spalmare sui giorni che restano
    // per la stazione dove la persona sta davvero; la copertura che porta con
    // se' passa da `segnaCopertura` e vale anche per le stazioni di rimbalzo.
    // `turniResidui` NON si scala anche a quelle: e' il budget dei turni di
    // QUELLA partita, e nessuno di quei turni e' stato speso.
    // UN TURNO E' UNO. `turniResidui` e' il budget della FORMA della settimana e
    // si conta in TURNI: si scala una volta sola, sulla stazione del primo
    // servizio. Quello che il turno chiude sugli altri servizi si scala in
    // `remain`, che e' un conto di POSTI — un'altra unita'. Scalarlo una volta
    // per servizio farebbe crollare `budgetSpezzati` prima del tempo, il motore
    // smetterebbe di fare spezzati e ripiegherebbe su turni singoli ed extra:
    // e' il difetto gia' pagato e gia' misurato piu' su (quattro extra al
    // lavaggio nel weekend, 46 ore di scarto fra la persona piu' carica e la
    // meno carica), e non darebbe nessun errore.
    //
    // ONESTA' SU QUESTA RIGA, perche' vale la stessa regola scritta piu' su per
    // `pianificabili`: nel punto di scrittura principale del motore il conto
    // singolo e' difeso da un test (quattro diventano rossi se si scala per
    // servizio), QUI no. Scalando per servizio anche in questo ramo, 4.000
    // brigate a caso danno prospetti identici bit per bit: il riempimento
    // finale scatta di rado e non capita mai che assegni un accorpato su due
    // partite diverse con budget ancora in cassa. La regola resta scritta
    // com'e' perche' e' quella giusta, non perche' un test la difenda — e non
    // gli e' stato messo accanto un test che finge di farlo.
    const consumaCopertura = (code, mappa) => {
      const principale = (CODE_TO_SERVICES[code]||[]).map(sv2=> mappa[sv2]).find(st=> st);
      if(principale) turniResidui[principale] = Math.max(0, (turniResidui[principale]||0) - 1);
      segnaCopertura(mappa);
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
          let code = null, mappa = null;
          for(const c of ok){
            const m = stazioniScoperte(s, c);
            if(m){ code = c; mappa = m; break; }
          }
          if(!code){ assigned[s.id][day] = REST_CODE; return; }
          pools[s.id].splice(idx,1);
          assigned[s.id][day] = code;
          // Anche le ore assegnate qui sono ore vere che la persona lavora:
          // se non si contassero, il pareggiamento dei giorni successivi
          // guarderebbe metà della settimana. Misurato: contandole, lo scarto
          // medio max-min in una settimana scende da 4,25 a 2,60 ore.
          oreFatte[s.id] += oreDi(code);
          stationAssign[s.id][day] = mappa;
          consumaCopertura(code, mappa);
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
          let code = null, mappa = null;
          if(valueOf(slot) === 0){
            code = REST_CODE;                      // slot di solo riposo: si spende, è il suo scopo
          } else {
            // Prima si guarda se una stazione della persona è ancora scoperta.
            for(const c of slot.codes){
              const m = stazioniScoperte(s, c);
              if(m){ code = c; mappa = m; break; }
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
          if(mappa){
            stationAssign[s.id][day] = mappa;
            consumaCopertura(code, mappa);
          }
        } else {
          assigned[s.id][day] = REST_CODE;
        }
      }
    });
  });

  // ==========================================================================
  // FASE 3 — LE ORE DI CONTRATTO CHE AVANZANO.
  //
  // «Se avanzano ore di contratto a qualcuno, le deve assegnare in automatico
  // quando pensa che ne servano di piu'.» Fino a ieri il motore quelle ore le
  // lasciava in tasca e si limitava a dichiararle (`quotaNonSpesa`). Ma lo chef
  // le paga comunque: meglio averle in cucina la sera forte che a casa.
  //
  // DUE COSE DIVERSE, E NON VANNO MAI NELLO STESSO CONTEGGIO:
  //   TURNO EXTRA         = oltre la quota della persona   → COSTA DI PIU'
  //   ECCEDENZA COLLOCATA = dentro la quota, messa su un   → GIA' PAGATA
  //                         giorno scelto
  // Per questo `extras[]` ed `eccedenzeCollocate[]` sono due liste separate che
  // non si sommano mai, e per questo la cella porta `origine` e non un secondo
  // booleano accanto a `extra`.
  //
  // PERCHE' QUI E NON PRIMA, e non dentro il giro dei giorni:
  //  - il criterio con cui la copertura sceglie i candidati e' «chi ha piu'
  //    quota da smaltire lavora prima» (`quotaLavoroResidua`). Se questa fase
  //    prenotasse slot in anticipo quel numero calerebbe e la copertura
  //    perderebbe i candidati giusti. La copertura deve vedere il pool intatto.
  //  - la quota non spesa e' NOTA solo alla fine: e' esattamente quello che
  //    resta in `pools[s.id]` dopo l'ultimo giorno. Non si calcola niente di
  //    nuovo, si consuma quel residuo.
  //  - non tocca mai una cella gia' decisa: aggiunge solo dove non c'e' niente
  //    o dove c'e' un riposo messo dal MOTORE. Un riposo che viene da una
  //    richiesta approvata e' un vincolo assoluto e resta dov'e'.
  //
  // IL PIANO PREVEDEVA TRE PASSI, E DUE NON ESISTONO. Vale la pena scriverlo,
  // perche' e' la prima cosa che verra' in mente a chi rilegge:
  //   3a RECUPERO     — «se resta una scopertura che questa persona sa coprire,
  //                     quel turno e' copertura, non eccedenza».
  //   3b SOSTITUZIONE — «se un altro ha preso un turno OLTRE QUOTA che questa
  //                     persona sa fare, l'extra si converte e il costo scende».
  // Sono a costo negativo e sarebbero andate per prime. Non ci sono perche' NON
  // POSSONO MAI ACCADERE, e la dimostrazione sta tre schermate piu' su, nel giro
  // dei giorni: un extra si chiama SOLO quando `candidates` di quota e' vuoto, e
  // il test che lo svuota — «e' libero, e' qualificato, ha in tasca uno slot con
  // un codice ammesso oggi che copre questo servizio» — e' parola per parola lo
  // stesso che farebbe qui `scegliSlot`. Se qualcuno lo passasse ora, l'avrebbe
  // passato allora e l'extra non sarebbe stato chiamato; e nessuno si libera nel
  // frattempo, perche' dentro una giornata le assegnazioni si aggiungono e basta.
  // Identico per la scopertura, che si dichiara solo quando falliscono ANCHE i
  // candidati oltre quota.
  // Non e' un ragionamento e basta: 4.000 brigate casuali (numero di persone,
  // stazioni, quote, richieste approvate e tetto agli extra sorteggiati) hanno
  // prodotto 85.335 posti scoperti e 19.753 turni extra, e le due fasi sono
  // scattate ZERO volte. Sessanta righe che non girano mai, con accanto un test
  // che non puo' diventare rosso, sono peggio di questo commento.
  // DOVE TORNEREBBERO UTILI: il giorno in cui il giro dei giorni imparasse a
  // liberare qualcuno (uno scambio, un ripensamento su una giornata gia'
  // chiusa), oppure se la scelta dei candidati di copertura diventasse piu'
  // stretta di quella della collocazione — per esempio con un tetto alle ore
  // anche li'. Allora, e solo allora, vanno rimesse davanti alla 3c.
  //
  // Resta quindi un passo solo:
  //   3c COLLOCAZIONE  il fabbisogno e' gia' chiuso e la persona in piu' e' una
  //                    scelta. E' anche la sola che conta come eccedenza.
  //
  // Il default del MOTORE resta «lascia in tasca» (nessuna `options.eccedenza`):
  // con l'opzione assente non si esegue una riga di qui dentro, `rand` non viene
  // chiamato e il risultato e' identico bit per bit a prima. Il default
  // dell'INTERFACCIA e' invece 'auto', che e' quello che ha chiesto lo chef.
  // ==========================================================================
  const optEcc = options.eccedenza || {};
  const modoEcc = optEcc.modo || 'lascia';
  const collocaAttiva = (modoEcc === 'auto' || modoEcc === 'giorni');
  // Il freno per giornata: al massimo N persone in piu' del richiesto sulla
  // stessa stazione nello stesso servizio. Senza, «sui giorni che scelgo io»
  // e' un generatore di sovracopertura con l'etichetta buona — cinque
  // eccedenze e un giorno solo mettono cinque persone in piu' il sabato.
  const maxPerGiorno = (optEcc.maxPerGiornoPerStazione != null)
    ? (parseInt(optEcc.maxPerGiornoPerStazione) || 0) : 1;
  const rispettaOre = optEcc.rispettaOreContrattuali !== false;
  const eccedenzeCollocate = [];
  // Perche' una quota e' rimasta in tasca. Si annota mentre si prova, non si
  // indovina dopo: senza il motivo, chi legge il riepilogo pensa a un difetto.
  const perche = {};
  const segnaMotivo = (s, k)=>{ (perche[s.id] = perche[s.id] || {})[k] = true; };

  // Il tetto delle ore contrattuali, rapportato alla durata del periodo come fa
  // gia' la tabella delle ore (`weeklyExtraFromTurni`: ore × giorni/7). E' la
  // difesa che impedisce all'eccedenza di diventare un extra con l'etichetta
  // sbagliata: sette slot da 11 ore su un contratto da 40 sono un extra
  // travestito. Il campo `hours` e' facoltativo in brigata: quando manca resta
  // solo il tetto del pool, e il riepilogo deve dirlo (`oreNonVerificate`).
  const senzaOre = s => !(parseFloat(s.hours) > 0);
  const tettoOre = s => (!rispettaOre || senzaOre(s))
    ? Infinity : parseFloat(s.hours) * (days.length / 7);

  // Posti richiesti, per servizio e stazione. Non dipendono dal giorno: nei dati
  // il fabbisogno non ha una dimensione giorno, e fingere che ce l'abbia sarebbe
  // una regola inventata (vedi il commento sul criterio automatico più sotto).
  const richiesti = {};
  SERVICES.forEach(sv=>{ richiesti[sv] = {};
    (staffingNeeds[sv]||[]).forEach(n=>{
      richiesti[sv][n.stationId] = (richiesti[sv][n.stationId]||0) + (parseInt(n.count)||0);
    });
  });

  const slotDiLavoro = s => (pools[s.id]||[])
    .map((slot,i)=> ({i, slot}))
    .filter(x=> x.slot.codes.some(c=> WORKING_CODES.includes(c)));

  // Il giorno e' libero per davvero? Vuoto o riposo messo dal motore: si'.
  // Ferie, malattia, riposo concordato: MAI. La scelta del titolare e' una
  // preferenza, una richiesta approvata e' un vincolo — la preferenza si
  // degrada, il vincolo no, nemmeno se il turno e' gia' pagato.
  // Il controllo su `blocked` sembra ridondante, perche' piu' avanti anche
  // `codeAllowed` rifiuta ogni codice su un giorno bloccato. Non va tolto: e'
  // l'unica riga che distingue un riposo APPROVATO — che nella cella si scrive
  // 'R', identico a quello del motore — da un riposo che il motore ha messo
  // perche' oggi non serviva nessuno. La differenza non si vede nella cella, e
  // il giorno in cui `codeAllowed` cambiasse resterebbe solo questa.
  const riposoNonConcordato = (s, day) => {
    const c = constraintFor(constraints, s.id, day);
    if(c && c.blocked) return false;
    const cell = assigned[s.id][day];
    return !cell || cell === REST_CODE;
  };
  // Quante persone stanno gia' coprendo QUEL servizio su QUELLA stazione, viste
  // dal prospetto FINITO — comprese quelle che ci arrivano di rimbalzo. Si
  // guarda il prospetto e non il `remain` del momento in cui si assegnava:
  // quello e' un numero vecchio, il riempimento finale puo' averlo gia' chiuso,
  // e fidarsene rimetterebbe dentro proprio la sovracopertura appena tolta.
  // La stazione si guarda SUL SERVIZIO: chi a pranzo sta ai primi e a cena al
  // pass e' presente su due partite diverse, e sommarlo su entrambe in tutti e
  // due i servizi direbbe che le giornate sono piu' coperte di quanto sono.
  const presenzeSu = (day, sv, st) => staffList.filter(s2=>{
    const st0 = (stationAssign[s2.id][day]||{})[sv];
    if(!st0 || !coperteDa(st0).includes(st)) return false;
    return (CODE_TO_SERVICES[assigned[s2.id][day]]||[]).includes(sv);
  }).length;
  // Le TESTE su una partita in giornata: una persona conta una volta sola anche
  // se ci sta su due servizi.
  const testeSu = (day, st) => staffList.filter(s2=>
    Object.keys(stationAssign[s2.id][day]||{}).some(sv=> stationAssign[s2.id][day][sv] === st)).length;
  // Il MARGINE della giornata, ed e' il criterio automatico vero. Quante altre
  // persone qualificate, non vincolate e non gia' al lavoro restano libere quel
  // giorno su quella partita. Zero riserve = giornata senza rete: se domattina
  // uno non si presenta, salta il servizio. «Quando pensa che ne servano di
  // piu'», tradotto in quello che il motore puo' davvero sapere.
  const riserveDi = (day, st, esclusoId) => staffList.filter(s2=>{
    if(s2.id === esclusoId) return false;
    if(!(s2.stations && s2.stations.includes(st))) return false;
    if(!riposoNonConcordato(s2, day)) return false;
    return WORKING_CODES.some(c=> codeAllowed(constraints, s2.id, day, c, CODE_TO_SERVICES));
  }).length;

  // La lista del titolare e' fatta di NOMI di giorno ('Sab'), ma `days` in
  // produzione sono date ISO e nei test sono nomi. Senza questa conversione
  // tollerante la funzione passerebbe i test e non farebbe niente in
  // produzione, che e' il modo peggiore di sbagliare.
  const nomeGiorno = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? dayName(d) : String(d);
  const listaGiorni = (modoEcc === 'giorni' && Array.isArray(optEcc.giorni)) ? optEcc.giorni : [];
  // Un ORDINE, non un interruttore. Con gli interruttori («Ven e Sab si', gli
  // altri no») non si sa dove va il terzo turno quando l'eccedenza e' di cinque;
  // con una lista si scorre dall'alto e si prende il primo giorno ammissibile.
  // Un giorno fuori lista non e' vietato: e' in coda, e li' decide il margine.
  const rangoGiorno = d => {
    const i = listaGiorni.indexOf(nomeGiorno(d));
    return i < 0 ? 1000 : i;
  };
  // A parita' di tutto, il giorno piu' lontano dagli altri turni della persona:
  // e' l'unico argine che oggi esiste contro sei giorni di fila. Un vincolo vero
  // sui giorni consecutivi nel motore NON c'e', e questa fase e' il primo posto
  // che lo fara' notare.
  const distanzaDaiSuoi = (s, idx) => {
    let min = 99;
    days.forEach((d, j)=>{
      if(j === idx) return;
      const cell = assigned[s.id][d];
      if(cell && WORKING_CODES.includes(cell)) min = Math.min(min, Math.abs(j - idx));
    });
    return min;
  };
  const minore = chiaveMinore;   // stessa regola del piano, scritta una volta sola

  // I DUE TETTI stanno tutti qui dentro, ed e' voluto: sono la ragione per cui
  // questa fase non costa niente. 1) il pool — si colloca solo quota che esiste
  // davvero e non e' stata spesa; 2) le ore contrattuali.
  const scegliSlot = (s, day, ammesso) => {
    if(!riposoNonConcordato(s, day)) return null;
    const tetto = tettoOre(s);
    let best = null;
    slotDiLavoro(s).forEach(({i, slot})=>{
      slot.codes.forEach(c=>{
        if(!WORKING_CODES.includes(c)) return;
        if(!codeAllowed(constraints, s.id, day, c, CODE_TO_SERVICES)) return;
        if(oreFatte[s.id] + oreDi(c) > tetto + 1e-9){ segnaMotivo(s, 'ore'); return; }
        if(!ammesso(c)) return;
        // A parita' di ammissibilita': il turno piu' corto, e lo slot meno
        // versatile. Il lungo e lo slot jolly restano per dove servono davvero.
        if(!best || oreDi(c) < best.ore
           || (oreDi(c) === best.ore && slot.codes.length < best.varianti)){
          best = {slotIdx:i, code:c, ore:oreDi(c), varianti:slot.codes.length};
        }
      });
    });
    return best;
  };
  const collocaSu = (s, day, st, code, slotIdx, origine) => {
    pools[s.id].splice(slotIdx, 1);
    assigned[s.id][day] = code;
    // L'eccedenza si colloca su UNA partita: la stessa per tutti i servizi che
    // il codice copre. E' una giornata in piu' su una partita che ne aveva
    // bisogno, non un giro di due partite.
    const m = {};
    (CODE_TO_SERVICES[code]||[]).forEach(sv2=>{ m[sv2] = st; });
    stationAssign[s.id][day] = m;
    origineFlag[s.id][day] = origine;
    oreFatte[s.id] += oreDi(code);
  };

  if(collocaAttiva){
    // ---- LA COLLOCAZIONE --------------------------------------------------
    // Qui il fabbisogno e' gia' chiuso e la persona in piu' e' una SCELTA: per
    // questo, e solo qui, il turno si conta come ECCEDENZA e non come copertura.
    const miglioreCollocazione = (s)=>{
      let best = null;
      days.forEach((day, idx)=>{
        if(!riposoNonConcordato(s, day)) return;
        (s.stations||[]).forEach(st=>{
          let serviziUtili = null;
          const sc = scegliSlot(s, day, c=>{
            const utili = (CODE_TO_SERVICES[c]||[]).filter(sv=> ((richiesti[sv]||{})[st]||0) > 0);
            // Un turno su una partita che quel servizio non lo chiede non copre
            // niente: e' il turno finto che si e' appena tolto di mezzo, e
            // rimetterlo dentro con un'altra etichetta sarebbe tornare indietro.
            if(!utili.length){ segnaMotivo(s, 'inutile'); return false; }
            const ok = utili.every(sv=>
              (presenzeSu(day, sv, st) - (richiesti[sv][st]||0)) < maxPerGiorno);
            if(!ok){ segnaMotivo(s, 'freno'); return false; }
            serviziUtili = utili;
            return true;
          });
          if(!sc) return;
          const chiave = [
            rangoGiorno(day),            // la lista del titolare, se c'e'
            riserveDi(day, st, s.id),    // meno margine di errore: e' qui che serve
            testeSu(day, st),            // meno teste su quella partita
            -distanzaDaiSuoi(s, idx),    // lontano dagli altri suoi turni
            prioritaDi(s, st),           // la sua partita di casa
            sc.ore,
            rand(),                      // seminato: due generazioni uguali restano uguali
          ];
          if(!best || minore(chiave, best.chiave)){
            best = {day, stationId:st, code:sc.code, slotIdx:sc.slotIdx, ore:sc.ore,
              service:(serviziUtili||[])[0]||null, chiave,
              criterio: rangoGiorno(day) < 1000
                ? ('giorno scelto: ' + nomeGiorno(day))
                : 'automatico: dove c\'erano meno riserve'};
          }
        });
      });
      return best;
    };
    // A giro, un turno per persona per volta: prendendo da una persona tutto
    // quello che ha prima di passare alla successiva, la prima si porterebbe via
    // i giorni scarsi di margine e le altre resterebbero a casa. E' lo stesso
    // motivo per cui gli extra si spargono invece di accumularsi su una testa.
    let mosso = true;
    while(mosso){
      mosso = false;
      const giro = staffList.filter(s=> s.stations && s.stations.length && slotDiLavoro(s).length);
      shuffleArray(giro, rand);
      giro.sort((a,b)=> slotDiLavoro(b).length - slotDiLavoro(a).length);
      for(const s of giro){
        const m = miglioreCollocazione(s);
        if(!m) continue;
        collocaSu(s, m.day, m.stationId, m.code, m.slotIdx, 'eccedenza');
        eccedenzeCollocate.push({day:m.day, staffId:s.id, staffName:s.name,
          stationId:m.stationId, service:m.service, code:m.code, ore:m.ore,
          criterio:m.criterio, oreNonVerificate:senzaOre(s)});
        mosso = true;
      }
    }
  }

  const newShifts = {};
  staffList.forEach(s=>{
    newShifts[s.id] = {};
    // La cella si compone passando da `normalizzaCella`, mai a mano: e' l'unico
    // punto che riempie la mappa servizio → stazione e che riscrive `stationId`
    // come campo derivato. Composta a mano, i due divergerebbero al primo
    // ritocco e allora il campo vecchio sarebbe peggio di niente.
    days.forEach(day=> newShifts[s.id][day] = normalizzaCella({
      code: assigned[s.id][day]||'',
      stations: {...(stationAssign[s.id][day]||{})},
      extra: !!extraFlag[s.id][day],
      origine: origineFlag[s.id][day] || 'copertura',
    }, cfg));
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
  // Dopo la fase 3 qui resta solo cio' che NON si e' potuto collocare, e il
  // motivo va detto per nome: «sabato e venerdi' erano i giorni scelti, ma
  // Rakib e' in ferie» si legge, «restano 8 ore» no.
  const motivoDi = s => {
    if(!collocaAttiva) return 'collocazione non attiva';
    const p = perche[s.id] || {};
    if(p.ore)   return 'ore contrattuali raggiunte';
    if(p.freno) return 'le giornate erano gia\' coperte';
    return 'nessun giorno ammissibile';
  };
  const quotaNonSpesa = staffList
    .map(s=> ({
      staffId: s.id, staffName: s.name,
      turni: (pools[s.id]||[]).filter(slot=>
        slot.codes.some(c=> WORKING_CODES.includes(c))).length,
      motivo: motivoDi(s),
      // Senza ore contrattuali il secondo tetto non esiste e il controllo non
      // si e' potuto fare. Va detto: un part-time con quote generose diventa
      // altrimenti un extra travestito e nessuno se ne accorge.
      oreNonVerificate: senzaOre(s),
    }))
    .filter(x=> !nonPianificabili.some(np=> np.staffId === x.staffId))
    .filter(x=> x.turni > 0);
  // REGOLA DA NON DIMENTICARE FRA SEI MESI: `extras` ed `eccedenzeCollocate`
  // non stanno MAI nello stesso conteggio, e chi scrive il riepilogo deve
  // tenerli in due riquadri separati. Il primo e' lavoro FUORI quota, e costa
  // di piu'; il secondo sono ore gia' in busta paga portate in cucina. Sommarli
  // vuol dire dire allo chef che ha speso il doppio di quello che ha speso.
  // E la sovracopertura si misura solo sulle celle con `origine === 'copertura'`:
  // contando anche le eccedenze, il numero che dimostra la copertura esatta
  // tornerebbe sporco e nessuno saprebbe piu' leggere una regressione vera.
  return { newShifts, shortfalls, extras, nonPianificabili, quotaNonSpesa,
           eccedenzeCollocate };
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
  const eccedenzeCollocate = [];
  const nonSpesaPerPersona = {}, motivoPerPersona = {};
  staffList.forEach(s=>{ newShifts[s.id] = {}; });

  groupByWeek(dates).forEach((settimana, i)=>{
    const res = computeShifts(staffList, staffingNeeds, {
      config: options.config, days: settimana, constraints: options.constraints,
      maxExtraPerPersona: options.maxExtraPerPersona,
      stazioni: options.stazioni,
      // La fase 3 gira DENTRO ogni settimana, sul residuo di quella settimana:
      // le quote sono settimanali e un turno non collocato a settembre non si
      // recupera a ottobre.
      eccedenza: options.eccedenza,
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
      if(!motivoPerPersona[q.staffId]) motivoPerPersona[q.staffId] = q.motivo;
    });
    // Le eccedenze si sommano fra le settimane come la quota non spesa, per lo
    // stesso motivo: sono fatti di settimane diverse, non lo stesso fatto.
    eccedenzeCollocate.push(...(res.eccedenzeCollocate||[]));
  });

  // Non dipende dalla settimana: si calcola una volta sola, altrimenti la
  // stessa persona comparirebbe nel riepilogo una volta per settimana.
  const nonPianificabili = staffList
    .filter(s=> !(s.stations && s.stations.length))
    .map(s=> ({staffId:s.id, staffName:s.name, motivo:'nessuna stazione'}));

  const quotaNonSpesa = staffList
    .map(s=> ({staffId:s.id, staffName:s.name, turni: nonSpesaPerPersona[s.id]||0,
      motivo: motivoPerPersona[s.id] || 'collocazione non attiva',
      oreNonVerificate: !(parseFloat(s.hours) > 0)}))
    // Chi non ha stazioni e' gia' dichiarato in `nonPianificabili`, con il suo
    // motivo vero. Ricomparire qui gli attribuirebbe un motivo diverso e falso
    // — «il fabbisogno non li chiedeva» — e il riepilogo direbbe due cose
    // sulle stesse due persone, una delle quali sbagliata.
    .filter(x=> !nonPianificabili.some(np=> np.staffId === x.staffId))
    .filter(x=> x.turni > 0);

  return { newShifts, shortfalls, extras, nonPianificabili, quotaNonSpesa,
           eccedenzeCollocate };
}

// ============================================================================
// LE BOZZE — l'idea e' dello chef: "se il generatore prima di compilare i turni
// si facesse lui dei preturni mentali e poi va a modificare quelli aggiustandoli
// secondo le regole e solo dopo li mostra? magari riesce a essere piu' accurato,
// anche se invece di un nanosecondo ci impiega 5 secondi non e' un problema".
//
// E' esattamente la cosa giusta, e risolve tre difetti che il giro singolo non
// sapeva risolvere:
//   - i turni erano sempre uguali (6 prospetti diversi su 20 generazioni);
//   - usciva sempre "SP SP SP P P R R": tre spezzati di fila a cinque persone
//     su tredici, ogni volta, perche' a inizio settimana entrambi i servizi
//     sono scoperti e lo spezzato ne chiude due;
//   - i riposi cadevano sempre negli stessi giorni.
// Nessuno di questi si vede guardando UNA giornata: si vedono solo guardando la
// settimana finita. Ed e' per questo che il posto giusto dove correggerli e'
// qui, dopo, e non dentro il giro dei giorni.
//
// Il motore non si tocca: resta quello che disegna la bozza. Qui si disegnano
// tante bozze e si tiene la piu' bella.
// ============================================================================

// Quanto e' brutto un prospetto. Piu' basso, meglio e'. I pesi non sono
// opinioni: separano cio' che e' SBAGLIATO da cio' che e' solo SPIACEVOLE, e
// una scopertura non deve mai essere barattata con tre spezzati di fila.
function punteggioProspetto(newShifts, staffList, staffingNeeds, cfg, extra){
  const { serviceIds, codeToServices, workingCodes, turnoDef } = cfg;
  const attivi = staffList.filter(s=> s.stations && s.stations.length);
  const giorni = attivi.length ? Object.keys(newShifts[attivi[0].id] || {}) : [];
  let scoperti = 0, sovra = 0;
  giorni.forEach(d=>{
    serviceIds.forEach(sv=>{
      const conta = {};
      staffList.forEach(p=>{
        const c = newShifts[p.id] && newShifts[p.id][d]; if(!c) return;
        if(!(codeToServices[c.code]||[]).includes(sv)) return;
        const st = stazioneDi(c, sv); if(st) conta[st] = (conta[st]||0) + 1;
      });
      (staffingNeeds[sv]||[]).forEach(n=>{
        const q = conta[n.stationId] || 0, chiede = parseInt(n.count)||0;
        if(q < chiede) scoperti += chiede - q;
        if(q > chiede) sovra += q - chiede;
      });
    });
  });
  // Spezzati di fila e riposi: le due cose che lo chef ha chiesto di limare.
  let filaSP = 0;
  attivi.forEach(p=>{
    let cur = 0;
    giorni.forEach(d=>{
      const c = newShifts[p.id][d] || {};
      const accorpato = (codeToServices[c.code]||[]).length > 1;
      if(accorpato){ cur++; if(cur >= 3) filaSP++; } else cur = 0;
    });
  });
  // Quanto sono sbilanciati i riposi fra un giorno e l'altro: sei persone a
  // riposo un giorno e due il giorno dopo e' proprio cio' che lo chef non vuole.
  const perGiorno = giorni.map(d=> attivi.filter(p=>
    !workingCodes.includes((newShifts[p.id][d]||{}).code)).length);
  const squilibrio = perGiorno.length ? Math.max(...perGiorno) - Math.min(...perGiorno) : 0;
  // Ore: a parita' di tutto, meglio un prospetto che non fa lavorare uno il
  // doppio dell'altro fra pari contratto.
  const ore = attivi.map(p=> giorni.reduce((n,d)=>
    n + ((turnoDef[(newShifts[p.id][d]||{}).code]||{}).hours || 0), 0));
  const scartoOre = ore.length ? Math.max(...ore) - Math.min(...ore) : 0;

  return {
    totale: scoperti*1000 + sovra*1000 + (extra||0)*100
          + filaSP*12 + squilibrio*8 + scartoOre*0.2,
    scoperti, sovra, extra: extra||0, filaSP, squilibrio, scartoOre,
  };
}

// LO SCAMBIO CHE NON TOCCA LA COPERTURA.
//
// Tre spezzati di fila non sono una scelta del motore: sono nella quota che il
// titolare ha impostato (3 SP a testa) e servono tutti, perche' ogni partita ha
// due persone per coprire quattordici posti. Provato: rinunciare a un accorpato
// apre quasi sempre una scopertura, e infatti una manopola che ci provava non
// cambiava niente nemmeno spinta a 0,8.
//
// Quello che si puo' cambiare e' SU QUALI GIORNI cadono. E c'e' una mossa che
// lo fa senza rischiare niente: scambiare fra loro le celle di DUE PERSONE
// NELLO STESSO GIORNO. Se lavorano sulla stessa partita, quel giorno la partita
// vede esattamente gli stessi turni di prima — la copertura non cambia di una
// virgola, per costruzione, non per fortuna. Cambia solo CHI fa cosa, e quindi
// la forma della settimana di ciascuno.
//
// Cosi' si sciolgono le file di spezzati e i riposi non cadono sempre addosso
// alle stesse persone negli stessi giorni: due generazioni danno due prospetti
// diversi, che e' l'altra cosa chiesta.
function scambiabili(a, b, cellaA, cellaB, cfg){
  if(a.id === b.id) return false;
  // Ferie, malattia e riposi concordati non si scambiano: sono accordi presi.
  const fisso = c => !!(c && c.code && SPECIAL_CODES[c.code] && c.code !== REST_CODE);
  if(fisso(cellaA) || fisso(cellaB)) return false;
  // Ognuno dei due deve poter fare il turno dell'altro: le stazioni scritte
  // nella cella devono essere fra quelle che sa fare.
  const sa = (p, cella) => {
    if(!cella || !cella.code) return true;
    const st = stazioniDi(cella, cfg);
    return st.every(x=> (p.stations||[]).includes(x));
  };
  return sa(a, cellaB) && sa(b, cellaA);
}

// Prova scambi a caso e tiene solo quelli che migliorano il punteggio. E' la
// parte "poi va a modificare quelli aggiustandoli" dell'idea dello chef.
function aggiustaProspetto(newShifts, staffList, staffingNeeds, cfg, extra, rand, passate){
  const attivi = staffList.filter(s=> s.stations && s.stations.length);
  if(attivi.length < 2) return newShifts;
  const giorni = Object.keys(newShifts[attivi[0].id] || {});
  if(!giorni.length) return newShifts;
  let corrente = punteggioProspetto(newShifts, staffList, staffingNeeds, cfg, extra).totale;
  for(let n=0; n<passate; n++){
    const d = giorni[Math.floor(rand()*giorni.length)];
    const a = attivi[Math.floor(rand()*attivi.length)];
    const b = attivi[Math.floor(rand()*attivi.length)];
    const ca = newShifts[a.id][d], cb = newShifts[b.id][d];
    if(!scambiabili(a, b, ca, cb, cfg)) continue;
    newShifts[a.id][d] = cb; newShifts[b.id][d] = ca;
    const dopo = punteggioProspetto(newShifts, staffList, staffingNeeds, cfg, extra).totale;
    if(dopo < corrente) corrente = dopo;
    else { newShifts[a.id][d] = ca; newShifts[b.id][d] = cb; }   // peggiora: si torna indietro
  }
  return newShifts;
}

// Disegna `tentativi` bozze e restituisce la piu' bella. Il seme cambia a ogni
// bozza E a ogni chiamata: due click sul bottone danno due prospetti diversi,
// che e' l'altra cosa che lo chef ha chiesto ("se prima uno riposava lun e mar
// dopo riposa gio e ven").
function generaMigliore(staffList, staffingNeeds, options){
  const tentativi = Math.max(1, parseInt(options.tentativi) || 1);
  const cfg = options.config || buildShiftConfig(null, null);
  const radice = (options.seed != null) ? semeNumerico(options.seed)
                                        : Math.floor(Math.random() * 2147483647);
  let migliore = null, punteggioMigliore = null, provati = [];
  for(let i=0; i<tentativi; i++){
    const r = computeShiftsForDates(staffList, staffingNeeds,
      Object.assign({}, options, { seed: radice + i * 7919 }));
    // Prima si aggiusta la bozza con gli scambi, poi la si giudica: giudicarla
    // com'e' uscita vorrebbe dire scartare bozze che due scambi renderebbero
    // le migliori del mazzo.
    aggiustaProspetto(r.newShifts, staffList, staffingNeeds, cfg, r.extras.length,
                      Math.random, options.scambi != null ? options.scambi : 400);
    const p = punteggioProspetto(r.newShifts, staffList, staffingNeeds, cfg, r.extras.length);
    provati.push(p.totale);
    if(!punteggioMigliore || p.totale < punteggioMigliore.totale){
      migliore = r; punteggioMigliore = p;
    }
  }
  return Object.assign({}, migliore, {
    punteggio: punteggioMigliore,
    bozzeProvate: tentativi,
    // Serve a capire se aumentare i tentativi porterebbe ancora qualcosa: se
    // il peggio e il meglio coincidono, il motore non sta esplorando niente e
    // il numero di bozze e' fiato sprecato.
    punteggioPeggiore: Math.max(...provati),
  });
}

export {
  DAYS,
  SPECIAL_CODES,
  REST_CODE,
  DEFAULT_SERVICES,
  DEFAULT_SHIFT_TYPES,
  buildShiftConfig,
  serviziDelCodice,
  stazioneDi,
  stazioniDi,
  normalizzaCella,
  assegnaStazione,
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
  punteggioProspetto,
  generaMigliore,
};
