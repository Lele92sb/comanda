import { save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { coloreStazione } from './griglia.js';
import './partite-vista.ts';
/* ============================= TURNI: stazioni =============================

   QUESTO FILE E' SOLO IL COLLANTE.

   Il disegno sta in partite-vista.ts, che e' un componente e non sa niente di
   Comanda. Qui c'e' l'unica cosa che il componente non puo' sapere: dove
   stanno i dati veri, e cosa vuol dire cambiarli. Sono due mestieri diversi e
   ora vivono in due file diversi — prima erano 148 righe mescolate, in cui
   una modifica al testo di un avviso rischiava di toccare la logica di
   cancellazione.

   Il guadagno visibile: prima OGNI modifica chiamava renderStations(), che
   ributtava via tutto il markup e lo ricostruiva. Il selettore del colore si
   chiudeva da solo mentre lo si usava, il cursore saltava fuori dal campo del
   nome. Adesso cambia solo la parte che e' cambiata davvero.

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
   quel nero. Il colore automatico va quindi convertito prima di mostrarlo.
   Sta qui e non nel componente perché il colore automatico lo decide
   coloreStazione(), che è la stessa funzione usata dalla griglia: se il
   componente se lo ricalcolasse per conto suo, il giorno in cui qualcuno
   cambia la formula le due si allontanerebbero senza che nessuno lo veda. */
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

const esiste = id => state.stations.some(x => x.id === id);
const trova  = id => state.stations.find(x => x.id === id);
const nome   = id => (trova(id) || {}).name || '—';
// Le mani puntate a una partita cancellata non si mostrano: un id che non
// esiste più resterebbe nei dati per sempre.
const copertePer = st => (st.copreAnche || []).filter(x => x !== st.id && esiste(x));

/* I dati che il componente riceve: solo quello che gli serve per disegnare.
   Non gli si passa `state.stations`, e non è pignoleria — un componente che
   avesse in mano gli oggetti veri potrebbe modificarli senza passare da qui,
   e il salvataggio non partirebbe. */
function daDisegnare(){
  return state.stations.map(st => ({
    id: st.id,
    nome: st.name,
    colore: coloreEsadecimale(st.id),
    copre: copertePer(st),
  }));
}

let montato = null;

export function renderStations(){
  const el = document.getElementById('station-list');
  if(!el) return;

  // `isConnected` e non solo `!montato`: se un giorno qualcuno svuotasse questo
  // contenitore, il componente resterebbe in memoria ma fuori dalla pagina, e
  // la sezione si aprirebbe vuota senza dare nessun errore.
  if(!montato || !montato.isConnected){
    montato = document.createElement('cmd-partite');
    collega(montato);
    el.replaceChildren(montato);
  }
  montato.partite = daDisegnare();
  montato.soloLettura = Cloud.enabled && !Cloud.canWrite();
}

/* Ogni evento del componente è un'INTENZIONE, non un comando: dice cosa vuole
   chi guarda, non cosa deve succedere ai dati. Quello lo decide questo file,
   che è anche l'unico che può salvare. */
function collega(vista){
  vista.addEventListener('partita-aggiungi', e => {
    // `copreAnche` nasce vuoto: una stazione nuova non copre niente, ed è lo
    // stesso comportamento di quelle già salvate che il campo non ce l'hanno.
    state.stations.push({ id: uid(), name: e.detail.nome, copreAnche: [] });
    save('stations'); renderStations(); toast('Stazione aggiunta');
  });

  vista.addEventListener('partita-nome-vuoto', () => toast('Serve un nome'));

  vista.addEventListener('partita-rinomina', e => {
    const st = trova(e.detail.id);
    const nuovo = (e.detail.nome || '').trim();
    if(!st) return;
    if(!nuovo){ toast('La partita deve avere un nome'); renderStations(); return; }
    if(nuovo === st.name) return;
    st.name = nuovo; save('stations'); renderStations(); toast('Partita rinominata');
  });

  vista.addEventListener('partita-colore', e => {
    const st = trova(e.detail.id);
    if(!st) return;
    st.colore = e.detail.colore;
    save('stations'); renderStations(); toast(`${st.name}: colore cambiato`);
  });

  vista.addEventListener('partita-sposta', e => {
    const i = state.stations.findIndex(x => x.id === e.detail.id);
    const j = i + e.detail.verso;
    if(i < 0 || j < 0 || j >= state.stations.length) return;
    [state.stations[i], state.stations[j]] = [state.stations[j], state.stations[i]];
    save('stations'); renderStations();
  });

  vista.addEventListener('partita-mano', e => {
    const st = trova(e.detail.da);
    if(!st) return;
    const copre = copertePer(st);
    st.copreAnche = e.detail.acceso
      ? copre.concat(e.detail.a).filter((x, k, a) => a.indexOf(x) === k)
      : copre.filter(x => x !== e.detail.a);
    save('stations'); renderStations();
    toast(e.detail.acceso
      ? `Chi sta a ${st.name} dà una mano anche a ${nome(e.detail.a)}`
      : `${st.name}: nessuna mano a ${nome(e.detail.a)}`);
  });

  vista.addEventListener('partita-elimina', e => {
    const id = e.detail.id;
    state.stations = state.stations.filter(s => s.id !== id);
    Object.values(state.staffingNeeds).forEach(list => {
      const i = list.findIndex(n => n.stationId === id);
      if(i >= 0) list.splice(i, 1);
    });
    state.staff.forEach(s => { s.stations = (s.stations || []).filter(x => x !== id); });
    // Le mani puntate alla partita cancellata vanno tolte anche dai dati: un id
    // che non esiste più resterebbe lì per sempre, e il giorno in cui una
    // stazione nuova prendesse quell'id la copertura tornerebbe da sola.
    state.stations.forEach(s => { if(s.copreAnche) s.copreAnche = s.copreAnche.filter(x => x !== id); });
    save('stations'); save('staffingNeeds'); save('staff');
    renderStations(); toast('Stazione eliminata');
  });
}
