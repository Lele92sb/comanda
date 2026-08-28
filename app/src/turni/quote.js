import { CODE_LABEL, WORKING_CODES, esc, save, state } from '../core/state.js';
import { REST_CODE } from '../lib/logic.js';
/* ============================= TURNI: quote settimanali per persona ============================= */
// Codici selezionabili in una quota: i turni di lavoro configurati, più il Riposo.
const QUOTA_CODES = () => WORKING_CODES().concat([REST_CODE]);
export function renderQuotas(){
  const el = document.getElementById('quota-panel');
  if(!state.staff.length){ el.innerHTML = `<div class="empty">Aggiungi prima persone alla brigata.</div>`; return; }
  el.innerHTML = state.staff.map(s=>{
    const quota = s.weeklyQuota||[];
    const total = quota.reduce((sum,g)=>sum+(parseInt(g.count)||0),0);
    return `
    <div class="panel">
      <h3>${esc(s.name)} <span class="small-note inline" >— totale ${total}/7</span></h3>
      <label>Stazioni qualificate</label>
      <div class="chip-toggle staff-station-chips" data-staff="${s.id}">
        ${state.stations.map(st=>`<button type="button" data-st="${st.id}" class="${(s.stations||[]).includes(st.id)?'on':''}">${esc(st.name)}</button>`).join('') || '<span class="small-note">Nessuna stazione creata</span>'}
      </div>
      <label>Gruppi di turni</label>
      <div id="quota-groups-${s.id}">
        ${quota.map((g,i)=>`
          <div class="panel subpanel" >
            <div class="grid2">
              <input type="number" class="q-count" data-staff="${s.id}" data-i="${i}" value="${g.count}" min="0" placeholder="n. turni">
              <button type="button" class="q-rm" data-staff="${s.id}" data-i="${i}">✕ Rimuovi gruppo</button>
            </div>
            <div class="chip-toggle q-codes" data-staff="${s.id}" data-i="${i}">
              ${QUOTA_CODES().map(c=>`<button type="button" data-c="${esc(c)}" title="${esc(CODE_LABEL(c))}" class="${(g.codes||[]).includes(c)?'on':''}">${esc(c)}</button>`).join('')}
            </div>
            <p class="small-note mt-1" >Se selezioni più codici (es. P e S), ad ogni turno di questo gruppo verrà scelto casualmente uno dei due.</p>
          </div>`).join('')}
      </div>
      <button class="btn ghost small mt-2" data-addgroup="${s.id}" type="button">+ Gruppo di turni</button>
    </div>`;
  }).join('');

  el.querySelectorAll('.staff-station-chips button').forEach(b=>{
    b.addEventListener('click', ()=>{
      const staffId = b.closest('.staff-station-chips').dataset.staff;
      const s = state.staff.find(x=>x.id===staffId);
      s.stations = s.stations||[];
      const stId = b.dataset.st;
      if(s.stations.includes(stId)) s.stations = s.stations.filter(x=>x!==stId); else s.stations.push(stId);
      save('staff'); b.classList.toggle('on');
    });
  });
  el.querySelectorAll('[data-addgroup]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const s = state.staff.find(x=>x.id===b.dataset.addgroup);
      s.weeklyQuota = s.weeklyQuota||[]; s.weeklyQuota.push({count:1, codes:['R']});
      save('staff'); renderQuotas();
    });
  });
  el.querySelectorAll('.q-count').forEach(inp=>{
    inp.addEventListener('input', ()=>{
      const s = state.staff.find(x=>x.id===inp.dataset.staff);
      s.weeklyQuota[inp.dataset.i].count = parseInt(inp.value)||0;
      save('staff');
    });
  });
  el.querySelectorAll('.q-rm').forEach(b=>{
    b.addEventListener('click', ()=>{
      const s = state.staff.find(x=>x.id===b.dataset.staff);
      s.weeklyQuota.splice(parseInt(b.dataset.i),1);
      save('staff'); renderQuotas();
    });
  });
  el.querySelectorAll('.q-codes button').forEach(b=>{
    b.addEventListener('click', ()=>{
      const group = b.closest('.q-codes');
      const s = state.staff.find(x=>x.id===group.dataset.staff);
      const g = s.weeklyQuota[group.dataset.i];
      g.codes = g.codes||[];
      const c = b.dataset.c;
      if(g.codes.includes(c)) g.codes = g.codes.filter(x=>x!==c); else g.codes.push(c);
      save('staff'); b.classList.toggle('on');
    });
  });
}
