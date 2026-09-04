// ============================================================================
// IL TEMPO REALE: quello che cambia sul telefono di un altro si vede qui.
//
// Due persone che lavorano sullo stesso prospetto non devono ricaricare la
// pagina per sapere che l'altra ha spostato un turno. Fino a ieri non si
// poteva: i dati erano un blob solo, e mandarlo intero avrebbe mandato a tutti
// i prezzi e i telefoni. Adesso ogni tabella è già filtrata com'è giusto, e il
// canale eredita le stesse regole delle letture.
//
// NON SI ASCOLTA IL CONTENUTO, SI ASCOLTA CHE È CAMBIATO.
// L'evento dice «la tabella `turni` si è mossa», e a quel punto si RILEGGE la
// sezione dalla sua funzione — la stessa che l'app usa sempre. Sembra un giro
// più lungo, e invece è la scelta che tiene:
//
//   - un evento può arrivare fuori ordine, o non arrivare affatto se la rete
//     cade per un attimo. Ricostruire lo stato pezzo per pezzo dagli eventi
//     vorrebbe dire uno stato che diverge in silenzio;
//   - rileggendo si passa sempre dalle funzioni che REDIGONO, quindi non c'è
//     un secondo percorso da tenere sicuro;
//   - e il codice che disegna resta quello di sempre.
//
// SI ASPETTA UN ATTIMO PRIMA DI RILEGGERE. Una generazione mensile sono 120
// righe in una transazione: arrivano 120 eventi in mezzo secondo, e rileggere
// 120 volte sarebbe peggio del problema. Si aspetta che il rumore finisca.
//
// E NON SI RILEGGE QUELLO CHE HA SCRITTO CHI STA GUARDANDO. Il proprio
// salvataggio torna indietro come evento: rileggere in quel momento
// significherebbe sovrascrivere quello che si sta scrivendo — il cursore che
// salta, il campo che si svuota a metà. Per questo ogni scrittura lascia un
// segno, e gli eventi che arrivano subito dopo si ignorano.
// ============================================================================
import { Cloud } from './cloud.js';

/* Da tabella a sezione dell'app. Una tabella che non sta qui non sveglia
   niente: e' voluto, cosi' aggiungere una tabella non fa ricaricare mezza app
   per sbaglio. */
const TABELLA_SEZIONE = {
  ingredienti: 'ingredients',
  ingredienti_costi: 'ingredients',
  persone: 'staff',
  persone_personali: 'staff',
  turni: 'shifts',
  giorni_pubblicati: 'publishedShifts',
  sub_ricette: 'subrecipes',
  piatti: 'recipes',
  piatti_costi: 'recipes',
  menu: 'menus',
  fornitori: 'suppliers',
  importazioni: 'invoiceHistory',
  partite: 'stations',
  servizi: 'services',
  tipi_turno: 'shiftTypes',
  fabbisogno: 'staffingNeeds',
  ore_registrate: 'wellbeing',
  impostazioni_cucina: 'impostazioni',
};

/* Quanto si aspetta prima di rileggere. Mezzo secondo: abbastanza da far
   passare i 120 eventi di una generazione mensile, poco abbastanza da non
   sembrare un ritardo. */
const ATTESA = 500;

/* Per quanto tempo si ignorano gli eventi dopo aver scritto. Il proprio
   salvataggio torna indietro dal server, e rileggere in quel momento
   sovrascriverebbe quello che si sta scrivendo. */
const DOPO_LA_MIA_SCRITTURA = 1500;

let canale = null;
let orologio = 0;
let inArrivo = new Set();
let mieScritture = new Map();   // sezione -> quando l'ho scritta

/** La chiama `cloudSet` a ogni salvataggio: «questa l'ho scritta io». */
export function segnaScritturaMia(sezione){
  mieScritture.set(sezione, Date.now());
}

function miaDiRecente(sezione){
  const quando = mieScritture.get(sezione);
  return quando !== undefined && (Date.now() - quando) < DOPO_LA_MIA_SCRITTURA;
}

/**
 * Comincia ad ascoltare. `quandoCambia(sezioni)` viene chiamata con l'elenco
 * delle sezioni da rileggere — chi la riceve decide cosa fare, perche' questo
 * modulo non sa cosa sia una schermata.
 */
export function ascolta(quandoCambia){
  if(!Cloud.enabled || !Cloud.client || !Cloud.kitchen) return;
  smetti();

  canale = Cloud.client.channel('cucina:' + Cloud.kitchen.id);

  for(const tabella of Object.keys(TABELLA_SEZIONE)){
    canale.on('postgres_changes',
      { event: '*', schema: 'public', table: tabella,
        // Solo la PROPRIA cucina. Senza, chi ne gestisce quattro riceverebbe
        // gli eventi di tutte e ricaricherebbe di continuo.
        filter: 'kitchen_id=eq.' + Cloud.kitchen.id },
      () => {
        const sezione = TABELLA_SEZIONE[tabella];
        if(miaDiRecente(sezione)) return;
        inArrivo.add(sezione);
        clearTimeout(orologio);
        orologio = setTimeout(() => {
          const sezioni = [...inArrivo];
          inArrivo = new Set();
          if(sezioni.length) quandoCambia(sezioni);
        }, ATTESA);
      });
  }

  canale.subscribe();
}

export function smetti(){
  clearTimeout(orologio);
  inArrivo = new Set();
  if(canale && Cloud.client){ Cloud.client.removeChannel(canale); }
  canale = null;
}
