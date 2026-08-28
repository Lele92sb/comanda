import { esc, save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
/* ============================= BRIGATA ============================= */
export function renderStaffList(){
  const el = document.getElementById('staff-list');
  if(!state.staff.length){ el.innerHTML = `<div class="empty">Nessuna persona in brigata ancora.</div>`; return; }
  el.innerHTML = state.staff.map(s=>`
    <div class="staff-card">
      <div>
        <div class="bold">${esc(s.name)}</div>
        <div class="contact">${esc(s.role)} · ${s.hours||'—'}h/sett contrattuali</div>
        <div class="contact">${s.phone? '📞 '+esc(s.phone):''}${s.phone&&s.email?' · ':''}${s.email? '✉ '+esc(s.email):''}</div>
        <div class="contact">🍳 ${(s.stations&&s.stations.length) ? s.stations.map(id=>{ const st=state.stations.find(x=>x.id===id); return st?esc(st.name):null; }).filter(Boolean).join(', ') : 'nessuna stazione assegnata'}</div>
        ${s.puoFareExtra === false ? `<div class="contact">🚫 fuori dai turni extra</div>` : ''}
      </div>
      <div class="col">
        <button class="btn ghost small" data-edit="${s.id}">Modifica</button>
        <button class="btn ghost small text-alert" data-del="${s.id}">Rimuovi</button>
      </div>
    </div>
  `).join('');
  el.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', ()=> openStaffForm(state.staff.find(s=>s.id===b.dataset.edit))));
  el.querySelectorAll('[data-del]').forEach(b=>{
    b.addEventListener('click', ()=>{
      state.staff = state.staff.filter(s=>s.id!==b.dataset.del);
      delete state.shifts[b.dataset.del];
      save('staff'); save('shifts'); renderStaffList(); toast('Rimosso dalla brigata');
    });
  });
}
async function openStaffForm(existing){
  const holder = document.getElementById('staff-form-holder');
  const s = existing || {id:uid(), name:'', role:'Cuoco', hours:'', phone:'', email:'', stations:[], weeklyQuota:[], puoFareExtra:true, userId:null};
  // Chi ha un account nella cucina, per poter collegare la persona al suo
  // accesso: senza il collegamento non può inviare le proprie richieste.
  let membri = [];
  if(Cloud.enabled && Cloud.isOwner()){
    try{ membri = await Cloud.listMembers(); }catch(e){ console.error('membri non caricati', e); }
  }
  holder.innerHTML = `
    <div class="panel">
      <h3>${existing?'Modifica persona':'Aggiungi persona'}</h3>
      <label>Nome</label>
      <input type="text" id="s-name" value="${esc(s.name)}" placeholder="es. Marco">
      <div class="grid2">
        <div><label>Ruolo</label>
          <select id="s-role">
            ${['Chef','Sous Chef','Chef de partie','Cuoco','Commis','Pasticcere','Plongeur'].map(r=>`<option ${s.role===r?'selected':''}>${r}</option>`).join('')}
          </select>
        </div>
        <div><label>Ore contrattuali/sett.</label><input type="number" id="s-hours" value="${s.hours}" placeholder="es. 40"></div>
      </div>
      <div class="grid2">
        <div><label>Numero di cellulare</label><input type="tel" id="s-phone" value="${esc(s.phone)}" placeholder="es. 333 1234567"></div>
        <div><label>Email</label><input type="email" id="s-email" value="${esc(s.email)}" placeholder="es. nome@email.it"></div>
      </div>
      <label>Stazioni che può coprire</label>
      <div class="chip-toggle" id="s-stations">
        ${state.stations.length ? state.stations.map(st=>`<button type="button" data-st="${st.id}" class="${(s.stations||[]).includes(st.id)?'on':''}">${esc(st.name)}</button>`).join('') : '<span class="small-note">Nessuna stazione creata ancora — puoi crearle in Turni → Stazioni, poi torna qui.</span>'}
      </div>
      <p class="small-note">Usata dal generatore di turni per non mettere in una postazione qualcuno che non la sa coprire.</p>
      <label class="riga-scelta">
        <input type="checkbox" id="s-extra" ${s.puoFareExtra !== false ? 'checked' : ''}>
        <span><b>Può fare turni extra</b><br><span class="contact">Quando il fabbisogno supera le quote della brigata, il generatore può assegnarle un turno oltre la sua quota. Spenta, resta fuori dagli extra: la postazione risulterà scoperta invece che coperta da lei.</span></span>
      </label>
      ${membri.length ? `
      <label>Account collegato</label>
      <select id="s-user">
        <option value="">— nessuno: le richieste le inserisci tu per lui —</option>
        ${membri.map(m=>`<option value="${esc(m.user_id)}" ${s.userId===m.user_id?'selected':''}>${esc(m.display_name||m.email||'membro')}</option>`).join('')}
      </select>
      <p class="small-note">Collegando la persona al suo account potrà inviare da sola ferie e richieste di riposo.</p>` : ''}
      <div class="row gap-3 mt-4">
        <button class="btn" id="s-save">Salva</button>
        <button class="btn ghost" id="s-cancel">Annulla</button>
      </div>
    </div>
  `;
  document.querySelectorAll('#s-stations button').forEach(b=> b.addEventListener('click', ()=> b.classList.toggle('on')));
  document.getElementById('s-cancel').addEventListener('click', ()=> holder.innerHTML='');
  document.getElementById('s-save').addEventListener('click', ()=>{
    const name = document.getElementById('s-name').value.trim();
    if(!name){ toast('Serve un nome'); return; }
    const stations = Array.from(document.querySelectorAll('#s-stations button.on')).map(b=>b.dataset.st);
    const userSel = document.getElementById('s-user');
    const newStaff = { id:s.id, name, role:document.getElementById('s-role').value, hours:document.getElementById('s-hours').value,
      phone:document.getElementById('s-phone').value.trim(), email:document.getElementById('s-email').value.trim(),
      stations, weeklyQuota: s.weeklyQuota||[],
      // Qui l'oggetto si ricostruisce da zero, non si modifica: ogni campo non
      // elencato sparisce alla prima Modifica. È il motivo per cui weeklyQuota
      // è riportata a mano, ed è il motivo per cui puoFareExtra dev'esserci.
      puoFareExtra: document.getElementById('s-extra').checked,
      userId: userSel ? (userSel.value || null) : (s.userId||null) };
    const idx = state.staff.findIndex(x=>x.id===s.id);
    if(idx>=0) state.staff[idx]=newStaff; else state.staff.push(newStaff);
    save('staff'); holder.innerHTML=''; renderStaffList(); toast('Salvato');
  });
}
document.getElementById('btn-new-staff').addEventListener('click', ()=> openStaffForm(null));
