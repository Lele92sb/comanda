import { save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import '../viste/brigata-vista.ts';
import '../viste/persona-vista.ts';
/* ============================= BRIGATA =============================

   QUESTO FILE E' SOLO IL COLLANTE. L'elenco e' <cmd-brigata> e la scheda di
   modifica e' <cmd-scheda-persona>; qui restano le sole cose che loro non
   possono sapere: dove stanno i dati, cosa vuol dire salvarli, e chi ha un
   account in questa cucina.
   ========================================================================== */

/* Quello che l'elenco deve disegnare, e nient'altro. Le partite arrivano gia'
   come NOMI, in ordine: l'ordine dell'array `stations` E' la priorita' — il
   motore lo legge cosi' (prioritaDi in logic.js) — e tradurre id in nomi e'
   un lavoro che richiede `state`, quindi si fa qui. */
function daDisegnare(){
  const nomeDi = id => { const st = state.stations.find(x=>x.id===id); return st ? st.name : null; };
  return state.staff.map(s => ({
    id: s.id,
    nome: s.name,
    ruolo: s.role,
    ore: s.hours || '',
    telefono: s.phone || '',
    email: s.email || '',
    partite: (s.stations||[]).map(nomeDi).filter(Boolean),
    fuoriExtra: s.puoFareExtra === false,
  }));
}

let elenco = null;

export function renderStaffList(){
  const el = document.getElementById('staff-list');
  if(!el) return;
  if(!elenco || !elenco.isConnected){
    elenco = document.createElement('cmd-brigata');
    collega(elenco);
    el.replaceChildren(elenco);
  }
  elenco.persone = daDisegnare();
  elenco.soloLettura = Cloud.enabled && !Cloud.canWrite();
}

function collega(vista){
  // L'ordine della brigata È la posizione in state.staff: spostare su e giù
  // scambia due elementi dell'array, non c'è nessun campo "ordine" da tenere
  // allineato. I turni sono indicizzati per id della persona (state.shifts),
  // quindi riordinare l'elenco non tocca un solo turno assegnato.
  vista.addEventListener('persona-sposta', e => {
    const da = state.staff.findIndex(x => x.id === e.detail.id);
    const a = da + e.detail.verso;
    if(da < 0 || a < 0 || a >= state.staff.length) return;
    [state.staff[da], state.staff[a]] = [state.staff[a], state.staff[da]];
    save('staff');
    renderStaffList();
  });

  vista.addEventListener('persona-modifica', e =>
    openStaffForm(state.staff.find(s => s.id === e.detail.id)));

  vista.addEventListener('persona-nuova', () => openStaffForm(null));

  vista.addEventListener('persona-rimuovi', e => {
    const id = e.detail.id;
    state.staff = state.staff.filter(s => s.id !== id);
    delete state.shifts[id];
    save('staff'); save('shifts'); renderStaffList(); toast('Rimosso dalla brigata');
  });
}
const RUOLI = ['Chef','Sous Chef','Chef de partie','Cuoco','Commis','Pasticcere','Plongeur'];

let scheda = null;

async function openStaffForm(existing){
  const holder = document.getElementById('staff-form-holder');
  if(!holder) return;

  // Chi ha un account nella cucina, per poter collegare la persona al suo
  // accesso: senza il collegamento non puo' inviare le proprie richieste.
  // Il database manda nome ed email solo al titolare (policy members_select).
  let membri = [];
  if(Cloud.enabled && Cloud.isOwner()){
    try{
      membri = (await Cloud.listMembers()).map(m => ({
        id: m.user_id,
        nome: m.display_name || m.email || 'membro',
        email: m.email || '',
      }));
    }catch(e){ console.error('membri non caricati', e); }
  }

  const s = existing || {};
  scheda = document.createElement('cmd-scheda-persona');
  scheda.nuova = !existing;
  scheda.ruoli = RUOLI;
  scheda.membri = membri;
  scheda.stazioni = state.stations.map(st => ({ id: st.id, nome: st.name }));
  scheda.persona = {
    id: s.id || uid(),
    nome: s.name || '',
    ruolo: s.role || 'Cuoco',
    ore: s.hours || '',
    telefono: s.phone || '',
    email: s.email || '',
    partite: (s.stations || []).slice(),
    fuoriExtra: s.puoFareExtra === false,
    accountId: s.userId || '',
  };

  scheda.addEventListener('persona-annulla', chiudiScheda);
  scheda.addEventListener('persona-email-da-account',
    ()=> toast("Email presa dall'account collegato"));

  scheda.addEventListener('persona-salva', e => {
    const p = e.detail.persona;
    const idx = state.staff.findIndex(x => x.id === p.id);
    // Si PARTE dalla persona che c'era e si sovrascrivono i campi di questa
    // scheda. Prima l'oggetto veniva ricostruito da zero, e ogni campo non
    // elencato spariva alla prima Modifica: e' il motivo per cui weeklyQuota
    // andava riportata a mano, ed e' un tranello che il prossimo campo nuovo
    // avrebbe pagato in silenzio.
    const aggiornata = Object.assign({}, idx >= 0 ? state.staff[idx] : {}, {
      id: p.id,
      name: p.nome,
      role: p.ruolo,
      hours: p.ore,
      phone: p.telefono,
      email: p.email,
      stations: p.partite,
      puoFareExtra: !p.fuoriExtra,
      userId: membri.length ? (p.accountId || null) : (s.userId || null),
    });
    if(!aggiornata.weeklyQuota) aggiornata.weeklyQuota = [];
    if(idx >= 0) state.staff[idx] = aggiornata; else state.staff.push(aggiornata);
    save('staff'); chiudiScheda(); renderStaffList(); toast('Salvato');
  });

  holder.replaceChildren(scheda);
  // Il fuoco entra nel primo campo: chi ha appena premuto «Aggiungi persona»
  // sta gia' per scrivere un nome.
  scheda.updateComplete.then(()=> scheda.renderRoot.querySelector('#p-nome')?.focus());
}

function chiudiScheda(){
  const holder = document.getElementById('staff-form-holder');
  if(holder) holder.replaceChildren();
  scheda = null;
}

document.getElementById('btn-new-staff').addEventListener('click', ()=> openStaffForm(null));
