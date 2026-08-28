import { CODE_HOURS, TURNO_DEF, WORKING_CODES, esc, periodDates, periodLabel, periodMode, save, state } from '../core/state.js';
import { dayName, isoDate, parseISO } from '../lib/logic.js';
import { renderDashboard } from '../viste/dashboard.js';
/* ============================= TURNI: griglia ============================= */
export function renderTurni(){
  const el = document.getElementById('turni-panel');
  document.getElementById('period-label').textContent = periodLabel();
  document.querySelectorAll('.period-modes button').forEach(b=>
    b.classList.toggle('active', b.dataset.period === periodMode));
  if(!state.staff.length){ el.innerHTML = `<div class="empty">Aggiungi prima persone alla brigata.</div>`; return; }
  const dates = periodDates();
  const oggi = isoDate(new Date());
  el.innerHTML = `
    <div class="shift-scroll">
    <table class="shift-table">
      <thead><tr><th class="name-col left" >Persona</th>${dates.map(d=>{
        const g = dayName(d), weekend = (g==='Sab'||g==='Dom');
        return `<th class="${d===oggi?'today':''} ${weekend?'weekend':''}">${g}<br>${parseISO(d).getDate()}</th>`;
      }).join('')}</tr></thead>
      <tbody>
        ${state.staff.map(s=>`
          <tr>
            <td class="name">${esc(s.name)}</td>
            ${dates.map(d=>{
              const cell = (state.shifts[s.id]||{})[d] || {code:'', stationId:null};
              const qualified = (s.stations&&s.stations.length) ? state.stations.filter(st=>s.stations.includes(st.id)) : state.stations;
              const showStation = WORKING_CODES().includes(cell.code) && qualified.length>0;
              return `<td class="${cell.extra?'extra-cell':''} ${d===oggi?'today-col':''}" ${cell.extra?'title="Turno extra: assegnato oltre la quota di questa persona per coprire il fabbisogno"':''}>
                <select class="shift-select ${cell.code}" data-staff="${s.id}" data-day="${d}">
                  ${Object.keys(TURNO_DEF()).map(code=>`<option value="${code}" ${cell.code===code?'selected':''}>${code||'—'}</option>`).join('')}
                </select>
                ${showStation ? `<select class="shift-station mt-1" data-staff="${s.id}" data-day="${d}">
                  <option value="">stazione</option>
                  ${qualified.map(st=>`<option value="${st.id}" ${cell.stationId===st.id?'selected':''}>${esc(st.name)}</option>`).join('')}
                </select>`:''}
                ${cell.extra ? `<div style="font-family:var(--font-mono);font-size:8px;color:var(--copper-light);margin-top:2px;">extra</div>`:''}
              </td>`;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
    </div>
  `;
  el.querySelectorAll('.shift-select').forEach(sel=>{
    sel.addEventListener('change', ()=>{
      const staffId = sel.dataset.staff, day = sel.dataset.day, val = sel.value;
      state.shifts[staffId] = state.shifts[staffId] || {};
      const prev = state.shifts[staffId][day] || {code:'', stationId:null};
      state.shifts[staffId][day] = { code:val, stationId: WORKING_CODES().includes(val) ? prev.stationId : null };
      save('shifts');
      renderTurni(); renderOreExtra(); renderDashboard();
    });
  });
  el.querySelectorAll('.shift-station').forEach(sel=>{
    sel.addEventListener('change', ()=>{
      const staffId = sel.dataset.staff, day = sel.dataset.day;
      state.shifts[staffId][day].stationId = sel.value || null;
      save('shifts');
      renderDashboard();
    });
  });
  document.getElementById('turni-legend').innerHTML = Object.entries(TURNO_DEF()).filter(([c])=>c).map(([c,v])=>esc(v.label)).join(' · ');
}
export function weeklyExtraFromTurni(){
  const dates = periodDates();
  // Le ore contrattuali sono settimanali: su un mese vanno rapportate alla
  // durata del periodo, altrimenti chiunque risulterebbe in fortissimo extra.
  const settimane = dates.length / 7;
  return state.staff.map(s=>{
    const days = state.shifts[s.id] || {};
    const totalHours = dates.reduce((sum,d)=> sum + CODE_HOURS((days[d]||{}).code||''), 0);
    const contracted = (parseFloat(s.hours)||0) * settimane;
    const extra = Math.max(0, totalHours - contracted);
    const under = contracted>0 ? Math.max(0, contracted-totalHours) : 0;
    return {id:s.id, name:s.name, totalHours, contracted, extra, under};
  });
}
export function renderOreExtra(){
  const el = document.getElementById('ore-extra-table');
  if(!state.staff.length){ el.innerHTML = `<div class="empty">Nessuna persona in brigata.</div>`; return; }
  const rows = weeklyExtraFromTurni();
  el.innerHTML = `
    <table class="hours-table">
      <thead><tr><th>Persona</th><th>Ore pianificate</th><th>Contrattuali</th><th>Extra</th></tr></thead>
      <tbody>
        ${rows.map(r=>`<tr>
          <td>${esc(r.name)}</td>
          <td class="num">${r.totalHours.toFixed(1)}h</td>
          <td class="num">${r.contracted? r.contracted.toFixed(1)+'h':'—'}</td>
          <td class="num ${r.extra>0?'extra':(r.under>0?'under':'')}">${r.extra>0? '+'+r.extra.toFixed(1)+'h' : (r.under>0? '−'+r.under.toFixed(1)+'h sotto':'in linea')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
}
