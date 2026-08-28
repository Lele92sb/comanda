import { SERVICE_LABEL, esc, periodDates, refreshShiftConfig, save, setPeriodAnchor, setPeriodMode, shiftPeriod, state, toast } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { computeShiftsForDates, parseISO } from '../lib/logic.js';
import { renderDashboard } from '../viste/dashboard.js';
import { renderOreExtra, renderTurni } from './griglia.js';
import { caricaRichieste, constraintsFromRequests } from './richieste.js';
/* ============================= TURNI: generatore casuale (motore in logic.js, need-driven, testato) ============================= */
async function generateRandomShifts(){
  if(!state.staff.length){ toast('Aggiungi prima la brigata'); return; }
  // Le richieste approvate sono vincoli assoluti: vanno rilette adesso, non
  // usando quelle caricate chissà quando.
  await caricaRichieste();
  const missingQuota = state.staff.filter(s=> !(s.weeklyQuota&&s.weeklyQuota.length));
  if(missingQuota.length){ toast('Imposta prima le quote per: '+missingQuota.map(s=>s.name).join(', ')); return; }
  const unqualified = state.staff.filter(s=> !(s.stations&&s.stations.length));
  if(unqualified.length){ toast('Attenzione: senza stazioni assegnate, '+unqualified.map(s=>s.name).join(', ')+' non potranno coprire nessun fabbisogno'); }

  const dates = periodDates();
  const constraints = constraintsFromRequests();
  // Contate prima di aggiungere gli impegni altrove: sono due cose diverse e
  // vanno spiegate separatamente a chi legge il riepilogo.
  const nRichieste = Object.values(constraints).reduce((n,g)=>n+Object.keys(g).length, 0);
  const nPersoneRichieste = Object.keys(constraints).length;

  // Chi lavora anche in un'altra cucina non puo' essere in due posti lo stesso
  // giorno: gli impegni altrove valgono come un vincolo assoluto, esattamente
  // come una richiesta approvata.
  let altrove = {};
  try{ altrove = await Cloud.impegniAltrove(state.staff, dates); }
  catch(e){ console.error('impegni altrove non letti', e); }
  Object.entries(altrove).forEach(([staffId, giorni])=>{
    Object.keys(giorni).forEach(d=>{
      constraints[staffId] = constraints[staffId] || {};
      if(!constraints[staffId][d]) constraints[staffId][d] = {blocked:'R'};
    });
  });
  const { newShifts, shortfalls, extras } = computeShiftsForDates(state.staff, state.staffingNeeds,
    {config: refreshShiftConfig(), dates, constraints});
  // Si sovrascrivono SOLO le date del periodo: i turni delle altre settimane
  // gia' pianificate non devono sparire perche' se ne rigenera una.
  state.staff.forEach(s=>{
    state.shifts[s.id] = Object.assign(state.shifts[s.id]||{}, newShifts[s.id]||{});
  });
  save('shifts');
  renderTurni(); renderOreExtra(); renderDashboard();

  const logEl = document.getElementById('generate-log');
  let html = '';
  if(extras.length){
    const byPerson = {};
    extras.forEach(ex=>{ byPerson[ex.staffName] = (byPerson[ex.staffName]||0)+1; });
    html += `<div class="alert-box">Il fabbisogno impostato supera le quote della brigata: ${extras.length} turni EXTRA (oltre quota) sono stati assegnati per coprire comunque le postazioni — ` +
      Object.entries(byPerson).map(([name,n])=>`${esc(name)} (+${n})`).join(', ') +
      `. Sono segnati con "extra" nella griglia qui sotto.</div>`;
  }
  if(shortfalls.length){
    const byDay = {};
    shortfalls.forEach(sf=>{
      const st = state.stations.find(x=>x.id===sf.stationId);
      const key = parseISO(sf.day).toLocaleDateString('it-IT',{weekday:'short', day:'numeric', month:'short'});
      byDay[key] = byDay[key] || [];
      byDay[key].push(`${esc(SERVICE_LABEL(sf.service))} · ${st?st.name:'—'} (mancano ${sf.missing})`);
    });
    html += `<div class="alert-box">⚠ Anche assegnando turni extra, restano postazioni scoperte perché nessun qualificato è libero quel giorno:<br>` +
      Object.entries(byDay).map(([day,lines])=>`<b>${day}</b>: ${lines.join(' · ')}`).join('<br>') +
      `</div><p class="small-note">Per risolvere: aggiungi personale qualificato per quella stazione, o abbassa il fabbisogno richiesto.</p>`;
  }
  const nAltrove = Object.values(altrove).reduce((n,g)=>n+Object.keys(g).length, 0);
  let premessa = '';
  if(nRichieste){
    premessa += `<div class="ok-box">Rispettate le richieste approvate: ${nRichieste} giorni vincolati su ${nPersoneRichieste} person${nPersoneRichieste>1?'e':'a'}.</div>`;
  }
  if(nAltrove){
    const nomi = [...new Set(Object.values(altrove).flatMap(g=>Object.values(g)))];
    premessa += `<div class="ok-box">${nAltrove} giorni lasciati liberi: quelle persone lavorano in un'altra cucina (${nomi.map(esc).join(', ')}).</div>`;
  }
  html = premessa + html;
  if(!extras.length && !shortfalls.length){
    html += `<div class="ok-box">✓ Fabbisogno coperto per tutti i servizi, tutti i giorni, senza bisogno di turni extra.</div>`;
  }
  logEl.innerHTML = html;
  toast(shortfalls.length ? 'Turni generati — alcune postazioni restano scoperte, vedi dettagli' : (extras.length ? 'Turni generati — con alcuni turni extra' : 'Turni generati — fabbisogno coperto'));
}
document.getElementById('btn-generate-shifts').addEventListener('click', generateRandomShifts);

/* ---- Navigazione del periodo ---- */
function aggiornaPeriodo(){ renderTurni(); renderOreExtra(); }
document.querySelectorAll('.period-modes button').forEach(b=>b.addEventListener('click', ()=>{
  setPeriodMode(b.dataset.period);
  aggiornaPeriodo();
}));
document.getElementById('period-prev').addEventListener('click', ()=>{ shiftPeriod(-1); aggiornaPeriodo(); });
document.getElementById('period-next').addEventListener('click', ()=>{ shiftPeriod(1);  aggiornaPeriodo(); });
document.getElementById('period-today').addEventListener('click', ()=>{ setPeriodAnchor(new Date()); aggiornaPeriodo(); });
