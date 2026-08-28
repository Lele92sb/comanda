import { esc, save, state, toast, uid } from '../core/state.js';
import { ingredientEffectiveCost } from './costi.js';
/* ============================= INGREDIENTI ============================= */
export function renderIngredients(){
  const el = document.getElementById('ing-list');
  if(!state.ingredients.length){ el.innerHTML = `<div class="empty">Nessun ingrediente in anagrafica. Aggiungi il primo.</div>`; return; }
  el.innerHTML = state.ingredients.map(ing=>{
    const eff = ingredientEffectiveCost(ing);
    const incomplete = !parseFloat(ing.price);
    return `
    <div class="staff-card">
      <div>
        <div class="bold">${esc(ing.name)} ${incomplete?'<span class="tag alert" >prezzo mancante</span>':''}${ing.yieldEstimated?'<span class="tag ok" >resa stimata AI</span>':''}</div>
        <div class="contact">${esc(ing.supplier||'—')} · € ${(parseFloat(ing.price)||0).toFixed(3)}/${esc(ing.unit)} acquisto · resa ${ing.yieldPct||100}% · scarto ${(100-(parseFloat(ing.yieldPct)||100)).toFixed(0)}%</div>
        <div class="contact text-accent" >costo effettivo: € ${eff.toFixed(3)}/${esc(ing.unit)}</div>
      </div>
      <div class="col">
        <button class="btn ghost small" data-edit="${ing.id}">Modifica</button>
        <button class="btn ghost small text-alert" data-del="${ing.id}">Elimina</button>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', ()=> openIngForm(state.ingredients.find(i=>i.id===b.dataset.edit))));
  el.querySelectorAll('[data-del]').forEach(b=> b.addEventListener('click', ()=>{
    state.ingredients = state.ingredients.filter(i=>i.id!==b.dataset.del);
    save('ingredients'); renderIngredients(); toast('Ingrediente eliminato');
  }));
}
function openIngForm(existing){
  const holder = document.getElementById('ing-form-holder');
  const ing = existing || {id:uid(), name:'', supplier:'', unit:'kg', price:'', yieldPct:100};
  holder.innerHTML = `
    <div class="panel">
      <h3>${existing?'Modifica ingrediente':'Nuovo ingrediente'}</h3>
      <label>Nome ingrediente</label>
      <input type="text" id="i-name" value="${esc(ing.name)}" placeholder="es. Asparagi extra">
      <label>Fornitore</label>
      <select id="i-supplier">
        <option value="">— nessuno —</option>
        ${state.suppliers.map(s=>`<option value="${esc(s.name)}" ${ing.supplier===s.name?'selected':''}>${esc(s.name)}</option>`).join('')}
        <option value="__new__" ${ing.supplier && !state.suppliers.find(s=>s.name===ing.supplier) ? 'selected':''}>+ Nuovo fornitore…</option>
      </select>
      <input type="text" id="i-supplier-new" placeholder="Nome nuovo fornitore" value="${ing.supplier && !state.suppliers.find(s=>s.name===ing.supplier) ? esc(ing.supplier) : ''}" style="margin-top:6px;display:${ing.supplier && !state.suppliers.find(s=>s.name===ing.supplier) ? 'block':'none'};">
      <div class="grid3">
        <div><label>Unità d'acquisto</label>
          <select id="i-unit"><option value="kg" ${ing.unit==='kg'?'selected':''}>kg</option><option value="l" ${ing.unit==='l'?'selected':''}>l</option><option value="pz" ${ing.unit==='pz'?'selected':''}>pz</option></select>
        </div>
        <div><label>Prezzo acquisto (€/unità)</label><input type="number" step="0.001" id="i-price" value="${ing.price}"></div>
        <div><label>Resa / parte edibile (%)</label><input type="number" step="1" min="1" max="100" id="i-yield" value="${ing.yieldPct}"></div>
      </div>
      <p class="small-note" id="i-preview">Costo effettivo: —</p>
      <div class="row gap-3 mt-3">
        <button class="btn" id="i-save">Salva</button>
        <button class="btn ghost" id="i-cancel">Annulla</button>
      </div>
    </div>
  `;
  function updatePreview(){
    const price = parseFloat(document.getElementById('i-price').value)||0;
    const yieldPct = parseFloat(document.getElementById('i-yield').value)||100;
    const eff = yieldPct>0 ? price/(yieldPct/100) : 0;
    document.getElementById('i-preview').textContent = `Costo effettivo: € ${eff.toFixed(3)} per ${document.getElementById('i-unit').value} (scarto ${(100-yieldPct).toFixed(0)}%)`;
  }
  ['i-price','i-yield','i-unit'].forEach(id=> document.getElementById(id).addEventListener('input', updatePreview));
  updatePreview();
  document.getElementById('i-supplier').addEventListener('change', (e)=>{
    document.getElementById('i-supplier-new').style.display = e.target.value==='__new__' ? 'block' : 'none';
  });
  document.getElementById('i-cancel').addEventListener('click', ()=> holder.innerHTML='');
  document.getElementById('i-save').addEventListener('click', ()=>{
    const name = document.getElementById('i-name').value.trim();
    if(!name){ toast('Serve il nome'); return; }
    let supplierName = document.getElementById('i-supplier').value;
    if(supplierName==='__new__'){
      supplierName = document.getElementById('i-supplier-new').value.trim();
      if(supplierName && !state.suppliers.find(s=>s.name.toLowerCase()===supplierName.toLowerCase())){
        state.suppliers.push({id:uid(), name:supplierName, piva:'', phone:'', email:'', address:''});
        save('suppliers');
      }
    }
    const newIng = { id:ing.id, name, supplier:supplierName,
      unit:document.getElementById('i-unit').value, price:document.getElementById('i-price').value,
      yieldPct:document.getElementById('i-yield').value };
    const idx = state.ingredients.findIndex(x=>x.id===ing.id);
    if(idx>=0) state.ingredients[idx]=newIng; else state.ingredients.push(newIng);
    save('ingredients'); holder.innerHTML=''; renderIngredients(); toast('Ingrediente salvato');
  });
}
document.getElementById('btn-new-ing').addEventListener('click', ()=> openIngForm(null));
