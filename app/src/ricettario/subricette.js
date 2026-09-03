import { save, state, toast, uid } from '../core/state.js';
import { soldi } from '../core/valuta.ts';
import { Cloud } from '../lib/cloud.js';
import { itemCost, itemLabel, subrecipeCost, subrecipeRawWeightKg } from './costi.js';
import { montaRighe } from './righe.js';
import './ricette-vista.ts';
import './schede-ricetta-vista.ts';
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
        quantita: it.qty + it.unit + ' · ' + soldi(itemCost(it)),
      })),
      metriche: [
        { etichetta: 'Costo totale', valore: soldi(totalCost) },
        { etichetta: 'Costo per ' + sub.yieldUnit, valore: soldi(costPerUnit) },
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

let scheda = null;

function chiudiScheda(){
  const holder = document.getElementById('subr-form-holder');
  if(holder) holder.replaceChildren();
  scheda = null;
}

export function openSubForm(existing, prefill){
  const holder = document.getElementById('subr-form-holder');
  if(!holder) return;
  const base = {id:uid(), name:'', items:[], yieldQty:'', yieldUnit:'kg', notes:''};
  const sub = existing || Object.assign(base, prefill || {});
  // Si lavora su una COPIA dei componenti: chi annulla non cambia niente.
  const items = JSON.parse(JSON.stringify(sub.items || []));

  scheda = document.createElement('cmd-scheda-sub');
  scheda.nuova = !existing;
  scheda.daFoto = Boolean(prefill && !existing);
  scheda.nome = sub.name || '';
  scheda.resa = sub.yieldQty == null ? '' : String(sub.yieldQty);
  scheda.unita = sub.yieldUnit || 'kg';
  scheda.note = sub.notes || '';

  // Le righe dei componenti stanno nel posto che il componente lascia libero.
  const righe = document.createElement('div');
  righe.slot = 'righe';
  scheda.appendChild(righe);

  const rifaiConto = ()=>{
    const totale = items.reduce((n, it) => n + itemCost(it), 0);
    const resa = parseFloat(scheda.resa) || 0;
    scheda.conto = {
      totale: soldi(totale),
      perUnita: resa > 0 ? soldi(totale / resa) : '',
      // Il calo peso e' la ragione per cui il costo per chilo di una
      // sub-ricetta non e' il costo dei suoi componenti diviso il loro peso.
      spiega: resa > 0
        ? ''
        : 'Scrivi la resa: senza, non si sa quanto costa un ' + scheda.unita + ' di questa preparazione dentro un piatto.',
    };
  };

  montaRighe(righe, items, { escludiSubId: sub.id, alCambio: rifaiConto });
  rifaiConto();

  scheda.addEventListener('sub-conto', rifaiConto);
  scheda.addEventListener('sub-annulla', chiudiScheda);
  scheda.addEventListener('sub-salva', e => {
    const idx = state.subrecipes.findIndex(x => x.id === sub.id);
    // Si parte da quella che c'era: i campi che questa scheda non governa non
    // spariscono alla prima modifica.
    const aggiornata = Object.assign({}, idx >= 0 ? state.subrecipes[idx] : {}, {
      id: sub.id,
      name: e.detail.nome,
      // Una voce libera senza nome non e' una riga: e' una riga dimenticata.
      items: items.filter(it => it.kind !== 'custom' || it.name),
      yieldQty: e.detail.resa,
      yieldUnit: e.detail.unita,
      notes: e.detail.note,
    });
    if(idx >= 0) state.subrecipes[idx] = aggiornata; else state.subrecipes.push(aggiornata);
    save('subrecipes'); chiudiScheda(); renderSubrecipes(); toast('Sub-ricetta salvata');
  });

  holder.replaceChildren(scheda);
  scheda.updateComplete.then(()=> scheda.renderRoot.querySelector('#s-nome')?.focus());
}

document.getElementById('btn-new-sub').addEventListener('click', ()=> openSubForm(null));
