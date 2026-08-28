import { esc, save, state } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
/* ============================= CHAT / AI AGENT ============================= */
export function renderChat(){
  const log = document.getElementById('chat-log');
  if(!state.chatHistory.length){
    log.innerHTML = `<div class="msg ai">Ciao chef. Sono qui per pensare i piatti con te, rivedere un menu, o solo confrontarci su un'idea. Se carichi qualche ricetta nella base di conoscenza qui sopra, terrò conto del tuo stile.</div>`;
    return;
  }
  log.innerHTML = state.chatHistory.map(m=>`<div class="msg ${m.role==='user'?'user':'ai'}">${esc(m.content)}</div>`).join('');
  log.scrollTop = log.scrollHeight;
}
function buildSystemPrompt(){
  let kb = '';
  if(state.knowledge.length){
    const recent = state.knowledge.slice(-10);
    kb = '\n\nBase di conoscenza dello chef (ricette e appunti personali, usali per capire il suo stile e dare consigli coerenti):\n' + recent.map(k=>`### ${k.title}\n${k.content}`).join('\n\n').slice(0, 6000);
  }
  const dishSummary = state.recipes.length ? '\n\nPiatti attuali in ricettario: ' + state.recipes.map(r=>r.name).join(', ') : '';
  return `Sei il sous-chef personale e assistente di fiducia di uno chef professionista. Parli italiano, in modo diretto, concreto e da collega di cucina — non da assistente generico. Aiuti a: ideare nuovi piatti, bilanciare menu, valutare food cost, gestire la brigata e i turni, e a prenderti cura del benessere dello chef. Dai consigli pratici, con quantità e tecniche quando utile, e fai domande solo se davvero necessario per procedere.${kb}${dishSummary}`;
}
async function sendChat(){
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if(!text) return;
  state.chatHistory.push({role:'user', content:text});
  save('chatHistory');
  input.value='';
  renderChat();
  document.getElementById('chat-typing').classList.remove('invisible');
  try{
    const data = await Cloud.ai({
      task: 'chat',
      system: buildSystemPrompt(),
      messages: state.chatHistory.map(m=>({role:m.role, content:m.content}))
    });
    const textBlocks = (data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
    state.chatHistory.push({role:'assistant', content: textBlocks || 'Non sono riuscito a rispondere, riprova.'});
  }catch(e){
    state.chatHistory.push({role:'assistant', content: e.userFacing ? e.message : 'C\'è stato un problema di connessione. Riprova tra poco.'});
  }
  document.getElementById('chat-typing').classList.add('invisible');
  save('chatHistory');
  renderChat();
}
document.getElementById('chat-send').addEventListener('click', sendChat);
document.getElementById('chat-input').addEventListener('keydown', (e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendChat(); } });
