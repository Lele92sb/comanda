// ============================================================================
// Comanda — motore di generazione turni (logica pura, senza DOM/storage)
// Funziona sia nel browser (incluso via <script>) sia in Node (per i test).
// Qualunque modifica a questo file richiede che la test suite in /tests passi.
// ============================================================================
(function(root, factory){
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    Object.assign(root, factory());
  }
})(typeof self !== 'undefined' ? self : this, function(){

const DAYS = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];
const TURNO_DEF = {
  '':  {label:'—', hours:0},
  'C': {label:'C · Colazione 7:30–15:00', hours:7.5},
  'P': {label:'P · Pranzo 9:00–17:00', hours:8},
  'S': {label:'S · Cena 15:00–23:00', hours:8},
  'SP':{label:'SP · Spezzato 10–16 / 18–23', hours:11},
  'R': {label:'R · Riposo', hours:0},
  'M': {label:'M · Malattia', hours:0},
  'F': {label:'F · Ferie', hours:0},
};
const WORKING_CODES = ['C','P','S','SP'];
const SERVICES = ['colazione','pranzo','cena'];
const SERVICE_LABELS = {colazione:'Colazione', pranzo:'Pranzo', cena:'Cena'};
// quali servizi copre fisicamente ogni tipo di turno (lo spezzato copre due servizi con la stessa persona)
const CODE_TO_SERVICES = { C:['colazione'], P:['pranzo'], S:['cena'], SP:['pranzo','cena'] };
const SERVICE_CODES = { colazione:['C'], pranzo:['P','SP'], cena:['S','SP'] };
const MAIN_CODE = { colazione:'C', pranzo:'P', cena:'S' };

function shuffleArray(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }

function buildStaffPools(staffList){
  const pools = {};
  staffList.forEach(s=>{
    let slots = [];
    (s.weeklyQuota||[]).forEach(g=>{
      for(let k=0;k<(parseInt(g.count)||0);k++){ slots.push({codes:(g.codes&&g.codes.length)?g.codes.slice():['R']}); }
    });
    while(slots.length<7) slots.push({codes:['R']});
    if(slots.length>7) slots = slots.slice(0,7);
    pools[s.id] = shuffleArray(slots);
  });
  return pools;
}

function computeShifts(staffList, staffingNeeds){
  const pools = buildStaffPools(staffList);
  const assigned = {}, stationAssign = {}, extraFlag = {};
  staffList.forEach(s=>{ assigned[s.id]={}; stationAssign[s.id]={}; extraFlag[s.id]={}; });
  const shortfalls = [];
  const extras = [];

  DAYS.forEach(day=>{
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
            return pools[s.id].some(slot=> slot.codes.some(c=>SERVICE_CODES[sv].includes(c)));
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
          const otherSv = sv==='pranzo' ? 'cena' : (sv==='cena' ? 'pranzo' : null);
          const otherStillNeeded = otherSv && remain[otherSv] && (remain[otherSv][stationId]||0) > 0;
          let code;
          if(isExtra){
            // nessuno slot di quota compatibile disponibile: si assegna comunque il turno giusto,
            // segnato come extra, senza consumare la quota (che è già esaurita).
            code = (otherStillNeeded) ? 'SP' : MAIN_CODE[sv];
          } else {
            const matchIdx = [];
            pool.forEach((slot,i)=>{ if(slot.codes.some(c=>SERVICE_CODES[sv].includes(c))) matchIdx.push(i); });
            matchIdx.sort((a,b)=> pool[a].codes.length - pool[b].codes.length);
            const slotIdx = matchIdx[0];
            const slot = pool[slotIdx];
            if(otherStillNeeded && slot.codes.includes('SP')) code = 'SP';
            else if(slot.codes.includes(MAIN_CODE[sv])) code = MAIN_CODE[sv];
            else code = slot.codes.find(c=>SERVICE_CODES[sv].includes(c));
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
          // turni di lavoro preziosi (specialmente Spezzato) in giorni dove non servono.
          const valueOf = slot=>{
            if(slot.codes.length===1 && slot.codes[0]==='R') return 0;
            if(slot.codes.includes('SP')) return 3;
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
          assigned[s.id][day] = 'R';
        }
      }
    });
  });

  const newShifts = {};
  staffList.forEach(s=>{
    newShifts[s.id] = {};
    DAYS.forEach(day=> newShifts[s.id][day] = { code: assigned[s.id][day]||'', stationId: stationAssign[s.id][day]||null, extra: !!extraFlag[s.id][day] });
  });
  return { newShifts, shortfalls, extras };
}

return { DAYS, TURNO_DEF, WORKING_CODES, SERVICES, SERVICE_LABELS, CODE_TO_SERVICES, SERVICE_CODES, MAIN_CODE,
         shuffleArray, buildStaffPools, computeShifts };
});
