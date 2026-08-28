import { SERVICES, SERVICE_LABEL, esc, save, state } from '../core/state.js';
/* ============================= TURNI: fabbisogno per turno/stazione ============================= */
export function renderNeeds(){
  const el = document.getElementById('needs-panel');
  if(!state.stations.length){ el.innerHTML = `<div class="empty">Crea prima le stazioni.</div>`; return; }
  el.innerHTML = SERVICES().map(sv=>{
    const rows = state.staffingNeeds[sv]||[];
    return `
    <div class="panel">
      <h3>${esc(SERVICE_LABEL(sv))}</h3>
      <div id="needs-rows-${sv}">
        ${rows.map((r,i)=>`
          <div class="ing-row" data-i="${i}" style="grid-template-columns:2fr 1fr auto;">
            <select class="need-station" data-sv="${sv}" data-i="${i}">
              ${state.stations.map(st=>`<option value="${st.id}" ${r.stationId===st.id?'selected':''}>${esc(st.name)}</option>`).join('')}
            </select>
            <input type="number" class="need-count" data-sv="${sv}" data-i="${i}" value="${r.count}" min="0">
            <button type="button" class="need-rm" data-sv="${sv}" data-i="${i}">✕</button>
          </div>`).join('')}
      </div>
      <button class="btn ghost small mt-1" data-addneed="${sv}" type="button">+ Riga</button>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-addneed]').forEach(b=>{
    b.addEventListener('click', ()=>{
      state.staffingNeeds[b.dataset.addneed].push({stationId: state.stations[0].id, count:1});
      save('staffingNeeds'); renderNeeds();
    });
  });
  el.querySelectorAll('.need-station').forEach(sel=>{
    sel.addEventListener('change', ()=>{ state.staffingNeeds[sel.dataset.sv][sel.dataset.i].stationId = sel.value; save('staffingNeeds'); });
  });
  el.querySelectorAll('.need-count').forEach(inp=>{
    inp.addEventListener('input', ()=>{ state.staffingNeeds[inp.dataset.sv][inp.dataset.i].count = parseInt(inp.value)||0; save('staffingNeeds'); });
  });
  el.querySelectorAll('.need-rm').forEach(b=>{
    b.addEventListener('click', ()=>{ state.staffingNeeds[b.dataset.sv].splice(parseInt(b.dataset.i),1); save('staffingNeeds'); renderNeeds(); });
  });
}
