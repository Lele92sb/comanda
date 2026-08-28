import { Cloud, storageGet, storageSet } from '../lib/cloud.js';
import { DAYS, DEFAULT_SERVICES, DEFAULT_SHIFT_TYPES, buildShiftConfig, monthDates, parseISO, weekDates } from '../lib/logic.js';
/* ============================= STATE ============================= */
export const STORE_KEYS = ['ingredients','subrecipes','recipes','menus','staff','shifts','knowledge','chatHistory','wellbeing','suppliers','stations','staffingNeeds','services','shiftTypes','importedInvoices'];
export let state = { ingredients:[], subrecipes:[], recipes:[], menus:[], staff:[], shifts:{}, knowledge:[], chatHistory:[], wellbeing:[], suppliers:[], stations:[], staffingNeeds:{}, services:[], shiftTypes:[], importedInvoices:[] };

export const ALLERGENS = ["Glutine","Crostacei","Uova","Pesce","Arachidi","Soia","Latte","Frutta a guscio","Sedano","Senape","Sesamo","Solfiti","Lupini","Molluschi"];
// Periodo mostrato nella pianificazione: una settimana o un mese, ancorato a una
// data. I turni sono salvati per data, quindi spostarsi nel tempo non perde nulla.
//
// Si leggono da fuori ma si cambiano solo da qui: in un modulo ES una variabile
// importata è di sola lettura per chi la importa, quindi il cambio passa da
// queste due funzioni invece che da un'assegnazione diretta.
export let periodMode = 'settimana';
export let periodAnchor = new Date();
export function setPeriodMode(m){ periodMode = m; }
export function setPeriodAnchor(d){ periodAnchor = d; }
export function periodDates(){
  return periodMode === 'mese' ? monthDates(periodAnchor) : weekDates(periodAnchor);
}
export function periodLabel(){
  const d = periodDates();
  if(periodMode === 'mese'){
    return periodAnchor.toLocaleDateString('it-IT', {month:'long', year:'numeric'});
  }
  const fmt = iso => parseISO(iso).toLocaleDateString('it-IT', {day:'numeric', month:'short'});
  return fmt(d[0]) + ' – ' + fmt(d[6]);
}
export function shiftPeriod(delta){
  const d = new Date(periodAnchor);
  if(periodMode === 'mese') d.setMonth(d.getMonth() + delta);
  else d.setDate(d.getDate() + 7*delta);
  periodAnchor = d;
}

// I servizi e i turni non sono più fissi: ogni cucina ha i suoi. Questa funzione
// ricalcola le tabelle di consultazione a partire dalla configurazione salvata,
// e va richiamata ogni volta che servizi o tipi di turno cambiano.
let SHIFT_CFG = buildShiftConfig(null, null);
export function refreshShiftConfig(){
  SHIFT_CFG = buildShiftConfig(state.services, state.shiftTypes);
  return SHIFT_CFG;
}
// Scorciatoie leggibili nel resto dell'app. Sono funzioni, non costanti, perché
// il loro contenuto cambia quando lo chef modifica la configurazione.
export const SERVICES       = () => SHIFT_CFG.serviceIds;
export const SERVICE_LABEL  = id => SHIFT_CFG.serviceLabels[id] || id;
export const TURNO_DEF      = () => SHIFT_CFG.turnoDef;
export const WORKING_CODES  = () => SHIFT_CFG.workingCodes;
export const CODE_LABEL     = code => (SHIFT_CFG.turnoDef[code] || {label: code||'—'}).label;
export const CODE_HOURS     = code => (SHIFT_CFG.turnoDef[code] || {hours:0}).hours || 0;

export function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

// storageGet / storageSet arrivano da cloud.js: a seconda della configurazione
// parlano con localStorage (modalità locale) o con il database della cucina
// (modalità cloud). Il resto dell'app non deve sapere quale delle due.

export async function loadAll(){
  for(const k of STORE_KEYS){ const v = await storageGet(k); if(v !== null) state[k] = v; }
  migrateData();
}
export async function save(key){
  const ok = await storageSet(key, state[key]);
  // Il conflitto si spiega da solo (vedi Cloud.onConflict): non coprirlo.
  if(!ok && Cloud.lastFailure !== 'conflict'){
    toast(Cloud.lastFailure === 'readonly'
      ? 'Sei in sola lettura: modifica non salvata'
      : 'Salvataggio non riuscito');
  }
  return ok;
}

