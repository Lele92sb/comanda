import { esc, save, state, toast, uid } from '../core/state.js';
import { coloreStazione } from './griglia.js';
/* ============================= TURNI: stazioni =============================

   DOPPIA PARTITA — «quando Rakib sta alle insalate lo conto comunque nei due
   del lavaggio, perché mentre fa le insalate aiuta l'altro al lavaggio».

   L'impostazione sta sulla STAZIONE e non sulla persona (`copreAnche`, vedi
   costruisciCoperture in logic.js): è un fatto della cucina, non di chi ci
   lavora. Le insalate stanno accanto al lavaggio, e chiunque ci stia darà una
   mano — anche l'ultimo arrivato. Sulla persona la stessa verità andrebbe
   ripetuta su ogni scheda e ricopiata a ogni assunzione, e dimenticarsela non
   darebbe nessun errore: toglierebbe copertura in silenzio.
   ========================================================================== */
/* Il campo `<input type="color">` accetta SOLO #rrggbb: se gli si passa un
   `hsl(...)` non protesta, si mette su nero e la prossima modifica salverebbe
   quel nero. Il colore automatico va quindi convertito prima di mostrarlo. */
function coloreEsadecimale(stationId){
  const c = coloreStazione(stationId);
  if(/^#[0-9a-f]{6}$/i.test(c)) return c;
  const m = /^hsl\(\s*(\d+)\s+(\d+)%\s+(\d+)%\s*\)$/.exec(c);
  if(!m) return '#b8873f';
  const h = +m[1]/360, sat = +m[2]/100, l = +m[3]/100;
  const f = n2 => {
    const k = (n2 + h*12) % 12;
    const a = sat * Math.min(l, 1-l);
    const v = l - a * Math.max(-1, Math.min(k-3, Math.min(9-k, 1)));
    return Math.round(v*255).toString(16).padStart(2,'0');
  };
  return '#' + f(0) + f(8) + f(4);
}

export function renderStations(){
  const el = document.getElementById('station-list');
  if(!state.stations.length){ el.innerHTML = `<div class="empty">Nessuna stazione ancora.</div>`; return; }
  const esiste = id => state.stations.some(x=>x.id===id);
  // A chi dà una mano questa partita, e da chi la riceve. La seconda è la
  // stessa relazione letta al contrario, e va scritta: è la riga che risponde
  // alla domanda vera del titolare — «al lavaggio chi ci arriva?».
  const copertePer = st => (st.copreAnche||[]).filter(x=> x!==st.id && esiste(x));
  const donatoriDi = id => state.stations.filter(x=> copertePer(x).includes(id));
  const nome = id => (state.stations.find(x=>x.id===id)||{}).name || '—';

  const spiega = state.stations.length > 1 ? `
    <p class="small-note mt-0">Una partita può dare una mano a un'altra <b>senza spostarsi</b>: chi sta alle insalate,
    mentre ci sta, aiuta anche al lavaggio. Il generatore lo conta fra le persone del lavaggio e lo lascia alle insalate.
    Se la partita a cui dà una mano ne copre a sua volta una terza, la mano arriva fino in fondo.</p>` : '';

  el.innerHTML = spiega + state.stations.map(st=>{
    const copre = copertePer(st);
    const riceve = donatoriDi(st.id);
    const altre = state.stations.filter(x=> x.id!==st.id);
    // Le frecce: la prima partita scende soltanto, l'ultima sale soltanto,
    // quelle in mezzo fanno tutte e due. Mostrare una freccia che non porta da
    // nessuna parte — anche spenta — fa credere che ci sia un ordine da
    // cambiare dove non c'e'.
    const i = state.stations.indexOf(st);
    const ultimo = i === state.stations.length - 1;
    return `
    <div class="staff-card partita-card">
      <div class="row between middle">
        <div class="row middle gap-3 wrap-anywhere">
          <input type="color" class="st-colore" data-id="${esc(st.id)}"
                 value="${esc(coloreEsadecimale(st.id))}" title="Colore del pallino nella griglia">
          <input type="text" class="st-nome bold" data-id="${esc(st.id)}" value="${esc(st.name)}">
        </div>
        <div class="row gap-3">
          ${state.stations.length > 1 ? `
            ${i > 0 ? `<button class="btn ghost small st-su" data-i="${i}" title="Sposta su">▲</button>` : ''}
            ${!ultimo ? `<button class="btn ghost small st-giu" data-i="${i}" title="Sposta giù">▼</button>` : ''}` : ''}
          <button class="btn ghost small text-alert" data-del="${st.id}">Elimina</button>
        </div>
      </div>
      ${altre.length ? `
      <div class="contact">Chi lavora qui dà una mano anche a:</div>
      <div class="chip-toggle" data-mano="${st.id}">
        ${altre.map(x=>`<button type="button" data-verso="${x.id}" class="${copre.includes(x.id)?'on':''}" aria-pressed="${copre.includes(x.id)?'true':'false'}">${esc(x.name)}</button>`).join('')}
      </div>
      <div class="contact">${copre.length
        ? `✋ Nel fabbisogno di ${copre.map(id=>esc(nome(id))).join(' e ')} chi sta qui conta come presente.`
        : 'Nessuna: chi sta qui sta solo qui.'}</div>` : ''}
      ${riceve.length ? `<div class="contact">↩ Riceve una mano da: <b>${riceve.map(x=>esc(x.name)).join(', ')}</b></div>` : ''}
    </div>`;
  }).join('');

  // Il nome si cambia scrivendoci sopra: un pulsante «Modifica» che apre un
  // riquadro per un campo solo e' un giro in piu' per la stessa cosa.
  el.querySelectorAll('.st-nome').forEach(inp=> inp.addEventListener('change', ()=>{
    const st = state.stations.find(x=>x.id===inp.dataset.id);
    const nome = inp.value.trim();
    if(!nome){ toast('La partita deve avere un nome'); renderStations(); return; }
    st.name = nome; save('stations'); renderStations(); toast('Partita rinominata');
  }));
  el.querySelectorAll('.st-colore').forEach(inp=> inp.addEventListener('change', ()=>{
    const st = state.stations.find(x=>x.id===inp.dataset.id);
    st.colore = inp.value;
    save('stations'); renderStations(); toast(`${st.name}: colore cambiato`);
  }));
  const scambia = (i, j)=>{
    [state.stations[i], state.stations[j]] = [state.stations[j], state.stations[i]];
    save('stations'); renderStations();
  };
  el.querySelectorAll('.st-su').forEach(b=> b.addEventListener('click', ()=>{
    const i = parseInt(b.dataset.i); scambia(i, i-1); }));
  el.querySelectorAll('.st-giu').forEach(b=> b.addEventListener('click', ()=>{
    const i = parseInt(b.dataset.i); scambia(i, i+1); }));

  el.querySelectorAll('[data-mano] button').forEach(b=>{
    b.addEventListener('click', ()=>{
      const daId = b.closest('[data-mano]').dataset.mano;
      const aId = b.dataset.verso;
      const st = state.stations.find(x=>x.id===daId);
      if(!st) return;
      const copre = copertePer(st);
      const acceso = copre.includes(aId);
      st.copreAnche = acceso ? copre.filter(x=>x!==aId) : copre.concat(aId);
      save('stations');
      renderStations();
      toast(acceso
        ? `${st.name}: nessuna mano a ${nome(aId)}`
        : `Chi sta a ${st.name} dà una mano anche a ${nome(aId)}`);
    });
  });

  el.querySelectorAll('[data-del]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const id = b.dataset.del;
      state.stations = state.stations.filter(s=>s.id!==id);
      Object.values(state.staffingNeeds).forEach(list=>{ const i=list.findIndex(n=>n.stationId===id); if(i>=0) list.splice(i,1); });
      state.staff.forEach(s=>{ s.stations = (s.stations||[]).filter(x=>x!==id); });
      // Le mani puntate alla partita cancellata vanno tolte: un id che non
      // esiste più resterebbe lì per sempre, e il giorno in cui una stazione
      // nuova prendesse quell'id la copertura tornerebbe da sola.
      state.stations.forEach(s=>{ if(s.copreAnche) s.copreAnche = s.copreAnche.filter(x=>x!==id); });
      save('stations'); save('staffingNeeds'); save('staff');
      renderStations(); toast('Stazione eliminata');
    });
  });
}
document.getElementById('station-add-btn').addEventListener('click', ()=>{
  const inp = document.getElementById('station-name-input');
  const name = inp.value.trim();
  if(!name){ toast('Serve un nome'); return; }
  // `copreAnche` nasce vuoto: una stazione nuova non copre niente, ed è lo
  // stesso comportamento di quelle già salvate che il campo non ce l'hanno.
  state.stations.push({id:uid(), name, copreAnche:[]});
  save('stations'); inp.value=''; renderStations(); toast('Stazione aggiunta');
});
