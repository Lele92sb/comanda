import { esc, save, state, toast, uid } from '../core/state.js';
/* ============================= BENESSERE ============================= */
export function renderWbStaffOptions(){
  const sel = document.getElementById('wb-staff');
  sel.innerHTML = state.staff.length ? state.staff.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('') : `<option value="">Aggiungi prima la brigata</option>`;
  document.getElementById('wb-date').valueAsDate = new Date();
}
document.getElementById('wb-add').addEventListener('click', ()=>{
  const staffId = document.getElementById('wb-staff').value;
  const date = document.getElementById('wb-date').value;
  const ore = parseFloat(document.getElementById('wb-ore').value);
  if(!staffId || !date || !ore){ toast('Compila tutti i campi'); return; }
  state.wellbeing.push({id:uid(), staffId, date, ore});
  save('wellbeing');
  document.getElementById('wb-ore').value='';
  renderWbSummary(); renderWbTips();
  toast('Ore registrate');
});
function weekBounds(d=new Date()){
  const day = (d.getDay()+6)%7;
  const monday = new Date(d); monday.setDate(d.getDate()-day); monday.setHours(0,0,0,0);
  const sunday = new Date(monday); sunday.setDate(monday.getDate()+6); sunday.setHours(23,59,59,999);
  return [monday, sunday];
}
export function renderWbSummary(){
  const el = document.getElementById('wb-summary');
  const [mon,sun] = weekBounds();
  const byStaff = {};
  state.wellbeing.forEach(w=>{ const dt = new Date(w.date); if(dt>=mon && dt<=sun){ byStaff[w.staffId] = (byStaff[w.staffId]||0) + parseFloat(w.ore); } });
  if(!Object.keys(byStaff).length){ el.innerHTML = `<div class="empty">Nessuna ora registrata questa settimana.</div>`; return; }
  el.innerHTML = Object.entries(byStaff).map(([id,tot])=>{
    const name = (state.staff.find(s=>s.id===id)||{}).name || '—';
    const over = tot>48;
    return `<div class="list-row"><span>${esc(name)}</span><span class="mono" style="color:${over?'var(--alert)':'var(--sage)'};">${tot.toFixed(1)}h ${over?'⚠':'✓'}</span></div>`;
  }).join('');
}
export function renderWbTips(){
  const tips = [
    "La direttiva UE sull'orario di lavoro indica 48h settimanali come soglia massima media — usala come riferimento, non come obiettivo.",
    "Un giorno di riposo consecutivo dopo un servizio doppio pesante aiuta il recupero più di due giorni sparsi.",
    "Ruota chi apre e chi chiude: chi fa sempre il turno più lungo si esaurisce prima, anche se non lo dice.",
    "Un briefing di 5 minuti prima del servizio riduce lo stress operativo più di qualunque software.",
  ];
  document.getElementById('wb-tips').innerHTML = tips.map(t=>`— ${t}`).join('<br><br>');
}
