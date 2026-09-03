import { lingua, t } from '../core/lingua.ts';
import { CODE_LABEL, SERVICE_LABEL, SHIFT_CONFIG, state } from '../core/state.js';
import { isoDate, parseISO, serviziDelCodice, stazioneDi, stazioniDi } from '../lib/logic.js';
import { dishTotalCost } from '../ricettario/costi.js';
import { weeklyExtraFromTurni } from '../turni/griglia.js';
import { bloccaGenerazione, quoteStorte } from '../lib/logic.js';
import { caricaRichieste, richiesteInAttesa } from '../turni/richieste.js';
import { Cloud } from '../lib/cloud.js';
import { switchTab } from '../ui/tabs.js';
import './dashboard-vista.ts';
/* ============================= DASHBOARD ====================================

   QUESTO FILE E' SOLO IL COLLANTE. Qui stanno le REGOLE — cos'e' un food cost
   fuori linea, chi sta facendo ore oltre il contratto, come si legge la partita
   di una giornata — e il componente riceve gia' le frasi da scrivere.

   La soglia del 35% e il resto possono cambiare senza toccare un pixel.
   ========================================================================== */

/* La partita si legge per SERVIZIO: chi a pranzo sta ai primi e a cena al pass
   fa due partite in una giornata, e «Turni di oggi» deve dirlo. Quando sono la
   stessa — cioe' quasi sempre — la riga resta identica a prima. */
function dettaglioPartite(cell){
  const nomeStazione = id => (state.stations.find(x=> x.id === id)||{}).name || '';
  const partite = stazioniDi(cell, SHIFT_CONFIG());
  if(partite.length <= 1) return partite.length ? ' · ' + nomeStazione(partite[0]) : '';
  return ' · ' + (serviziDelCodice(cell.code, SHIFT_CONFIG())||[]).map(sv=>{
    const n = nomeStazione(stazioneDi(cell, sv));
    return n ? n + ' (' + SERVICE_LABEL(sv).toLowerCase() + ')' : null;
  }).filter(Boolean).join(' / ');
}

/* GLI AVVISI SONO IN ORDINE DI URGENZA, e l'ordine e' la sostanza.
   Prima quello che aspetta una decisione OGGI — una richiesta ferma, dei turni
   generati e mai pubblicati — poi quello che impedisce di lavorare, poi quello
   che falsa i conti. Un elenco di cose vere ma in ordine casuale si legge come
   rumore, e chi lo legge come rumore smette di leggerlo.

   Ognuno porta dove si risolve: un avviso che dice cosa non va e non dice dove
   ripararlo costringe a rifare a mano la strada che aveva gia' indicato. */
