import { humanError } from '../account/accesso.js';
import { SERVICE_LABEL, conferma, esc, state, toast } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { isoDate, parseISO } from '../lib/logic.js';
/* ============================= RICHIESTE DEL PERSONALE ============================= */
let RICHIESTE = [];

// La persona della brigata corrispondente a chi sta usando l'app. Il
// collegamento si imposta nell'anagrafica brigata; senza, si possono solo
// vedere le richieste altrui (da titolare) e non inviarne per sé.
function miaSchedaBrigata(){
  if(!Cloud.enabled) return null;
  return state.staff.find(s=> s.userId === Cloud.user.id) || null;
}
function nomeBrigata(staffId){
  const s = state.staff.find(x=>x.id===staffId);
  return s ? s.name : '(persona non più in brigata)';
}
function elencoDate(dal, al){
  const out = []; const fine = parseISO(al);
  for(let d = parseISO(dal); d <= fine; d.setDate(d.getDate()+1)) out.push(isoDate(d));
  return out;
}
const TIPO_LABEL = { ferie:'Ferie', riposo:'Riposo', servizio:'Solo certi servizi' };

// Da richieste approvate a vincoli per il motore. Un blocco (ferie/riposo) ha
// sempre la precedenza su una preferenza di servizio: è più stringente.
export function constraintsFromRequests(){
  const c = {};
  RICHIESTE.filter(r=>r.stato==='approvata').forEach(r=>{
    elencoDate(r.dal, r.al).forEach(d=>{
      c[r.staff_id] = c[r.staff_id] || {};
      const esistente = c[r.staff_id][d];
      if(esistente && esistente.blocked) return;
      if(r.tipo==='ferie')       c[r.staff_id][d] = {blocked:'F'};
      else if(r.tipo==='riposo') c[r.staff_id][d] = {blocked:'R'};
      else                       c[r.staff_id][d] = {services: r.servizi || []};
    });
  });
  return c;
}

export async function caricaRichieste(){
  try{ RICHIESTE = await Cloud.listRequests(); }
  catch(e){ console.error('richieste non caricate', e); RICHIESTE = []; }
}

