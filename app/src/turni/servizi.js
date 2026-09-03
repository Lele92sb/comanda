import { humanError } from '../account/accesso.js';
import { SERVICES, conferma, esc, refreshShiftConfig, save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { SPECIAL_CODES } from '../lib/logic.js';
import { renderNeeds } from './fabbisogno.js';
import { renderOreExtra, renderTurni } from './griglia.js';
import { renderQuotas } from './quote.js';
import { renderStations } from './stazioni.js';
import './servizi-vista.ts';
/* ============================= TURNI: servizi e tipi di turno ===============

   QUESTO FILE E' SOLO IL COLLANTE. Il disegno sta in servizi-vista.ts.
   Qui restano le cose che un componente non puo' sapere: quali sigle sono
   riservate dal motore, cosa si porta dietro la cancellazione di un servizio, e
   che una sigla cambiata va riscritta dentro i turni gia' assegnati.
   ========================================================================== */

// Ricalcola le tabelle derivate e ridisegna tutto ciò che dipende dai servizi:
// una sigla cambiata qui si vede subito nella griglia, nel fabbisogno e nelle quote.
function afterShiftConfigChange(){
  refreshShiftConfig();
  SERVICES().forEach(sv=>{ if(!state.staffingNeeds[sv]) state.staffingNeeds[sv]=[]; });
  renderServices(); renderShiftTypes(); renderNeeds(); renderQuotas(); renderTurni(); renderOreExtra();
}

const soloLettura = () => Cloud.enabled && !Cloud.canWrite();

/* ------------------------------------------------------------- I SERVIZI */

let vistaServizi = null;

export function renderServices(){
  const el = document.getElementById('service-list');
  if(!el) return;
  if(!vistaServizi || !vistaServizi.isConnected){
    vistaServizi = document.createElement('cmd-servizi');
    collegaServizi(vistaServizi);
    el.replaceChildren(vistaServizi);
  }
  vistaServizi.servizi = state.services.map(sv => ({
    id: sv.id,
    nome: sv.name,
    copertoDa: state.shiftTypes.filter(t => (t.services||[]).includes(sv.id)).map(t => t.code),
  }));
  vistaServizi.soloLettura = soloLettura();
}

function collegaServizi(v){
  v.addEventListener('servizio-nome-vuoto', ()=> toast('Serve un nome'));

  v.addEventListener('servizio-aggiungi', e => {
    state.services.push({ id: uid(), name: e.detail.nome });
    save('services'); afterShiftConfigChange(); toast('Servizio aggiunto');
  });

  v.addEventListener('servizio-rinomina', e => {
    const sv = state.services.find(x => x.id === e.detail.id);
    const nome = (e.detail.nome || '').trim();
    if(!sv) return;
    if(!nome){ toast('Il servizio deve avere un nome'); renderServices(); return; }
    if(nome === sv.name) return;
    sv.name = nome; save('services'); afterShiftConfigChange(); toast('Servizio rinominato');
  });

  v.addEventListener('servizio-sposta', e => {
    const i = state.services.findIndex(x => x.id === e.detail.id);
    const j = i + e.detail.verso;
    if(i < 0 || j < 0 || j >= state.services.length) return;
    [state.services[i], state.services[j]] = [state.services[j], state.services[i]];
    save('services'); afterShiftConfigChange();
  });

  v.addEventListener('servizio-elimina', async e => {
    const sv = state.services.find(x => x.id === e.detail.id);
    if(!sv) return;
    const turni = state.shiftTypes.filter(t=>(t.services||[]).includes(sv.id));
    const righe = (state.staffingNeeds[sv.id]||[]).length;
    const ok = await conferma(`Eliminare il servizio "${sv.name}"?`,
      (turni.length ? `Verrà tolto da ${turni.length} tipo/i di turno (${turni.map(t=>t.code).join(', ')}).\n` : '')
      + (righe ? `Verranno perse ${righe} righe di fabbisogno.\n` : '')
      + 'I turni già assegnati nella griglia restano come sono.',
      {conferma:'Elimina', pericolo:true});
    if(!ok) return;
    // Le celle dei turni restano come sono, e la stazione che avevano su questo
    // servizio resta scritta nella loro mappa. È una decisione, non una
    // dimenticanza: quella chiave diventa invisibile — chi legge una cella
    // chiede sempre i servizi che il CODICE copre, e questo non c'è più — e
    // sparisce da sola alla prossima lettura, quando `normalizzaCella` rifà la
    // mappa. Riscrivere qui tutti i turni della cucina vorrebbe dire un
    // salvataggio dell'intero blob per un cambiamento che non si vede; e se il
    // servizio viene ricreato, la stazione è ancora lì invece che persa.
    state.services = state.services.filter(x=>x.id!==sv.id);
    state.shiftTypes.forEach(t=>{ t.services = (t.services||[]).filter(x=>x!==sv.id); });
    delete state.staffingNeeds[sv.id];
    save('services'); save('shiftTypes'); save('staffingNeeds');
    afterShiftConfigChange(); toast('Servizio eliminato');
  });
}

/* --------------------------------------------------------- I TIPI DI TURNO */

/* I colori che il foglio di stile da' alle sigle predefinite. Servono come
   valore di partenza del selettore: senza, il campo si mette su nero e la prima
   modifica salverebbe quel nero anche a chi il colore non voleva cambiarlo. */
const COLORI_SIGLA = { P:'#b06b34', S:'#332c24', SP:'#6b8064', C:'#d38f57',
                       R:'#2e2a25', F:'#2e2a25', M:'#2e2a25' };
function coloreSigla(code){ return COLORI_SIGLA[code] || '#b8873f'; }

// Le sigle rifiutate, per tipo di turno. Stanno qui e non nei dati: sono un
// esito momentaneo della modifica, non una proprieta' del turno.
const erroriSigla = new Map();

let vistaTipi = null;

export function renderShiftTypes(){
  const el = document.getElementById('shifttype-list');
  if(!el) return;
  if(!vistaTipi || !vistaTipi.isConnected){
    vistaTipi = document.createElement('cmd-tipi-turno');
    collegaTipi(vistaTipi);
    el.replaceChildren(vistaTipi);
  }
  vistaTipi.servizi = state.services.map(sv => ({ id: sv.id, nome: sv.name, copertoDa: [] }));
  vistaTipi.tipi = state.shiftTypes.map(t => ({
    id: t.id,
    sigla: t.code,
    orario: t.label || '',
    ore: t.hours || 0,
    colore: t.colore || coloreSigla(t.code),
    servizi: (t.services || []).slice(),
    errore: erroriSigla.get(t.id) || '',
  }));
  vistaTipi.soloLettura = soloLettura();
}

function collegaTipi(v){
  const trova = id => state.shiftTypes.find(x => x.id === id);
  const salva = ()=>{ save('shiftTypes'); afterShiftConfigChange(); };

  v.addEventListener('turno-aggiungi', ()=>{
    // Prima sigla libera: si cambia subito, ma non blocca chi vuole solo aggiungere.
    let code = 'T1', n = 1;
    while(state.shiftTypes.some(t=>t.code===code) || SPECIAL_CODES[code]) code = 'T'+(++n);
    state.shiftTypes.push({ id: uid(), code, label:'da compilare', hours: 8, services: [] });
    save('shiftTypes'); afterShiftConfigChange(); toast('Turno aggiunto — dagli una sigla e i servizi');
  });

  v.addEventListener('turno-sigla', e => {
    const t = trova(e.detail.id);
    if(!t) return;
    const nuovo = (e.detail.sigla || '').trim().toUpperCase();
    const rifiuta = motivo => { erroriSigla.set(t.id, motivo); renderShiftTypes(); };
    if(!nuovo) return rifiuta('La sigla non può essere vuota');
    if(SPECIAL_CODES[nuovo]) return rifiuta(`"${nuovo}" è riservata (${SPECIAL_CODES[nuovo].label})`);
    if(state.shiftTypes.some(x=>x.id!==t.id && x.code===nuovo)) return rifiuta(`La sigla "${nuovo}" è già usata`);
    erroriSigla.delete(t.id);
    if(nuovo === t.code){ renderShiftTypes(); return; }
    // La sigla è salvata dentro i turni già assegnati e dentro le quote: va
    // propagata, altrimenti quei dati puntano a un turno che non esiste più.
    // La mappa servizio → stazione delle celle NON si tocca: cambiando la sigla
    // non cambiano i servizi che quel turno copre, quindi le chiavi restano
    // quelle giuste.
    const vecchio = t.code;
    t.code = nuovo;
    Object.values(state.shifts).forEach(giorni=>{
      Object.values(giorni).forEach(cell=>{ if(cell && cell.code===vecchio) cell.code = nuovo; });
    });
    state.staff.forEach(s=>(s.weeklyQuota||[]).forEach(g=>{
      g.codes = (g.codes||[]).map(c=> c===vecchio ? nuovo : c);
    }));
    save('shifts'); save('staff'); salva();
    toast(`Sigla aggiornata ovunque: ${vecchio} → ${nuovo}`);
  });

  v.addEventListener('turno-orario', e => {
    const t = trova(e.detail.id); if(!t) return;
    t.label = (e.detail.orario || '').trim(); salva();
  });

  v.addEventListener('turno-ore', e => {
    const t = trova(e.detail.id); if(!t) return;
    t.hours = e.detail.ore; salva();
  });

  v.addEventListener('turno-colore', e => {
    const t = trova(e.detail.id); if(!t) return;
    t.colore = e.detail.colore;
    save('shiftTypes'); afterShiftConfigChange(); toast(`${t.code}: colore cambiato`);
  });

  v.addEventListener('turno-servizio', e => {
    const t = trova(e.detail.id); if(!t) return;
    const attuali = t.services || [];
    t.services = e.detail.acceso
      ? attuali.concat(e.detail.servizioId).filter((x,i,a)=> a.indexOf(x)===i)
      : attuali.filter(x => x !== e.detail.servizioId);
    salva();
  });

  v.addEventListener('turno-elimina', async e => {
    const t = trova(e.detail.id); if(!t) return;
    const inQuota = state.staff.filter(s=>(s.weeklyQuota||[]).some(g=>(g.codes||[]).includes(t.code)));
    const ok = await conferma(`Eliminare il turno "${t.code} · ${t.label}"?`,
      (inQuota.length ? `È usato nelle quote di: ${inQuota.map(s=>s.name).join(', ')}.\n` : '')
      + 'I turni già assegnati nella griglia restano, ma la sigla non sarà più selezionabile.',
      {conferma:'Elimina', pericolo:true});
    if(!ok) return;
    state.shiftTypes = state.shiftTypes.filter(x=>x.id!==t.id);
    state.staff.forEach(s=>(s.weeklyQuota||[]).forEach(g=>{ g.codes = (g.codes||[]).filter(c=>c!==t.code); }));
    erroriSigla.delete(t.id);
    save('shiftTypes'); save('staff'); salva(); toast('Tipo di turno eliminato');
  });
}

/* ------------------------------------------- COPIA DA UN'ALTRA CUCINA */

// Copia della configurazione da un'altra cucina dello stesso gestore.
export function renderCopiaConfig(){
  const panel = document.getElementById('copia-config-panel');
  const altre = Cloud.enabled ? Cloud.altreCucine() : [];
  panel.classList.toggle('hidden', !altre.length);
  if(!altre.length) return;
  document.getElementById('copia-da').innerHTML =
    altre.map(k=>`<option value="${esc(k.id)}">${esc(k.name)}</option>`).join('');
}

document.getElementById('copia-btn').addEventListener('click', async ()=>{
  const id = document.getElementById('copia-da').value;
  const nome = (Cloud.altreCucine().find(k=>k.id===id)||{}).name || 'l\'altra cucina';
  const ok = await conferma(`Copiare la configurazione da "${nome}"?`,
    'La configurazione attuale di questa cucina viene sostituita.\n'
    + 'Brigata, turni assegnati e fabbisogno NON vengono toccati, ma il fabbisogno\n'
    + 'andrà reimpostato perché i servizi e le stazioni cambiano identificativo.',
    {conferma:'Copia qui', pericolo:true});
  if(!ok) return;
  try{
    const [servizi, turni, stazioni] = await Promise.all([
      Cloud.readOtherKitchen(id, 'services'),
      Cloud.readOtherKitchen(id, 'shiftTypes'),
      Cloud.readOtherKitchen(id, 'stations'),
    ]);
    if(!servizi || !turni){ toast('Quella cucina non ha ancora una configurazione'); return; }
    state.services   = servizi;
    state.shiftTypes = turni;
    if(stazioni) state.stations = stazioni;
    state.staffingNeeds = {};
    await save('services'); await save('shiftTypes'); await save('stations'); await save('staffingNeeds');
    afterShiftConfigChange(); renderStations();
    toast('Configurazione copiata — ricontrolla il fabbisogno');
  }catch(e){ toast(humanError(e)); }
});
