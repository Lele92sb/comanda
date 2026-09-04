// ============================================================================
// Il collante fra <cmd-notifiche> e quello che succede davvero.
//
// La REGOLA — cosa conta come novità, e per chi — sta in `core/notifiche.ts`,
// dove gira dentro Node e ha quattordici test. Qui c'è solo il resto: dove si
// prendono i dati, come si scrivono le frasi, e dove si ricorda l'ultima
// occhiata.
// ============================================================================
import { t } from '../core/lingua.ts';
import { SEGNO_VUOTO, novita, segnaVisto } from '../core/notifiche.ts';
import { state } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import { caricaRichieste, tutteLeRichieste } from '../turni/richieste.js';
import { switchTab } from '../ui/tabs.js';
import '../ds/notifiche-vista.ts';

/* Il segno di «fin qui avevo visto» sta nel DISPOSITIVO, non nell'account: se
   guardo dal telefono in cucina e poi dal portatile in ufficio sono due
   occhiate diverse. Metterlo sull'account vorrebbe dire che aprire l'app sul
   telefono spegne il pallino sul portatile, dove non ho letto niente.

   La chiave porta dentro l'id della cucina: chi ne gestisce quattro non deve
   ritrovarsi le novità di una segnate come lette perché ha guardato un'altra. */
function chiaveSegno(){
  return 'comanda_visto_' + (Cloud.kitchen ? Cloud.kitchen.id : 'locale');
}

function leggiSegno(){
  try{
    const s = JSON.parse(localStorage.getItem(chiaveSegno()) || 'null');
    if(s && typeof s.visto === 'number') return { visto: s.visto, giorniVisti: s.giorniVisti || [] };
  }catch(e){ /* storage bloccato o dato guasto: si riparte da zero */ }
  return SEGNO_VUOTO;
}

function scriviSegno(segno){
  try{ localStorage.setItem(chiaveSegno(), JSON.stringify(segno)); }catch(e){}
}

/* La persona della brigata collegata a chi sta guardando. Serve a non
   annunciargli le proprie stesse richieste. */
function mioStaffId(){
  if(!Cloud.enabled || !Cloud.user) return null;
  const mia = (state.staff || []).find(s => s.userId === Cloud.user.id);
  return mia ? mia.id : null;
}

function nomeDi(staffId){
  const s = (state.staff || []).find(x => x.id === staffId);
  return s ? s.name : t('qualcuno');
}

/* Da novità a frase. Le frasi stanno qui e non nel componente perché vanno
   tradotte, e `ds/` non conosce la lingua. */
function scrivi(n){
  if(n.tipo === 'richiesta-nuova'){
    return t('{chi} ha mandato una richiesta.', { chi: n.chi });
  }
  if(n.tipo === 'richiesta-decisa'){
    return n.chi === 'approvata'
      ? t('La tua richiesta è stata approvata.')
      : t('La tua richiesta è stata rifiutata.');
  }
  return n.quante === 1
    ? t('È stato pubblicato un giorno di turni: la brigata lo vede.')
    : t('Sono stati pubblicati {n} giorni di turni: la brigata li vede.', { n: n.quante });
}

let vista = null;

export function renderNotifiche(){
  const el = document.getElementById('notifiche-box');
  if(!el || !Cloud.enabled) return;

  if(!vista || !vista.isConnected){
    vista = document.createElement('cmd-notifiche');
    vista.addEventListener('notifiche-apri', () => {
      vista.aperto = true;
      // APRIRE È L'ATTO DI AVER LETTO: non c'è da segnare niente a mano. Un
      // elenco che si svuota solo se lo svuoti diventa una lista di cose da
      // fare che nessuno fa.
      scriviSegno(segnaVisto(Date.now(), state.publishedShifts || []));
    });
    vista.addEventListener('notifiche-chiudi', () => {
      vista.aperto = false;
      // Il conteggio si azzera alla CHIUSURA e non all'apertura: svuotare
      // l'elenco sotto gli occhi di chi lo sta leggendo è il modo più veloce
      // di fargli perdere quello che stava per toccare.
      aggiorna();
    });
    vista.addEventListener('notifiche-vai', e => {
      vista.aperto = false;
      switchTab(e.detail.dove);
      aggiorna();
    });
    el.replaceChildren(vista);
  }
  aggiorna();
}

function aggiorna(){
  if(!vista) return;
  const elenco = novita({
    richieste: tutteLeRichieste(),
    giorniPubblicati: state.publishedShifts || [],
    nomeDi,
    mioStaffId: mioStaffId(),
    gestisco: Cloud.puoDecidereRichieste(),
    segno: leggiSegno(),
  });
  vista.voci = elenco.map(n => ({ testo: scrivi(n), dove: n.dove }));
  vista.titolo = t('Novità');
  vista.etichetta = t('Novità');
  vista.vuotoTitolo = t('Niente di nuovo');
  vista.vuotoSpiega = t('Qui compaiono le richieste che arrivano, quelle che vengono decise, e i turni appena pubblicati.');
}

/* Le richieste arrivano dal server. Si chiedono una volta all'avvio e poi
   quando si entra nelle schermate che le usano: chiederle a ogni disegno
   sarebbe una chiamata di rete per niente, e aspettarle vorrebbe dire una
   campanella che compare in ritardo su ogni schermata. */
export async function aggiornaNotificheDalServer(){
  if(!Cloud.enabled) return;
  try{ await caricaRichieste(); }catch(e){}
  aggiorna();
}
