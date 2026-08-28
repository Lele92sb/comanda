// ============================================================================
// Comanda — motore di generazione turni (logica pura, senza DOM/storage)
// Funziona sia nel browser (incluso via <script>) sia in Node (per i test).
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
(function(root, factory){
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    Object.assign(root, factory());
  }
})(typeof self !== 'undefined' ? self : this, function(){

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

function shuffleArray(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }

function buildStaffPools(staffList){
  const pools = {};
  staffList.forEach(s=>{
    let slots = [];
    (s.weeklyQuota||[]).forEach(g=>{
      for(let k=0;k<(parseInt(g.count)||0);k++){ slots.push({codes:(g.codes&&g.codes.length)?g.codes.slice():[REST_CODE]}); }
    });
    while(slots.length<7) slots.push({codes:[REST_CODE]});
    if(slots.length>7) slots = slots.slice(0,7);
    pools[s.id] = shuffleArray(slots);
  });
  return pools;
}

function computeShifts(staffList, staffingNeeds, options){
  options = options || {};
  const cfg = options.config || buildShiftConfig(null, null);
  const SERVICES = cfg.serviceIds;
  const { serviceCodes: SERVICE_CODES, codeToServices: CODE_TO_SERVICES,
          mainCode: MAIN_CODE, workingCodes: WORKING_CODES } = cfg;
  const days = options.days || DAYS;

  const pools = buildStaffPools(staffList);
  const assigned = {}, stationAssign = {}, extraFlag = {};
  staffList.forEach(s=>{ assigned[s.id]={}; stationAssign[s.id]={}; extraFlag[s.id]={}; });
  const shortfalls = [];
  const extras = [];

  days.forEach(day=>{
    const remain = {};
    SERVICES.forEach(sv=>{ remain[sv]={}; (staffingNeeds[sv]||[]).forEach(n=>{ remain[sv][n.stationId]=(remain[sv][n.stationId]||0)+(parseInt(n.count)||0); }); });

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
          let candidates = staffList.filter(s=>{
            if(assigned[s.id][day]) return false;
            const qualified = (s.stations&&s.stations.length) ? s.stations.includes(stationId) : false;
            if(!qualified) return false;
            return pools[s.id].some(slot=> slot.codes.some(c=>(SERVICE_CODES[sv]||[]).includes(c)));
          });
          let isExtra = false;
          if(!candidates.length){
            // il fabbisogno supera quello che le quote possono coprire: proviamo comunque a tappare
            // il buco con un turno EXTRA (oltre quota), pescando chiunque sia qualificato e libero
            // quel giorno, invece di lasciare la postazione scoperta.
            candidates = staffList.filter(s=> !assigned[s.id][day] && s.stations && s.stations.includes(stationId));
            isExtra = true;
          }
          if(!candidates.length){
            // nessuno qualificato è libero quel giorno: qui non c'è più nulla da fare, scopertura reale.
            shortfalls.push({day, service:sv, stationId, missing:remain[sv][stationId]});
            break;
          }
          // tra i candidati, dai priorità a chi è qualificato per MENO stazioni: chi sa fare
          // solo questa va piazzato qui, chi è più "jolly" resta di riserva per coprire altrove.
          candidates = shuffleArray(candidates);
          candidates.sort((a,b)=> (a.stations?a.stations.length:999) - (b.stations?b.stations.length:999));
          const chosen = candidates[0];
          const pool = pools[chosen.id];

          // Un turno che copre più servizi conviene se ANCHE gli altri servizi che
          // copre sono ancora scoperti su questa stazione: una persona sola ne
          // chiude due. Prima era il caso particolare "pranzo + cena = spezzato".
          const codeCoversMore = code =>
            (CODE_TO_SERVICES[code]||[]).filter(sv2=> sv2!==sv && (remain[sv2]||{})[stationId] > 0).length;

          let code;
          if(isExtra){
            // nessuno slot di quota compatibile disponibile: si assegna comunque il turno giusto,
            // segnato come extra, senza consumare la quota (che è già esaurita).
            const utili = (SERVICE_CODES[sv]||[]).slice().sort((a,b)=> codeCoversMore(b) - codeCoversMore(a));
            code = (utili.length && codeCoversMore(utili[0]) > 0) ? utili[0] : (MAIN_CODE[sv] || utili[0]);
          } else {
            const matchIdx = [];
            pool.forEach((slot,i)=>{ if(slot.codes.some(c=>(SERVICE_CODES[sv]||[]).includes(c))) matchIdx.push(i); });
            matchIdx.sort((a,b)=> pool[a].codes.length - pool[b].codes.length);
            const slotIdx = matchIdx[0];
            const slot = pool[slotIdx];
            const utili = slot.codes.filter(c=>(SERVICE_CODES[sv]||[]).includes(c))
                                    .sort((a,b)=> codeCoversMore(b) - codeCoversMore(a));
            if(utili.length && codeCoversMore(utili[0]) > 0) code = utili[0];
            else if(slot.codes.includes(MAIN_CODE[sv])) code = MAIN_CODE[sv];
            else code = utili[0];
            pool.splice(slotIdx,1);
          }

          assigned[chosen.id][day] = code;
          stationAssign[chosen.id][day] = stationId;
          if(isExtra){
            extraFlag[chosen.id][day] = true;
            extras.push({day, service:sv, stationId, staffId:chosen.id, staffName:chosen.name});
          }
          remain[sv][stationId]--;
          (CODE_TO_SERVICES[code]||[]).forEach(sv2=>{
            if(sv2!==sv && remain[sv2] && remain[sv2][stationId]) remain[sv2][stationId] = Math.max(0, remain[sv2][stationId]-1);
          });
        }
      });
    });

    staffList.forEach(s=>{
      if(!assigned[s.id][day]){
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
          const slot = pools[s.id].splice(bestIdx,1)[0];
          const code = slot.codes[Math.floor(Math.random()*slot.codes.length)];
          assigned[s.id][day] = code;
          if(WORKING_CODES.includes(code)){
            const qualified = (s.stations&&s.stations.length) ? s.stations : [];
            if(qualified.length) stationAssign[s.id][day] = qualified[Math.floor(Math.random()*qualified.length)];
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
  return { newShifts, shortfalls, extras };
}

return { DAYS, SPECIAL_CODES, REST_CODE, DEFAULT_SERVICES, DEFAULT_SHIFT_TYPES,
         buildShiftConfig, shuffleArray, buildStaffPools, computeShifts };
});
