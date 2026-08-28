import { esc, save, state, toast, uid } from '../core/state.js';
/* ============================= FORNITORI ============================= */
export function renderSuppliers(){
  const el = document.getElementById('supplier-list');
  if(!el) return;
  if(!state.suppliers.length){ el.innerHTML = `<div class="empty">Nessun fornitore ancora. Si creano da soli importando le fatture, oppure aggiungili qui.</div>`; return; }
  el.innerHTML = state.suppliers.map(s=>`
    <div class="staff-card">
      <div>
        <div class="bold">${esc(s.name)}</div>
        <div class="contact">${s.piva? 'P.IVA '+esc(s.piva):''}</div>
        <div class="contact">${s.phone? '📞 '+esc(s.phone):''}${s.phone&&s.email?' · ':''}${s.email? '✉ '+esc(s.email):''}</div>
        <div class="contact">${esc(s.address||'')}</div>
      </div>
      <div class="col">
        <button class="btn ghost small" data-edit="${s.id}">Modifica</button>
        <button class="btn ghost small text-alert" data-del="${s.id}">Elimina</button>
      </div>
    </div>`).join('');
  el.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', ()=> openSupplierForm(state.suppliers.find(s=>s.id===b.dataset.edit))));
  el.querySelectorAll('[data-del]').forEach(b=> b.addEventListener('click', ()=>{
    state.suppliers = state.suppliers.filter(s=>s.id!==b.dataset.del); save('suppliers'); renderSuppliers(); toast('Fornitore eliminato');
  }));
}
function openSupplierForm(existing){
  const holder = document.getElementById('supplier-form-holder');
  const s = existing || {id:uid(), name:'', piva:'', phone:'', email:'', address:''};
  holder.innerHTML = `
    <div class="panel">
      <h3>${existing?'Modifica fornitore':'Nuovo fornitore'}</h3>
      <label>Nome / Ragione sociale</label>
      <input type="text" id="sup-name" value="${esc(s.name)}">
      <div class="grid2">
        <div><label>Partita IVA</label><input type="text" id="sup-piva" value="${esc(s.piva)}"></div>
        <div><label>Telefono</label><input type="tel" id="sup-phone" value="${esc(s.phone)}"></div>
      </div>
      <label>Email</label><input type="email" id="sup-email" value="${esc(s.email)}">
      <label>Indirizzo</label><input type="text" id="sup-address" value="${esc(s.address)}">
      <div class="row gap-3 mt-4">
        <button class="btn" id="sup-save">Salva</button>
        <button class="btn ghost" id="sup-cancel">Annulla</button>
      </div>
    </div>`;
  document.getElementById('sup-cancel').addEventListener('click', ()=> holder.innerHTML='');
  document.getElementById('sup-save').addEventListener('click', ()=>{
    const name = document.getElementById('sup-name').value.trim();
    if(!name){ toast('Serve il nome del fornitore'); return; }
    const newSup = { id:s.id, name, piva:document.getElementById('sup-piva').value.trim(),
      phone:document.getElementById('sup-phone').value.trim(), email:document.getElementById('sup-email').value.trim(),
      address:document.getElementById('sup-address').value.trim() };
    const idx = state.suppliers.findIndex(x=>x.id===s.id);
    if(idx>=0) state.suppliers[idx]=newSup; else state.suppliers.push(newSup);
    save('suppliers'); holder.innerHTML=''; renderSuppliers(); toast('Fornitore salvato');
  });
}
document.getElementById('btn-new-supplier').addEventListener('click', ()=> openSupplierForm(null));
