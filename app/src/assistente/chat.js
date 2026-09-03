import { save, state } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import './assistente-vista.ts';
/* ============================= CHAT / AI AGENT ==============================

   QUESTO FILE E' SOLO IL COLLANTE. Qui restano le due cose che il componente
   non puo' sapere: cosa dire al modello di se stesso (il prompt di sistema) e
   come parlargli.
   ========================================================================== */

const BENVENUTO = 'Ciao chef. Sono qui per pensare i piatti con te, rivedere un menu, '
  + 'o solo confrontarci su un\'idea. Se carichi qualche ricetta nella base di conoscenza '
  + 'qui sopra, terrò conto del tuo stile.';

/* Cosa il modello sa di questa cucina prima ancora della prima domanda. Le
   ultime dieci note della base di conoscenza e l'elenco dei piatti: e' quello
   che trasforma «un assistente» in «il TUO sous-chef». Il taglio a 6000
   caratteri non e' un numero a caso — oltre, il contesto costa e la qualita'
   non migliora, perche' le note piu' vecchie parlano di piatti che spesso non
   sono nemmeno piu' in carta. */
function promptDiSistema(){
  let conoscenza = '';
  if(state.knowledge.length){
    const ultime = state.knowledge.slice(-10);
    conoscenza = '\n\nBase di conoscenza dello chef (ricette e appunti personali, usali per capire il suo stile e dare consigli coerenti):\n'
      + ultime.map(k=>`### ${k.title}\n${k.content}`).join('\n\n').slice(0, 6000);
  }
  const piatti = state.recipes.length
    ? '\n\nPiatti attuali in ricettario: ' + state.recipes.map(r=>r.name).join(', ')
    : '';
  return 'Sei il sous-chef personale e assistente di fiducia di uno chef professionista. '
    + 'Parli italiano, in modo diretto, concreto e da collega di cucina — non da assistente generico. '
    + 'Aiuti a: ideare nuovi piatti, bilanciare menu, valutare food cost, gestire la brigata e i turni, '
    + 'e a prenderti cura del benessere dello chef. Dai consigli pratici, con quantità e tecniche quando '
    + 'utile, e fai domande solo se davvero necessario per procedere.'
    + conoscenza + piatti;
}

let vista = null;

export function renderChat(){
  const el = document.getElementById('chat-panel');
  if(!el) return;
  if(!vista || !vista.isConnected){
    vista = document.createElement('cmd-chat');
    vista.benvenuto = BENVENUTO;
    vista.addEventListener('chat-invia', e => manda(e.detail.testo));
    el.replaceChildren(vista);
  }
  // Ai messaggi salvati manca una chiave stabile: gliela si da' qui, dalla
  // posizione. E' sicuro perche' la conversazione cresce solo in fondo — non
  // si cancella e non si riordina un messaggio gia' detto.
  vista.messaggi = state.chatHistory.map((m, i) => ({
    id: 'm' + i, chi: m.role === 'user' ? 'user' : 'assistant', testo: m.content,
  }));
}

async function manda(testo){
  state.chatHistory.push({ role:'user', content: testo });
  save('chatHistory');
  renderChat();

  // Il componente si blocca da solo: pulsante spento e «sta scrivendo».
  vista.inAttesa = true;
  try{
    const data = await Cloud.ai({
      task: 'chat',
      system: promptDiSistema(),
      messages: state.chatHistory.map(m => ({ role: m.role, content: m.content })),
    });
    const blocchi = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    state.chatHistory.push({
      role:'assistant',
      content: blocchi || 'Non sono riuscito a rispondere, riprova.',
    });
  }catch(e){
    // `userFacing` marca gli errori gia' scritti per essere letti da una
    // persona (servizio non configurato, quota finita): quelli si mostrano
    // come sono. Gli altri no — «TypeError: fetch failed» non aiuta nessuno.
    state.chatHistory.push({
      role:'assistant',
      content: e.userFacing ? e.message : 'C\'è stato un problema di connessione. Riprova tra poco.',
    });
  }
  vista.inAttesa = false;
  save('chatHistory');
  renderChat();
}
