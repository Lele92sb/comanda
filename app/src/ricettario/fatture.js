import { save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { renderSuppliers } from './fornitori.js';
import { renderIngredients } from './ingredienti.js';
import { applicaFatture } from './fatture/applica.ts';
import { annullaImportazione } from './fatture/annulla.ts';
import { fonteFile } from './fatture/fonti.ts';
import './fatture-vista.ts';
import { conferma } from '../core/state.js';

/* ============================= IMPORT FATTURE ELETTRONICHE =============================
   Questo file fa solo da collegamento fra lo schermo e i tre strati sotto:
     fatture/fonti.ts    da dove arrivano i documenti
     fatture/leggi.ts    come si interpreta una FatturaPA
     fatture/applica.ts  cosa cambia su fornitori e ingredienti
   Quei tre non toccano né schermo né salvataggi, e sono coperti dai test:
   da lì escono i prezzi d'acquisto su cui si calcola il food cost.
   ============================================================================ */

/* Il riquadro dell'esito: uno solo, riusato. Si crea alla prima importazione e
   resta li' spento finche' non c'e' qualcosa da dire. */
function esito(){
  const box = document.getElementById('invoice-log');
  if(!box) return null;
  let e = box.querySelector('cmd-esito-importazione');
  if(!e){ e = document.createElement('cmd-esito-importazione'); box.replaceChildren(e); }
  return e;
}

export async function importaDaFonte(fonte, periodo){
  const logEl = esito();
  const documenti = await fonte.elenca(periodo);
  if(!documenti.length){ toast('Nessuna fattura da importare'); return null; }

  const modifiche = applicaFatture(documenti, {
    fornitori: state.suppliers,
    ingredienti: state.ingredients,
    giaImportati: state.importedInvoices || [],
    storico: state.invoiceHistory || [],
  }, uid);

  state.suppliers = modifiche.fornitori;
  state.ingredients = modifiche.ingredienti;
  state.importedInvoices = modifiche.giaImportati;
  // Solo le ultime venti: serve a rimediare a un errore recente, non a tenere
  // un archivio contabile.
  state.invoiceHistory = modifiche.storico.slice(-20);
  await save('suppliers'); await save('ingredients');
  await save('importedInvoices'); await save('invoiceHistory');

  const parti = [];
  if(modifiche.fornitoriNuovi) parti.push(`${modifiche.fornitoriNuovi} nuovi fornitori`);
  if(modifiche.ingredientiNuovi) parti.push(`${modifiche.ingredientiNuovi} nuovi ingredienti`);
  if(modifiche.ingredientiAggiornati) parti.push(`${modifiche.ingredientiAggiornati} prezzi aggiornati`);
  if(modifiche.righeDiServizio) parti.push(`${modifiche.righeDiServizio} voci di servizio escluse`);
  if(modifiche.saltatiPerchéGiàImportati) parti.push(`${modifiche.saltatiPerchéGiàImportati} già importate`);
  if(modifiche.scartati) parti.push(`${modifiche.scartati} non leggibili`);

  if(logEl){
    // Il tono lo decide una cosa sola: se qualche fattura non si è potuta
    // leggere. Il resto sono numeri, e un numero non è un problema.
    logEl.tono = modifiche.scartati ? 'allarme' : 'ok';
    logEl.riassunto = (parti.length ? parti.join(', ') : 'Niente da aggiornare') + '.';
    logEl.dettagli = modifiche.resoconto;
    logEl.inCorso = '';
  }

  renderIngredients(); renderSuppliers(); renderStoricoImportazioni();
  toast('Fatture importate');

  // La resa (parte edibile) si stima solo per gli ingredienti appena nati:
  // su quelli esistenti lo chef potrebbe averla già corretta a mano.
  if(modifiche.creati.length){
    if(logEl) logEl.inCorso = `Sto stimando la resa per ${modifiche.creati.length} nuovi ingredienti…`;
    await estimateYieldsWithAI(modifiche.creati);
    if(logEl){
      logEl.inCorso = '';
      logEl.riassunto += " Resa stimata: controllala in Ingredienti, hanno l'etichetta «resa stimata AI».";
    }
    renderIngredients();
  }
  return modifiche;
}

/* ---- Storico e annullamento ---- */

let storicoVista = null;

export function renderStoricoImportazioni(){
  const el = document.getElementById('invoice-history');
  if(!el) return;
  if(!storicoVista || !storicoVista.isConnected){
    storicoVista = document.createElement('cmd-storico-fatture');
    storicoVista.addEventListener('importazione-annulla', e => annulla(e.detail.id));
    el.replaceChildren(storicoVista);
  }
  // Dalla piu' recente: chi apre questa scheda vuole quasi sempre disfare
  // l'ultima cosa che ha fatto.
  storicoVista.importazioni = (state.invoiceHistory || []).slice().reverse().map(imp => ({
    id: imp.id,
    fornitore: imp.fornitore,
    etichetta: imp.etichetta,
    quando: new Date(imp.quando).toLocaleString('it-IT',
      {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}),
    cosa: [
      imp.creati.length ? `${imp.creati.length} nuovi` : '',
      imp.aggiornati.length ? `${imp.aggiornati.length} aggiornati` : '',
    ].filter(Boolean).join(', ') || 'nessuna modifica',
  }));
}

async function annulla(id){
  const imp = (state.invoiceHistory||[]).find(x=>x.id===id);
  if(!imp) return;
  const ok = await conferma(`Annullare l'importazione di ${imp.fornitore}?`,
    `${imp.creati.length} ingredienti creati verranno tolti e ${imp.aggiornati.length} prezzi torneranno com'erano.
`
    + 'Quello che hai corretto a mano dopo resta come sta. La fattura potrà essere reimportata.',
    {conferma:'Annulla importazione', pericolo:true});
  if(!ok) return;

  const risultato = annullaImportazione(imp, {
    fornitori: state.suppliers, ingredienti: state.ingredients,
    giaImportati: state.importedInvoices || [], storico: state.invoiceHistory || [],
  });
  state.suppliers = risultato.fornitori;
  state.ingredients = risultato.ingredienti;
  state.importedInvoices = risultato.giaImportati;
  state.invoiceHistory = risultato.storico;
  await save('suppliers'); await save('ingredients');
  await save('importedInvoices'); await save('invoiceHistory');

  const parti = [];
  if(risultato.ingredientiRimossi) parti.push(`${risultato.ingredientiRimossi} ingredienti tolti`);
  if(risultato.prezziRipristinati) parti.push(`${risultato.prezziRipristinati} prezzi ripristinati`);
  if(risultato.fornitoriRimossi) parti.push('fornitore rimosso');

  const e = esito();
  if(e){
    e.tono = 'ok';
    e.riassunto = 'Importazione annullata: ' + (parti.join(', ') || 'niente da ripristinare') + '.';
    // Quello che NON e' tornato indietro perche' era stato corretto a mano: e'
    // la parte che conta, ed e' il motivo per cui l'annullamento e' sicuro.
    e.dettagli = risultato.lasciateComeStavano;
    e.inCorso = '';
  }

  renderIngredients(); renderSuppliers(); renderStoricoImportazioni();
  toast('Importazione annullata');
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