export async function renderRichieste(){
  await caricaRichieste();
  const sonoTitolare = !Cloud.enabled || Cloud.isOwner();
  const mia = miaSchedaBrigata();

  // --- form ---
  document.getElementById('req-form-title').textContent = sonoTitolare ? 'Registra una richiesta' : 'Nuova richiesta';
  document.getElementById('req-form-note').textContent = sonoTitolare
    ? 'Le richieste che registri tu sono già approvate: valgono subito per il generatore. Quelle inviate dalla brigata restano in attesa finché non decidi.'
    : 'La richiesta arriva a chi gestisce la cucina. Diventa vincolante per i turni solo quando viene approvata.';

  const whoEl = document.getElementById('req-who');
  if(sonoTitolare){
    whoEl.innerHTML = `<label>Per chi</label><select id="req-staff">${
      state.staff.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')
      || '<option value="">Nessuno in brigata</option>'}</select>`;
  } else if(mia){
    whoEl.innerHTML = `<p class="small-note mt-0" >Richiesta a nome di <b>${esc(mia.name)}</b>.</p>`;
  } else {
    whoEl.innerHTML = `<div class="alert-box">Non risulti collegato a nessuna persona della brigata: chiedi a chi gestisce la cucina di collegarti, così potrai inviare le tue richieste.</div>`;
  }
  document.getElementById('req-add').disabled = !sonoTitolare && !mia;

  document.getElementById('req-servizi').innerHTML = state.services.map(sv=>
    `<button type="button" data-sv="${esc(sv.id)}">${esc(sv.name)}</button>`).join('');

  // --- elenco ---
  const visibili = sonoTitolare ? RICHIESTE
    : RICHIESTE.filter(r=> mia && r.staff_id === mia.id);
  document.getElementById('req-list-title').textContent = sonoTitolare ? 'Tutte le richieste' : 'Le mie richieste';

  const el = document.getElementById('req-list');
  if(!visibili.length){ el.innerHTML = `<div class="empty">Nessuna richiesta.</div>`; return; }

  const inAttesa = visibili.filter(r=>r.stato==='in_attesa');
  const decise   = visibili.filter(r=>r.stato!=='in_attesa');
  const riga = r=>{
    const giorni = elencoDate(r.dal, r.al).length;
    const periodo = r.dal===r.al
      ? parseISO(r.dal).toLocaleDateString('it-IT',{weekday:'short', day:'numeric', month:'long'})
      : `${parseISO(r.dal).toLocaleDateString('it-IT',{day:'numeric',month:'short'})} → ${parseISO(r.al).toLocaleDateString('it-IT',{day:'numeric',month:'short'})} (${giorni} giorni)`;
    const dettaglio = r.tipo==='servizio'
      ? 'solo: ' + (r.servizi||[]).map(SERVICE_LABEL).join(', ')
      : TIPO_LABEL[r.tipo];
    const badge = r.stato==='approvata' ? '<span class="role-badge">approvata</span>'
                : r.stato==='rifiutata' ? '<span class="role-badge viewer">rifiutata</span>'
                : '<span class="role-badge viewer">in attesa</span>';
    return `
      <div class="staff-card">
        <div class="wrap-anywhere">
          <div class="bold">${esc(nomeBrigata(r.staff_id))} — ${esc(dettaglio)}</div>
          <div class="contact">${esc(periodo)}${r.nota? ' · '+esc(r.nota):''}</div>
        </div>
        <div class="col end">
          ${badge}
          ${sonoTitolare && r.stato==='in_attesa' ? `
            <button class="btn small req-ok" data-id="${esc(r.id)}">Approva</button>
            <button class="btn ghost small req-no" data-id="${esc(r.id)}">Rifiuta</button>` : ''}
          <button class="btn ghost small req-del text-alert" data-id="${esc(r.id)}">Elimina</button>
        </div>
      </div>`;
  };

  el.innerHTML =
    (inAttesa.length ? `<label>Da decidere (${inAttesa.length})</label>` + inAttesa.map(riga).join('') : '') +
    (decise.length   ? `<label>Già decise</label>` + decise.map(riga).join('') : '');

  const dopo = async (fn, msg)=>{ try{ await fn(); toast(msg); renderRichieste(); }catch(e){ toast(humanError(e)); } };
  el.querySelectorAll('.req-ok').forEach(b=>b.addEventListener('click', ()=>
    dopo(()=>Cloud.decideRequest(b.dataset.id,'approvata'), 'Approvata — vincola i prossimi turni generati')));
  el.querySelectorAll('.req-no').forEach(b=>b.addEventListener('click', ()=>
    dopo(()=>Cloud.decideRequest(b.dataset.id,'rifiutata'), 'Rifiutata')));
  el.querySelectorAll('.req-del').forEach(b=>b.addEventListener('click', async ()=>{
    if(!await conferma('Eliminare questa richiesta?', null, {conferma:'Elimina', pericolo:true})) return;
    dopo(()=>Cloud.deleteRequest(b.dataset.id), 'Richiesta eliminata');
  }));
}

document.getElementById('req-tipo').addEventListener('change', e=>{
  document.getElementById('req-servizi-wrap').classList.toggle('hidden', e.target.value!=='servizio');
});
document.getElementById('req-servizi').addEventListener('click', e=>{
  if(e.target.dataset.sv) e.target.classList.toggle('on');
});
document.getElementById('req-add').addEventListener('click', async ()=>{
  const dal = document.getElementById('req-dal').value;
  const al  = document.getElementById('req-al').value || dal;
  const tipo = document.getElementById('req-tipo').value;
  if(!dal){ toast('Indica almeno il giorno di inizio'); return; }
  if(parseISO(al) < parseISO(dal)){ toast('La data finale è prima di quella iniziale'); return; }

  const sel = document.getElementById('req-staff');
  const mia = miaSchedaBrigata();
  const staffId = sel ? sel.value : (mia && mia.id);
  if(!staffId){ toast('Manca la persona a cui riferire la richiesta'); return; }

  const servizi = Array.from(document.querySelectorAll('#req-servizi button.on')).map(b=>b.dataset.sv);
  if(tipo==='servizio' && !servizi.length){ toast('Scegli almeno un servizio'); return; }

  try{
    await Cloud.createRequest({ staff_id: staffId, dal, al, tipo, servizi,
                                nota: document.getElementById('req-nota').value.trim() });
    document.getElementById('req-nota').value = '';
    document.querySelectorAll('#req-servizi button.on').forEach(b=>b.classList.remove('on'));
    toast(Cloud.enabled && !Cloud.isOwner() ? 'Richiesta inviata — in attesa di approvazione' : 'Richiesta registrata');
    renderRichieste();
  }catch(e){ toast(humanError(e)); }
});
