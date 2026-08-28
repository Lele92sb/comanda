import { esc, save, state, toast, uid } from '../core/state.js';
/* ============================= KNOWLEDGE BASE ============================= */
export function renderKB(){
  const el = document.getElementById('kb-list');
  if(!state.knowledge.length){ el.innerHTML = `<div class="empty">Base di conoscenza vuota. Aggiungi ricette o appunti sopra.</div>`; return; }
  el.innerHTML = state.knowledge.map(k=>`<div class="kb-item"><span class="t">${esc(k.title)}</span><button class="rm" data-id="${k.id}">✕</button></div>`).join('');
  el.querySelectorAll('.rm').forEach(b=> b.addEventListener('click', ()=>{ state.knowledge = state.knowledge.filter(k=>k.id!==b.dataset.id); save('knowledge'); renderKB(); toast('Nota rimossa'); }));
}
document.getElementById('kb-add').addEventListener('click', async ()=>{
  const title = document.getElementById('kb-title').value.trim();
  const text = document.getElementById('kb-text').value.trim();
  const fileInput = document.getElementById('kb-file');
  let content = text;
  if(fileInput.files[0]){ content = await fileInput.files[0].text(); }
  if(!content){ toast('Aggiungi del testo o un file'); return; }
  state.knowledge.push({id:uid(), title: title || 'Nota senza titolo', content, addedAt: new Date().toISOString()});
  save('knowledge');
  document.getElementById('kb-title').value=''; document.getElementById('kb-text').value=''; fileInput.value='';
  renderKB(); toast('Aggiunto alla base di conoscenza');
});
