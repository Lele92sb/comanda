import { save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import './fornitori-vista.ts';
/* ============================= FORNITORI ====================================

   QUESTO FILE E' SOLO IL COLLANTE. Elenco e scheda sono in fornitori-vista.ts.
   ========================================================================== */

const soloLettura = () => Cloud.enabled && !Cloud.canWrite();

function daDisegnare(){
  return state.suppliers.map(s => ({
    id: s.id,
    nome: s.name,
    piva: s.piva || '',
    telefono: s.phone || '',
    email: s.email || '',
    indirizzo: s.address || '',
  }));
}

let elenco = null;

export function renderSuppliers(){
  const el = document.getElementById('supplier-list');
  if(!el) return;
  if(!elenco || !elenco.isConnected){
    elenco = document.createElement('cmd-fornitori');
    collega(elenco);
    el.replaceChildren(elenco);
  }
  elenco.fornitori = daDisegnare();
  elenco.soloLettura = soloLettura();
}

function collega(vista){
  vista.addEventListener('fornitore-nuovo', ()=> apriScheda(null));
  vista.addEventListener('fornitore-modifica', e =>
    apriScheda(state.suppliers.find(s => s.id === e.detail.id)));
  vista.addEventListener('fornitore-elimina', e => {
    state.suppliers = state.suppliers.filter(s => s.id !== e.detail.id);
    save('suppliers'); renderSuppliers(); toast('Fornitore eliminato');
  });
}

let scheda = null;

function chiudiScheda(){
  const holder = document.getElementById('supplier-form-holder');
  if(holder) holder.replaceChildren();
  scheda = null;
}

function apriScheda(esistente){
  const holder = document.getElementById('supplier-form-holder');
  if(!holder) return;
  const s = esistente || {};

  scheda = document.createElement('cmd-scheda-fornitore');
  scheda.nuovo = !esistente;
  scheda.fornitore = {
    id: s.id || uid(),
    nome: s.name || '',
    piva: s.piva || '',
    telefono: s.phone || '',
    email: s.email || '',
    indirizzo: s.address || '',
  };

  scheda.addEventListener('fornitore-annulla', chiudiScheda);
  scheda.addEventListener('fornitore-salva', e => {
    const f = e.detail.fornitore;
    const idx = state.suppliers.findIndex(x => x.id === f.id);
    // Si parte da quello che c'era: i campi che questa scheda non governa —
    // oggi nessuno, domani chissa' — non spariscono alla prima modifica.
    const aggiornato = Object.assign({}, idx >= 0 ? state.suppliers[idx] : {}, {
      id: f.id, name: f.nome, piva: f.piva,
      phone: f.telefono, email: f.email, address: f.indirizzo,
    });
    if(idx >= 0) state.suppliers[idx] = aggiornato; else state.suppliers.push(aggiornato);
    save('suppliers'); chiudiScheda(); renderSuppliers(); toast('Fornitore salvato');
  });

  holder.replaceChildren(scheda);
  scheda.updateComplete.then(()=> scheda.renderRoot.querySelector('#f-nome')?.focus());
}

document.getElementById('btn-new-supplier').addEventListener('click', ()=> apriScheda(null));
