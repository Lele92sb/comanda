import { save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { renderIngredients } from './ingredienti.js';
import { t } from '../core/lingua.ts';
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
    // GLI INGREDIENTI TENGONO IL NOME DEL FORNITORE COPIATO DENTRO, non il suo
    // id (`supplier: fornitore.name`, in fatture/applica.ts). Rinominare qui e
    // basta li lasciava attaccati a una ragione sociale che non esiste piu': la
    // fattura dopo riconosceva il fornitore dalla partita IVA, ma cercava gli
    // ingredienti per NOME NUOVO, non ne trovava nessuno, e li ricreava tutti
    // da capo. Il catalogo raddoppiava — alla lettera il «duplicare mezzo
    // magazzino» contro cui mette in guardia l'intestazione di applica.ts — e i
    // doppioni non erano agganciati a nessuna ricetta, mentre le ricette
    // continuavano a usare le copie vecchie, i cui prezzi da quel momento non
    // si aggiornavano piu'.
    //
    // Ed e' il gesto che l'app INVITA a fare: l'import crea il fornitore con la
    // denominazione dell'XML («ORTOFRUTTA ROSSI S.R.L.») e la prima cosa che
    // viene da fare e' sistemarla.
    const nomePrima = idx >= 0 ? state.suppliers[idx].name : null;
    if(idx >= 0) state.suppliers[idx] = aggiornato; else state.suppliers.push(aggiornato);

    let spostati = 0;
    if(nomePrima && nomePrima !== aggiornato.name){
      (state.ingredients || []).forEach(i => {
        if(i.supplier === nomePrima){ i.supplier = aggiornato.name; spostati++; }
      });
    }

    save('suppliers');
    if(spostati) save('ingredients');
    chiudiScheda(); renderSuppliers();
    if(spostati) renderIngredients();
    toast(spostati
      ? t('Fornitore salvato, e {n} ingredienti sono venuti dietro', { n: spostati })
      : t('Fornitore salvato'));
  });

  holder.replaceChildren(scheda);
  scheda.updateComplete.then(()=> scheda.renderRoot.querySelector('#f-nome')?.focus());
}

document.getElementById('btn-new-supplier').addEventListener('click', ()=> apriScheda(null));
