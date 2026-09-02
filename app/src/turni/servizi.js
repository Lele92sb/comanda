import { humanError } from '../account/accesso.js';
import { SERVICES, conferma, esc, refreshShiftConfig, save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { SPECIAL_CODES } from '../lib/logic.js';
import { renderNeeds } from './fabbisogno.js';
import { renderOreExtra, renderTurni } from './griglia.js';
import { renderQuotas } from './quote.js';
import { renderStations } from './stazioni.js';
/* ============================= TURNI: servizi e tipi di turno ============================= */
// Ricalcola le tabelle derivate e ridisegna tutto ciò che dipende dai servizi:
// una sigla cambiata qui si vede subito nella griglia, nel fabbisogno e nelle quote.
function afterShiftConfigChange(){
  refreshShiftConfig();
  SERVICES().forEach(sv=>{ if(!state.staffingNeeds[sv]) state.staffingNeeds[sv]=[]; });
  renderServices(); renderShiftTypes(); renderNeeds(); renderQuotas(); renderTurni(); renderOreExtra();
}

export function renderServices(){
  const el = document.getElementById('service-list');
  if(!state.services.length){ el.innerHTML = `<div class="empty">Nessun servizio: la cucina non ha momenti di lavoro definiti.</div>`; return; }
  el.innerHTML = state.services.map((sv,i)=>{
    const usato = state.shiftTypes.filter(t=>(t.services||[]).includes(sv.id)).map(t=>t.code);
    return `
    <div class="staff-card">
      <div class="wrap-anywhere">
        <input type="text" class="sv-name bold" data-id="${esc(sv.id)}" value="${esc(sv.name)}">
        <div class="contact">${usato.length ? 'coperto dai turni: '+esc(usato.join(', ')) : '⚠ nessun turno lo copre'}</div>
      </div>
      <div class="col">
        <div class="row gap-3">
          ${/* La prima riga scende soltanto, l'ultima sale soltanto, quelle in
                mezzo fanno tutte e due. Prima c'era la sola freccia in su,
                DISABILITATA sulla prima: con due servizi se ne vedevano due
                identiche e nessuna che scendesse — segnalato dallo chef, che
                aveva ragione anche sul caso a tre. */''}
          ${state.services.length > 1 ? `
            ${i > 0 ? `<button class="btn ghost small sv-up" data-i="${i}" title="Sposta su">▲</button>` : ''}
            ${i < state.services.length-1 ? `<button class="btn ghost small sv-giu" data-i="${i}" title="Sposta giù">▼</button>` : ''}` : ''}
        </div>
        <button class="btn ghost small sv-del text-alert" data-id="${esc(sv.id)}">Elimina</button>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.sv-name').forEach(inp=>inp.addEventListener('change', ()=>{
    const sv = state.services.find(x=>x.id===inp.dataset.id);
    const nome = inp.value.trim();
    if(!nome){ toast('Il servizio deve avere un nome'); renderServices(); return; }
    sv.name = nome; save('services'); afterShiftConfigChange(); toast('Servizio rinominato');
  }));
  const scambiaServizi = (i, j)=>{
    [state.services[i], state.services[j]] = [state.services[j], state.services[i]];
    save('services'); afterShiftConfigChange();
  };
  el.querySelectorAll('.sv-up').forEach(b=>b.addEventListener('click', ()=>{
    const i = parseInt(b.dataset.i); scambiaServizi(i, i-1); }));
  el.querySelectorAll('.sv-giu').forEach(b=>b.addEventListener('click', ()=>{
    const i = parseInt(b.dataset.i); scambiaServizi(i, i+1); }));
  el.querySelectorAll('.sv-del').forEach(b=>b.addEventListener('click', async ()=>{
    const sv = state.services.find(x=>x.id===b.dataset.id);
    const turni = state.shiftTypes.filter(t=>(t.services||[]).includes(sv.id));
    const righe = (state.staffingNeeds[sv.id]||[]).length;
    const ok = await conferma(`Eliminare il servizio "${sv.name}"?`,
      (turni.length ? `Verrà tolto da ${turni.length} tipo/i di turno (${turni.map(t=>t.code).join(', ')}).\n` : '')
      + (righe ? `Verranno perse ${righe} righe di fabbisogno.\n` : '')
      + 'I turni già assegnati nella griglia restano come sono.',
      {conferma:'Elimina', pericolo:true});
    if(!ok) return;
    // Le celle dei turni restano come sono, e la stazione che avevano su questo
    // servizio resta scritta nella loro mappa. È una decisione, non una
    // dimenticanza: quella chiave diventa invisibile — chi legge una cella
    // chiede sempre i servizi che il CODICE copre, e questo non c'è più — e
    // sparisce da sola alla prossima lettura, quando `normalizzaCella` rifà la
    // mappa. Riscrivere qui tutti i turni della cucina vorrebbe dire un
    // salvataggio dell'intero blob per un cambiamento che non si vede; e se il
    // servizio viene ricreato, la stazione è ancora lì invece che persa.
    state.services = state.services.filter(x=>x.id!==sv.id);
    state.shiftTypes.forEach(t=>{ t.services = (t.services||[]).filter(x=>x!==sv.id); });
    delete state.staffingNeeds[sv.id];
    save('services'); save('shiftTypes'); save('staffingNeeds');
    afterShiftConfigChange(); toast('Servizio eliminato');
  }));
}

// Copia della configurazione da un'altra cucina dello stesso gestore.
export function renderCopiaConfig(){
  const panel = document.getElementById('copia-config-panel');
  const altre = Cloud.enabled ? Cloud.altreCucine() : [];
  panel.classList.toggle('hidden', !altre.length);
  if(!altre.length) return;
  document.getElementById('copia-da').innerHTML =
    altre.map(k=>`<option value="${esc(k.id)}">${esc(k.name)}</option>`).join('');
}
document.getElementById('copia-btn').addEventListener('click', async ()=>{
  const id = document.getElementById('copia-da').value;
  const nome = (Cloud.altreCucine().find(k=>k.id===id)||{}).name || 'l\'altra cucina';
  const ok = await conferma(`Copiare la configurazione da "${nome}"?`,
    'La configurazione attuale di questa cucina viene sostituita.\n'
    + 'Brigata, turni assegnati e fabbisogno NON vengono toccati, ma il fabbisogno\n'
    + 'andrà reimpostato perché i servizi e le stazioni cambiano identificativo.',
    {conferma:'Copia qui', pericolo:true});
  if(!ok) return;
  try{
    const [servizi, turni, stazioni] = await Promise.all([
      Cloud.readOtherKitchen(id, 'services'),
      Cloud.readOtherKitchen(id, 'shiftTypes'),
      Cloud.readOtherKitchen(id, 'stations'),
    ]);
    if(!servizi || !turni){ toast('Quella cucina non ha ancora una configurazione'); return; }
    state.services   = servizi;
    state.shiftTypes = turni;
    if(stazioni) state.stations = stazioni;
    state.staffingNeeds = {};
    await save('services'); await save('shiftTypes'); await save('stations'); await save('staffingNeeds');
    afterShiftConfigChange(); renderStations();
    toast('Configurazione copiata — ricontrolla il fabbisogno');
  }catch(e){ toast(humanError(e)); }
});

document.getElementById('service-add-btn').addEventListener('click', ()=>{
  const inp = document.getElementById('service-name-input');
  const nome = inp.value.trim();
  if(!nome){ toast('Serve un nome'); return; }
  state.services.push({ id: uid(), name: nome });
  save('services'); inp.value = '';
  afterShiftConfigChange(); toast('Servizio aggiunto');
});

/* I colori che il foglio di stile da' alle sigle predefinite. Servono come
   valore di partenza del selettore: senza, il campo si mette su nero e la prima
   modifica salverebbe quel nero anche a chi il colore non voleva cambiarlo. */
const COLORI_SIGLA = { P:'#b06b34', S:'#332c24', SP:'#6b8064', C:'#d38f57',
                       R:'#2e2a25', F:'#2e2a25', M:'#2e2a25' };
function coloreSigla(code){ return COLORI_SIGLA[code] || '#b8873f'; }

export function renderShiftTypes(){
  const el = document.getElementById('shifttype-list');
  if(!state.shiftTypes.length){ el.innerHTML = `<div class="empty">Nessun tipo di turno: il generatore non ha niente da assegnare.</div>`; return; }
  el.innerHTML = state.shiftTypes.map(t=>`
    <div class="panel subpanel" >
      <div class="grid3">
        <div><label>Sigla</label><input type="text" class="st-code upper" data-id="${esc(t.id)}" value="${esc(t.code)}" maxlength="4"></div>
        <div><label>Orario</label><input type="text" class="st-label" data-id="${esc(t.id)}" value="${esc(t.label)}" placeholder="es. 9:00–17:00"></div>
        <div><label>Ore</label><input type="number" step="0.5" min="0" class="st-hours" data-id="${esc(t.id)}" value="${t.hours}"></div>
        <div><label>Colore</label>
          <input type="color" class="st-colore-turno" data-id="${esc(t.id)}"
                 value="${esc(t.colore || coloreSigla(t.code))}" title="Colore della sigla nella griglia">
        </div>
      </div>
      <label>Servizi coperti</label>
      <div class="chip-toggle st-services" data-id="${esc(t.id)}">
        ${state.services.map(sv=>`<button type="button" data-sv="${esc(sv.id)}" class="${(t.services||[]).includes(sv.id)?'on':''}">${esc(sv.name)}</button>`).join('')
          || '<span class="small-note">Crea prima i servizi</span>'}
      </div>
      ${(t.services||[]).length>1 ? `<p class="small-note mt-1" >Turno spezzato: una persona sola copre ${(t.services||[]).length} servizi.</p>` : ''}
      ${!(t.services||[]).length ? `<p class="small-note mt-1 text-alert" >⚠ Non copre nessun servizio: il generatore non lo userà mai.</p>` : ''}
      <button class="btn ghost small st-del mt-2 text-alert" data-id="${esc(t.id)}">Elimina turno</button>
    </div>`).join('');

  const salva = ()=>{ save('shiftTypes'); afterShiftConfigChange(); };

  el.querySelectorAll('.st-code').forEach(inp=>inp.addEventListener('change', ()=>{
    const t = state.shiftTypes.find(x=>x.id===inp.dataset.id);
    const nuovo = inp.value.trim().toUpperCase();
    if(!nuovo){ toast('La sigla non può essere vuota'); renderShiftTypes(); return; }
    if(SPECIAL_CODES[nuovo]){ toast(`"${nuovo}" è riservata (${SPECIAL_CODES[nuovo].label})`); renderShiftTypes(); return; }
    if(state.shiftTypes.some(x=>x.id!==t.id && x.code===nuovo)){ toast(`La sigla "${nuovo}" è già usata`); renderShiftTypes(); return; }
    // La sigla è salvata dentro i turni già assegnati e dentro le quote: va
    // propagata, altrimenti quei dati puntano a un turno che non esiste più.
    // La mappa servizio → stazione delle celle NON si tocca: cambiando la sigla
    // non cambiano i servizi che quel turno copre, quindi le chiavi restano
    // quelle giuste.
    const vecchio = t.code;
    t.code = nuovo;
    Object.values(state.shifts).forEach(giorni=>{
      Object.values(giorni).forEach(cell=>{ if(cell && cell.code===vecchio) cell.code = nuovo; });
    });
    state.staff.forEach(s=>(s.weeklyQuota||[]).forEach(g=>{
      g.codes = (g.codes||[]).map(c=> c===vecchio ? nuovo : c);
    }));
    save('shifts'); save('staff'); salva();
    toast(`Sigla aggiornata ovunque: ${vecchio} → ${nuovo}`);
  }));
  el.querySelectorAll('.st-label').forEach(inp=>inp.addEventListener('change', ()=>{
    state.shiftTypes.find(x=>x.id===inp.dataset.id).label = inp.value.trim(); salva();
  }));
  el.querySelectorAll('.st-colore-turno').forEach(inp=> inp.addEventListener('change', ()=>{
    const t = state.shiftTypes.find(x=>x.id===inp.dataset.id);
    t.colore = inp.value;
    save('shiftTypes'); afterShiftConfigChange(); toast(`${t.code}: colore cambiato`);
  }));
  el.querySelectorAll('.st-hours').forEach(inp=>inp.addEventListener('change', ()=>{
    state.shiftTypes.find(x=>x.id===inp.dataset.id).hours = parseFloat(inp.value)||0; salva();
  }));
  el.querySelectorAll('.st-services button').forEach(b=>b.addEventListener('click', ()=>{
    const t = state.shiftTypes.find(x=>x.id===b.closest('.st-services').dataset.id);
    const sv = b.dataset.sv;
    t.services = t.services || [];
    if(t.services.includes(sv)) t.services = t.services.filter(x=>x!==sv);
    else t.services.push(sv);
    salva();
  }));
  el.querySelectorAll('.st-del').forEach(b=>b.addEventListener('click', async ()=>{
    const t = state.shiftTypes.find(x=>x.id===b.dataset.id);
    const inQuota = state.staff.filter(s=>(s.weeklyQuota||[]).some(g=>(g.codes||[]).includes(t.code)));
    const ok = await conferma(`Eliminare il turno "${t.code} · ${t.label}"?`,
      (inQuota.length ? `È usato nelle quote di: ${inQuota.map(s=>s.name).join(', ')}.\n` : '')
      + 'I turni già assegnati nella griglia restano, ma la sigla non sarà più selezionabile.',
      {conferma:'Elimina', pericolo:true});
    if(!ok) return;
    state.shiftTypes = state.shiftTypes.filter(x=>x.id!==t.id);
    state.staff.forEach(s=>(s.weeklyQuota||[]).forEach(g=>{ g.codes = (g.codes||[]).filter(c=>c!==t.code); }));
    save('shiftTypes'); save('staff'); salva(); toast('Tipo di turno eliminato');
  }));
}

document.getElementById('shifttype-add-btn').addEventListener('click', ()=>{
  // Prima sigla libera: si cambia subito, ma non blocca chi vuole solo aggiungere.
  let code = 'T1', n = 1;
  while(state.shiftTypes.some(t=>t.code===code) || SPECIAL_CODES[code]) code = 'T'+(++n);
  state.shiftTypes.push({ id: uid(), code, label:'da compilare', hours: 8, services: [] });
  save('shiftTypes'); afterShiftConfigChange(); toast('Turno aggiunto — dagli una sigla e i servizi');
});
