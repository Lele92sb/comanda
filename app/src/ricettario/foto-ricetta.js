import { save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { switchTab } from '../ui/tabs.js';
import { subUnitOptions } from './costi.js';
import { openDishForm } from './piatti.js';
import { openSubForm } from './subricette.js';
/* ============================= FOTO → RICETTA (OCR via AI) ============================= */
export function resizeImageToDataUrl(file, maxDim, quality){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e)=>{
      const img = new Image();
      img.onerror = reject;
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w>h){ if(w>maxDim){ h = Math.round(h*maxDim/w); w = maxDim; } }
        else { if(h>maxDim){ w = Math.round(w*maxDim/h); h = maxDim; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality||0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
// Le unità di una ricetta non sono quelle di una fattura: un appunto di cucina
// scrive "g" e "ml", una fattura elettronica scrive "KG" e "LT". Usare
// mapInvoiceUnit qui faceva cadere tutto su "pz", e un ingrediente da 300 g
// diventava "300 pezzi" — con un food cost senza alcun senso.
// Ritorna: base = unità di acquisto dell'ingrediente, unit = unità della riga,
// factor = moltiplicatore per la quantità (i cl vanno portati a ml).
function mapRecipeUnit(raw){
  const u = (raw||'').toLowerCase().trim().replace(/\./g,'');
  if(['g','gr','grammi','gram'].includes(u))        return {base:'kg', unit:'g',  factor:1};
  if(['kg','chilo','chili','kilo'].includes(u))     return {base:'kg', unit:'kg', factor:1};
  if(['ml','millilitri','cc'].includes(u))          return {base:'l',  unit:'ml', factor:1};
  if(['cl','centilitri'].includes(u))               return {base:'l',  unit:'ml', factor:10};
  if(['l','lt','litro','litri'].includes(u))        return {base:'l',  unit:'l',  factor:1};
  return {base:'pz', unit:'pz', factor:1};
}

let ocrTarget = 'dish';
document.getElementById('btn-photo-dish').addEventListener('click', ()=>{ ocrTarget='dish'; });
document.getElementById('btn-photo-sub').addEventListener('click', ()=>{ ocrTarget='sub'; });
document.getElementById('dish-photo-input').addEventListener('change', async (e)=>{
  const file = e.target.files[0]; if(!file) return;
  const statusEl = document.getElementById('ocr-status');
  statusEl.classList.remove('hidden');
  statusEl.textContent = 'Sto leggendo la ricetta dalla foto…';
  try{
    const dataUrl = await resizeImageToDataUrl(file, 1500, 0.85);
    const base64 = dataUrl.split(',')[1];
    const mediaType = dataUrl.substring(5, dataUrl.indexOf(';'));
    const data = await Cloud.ai({
      task: 'ocr',
      system: "Sei un assistente che trascrive ricette scritte a mano o su appunti di cucina fotografati, in JSON strutturato. Rispondi SOLO con JSON valido, senza testo aggiuntivo e senza blocchi di codice markdown. Schema esatto: {\"name\":string, \"category\":string, \"portionG\": number|null, \"prepMin\": number|null, \"ingredients\":[{\"name\":string,\"qty\":number|null,\"unit\":string}], \"steps\": string}. Se un campo non è leggibile lascialo vuoto/null, non inventare valori.",
      messages: [{ role:"user", content:[
        {type:"image", source:{type:"base64", media_type:mediaType, data:base64}},
        {type:"text", text:"Trascrivi questa ricetta nel formato JSON richiesto."}
      ]}]
    });
    const textBlocks = (data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
    const clean = textBlocks.replace(/```json|```/g,'').trim();
    const parsed = JSON.parse(clean);
    let createdCount = 0;
    const items = (parsed.ingredients||[]).map(ocrIng=>{
      const name = (ocrIng.name||'').trim();
      if(!name) return null;
      const letta = mapRecipeUnit(ocrIng.unit);
      let match = state.ingredients.find(i=> i.name.toLowerCase()===name.toLowerCase());
      if(!match){
        match = { id:uid(), name, supplier:'', unit:letta.base, price:'', yieldPct:100 };
        state.ingredients.push(match);
        createdCount++;
      }
      // Se l'ingrediente esisteva già, comanda l'unità decisa dallo chef in
      // anagrafica: non è la foto a dover riscrivere il suo ricettario.
      const validUnits = subUnitOptions(match.unit);
      const itemUnit = validUnits.includes(letta.unit) ? letta.unit : validUnits[0];
      const qty = parseFloat(ocrIng.qty);
      const qtyFinale = isNaN(qty) ? '' : (itemUnit === letta.unit ? qty * letta.factor : qty);
      return {kind:'ingredient', refId:match.id, qty:qtyFinale, unit:itemUnit};
    }).filter(Boolean);
    if(createdCount) await save('ingredients');
    statusEl.classList.add('hidden');
    const subTarget = ocrTarget === 'sub';
    switchTab('ricette');
    document.querySelectorAll('#ricette-subtabs button').forEach(x=>x.classList.toggle('active', x.dataset.sub===(subTarget?'subricette':'piatti')));
    document.querySelectorAll('#view-ricette .subview').forEach(v=>v.classList.toggle('active', v.id===(subTarget?'sub-subricette':'sub-piatti')));
    if(subTarget){
      openSubForm(null, { name: parsed.name || '', items, notes: parsed.steps || '' });
    } else {
      const prefill = {
        name: parsed.name || '', category: parsed.category || '', portionG: parsed.portionG || '',
        prepMin: parsed.prepMin || '', steps: parsed.steps || '', items,
      };
      openDishForm(null, prefill);
    }
    toast(createdCount ? `Ricetta letta — ${createdCount} nuovi ingredienti censiti da completare` : 'Ricetta letta dalla foto — controlla i campi');
  }catch(err){
    statusEl.textContent = err.userFacing ? err.message
      : 'Non sono riuscito a leggere la ricetta dalla foto. Riprova con una foto più a fuoco.';
    setTimeout(()=> statusEl.classList.add('hidden'), 6000);
  }
  e.target.value = '';
});
