import { esc, save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { renderSuppliers } from './fornitori.js';
import { renderIngredients } from './ingredienti.js';
import { applicaFatture } from './fatture/applica.ts';
import { fonteFile } from './fatture/fonti.ts';

/* ============================= IMPORT FATTURE ELETTRONICHE =============================
   Questo file fa solo da collegamento fra lo schermo e i tre strati sotto:
     fatture/fonti.ts    da dove arrivano i documenti
     fatture/leggi.ts    come si interpreta una FatturaPA
     fatture/applica.ts  cosa cambia su fornitori e ingredienti
   Quei tre non toccano né schermo né salvataggi, e sono coperti dai test:
   da lì escono i prezzi d'acquisto su cui si calcola il food cost.
   ============================================================================ */

export async function importaDaFonte(fonte, periodo){
  const logEl = document.getElementById('invoice-log');
  const documenti = await fonte.elenca(periodo);
  if(!documenti.length){ toast('Nessuna fattura da importare'); return null; }

  const modifiche = applicaFatture(documenti, {
    fornitori: state.suppliers,
    ingredienti: state.ingredients,
    giaImportati: state.importedInvoices || [],
  }, uid);

  state.suppliers = modifiche.fornitori;
  state.ingredients = modifiche.ingredienti;
  state.importedInvoices = modifiche.giaImportati;
  await save('suppliers'); await save('ingredients'); await save('importedInvoices');

  const parti = [];
  if(modifiche.fornitoriNuovi) parti.push(`${modifiche.fornitoriNuovi} nuovi fornitori`);
  if(modifiche.ingredientiNuovi) parti.push(`${modifiche.ingredientiNuovi} nuovi ingredienti`);
  if(modifiche.ingredientiAggiornati) parti.push(`${modifiche.ingredientiAggiornati} prezzi aggiornati`);
  if(modifiche.saltatiPerchéGiàImportati) parti.push(`${modifiche.saltatiPerchéGiàImportati} già importate`);
  if(modifiche.scartati) parti.push(`${modifiche.scartati} non leggibili`);

  logEl.innerHTML =
    `<div class="ok-box">${parti.length ? parti.join(', ') : 'Niente da aggiornare'}.</div>` +
    (modifiche.resoconto.length
      ? `<div class="small-note" style="white-space:pre-line;">${modifiche.resoconto.map(esc).join('\n')}</div>`
      : '');

  renderIngredients(); renderSuppliers();
  toast('Fatture importate');

  // La resa (parte edibile) si stima solo per gli ingredienti appena nati:
  // su quelli esistenti lo chef potrebbe averla già corretta a mano.
  if(modifiche.creati.length){
    logEl.innerHTML += `<div class="small-note">Sto stimando la resa per ${modifiche.creati.length} nuovi ingredienti…</div>`;
    await estimateYieldsWithAI(modifiche.creati);
    logEl.innerHTML += `<div class="ok-box">Resa stimata — controllala in "Ingredienti" (badge "resa stimata AI").</div>`;
    renderIngredients();
  }
  return modifiche;
}

document.getElementById('invoice-import-btn').addEventListener('click', async ()=>{
  const input = document.getElementById('invoice-input');
  const files = Array.from(input.files||[]);
  if(!files.length){ toast('Seleziona almeno un file XML'); return; }
  await importaDaFonte(fonteFile(files));
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
        const ing = state.ingredients.find(i=>i.name===est.name);
        if(ing && est.yieldPct){ ing.yieldPct = est.yieldPct; ing.yieldEstimated = true; }
      });
    }catch(e){ /* stima non riuscita per questo lotto: resta resa 100%, nessun blocco */ }
  }
  await save('ingredients');
}
