import { save, state, toast, uid } from '../core/state.js';
import './assistente-vista.ts';
/* ============================= BASE DI CONOSCENZA ===========================

   QUESTO FILE E' SOLO IL COLLANTE. Il disegno sta in assistente-vista.ts.
   ========================================================================== */

/* Quanto e' lunga una nota, detto in righe. Serve a capire a colpo d'occhio se
   quella voce e' un appunto di tre righe o una ricetta intera, senza aprirla —
   e non c'e' niente da aprire, quindi e' l'unica cosa che lo puo' dire. */
function misuraDi(testo){
  const righe = String(testo || '').split('\n').filter(r => r.trim()).length;
  return righe + (righe === 1 ? ' riga' : ' righe');
}

let vista = null;

export function renderKB(){
  const el = document.getElementById('kb-panel');
  if(!el) return;
  if(!vista || !vista.isConnected){
    vista = document.createElement('cmd-conoscenza');
    collega(vista);
    el.replaceChildren(vista);
  }
  vista.note = state.knowledge.map(k => ({
    id: k.id,
    titolo: k.title,
    misura: misuraDi(k.content),
  }));
}

function collega(v){
  v.addEventListener('conoscenza-aggiungi', async e => {
    // Il file vince sul testo scritto: chi allega un file ha gia' detto cosa
    // vuole caricare, e leggere il campo di testo mezzo pieno sarebbe una
    // sorpresa.
    const contenuto = e.detail.file ? await e.detail.file.text() : e.detail.testo;
    if(!contenuto) return;
    state.knowledge.push({
      id: uid(),
      title: e.detail.titolo || (e.detail.file ? e.detail.file.name : 'Nota senza titolo'),
      content: contenuto,
      addedAt: new Date().toISOString(),
    });
    save('knowledge'); renderKB(); toast('Aggiunto alla base di conoscenza');
  });

  v.addEventListener('conoscenza-togli', e => {
    state.knowledge = state.knowledge.filter(k => k.id !== e.detail.id);
    save('knowledge'); renderKB(); toast('Nota rimossa');
  });
}
