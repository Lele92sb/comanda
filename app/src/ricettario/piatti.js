import { ALLERGENS, esc, save, state, toast, uid } from '../core/state.js';
import { dishTotalCost, itemCost, itemLabel } from './costi.js';
import { resizeImageToDataUrl } from './foto-ricetta.js';
import { readItemRows, renderItemRows } from './righe.js';
/* ============================= PIATTI (dishes) ============================= */
export function renderDishes(){
  const el = document.getElementById('dish-list');
  if(!state.recipes.length){ el.innerHTML = `<div class="empty">Ancora nessun piatto. Crea la prima scheda tecnica.</div>`; return; }
  el.innerHTML = state.recipes.map((d,idx)=>{
    const cost = dishTotalCost(d);
    const target = parseFloat(d.foodCostTargetPct)||30;
    const suggPrice = target>0 ? cost/(target/100) : 0;
    const priceActual = parseFloat(d.priceActual)||0;
    const realFc = priceActual>0 ? (cost/priceActual*100) : null;
    const marginActual = priceActual - cost;
    return `
    <div class="comanda">
      <div class="comanda-head">
        <div><div class="comanda-title">${esc(d.name)}</div><div class="comanda-cat">${esc(d.category||'—')}${d.portionG?` · ${d.portionG}g/ml porzione`:''}${d.prepMin?` · ${d.prepMin} min`:''}</div></div>
        <div class="comanda-num">P${String(idx+1).padStart(3,'0')}</div>
      </div>
      ${d.photo? `<img src="${d.photo}" style="max-width:100%;border-radius:6px;margin-bottom:10px;">`:''}
      <div class="metric-row">
        <div class="metric">Costo materia prima<b>€ ${cost.toFixed(2)}</b></div>
        <div class="metric">Prezzo suggerito (target ${target}%)<b>€ ${suggPrice.toFixed(2)}</b></div>
        <div class="metric">Prezzo effettivo<b>€ ${priceActual.toFixed(2)}</b></div>
        <div class="metric ${realFc!==null && realFc>35?'neg':'pos'}">Food cost reale<b>${realFc!==null?realFc.toFixed(1)+'%':'—'}</b></div>
        <div class="metric ${marginActual<0?'neg':'pos'}">Margine effettivo<b>€ ${marginActual.toFixed(2)}</b></div>
      </div>
      <div>${(d.allergens||[]).map(a=>`<span class="tag allergen">${esc(a)}</span>`).join('')}</div>
      <ul class="ing-list">${(d.items||[]).map(it=>`<li><span class="n">${esc(itemLabel(it))}</span><span class="q">${it.qty}${esc(it.unit)} · €${itemCost(it).toFixed(2)}</span></li>`).join('')}</ul>
      ${d.steps? `<div class="steps">${esc(d.steps)}</div>`:''}
      ${d.notes? `<div class="steps" style="color:var(--copper);font-style:italic;">${esc(d.notes)}</div>`:''}
      <div class="card-actions">
        <button data-act="edit" data-id="${d.id}">Modifica</button>
        <button data-act="dup" data-id="${d.id}">Duplica</button>
        <button class="danger" data-act="del" data-id="${d.id}">Elimina</button>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('button[data-act]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const id = b.dataset.id, act = b.dataset.act;
      if(act==='del'){ state.recipes = state.recipes.filter(r=>r.id!==id); save('recipes'); renderDishes(); toast('Piatto eliminato'); }
      if(act==='edit'){ openDishForm(state.recipes.find(r=>r.id===id)); }
      if(act==='dup'){
        const orig = state.recipes.find(r=>r.id===id);
        const copy = JSON.parse(JSON.stringify(orig)); copy.id = uid(); copy.name = orig.name+' (copia)';
        state.recipes.push(copy); save('recipes'); renderDishes(); toast('Piatto duplicato');
      }
    });
  });
}
export function openDishForm(existing, prefill){
  const holder = document.getElementById('dish-form-holder');
  const base = {id:uid(), name:'', category:'', items:[], portionG:'', foodCostTargetPct:30, priceActual:'', allergens:[], steps:'', prepMin:'', notes:'', photo:''};
  const d = existing || Object.assign(base, prefill||{});
  let items = JSON.parse(JSON.stringify(d.items));
  holder.innerHTML = `
    <div class="panel">
      <h3>${existing?'Modifica piatto':'Nuovo piatto'}</h3>
      ${prefill&&!existing? `<div class="ok-box">Campi precompilati dalla foto — controlla e correggi prima di salvare, specialmente quantità e costi.</div>`:''}
      <label>Nome piatto</label>
      <input type="text" id="d-name" value="${esc(d.name)}" placeholder="es. Tagliatelle al ragù">
      <div class="grid3">
        <div><label>Categoria</label><input type="text" id="d-cat" value="${esc(d.category)}" placeholder="Primi, antipasti..."></div>
        <div><label>Porzione finale (g/ml)</label><input type="number" id="d-portion" value="${d.portionG}"></div>
        <div><label>Tempo di preparazione (min)</label><input type="number" id="d-prep" value="${d.prepMin||''}"></div>
      </div>
      <label>Food cost target (%)</label>
      <input type="number" id="d-target" value="${d.foodCostTargetPct}">
      <label>Allergeni</label>
      <div class="chip-toggle" id="d-allergens">${ALLERGENS.map(a=>`<button type="button" data-a="${a}" class="${(d.allergens||[]).includes(a)?'on':''}">${a}</button>`).join('')}</div>
      <label>Componenti (ingredienti e/o sub-ricette — digita per cercare)</label>
      <div id="d-items"></div>
      <button class="btn ghost small mt-1" id="d-add-item" type="button">+ Componente</button>
      <label>Prezzo di vendita effettivo (€)</label>
      <input type="number" step="0.01" id="d-price" value="${d.priceActual}">
      <p class="small-note" id="d-preview">—</p>
      <label>Procedimento</label>
      <textarea id="d-steps">${esc(d.steps)}</textarea>
      <label>Note (impiattamento, varianti...)</label>
      <textarea id="d-notes">${esc(d.notes||'')}</textarea>
      <label>Foto del piatto (opzionale)</label>
      <input type="file" id="d-photo-input" accept="image/*">
      <div id="d-photo-preview">${d.photo? `<img src="${d.photo}" class="thumb">`:''}</div>
      <div class="row gap-3 mt-4">
        <button class="btn" id="d-save">Salva piatto</button>
        <button class="btn ghost" id="d-cancel">Annulla</button>
      </div>
    </div>
  `;
  let photoData = d.photo || '';
  document.getElementById('d-photo-input').addEventListener('change', async (e)=>{
    const file = e.target.files[0]; if(!file) return;
    photoData = await resizeImageToDataUrl(file, 500, 0.7);
    document.getElementById('d-photo-preview').innerHTML = `<img src="${photoData}" class="thumb">`;
  });
  const itemsContainer = document.getElementById('d-items');
  renderItemRows(itemsContainer, items, null);
  document.getElementById('d-add-item').addEventListener('click', ()=>{ items.push({kind:'custom', name:'', qty:'', unit:'g', cost:''}); renderItemRows(itemsContainer, items, null); updateDPreview(); });
  document.querySelectorAll('#d-allergens button').forEach(b=> b.addEventListener('click', ()=> b.classList.toggle('on')));
  function updateDPreview(){
    readItemRows(itemsContainer, items);
    const cost = items.reduce((s,it)=>s+itemCost(it),0);
    const target = parseFloat(document.getElementById('d-target').value)||30;
    const sugg = target>0? cost/(target/100) : 0;
    const priceActual = parseFloat(document.getElementById('d-price').value)||0;
    const realFc = priceActual>0 ? (cost/priceActual*100) : null;
    document.getElementById('d-preview').textContent = `Costo materia prima: € ${cost.toFixed(2)} · Prezzo suggerito: € ${sugg.toFixed(2)}${realFc!==null?` · Food cost reale: ${realFc.toFixed(1)}%`:''}`;
  }
  itemsContainer.addEventListener('input', updateDPreview);
  itemsContainer.addEventListener('change', ()=> setTimeout(updateDPreview,0));
  ['d-target','d-price'].forEach(id=> document.getElementById(id).addEventListener('input', updateDPreview));
  updateDPreview();
  document.getElementById('d-cancel').addEventListener('click', ()=> holder.innerHTML='');
  document.getElementById('d-save').addEventListener('click', ()=>{
    readItemRows(itemsContainer, items);
    const name = document.getElementById('d-name').value.trim();
    if(!name){ toast('Serve almeno il nome del piatto'); return; }
    const newDish = {
      id:d.id, name, category:document.getElementById('d-cat').value.trim(),
      items: items.filter(it=> it.kind!=='custom' || it.name),
      portionG:document.getElementById('d-portion').value, foodCostTargetPct:document.getElementById('d-target').value,
      priceActual:document.getElementById('d-price').value,
      allergens: Array.from(document.querySelectorAll('#d-allergens button.on')).map(b=>b.dataset.a),
      steps:document.getElementById('d-steps').value.trim(),
      prepMin:document.getElementById('d-prep').value,
      notes:document.getElementById('d-notes').value.trim(),
      photo: photoData,
    };
    const idx = state.recipes.findIndex(x=>x.id===d.id);
    if(idx>=0) state.recipes[idx]=newDish; else state.recipes.push(newDish);
    save('recipes'); holder.innerHTML=''; renderDishes(); toast('Piatto salvato');
  });
}
document.getElementById('btn-new-dish').addEventListener('click', ()=> openDishForm(null));