function avvisi(){
  const fuori = [];

  // 1. LE RICHIESTE FERME. Sono l'unica cosa nell'app che aspetta una persona:
  //    finche' nessuno decide, chi l'ha mandata non sa se puo' prenotare il
  //    volo e il generatore non sa se quel giorno c'e'.
  const attesa = richiesteInAttesa();
  if(attesa.length){
    fuori.push({ tono:'allarme', dove:'richieste', testo: attesa.length === 1
      ? t('Una richiesta aspetta una risposta.')
      : t('{n} richieste aspettano una risposta.', { n: attesa.length }) });
  }

  // 2. TURNI GENERATI E MAI PUBBLICATI. Il prospetto c'e', ma la brigata vede
  //    ancora quello di prima — o niente. E' il difetto piu' facile da fare e
  //    il piu' difficile da accorgersene, perche' a chi l'ha generato lo
  //    schermo li mostra tutti.
  const pubblicate = new Set(state.publishedShifts || []);
  const conTurno = new Set();
  Object.values(state.shifts || {}).forEach(perPersona =>
    Object.entries(perPersona || {}).forEach(([giorno, cella]) => {
      if(cella && cella.code) conTurno.add(giorno);
    }));
  const daPubblicare = [...conTurno].filter(g => !pubblicate.has(g));
  if(daPubblicare.length){
    fuori.push({ tono:'allarme', dove:'turni', testo: daPubblicare.length === 1
      ? t('Un giorno ha i turni ma non è pubblicato: la brigata non lo vede.')
      : t('{n} giorni hanno i turni ma non sono pubblicati: la brigata non li vede.',
          { n: daPubblicare.length }) });
  }

  // 3. LE QUOTE STORTE. Da quando il generatore si ferma, saperlo qui vuol dire
  //    non arrivare ai turni per scoprirlo li'.
  const storte = quoteStorte(state.staff).filter(x => bloccaGenerazione(x.problemi));
  if(storte.length){
    fuori.push({ tono:'allarme', dove:'impostazioni/quote', testo: storte.length === 1
      ? t('La quota di {chi} non fa 7: il generatore non parte.', { chi: storte[0].nome })
      : t('Le quote di {n} persone non fanno 7: il generatore non parte.', { n: storte.length }) });
  }

  // 4. INGREDIENTI SENZA PREZZO. Non rompono niente e falsano tutto: un
  //    ingrediente a zero fa costare meno il piatto che lo contiene, e il food
  //    cost scende da solo. E' il difetto che si scopre a fine mese.
  const senzaPrezzo = (state.ingredients || []).filter(i => !(parseFloat(i.price) > 0));
  if(senzaPrezzo.length){
    fuori.push({ tono:'nota', dove:'ricette/ingredienti', testo: senzaPrezzo.length === 1
      ? t('{chi} non ha un prezzo: i piatti che lo usano costano meno del vero.',
          { chi: senzaPrezzo[0].name })
      : t('{n} ingredienti non hanno un prezzo: i piatti che li usano costano meno del vero.',
          { n: senzaPrezzo.length }) });
  }

  // Food cost sopra il 35%: la soglia oltre la quale un piatto, per quanto
  // buono, non paga la cucina che lo fa.
  const costoAlto = state.recipes.filter(d=>{
    const costo = dishTotalCost(d);
    const prezzo = parseFloat(d.priceActual) || 0;
    return prezzo ? (costo / prezzo * 100) > 35 : false;
  });
  if(costoAlto.length){
    const elenco = costoAlto.map(r => r.name).join(', ');
    fuori.push({ tono:'allarme', dove:'ricette/piatti',
      testo: costoAlto.length === 1
        ? t('{elenco} ha un food cost reale sopra il 35%.', { elenco })
        : t('{n} piatti hanno un food cost reale sopra il 35%: {elenco}.',
            { n: costoAlto.length, elenco }) });
  }

  const oltreContratto = weeklyExtraFromTurni().filter(o => o.extra > 0);
  if(oltreContratto.length){
    fuori.push({ tono:'allarme', dove:'benessere',
      testo: t('Secondo il planning, {chi} fa ore extra rispetto al contratto.',
        { chi: oltreContratto.map(o => o.name).join(', ') }) });
  }

  return fuori;
}

let vista = null;
let richiesteChieste = false;

export function renderDashboard(){
  const el = document.getElementById('dash-panel');
  if(!el) return;
  if(!vista || !vista.isConnected){
    vista = document.createElement('cmd-dashboard');
    // «0 piatti in ricettario» e' una domanda travestita da numero, e la
    // risposta sta due schermate piu' in la'. Il componente dice solo dove
    // vuole andare; come ci si va lo sa questo file.
    vista.addEventListener('dashboard-vai', e => switchTab(e.detail.dove));
    el.replaceChildren(vista);
  }

  // Le richieste arrivano dal server, e la dashboard si disegna prima che
  // siano arrivate. Si chiedono una volta e si ridisegna quando ci sono:
  // aspettarle vorrebbe dire una schermata bianca a ogni entrata, chiederle a
  // ogni entrata vorrebbe dire una chiamata di rete per niente.
  if(Cloud.enabled && !richiesteChieste){
    richiesteChieste = true;
    caricaRichieste().then(()=> renderDashboard()).catch(()=>{});
  }

  const oggi = isoDate(new Date());
  vista.avvisi = avvisi();
  vista.numeri = [
    { numero: state.recipes.length,    etichetta: t('Piatti in ricettario'), dove: 'ricette/piatti' },
    { numero: state.subrecipes.length, etichetta: t('Sub-ricette'),          dove: 'ricette/subricette' },
    { numero: state.staff.length,      etichetta: t('Persone in brigata'),   dove: 'impostazioni/brigata' },
    { numero: state.menus.length,      etichetta: t('Menu attivi'),          dove: 'menu' },
  ];
  vista.turniOggi = state.staff.map(s=>{
    const cell = (state.shifts[s.id] || {})[oggi];
    return cell ? { nome: s.name, turno: CODE_LABEL(cell.code) + dettaglioPartite(cell) } : null;
  }).filter(Boolean);
  vista.giorno = parseISO(oggi).toLocaleDateString(lingua(),
    { weekday:'long', day:'numeric', month:'long' });
}
