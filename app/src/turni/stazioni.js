import { esc, save, state, toast, uid } from '../core/state.js';
/* ============================= TURNI: stazioni ============================= */
export function renderStations(){
  const el = document.getElementById('station-list');
  if(!state.stations.length){ el.innerHTML = `<div class="empty">Nessuna stazione ancora.</div>`; return; }
  el.innerHTML = state.stations.map(st=>`
    <div class="staff-card">
      <div class="bold">${esc(st.name)}</div>
      <button class="btn ghost small text-alert" data-del="${st.id}">Elimina</button>
    </div>`).join('');
  el.querySelectorAll('[data-del]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const id = b.dataset.del;
      state.stations = state.stations.filter(s=>s.id!==id);
      Object.values(state.staffingNeeds).forEach(list=>{ const i=list.findIndex(n=>n.stationId===id); if(i>=0) list.splice(i,1); });
      state.staff.forEach(s=>{ s.stations = (s.stations||[]).filter(x=>x!==id); });
      save('stations'); save('staffingNeeds'); save('staff');
      renderStations(); toast('Stazione eliminata');
    });
  });
}
document.getElementById('station-add-btn').addEventListener('click', ()=>{
  const inp = document.getElementById('station-name-input');
  const name = inp.value.trim();
  if(!name){ toast('Serve un nome'); return; }
  state.stations.push({id:uid(), name});
  save('stations'); inp.value=''; renderStations(); toast('Stazione aggiunta');
});
