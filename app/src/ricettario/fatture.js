import { esc, save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { p7mArrayBufferToXmlText } from '../lib/fatture-firmate.js';
import { renderSuppliers } from './fornitori.js';
import { renderIngredients } from './ingredienti.js';
/* ============================= IMPORT FATTURE ELETTRONICHE (FatturaPA XML) ============================= */
function xmlText(root, tag){
  const el = root.getElementsByTagName(tag)[0];
  return el ? el.textContent.trim() : '';
}
function mapInvoiceUnit(um){
  const u = (um||'').toUpperCase();
  if(u.indexOf('KG')>=0) return 'kg';
  if(u.indexOf('LT')>=0 || u==='L') return 'l';
  return 'pz';
}
function parseFatturaXML(text){
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if(doc.getElementsByTagName('parsererror').length) return null;
  const cedente = doc.getElementsByTagName('CedentePrestatore')[0];
  if(!cedente) return null;
  const anagrafica = cedente.getElementsByTagName('Anagrafica')[0];
  const supplierName = anagrafica ? (xmlText(anagrafica,'Denominazione') || (xmlText(anagrafica,'Nome')+' '+xmlText(anagrafica,'Cognome')).trim()) : '';
  const idFiscale = cedente.getElementsByTagName('IdFiscaleIVA')[0];
  const piva = idFiscale ? xmlText(idFiscale,'IdCodice') : '';
  const contatti = cedente.getElementsByTagName('Contatti')[0];
  const phone = contatti ? xmlText(contatti,'Telefono') : '';
  const email = contatti ? xmlText(contatti,'Email') : '';
  const sede = cedente.getElementsByTagName('Sede')[0];
  const address = sede ? [xmlText(sede,'Indirizzo'), xmlText(sede,'CAP'), xmlText(sede,'Comune'), xmlText(sede,'Provincia')].filter(Boolean).join(' - ') : '';

  const lines = [];
  Array.from(doc.getElementsByTagName('DettaglioLinee')).forEach(line=>{
    const descrizione = xmlText(line,'Descrizione');
    const qty = parseFloat(xmlText(line,'Quantita')) || 1;
    const um = xmlText(line,'UnitaMisura');
    const prezzoUnitario = parseFloat(xmlText(line,'PrezzoUnitario')) || 0;
    if(descrizione) lines.push({descrizione, qty, um, prezzoUnitario});
  });
  return { supplier:{name:supplierName, piva, phone, email, address}, lines };
}
document.getElementById('invoice-import-btn').addEventListener('click', async ()=>{
  const input = document.getElementById('invoice-input');
  const files = Array.from(input.files||[]);
  if(!files.length){ toast('Seleziona almeno un file XML'); return; }
  let newSuppliers=0, newIngredients=0, updatedIngredients=0, skipped=0;
  const logLines = [];
  const createdIngredients = [];
  for(const file of files){
    let text;
    const isP7m = /\.p7m$/i.test(file.name);
    try{
      if(isP7m){
        const buf = await file.arrayBuffer();
        text = p7mArrayBufferToXmlText(buf);
        if(!text){ skipped++; logLines.push(`⚠ ${file.name}: firma non riconosciuta (struttura .p7m non standard). Prova a esportare l'XML non firmato dal tuo gestionale.`); continue; }
      } else {
        text = await file.text();
      }
    }catch(e){ skipped++; logLines.push(`⚠ ${file.name}: errore di lettura del file.`); continue; }
    const parsed = parseFatturaXML(text);
    if(!parsed || !parsed.supplier.name){ skipped++; logLines.push(`⚠ ${file.name}: non riconosciuto come FatturaPA XML valido.`); continue; }
    let supplier = state.suppliers.find(s=> (parsed.supplier.piva && s.piva===parsed.supplier.piva) || s.name.toLowerCase()===parsed.supplier.name.toLowerCase());
    if(!supplier){
      supplier = {id:uid(), name:parsed.supplier.name, piva:parsed.supplier.piva, phone:parsed.supplier.phone, email:parsed.supplier.email, address:parsed.supplier.address};
      state.suppliers.push(supplier); newSuppliers++;
      logLines.push(`+ Nuovo fornitore: ${supplier.name}`);
    }
    parsed.lines.forEach(line=>{
      const unit = mapInvoiceUnit(line.um);
      let ing = state.ingredients.find(i=> i.name.toLowerCase()===line.descrizione.toLowerCase() && i.supplier===supplier.name);
      if(ing){
        ing.price = line.prezzoUnitario; ing.unit = unit; updatedIngredients++;
        logLines.push(`↻ Aggiornato: ${ing.name} → € ${line.prezzoUnitario.toFixed(3)}/${unit}`);
      } else {
        const newIng = { id:uid(), name:line.descrizione, supplier:supplier.name, unit, price:line.prezzoUnitario, yieldPct:100 };
        state.ingredients.push(newIng);
        createdIngredients.push(newIng);
        newIngredients++;
        logLines.push(`+ Nuovo ingrediente: ${line.descrizione} (€ ${line.prezzoUnitario.toFixed(3)}/${unit})`);
      }
    });
  }
  await save('suppliers'); await save('ingredients');
  const logEl = document.getElementById('invoice-log');
  logEl.innerHTML = `<div class="ok-box">Importazione completata: ${newSuppliers} nuovi fornitori, ${newIngredients} nuovi ingredienti, ${updatedIngredients} aggiornati${skipped?`, ${skipped} file non leggibili`:''}.</div>` +
    `<div class="small-note" style="white-space:pre-line;">${logLines.map(esc).join('\n')}</div>`;
  renderIngredients(); renderSuppliers();
  toast('Fatture importate');

  if(createdIngredients.length){
    logEl.innerHTML += `<div class="small-note">Sto stimando la resa (parte edibile) per i nuovi ingredienti…</div>`;
    await estimateYieldsWithAI(createdIngredients);
    logEl.innerHTML += `<div class="ok-box">Resa stimata per ${createdIngredients.length} ingredienti — controllala in "Ingredienti" (badge "resa stimata AI").</div>`;
    renderIngredients();
  }
});
async function estimateYieldsWithAI(ingredientsList){
  const batches = [];
  for(let i=0;i<ingredientsList.length;i+=40) batches.push(ingredientsList.slice(i,i+40));
  for(const batch of batches){
    try{
      const data = await Cloud.ai({
        task: 'yield',
        system:"Sei un esperto di cucina professionale italiana. Per ogni ingrediente ricevuto (nome da fattura fornitore, spesso con formato/origine nel testo) stima la resa a parte edibile in percentuale (%) tipica dopo pulizia e scarto: verdure con scarto in base al tipo, carne con osso vs disossata, pesce intero vs filetto, prodotti già puliti/confezionati/secchi/inscatolati = 100%. Rispondi SOLO con un JSON array, senza testo aggiuntivo: [{\"name\":\"...\",\"yieldPct\":numero}]. Usa esattamente i nomi ricevuti.",
        messages:[{role:"user", content: batch.map(i=>i.name).join('\n')}]
      });
      const textBlocks = (data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
      const clean = textBlocks.replace(/```json|```/g,'').trim();
      const estimates = JSON.parse(clean);
      estimates.forEach(est=>{
        const ing = batch.find(i=>i.name===est.name);
        if(ing && est.yieldPct){ ing.yieldPct = est.yieldPct; ing.yieldEstimated = true; }
      });
    }catch(e){ /* stima non riuscita per questo batch: resta resa 100% di default, nessun blocco */ }
  }
  await save('ingredients');
}