export function migrateData(){
  // vecchie ricette con schema {ingredients:[{name,qty,unit,cost}], price}
  state.recipes = (state.recipes||[]).map(r=>{
    if(r.items) return r;
    return {
      id: r.id, name: r.name, category: r.category||'',
      items: (r.ingredients||[]).map(i=>({kind:'custom', name:i.name, qty:i.qty, unit:i.unit, cost:i.cost})),
      portionG: '', foodCostTargetPct: 30, priceActual: r.price||'',
      allergens: r.allergens||[], steps: r.steps||''
    };
  });
  // vecchi turni con array multiplo ['m','p'] -> stringa singola
  Object.keys(state.shifts||{}).forEach(staffId=>{
    Object.keys(state.shifts[staffId]||{}).forEach(day=>{
      const v = state.shifts[staffId][day];
      if(Array.isArray(v)){
        const map = {m:'C', p:'P', s:'S'};
        state.shifts[staffId][day] = { code: v.length>1 ? 'SP' : (map[v[0]]||''), stationId:null };
      } else if(typeof v === 'string'){
        state.shifts[staffId][day] = { code: v, stationId:null };
      }
    });
  });
  state.staff.forEach(s=>{ if(!s.stations) s.stations=[]; if(!s.weeklyQuota) s.weeklyQuota=[]; });
  // vecchio fabbisogno indicizzato per turno (C/P/S/SP) -> nuovo indicizzato per servizio (colazione/pranzo/cena)
  if(state.staffingNeeds && (state.staffingNeeds.C || state.staffingNeeds.P || state.staffingNeeds.S || state.staffingNeeds.SP)){
    const old = state.staffingNeeds;
    state.staffingNeeds = {
      colazione: old.C || [],
      pranzo: [...(old.P||[]), ...(old.SP||[])],
      cena: [...(old.S||[]), ...(old.SP||[])],
    };
  }
  // I turni erano indicizzati per nome del giorno ("Lun"), quindi esisteva una
  // sola settimana senza sapere quale. Ora sono indicizzati per data: i dati
  // esistenti vengono riportati sulla settimana corrente, che è l'unica
  // interpretazione possibile di una griglia che non porta con sé una data.
  const settimanaCorrente = weekDates(new Date());
  Object.keys(state.shifts||{}).forEach(staffId=>{
    const giorni = state.shifts[staffId] || {};
    const vecchie = Object.keys(giorni).filter(k=> DAYS.includes(k));
    if(!vecchie.length) return;
    vecchie.forEach(nomeGiorno=>{
      const iso = settimanaCorrente[DAYS.indexOf(nomeGiorno)];
      giorni[iso] = giorni[nomeGiorno];
      delete giorni[nomeGiorno];
    });
  });

  // Servizi e tipi di turno erano cablati nel codice: chi ha già dati si
  // ritroverebbe la configurazione vuota, quindi gli si ricrea quella di prima.
  // Da qui in poi sono modificabili come qualsiasi altro dato della cucina.
  if(!state.services || !state.services.length){
    state.services = DEFAULT_SERVICES.map(s=>({...s}));
  }
  if(!state.shiftTypes || !state.shiftTypes.length){
    state.shiftTypes = DEFAULT_SHIFT_TYPES.map(t=>({id:uid(), ...t}));
  }
  state.shiftTypes.forEach(t=>{ if(!t.id) t.id = uid(); });
  refreshShiftConfig();

  if(!state.staffingNeeds) state.staffingNeeds = {};
  SERVICES().forEach(sv=>{ if(!state.staffingNeeds[sv]) state.staffingNeeds[sv]=[]; });
}

/* ============================= FINESTRE DI DIALOGO =============================
   Sostituiscono confirm() e prompt() del browser. Quelle bloccano l'intera
   pagina, non seguono lo stile dell'app, non sono traducibili, e in alcuni
   contesti (anteprime, webview, iframe con restrizioni) vengono soppresse: il
   pulsante sembra semplicemente rotto. Queste restituiscono una promessa.
   ============================================================================ */
function apriDialogo({titolo, testo, campo, valore, conferma, annulla, pericolo}){
  return new Promise(resolve=>{
    const back = document.createElement('div');
    back.className = 'dialog-backdrop';
    back.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(titolo)}">
        <h3>${esc(titolo)}</h3>
        ${testo ? `<p>${esc(testo)}</p>` : ''}
        ${campo ? `<label>${esc(campo)}</label><input type="text" id="dlg-input" value="${esc(valore||'')}">` : ''}
        <div class="dialog-actions">
          <button class="btn ghost" data-no>${esc(annulla || 'Annulla')}</button>
          <button class="btn" data-yes ${pericolo?'style="background:var(--alert);color:var(--paper);"':''}>${esc(conferma || 'Conferma')}</button>
        </div>
      </div>`;
    document.body.appendChild(back);
    const input = back.querySelector('#dlg-input');
    if(input){ input.focus(); input.select(); }
    else back.querySelector('[data-yes]').focus();

    const chiudi = esito => { document.removeEventListener('keydown', tasti, true); back.remove(); resolve(esito); };
    const conferma_ = () => chiudi(campo ? (input.value) : true);
    // Esc annulla, Invio conferma: le stesse abitudini delle finestre di sistema.
    const tasti = e => {
      if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); chiudi(campo ? null : false); }
      if(e.key === 'Enter' && (campo || document.activeElement === back.querySelector('[data-yes]'))){
        e.preventDefault(); e.stopPropagation(); conferma_();
      }
    };
    document.addEventListener('keydown', tasti, true);
    back.querySelector('[data-yes]').addEventListener('click', conferma_);
    back.querySelector('[data-no]').addEventListener('click', ()=> chiudi(campo ? null : false));
    // Un clic fuori dal riquadro equivale ad annullare.
    back.addEventListener('click', e=>{ if(e.target === back) chiudi(campo ? null : false); });
  });
}
// Ritorna true/false. `pericolo` colora di rosso il pulsante che conferma.
export const conferma = (titolo, testo, opzioni={}) =>
  apriDialogo({titolo, testo, conferma: opzioni.conferma, annulla: opzioni.annulla, pericolo: opzioni.pericolo});
// Ritorna il testo scritto, oppure null se annullato.
export const chiediTesto = (titolo, campo, valore, testo) =>
  apriDialogo({titolo, testo, campo, valore, conferma:'Salva'});

export function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(()=>t.classList.remove('show'), 2200);
}
export function esc(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
