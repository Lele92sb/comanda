import { esc, save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { itemCost, itemLabel, subrecipeCost, subrecipeRawWeightKg } from './costi.js';
import { montaRighe } from './righe.js';
import './ricette-vista.ts';
/* ============================= SUB-RICETTE ============================= */
let elenco = null;

/* Il calo peso: quanto si perde in cottura. Si puo' dire solo quando la resa e'
   in chili, perche' e' li' che il confronto col peso crudo ha un senso — due
   litri di fondo non si confrontano con tre chili di ossa. */
function caloPeso(sub){
  const crudoKg = subrecipeRawWeightKg(sub);
  if(!crudoKg || sub.yieldUnit !== 'kg' || crudoKg <= 0) return null;
  return (crudoKg - parseFloat(sub.yieldQty)) / crudoKg * 100;
}

function daDisegnare(){
  return state.subrecipes.map((sub, i) => {
    const { totalCost, costPerUnit } = subrecipeCost(sub);
    const calo = caloPeso(sub);
    return {
      id: sub.id,
      nome: sub.name,
      numero: 'SUB' + String(i + 1).padStart(3, '0'),
      resa: 'resa ' + (sub.yieldQty || '—') + ' ' + sub.yieldUnit
            + (calo !== null ? ' · calo peso ' + calo.toFixed(0) + '%' : ''),
      voci: (sub.items || []).map(it => ({
        nome: itemLabel(it),
        quantita: it.qty + it.unit + ' · €' + itemCost(it).toFixed(2),
      })),
      metriche: [
        { etichetta: 'Costo totale', valore: '€ ' + totalCost.toFixed(2) },
        { etichetta: 'Costo per ' + sub.yieldUnit, valore: '€ ' + costPerUnit.toFixed(2) },
      ],
      note: sub.notes || '',
    };
  });
}

export function renderSubrecipes(){
  const el = document.getElementById('subr-list');
  if(!el) return;
  if(!elenco || !elenco.isConnected){
    elenco = document.createElement('cmd-sub-ricette');
    elenco.addEventListener('sub-nuova', ()=> openSubForm(null));
    elenco.addEventListener('sub-modifica', e =>
      openSubForm(state.subrecipes.find(s => s.id === e.detail.id)));
    elenco.addEventListener('sub-elimina', e => {
      state.subrecipes = state.subrecipes.filter(s => s.id !== e.detail.id);
      save('subrecipes'); renderSubrecipes(); toast('Sub-ricetta eliminata');
    });
    el.replaceChildren(elenco);
  }
  elenco.sottoricette = daDisegnare();
  elenco.soloLettura = Cloud.enabled && !Cloud.canWrite();
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
