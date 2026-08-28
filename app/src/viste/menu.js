import { esc, save, state, toast, uid } from '../core/state.js';
import { dishTotalCost } from '../ricettario/costi.js';
/* ============================= MENU ============================= */
export function renderMenuList(){
  const el = document.getElementById('menu-list');
  if(!state.menus.length){ el.innerHTML = `<div class="empty">Nessun menu ancora. Componine uno dal ricettario.</div>`; return; }
  el.innerHTML = state.menus.map((m,idx)=>{
    const items = m.recipeIds.map(id=>state.recipes.find(r=>r.id===id)).filter(Boolean);
    const totalCost = items.reduce((s,r)=>s+dishTotalCost(r),0);
    const totalPrice = items.reduce((s,r)=>s+(parseFloat(r.priceActual)||0),0);
    const avgFc = totalPrice? (totalCost/totalPrice*100) : null;
    return `
    <div class="comanda">
      <div class="comanda-head">
        <div><div class="comanda-title">${esc(m.name)}</div><div class="comanda-cat">${items.length} portate</div></div>
        <div class="comanda-num">#${String(idx+1).padStart(3,'0')}</div>
      </div>
      <ul class="ing-list">${items.map(r=>`<li><span class="n">${esc(r.name)}</span><span class="q">€${(parseFloat(r.priceActual)||0).toFixed(2)}</span></li>`).join('')}</ul>
      <div class="metric-row">
        <div class="metric">Costo totale<b>€ ${totalCost.toFixed(2)}</b></div>
        <div class="metric">Prezzo totale<b>€ ${totalPrice.toFixed(2)}</b></div>
        <div class="metric ${avgFc!==null && avgFc>35?'neg':'pos'}">Food cost medio<b>${avgFc!==null?avgFc.toFixed(1)+'%':'—'}</b></div>
      </div>
      <div class="card-actions"><button class="danger" data-del="${m.id}">Elimina</button></div>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-del]').forEach(b=> b.addEventListener('click', ()=>{ state.menus = state.menus.filter(m=>m.id!==b.dataset.del); save('menus'); renderMenuList(); toast('Menu eliminato'); }));
}
document.getElementById('btn-new-menu').addEventListener('click', ()=>{
  const holder = document.getElementById('menu-form-holder');
  if(!state.recipes.length){ toast('Crea prima qualche piatto'); return; }
  holder.innerHTML = `
    <div class="panel">
      <h3>Nuovo menu</h3>
      <label>Nome menu</label>
      <input type="text" id="m-name" placeholder="es. Menu degustazione estivo">
      <label>Seleziona le portate</label>
      <div class="chip-toggle" id="m-recipes">${state.recipes.map(r=>`<button type="button" data-id="${r.id}">${esc(r.name)}</button>`).join('')}</div>
      <div class="row gap-3 mt-4">
        <button class="btn" id="m-save">Salva menu</button>
        <button class="btn ghost" id="m-cancel">Annulla</button>
      </div>
    </div>
  `;
  document.querySelectorAll('#m-recipes button').forEach(b=> b.addEventListener('click', ()=> b.classList.toggle('on')));
  document.getElementById('m-cancel').addEventListener('click', ()=> holder.innerHTML='');
  document.getElementById('m-save').addEventListener('click', ()=>{
    const name = document.getElementById('m-name').value.trim();
    const ids = Array.from(document.querySelectorAll('#m-recipes button.on')).map(b=>b.dataset.id);
    if(!name || !ids.length){ toast('Serve un nome e almeno una portata'); return; }
    state.menus.push({id:uid(), name, recipeIds:ids});
    save('menus'); holder.innerHTML=''; renderMenuList(); toast('Menu creato');
  });
});
