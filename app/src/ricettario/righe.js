import { state, uid } from '../core/state.js';
import { ingredientById, itemCost, subUnitOptions, subrecipeById } from './costi.js';
import './righe-vista.ts';
/* ============ LE RIGHE DI UNA RICETTA (sub-ricette e piatti) ================

   QUESTO FILE E' SOLO IL COLLANTE. Il disegno sta in righe-vista.ts.

   Qui restano le tre cose che il componente non puo' sapere: quali unita' sono
   ammesse partendo da quella d'acquisto (un ingrediente comprato a kg si usa
   anche in grammi), quanto costa davvero una riga dopo scarto e calo, e cosa
   vuol dire cambiare il TIPO di una riga — che non e' modificare un campo, e'
   sostituirla con una riga nuova, perche' una voce libera e un ingrediente non
   hanno gli stessi campi.
   ============================================================================ */

/* La chiave di una riga sta FUORI dalla riga, in una mappa debole.
   Serve solo a disegnare — a non far saltare i campi mentre si scrive quando
   una riga piu' su viene tolta — e mettendola dentro l'oggetto finirebbe
   salvata nel database insieme alla ricetta, per sempre, senza servire a
   nessuno. La mappa e' debole: quando la riga sparisce, sparisce anche lei. */
const chiavi = new WeakMap();
function chiaveDi(it){
  let k = chiavi.get(it);
  if(!k){ k = uid(); chiavi.set(it, k); }
  return k;
}

/* Le unita' ammesse per una riga. Un ingrediente comprato a kg si puo' usare in
   g, e una sub-ricetta resa in litri si puo' usare in ml: e' `subUnitOptions`
   che lo sa, e parte dall'unita' di base di quello a cui la riga si riferisce. */
function unitaPossibili(it){
  if(it.kind === 'custom') return ['g','kg','ml','l','pz','cucchiaio'];
  const base = it.kind === 'ingredient'
    ? (ingredientById(it.refId) || {}).unit
    : (subrecipeById(it.refId) || {}).yieldUnit;
  return subUnitOptions(base || 'pz');
}

function daDisegnare(items){
  return items.map(it => ({
    chiave: chiaveDi(it),
    tipo: it.kind,
    refId: it.refId || '',
    nome: it.name || '',
    qta: it.qty == null ? '' : String(it.qty),
    unita: it.unit || 'g',
    costoUnitario: it.cost == null ? '' : String(it.cost),
    costoRiga: itemCost(it),
    unitaPossibili: unitaPossibili(it),
  }));
}

// Contenitore -> cosa serve per ridisegnarlo. Cosi' `montaRighe` si puo'
// richiamare per aggiornare senza dover ricreare niente.
const montati = new WeakMap();

/**
 * Mette (o aggiorna) l'elenco delle righe dentro `contenitore`.
 * `items` viene modificato SUL POSTO: chi lo passa se lo ritrova aggiornato,
 * come faceva la vecchia coppia renderItemRows/readItemRows — ma senza dover
 * ricordarsi di rileggere il DOM prima di salvare, che era il passo che si
 * poteva dimenticare.
 */
export function montaRighe(contenitore, items, opzioni = {}){
  const { escludiSubId = null, alCambio = () => {} } = opzioni;
  let vista = montati.get(contenitore);

  if(!vista || !vista.isConnected){
    vista = document.createElement('cmd-righe-ricetta');
    contenitore.replaceChildren(vista);
    montati.set(contenitore, vista);

    const ridisegna = ()=> montaRighe(contenitore, items, opzioni);

    vista.addEventListener('riga-aggiungi', ()=>{
      items.push({ kind:'custom', name:'', qty:'', unit:'g', cost:'' });
      ridisegna(); alCambio();
    });

    vista.addEventListener('riga-togli', e => {
      items.splice(e.detail.indice, 1);
      ridisegna(); alCambio();
    });

    vista.addEventListener('riga-cambia', e => {
      const { indice, campo, valore } = e.detail;
      const it = items[indice];
      if(!it) return;

      if(campo === 'tipo'){
        // Cambiare tipo non e' modificare un campo: e' sostituire la riga.
        // Una voce libera ha un nome e un prezzo suoi; un ingrediente ha un
        // riferimento all'anagrafica. Tenere i campi dell'una addosso all'altra
        // vorrebbe dire salvare un prezzo scritto a mano su un ingrediente che
        // il suo prezzo ce l'ha gia'.
        items[indice] = valore === 'custom'
          ? { kind:'custom', name:'', qty: it.qty || '', unit: it.unit || 'g', cost:'' }
          : { kind: valore, refId: null, qty: it.qty || '', unit: 'pz' };
      } else if(campo === 'refId'){
        const elenco = it.kind === 'ingredient'
          ? state.ingredients
          : state.subrecipes.filter(s => s.id !== escludiSubId);
        const scelto = elenco.find(x => x.id === valore);
        if(scelto){
          const base = it.kind === 'ingredient' ? scelto.unit : scelto.yieldUnit;
          items[indice] = { kind: it.kind, refId: scelto.id, qty: it.qty || '',
                            unit: subUnitOptions(base || 'pz')[0] };
        }
      } else if(campo === 'qta'){
        it.qty = valore;
      } else if(campo === 'unita'){
        it.unit = valore;
      } else if(campo === 'nome'){
        it.name = valore;
      } else if(campo === 'costoUnitario'){
        it.cost = valore;
      }

      ridisegna(); alCambio();
    });
  }

  vista.righe = daDisegnare(items);
  vista.ingredienti = state.ingredients.map(i => ({ valore: i.id, etichetta: i.name }));
  vista.sottoricette = state.subrecipes
    .filter(s => s.id !== escludiSubId)
    .map(s => ({ valore: s.id, etichetta: s.name }));
  return vista;
}
