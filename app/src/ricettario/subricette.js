import { esc, save, state, toast, uid } from '../core/state.js';
import { itemCost, itemLabel, subrecipeCost, subrecipeRawWeightKg } from './costi.js';
import { montaRighe } from './righe.js';
/* ============================= SUB-RICETTE ============================= */
export function renderSubrecipes(){
  const el = document.getElementById('subr-list');
  if(!state.subrecipes.length){ el.innerHTML = `<div class="empty">Nessuna sub-ricetta ancora (fondi, salse, basi, composte...).</div>`; return; }
  el.innerHTML = state.subrecipes.map((sub,idx)=>{
    const {totalCost, costPerUnit} = subrecipeCost(sub);
    const rawKg = subrecipeRawWeightKg(sub);
    const calo = (rawKg && sub.yieldUnit==='kg' && rawKg>0) ? ((rawKg-parseFloat(sub.yieldQty))/rawKg*100) : null;
    return `
    <div class="comanda">
      <div class="comanda-head">
        <div><div class="comanda-title">${esc(sub.name)}</div><div class="comanda-cat">resa ${sub.yieldQty||'—'} ${esc(sub.yieldUnit)}${calo!==null?` · calo peso ${calo.toFixed(0)}%`:''}</div></div>
        <div class="comanda-num">SUB${String(idx+1).padStart(3,'0')}</div>
      </div>
      <ul class="ing-list">${(sub.items||[]).map(it=>`<li><span class="n">${esc(itemLabel(it))}</span><span class="q">${it.qty}${esc(it.unit)} · €${itemCost(it).toFixed(2)}</span></li>`).join('')}</ul>
      <div class="metric-row">
        <div class="metric">Costo totale<b>€ ${totalCost.toFixed(2)}</b></div>
        <div class="metric">Costo per ${esc(sub.yieldUnit)}<b>€ ${costPerUnit.toFixed(2)}</b></div>
      </div>
      ${sub.notes? `<div class="steps">${esc(sub.notes)}</div>`:''}
      <div class="card-actions">
        <button data-edit="${sub.id}">Modifica</button>
        <button class="danger" data-del="${sub.id}">Elimina</button>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', ()=> openSubForm(state.subrecipes.find(s=>s.id===b.dataset.edit))));
  el.querySelectorAll('[data-del]').forEach(b=> b.addEventListener('click', ()=>{
    state.subrecipes = state.subrecipes.filter(s=>s.id!==b.dataset.del);
    save('subrecipes'); renderSubrecipes(); toast('Sub-ricetta eliminata');
  }));
}
export function openSubForm(existing, prefill){
  const holder = document.getElementById('subr-form-holder');
  const base = {id:uid(), name:'', items:[], yieldQty:'', yieldUnit:'kg', notes:''};
  const sub = existing || Object.assign(base, prefill||{});
  let items = JSON.parse(JSON.stringify(sub.items));
  holder.innerHTML = `
    <div class="panel">
      <h3>${existing?'Modifica sub-ricetta':'Nuova sub-ricetta'}</h3>
      ${prefill&&!existing? `<div class="ok-box">Campi precompilati dalla foto — controlla componenti e quantità, e imposta tu la resa finale (non deducibile dalla foto).</div>`:''}
      <label>Nome (es. Ragù di carne, Fondo di vitello)</label>
      <input type="text" id="sb-name" value="${esc(sub.name)}">
      <label>Componenti</label>
      <div id="sb-items"></div>
      <div class="grid2 mt-3" >
        <div><label>Resa finale (quantità ottenuta dopo cottura/lavorazione)</label><input type="number" step="0.001" id="sb-yieldqty" value="${sub.yieldQty}"></div>
        <div><label>Unità resa</label><select id="sb-yieldunit"><option value="kg" ${sub.yieldUnit==='kg'?'selected':''}>kg</option><option value="l" ${sub.yieldUnit==='l'?'selected':''}>l</option><option value="pz" ${sub.yieldUnit==='pz'?'selected':''}>pz</option></select></div>
      </div>
      <label>Note (procedimento, calo peso previsto, ecc.)</label>
      <textarea id="sb-notes">${esc(sub.notes)}</textarea>
      <p class="small-note" id="sb-preview">—</p>
      <div class="row gap-3 mt-3">
        <button class="btn" id="sb-save">Salva sub-ricetta</button>
        <button class="btn ghost" id="sb-cancel">Annulla</button>
      </div>
    </div>
  `;
  const itemsContainer = document.getElementById('sb-items');
  // Le righe si tengono aggiornate da sole: `items` viene modificato sul posto
  // e `alCambio` rifa' il conto. Prima bisognava ricordarsi di rileggere il DOM
  // (readItemRows) prima di ogni calcolo e prima di salvare — ed era il passo
  // che si poteva dimenticare.
  montaRighe(itemsContainer, items, { escludiSubId: sub.id, alCambio: updateSbPreview });
  function updateSbPreview(){
    const totalCost = items.reduce((s,it)=>s+itemCost(it),0);
    const yq = parseFloat(document.getElementById('sb-yieldqty').value)||0;
    const cpu = yq>0? totalCost/yq : 0;
    document.getElementById('sb-preview').textContent = `Costo totale componenti: € ${totalCost.toFixed(2)} · Costo per ${document.getElementById('sb-yieldunit').value}: € ${cpu.toFixed(2)}`;
  }
  document.getElementById('sb-yieldqty').addEventListener('input', updateSbPreview);
  document.getElementById('sb-yieldunit').addEventListener('change', updateSbPreview);
  updateSbPreview();
  document.getElementById('sb-cancel').addEventListener('click', ()=> holder.innerHTML='');
  document.getElementById('sb-save').addEventListener('click', ()=>{
    const name = document.getElementById('sb-name').value.trim();
    if(!name){ toast('Serve il nome della sub-ricetta'); return; }
    const newSub = { id:sub.id, name, items: items.filter(it=> it.kind!=='custom' || it.name),
      yieldQty:document.getElementById('sb-yieldqty').value, yieldUnit:document.getElementById('sb-yieldunit').value,
      notes:document.getElementById('sb-notes').value.trim() };
    const idx = state.subrecipes.findIndex(x=>x.id===sub.id);
    if(idx>=0) state.subrecipes[idx]=newSub; else state.subrecipes.push(newSub);
    save('subrecipes'); holder.innerHTML=''; renderSubrecipes(); toast('Sub-ricetta salvata');
  });
}
document.getElementById('btn-new-sub').addEventListener('click', ()=> openSubForm(null));
