import { t } from '../core/lingua.ts';
import { save, state, toast, uid } from '../core/state.js';
import { Cloud } from '../lib/cloud.js';
import './benessere-vista.ts';
/* ============================= BENESSERE ====================================

   QUESTO FILE E' SOLO IL COLLANTE. Qui stanno la settimana (da lunedi' a
   domenica), la soglia delle 48 ore e i promemoria; il disegno sta in
   benessere-vista.ts.
   ========================================================================== */

// La media massima settimanale della direttiva europea sull'orario di lavoro.
// Non e' un numero nostro, ed e' il motivo per cui la riga si accende.
const SOGLIA_ORE = 48;

const PROMEMORIA = [
  "La direttiva UE sull'orario di lavoro indica 48h settimanali come soglia massima media — usala come riferimento, non come obiettivo.",
  "Un giorno di riposo consecutivo dopo un servizio doppio pesante aiuta il recupero più di due giorni sparsi.",
  "Ruota chi apre e chi chiude: chi fa sempre il turno più lungo si esaurisce prima, anche se non lo dice.",
  "Un briefing di 5 minuti prima del servizio riduce lo stress operativo più di qualunque software.",
];

/* Lunedi' e domenica della settimana che contiene `d`. La settimana comincia di
   lunedi' perche' e' cosi' che si contano i turni in cucina, non di domenica. */
function estremiSettimana(d = new Date()){
  const giorno = (d.getDay() + 6) % 7;
  const lunedi = new Date(d); lunedi.setDate(d.getDate() - giorno); lunedi.setHours(0,0,0,0);
  const domenica = new Date(lunedi); domenica.setDate(lunedi.getDate() + 6); domenica.setHours(23,59,59,999);
  return [lunedi, domenica];
}

function oreDellaSettimana(){
  const [lunedi, domenica] = estremiSettimana();
  const perPersona = {};
  for(const w of state.wellbeing){
    const quando = new Date(w.date);
    if(quando < lunedi || quando > domenica) continue;
    perPersona[w.staffId] = (perPersona[w.staffId] || 0) + (parseFloat(w.ore) || 0);
  }
  return Object.entries(perPersona).map(([id, ore]) => ({
    nome: (state.staff.find(s => s.id === id) || {}).name || '—',
    ore,
    oltreSoglia: ore > SOGLIA_ORE,
  }));
}

let vista = null;

export function renderBenessere(){
  const el = document.getElementById('wb-panel');
  if(!el) return;
  if(!vista || !vista.isConnected){
    vista = document.createElement('cmd-benessere');
    vista.addEventListener('benessere-registra', e => {
      state.wellbeing.push({
        id: uid(),
        staffId: e.detail.personaId,
        date: e.detail.data,
        ore: e.detail.ore,
      });
      save('wellbeing');
      renderBenessere();
      toast(t('Ore registrate'));
    });
    el.replaceChildren(vista);
  }
  vista.persone = state.staff.map(s => ({ valore: s.id, etichetta: s.name }));
  vista.settimana = oreDellaSettimana();
  vista.promemoria = PROMEMORIA.map(x => t(x));
  vista.soloLettura = Cloud.enabled && !Cloud.canWrite();
}
